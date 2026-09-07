/**
 * Pure WHOOP reading normalizer — the trust boundary for WHOOP data.
 *
 * WHOOP scores a day in stages. Early in the morning the current cycle exists
 * but its recovery/sleep are still `PENDING_SCORE` (provisional), and the
 * single-record endpoints can even hand back the PREVIOUS cycle's numbers while
 * today's are still cooking. If we store those, the user sees wrong low numbers
 * until a later sync overwrites them (the bug Alex hit: 32/41% then 61/84%).
 *
 * Rule: a metric only counts when WHOOP says it is `SCORED`, and the recovery
 * must belong to the cycle we are dating the row as. Anything else is null and
 * the reading is flagged `provisional` so callers can keep refreshing until
 * WHOOP finalizes. No fetch/Supabase here on purpose — this is unit-tested.
 */

const SCORED = 'SCORED'

export interface WhoopRecovery {
  cycle_id: number
  sleep_id: number
  score_state: string
  score?: {
    user_calibrating: boolean
    recovery_score: number
    resting_heart_rate: number
    hrv_rmssd_milli: number
  }
  created_at: string
}

export interface WhoopSleep {
  id: number
  start: string
  end: string
  timezone_offset?: string
  score_state: string
  score?: {
    sleep_performance_percentage: number
    stage_summary?: {
      total_in_bed_time_milli: number
      total_awake_time_milli: number
    }
  }
}

export interface WhoopCycle {
  id: number
  start: string
  end: string | null
  timezone_offset?: string
  score_state: string
  score?: { strain: number; average_heart_rate: number }
}

export interface NormalizedWhoopReading {
  hrv: number | null
  rhr: number | null
  recovery: number | null
  sleep_perf: number | null
  sleep_hours: number | null
  strain: number | null
  /** WHOOP has a current cycle but its recovery is not finalized yet. Tells the
   *  page to keep refreshing rather than trust the (absent) numbers. */
  provisional: boolean
}

export function normalizeWhoopMetrics(
  recovery: WhoopRecovery | null,
  sleep: WhoopSleep | null,
  cycle: WhoopCycle | null,
): NormalizedWhoopReading {
  // Recovery counts only when finalized AND it belongs to the current cycle
  // (when we have one). A SCORED recovery for yesterday's cycle is not today's.
  const recReady =
    !!recovery &&
    recovery.score_state === SCORED &&
    (cycle == null || recovery.cycle_id === cycle.id)
  const sleepReady = !!sleep && sleep.score_state === SCORED
  const cycleReady = !!cycle && cycle.score_state === SCORED

  const hrv = recReady ? recovery!.score?.hrv_rmssd_milli ?? null : null
  const rhr = recReady ? recovery!.score?.resting_heart_rate ?? null : null
  const recoveryScore = recReady ? recovery!.score?.recovery_score ?? null : null

  const sleepPerf = sleepReady ? sleep!.score?.sleep_performance_percentage ?? null : null
  const stage = sleepReady ? sleep!.score?.stage_summary : undefined
  // "time asleep" = in-bed minus awake, so the metric reflects real sleep.
  const asleepMilli =
    stage?.total_in_bed_time_milli != null
      ? stage.total_in_bed_time_milli - (stage.total_awake_time_milli ?? 0)
      : null
  const sleepHours = asleepMilli != null ? Math.round((asleepMilli / 3_600_000) * 100) / 100 : null

  const strain = cycleReady ? cycle!.score?.strain ?? null : null

  // Provisional = WHOOP gave us a current cycle but its recovery is not ready.
  const provisional = !!cycle && !recReady

  return { hrv, rhr, recovery: recoveryScore, sleep_perf: sleepPerf, sleep_hours: sleepHours, strain, provisional }
}
