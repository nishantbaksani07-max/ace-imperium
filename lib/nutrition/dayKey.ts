// Local day keys for the Macros module.
//
// IMPORTANT: this is deliberately NOT lib/dates.ts getLocalDateKey(). The
// macro tracker rolls the day over at 4am local time, so a 2am post-night-out
// snack counts toward the day you just finished, not the one starting. Every
// nutrition_meals.day_key is produced here. Everything else in Vitality uses
// the midnight key from lib/dates.ts.

export const DAY_ROLLOVER_HOUR = 4

// YYYY-MM-DD for the local day a timestamp counts as (4am rollover).
export function getLocalDayKey(date?: Date | string | number): string {
  const d = date != null ? new Date(date) : new Date()
  const adjusted = new Date(d.getTime() - DAY_ROLLOVER_HOUR * 60 * 60 * 1000)
  const y = adjusted.getFullYear()
  const m = String(adjusted.getMonth() + 1).padStart(2, '0')
  const day = String(adjusted.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// The last `n` day keys ending on `endDayKey`, most-recent first. Uses noon-UTC
// math to dodge DST edges (pure, so it stays testable).
export function getRecentDayKeys(endDayKey: string, n: number): string[] {
  const [y, m, d] = endDayKey.split('-').map(Number)
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d - i, 12, 0, 0))
    const yy = dt.getUTCFullYear()
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(dt.getUTCDate()).padStart(2, '0')
    out.push(`${yy}-${mm}-${dd}`)
  }
  return out
}

export function previousDayKey(dayKey: string): string {
  return getRecentDayKeys(dayKey, 2)[1]
}

// Shift a day key by `delta` days (negative = earlier). Noon-UTC math, DST-safe.
export function shiftDayKey(dayKey: string, delta: number): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + delta, 12, 0, 0))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}
