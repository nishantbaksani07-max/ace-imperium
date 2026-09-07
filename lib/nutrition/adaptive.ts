// The adaptive engine — the pure "brain" of the weight+calorie coach.
//
// Learns a user's real maintenance from their own logged weight + food, judges
// their weekly trend against a goal lane, and proposes a warm, confirm-first
// calorie nudge. No IO, no React, no Supabase — plain arrays in, plain objects
// out — so it can be unit-tested exhaustively (mirrors macroCalc.ts / dayType.ts).
//
// Canonical unit is KILOGRAMS (weights are stored in kg; 1 kg ~= 7700 kcal).
// Display conversion to lb happens at the UI boundary via lib/units.ts, NEVER here.
//
// Spec: docs/superpowers/specs/2026-06-05-weight-calorie-adaptive-coach-design.md
// Design law: "the scale is the judge, the food log is the dial" — steering
// direction comes from the (noise-robust) weight trend, so imperfect logging
// still steers correctly; nudges are sized relative to the user's OWN current
// target so a steady logging bias cancels out.

import type { DayTarget } from './types'

export const KCAL_PER_KG = 7700

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

// ── inputs / outputs ─────────────────────────────────────────────────────────

export interface WeighIn {
  date: string // local YYYY-MM-DD
  weightKg: number
}

export interface DailyKcal {
  dayKey: string // local YYYY-MM-DD (meals use the upstream 4am rollover key)
  kcal: number
}

export interface GoalBand {
  // Signed weekly-rate lane. low <= high; both negative for a cut, both positive
  // for a bulk, straddling 0 for maintain.
  lowKgPerWeek: number
  highKgPerWeek: number
}

// ── local date math ────────────────────────────────────────────────────────
// Parse YYYY-MM-DD as LOCAL midnight (never `new Date(key)`, which is UTC and
// reintroduces the day-boundary drift lib/dates.ts warns about).

function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Whole days from `a` to `b` (b - a). Positive when b is later. */
function dayDiff(a: string, b: string): number {
  return Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86_400_000)
}

// How far back the slope is fit. The spec says "trailing ~14-28 days"; we use the
// trailing 28 days of the smoothed line so the rate is stable week to week.
const TREND_WINDOW_DAYS = 28

// ── trend rate ───────────────────────────────────────────────────────────────

/**
 * 7-day trailing moving average per weigh-in (same window the Progress tracker
 * uses), then the least-squares slope of that smoothed line over the trailing
 * TREND_WINDOW_DAYS, expressed as kg/week. Smoothed, not raw, so morning water /
 * food / bathroom noise does not move it. Returns null rate when there is not
 * enough to fit a line; the caller's calibrating gate decides sufficiency.
 */
export function computeTrendRate(
  weighIns: WeighIn[],
): { rateKgPerWeek: number | null; smoothed: { date: string; avgKg: number }[] } {
  const sorted = weighIns
    .filter((w) => Number.isFinite(w.weightKg))
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  if (sorted.length === 0) return { rateKgPerWeek: null, smoothed: [] }

  // trailing 7-day average at each weigh-in date (handles sparse days correctly)
  const smoothed = sorted.map((w) => {
    const win = sorted.filter((o) => {
      const back = dayDiff(o.date, w.date) // o on/before w
      return back >= 0 && back <= 6
    })
    const avg = win.reduce((s, o) => s + o.weightKg, 0) / win.length
    return { date: w.date, avgKg: avg }
  })

  if (smoothed.length < 2) return { rateKgPerWeek: null, smoothed }

  const latest = smoothed[smoothed.length - 1].date
  const window = smoothed.filter((p) => dayDiff(p.date, latest) <= TREND_WINDOW_DAYS)
  if (window.length < 2) return { rateKgPerWeek: null, smoothed }

  const x0 = window[0].date
  const xs = window.map((p) => dayDiff(x0, p.date))
  const ys = window.map((p) => p.avgKg)
  const n = xs.length
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY)
    den += (xs[i] - meanX) ** 2
  }
  if (den === 0) return { rateKgPerWeek: 0, smoothed }
  const slopePerDay = num / den
  return { rateKgPerWeek: slopePerDay * 7, smoothed }
}

// ── maintenance estimate ─────────────────────────────────────────────────────

/**
 * Maintenance from energy balance over the trailing window:
 *   maintenance = avgDailyKcal - weightChangeKcalPerDay
 * The weight-change term comes from the trend SLOPE (computeTrendRate), not raw
 * smoothed endpoints: a moving average lags, and the lag is asymmetric (the
 * first point has none, the last lags ~3 days), which biases an endpoint
 * difference low. The least-squares slope is unbiased for a steady trend, so it
 * is the honest realization of the spec's energy-balance intent.
 *
 * `confidence` (0..1) scales with how many days actually have a logged meal.
 *
 * `logScaleGap` (the under-logging tell) is only computable against an external
 * reference maintenance (e.g. the formula estimate from setup). It is
 *   (actual weight change) - (change the log predicts at the reference)
 * in kcal/day: POSITIVE means the scale moved up more than the log can explain,
 * i.e. the log is running light. Null when no reference is supplied — we never
 * fabricate the gap (and so never accuse without evidence).
 */
export function estimateMaintenance(
  weighIns: WeighIn[],
  dailyKcal: DailyKcal[],
  windowDays: number,
  opts: { referenceMaintenanceKcal?: number } = {},
): { maintenanceKcal: number | null; confidence: number; logScaleGap: number | null } {
  const { rateKgPerWeek, smoothed } = computeTrendRate(weighIns)
  if (smoothed.length < 2 || rateKgPerWeek == null) {
    return { maintenanceKcal: null, confidence: 0, logScaleGap: null }
  }

  const latest = smoothed[smoothed.length - 1].date
  const meals = dailyKcal.filter((d) => {
    const back = dayDiff(d.dayKey, latest)
    return d.kcal > 0 && back >= 0 && back <= windowDays
  })
  if (meals.length === 0) return { maintenanceKcal: null, confidence: 0, logScaleGap: null }

  const avgIntake = meals.reduce((s, d) => s + d.kcal, 0) / meals.length
  const weightChangeKcalPerDay = (rateKgPerWeek / 7) * KCAL_PER_KG
  const maintenanceKcal = Math.round(avgIntake - weightChangeKcalPerDay)
  const confidence = clamp(meals.length / windowDays, 0, 1)

  let logScaleGap: number | null = null
  if (opts.referenceMaintenanceKcal != null) {
    const predictedChangePerDay = avgIntake - opts.referenceMaintenanceKcal
    logScaleGap = Math.round(weightChangeKcalPerDay - predictedChangePerDay)
  }

  return { maintenanceKcal, confidence, logScaleGap }
}

// ── goal lane ────────────────────────────────────────────────────────────────

const LB_TO_KG = 0.453592

// Locked lanes (lb/wk), settled at review 2026-06-06. low <= high; signed.
const LANES_LB = {
  cut: { low: -1.0, high: -0.5 },
  maintain: { low: -0.1, high: 0.1 },
  lean_bulk: { low: 0.25, high: 0.5 },
  bulk: { low: 0.5, high: 1.0 },
} as const

function laneForOutcome(goalOutcome: string): keyof typeof LANES_LB {
  switch (goalOutcome) {
    case 'CUT':
    case 'CUT_HP':
      return 'cut'
    case 'LEAN_BULK':
      return 'lean_bulk'
    case 'FAST_BULK':
      return 'bulk'
    default:
      // MAINTAIN, RECOMP, RECOMP_MAINTAIN, and any unknown -> the gentle lane
      return 'maintain'
  }
}

/**
 * The user's weekly-rate lane (kg/wk). Prefers the band persisted at setup (the
 * rate the quiz already computes); otherwise backfills from the stored
 * `goal_outcome` so accounts that onboarded before this shipped get the feature
 * without redoing the quiz.
 */
export function goalBandFor(
  goalOutcome: string,
  persisted?: { lowKgPerWeek: number; highKgPerWeek: number } | null,
): GoalBand {
  if (
    persisted &&
    Number.isFinite(persisted.lowKgPerWeek) &&
    Number.isFinite(persisted.highKgPerWeek)
  ) {
    return { lowKgPerWeek: persisted.lowKgPerWeek, highKgPerWeek: persisted.highKgPerWeek }
  }
  const lane = LANES_LB[laneForOutcome(goalOutcome)]
  return { lowKgPerWeek: lane.low * LB_TO_KG, highKgPerWeek: lane.high * LB_TO_KG }
}

/** The calorie target that aims for the MIDPOINT of the band, given maintenance. */
export function suggestTarget(maintenanceKcal: number, band: GoalBand): { targetKcal: number } {
  const midKgPerWeek = (band.lowKgPerWeek + band.highKgPerWeek) / 2
  return { targetKcal: Math.round(maintenanceKcal + (midKgPerWeek * KCAL_PER_KG) / 7) }
}

// ── weekly check-in ──────────────────────────────────────────────────────────

export type CheckinStatus = 'on_track' | 'too_fast' | 'too_slow' | 'calibrating'

export interface Checkin {
  status: CheckinStatus
  trendRateKgPerWeek: number | null
  maintenanceKcal: number | null
  avgKcal: number | null
  suggestedKcal: number | null
  deltaKcal: number | null
  logScaleGap: number | null
  reason: string
  daysUntilFirstRead?: number
}

// Honesty gate: never suggest a number until there is real signal.
const MIN_WEIGH_INS = 10
const MIN_SPAN_DAYS = 14
const MIN_MEAL_DAYS = 10
// Nudge sizing.
const MAX_STEP_KCAL = 250
const RATE_EPS = 0.02 // kg/wk dead-zone so trivial noise never flips status

// Warm, no-shame copy. HARD RULES: no em/en dashes, no red/shame/failure words.
function reasonFor(status: CheckinStatus, deltaKcal: number, logScaleGap: number | null): string {
  const gapNote =
    logScaleGap != null && logScaleGap > 150
      ? " Your log is running a little light next to your scale, which is completely normal. I'll trust the scale to keep us honest."
      : ''
  switch (status) {
    case 'on_track':
      return "You're right in your lane this week. Nothing to change, just keep doing what you're doing." + gapNote
    case 'too_fast':
      return (
        `You're moving a little quick, so let's ease back together. I'd ` +
        `nudge you about ${Math.abs(deltaKcal)} calories ${deltaKcal < 0 ? 'down' : 'up'} ` +
        `this week and see how next week lands.` +
        gapNote
      )
    case 'too_slow':
      return (
        `Things have slowed down a touch, so let's give it a gentle push. I'd ` +
        `nudge you about ${Math.abs(deltaKcal)} calories ${deltaKcal > 0 ? 'up' : 'down'} ` +
        `this week and check back in.` +
        gapNote
      )
    default:
      return ''
  }
}

/**
 * The weekly check-in. Direction is taken from the weight TREND (the scale is
 * the judge), so imperfect logging still steers correctly. The nudge is sized
 * relative to the user's OWN current target (the food log is the dial), so a
 * steady logging bias cancels. Returns `calibrating` with a day countdown until
 * the honesty gate passes.
 */
export function evaluateCheckin(
  input: { weighIns: WeighIn[]; dailyKcal: DailyKcal[]; band: GoalBand; currentTargetKcal: number },
  opts: { windowDays?: number; referenceMaintenanceKcal?: number } = {},
): Checkin {
  const windowDays = opts.windowDays ?? TREND_WINDOW_DAYS
  const { weighIns, dailyKcal, band, currentTargetKcal } = input
  const { rateKgPerWeek, smoothed } = computeTrendRate(weighIns)

  const span = smoothed.length >= 2 ? dayDiff(smoothed[0].date, smoothed[smoothed.length - 1].date) : 0
  const latest = smoothed.length ? smoothed[smoothed.length - 1].date : null
  const mealDays = latest
    ? dailyKcal.filter((d) => {
        const back = dayDiff(d.dayKey, latest)
        return d.kcal > 0 && back >= 0 && back <= windowDays
      }).length
    : 0

  const gatePassed =
    weighIns.length >= MIN_WEIGH_INS && span >= MIN_SPAN_DAYS && mealDays >= MIN_MEAL_DAYS

  if (!gatePassed || rateKgPerWeek == null) {
    const needCount = Math.max(0, MIN_WEIGH_INS - weighIns.length)
    const needSpan = Math.max(0, MIN_SPAN_DAYS - span)
    const needMeals = Math.max(0, MIN_MEAL_DAYS - mealDays)
    const daysUntilFirstRead = Math.max(1, needCount, needSpan, needMeals)
    return {
      status: 'calibrating',
      trendRateKgPerWeek: rateKgPerWeek,
      maintenanceKcal: null,
      avgKcal: null,
      suggestedKcal: null,
      deltaKcal: null,
      logScaleGap: null,
      daysUntilFirstRead,
      reason: `Keep logging and I'll have your first read in about ${daysUntilFirstRead} ${
        daysUntilFirstRead === 1 ? 'day' : 'days'
      }. The more you log, the sharper your plan gets.`,
    }
  }

  const est = estimateMaintenance(weighIns, dailyKcal, windowDays, {
    referenceMaintenanceKcal: opts.referenceMaintenanceKcal,
  })
  const meals = dailyKcal.filter((d) => {
    const back = dayDiff(d.dayKey, latest as string)
    return d.kcal > 0 && back >= 0 && back <= windowDays
  })
  const avgKcal = Math.round(meals.reduce((s, d) => s + d.kcal, 0) / meals.length)

  const mid = (band.lowKgPerWeek + band.highKgPerWeek) / 2
  const goalSign = mid > 0.01 ? 1 : mid < -0.01 ? -1 : 0
  const aboveBand = rateKgPerWeek > band.highKgPerWeek + RATE_EPS
  const belowBand = rateKgPerWeek < band.lowKgPerWeek - RATE_EPS

  let status: CheckinStatus
  let deltaKcal: number
  if (!aboveBand && !belowBand) {
    status = 'on_track'
    deltaKcal = 0
  } else {
    // Correct toward the lane midpoint, applied to the user's CURRENT target.
    const rateError = rateKgPerWeek - mid // >0 == trending heavier than wanted
    deltaKcal = clamp(
      Math.round((-rateError * KCAL_PER_KG) / 7 / 10) * 10,
      -MAX_STEP_KCAL,
      MAX_STEP_KCAL,
    )
    // For a cut (goalSign<0) below the lane = losing too fast = too_fast.
    // For gain/maintain, above the lane = gaining too fast = too_fast.
    if (goalSign < 0) status = belowBand ? 'too_fast' : 'too_slow'
    else status = aboveBand ? 'too_fast' : 'too_slow'
  }

  return {
    status,
    trendRateKgPerWeek: rateKgPerWeek,
    maintenanceKcal: est.maintenanceKcal,
    avgKcal,
    suggestedKcal: currentTargetKcal + deltaKcal,
    deltaKcal,
    logScaleGap: est.logScaleGap,
    reason: reasonFor(status, deltaKcal, est.logScaleGap),
  }
}

// ── cycle re-split ───────────────────────────────────────────────────────────

/**
 * Re-split an accepted weekly-average change across the gym/rest cycle. Shifts
 * BOTH training and rest targets by the same per-day delta (so the gap the user
 * set is preserved), holding protein + fat and absorbing the kcal change into
 * carbs (mirrors the carb-cycle invariant in macroCalc.ts). Clamped to >= 0.
 */
export function resplitForCycle(
  current: { training: DayTarget; rest: DayTarget; trainingDaysPerWeek: number },
  newWeeklyAvgKcal: number,
): { training: DayTarget; rest: DayTarget } {
  const t = clamp(Math.round(current.trainingDaysPerWeek), 0, 7)
  const restDays = 7 - t
  const curWeeklyAvg = (t * current.training.kcal + restDays * current.rest.kcal) / 7
  const deltaPerDay = newWeeklyAvgKcal - curWeeklyAvg

  const shift = (day: DayTarget): DayTarget => ({
    kcal: Math.max(0, Math.round(day.kcal + deltaPerDay)),
    protein: day.protein,
    carbs: Math.max(0, Math.round(day.carbs + deltaPerDay / 4)),
    fat: day.fat,
  })

  return { training: shift(current.training), rest: shift(current.rest) }
}
