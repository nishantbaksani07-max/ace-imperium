/**
 * Vitals health-context engine (pure, no IO).
 *
 * Builds a PRIVATE "starting picture" of a person from data we already have
 * (profile + wearable readings + quiz flags) and turns it into the inputs a
 * fair goal needs: per-metric baseline / ceiling / headroom / band, a
 * paceFactor (how gently to push), and a confidence level (how much we trust
 * the data yet). Never compares a person to other people — age/sex are only
 * soft priors used to set a sane ceiling and bend the pace. Every function is
 * total: any input maps to a valid output, never throws. See spec §3.
 */
import type { VitalsHealthFlag } from '@/lib/preferences'
import type { VitalsReading } from '@/lib/vitals/advice'

// ── public types ────────────────────────────────────────────────────
export type VitalsGoalMetric = 'recovery' | 'sleep' | 'hrv' | 'strain'
export type GoalConfidence = 'low' | 'building' | 'trusted'
export type MetricBand = 'low' | 'typical' | 'strong'

export interface ProfileInput {
  birthday: string | null // 'YYYY-MM-DD'
  sex: 'M' | 'F' | null
  heightCm: number | null
  weightKg: number | null // latest known weight
}

export interface MetricContext {
  baseline: number | null // person's own average; null until we have data
  ceiling: number // sane personal upper bound (soft prior)
  strongAt: number // baseline at/above this = 'strong' band → hold
  seed: number // neutral provisional baseline when no data yet
  headroom: number // room to climb toward ceiling (drives goal size)
  band: MetricBand
  minDelta: number
  maxDelta: number
  headroomFraction: number
  pct: boolean // true for hrv (climb is % of baseline, not headroom fraction)
}

export interface HealthContext {
  confidence: GoalConfidence
  daysOfData: number
  perMetric: Record<VitalsGoalMetric, MetricContext>
  paceFactor: number // 0.6..1.0 — gentler for older / flagged / low-confidence
  availableMetrics: VitalsGoalMetric[]
}

// ── tuning constants (ALL knobs live here) ──────────────────────────
export const CONFIDENCE_DAYS = { building: 3, trusted: 7 } as const

/** Static spec per non-hrv metric. hrv is age-derived (see expectedHrv). */
const METRIC_STATIC: Record<Exclude<VitalsGoalMetric, 'hrv'>, {
  ceiling: number; strongAt: number; seed: number
  minDelta: number; maxDelta: number; headroomFraction: number
}> = {
  recovery: { ceiling: 90, strongAt: 67, seed: 55, minDelta: 2, maxDelta: 8, headroomFraction: 0.4 },
  sleep: { ceiling: 8.5, strongAt: 7.5, seed: 6.8, minDelta: 0.25, maxDelta: 0.75, headroomFraction: 0.4 },
  strain: { ceiling: 18, strongAt: 15, seed: 10, minDelta: 0.5, maxDelta: 1.5, headroomFraction: 0.25 },
}

/** hrv RMSSD (ms) soft prior by age: first bracket whose max-age >= age. */
const HRV_BY_AGE: Array<[maxAge: number, ms: number]> = [
  [25, 65], [35, 55], [45, 45], [55, 36], [65, 30], [200, 25],
]
const HRV_UNKNOWN_AGE = 45
const HRV_CEILING_MULT = 1.3

/** paceFactor penalties (subtracted from 1.0, then clamped to [0.6, 1.0]). */
const PACE = { agePerYearOver40: 0.01, flagsPenalty: 0.15, lowConfPenalty: 0.2, buildingConfPenalty: 0.1, floor: 0.6 }

/** Health flags that warrant a gentler push (lower paceFactor). 'other' is excluded — unknown by design. */
const PACE_FLAGS: VitalsHealthFlag[] = ['condition', 'medication', 'injury', 'cycle']

// ── helpers ─────────────────────────────────────────────────────────
export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

export const mean = (nums: number[]): number | null =>
  nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null

/** Whole-years age from 'YYYY-MM-DD' strings. Pure (no Date), null-safe. */
export function ageFromBirthday(birthday: string | null, today: string): number | null {
  if (!birthday || !today) return null
  const [by, bm, bd] = birthday.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  if ([by, bm, bd, ty, tm, td].some(n => !Number.isFinite(n))) return null
  let age = ty - by
  if (tm < bm || (tm === bm && td < bd)) age--
  return age >= 0 && age < 130 ? age : null
}

/** Soft-prior expected HRV (RMSSD ms) for an age; mid value if age unknown. */
export function expectedHrv(age: number | null): number {
  if (age == null) return HRV_UNKNOWN_AGE
  for (const [maxAge, ms] of HRV_BY_AGE) if (age <= maxAge) return ms
  return HRV_BY_AGE[HRV_BY_AGE.length - 1][1]
}

const ALL_METRICS: VitalsGoalMetric[] = ['recovery', 'sleep', 'hrv', 'strain']

/** Map a metric to the VitalsReading field it reads. */
export const METRIC_FIELD: Record<VitalsGoalMetric, keyof VitalsReading> = {
  recovery: 'recovery', sleep: 'sleep_hours', hrv: 'hrv', strain: 'strain',
}

/** Per-metric numeric spec, age-aware for hrv. */
function metricSpec(metric: VitalsGoalMetric, age: number | null) {
  if (metric === 'hrv') {
    const e = expectedHrv(age)
    return {
      ceiling: Math.round(e * HRV_CEILING_MULT * 10) / 10,
      strongAt: e, seed: e, minDelta: 0, maxDelta: 0, headroomFraction: 0, pct: true,
    }
  }
  return { ...METRIC_STATIC[metric], pct: false }
}

function bandFor(baseline: number | null, strongAt: number, seed: number): MetricBand {
  if (baseline == null) return 'typical'
  if (baseline >= strongAt) return 'strong'
  if (baseline < seed) return 'low'
  return 'typical'
}

export function computeHealthContext(input: {
  profile: ProfileInput
  readings: VitalsReading[]
  flags: VitalsHealthFlag[]
  today: string
}): HealthContext {
  const { profile, readings, flags, today } = input
  const age = ageFromBirthday(profile?.birthday ?? null, today)
  const daysOfData = readings.length

  const confidence: GoalConfidence =
    daysOfData >= CONFIDENCE_DAYS.trusted ? 'trusted'
      : daysOfData >= CONFIDENCE_DAYS.building ? 'building'
        : 'low'

  // a metric is "available" if any reading reports it; no readings → assume all
  const availableMetrics = readings.length === 0
    ? [...ALL_METRICS]
    : ALL_METRICS.filter(m => readings.some(r => r[METRIC_FIELD[m]] != null))

  const perMetric = {} as Record<VitalsGoalMetric, MetricContext>
  for (const metric of ALL_METRICS) {
    const spec = metricSpec(metric, age)
    const field = METRIC_FIELD[metric]
    const vals = readings.map(r => r[field] as number | null).filter((n): n is number => n != null)
    const baseline = mean(vals)
    const ref = baseline ?? spec.seed
    perMetric[metric] = {
      baseline,
      ceiling: spec.ceiling,
      strongAt: spec.strongAt,
      seed: spec.seed,
      headroom: Math.max(0, spec.ceiling - ref),
      band: bandFor(baseline, spec.strongAt, spec.seed),
      minDelta: spec.minDelta,
      maxDelta: spec.maxDelta,
      headroomFraction: spec.headroomFraction,
      pct: spec.pct,
    }
  }

  // pace: start at 1, subtract penalties, floor at PACE.floor
  let pace = 1
  if (age != null && age > 40) pace -= (age - 40) * PACE.agePerYearOver40
  if (flags && flags.some(f => PACE_FLAGS.includes(f))) {
    pace -= PACE.flagsPenalty
  }
  if (confidence === 'low') pace -= PACE.lowConfPenalty
  else if (confidence === 'building') pace -= PACE.buildingConfPenalty
  const paceFactor = clamp(Math.round(pace * 100) / 100, PACE.floor, 1)

  return { confidence, daysOfData, perMetric, paceFactor, availableMetrics }
}
