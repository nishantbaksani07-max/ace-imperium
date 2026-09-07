/**
 * Pure Oura reading normalizer — the trust boundary for Oura data.
 *
 * Oura, like WHOOP, computes a day in stages. Early in the morning Oura can
 * hand back a daily_readiness row whose `score` is still null (not finalized),
 * and the /sleep endpoint can return a short nap as the most-recent session
 * while the real overnight sleep is still being processed. If we store those
 * we surface a wrong/blank number until a later sync fixes it (the same class
 * of bug as WHOOP's 32/41% morning glitch).
 *
 * Rules:
 *   - readiness (→ recovery) counts only once Oura finalizes it (`score != null`)
 *   - the overnight metrics (HRV / RHR / hours / efficiency) come ONLY from the
 *     main sleep session (`type === 'long_sleep'`), never a nap
 *   - a not-yet-scored readiness flags the reading `provisional` so callers keep
 *     refreshing until Oura finalizes
 *   - `strain` is always null — Oura has no strain equivalent
 *
 * No fetch/Supabase here on purpose — this is unit-tested. Mirrors the WHOOP
 * trust boundary in lib/whoop/normalize.ts.
 */

const LONG_SLEEP = 'long_sleep'

export interface OuraReadiness {
  day: string
  /** 0-100, or null while Oura is still computing the day. */
  score: number | null
  contributors?: {
    resting_heart_rate?: number | null
    hrv_balance?: number | null
  }
}

export interface OuraSleepSession {
  day: string
  /** 'long_sleep' | 'late_nap' | 'early_nap' | 'rest' | ... (absent on old payloads). */
  type?: string
  total_sleep_duration: number | null // seconds
  efficiency: number | null
  average_hrv: number | null
  lowest_heart_rate: number | null
}

export interface OuraDailySleep {
  day: string
  /** 0-100, or null while still computing. */
  score: number | null
}

export interface NormalizedOuraReading {
  hrv: number | null
  rhr: number | null
  recovery: number | null
  sleep_perf: number | null
  sleep_hours: number | null
  /** Always null — Oura has no strain metric. Kept for a uniform wearable row. */
  strain: number | null
  /** Oura has today's readiness row but its score isn't finalized yet. Tells the
   *  page to keep refreshing rather than trust the (absent) numbers. */
  provisional: boolean
}

export function normalizeOuraMetrics(
  readiness: OuraReadiness | null,
  sleep: OuraSleepSession | null,
  dailySleep: OuraDailySleep | null,
): NormalizedOuraReading {
  // Recovery (= readiness) only counts once Oura finalizes the score.
  const readyReady = !!readiness && readiness.score != null
  // Overnight metrics only count for the main sleep session, never a nap.
  // When `type` is absent (older payloads) assume it is the long sleep.
  const sleepIsNight = !!sleep && (sleep.type == null || sleep.type === LONG_SLEEP)
  const sleepHasData = sleepIsNight && (sleep!.total_sleep_duration ?? 0) > 0
  const dailySleepReady = !!dailySleep && dailySleep.score != null

  const recovery = readyReady ? readiness!.score : null
  const readinessRhr = readyReady ? readiness!.contributors?.resting_heart_rate ?? null : null

  const hrv = sleepHasData ? sleep!.average_hrv ?? null : null
  // RHR prefers the night's lowest HR, falling back to the readiness contributor.
  const rhr = (sleepHasData ? sleep!.lowest_heart_rate ?? null : null) ?? readinessRhr
  const sleepHours = sleepHasData
    ? Math.round((sleep!.total_sleep_duration! / 3600) * 100) / 100
    : null
  // sleep_perf prefers the night's efficiency, falling back to the (finalized)
  // daily_sleep score.
  const sleepPerf =
    (sleepHasData ? sleep!.efficiency ?? null : null) ?? (dailySleepReady ? dailySleep!.score : null)

  const provisional = !!readiness && readiness.score == null

  return { hrv, rhr, recovery, sleep_perf: sleepPerf, sleep_hours: sleepHours, strain: null, provisional }
}
