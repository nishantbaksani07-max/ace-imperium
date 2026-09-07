/**
 * Vitals goal engine (pure, no IO). Consumes a HealthContext to derive a fair,
 * reachable goal, evaluate progress toward it, and recalibrate as data matures.
 * Every target is anchored to the person's OWN baseline — never a population
 * number. Total functions: any input maps to a valid goal, never throws.
 * See spec §3 (calibration), §3c (provisional→sharpen), §6 (progress).
 */
import type { VitalsPreferences, VitalsLimiter } from '@/lib/preferences'
import type { VitalsReading } from '@/lib/vitals/advice'
import {
  clamp, mean, METRIC_FIELD,
  type HealthContext, type MetricContext, type VitalsGoalMetric, type GoalConfidence,
} from '@/lib/vitals/healthContext'

// climb fractions for hrv (% of personal baseline)
const HRV_DELTA_PCT = 0.10
const HRV_MIN_PCT = 0.04
const HRV_MAX_PCT = 0.12
// 'hold' target = max(strongAt, baseline * this) — a personal floor, not a population line
const HOLD_FLOOR_RATIO = 0.92
// pace below this stretches the window so older/flagged users get more time
const GENTLE_PACE = 0.8
const WINDOW_DEFAULT = 28
const WINDOW_GENTLE = 35

export interface VitalsGoal {
  metric: VitalsGoalMetric
  direction: 'up' | 'hold'
  baselineValue: number | null
  targetValue: number
  windowDays: number
  confidence: GoalConfidence
  isProvisional: boolean
  sourceLimiter: VitalsLimiter | null
}

export const LIMITER_TO_METRIC: Record<VitalsLimiter, VitalsGoalMetric> = {
  sleep: 'sleep', energy: 'recovery', soreness: 'recovery',
  stress: 'hrv', plateau: 'strain', optimize: 'recovery',
}

/** Round to the precision that metric is displayed at. */
function roundMetric(metric: VitalsGoalMetric, n: number): number {
  return metric === 'sleep' || metric === 'strain' ? Math.round(n * 10) / 10 : Math.round(n)
}

/** Pick the goal metric: the limiter's metric, or the best available fallback. */
function pickMetric(limiter: VitalsLimiter | null, ctx: HealthContext): VitalsGoalMetric {
  const wanted = limiter ? LIMITER_TO_METRIC[limiter] : 'recovery'
  if (ctx.availableMetrics.includes(wanted)) return wanted
  return ctx.availableMetrics.find(m => m === 'recovery')
    ?? ctx.availableMetrics.find(m => m === 'sleep')
    ?? ctx.availableMetrics[0]
    ?? 'recovery'
}

/** Core sizing for one metric given its context. Shared by derive + recalibrate. */
function sizeForMetric(metric: VitalsGoalMetric, mc: MetricContext, ctx: HealthContext): { direction: 'up' | 'hold'; target: number } {
  const base = mc.baseline ?? mc.seed
  if (mc.band === 'strong') {
    return { direction: 'hold', target: roundMetric(metric, Math.max(mc.strongAt, base * HOLD_FLOOR_RATIO)) }
  }
  let delta: number
  if (mc.pct) {
    const capped = Math.min(base * HRV_MAX_PCT, base * HRV_DELTA_PCT)
    delta = Math.max(base * HRV_MIN_PCT, capped * ctx.paceFactor)
  } else {
    const capped = Math.min(mc.maxDelta, mc.headroom * mc.headroomFraction)
    delta = Math.max(mc.minDelta, capped * ctx.paceFactor)
  }
  return { direction: 'up', target: roundMetric(metric, Math.min(base + delta, mc.ceiling)) }
}

function buildGoal(metric: VitalsGoalMetric, limiter: VitalsLimiter | null, ctx: HealthContext): VitalsGoal {
  const mc = ctx.perMetric[metric]
  const { direction, target } = sizeForMetric(metric, mc, ctx)
  return {
    metric,
    direction,
    baselineValue: mc.baseline,
    targetValue: target,
    windowDays: ctx.paceFactor < GENTLE_PACE ? WINDOW_GENTLE : WINDOW_DEFAULT,
    confidence: ctx.confidence,
    isProvisional: ctx.confidence !== 'trusted',
    sourceLimiter: limiter,
  }
}

export function deriveVitalsGoal(prefs: VitalsPreferences | null, ctx: HealthContext): VitalsGoal {
  const limiter = prefs?.biggestLimiter ?? null
  return buildGoal(pickMetric(limiter, ctx), limiter, ctx)
}

/** Same as deriveVitalsGoal but the user explicitly chose the metric (swap). */
export function deriveVitalsGoalForMetric(metric: VitalsGoalMetric, prefs: VitalsPreferences | null, ctx: HealthContext): VitalsGoal {
  const limiter = prefs?.biggestLimiter ?? null
  const resolved = ctx.availableMetrics.includes(metric) ? metric : pickMetric(limiter, ctx)
  return buildGoal(resolved, limiter, ctx)
}

export interface GoalProgress {
  pct: number // 0..1 toward target
  currentAvg: number | null // rolling avg of the goal metric across the week
  achieved: boolean
  ready: boolean // false while provisional (no celebration yet)
}

const ACHIEVE_HOLD_DAYS = 3

export function evaluateGoalProgress(goal: VitalsGoal, week: VitalsReading[]): GoalProgress {
  const field = METRIC_FIELD[goal.metric]
  const chrono = [...week].sort((a, b) => a.date.localeCompare(b.date))
  const vals = chrono.map(r => r[field] as number | null).filter((n): n is number => n != null)
  const currentAvg = mean(vals)
  const ready = !goal.isProvisional

  let pct = 0
  if (currentAvg != null) {
    if (goal.direction === 'up') {
      const base = goal.baselineValue ?? currentAvg
      const span = goal.targetValue - base
      pct = span <= 0 ? 1 : clamp((currentAvg - base) / span, 0, 1)
    } else {
      pct = currentAvg >= goal.targetValue ? 1 : clamp(currentAvg / goal.targetValue, 0, 1)
    }
  }

  const last = chrono.slice(-ACHIEVE_HOLD_DAYS).map(r => r[field] as number | null)
  const meets = (v: number | null) => v != null && v >= goal.targetValue
  const achieved = ready && last.length >= ACHIEVE_HOLD_DAYS && last.every(meets)

  return { pct, currentAvg, achieved, ready }
}

/**
 * Re-derive a goal's target from fresher context, keeping the original metric.
 * An 'up' target only ever eases or holds steady while it stays an 'up' goal (the up→up case); if the baseline climbs into the strong band the goal becomes a 'hold' on a personal floor, which is never harder in practice.
 * Updates confidence so a provisional goal locks in once data is trusted.
 */
export function recalibrateGoal(goal: VitalsGoal, ctx: HealthContext): VitalsGoal {
  const mc = ctx.perMetric[goal.metric]
  const sized = sizeForMetric(goal.metric, mc, ctx)
  let target = sized.target
  let direction = sized.direction
  // never raise an up-target; if the goal was 'up' and still 'up', ease only
  if (goal.direction === 'up' && direction === 'up') {
    target = Math.min(goal.targetValue, sized.target)
  }
  return {
    ...goal,
    direction,
    baselineValue: mc.baseline,
    targetValue: target,
    windowDays: ctx.paceFactor < GENTLE_PACE ? WINDOW_GENTLE : goal.windowDays,
    confidence: ctx.confidence,
    isProvisional: ctx.confidence !== 'trusted',
  }
}
