/**
 * Server-side readings loader — the provider-agnostic body behind every band's
 * readings page. Extracted verbatim from the original WHOOP page so WHOOP keeps
 * behaving exactly as before; Oura (and future bands) reuse the same path by
 * passing their own provider id. The only per-provider differences are the
 * syncer and how a row's local date is derived (WHOOP labels by cycle tz offset;
 * Oura's `day` is already local), captured in the small maps below.
 *
 * Returns a discriminated result so the thin page just switches on `kind` and
 * renders — redirects stay in the page (where next/navigation wants them).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getVitalsQuiz, type VitalsPreferences } from '@/lib/preferences'
import { recalibrateActiveGoal, getActiveGoal } from '@/app/app/vitals/goalActions'
import type { WearableRow } from '@/app/app/vitals/VitalsDashboard'
import { dateKeyForOffset } from '@/lib/dates'
import { gatherSignal } from '@/lib/vitals/signalData'
import { computeVitalsScore, computeBaselines, computeScoreSeries } from '@/lib/vitals/score'
import { syncLatest as syncWhoop } from '@/lib/whoop/client'
import { syncLatest as syncOura } from '@/lib/oura/client'
import { WEARABLE_ORDER, type WearableProviderId } from '@/lib/vitals/wearables'
import type { VitalsGoal } from '@/lib/vitals/goals'
import type { Signal } from '@/lib/vitals/signal'
import type { VitalsScore, ScorePoint } from '@/lib/vitals/score'

const SLEEP_TARGET = 8

/** A band is "configured" when the env holds what its connect flow needs, so the
 *  gallery only offers "connect" for a band that can actually complete the flow
 *  (otherwise it shows "soon"). Server-only — reads server env.
 *
 *  WHOOP is bring-your-own-credentials (each user supplies their own app's
 *  client_id/secret), so it's gated on our shared callback URL — the one global
 *  piece the BYO flow still needs — not on a shared client_id we no longer have. */
const CLIENT_ID_ENV: Record<WearableProviderId, string | undefined> = {
  whoop: process.env.WHOOP_REDIRECT_URI,
  oura: process.env.OURA_CLIENT_ID,
  // 'manual' needs no OAuth app — it's always available; the user just checks in.
  manual: 'manual',
}

// A band shows in the gallery ONLY when a central Vitality app is configured
// for it (CLIENT_ID_ENV set) or it is manual. The bring-your-own-keys path is
// retired (Alex, 2026-07-12): no user is ever sent to paste their own keys.
// WHOOP has a central app (WHOOP_CLIENT_ID/SECRET) so it shows. Oura has none
// yet, so it stays hidden until an OURA_CLIENT_ID is set - the moment a central
// Oura app exists, Oura reappears with zero code change.
const BYO_CAPABLE: readonly WearableProviderId[] = []

export function getConfiguredProviders(): WearableProviderId[] {
  return WEARABLE_ORDER.filter(
    (id) => id === 'manual' || BYO_CAPABLE.includes(id) || !!CLIENT_ID_ENV[id],
  )
}

const SYNCERS: Record<WearableProviderId, (sb: SupabaseClient, userId: string) => Promise<{ synced: boolean; date: string | null }>> = {
  whoop: syncWhoop,
  oura: syncOura,
  // Manual data is written directly by the check-in / importer — nothing to pull.
  manual: async () => ({ synced: false, date: null }),
}

/** How each band's stored row maps to the user's local calendar day. WHOOP
 *  carries a per-cycle tz offset in `raw`; Oura's `day` is already local, so
 *  null falls back to server-local (correct for Oura and manual). */
const TZ_OFFSET_FROM_RAW: Record<WearableProviderId, (raw: unknown) => string | null> = {
  whoop: (raw) => (raw as { cycle?: { timezone_offset?: string } } | null)?.cycle?.timezone_offset ?? null,
  oura: () => null,
  manual: () => null,
}

export interface ReadingsReady {
  kind: 'ready'
  provider: WearableProviderId
  latest: WearableRow
  week: WearableRow[]
  history: WearableRow[]
  quiz: VitalsPreferences
  goal: VitalsGoal | null
  signal: Signal | null
  vitalsScore: VitalsScore | null
  scoreSeries: ScorePoint[]
}

export type ReadingsResult =
  | { kind: 'redirect'; to: string }
  | { kind: 'awaiting' }
  | ReadingsReady

export async function loadReadings(
  supabase: SupabaseClient,
  userId: string,
  provider: WearableProviderId,
): Promise<ReadingsResult> {
  // Connect-first: you connect at the gallery, not here. A token-less row
  // (WHOOP keys saved but not yet authorized) isn't connected — send them
  // back to the gallery to finish the connect. 'manual' has no OAuth token, so
  // skip the check: its real connection test is "are there any rows?" below
  // (history.length === 0 → awaiting).
  if (provider !== 'manual') {
    const { data: conn } = await supabase
      .from('wearable_connections')
      .select('provider, encrypted_access_token')
      .eq('user_id', userId)
      .eq('provider', provider)
      .maybeSingle()
    if (!conn || !conn.encrypted_access_token) return { kind: 'redirect', to: '/app/vitals' }
  }

  // Setup gate: metrics stay walled behind the quiz. A connected-but-unquizzed
  // user is mid-flow — send them through the paired hop into the quiz.
  const quiz = await getVitalsQuiz(supabase, userId)
  if (!quiz) return { kind: 'redirect', to: '/app/vitals/paired' }

  // Self-healing freshness net (mirrors the daily cron). If today's reading
  // isn't in yet, pull it now — best-effort + time-boxed so a slow/failed
  // wearable call never blocks the page; it falls back to the last good data.
  const { data: latestRow } = await supabase
    .from('wearable_data')
    .select('date, raw, recovery')
    .eq('user_id', userId)
    .eq('provider', provider)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  const lastOffset = TZ_OFFSET_FROM_RAW[provider](latestRow?.raw ?? null)
  const todayKey = dateKeyForOffset(new Date(), lastOffset)
  // Re-sync when there's no row for today yet, OR when today's recovery hasn't
  // finalized (provisional → recovery null), so the user never sticks on a
  // pending/blank reading.
  if (!latestRow || latestRow.date < todayKey || latestRow.recovery == null) {
    await Promise.race([
      SYNCERS[provider](supabase, userId).catch(() => {}),
      new Promise<void>((resolve) => setTimeout(resolve, 8000)),
    ])
  }

  const { data: rows } = await supabase
    .from('wearable_data')
    .select('date, hrv, rhr, sleep_perf, sleep_hours, recovery, strain, raw')
    .eq('user_id', userId)
    .eq('provider', provider)
    .order('date', { ascending: false })
    .limit(90)

  const history = (rows ?? []) as WearableRow[]
  if (history.length === 0) return { kind: 'awaiting' }
  const week = history.slice(0, 7)

  // Recalibrate (provisional → sharpen) on each load. Safe + idempotent.
  let goal: VitalsGoal | null = null
  try {
    goal = await recalibrateActiveGoal(supabase, userId, provider)
  } catch {
    goal = await getActiveGoal(supabase, userId).catch(() => null)
  }

  // The fused daily read across every source. Best-effort: null if nothing to
  // fuse, and the dashboard just skips the section.
  const signal = await gatherSignal(supabase, userId, todayKey, { provider })

  // The Vitals Score: weighted 0-100 with personal HRV/RHR baselines + the
  // per-day series for the history graph. Pure + compute-on-read.
  const baselines = computeBaselines(history)
  const today = history[0]
  const vitalsScore = computeVitalsScore({
    recovery: today.recovery, sleepPerf: today.sleep_perf, hrv: today.hrv, rhr: today.rhr,
    sleepHours: today.sleep_hours, strain: today.strain,
    hrvBaseline: baselines.hrv, rhrBaseline: baselines.rhr, sleepTarget: SLEEP_TARGET,
  })
  const scoreSeries = computeScoreSeries(history, baselines, SLEEP_TARGET)

  return {
    kind: 'ready', provider,
    latest: week[0], week, history, quiz, goal, signal, vitalsScore, scoreSeries,
  }
}
