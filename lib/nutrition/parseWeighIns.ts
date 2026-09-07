// Pure parser for the Fuel "Bring your history" weight import. Turns a messy
// paste (or a .csv / .json file's text) into dated weigh-ins, so a new user
// doesn't start their trend from scratch. The screenshot path uses Claude
// vision server-side (app/api/nutrition/import-weights) — but this covers the
// common case (exports, spreadsheets, a column of numbers) for free, instantly.
//
// Returns RAW values in the detected unit + the unit, so the import sheet can
// show a kg/lb toggle and only convert → kg at save time. No React, no I/O.

import { getLocalDateKey } from '@/lib/dates'

export type WeightUnit = 'kg' | 'lb'

export interface RawWeighIn {
  /** local date key, YYYY-MM-DD */
  dayKey: string
  /** weight in `unit` (un-converted, as written) */
  value: number
}

export interface ParseWeighInsResult {
  rows: RawWeighIn[]
  unit: WeightUnit
  /** input lines we couldn't read (no date or no plausible weight) */
  skipped: string[]
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

export const LB_PER_KG = 2.20462
export const kgFromValue = (value: number, unit: WeightUnit): number =>
  unit === 'lb' ? value / LB_PER_KG : value

// A weight is "plausible" in its unit — rejects day/month ints, years, noise.
function plausible(value: number, unit: WeightUnit): boolean {
  return unit === 'lb' ? value >= 55 && value <= 700 : value >= 25 && value <= 320
}

function clampToYear(d: Date, today: Date): Date {
  // A bare "Jun 8" with no year that lands in the future almost always means
  // last year (you can't have weighed in tomorrow).
  if (d.getTime() > today.getTime() + 86_400_000) d.setFullYear(d.getFullYear() - 1)
  return d
}

// Pull a date out of one line, or null. Handles ISO, M/D/Y (US, swaps to D/M
// when the first field can't be a month), and "Mon D[, Y]" / "D Mon[ Y]".
function parseDate(line: string, today: Date): Date | null {
  const iso = line.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3])

  const slash = line.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/)
  if (slash) {
    let y = +slash[3]
    if (y < 100) y += 2000
    let mo = +slash[1], da = +slash[2]
    if (mo > 12 && da <= 12) { const t = mo; mo = da; da = t } // D/M/Y fallback
    return clampToYear(new Date(y, mo - 1, da), today)
  }

  const monD = line.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/)
  if (monD) {
    const mo = MONTHS[monD[1].slice(0, 3).toLowerCase()]
    if (mo != null) return clampToYear(new Date(monD[3] ? +monD[3] : today.getFullYear(), mo, +monD[2]), today)
  }

  const dMon = line.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?(?:,?\s*(\d{4}))?\b/)
  if (dMon) {
    const mo = MONTHS[dMon[2].slice(0, 3).toLowerCase()]
    if (mo != null) return clampToYear(new Date(dMon[3] ? +dMon[3] : today.getFullYear(), mo, +dMon[1]), today)
  }
  return null
}

// Strip date-looking substrings so they don't get mistaken for the weight.
function stripDates(line: string): string {
  return line
    .replace(/\d{4}-\d{1,2}-\d{1,2}/g, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, ' ')
    .replace(/\b\d{4}\b/g, ' ') // bare years
}

function detectUnit(text: string, hint: WeightUnit | 'auto'): WeightUnit {
  if (hint === 'kg' || hint === 'lb') return hint
  if (/\b(lbs?|pounds?)\b/i.test(text)) return 'lb'
  if (/\bkgs?\b|kilo/i.test(text)) return 'kg'
  return 'kg'
}

// Try to read a JSON array (a scale-app / spreadsheet export). Accepts
// [{date, weight|kg|lb|value}] or [{date: number}]. Returns null if not JSON.
function tryJson(text: string, unit: WeightUnit, today: Date): RawWeighIn[] | null {
  const t = text.trim()
  if (!t.startsWith('[') && !t.startsWith('{')) return null
  let data: unknown
  try { data = JSON.parse(t) } catch { return null }
  const arr = Array.isArray(data) ? data : (data && typeof data === 'object' ? Object.entries(data) : null)
  if (!arr) return null
  const rows: RawWeighIn[] = []
  for (const item of arr as unknown[]) {
    let dateStr: string | undefined
    let value: number | undefined
    if (Array.isArray(item)) { dateStr = String(item[0]); value = Number(item[1]) }
    else if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>
      dateStr = (o.date ?? o.day ?? o.timestamp ?? o.time) as string | undefined
      const raw = o.weight ?? o.kg ?? o.lb ?? o.lbs ?? o.value ?? o.mass
      value = raw == null ? undefined : Number(raw)
    }
    if (dateStr == null || value == null || !Number.isFinite(value)) continue
    const d = parseDate(String(dateStr), today) ?? (/^\d{4}-\d{1,2}-\d{1,2}/.test(String(dateStr))
      ? new Date(String(dateStr)) : null)
    if (!d || isNaN(d.getTime()) || !plausible(value, unit)) continue
    rows.push({ dayKey: getLocalDateKey(d), value })
  }
  return rows.length ? rows : null
}

/**
 * Parse pasted/file text into dated weigh-ins. `today` is injectable for tests.
 */
export function parseWeighInsText(
  text: string,
  opts: { unitHint?: WeightUnit | 'auto'; today?: Date } = {},
): ParseWeighInsResult {
  const today = opts.today ?? new Date()
  const unit = detectUnit(text || '', opts.unitHint ?? 'auto')

  const json = tryJson(text || '', unit, today)
  if (json) return { rows: dedupe(json), unit, skipped: [] }

  const lines = (text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const rows: RawWeighIn[] = []
  const skipped: string[] = []
  const undated: number[] = [] // values with no date, in source order

  for (const line of lines) {
    const date = parseDate(line, today)
    const nums = (stripDates(line).match(/\d{1,3}(?:[.,]\d+)?/g) || [])
      .map((n) => parseFloat(n.replace(',', '.')))
      .filter((n) => Number.isFinite(n))
    // weight = the last plausible number on the line (exports put it last)
    let value: number | undefined
    for (const n of nums) if (plausible(n, unit)) value = n
    if (value == null) { skipped.push(line); continue }
    if (date && !isNaN(date.getTime())) rows.push({ dayKey: getLocalDateKey(date), value })
    else undated.push(value)
  }

  // Undated values → consecutive days ending today, newest last.
  undated.forEach((value, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (undated.length - 1 - i))
    rows.push({ dayKey: getLocalDateKey(d), value })
  })

  return { rows: dedupe(rows), unit, skipped }
}

// Dedupe by day (last wins) and sort oldest → newest.
function dedupe(rows: RawWeighIn[]): RawWeighIn[] {
  const byDay = new Map<string, number>()
  for (const r of rows) byDay.set(r.dayKey, r.value)
  return [...byDay.entries()]
    .map(([dayKey, value]) => ({ dayKey, value }))
    .sort((a, b) => (a.dayKey < b.dayKey ? -1 : 1))
}
