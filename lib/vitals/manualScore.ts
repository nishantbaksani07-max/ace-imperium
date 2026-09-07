/**
 * Manual-vitals scoring (BUILD68) — turn a no-wearable self-report into the same
 * WHOOP-style trio every band reports: Recovery (0-100), Sleep (0-100) and
 * Strain (0-21). Pure + no IO, like lib/vitals/score.ts: any input maps to a
 * valid number or null (when there's genuinely nothing to read); it never throws.
 *
 * Why derive these three specifically: the rest of Vitals (the score engine,
 * the readings dashboard, Peak's curve) already speaks recovery/sleep_perf/strain
 * via `wearable_data`. By mapping the manual check-in onto those exact columns we
 * make a hand-entered day feed every surface a real band would — no special
 * cases downstream. The raw measurements (hrv, rhr, sleep_hours) pass through
 * untouched; only the three composite scores are computed here.
 *
 * Baseline-aware: Recovery leans hardest on HRV-vs-baseline, then sleep, RHR and
 * the subjective "feel". When a signal (or its baseline) is missing it simply
 * drops out and the remaining weights re-normalise — a gap never zero-penalises,
 * mirroring computeVitalsScore. On a user's very first check-in (no baseline yet)
 * Recovery is carried by sleep + feel; HRV/RHR join once ~3 prior days exist.
 */

export interface ManualScoreInput {
  /** Hours actually asleep last night. */
  sleepHours: number | null
  /** How restful, 1 (rough) – 5 (deep). */
  sleepQuality: number | null
  /** Merged subjective read, 1 (wrecked) – 5 (amazing). */
  feel: number | null
  /** HRV in ms (the dominant recovery signal, when measured). */
  hrv: number | null
  /** Resting HR in bpm. */
  rhr: number | null
  /** Self-reported physical exertion, 1 (rest) – 5 (max). Drives Strain. */
  exertion: number | null
  /** Rolling personal HRV baseline (mean of recent valid days), or null. */
  hrvBaseline: number | null
  /** Rolling personal RHR baseline, or null. */
  rhrBaseline: number | null
  /** Target sleep in hours (from the setup quiz; default 8). */
  sleepNeed: number
}

export interface ManualMetrics {
  /** 0-100, null when nothing recovery-related was entered. */
  recovery: number | null
  /** 0-100, null when no sleep signal was entered. */
  sleepPerf: number | null
  /** 0-21, null when exertion wasn't tapped. */
  strain: number | null
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n))
const round = (n: number) => Math.round(n)
const round1 = (n: number) => Math.round(n * 10) / 10

/** A 1–5 word scale → 0-100 (1 → 0, 3 → 50, 5 → 100). */
function scale5(v: number | null): number | null {
  if (v == null) return null
  return clamp(((v - 1) / 4) * 100)
}

/** HRV vs personal baseline. At baseline = 50; well above trends to 100.
 *  Matches the curve in lib/vitals/score.ts so manual and WHOOP read alike. */
function hrvScore(hrv: number | null, baseline: number | null): number | null {
  if (hrv == null || baseline == null || baseline <= 0) return null
  return clamp(round(50 + ((hrv - baseline) / baseline) * 150))
}

/** Resting HR vs baseline. Lower than baseline is better; at baseline = 50. */
function rhrScore(rhr: number | null, baseline: number | null): number | null {
  if (rhr == null || baseline == null || baseline <= 0) return null
  return clamp(round(50 + ((baseline - rhr) / baseline) * 200))
}

/** Weighted mean over only the parts that have a value; null when none do. */
function blend(parts: { score: number | null; weight: number }[]): number | null {
  const present = parts.filter((p) => p.score != null)
  if (present.length === 0) return null
  const totalWeight = present.reduce((a, p) => a + p.weight, 0)
  const weighted = present.reduce((a, p) => a + (p.score as number) * p.weight, 0)
  return round(weighted / totalWeight)
}

/** Sleep performance: hours-vs-need is the spine, restfulness adjusts it. */
export function deriveSleepPerf(input: ManualScoreInput): number | null {
  const need = input.sleepNeed > 0 ? input.sleepNeed : 8
  const hoursScore = input.sleepHours == null ? null : clamp(round((input.sleepHours / need) * 100))
  return blend([
    { score: hoursScore, weight: 0.6 },
    { score: scale5(input.sleepQuality), weight: 0.4 },
  ])
}

/** Recovery: HRV-vs-baseline leads, then sleep, RHR-vs-baseline, and feel. */
export function deriveRecovery(input: ManualScoreInput, sleepPerf: number | null): number | null {
  return blend([
    { score: hrvScore(input.hrv, input.hrvBaseline), weight: 0.35 },
    { score: sleepPerf, weight: 0.25 },
    { score: rhrScore(input.rhr, input.rhrBaseline), weight: 0.2 },
    { score: scale5(input.feel), weight: 0.2 },
  ])
}

/** Strain (0-21) from self-reported exertion (1 → 0 … 5 → 21). Manual can't
 *  measure cardio load, so a single honest tap is the most defensible proxy. */
export function deriveStrain(input: ManualScoreInput): number | null {
  if (input.exertion == null) return null
  return round1(clamp(((input.exertion - 1) / 4) * 21, 0, 21))
}

/** The full WHOOP-style trio for one manual check-in. */
export function deriveManualMetrics(input: ManualScoreInput): ManualMetrics {
  const sleepPerf = deriveSleepPerf(input)
  return {
    recovery: deriveRecovery(input, sleepPerf),
    sleepPerf,
    strain: deriveStrain(input),
  }
}

/**
 * Exact hours asleep from a bedtime → wake-up session. `asleepOffsetMin` is the
 * time spent lying awake before sleep (subtracted from the span). Returns null
 * unless both timestamps are present and wake is after bed; caps at 24h so a
 * forgotten "woke up" tap can't produce a nonsensical figure.
 */
export function sleepHoursFromSession(
  bedAt: number | null | undefined,
  wakeAt: number | null | undefined,
  asleepOffsetMin = 10,
): number | null {
  if (bedAt == null || wakeAt == null) return null
  const spanMin = (wakeAt - bedAt) / 60000 - Math.max(0, asleepOffsetMin)
  if (spanMin <= 0) return null
  return round1(Math.min(24, spanMin / 60))
}
