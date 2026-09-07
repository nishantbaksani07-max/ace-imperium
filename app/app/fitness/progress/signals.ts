/**
 * Derived signals shown on the Progress module — lift PRs (rotating
 * ticker) and a body-composition phase signal (recomp / bulking / cutting
 * / holding / losing) plus directional lean/fat trend estimates.
 *
 * All computation is pure — no DB access, no React, no localStorage —
 * so it can run on the server (page.tsx) or in tests.
 *
 * Honesty caveat on the lean/fat numbers: real body composition needs
 * DEXA or skinfolds. What we surface here is a directional estimate
 * derived from bodyweight trajectory × training-volume trajectory. It's
 * useful for spotting recomp vs fat gain in the absence of a scale that
 * measures it directly, but it is NOT a measurement and the UI labels it
 * as an estimate.
 */
import type { SavedExercise, SavedWorkout } from '@/lib/workouts/queries'
import type { WeightEntry } from './types'

// ─── Lift signals ────────────────────────────────────────────────────

export type LiftSignalKind = 'pr_weight' | 'pr_reps' | 'regress_weight' | 'regress_reps'

export interface LiftSignal {
  /** Stable id for React keys. Format: `${exerciseId}:${kind}:${dateKey}`. */
  id: string
  exerciseId: string
  exerciseName: string
  kind: LiftSignalKind
  /** Most recent top-set weight (kg). */
  currentWeightKg: number
  /** Previous top-set weight (kg). For PR_REPS this equals currentWeightKg. */
  previousWeightKg: number
  /** Most recent top-set reps. */
  currentReps: number
  /** Previous top-set reps. For PR_WEIGHT this is the previous session's reps. */
  previousReps: number
  /** Local date YYYY-MM-DD when the new top set was logged. */
  dateKey: string
}

/** "Top set" = the heaviest completed (done && !failed) set of an exercise. */
function topSet(ex: SavedExercise): { weight: number; reps: number } | null {
  let best: { weight: number; reps: number } | null = null
  for (const s of ex.sets) {
    if (!s.done || s.failed) continue
    const w = Number(s.weight) || 0
    const r = Number(s.reps) || 0
    if (w <= 0 || r <= 0) continue
    if (!best || w > best.weight || (w === best.weight && r > best.reps)) {
      best = { weight: w, reps: r }
    }
  }
  return best
}

/**
 * Walk through workouts (oldest → newest) and emit a LiftSignal whenever
 * the top set of an exercise materially changes from the user's running
 * best for that exercise.
 *
 * Thresholds tuned to suppress noise:
 *   - PR_WEIGHT only fires on +2.5kg or more (smallest commonly-loaded plate)
 *   - PR_REPS fires on +1 rep at equal-or-heavier weight
 *   - regressions only fire if the drop is ≥ 5% AND ≥ 2.5kg (avoid noise
 *     from a single bad-day session)
 *
 * Returns the most recent N signals across all exercises, newest first.
 */
export function computeLiftSignals(workouts: SavedWorkout[], limit = 8): LiftSignal[] {
  if (!workouts.length) return []

  // Eased / off-day sessions (little / rough / deload) never feed PR or
  // regression detection — a light sick-day set must not fake a regression or
  // poison the running PR baseline. Drop them before walking history.
  const sorted = [...workouts].filter(w => !w.off_day).sort((a, b) => a.date.localeCompare(b.date))
  const bestSoFar = new Map<string, { weight: number; reps: number }>()
  const signals: LiftSignal[] = []

  for (const w of sorted) {
    for (const ex of w.exercises ?? []) {
      const top = topSet(ex)
      if (!top) continue
      const prev = bestSoFar.get(ex.id)
      if (!prev) {
        // First time we've seen this exercise — establish the baseline,
        // don't emit (no comparison data yet).
        bestSoFar.set(ex.id, top)
        continue
      }

      const wDiff = top.weight - prev.weight
      const rDiff = top.reps - prev.reps

      // Weight PR — heavier top set
      if (wDiff >= 2.5) {
        signals.push({
          id: `${ex.id}:pr_weight:${w.date}`,
          exerciseId: ex.id,
          exerciseName: ex.name,
          kind: 'pr_weight',
          currentWeightKg: top.weight,
          previousWeightKg: prev.weight,
          currentReps: top.reps,
          previousReps: prev.reps,
          dateKey: w.date,
        })
        bestSoFar.set(ex.id, top)
        continue
      }

      // Rep PR — same/heavier weight at more reps
      if (wDiff >= 0 && rDiff >= 1) {
        signals.push({
          id: `${ex.id}:pr_reps:${w.date}`,
          exerciseId: ex.id,
          exerciseName: ex.name,
          kind: 'pr_reps',
          currentWeightKg: top.weight,
          previousWeightKg: prev.weight,
          currentReps: top.reps,
          previousReps: prev.reps,
          dateKey: w.date,
        })
        bestSoFar.set(ex.id, top)
        continue
      }

      // Regression — significant weight drop
      const pctDrop = prev.weight > 0 ? -wDiff / prev.weight : 0
      if (wDiff <= -2.5 && pctDrop >= 0.05) {
        signals.push({
          id: `${ex.id}:regress_weight:${w.date}`,
          exerciseId: ex.id,
          exerciseName: ex.name,
          kind: 'regress_weight',
          currentWeightKg: top.weight,
          previousWeightKg: prev.weight,
          currentReps: top.reps,
          previousReps: prev.reps,
          dateKey: w.date,
        })
        // For regressions, DON'T move bestSoFar down — we want the next
        // session to compare against the previous peak, so a single bad
        // day doesn't lock in a new (worse) baseline.
        continue
      }
    }
  }

  return signals.slice(-limit).reverse() // newest first
}

// ─── Composition signal ─────────────────────────────────────────────

export type Phase =
  | 'recomp'        // weight roughly flat or down + lifts up
  | 'bulking'       // weight up + lifts up
  | 'fat_gain'      // weight up + lifts flat/down
  | 'cutting'       // weight down + lifts maintained
  | 'losing'        // weight down + lifts down
  | 'holding'       // both flat — nothing meaningful happening
  | 'insufficient'  // not enough data

export interface CompositionSignal {
  phase: Phase
  /** Bodyweight trend in kg per week over the analysis window (signed). */
  weightSlopeKgPerWeek: number
  /** Volume-load trend in % over the analysis window (signed). Null if no workouts. */
  volumeTrendPct: number | null
  /** Directional estimate of lean change in kg per week. Caveated. Null when not estimable. */
  estimatedLeanKgPerWeek: number | null
  /** Directional estimate of fat change in kg per week. Caveated. Null when not estimable. */
  estimatedFatKgPerWeek: number | null
  /** Number of days in the analysis window — drives confidence labelling. */
  windowDays: number
  /** 0–100 confidence based on data density (weights logged + workouts in window). */
  confidence: number
}

const ANALYSIS_WINDOW_DAYS = 28
const MIN_WEIGHTS_FOR_TREND = 4
const FLAT_KG_PER_WEEK = 0.15 // smaller than this counts as "flat" in either direction

/**
 * Linear regression slope (least squares) of y values against day-index.
 * Returns slope in y-units per day. Null when fewer than 2 points.
 */
function linearSlopePerDay(points: { dayIdx: number; y: number }[]): number | null {
  if (points.length < 2) return null
  const n = points.length
  const sumX = points.reduce((s, p) => s + p.dayIdx, 0)
  const sumY = points.reduce((s, p) => s + p.y, 0)
  const sumXY = points.reduce((s, p) => s + p.dayIdx * p.y, 0)
  const sumX2 = points.reduce((s, p) => s + p.dayIdx * p.dayIdx, 0)
  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return null
  return (n * sumXY - sumX * sumY) / denom
}

function dayIndex(dateKey: string, anchorMs: number): number {
  const [y, m, d] = dateKey.split('-').map(Number)
  const t = new Date(y, (m || 1) - 1, d || 1).getTime()
  return Math.round((t - anchorMs) / 86_400_000)
}

function sessionVolumeKg(ex: SavedExercise): number {
  let sum = 0
  for (const s of ex.sets) {
    if (!s.done || s.failed) continue
    const w = Number(s.weight) || 0
    const r = Number(s.reps) || 0
    if (w > 0 && r > 0) sum += w * r
  }
  return sum
}

export function computeCompositionSignal(
  weights: WeightEntry[],
  workouts: SavedWorkout[],
): CompositionSignal {
  const now = Date.now()
  const windowStartMs = now - ANALYSIS_WINDOW_DAYS * 86_400_000

  // Filter to the analysis window
  const recentWeights = weights.filter(w => {
    const [y, m, d] = w.dateKey.split('-').map(Number)
    const t = new Date(y, (m || 1) - 1, d || 1).getTime()
    return t >= windowStartMs
  })
  const recentWorkouts = workouts.filter(w => {
    // Eased / off-day sessions are low-volume by design — counting their tonnage
    // would drag the volume-load trend down and could mislabel the phase (e.g.
    // flip a healthy deload week into "losing"). They never feed this signal.
    if (w.off_day) return false
    const [y, m, d] = w.date.split('-').map(Number)
    const t = new Date(y, (m || 1) - 1, d || 1).getTime()
    return t >= windowStartMs
  })

  // Bodyweight slope (kg/day → kg/week)
  let weightSlopeKgPerWeek = 0
  let weightSlopeKnown = false
  if (recentWeights.length >= MIN_WEIGHTS_FOR_TREND) {
    const slope = linearSlopePerDay(
      recentWeights.map(w => ({ dayIdx: dayIndex(w.dateKey, windowStartMs), y: w.weightKg })),
    )
    if (slope != null) {
      weightSlopeKgPerWeek = slope * 7
      weightSlopeKnown = true
    }
  }

  // Volume-load trend
  // Sum each session's completed-set tonnage, regress over session index in
  // the window. We use session-index (not calendar-day) because workouts are
  // sparse and a calendar-day slope would be dominated by zeros.
  let volumeTrendPct: number | null = null
  let liftTrendDirection: 'up' | 'flat' | 'down' | 'unknown' = 'unknown'
  if (recentWorkouts.length >= 3) {
    const sessionTonnage = recentWorkouts
      .map(w => ({
        date: w.date,
        vol: (w.exercises ?? []).reduce((s, ex) => s + sessionVolumeKg(ex), 0),
      }))
      .filter(s => s.vol > 0)
      .sort((a, b) => a.date.localeCompare(b.date))

    if (sessionTonnage.length >= 3) {
      const points = sessionTonnage.map((s, i) => ({ dayIdx: i, y: s.vol }))
      const slope = linearSlopePerDay(points)
      const avg = sessionTonnage.reduce((s, p) => s + p.vol, 0) / sessionTonnage.length
      if (slope != null && avg > 0) {
        // pct change per session × number of sessions → trend over window
        const totalPct = (slope * (sessionTonnage.length - 1) / avg) * 100
        volumeTrendPct = totalPct
        if (totalPct >= 3) liftTrendDirection = 'up'
        else if (totalPct <= -3) liftTrendDirection = 'down'
        else liftTrendDirection = 'flat'
      }
    }
  }

  // Confidence: 100 = full window of weights + ≥6 workouts. 0 = nothing.
  const weightCoverage = Math.min(1, recentWeights.length / ANALYSIS_WINDOW_DAYS)
  const workoutCoverage = Math.min(1, recentWorkouts.length / 6)
  const confidence = Math.round(((weightCoverage + workoutCoverage) / 2) * 100)

  // Decide phase
  if (!weightSlopeKnown && liftTrendDirection === 'unknown') {
    return {
      phase: 'insufficient',
      weightSlopeKgPerWeek: 0,
      volumeTrendPct: null,
      estimatedLeanKgPerWeek: null,
      estimatedFatKgPerWeek: null,
      windowDays: ANALYSIS_WINDOW_DAYS,
      confidence,
    }
  }

  const weightDir: 'up' | 'flat' | 'down' =
    !weightSlopeKnown
      ? 'flat'
      : weightSlopeKgPerWeek >= FLAT_KG_PER_WEEK
        ? 'up'
        : weightSlopeKgPerWeek <= -FLAT_KG_PER_WEEK
          ? 'down'
          : 'flat'

  // Heuristic phase matrix.
  let phase: Phase
  if (weightDir === 'up' && liftTrendDirection === 'up')             phase = 'bulking'
  else if (weightDir === 'up' && liftTrendDirection === 'flat')      phase = 'fat_gain'
  else if (weightDir === 'up' && liftTrendDirection === 'down')      phase = 'fat_gain'
  else if (weightDir === 'down' && liftTrendDirection === 'up')      phase = 'recomp'
  else if (weightDir === 'down' && liftTrendDirection === 'flat')    phase = 'cutting'
  else if (weightDir === 'down' && liftTrendDirection === 'down')    phase = 'losing'
  else if (weightDir === 'flat' && liftTrendDirection === 'up')      phase = 'recomp'
  else                                                                phase = 'holding'

  // Directional lean / fat split. The split ratios are heuristics, not
  // measurements. Idea: pair bodyweight direction with lift trend, then
  // assign rough lean/fat percentages of the total weight change.
  //   - lifts UP   + weight UP   → 65% lean, 35% fat
  //   - lifts UP   + weight DOWN → 100% fat loss + 0.1 kg/wk lean gain
  //   - lifts FLAT + weight UP   → 25% lean, 75% fat
  //   - lifts FLAT + weight DOWN → 50% lean, 50% fat
  //   - lifts DOWN + weight DOWN → 35% lean, 65% fat (preserving badly)
  //   - lifts DOWN + weight UP   → 10% lean, 90% fat
  let estimatedLeanKgPerWeek: number | null = null
  let estimatedFatKgPerWeek: number | null = null
  if (weightSlopeKnown && liftTrendDirection !== 'unknown') {
    const total = weightSlopeKgPerWeek
    let leanFrac = 0
    let leanAddon = 0 // extra lean gain even when weight is flat/down (recomp)
    if (liftTrendDirection === 'up' && weightDir === 'up')        leanFrac = 0.65
    else if (liftTrendDirection === 'up' && weightDir === 'flat'){ leanFrac = 0; leanAddon = 0.1 }
    else if (liftTrendDirection === 'up' && weightDir === 'down'){ leanFrac = 0; leanAddon = 0.1 }
    else if (liftTrendDirection === 'flat' && weightDir === 'up')   leanFrac = 0.25
    else if (liftTrendDirection === 'flat' && weightDir === 'down') leanFrac = 0.5
    else if (liftTrendDirection === 'flat' && weightDir === 'flat'){ leanFrac = 0; leanAddon = 0 }
    else if (liftTrendDirection === 'down' && weightDir === 'down') leanFrac = 0.35
    else if (liftTrendDirection === 'down' && weightDir === 'up')   leanFrac = 0.10
    else if (liftTrendDirection === 'down' && weightDir === 'flat') leanFrac = 0
    estimatedLeanKgPerWeek = total * leanFrac + leanAddon
    estimatedFatKgPerWeek = total - (total * leanFrac) - leanAddon
  }

  return {
    phase,
    weightSlopeKgPerWeek,
    volumeTrendPct,
    estimatedLeanKgPerWeek,
    estimatedFatKgPerWeek,
    windowDays: ANALYSIS_WINDOW_DAYS,
    confidence,
  }
}

// ─── Display helpers ────────────────────────────────────────────────

export const PHASE_LABEL: Record<Phase, string> = {
  recomp:        'Recomping',
  bulking:       'Bulking',
  fat_gain:      'Fat gain',
  cutting:       'Cutting',
  losing:        'Losing both',
  holding:       'Holding',
  insufficient:  'Calibrating',
}

export const PHASE_SUBLABEL: Record<Phase, string> = {
  recomp:       'lifts up, weight steady, likely swapping fat for muscle',
  bulking:      'weight up, lifts up. the gains are mostly muscle',
  fat_gain:     'weight up, lifts flat. most of the gain is fat',
  cutting:      'weight down, lifts preserved. fat loss with muscle held',
  losing:       'weight down, lifts down. losing both',
  holding:      'weight + lifts both steady. maintenance phase',
  insufficient: 'log a few more weeks of weight + training to unlock this',
}
