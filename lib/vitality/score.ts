/**
 * Vitality Score engine — the daily 0-100 "did I take care of myself today"
 * number behind the Vee dashboard tile. A consistency/showing-up score graded
 * against the user's OWN committed routine (never on a module they didn't set
 * up). Compute-on-read: no new tables. Each module plugs in as one isolated
 * `Contributor`; the engine knows nothing about a module's internals, only the
 * `ContributorResult` shape. Every contributor is wrapped in a safety net in
 * computeVitalityScore (Task 4) so a failing/empty module just drops its slice.
 *
 * Design spec: docs/superpowers/specs/2026-06-13-vitality-score-design.md
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type ScoreState = 'scored' | 'no-routine' | 'first-day'

/** Trailing-7 weights, index 0 = today, today heaviest, older days taper. */
export const WEIGHTS = [1.0, 0.85, 0.7, 0.55, 0.45, 0.35, 0.25] as const

/** What a contributor reports for the trailing-7 window. All fractions 0..1. */
export interface ContributorResult {
  key: string
  label: string
  /** Trailing-7, today-weighted completion 0..1 — the contributor's score slice. */
  blended: number
  /** Today's raw completion 0..1 (for drivers/UI). */
  today: number
  /** Simple mean of the window 0..1 (for drivers/UI). */
  last7Avg: number
  /** Earliest local date key with real logged data in the window, or null. */
  earliestDataKey: string | null
}

/** Per-routine-item summary surfaced to the tile and (later) the mentor brain. */
export interface Driver {
  key: string
  label: string
  last7Avg: number
  today: number
  trend: 'up' | 'flat' | 'down'
}

export interface VitalityScore {
  score: number | null
  drivers: Driver[]
  state: ScoreState
}

export interface ScoreContext {
  supabase: SupabaseClient
  userId: string
}

/** One isolated module adapter. The only contract the engine depends on. */
export interface Contributor {
  key: string
  label: string
  /** Has the user set this module up? Throwing/false → slice is dropped. */
  isActive(ctx: ScoreContext): Promise<boolean>
  /** Compute the trailing-7 result. Throwing → slice is dropped. */
  evaluate(ctx: ScoreContext): Promise<ContributorResult>
}

/**
 * Weighted blend of a trailing-7 done series (index 0 = today). Missing days
 * (null/undefined) are skipped, not treated as zero — missing data is a normal
 * handled state, never punishing. Returns 0 when every day is missing.
 */
export function weightedBlend(doneByDay: Array<number | null | undefined>): number {
  let num = 0
  let den = 0
  for (let i = 0; i < doneByDay.length && i < WEIGHTS.length; i++) {
    const v = doneByDay[i]
    if (v == null || Number.isNaN(v)) continue
    const clamped = Math.max(0, Math.min(1, v))
    num += WEIGHTS[i] * clamped
    den += WEIGHTS[i]
  }
  return den === 0 ? 0 : num / den
}

function trendOf(blended: number, last7Avg: number): Driver['trend'] {
  // 5-point dead-zone so day-to-day noise doesn't flip the arrow.
  if (blended > last7Avg + 0.05) return 'up'
  if (blended < last7Avg - 0.05) return 'down'
  return 'flat'
}

/**
 * Combine active contributors into the final score + state + drivers. Pure.
 * Caller passes only contributors that are active AND evaluated successfully.
 * `todayKey` is the local midnight date key for today (for first-day detection).
 */
export function combineResults(results: ContributorResult[], todayKey: string): VitalityScore {
  if (results.length === 0) {
    return { score: null, drivers: [], state: 'no-routine' }
  }

  const score = Math.round(100 * (results.reduce((a, r) => a + r.blended, 0) / results.length))

  const drivers: Driver[] = results.map(r => ({
    key: r.key,
    label: r.label,
    last7Avg: r.last7Avg,
    today: r.today,
    trend: trendOf(r.blended, r.last7Avg),
  }))

  // first-day: no logged data older than today across the active contributors
  // (brand-new routine still accruing). NOTE: this is "first-day for the
  // currently-active modules", so a returning user who just sets up a new
  // module — and has no older data in *that* module — can read as first-day.
  // Acceptable for v1 (the tile still shows today's real number); revisit if
  // module-switching returning users find it odd.
  const earliestKeys = results.map(r => r.earliestDataKey).filter((k): k is string => !!k)
  const earliest = earliestKeys.length ? earliestKeys.reduce((a, b) => (a < b ? a : b)) : null
  const state: ScoreState = !earliest || earliest >= todayKey ? 'first-day' : 'scored'

  return { score, drivers, state }
}

/**
 * Run the active-check + evaluate loop with a safety net around EACH contributor
 * so a failing/empty module just drops its slice and the score still computes.
 * Pure w.r.t. IO: the caller supplies the context and contributor list, so this
 * is fully unit-testable with fakes. Missing data is always a handled state.
 */
export async function runContributors(
  ctx: ScoreContext,
  contributors: Contributor[],
  todayKey: string,
): Promise<VitalityScore> {
  // Sequential so each contributor's failure stays isolated. Fine at v1's two
  // contributors; revisit with Promise.allSettled (which keeps per-item failure
  // isolation) if the registry grows past ~5 and the round-trips add up.
  const active: Contributor[] = []
  for (const c of contributors) {
    try {
      if (await c.isActive(ctx)) active.push(c)
    } catch (err) {
      console.error(`[vitality-score] isActive failed for ${c.key}`, err)
    }
  }
  if (active.length === 0) return { score: null, drivers: [], state: 'no-routine' }

  const results: ContributorResult[] = []
  for (const c of active) {
    try {
      results.push(await c.evaluate(ctx))
    } catch (err) {
      console.error(`[vitality-score] evaluate failed for ${c.key}`, err)
    }
  }

  // If every active slice failed, combineResults returns no-routine (no fake zero).
  return combineResults(results, todayKey)
}
