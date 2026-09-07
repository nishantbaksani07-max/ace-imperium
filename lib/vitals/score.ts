/**
 * Vitals Score engine (pure, no IO). A 0-100 daily read of how the body is
 * doing, fused from the WHOOP metrics the way the old Vitality Score did, but
 * leveled up: personal HRV/RHR baselines, graceful re-balancing when a reading
 * is missing (a gap never zero-penalises), and a per-day series for the history
 * graph.
 *
 * Total function: any input maps to a valid score (or null when there is
 * genuinely nothing to read). It never throws. Colour/voice rules live in the
 * UI; this file is only numbers.
 *
 * Weights mirror the user's original "Vitality Score":
 *   recovery .30 · sleep performance .20 · HRV vs baseline .15 ·
 *   RHR vs baseline .15 · sleep hours .10 · strain balance .10  (sum = 1).
 */

export type Tier = 'needs-care' | 'low' | 'steady' | 'strong' | 'peak'

const TIER_MIN: { min: number; tier: Tier }[] = [
  { min: 85, tier: 'peak' },
  { min: 70, tier: 'strong' },
  { min: 55, tier: 'steady' },
  { min: 40, tier: 'low' },
  { min: 0, tier: 'needs-care' },
]

export function tierForScore(score: number): Tier {
  for (const t of TIER_MIN) if (score >= t.min) return t.tier
  return 'needs-care'
}

export interface ScoreInput {
  recovery: number | null
  sleepPerf: number | null
  hrv: number | null
  rhr: number | null
  sleepHours: number | null
  strain: number | null
  hrvBaseline: number | null
  rhrBaseline: number | null
  sleepTarget: number // hours; default 8
}

export type SubKey = 'recovery' | 'sleep_perf' | 'hrv' | 'rhr' | 'sleep_hours' | 'strain'

export interface SubScore {
  key: SubKey
  label: string
  score: number | null // 0-100, null when the input is unavailable today
  weight: number
  tier: Tier | null
  personal: boolean // measured against the user's own rolling baseline
}

export interface VitalsScore {
  score: number // 0-100 overall, re-normalised over the inputs we actually have
  tier: Tier
  subs: SubScore[] // all six, in display order (null score = missing today)
  confidence: number // 0-1, fraction of the total weight covered today
  missing: string[] // labels with no reading today
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n))
const round = (n: number) => Math.round(n)

/** HRV vs personal baseline. At baseline = 50; well above = toward 100. */
function hrvScore(hrv: number | null, baseline: number | null): number | null {
  if (hrv == null || baseline == null || baseline <= 0) return null
  return clamp(round(50 + ((hrv - baseline) / baseline) * 150))
}

/** Resting HR vs baseline. Lower than baseline is better; at baseline = 50. */
function rhrScore(rhr: number | null, baseline: number | null): number | null {
  if (rhr == null || baseline == null || baseline <= 0) return null
  return clamp(round(50 + ((baseline - rhr) / baseline) * 200))
}

/** Strain balance: did today's strain match what recovery could afford? Needs
 *  both strain and recovery; rewards a strain near the recovery-scaled target,
 *  penalises over-reaching harder than under-doing. */
function strainScore(strain: number | null, recovery: number | null): number | null {
  if (strain == null || recovery == null) return null
  const target = 4 + (clamp(recovery) / 100) * 14 // ~4 on a low day .. ~18 on a high one
  const diff = strain - target
  const penalty = diff >= 0 ? (diff / 18) * 120 : (-diff / 18) * 70
  return clamp(round(100 - penalty))
}

function subDefs(input: ScoreInput): Omit<SubScore, 'tier'>[] {
  const target = input.sleepTarget || 8
  return [
    { key: 'recovery', label: 'Recovery', weight: 0.3, personal: false,
      score: input.recovery == null ? null : clamp(round(input.recovery)) },
    { key: 'sleep_perf', label: 'Sleep performance', weight: 0.2, personal: false,
      score: input.sleepPerf == null ? null : clamp(round(input.sleepPerf)) },
    { key: 'hrv', label: 'HRV vs baseline', weight: 0.15, personal: true,
      score: hrvScore(input.hrv, input.hrvBaseline) },
    { key: 'rhr', label: 'RHR vs baseline', weight: 0.15, personal: true,
      score: rhrScore(input.rhr, input.rhrBaseline) },
    { key: 'sleep_hours', label: 'Sleep hours', weight: 0.1, personal: false,
      score: input.sleepHours == null ? null : clamp(round((input.sleepHours / target) * 100)) },
    { key: 'strain', label: 'Strain balance', weight: 0.1, personal: false,
      score: strainScore(input.strain, input.recovery) },
  ]
}

export function computeVitalsScore(input: ScoreInput): VitalsScore | null {
  const defs = subDefs(input)
  const present = defs.filter(d => d.score != null)
  if (present.length === 0) return null

  const totalWeight = present.reduce((a, d) => a + d.weight, 0)
  const weighted = present.reduce((a, d) => a + (d.score as number) * d.weight, 0)
  const score = round(weighted / totalWeight)

  const subs: SubScore[] = defs.map(d => ({
    ...d,
    tier: d.score == null ? null : tierForScore(d.score),
  }))

  return {
    score,
    tier: tierForScore(score),
    subs,
    confidence: totalWeight, // weights sum to 1, so covered weight == covered fraction
    missing: defs.filter(d => d.score == null).map(d => d.label),
  }
}

export interface Baselines { hrv: number | null; rhr: number | null }

/** Personal baselines = the mean of available readings over the window given. */
export function computeBaselines(rows: { hrv: number | null; rhr: number | null }[]): Baselines {
  const mean = (xs: number[]) => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : null)
  return {
    hrv: mean(rows.map(r => r.hrv).filter((n): n is number => n != null)),
    rhr: mean(rows.map(r => r.rhr).filter((n): n is number => n != null)),
  }
}

export interface ScoreSeriesRow {
  date: string
  recovery: number | null
  sleep_perf: number | null
  hrv: number | null
  rhr: number | null
  sleep_hours: number | null
  strain: number | null
}
export interface ScorePoint { date: string; score: number; tier: Tier }

/** Score every day in order, skipping days with no usable data. */
export function computeScoreSeries(
  rows: ScoreSeriesRow[],
  baselines: Baselines,
  sleepTarget: number,
): ScorePoint[] {
  const out: ScorePoint[] = []
  for (const r of rows) {
    const v = computeVitalsScore({
      recovery: r.recovery, sleepPerf: r.sleep_perf, hrv: r.hrv, rhr: r.rhr,
      sleepHours: r.sleep_hours, strain: r.strain,
      hrvBaseline: baselines.hrv, rhrBaseline: baselines.rhr, sleepTarget,
    })
    if (v) out.push({ date: r.date, score: v.score, tier: v.tier })
  }
  return out
}
