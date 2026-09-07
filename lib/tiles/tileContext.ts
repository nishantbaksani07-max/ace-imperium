/**
 * Tile context — the compact "their tiles" block for Vee's chat brain. Turns a
 * user's reported streams into a handful of dense, factual lines the mentor
 * route can drop into its context block, so Vee can talk about the tiles the
 * user BUILT (the beer tracker, the reading timer) as naturally as it talks
 * about workouts and water.
 *
 * Progressive disclosure by design: one line per stream, most recently active
 * first, hard-capped (default 8) with a single "and N quieter tiles." closer —
 * never a wall of rows, and a tiny, predictable token footprint (~15 tokens a
 * line). Numbers only ever come from real reports; a stream with nothing in
 * the trailing 28 days is only counted, never expanded.
 *
 * Pure + IO-free + unit-tested (see __tests__/tileContext.test.ts). The
 * Supabase reads live in the chat route at wiring time (Phase 2+), not here.
 */

import { getRecentDateKeys } from '@/lib/dates'
import { groupReportRows, type TileStreamRow, type TileReportRow } from './reportContract'
import { reportsToSeries } from './tileInsight'

const round1 = (x: number): string => `${Math.round(x * 10) / 10}`

interface StreamDigest {
  def: TileStreamRow
  byDay: Map<string, number>
  lastKey: string // most recent report day, for ordering
}

/** One dense line for one stream, phrased by kind. All numbers are real. */
function lineFor(d: StreamDigest, keys7: string[], keys28: string[]): string {
  const { def, byDay } = d
  const vals = (keys: string[]): number[] =>
    keys.map((k) => byDay.get(k)).filter((v): v is number => v != null)
  const week = vals(keys7)
  const days7 = week.length

  // The parenthetical: the canonical family when it adds signal (beer ->
  // alcohol), plus the stated goal so Vee reads the number the right way.
  const parts: string[] = []
  if (def.canonicalKey && def.canonicalKey !== def.key.trim().toLowerCase()) {
    parts.push(def.canonicalKey)
  }
  if (def.goalDirection === 'down') parts.push('goal: less')
  else if (def.goalDirection === 'up') parts.push('goal: more')
  const tag = parts.length ? ` (${parts.join(', ')})` : ''

  if (def.kind === 'done') {
    return `${def.label}${tag}: ${days7} of 7 days this week.`
  }
  if (def.kind === 'rating') {
    const avg = week.length ? week.reduce((a, v) => a + v, 0) / week.length : null
    return avg == null
      ? `${def.label}${tag}: no rating this week, last on ${d.lastKey}.`
      : `${def.label}${tag}: avg ${round1(avg)} across ${days7} days this week.`
  }
  if (def.kind === 'measure') {
    return `${def.label}${tag}: last ${round1(byDay.get(d.lastKey) ?? 0)} on ${d.lastKey}.`
  }
  // intake / count / duration / money — weekly total vs the user's usual pace
  const sum7 = week.reduce((a, v) => a + v, 0)
  const sum28 = vals(keys28).reduce((a, v) => a + v, 0)
  const usualPerWeek = round1(sum28 / 4)
  return `${def.label}${tag}: ${round1(sum7)} this week over ${days7} days. Usual ~${usualPerWeek}/wk.`
}

/**
 * Build the chat-context lines for a user's tile streams. Streams with at
 * least one report in the trailing 28 days get a line, most recently active
 * first, capped at `maxStreams`; everything else is folded into one honest
 * "and N quieter tiles." closer. [] when the user has no streams at all.
 */
export function buildTileContextLines(
  streams: TileStreamRow[],
  reports: TileReportRow[],
  todayKey: string,
  maxStreams = 8,
): string[] {
  if (streams.length === 0) return []

  const keys28 = getRecentDateKeys(todayKey, 28)
  const keys7 = keys28.slice(0, 7)
  const in28 = new Set(keys28)

  const digests: StreamDigest[] = []
  let quiet = 0
  // groupReportRows joins each report to its OWN tile's stream (PATCH21), so
  // two same-key tiles read as two lines, never one merged number.
  for (const { def, rows } of groupReportRows(streams, reports)) {
    const series = reportsToSeries(rows, def.kind)
    const recent = series.points.filter((p) => in28.has(p.key))
    if (recent.length === 0) {
      quiet += 1
      continue
    }
    digests.push({
      def,
      byDay: new Map(recent.map((p) => [p.key, p.value])),
      lastKey: recent[recent.length - 1].key, // points are date-sorted ascending
    })
  }

  digests.sort(
    (a, b) => b.lastKey.localeCompare(a.lastKey) || a.def.label.localeCompare(b.def.label),
  )

  const cap = Math.max(0, maxStreams)
  quiet += Math.max(0, digests.length - cap)
  const lines = digests.slice(0, cap).map((d) => lineFor(d, keys7, keys28))
  if (quiet > 0) lines.push(`and ${quiet} quieter ${quiet === 1 ? 'tile' : 'tiles'}.`)
  return lines
}
