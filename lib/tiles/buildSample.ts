/**
 * buildSample - deterministic sample values for the tile BUILDER preview only.
 *
 * The create-a-tile page shows the freshly built tile ALIVE (ring filled, 7-day
 * chart populated, streak running) so a user sees what it becomes, not a blank
 * day-zero shell. Those numbers are sample-only: they live in the builder's
 * ephemeral preview host and are NEVER installed - the tile added to the real
 * dashboard starts empty and honest.
 *
 * Returns 7 values oldest -> newest (index 6 == today). Every numeric template
 * shares one data model (`_days = [{date, value}]`, see templates.ts CORE), so a
 * single generator seeds counter / timer / measure / money / scale / toggle. The
 * caller pairs these with local date keys (browser timezone) so "today" lines up
 * with the tile's own today().
 *
 * Deterministic: a fixed wave (no Math.random, which is also unavailable in some
 * runtimes) shaped per kind, so the same tile always previews the same way.
 */

export interface SampleInput {
  kind: 'intake' | 'count' | 'duration' | 'rating' | 'measure' | 'money' | 'done'
  /** The daily target for additive kinds (counter/timer/intake), if any. */
  target?: number
  /** The 1-N ceiling for a rating tile (defaults to 5). */
  scaleMax?: number
  /** 'down' kinds (spend, alcohol) sit UNDER the number; 'up' kinds climb it. */
  goalDirection?: 'up' | 'down'
}

// A calm 7-point wave in [0,1], today (last) landing just shy of full so there is
// visible room to grow. Same curve for every additive tile; scaled by target.
const WAVE = [0.62, 0.85, 0.5, 0.96, 0.72, 0.68, 0.8]

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function sampleValues(input: SampleInput): number[] {
  const { kind } = input

  if (kind === 'done') {
    // A habit streak: done most days, one honest miss mid-week, done today.
    return [1, 1, 0, 1, 1, 1, 1]
  }

  if (kind === 'rating') {
    const max = input.scaleMax ?? 5
    // Mid-to-strong ratings, gently rising into today.
    const frac = [0.6, 0.8, 0.6, 0.7, 0.8, 0.7, 0.9]
    return frac.map((f) => Math.max(1, Math.round(f * max)))
  }

  if (kind === 'measure') {
    // A body-measure trend near a plausible baseline (no hard target); a soft
    // drift so the chart reads as movement, not a flat line. Anchored at 100 so
    // the shape is unit-agnostic (kg, cm, %, bpm all render the same relative arc).
    const base = input.target && input.target > 0 ? input.target : 100
    const drift = [1.04, 1.03, 1.035, 1.02, 1.015, 1.01, 1.0]
    return drift.map((d) => round1(base * d))
  }

  const target = input.target && input.target > 0 ? input.target : 10

  if (kind === 'money') {
    // A daily-spend ledger that mostly sits UNDER budget, with one heavier day.
    const frac = input.goalDirection === 'down'
      ? [0.7, 0.55, 1.1, 0.6, 0.75, 0.65, 0.7]
      : WAVE
    return frac.map((f) => Math.max(1, Math.round(target * f)))
  }

  // counter / timer / intake - additive toward the target.
  const decimals = kind === 'duration' && target <= 24 // hours-scale timers keep a .5
  return WAVE.map((f) => {
    const v = target * f
    return decimals ? round1(v) : Math.max(1, Math.round(v))
  })
}
