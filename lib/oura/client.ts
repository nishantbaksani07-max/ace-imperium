/**
 * Oura OAuth + API client.
 *
 * Talks to Oura's public Cloud API v2 (https://cloud.ouraring.com/v2/docs).
 * Polling only - Oura doesn't offer webhooks. Server-only.
 *
 * Tokens persist in `wearable_connections` (user_id + provider='oura').
 * Same plaintext-for-v1 caveat as the Whoop client.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getLocalDateKey } from '@/lib/dates'
import { sealSecret, openSecret } from '@/lib/wearables/secretbox'
import { normalizeOuraMetrics } from './normalize'

const OURA_API_BASE = 'https://api.ouraring.com/v2'
const OURA_AUTH_URL = 'https://cloud.ouraring.com/oauth/authorize'
const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token'

export const OURA_SCOPES = [
  'daily',
  'personal',
  'heartrate',
].join(' ')

/**
 * Our shared Oura OAuth callback - the same for every user, registered in each
 * user's own Oura app. Prefer an explicit OURA_REDIRECT_URI override; else derive
 * it from NEXT_PUBLIC_APP_URL. Fail loudly if neither is set, rather than silently
 * building a broken `redirect_uri` (the old `!` would send `undefined`).
 */
export function ouraRedirectUri(): string {
  const explicit = process.env.OURA_REDIRECT_URI
  if (explicit) return explicit
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl) return `${appUrl.replace(/\/$/, '')}/api/oura/callback`
  throw new Error('Oura redirect URI unavailable: set OURA_REDIRECT_URI or NEXT_PUBLIC_APP_URL')
}

// Oura is bring-your-own-credentials: each user supplies the client_id /
// client_secret of their own free Oura developer app (the shared app is capped
// while it waits on Oura's approval). The redirect_uri is still ours - the same
// Vitality callback for every user, which they register in their own Oura app.
export function buildAuthUrl(state: string, clientId: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: ouraRedirectUri(),
    scope: OURA_SCOPES,
    state,
  })
  return `${OURA_AUTH_URL}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: ouraRedirectUri(),
    client_id: clientId,
    client_secret: clientSecret,
  })
  const res = await fetch(OURA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Oura token exchange failed (${res.status}): ${text}`)
  }
  return res.json()
}

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })
  const res = await fetch(OURA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Oura token refresh failed (${res.status}): ${text}`)
  }
  return res.json()
}

export interface OuraCredentials { clientId: string; clientSecret: string }

/**
 * The Oura developer-app credentials to authorize this user against. Prefers the
 * user's own app keys (bring-your-own, saved before connect); falls back to a
 * shared OURA_CLIENT_ID/SECRET env app if one is configured. Returns null when
 * the user has neither - so the connect route can prompt them to add their keys.
 */
export async function getOuraCredentials(
  supabase: SupabaseClient,
  userId: string,
): Promise<OuraCredentials | null> {
  const { data } = await supabase
    .from('wearable_connections')
    .select('client_id, client_secret')
    .eq('user_id', userId)
    .eq('provider', 'oura')
    .maybeSingle()

  if (data?.client_id && data?.client_secret) {
    const clientSecret = openSecret(data.client_secret)
    if (clientSecret) return { clientId: data.client_id, clientSecret }
  }

  // Fall back to a shared env app if one exists (e.g. the ~10-user dev app).
  const envId = process.env.OURA_CLIENT_ID
  const envSecret = process.env.OURA_CLIENT_SECRET
  if (envId && envSecret) return { clientId: envId, clientSecret: envSecret }

  return null
}

export async function getValidAccessToken(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: conn } = await supabase
    .from('wearable_connections')
    .select('encrypted_access_token, encrypted_refresh_token, access_token_expires_at, client_id, client_secret')
    .eq('user_id', userId)
    .eq('provider', 'oura')
    .maybeSingle()

  if (!conn || !conn.encrypted_access_token || !conn.access_token_expires_at) return null

  const expiresAt = new Date(conn.access_token_expires_at).getTime()
  const skewMs = 60_000
  if (expiresAt - Date.now() > skewMs) {
    return openSecret(conn.encrypted_access_token)
  }

  // Refresh needs an app's credentials: the user's own keys when they brought
  // them, else the shared env app. If neither is present, there's nothing to
  // refresh with, so report no token.
  const clientId = conn.client_id || process.env.OURA_CLIENT_ID
  const clientSecret = openSecret(conn.client_secret) || process.env.OURA_CLIENT_SECRET
  const refreshToken = openSecret(conn.encrypted_refresh_token)
  if (!clientId || !clientSecret || !refreshToken) return null

  try {
    const refreshed = await refreshAccessToken(refreshToken, clientId, clientSecret)
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    await supabase
      .from('wearable_connections')
      .update({
        encrypted_access_token: sealSecret(refreshed.access_token),
        encrypted_refresh_token: sealSecret(refreshed.refresh_token),
        access_token_expires_at: newExpiresAt,
      })
      .eq('user_id', userId)
      .eq('provider', 'oura')
    return refreshed.access_token
  } catch (e) {
    console.error('[Oura] refresh failed', e)
    return null
  }
}

async function ouraFetch<T = unknown>(token: string, path: string): Promise<T> {
  const res = await fetch(`${OURA_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Oura GET ${path} ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

interface OuraPersonalInfo { id: string; email?: string }
export async function fetchOuraProfile(token: string): Promise<{ user_id: string }> {
  const data = await ouraFetch<OuraPersonalInfo>(token, '/usercollection/personal_info')
  return { user_id: data.id }
}

interface OuraCollection<T> { data: T[]; next_token?: string | null }

interface OuraDailyReadiness {
  id: string
  day: string
  score: number | null
  contributors?: { resting_heart_rate?: number | null; hrv_balance?: number | null }
}

interface OuraDailySleep {
  id: string
  day: string
  score: number | null
}

interface OuraSleep {
  id: string
  day: string
  type?: string                      // 'long_sleep' | 'late_nap' | 'early_nap' | 'rest'
  total_sleep_duration: number       // seconds
  time_in_bed: number                // seconds
  efficiency: number | null
  average_hrv: number | null
  lowest_heart_rate: number | null
  average_heart_rate: number | null
}

/**
 * Pull yesterday's daily summary (Oura computes overnight, lands AM)
 * + last sleep session, upsert one normalized row to wearable_data.
 * Recovery maps to readiness score. Strain stays null (no Oura equivalent).
 */
export async function syncLatest(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ synced: boolean; date: string | null }> {
  const token = await getValidAccessToken(supabase, userId)
  if (!token) throw new Error('No valid Oura token for user')

  // Window: yesterday & today (Oura readiness is for yesterday's sleep,
  // surfaced after wake - we want the most-recent night, so we pull both).
  const today = getLocalDateKey()
  const yesterday = (() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return getLocalDateKey(d)
  })()
  const range = `start_date=${yesterday}&end_date=${today}`

  const [readinessRes, sleepRes, dailySleepRes] = await Promise.all([
    ouraFetch<OuraCollection<OuraDailyReadiness>>(token, `/usercollection/daily_readiness?${range}`).catch((e) => {
      console.error('[Oura] daily_readiness failed:', e?.message || e)
      return null
    }),
    ouraFetch<OuraCollection<OuraSleep>>(token, `/usercollection/sleep?${range}`).catch((e) => {
      console.error('[Oura] sleep failed:', e?.message || e)
      return null
    }),
    ouraFetch<OuraCollection<OuraDailySleep>>(token, `/usercollection/daily_sleep?${range}`).catch((e) => {
      console.error('[Oura] daily_sleep failed:', e?.message || e)
      return null
    }),
  ])

  // Latest daily summary from each collection (one row per day; the window is
  // yesterday+today, so the last entry is the most recent day).
  const last = <T extends { day: string }>(col: OuraCollection<T> | null): T | null =>
    col?.data?.length ? col.data[col.data.length - 1] : null

  const readiness = last(readinessRes)
  const dailySleep = last(dailySleepRes)
  // For sleep, pick the most-recent MAIN overnight session, never a nap - a
  // late_nap is often the last entry in the window and would otherwise stand in
  // for the night's HRV/RHR/hours. (normalize also guards this; belt + braces.)
  const sleepSessions = sleepRes?.data ?? []
  const sleep =
    [...sleepSessions].reverse().find((s) => s.type == null || s.type === 'long_sleep') ?? null

  if (!readiness && !sleep && !dailySleep) {
    return { synced: false, date: null }
  }

  const dateKey = sleep?.day || readiness?.day || dailySleep?.day || today

  // Trust boundary: only finalized readiness + the real overnight sleep survive;
  // a not-yet-scored morning readiness comes back null + provisional (see
  // normalize.ts), so we never surface a wrong/blank Oura number.
  const m = normalizeOuraMetrics(readiness, sleep, dailySleep)

  // Never clobber a previously-finalized value with a provisional null. Merge
  // field-by-field against any existing row for this date, so good data is only
  // ever replaced by newer good data, not by a pending blank.
  const { data: existing } = await supabase
    .from('wearable_data')
    .select('hrv, rhr, sleep_perf, sleep_hours, recovery')
    .eq('user_id', userId)
    .eq('date', dateKey)
    .eq('provider', 'oura')
    .maybeSingle()

  const { error } = await supabase
    .from('wearable_data')
    .upsert(
      {
        user_id: userId,
        date: dateKey,
        provider: 'oura',
        hrv: m.hrv ?? existing?.hrv ?? null,
        rhr: m.rhr ?? existing?.rhr ?? null,
        sleep_perf: m.sleep_perf ?? existing?.sleep_perf ?? null,
        sleep_hours: m.sleep_hours ?? existing?.sleep_hours ?? null,
        recovery: m.recovery ?? existing?.recovery ?? null,
        strain: null,   // Oura has no native strain
        raw: { readiness, sleep, dailySleep },
      },
      { onConflict: 'user_id,date,provider' },
    )

  if (error) throw error
  return { synced: true, date: dateKey }
}

// ============================================================
// TRAIN 5: history backfill - the score history line on day one
// ============================================================

/** Request budget: pages per collection. Oura pages are large (a 30-day daily
 *  window fits in one), so 3 collections x 3 pages = at most 9 calls. */
const BACKFILL_MAX_PAGES = 3

/**
 * Collect up to BACKFILL_MAX_PAGES of one Oura collection over a
 * start_date/end_date window, following `next_token`. Best-effort: a failed
 * page logs and returns what we have - partial history is still a win. `ok`
 * is true once ANY page fetched successfully (Oura was reachable), so a
 * caller can tell a real-but-empty attempt from a total outage/token blip.
 */
async function ouraCollectAll<T>(token: string, path: string, range: string): Promise<{ records: T[]; ok: boolean }> {
  const records: T[] = []
  let ok = false
  let nextToken: string | null | undefined
  for (let page = 0; page < BACKFILL_MAX_PAGES; page++) {
    const qs = nextToken ? `${range}&next_token=${encodeURIComponent(nextToken)}` : range
    try {
      const res = await ouraFetch<OuraCollection<T>>(token, `${path}?${qs}`)
      ok = true
      records.push(...(res.data ?? []))
      nextToken = res.next_token || undefined
    } catch (e) {
      console.error(`[Oura] backfill ${path} page ${page + 1} failed:`, e?.toString?.() ?? e)
      break
    }
    if (!nextToken) break
  }
  return { records, ok }
}

/**
 * Pull ~`days` days of readiness / sleep / daily-sleep history and upsert one
 * normalized row per day into `wearable_data` (RLS, provider 'oura') - the
 * exact shape syncLatest writes. Same trust boundary (normalizeOuraMetrics)
 * per day: only finalized readiness and the real overnight session survive.
 * Field-by-field coalesce against existing rows in ONE ranged read, so a
 * backfill never clobbers good data with a blank.
 */
export async function backfillHistory(
  supabase: SupabaseClient,
  userId: string,
  days = 30,
): Promise<{ upserted: number; providerReached: boolean }> {
  const token = await getValidAccessToken(supabase, userId)
  if (!token) throw new Error('No valid Oura token for user')

  const today = getLocalDateKey()
  const start = (() => {
    const d = new Date()
    d.setDate(d.getDate() - days)
    return getLocalDateKey(d)
  })()
  const range = `start_date=${start}&end_date=${today}`

  const [readinessC, sleepC, dailySleepC] = await Promise.all([
    ouraCollectAll<OuraDailyReadiness>(token, '/usercollection/daily_readiness', range),
    ouraCollectAll<OuraSleep>(token, '/usercollection/sleep', range),
    ouraCollectAll<OuraDailySleep>(token, '/usercollection/daily_sleep', range),
  ])
  // Oura answered at least one collection: the attempt was real, even if empty.
  const providerReached = readinessC.ok || sleepC.ok || dailySleepC.ok
  const readinessAll = readinessC.records
  const sleepAll = sleepC.records
  const dailySleepAll = dailySleepC.records

  // Index per day. Readiness / daily-sleep are one row per day already; for
  // sleep sessions keep the LONGEST main overnight session of each day, never
  // a nap (same rule as syncLatest + normalize, belt and braces).
  const readinessByDay = new Map<string, OuraDailyReadiness>()
  for (const r of readinessAll) if (r.day) readinessByDay.set(r.day, r)
  const dailySleepByDay = new Map<string, OuraDailySleep>()
  for (const d of dailySleepAll) if (d.day) dailySleepByDay.set(d.day, d)
  const sleepByDay = new Map<string, OuraSleep>()
  for (const s of sleepAll) {
    if (!s.day || (s.type != null && s.type !== 'long_sleep')) continue
    const cur = sleepByDay.get(s.day)
    if (!cur || (s.total_sleep_duration ?? 0) > (cur.total_sleep_duration ?? 0)) sleepByDay.set(s.day, s)
  }

  const dayKeys = [...new Set([...readinessByDay.keys(), ...sleepByDay.keys(), ...dailySleepByDay.keys()])]
  const byDate = new Map<string, { m: ReturnType<typeof normalizeOuraMetrics>; raw: unknown }>()
  for (const day of dayKeys) {
    const readiness = readinessByDay.get(day) ?? null
    const sleep = sleepByDay.get(day) ?? null
    const dailySleep = dailySleepByDay.get(day) ?? null
    const m = normalizeOuraMetrics(readiness, sleep, dailySleep)
    // A day where nothing survived the trust boundary writes nothing.
    if (m.hrv == null && m.rhr == null && m.recovery == null && m.sleep_perf == null && m.sleep_hours == null) continue
    byDate.set(day, { m, raw: { readiness, sleep, dailySleep } })
  }
  if (!byDate.size) return { upserted: 0, providerReached }

  const dateKeys = [...byDate.keys()]
  const { data: existingRows } = await supabase
    .from('wearable_data')
    .select('date, hrv, rhr, sleep_perf, sleep_hours, recovery')
    .eq('user_id', userId)
    .eq('provider', 'oura')
    .in('date', dateKeys)
  const existingByDate = new Map((existingRows ?? []).map((r) => [String(r.date), r]))

  const upserts = dateKeys.map((date) => {
    const { m, raw } = byDate.get(date)!
    const existing = existingByDate.get(date)
    return {
      user_id: userId,
      date,
      provider: 'oura',
      hrv: m.hrv ?? existing?.hrv ?? null,
      rhr: m.rhr ?? existing?.rhr ?? null,
      sleep_perf: m.sleep_perf ?? existing?.sleep_perf ?? null,
      sleep_hours: m.sleep_hours ?? existing?.sleep_hours ?? null,
      recovery: m.recovery ?? existing?.recovery ?? null,
      strain: null, // Oura has no native strain
      raw,
    }
  })
  const { error } = await supabase
    .from('wearable_data')
    .upsert(upserts, { onConflict: 'user_id,date,provider' })
  if (error) throw error
  return { upserted: upserts.length, providerReached }
}

/**
 * ONE-TIME catchup, safe to call on every sync: runs backfillHistory only when
 * the user has a live Oura connection, fewer than ~7 stored days, and has never
 * been backfilled (`wearable_connections.history_backfilled_at` is the marker,
 * stamped once a REAL attempt has run - enough history already, or Oura
 * actually answered the pull - so this never loops, while a total outage/token
 * blip leaves the marker unset and the next sync retries). Fully best-effort:
 * any failure (including the marker column not existing yet) logs and returns
 * without touching the caller's sync result.
 */
export async function maybeBackfillHistory(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ ran: boolean; upserted: number }> {
  try {
    const { data: conn, error } = await supabase
      .from('wearable_connections')
      .select('history_backfilled_at, encrypted_access_token')
      .eq('user_id', userId)
      .eq('provider', 'oura')
      .maybeSingle()
    if (error || !conn?.encrypted_access_token || conn.history_backfilled_at) return { ran: false, upserted: 0 }

    const { count } = await supabase
      .from('wearable_data')
      .select('date', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('provider', 'oura')

    let upserted = 0
    // The count>=7 path needs no pull, so stamping is honest; a pull only
    // counts as the one shot when Oura was actually reachable.
    let attemptWasReal = true
    if ((count ?? 0) < 7) {
      const res = await backfillHistory(supabase, userId)
      upserted = res.upserted
      attemptWasReal = res.providerReached
    }
    if (attemptWasReal) {
      await supabase
        .from('wearable_connections')
        .update({ history_backfilled_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('provider', 'oura')
    }
    return { ran: true, upserted }
  } catch (e) {
    console.error('[Oura] history catchup failed:', e instanceof Error ? e.message : e)
    return { ran: false, upserted: 0 }
  }
}
