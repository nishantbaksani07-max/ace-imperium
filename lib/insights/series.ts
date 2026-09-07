/**
 * Series adapters — Stage 1 of the "Vitality noticed" engine. This is the layer
 * that turns each domain's raw logs (caffeine, recovery, sleep, mood, training,
 * spend, ...) into ONE canonical daily series the rest of the engine reads. It is
 * the literal "the more you log, the more it knows" layer: every value the user
 * records becomes a point the engine can connect.
 *
 * Each series carries a `density`, the single guard against a fabricated trend: a
 * sparse/snapshot domain (net worth, brand) declares it so downstream refuses to
 * weekly-correlate it into a fake correlation. `density` is REQUIRED, so a new
 * adapter can never silently skip the safeguard.
 *
 * Pure + IO-free + unit-tested (see __tests__/series.test.ts). Dates key by
 * getLocalDateKey, never toISOString (no UTC drift).
 */

import { getLocalDateKey } from '@/lib/dates'
import type { DatedPoint, Agg } from './align'

/** How densely a domain is logged. 'daily' can be day- or week-bucketed; 'snapshot'
 *  (net worth, follower count) is too sparse to weekly-correlate, so the engine
 *  reads it as a delta over a window instead of a fake r. */
export type Density = 'daily' | 'sparse-weekly' | 'snapshot'

export interface DomainSeries {
  points: DatedPoint[]
  density: Density
}

interface RawRow {
  date: string | Date
  value: number | null | undefined
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** A local YYYY-MM-DD key from a row's date, or null if it cannot be trusted. */
function toKey(date: string | Date): string | null {
  if (date instanceof Date) return Number.isNaN(date.getTime()) ? null : getLocalDateKey(date)
  if (typeof date === 'string') {
    const d = date.slice(0, 10)
    return DATE_RE.test(d) ? d : null
  }
  return null
}

function aggregate(values: number[], mode: Agg): number {
  switch (mode) {
    case 'sum': return values.reduce((s, v) => s + v, 0)
    case 'count': return values.length
    case 'last': return values[values.length - 1]
    case 'max': return Math.max(...values)
    case 'mean':
    default: return values.reduce((s, v) => s + v, 0) / values.length
  }
}

/**
 * Normalize raw dated rows into a clean, date-sorted daily series. Same-day rows
 * collapse via `agg` (default 'mean'; caffeine/training use 'sum'/'count'). Rows
 * with a null/non-finite value or an unparseable date are dropped, never guessed,
 * so the series can only ever contain real logged points.
 */
export function toDailySeries(rows: RawRow[], opts: { density: Density; agg?: Agg }): DomainSeries {
  const agg = opts.agg ?? 'mean'
  const groups = new Map<string, number[]>()
  for (const r of rows) {
    const key = toKey(r.date)
    const v = r.value
    if (key == null || v == null || !Number.isFinite(v)) continue
    const arr = groups.get(key)
    if (arr) arr.push(v)
    else groups.set(key, [v])
  }
  const points = [...groups.entries()]
    .map(([key, vals]) => ({ key, value: aggregate(vals, agg) }))
    .sort((a, b) => a.key.localeCompare(b.key))
  return { points, density: opts.density }
}
