// MIRROR of lib/tiles/reportContract.ts (source of truth in the dashboard,
// owned by the dashboard window). Vendored because the mcp/ package cannot import
// across the package boundary. DO NOT EDIT the logic here; keep it byte-for-byte in
// sync with the source. scaffold_tile matches this contract, it does not redefine it.

/**
 * The tile-to-Vee report contract — the narrow waist every MCP-built (or
 * hand-built) tile uses to feed the "Vitality noticed" engine.
 *
 * A sealed tile talks to Vitality through two channels: Vitality.save / load for
 * its OWN private data, and Vitality.report(stream) for ONE numeric life-stream
 * into Vee. This file is the single source of truth for that stream's shape, so
 * the host (write side) and the noticed engine (read side) can never build
 * mismatched halves. Import it on both sides.
 *
 * The whole trick is `kind`: a small fixed taxonomy that tells the generic engine
 * how to treat a number it has never seen before, with zero per-tile code. A
 * canonical catalog (beer -> alcohol) normalizes keys across users so ten people's
 * beer tiles become one comparable family.
 *
 * Pure + IO-free + unit-tested (see __tests__/reportContract.test.ts).
 */

/** The fixed ~7-member taxonomy. Each tile number maps to exactly one. */
export const REPORT_KINDS = ['intake', 'count', 'duration', 'rating', 'measure', 'money', 'done'] as const
export type ReportKind = (typeof REPORT_KINDS)[number]

/** What "good" looks like for a stream, so downstream copy reads right. */
export const GOAL_DIRECTIONS = ['up', 'down', 'neutral'] as const
export type GoalDirection = (typeof GOAL_DIRECTIONS)[number]

/** The payload a tile posts via Vitality.report(). The deliberately small,
 *  deliberately fixed boundary. UIs are free; this is disciplined. */
export interface ReportedStream {
  key: string
  label: string
  value: number
  date: string // local YYYY-MM-DD
  kind: ReportKind
  goalDirection?: GoalDirection
}

/** A row of `tile_streams` — the identity/definition of one stream. Since
 *  PATCH21 a stream's row identity is (user_id, tile_id, key): two different
 *  tiles may honestly report the same key without clobbering each other.
 *  canonicalKey still names the cross-user family (beer -> alcohol). id and
 *  tileId are optional so pure fixtures/tests can omit them. */
export interface TileStreamRow {
  id?: string
  tileId?: string
  key: string
  canonicalKey: string
  label: string
  kind: ReportKind
  goalDirection: GoalDirection | null
}

/** A row of `tile_reports` — one logged datapoint. streamId ties it to its
 *  stream ROW (per-tile identity); streamKey rides along for readability. */
export interface TileReportRow {
  streamId?: string
  streamKey: string
  value: number
  date: string
}

/**
 * Group raw report rows under their stream definitions by the PER-TILE row
 * identity: a report with a streamId joins only the stream row carrying that
 * id; legacy rows without one fall back to the raw key, and that fallback can
 * never cross tiles (it only matches when exactly one stream owns the key).
 * The one place the join lives, so the score, the chat context, and the
 * connections engine can never disagree about which datapoint belongs where.
 */
export function groupReportRows(
  streams: TileStreamRow[],
  reports: TileReportRow[],
): Array<{ def: TileStreamRow; rows: TileReportRow[] }> {
  const byId = new Map<string, TileReportRow[]>()
  const byKey = new Map<string, TileReportRow[]>()
  for (const r of reports) {
    const map = r.streamId ? byId : byKey
    const k = r.streamId ?? r.streamKey
    const arr = map.get(k)
    if (arr) arr.push(r)
    else map.set(k, [r])
  }
  const keyOwners = new Map<string, number>()
  for (const s of streams) keyOwners.set(s.key, (keyOwners.get(s.key) ?? 0) + 1)

  return streams.map((def) => {
    const rows = [...(def.id ? (byId.get(def.id) ?? []) : [])]
    // key fallback only when this stream is the key's sole owner — a legacy
    // row must never be double-counted into two same-key tiles.
    if (keyOwners.get(def.key) === 1) rows.push(...(byKey.get(def.key) ?? []))
    return { def, rows }
  })
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Sane bounds for the untrusted payload. A sealed tile is user-editable HTML,
// so its report() call is hostile input: a wrong or oversized field must be
// dropped or clamped, never corrupt a stored stream and never throw into the host.
const KEY_MAX = 64 // stream identity; over-length is rejected, not clamped (clamping could merge unrelated streams)
const LABEL_MAX = 120 // display only; over-length is clamped, so a good datapoint is never lost to a long name
const VALUE_MAX = 1e9 // magnitude cap; a finite but absurd number is clamped into range
const DATE_MIN_YEAR = 1900
const DATE_MAX_YEAR = 2999

// Strip C0/C1 control characters (incl. NUL and the line breaks a hostile tile
// could smuggle in) and collapse internal whitespace runs to single spaces, so a
// key/label can never carry invisible or layout-breaking bytes into stored data.
function cleanText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').replace(/\s+/g, ' ').trim()
}

// A finite year/month/day check on a string that already matched YYYY-MM-DD, so
// 2026-13-40 and 2026-02-30 are rejected (the regex alone would pass them).
function isRealLocalDate(date: string): boolean {
  const y = Number(date.slice(0, 4))
  const m = Number(date.slice(5, 7))
  const d = Number(date.slice(8, 10))
  if (y < DATE_MIN_YEAR || y > DATE_MAX_YEAR) return false
  if (m < 1 || m > 12) return false
  const daysInMonth = [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return d >= 1 && d <= daysInMonth[m - 1]
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

// Pull a finite number into [-VALUE_MAX, VALUE_MAX], and fold -0 to 0 so equal
// magnitudes always store identically. Caller guarantees v is already finite.
function clampValue(v: number): number {
  const clamped = v > VALUE_MAX ? VALUE_MAX : v < -VALUE_MAX ? -VALUE_MAX : v
  return clamped === 0 ? 0 : clamped
}

/** Canonical families: aliases people will naturally use, mapped to one key so
 *  cross-user priors line up. Intentionally tiny at launch (alcohol + calories); grows
 *  as real tiles arrive. An unknown key passes through cleaned. */
const CANONICAL: Record<string, string> = {
  beer: 'alcohol',
  beers: 'alcohol',
  brew: 'alcohol',
  brews: 'alcohol',
  pint: 'alcohol',
  pints: 'alcohol',
  drink: 'alcohol',
  drinks: 'alcohol',
  alcohol: 'alcohol',
  // Calorie family: the shipped Calories preset minted the misspelled key
  // 'calory' (the -ies singularizer), and that key is baked into sealed tiles
  // already on boards. The canonical family rejoins those streams with every
  // honestly-keyed calorie tile (hand-built, forged, or the fixed preset).
  calory: 'calories',
  calorie: 'calories',
  calories: 'calories',
  kcal: 'calories',
}

/** Lowercase + trim a key, then map it to its canonical family when known. */
export function normalizeKey(key: string): string {
  const clean = key.trim().toLowerCase()
  return CANONICAL[clean] ?? clean
}

export type ValidateResult =
  | { ok: true; stream: ReportedStream }
  | { ok: false; error: string }

/**
 * Validate an untrusted payload (it crosses an iframe boundary, so it is a
 * sealed tile's user-editable, possibly hostile report() call) into a clean
 * ReportedStream, or explain why it is rejected. Never throws.
 *
 * The discipline, field by field:
 *   - key   required non-empty string; control chars stripped + whitespace
 *           collapsed; rejected (never clamped) if it exceeds KEY_MAX, because
 *           the key is a stream's identity and a silent truncation could merge
 *           two unrelated streams into one row.
 *   - label required non-empty string; cleaned the same way, then CLAMPED to
 *           LABEL_MAX so an over-long name loses characters, never the datapoint.
 *   - value required finite number (NaN / +-Infinity / non-number rejected),
 *           then clamped into +-VALUE_MAX with -0 folded to 0.
 *   - date  required string matching YYYY-MM-DD AND a real calendar date.
 *   - kind  required member of the fixed taxonomy.
 *   - goalDirection optional; if present must be up | down | neutral.
 * Every other field on the input is dropped: the returned object is rebuilt
 * from scratch, so no unexpected property can ride through into storage.
 */
export function validateReport(input: unknown): ValidateResult {
  // Nothing below can throw, but wrap defensively: a hostile object could carry
  // a throwing getter on a field, and a bad report must degrade to a rejection,
  // never blow up the host that called us.
  try {
    if (typeof input !== 'object' || input === null) return { ok: false, error: 'not an object' }
    const o = input as Record<string, unknown>

    if (typeof o.key !== 'string') return { ok: false, error: 'key must be a non-empty string' }
    const key = cleanText(o.key)
    if (key === '') return { ok: false, error: 'key must be a non-empty string' }
    if (key.length > KEY_MAX) return { ok: false, error: `key must be ${KEY_MAX} characters or fewer` }

    if (typeof o.label !== 'string') return { ok: false, error: 'label must be a non-empty string' }
    const cleanedLabel = cleanText(o.label)
    if (cleanedLabel === '') return { ok: false, error: 'label must be a non-empty string' }
    const label = cleanedLabel.length > LABEL_MAX ? cleanedLabel.slice(0, LABEL_MAX).trimEnd() : cleanedLabel

    if (typeof o.value !== 'number' || !Number.isFinite(o.value)) {
      return { ok: false, error: 'value must be a finite number' }
    }
    const value = clampValue(o.value)

    if (typeof o.date !== 'string' || !DATE_RE.test(o.date) || !isRealLocalDate(o.date)) {
      return { ok: false, error: 'date must be a real YYYY-MM-DD date' }
    }

    if (typeof o.kind !== 'string' || !(REPORT_KINDS as readonly string[]).includes(o.kind)) {
      return { ok: false, error: 'kind must be one of the fixed taxonomy' }
    }

    if (o.goalDirection !== undefined) {
      if (typeof o.goalDirection !== 'string' || !(GOAL_DIRECTIONS as readonly string[]).includes(o.goalDirection)) {
        return { ok: false, error: 'goalDirection must be up, down, or neutral' }
      }
    }

    const stream: ReportedStream = {
      key,
      label,
      value,
      date: o.date,
      kind: o.kind as ReportKind,
      ...(o.goalDirection !== undefined ? { goalDirection: o.goalDirection as GoalDirection } : {}),
    }
    return { ok: true, stream }
  } catch {
    return { ok: false, error: 'malformed report payload' }
  }
}
