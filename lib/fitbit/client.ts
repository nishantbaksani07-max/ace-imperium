/**
 * Fitbit OAuth + API client.
 *
 * Talks to Fitbit's public Web API (https://dev.fitbit.com/build/reference/web-api/).
 * All calls go through here so the rest of the app never sees raw Fitbit
 * payloads or bearer tokens. Server-only — never import into a Client
 * Component.
 *
 * Tokens are persisted in `wearable_connections` (one row per user, keyed
 * by user_id + provider='fitbit'). Same plaintext-for-v1 caveat as the
 * Whoop client — RLS keeps these scoped, encrypt at rest later.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getLocalDateKey } from '@/lib/dates'

const FITBIT_API_BASE = 'https://api.fitbit.com/1'
const FITBIT_API_BASE_USER = 'https://api.fitbit.com/1/user/-'
const FITBIT_AUTH_URL = 'https://www.fitbit.com/oauth2/authorize'
const FITBIT_TOKEN_URL = 'https://api.fitbit.com/oauth2/token'

/**
 * Scopes we request. Fitbit requires explicit per-data-type opt-in.
 * `heartrate` covers RHR + HRV (Charge 5+ / Sense). `sleep` covers
 * efficiency + stages. `profile` is needed to get the Fitbit user id
 * we store as provider_user_id.
 */
export const FITBIT_SCOPES = [
  'heartrate',
  'sleep',
  'activity',
  'profile',
].join(' ')

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.FITBIT_CLIENT_ID!,
    redirect_uri: process.env.FITBIT_REDIRECT_URI!,
    scope: FITBIT_SCOPES,
    state,
    expires_in: '604800', // 7 days (Fitbit max for non-PKCE flow)
  })
  return `${FITBIT_AUTH_URL}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope: string
  user_id?: string
}

function basicAuthHeader(): string {
  const id = process.env.FITBIT_CLIENT_ID!
  const secret = process.env.FITBIT_CLIENT_SECRET!
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64')
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.FITBIT_REDIRECT_URI!,
    client_id: process.env.FITBIT_CLIENT_ID!,
  })
  const res = await fetch(FITBIT_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(),
    },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Fitbit token exchange failed (${res.status}): ${text}`)
  }
  return res.json()
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  const res = await fetch(FITBIT_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(),
    },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Fitbit token refresh failed (${res.status}): ${text}`)
  }
  return res.json()
}

export async function getValidAccessToken(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: conn } = await supabase
    .from('wearable_connections')
    .select('encrypted_access_token, encrypted_refresh_token, access_token_expires_at')
    .eq('user_id', userId)
    .eq('provider', 'fitbit')
    .maybeSingle()

  if (!conn) return null

  const expiresAt = new Date(conn.access_token_expires_at).getTime()
  const skewMs = 60_000
  if (expiresAt - Date.now() > skewMs) {
    return conn.encrypted_access_token
  }

  try {
    const refreshed = await refreshAccessToken(conn.encrypted_refresh_token)
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    await supabase
      .from('wearable_connections')
      .update({
        encrypted_access_token: refreshed.access_token,
        encrypted_refresh_token: refreshed.refresh_token,
        access_token_expires_at: newExpiresAt,
      })
      .eq('user_id', userId)
      .eq('provider', 'fitbit')
    return refreshed.access_token
  } catch (e) {
    console.error('[Fitbit] refresh failed', e)
    return null
  }
}

async function fitbitFetch<T = unknown>(token: string, path: string): Promise<T> {
  const res = await fetch(`${FITBIT_API_BASE_USER}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Fitbit GET ${path} ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

interface FitbitProfile { user: { encodedId: string; firstName?: string; lastName?: string } }
export async function fetchFitbitProfile(token: string): Promise<{ user_id: string }> {
  const data = await fitbitFetch<FitbitProfile>(token, '/profile.json')
  return { user_id: data.user.encodedId }
}

interface SleepResponse {
  sleep: Array<{
    dateOfSleep: string
    duration: number
    efficiency: number
    minutesAsleep: number
    timeInBed: number
  }>
}

interface HrvResponse {
  hrv: Array<{
    dateTime: string
    value: { dailyRmssd: number; deepRmssd: number }
  }>
}

interface RhrResponse {
  'activities-heart': Array<{
    dateTime: string
    value: { restingHeartRate?: number }
  }>
}

/**
 * Pull the last 24h of sleep + HRV + RHR and upsert one normalized row
 * into wearable_data. Fitbit doesn't expose a unified "recovery score" —
 * we leave that null and let the Vitality Score formula fall back to
 * its HRV/RHR/sleep components.
 */
export async function syncLatest(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ synced: boolean; date: string | null }> {
  const token = await getValidAccessToken(supabase, userId)
  if (!token) throw new Error('No valid Fitbit token for user')

  const today = getLocalDateKey()

  const [sleepRes, hrvRes, rhrRes] = await Promise.all([
    fitbitFetch<SleepResponse>(token, `/sleep/date/${today}.json`).catch((e) => {
      console.error('[Fitbit] /sleep failed:', e?.message || e)
      return null
    }),
    fitbitFetch<HrvResponse>(token, `/hrv/date/${today}.json`).catch((e) => {
      console.error('[Fitbit] /hrv failed:', e?.message || e)
      return null
    }),
    fitbitFetch<RhrResponse>(token, `/activities/heart/date/${today}/1d.json`).catch((e) => {
      console.error('[Fitbit] /heart failed:', e?.message || e)
      return null
    }),
  ])

  const sleep = sleepRes?.sleep?.[0] ?? null
  const hrv = hrvRes?.hrv?.[0]?.value?.dailyRmssd ?? null
  const rhr = rhrRes?.['activities-heart']?.[0]?.value?.restingHeartRate ?? null

  if (!sleep && hrv == null && rhr == null) {
    return { synced: false, date: null }
  }

  const dateKey = sleep?.dateOfSleep || today
  const sleepHours = sleep ? Math.round((sleep.minutesAsleep / 60) * 100) / 100 : null
  const sleepPerf = sleep?.efficiency ?? null

  const { error } = await supabase
    .from('wearable_data')
    .upsert(
      {
        user_id: userId,
        date: dateKey,
        provider: 'fitbit',
        hrv,
        rhr,
        sleep_perf: sleepPerf,
        sleep_hours: sleepHours,
        recovery: null,   // Fitbit has no native recovery score
        strain: null,     // Fitbit has no native strain score
        raw: { sleep, hrv: hrvRes?.hrv?.[0] ?? null, rhr: rhrRes?.['activities-heart']?.[0] ?? null },
      },
      { onConflict: 'user_id,date,provider' },
    )

  if (error) throw error
  return { synced: true, date: dateKey }
}
