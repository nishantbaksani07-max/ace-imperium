import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OuraModule, { type OuraView } from './OuraModule'

export const dynamic = 'force-dynamic'

/**
 * WHOOP module — server entry.
 *
 * Pulls the user's wearable_connections row (presence = connected) plus
 * the last 30 days of wearable_data and computes:
 *   · today's values (most recent row)
 *   · 7-day recovery trend
 *   · personal HRV / RHR / sleep-efficiency baselines (last 14 valid days)
 *   · 7-night sleep debt vs 8h target
 *   · Vitality Score using the SKILL.md formula
 *
 * Everything below this server boundary is real user data — no SAMPLE
 * constants, no fake numbers. When the user has zero rows we render
 * empty-state UI in the client component.
 */

const SLEEP_TARGET = 8

// ─── Vitality Score components (per SKILL.md) ─────────────────────────

function hrvComponent(hrv: number | null, baseline: number | null): number {
  if (hrv == null || baseline == null || baseline <= 0) return 50
  const ratio = hrv / baseline
  if (ratio >= 1.10) return 100
  if (ratio >= 1.00) return 80
  if (ratio >= 0.90) return 60
  if (ratio >= 0.80) return 40
  return 20
}

function rhrComponent(rhr: number | null, baseline: number | null): number {
  if (rhr == null || baseline == null || baseline <= 0) return 50
  const ratio = rhr / baseline
  if (ratio <= 0.95) return 100
  if (ratio <= 1.00) return 80
  if (ratio <= 1.05) return 60
  if (ratio <= 1.10) return 40
  return 20
}

function sleepHoursComponent(hours: number | null): number {
  if (hours == null) return 50
  if (hours >= 7 && hours <= 9) return 100
  if ((hours >= 6 && hours < 7) || (hours > 9 && hours <= 10)) return 80
  if ((hours >= 5 && hours < 6) || (hours > 10 && hours <= 11)) return 60
  if ((hours >= 4 && hours < 5) || (hours > 11 && hours <= 12)) return 40
  return 20
}

function strainBalance(strain: number | null, recovery: number | null): number {
  if (strain == null || recovery == null) return 50
  // High recovery should support high strain. Define expected strain from
  // today's recovery, then score by absolute deviation.
  const expected = (recovery / 100) * 18
  const diff = strain - expected
  const abs = Math.abs(diff)
  if (abs < 3) return 100
  if (abs < 5) return 70
  if (diff > 0 && diff < 8) return 50
  return 30
}

function computeVitalityScore(args: {
  recovery: number | null
  sleepPerf: number | null
  sleepHours: number | null
  hrv: number | null
  hrvBaseline: number | null
  rhr: number | null
  rhrBaseline: number | null
  strain: number | null
}): number | null {
  // Need recovery at least to produce a meaningful score; otherwise null.
  if (args.recovery == null && args.sleepPerf == null) return null
  const recovery = args.recovery ?? 50
  const sleep_perf = args.sleepPerf ?? 50
  const hrv = hrvComponent(args.hrv, args.hrvBaseline)
  const rhr = rhrComponent(args.rhr, args.rhrBaseline)
  const sleep_hours = sleepHoursComponent(args.sleepHours)
  const strain_b = strainBalance(args.strain, args.recovery)
  return Math.round(
    recovery     * 0.30 +
    sleep_perf   * 0.20 +
    hrv          * 0.15 +
    rhr          * 0.15 +
    sleep_hours  * 0.10 +
    strain_b     * 0.10,
  )
}

function vitalityTier(score: number | null): string {
  if (score == null) return '—'
  if (score >= 80) return 'Peak'
  if (score >= 65) return 'Solid'
  if (score >= 50) return 'Tired'
  if (score >= 35) return 'Low'
  return 'Drained'
}

function dayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00`)
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
}

export default async function OuraPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: connection } = await supabase
    .from('wearable_connections')
    .select('connected_at, client_id, encrypted_access_token')
    .eq('user_id', user.id)
    .eq('provider', 'oura')
    .maybeSingle()

  const { data: rows } = await supabase
    .from('wearable_data')
    .select('date, recovery, hrv, rhr, sleep_perf, sleep_hours, strain, created_at')
    .eq('user_id', user.id)
    .eq('provider', 'oura')
    .order('date', { ascending: false })
    .limit(30)

  const list = rows ?? []
  const view: OuraView = {
    // Connected = we hold live OAuth tokens. A row can exist with only the
    // user's app keys (saved, not yet authorized) — that's hasCredentials.
    connected: !!connection?.encrypted_access_token,
    hasCredentials: !!connection?.client_id,
    // The callback URL the user must register in their own Oura app. Not a
    // secret — just our route — so it's safe to render.
    redirectUri: process.env.OURA_REDIRECT_URI ?? '',
    data: null,
  }

  if (list.length > 0) {
    const latest = list[0]
    const VALID_HRV = (v: number) => v >= 15 && v <= 150
    const VALID_RHR = (v: number) => v >= 30 && v <= 90

    // Baselines from the most-recent 14 valid days
    const hrvHistory: number[] = []
    const rhrHistory: number[] = []
    const sleepPerfHistory: number[] = []
    const strainHistory: number[] = []
    for (const r of list) {
      if (r.hrv != null) {
        const n = Number(r.hrv)
        if (VALID_HRV(n)) hrvHistory.push(n)
      }
      if (r.rhr != null) {
        const n = Number(r.rhr)
        if (VALID_RHR(n)) rhrHistory.push(n)
      }
      if (r.sleep_perf != null) sleepPerfHistory.push(Number(r.sleep_perf))
      if (r.strain != null) strainHistory.push(Number(r.strain))
    }
    const mean = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null
    const hrvBaseline = hrvHistory.length >= 3 ? mean(hrvHistory.slice(0, 14)) : null
    const rhrBaseline = rhrHistory.length >= 3 ? mean(rhrHistory.slice(0, 14)) : null
    const sleepPerfBaseline = sleepPerfHistory.length >= 3 ? mean(sleepPerfHistory.slice(0, 30)) : null
    const strainWeeklyAvg = strainHistory.length >= 2 ? mean(strainHistory.slice(0, 7)) : null

    // Recovery trend — last 7 days, oldest first. Pads with null if fewer.
    const trendRows = list.slice(0, 7).reverse()
    const recoveryTrend = trendRows
      .map(r => (r.recovery != null ? Number(r.recovery) : null))
      .filter((v): v is number => v != null)

    // Sleep debt — last 7 nights vs target
    const sleepDebt7d = list
      .slice(0, 7)
      .reverse()
      .filter(r => r.sleep_hours != null)
      .map(r => ({
        day: dayLabel(r.date),
        hours: Number(r.sleep_hours),
      }))

    const todayHrv = latest.hrv != null ? Number(latest.hrv) : null
    const hrvAnomalous = todayHrv != null && !VALID_HRV(todayHrv)

    const vitalityScore = computeVitalityScore({
      recovery: latest.recovery != null ? Number(latest.recovery) : null,
      sleepPerf: latest.sleep_perf != null ? Number(latest.sleep_perf) : null,
      sleepHours: latest.sleep_hours != null ? Number(latest.sleep_hours) : null,
      // Skip an anomalous reading from the score so it doesn't poison the result
      hrv: hrvAnomalous ? null : todayHrv,
      hrvBaseline,
      rhr: latest.rhr != null ? Number(latest.rhr) : null,
      rhrBaseline,
      strain: latest.strain != null ? Number(latest.strain) : null,
    })

    // Last synced minutes — from the most recent row's created_at timestamp.
    let lastSyncedMinutes: number | null = null
    if (latest.created_at) {
      const ts = new Date(latest.created_at).getTime()
      if (!isNaN(ts)) lastSyncedMinutes = Math.max(0, Math.round((Date.now() - ts) / 60000))
    }

    view.data = {
      date: latest.date,
      recovery: latest.recovery != null ? Number(latest.recovery) : null,
      hrv: todayHrv,
      rhr: latest.rhr != null ? Number(latest.rhr) : null,
      sleepPerf: latest.sleep_perf != null ? Number(latest.sleep_perf) : null,
      sleepHours: latest.sleep_hours != null ? Number(latest.sleep_hours) : null,
      strain: latest.strain != null ? Number(latest.strain) : null,
      hrvBaseline,
      rhrBaseline,
      sleepPerfBaseline,
      strainWeeklyAvg,
      hrvAnomalous,
      recoveryTrend,
      sleepDebt7d,
      sleepTargetHours: SLEEP_TARGET,
      vitalityScore,
      vitalityTier: vitalityTier(vitalityScore),
      lastSyncedMinutes,
      daysAvailable: list.length,
    }
  }

  return <OuraModule view={view} />
}
