import type { SupabaseClient } from '@supabase/supabase-js'
import type { WhoopSignal } from './types'

/**
 * Shared wearable-signal loader.
 *
 * Pulls the user's most recent `wearable_data` rows and derives the
 * `WhoopSignal` that drives the peak curve, score ring, and market ticker —
 * including personal HRV/RHR baselines from the last ~14 valid days.
 *
 * BUILD62: reads ANY connected wearable, not just WHOOP. All vendor syncs
 * (whoop/oura/fitbit) write the same `wearable_data` columns, so we take the
 * provider of the most recent row and derive the signal from that provider's
 * history. WHOOP wins ties (it carries a true recovery score); Oura's readiness
 * and Fitbit's sleep/HRV/RHR populate whatever columns they have, and missing
 * columns (e.g. Fitbit recovery) simply stay null and degrade gracefully.
 *
 * Extracted from peak/page.tsx (BUILD15) so the home dashboard header band
 * can surface the same live score + ticker without duplicating the fetch +
 * baseline math. Both `/app` and `/app/peak` call this.
 */
// 'manual' = readings imported from any unsupported wearable via screenshot/file
// (/api/wearables/import). Last in priority: a real band's same-day row wins, but
// when manual is all the user has, it becomes the active source and feeds the
// score + baselines exactly like the others.
const PROVIDER_PRIORITY = ['whoop', 'oura', 'fitbit', 'apple', 'manual'] as const

export const EMPTY_WHOOP: WhoopSignal = {
  recovery: null,
  hrv: null,
  sleepScore: null,
  sleepHours: null,
  sleepDebtHours: null,
  strain: null,
  wakeHour: null,
  hrvBaseline: null,
  rhrBaseline: null,
  hrvAnomalous: false,
  daysAvailable: 0,
}

export async function loadWhoopSignal(
  supabase: SupabaseClient,
  userId: string,
): Promise<WhoopSignal> {
  // Pull recent rows across every supported wearable so we can both pick the
  // active provider and compute personal baselines from the most recent ~14
  // valid days. 90 rows ≈ 30 days × up to 3 providers.
  const { data: allRows } = await supabase
    .from('wearable_data')
    .select('provider, date, recovery, hrv, rhr, sleep_perf, sleep_hours, strain, raw')
    .eq('user_id', userId)
    .in('provider', PROVIDER_PRIORITY as unknown as string[])
    .order('date', { ascending: false })
    .limit(90)

  if (!allRows || allRows.length === 0) return EMPTY_WHOOP

  // Active provider = the one with the most recent row; WHOOP wins a same-date
  // tie (true recovery score beats a derived readiness/sleep-only signal).
  const newestDate = allRows[0].date
  const sameDay = allRows.filter(r => r.date === newestDate)
  const activeProvider =
    PROVIDER_PRIORITY.find(p => sameDay.some(r => r.provider === p)) ?? allRows[0].provider
  const rows = allRows.filter(r => r.provider === activeProvider)

  const latest = rows[0]
  const target = 8
  const debt =
    latest.sleep_hours != null ? Math.max(0, target - Number(latest.sleep_hours)) : null
  let wakeHour: number | null = null
  const raw = latest.raw as { sleep?: { end?: string } } | null
  if (raw?.sleep?.end) {
    const d = new Date(raw.sleep.end)
    if (!isNaN(d.getTime())) wakeHour = d.getHours() + d.getMinutes() / 60
  }

  // ─── Personal baselines from last 14 valid days ────────────────
  // "Valid" = within physiological range. Filtering anomalous readings
  // (e.g. WHOOP returning a 200+ms HRV spike from a bad measurement)
  // keeps the baseline meaningful instead of skewed by outliers.
  const VALID_HRV = (v: number) => v >= 15 && v <= 150
  const VALID_RHR = (v: number) => v >= 30 && v <= 90
  const hrvHistory: number[] = []
  const rhrHistory: number[] = []
  for (const r of rows) {
    if (r.hrv != null) {
      const n = Number(r.hrv)
      if (VALID_HRV(n)) hrvHistory.push(n)
    }
    if (r.rhr != null) {
      const n = Number(r.rhr)
      if (VALID_RHR(n)) rhrHistory.push(n)
    }
    if (hrvHistory.length >= 14 && rhrHistory.length >= 14) break
  }
  const mean = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length
  const hrvBaseline = hrvHistory.length >= 3 ? mean(hrvHistory) : null
  const rhrBaseline = rhrHistory.length >= 3 ? mean(rhrHistory) : null

  const todayHrv = latest.hrv != null ? Number(latest.hrv) : null
  const hrvAnomalous = todayHrv != null && !VALID_HRV(todayHrv)

  return {
    recovery: latest.recovery != null ? Number(latest.recovery) : null,
    hrv: todayHrv,
    sleepScore: latest.sleep_perf != null ? Number(latest.sleep_perf) : null,
    sleepHours: latest.sleep_hours != null ? Number(latest.sleep_hours) : null,
    sleepDebtHours: debt,
    strain: latest.strain != null ? Number(latest.strain) : null,
    wakeHour,
    hrvBaseline,
    rhrBaseline,
    hrvAnomalous,
    daysAvailable: Math.max(hrvHistory.length, rhrHistory.length),
  }
}
