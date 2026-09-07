/**
 * Whoop OAuth + API client.
 *
 * Talks to Whoop's public developer API (https://developer.whoop.com).
 * All calls go through here so the rest of the app never sees raw Whoop
 * payloads or bearer tokens. Server-only - never import into a Client
 * Component.
 *
 * Tokens are persisted in `wearable_connections` (one row per user, keyed
 * by user_id + provider='whoop'). The column names say `encrypted_*` but
 * BUILD13 stores them as plaintext for v1; rotating to real encryption-
 * at-rest is a pre-launch hardening task. RLS already restricts each row
 * to its owning user, and these tokens never leave the server.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { dateKeyForOffset } from '@/lib/dates'
import { sealSecret, openSecret } from '@/lib/wearables/secretbox'
import { normalizeWhoopMetrics, type WhoopRecovery, type WhoopSleep, type WhoopCycle } from './normalize'

const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer/v2'
// Cycle endpoint is one of the few that still has a v1 collection route; v2
// works too but a couple of fields differ between versions, and BUILD13 was
// validated against v1 cycle shape. Keep cycle pinned to v1 until we have
// time to refactor for v2 cycle changes.
const WHOOP_API_BASE_V1 = 'https://api.prod.whoop.com/developer/v1'
const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth'
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'

/**
 * Scopes we request. `offline` is required to get a refresh_token -
 * without it Whoop only returns a 1h access_token and the user has to
 * re-consent every hour.
 */
export const WHOOP_SCOPES = [
  'read:recovery',
  'read:sleep',
  'read:workout',
  'read:cycles',
  'read:profile',
  'read:body_measurement',
  'offline',
].join(' ')

/**
 * Our shared WHOOP OAuth callback - the same for every user, registered in each
 * user's own WHOOP app. Prefer an explicit WHOOP_REDIRECT_URI override; else
 * derive it from NEXT_PUBLIC_APP_URL. Fail loudly if neither is set, rather than
 * silently building a broken `redirect_uri` (the old `!` would send `undefined`).
 */
export function whoopRedirectUri(): string {
  const explicit = process.env.WHOOP_REDIRECT_URI
  if (explicit) return explicit
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl) return `${appUrl.replace(/\/$/, '')}/api/whoop/callback`
  throw new Error('WHOOP redirect URI unavailable: set WHOOP_REDIRECT_URI or NEXT_PUBLIC_APP_URL')
}

// WHOOP is bring-your-own-credentials: each user supplies the client_id /
// client_secret of their own WHOOP developer app (we never get prod approval
// for one shared app). The redirect_uri is still ours - the same Vitality
// callback for every user, which they register in their own WHOOP app.
export function buildAuthUrl(state: string, clientId: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: whoopRedirectUri(),
    scope: WHOOP_SCOPES,
    state,
  })
  return `${WHOOP_AUTH_URL}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope: string
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: whoopRedirectUri(),
    client_id: clientId,
    client_secret: clientSecret,
  })
  const res = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Whoop token exchange failed (${res.status}): ${text}`)
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
    scope: WHOOP_SCOPES,
  })
  const res = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Whoop token refresh failed (${res.status}): ${text}`)
  }
  return res.json()
}

export interface WhoopCredentials { clientId: string; clientSecret: string }

/**
 * The WHOOP developer-app credentials this user brought, if any. Used by the
 * connect route to build the authorize URL.
 *
 * CENTRAL-APP DEFAULT (Alex, 2026-07-12): every user rides the ONE Vitality
 * WHOOP app in env (WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET), so a normal user
 * just taps Connect -> Allow, no developer account, no keys. A user's own
 * saved keys still win if present (the old bring-your-own path, now optional
 * and unadvertised). Mirrors getOuraCredentials. Returns null only when
 * neither a per-user nor a central app is configured.
 */
export async function getWhoopCredentials(
  supabase: SupabaseClient,
  userId: string,
): Promise<WhoopCredentials | null> {
  const { data } = await supabase
    .from('wearable_connections')
    .select('client_id, client_secret')
    .eq('user_id', userId)
    .eq('provider', 'whoop')
    .maybeSingle()

  if (data?.client_id && data?.client_secret) {
    const clientSecret = openSecret(data.client_secret)
    if (clientSecret) return { clientId: data.client_id, clientSecret }
  }

  const envId = process.env.WHOOP_CLIENT_ID
  const envSecret = process.env.WHOOP_CLIENT_SECRET
  if (envId && envSecret) return { clientId: envId, clientSecret: envSecret }
  return null
}

/**
 * Returns a non-expired access token for the user, refreshing if needed.
 * Returns null if the user has no Whoop connection or the refresh fails.
 */
export async function getValidAccessToken(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: conn } = await supabase
    .from('wearable_connections')
    .select('encrypted_access_token, encrypted_refresh_token, access_token_expires_at, client_id, client_secret')
    .eq('user_id', userId)
    .eq('provider', 'whoop')
    .maybeSingle()

  if (!conn || !conn.encrypted_access_token || !conn.access_token_expires_at) return null

  const expiresAt = new Date(conn.access_token_expires_at).getTime()
  const skewMs = 60_000
  if (expiresAt - Date.now() > skewMs) {
    return openSecret(conn.encrypted_access_token)
  }

  // Refresh needs the app credentials the token was minted against: the user's
  // own saved keys if present, else the central Vitality app in env (the
  // default path since 2026-07-12). Only bail when neither exists.
  const refreshToken = openSecret(conn.encrypted_refresh_token)
  if (!refreshToken) return null
  let clientId = conn.client_id as string | null
  let clientSecret = conn.client_id ? openSecret(conn.client_secret) : null
  if (!clientId || !clientSecret) {
    clientId = process.env.WHOOP_CLIENT_ID ?? null
    clientSecret = process.env.WHOOP_CLIENT_SECRET ?? null
  }
  if (!clientId || !clientSecret) return null

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
      .eq('provider', 'whoop')
    return refreshed.access_token
  } catch (e) {
    console.error('[Whoop] refresh failed', e)
    return null
  }
}

async function whoopFetch<T = unknown>(token: string, path: string, opts?: { v1?: boolean }): Promise<T> {
  const base = opts?.v1 ? WHOOP_API_BASE_V1 : WHOOP_API_BASE
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Whoop GET ${path} ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

interface WhoopCollection<T> { records: T[]; next_token?: string }

// WhoopRecovery / WhoopSleep / WhoopCycle moved to ./normalize (the unit-tested
// trust boundary that drops provisional / cross-cycle readings).

interface WhoopProfile { user_id: number; email?: string; first_name?: string; last_name?: string }

export async function fetchWhoopProfile(token: string): Promise<WhoopProfile> {
  return whoopFetch<WhoopProfile>(token, '/user/profile/basic')
}

/**
 * Pull the latest cycle / recovery / sleep and upsert a normalized row
 * into `wearable_data`. Returns the date key written (or null if Whoop
 * had nothing to give us).
 *
 * Date key: derived from cycle.start (Whoop's notion of "today") and labelled
 * in the USER's local day via Whoop's per-reading `timezone_offset`, so a user
 * in any timezone gets the correct calendar date (not the server's UTC date).
 */
export async function syncLatest(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ synced: boolean; date: string | null }> {
  const token = await getValidAccessToken(supabase, userId)
  if (!token) throw new Error('No valid Whoop token for user')

  const [recoveryRes, sleepRes, cycleRes] = await Promise.all([
    whoopFetch<WhoopCollection<WhoopRecovery>>(token, '/recovery?limit=1').catch((e) => {
      console.error('[Whoop] /recovery failed:', e?.message || e)
      return null
    }),
    whoopFetch<WhoopCollection<WhoopSleep>>(token, '/activity/sleep?limit=1').catch((e) => {
      console.error('[Whoop] /activity/sleep failed:', e?.message || e)
      return null
    }),
    whoopFetch<WhoopCollection<WhoopCycle>>(token, '/cycle?limit=1', { v1: true }).catch((e) => {
      console.error('[Whoop] /cycle failed:', e?.message || e)
      return null
    }),
  ])

  const recovery = recoveryRes?.records?.[0] ?? null
  const sleep = sleepRes?.records?.[0] ?? null
  const cycle = cycleRes?.records?.[0] ?? null

  // HONESTY GUARD (2026-07-12): when every endpoint failed, this sync did not
  // happen - throw so callers (the cron's synced/failed tally, the Sync
  // button's error toast) tell the truth. The launch-week bug: a dead token
  // 401'd all three calls yet the cron counted the user "synced" and their
  // data silently froze. Partial answers still sync (one good endpoint is a
  // real read); only total failure is a failure.
  if (recoveryRes === null && sleepRes === null && cycleRes === null) {
    throw new Error('whoop_unreachable_or_unauthorized')
  }

  const dateSource = cycle?.start || recovery?.created_at || sleep?.start
  if (!dateSource) return { synced: false, date: null }
  // Label the reading by the USER's local day using WHOOP's own timezone_offset
  // for this reading, not the server's UTC day. Falls back to server-local when
  // WHOOP omits the offset, so this never regresses.
  const tzOffset = cycle?.timezone_offset ?? sleep?.timezone_offset ?? null
  const dateKey = dateKeyForOffset(new Date(dateSource), tzOffset)

  // Trust boundary: only finalized, same-cycle WHOOP numbers (see normalize.ts).
  // Provisional / cross-cycle readings come back null, so we never surface a
  // wrong morning number; the page keeps refreshing until WHOOP finalizes.
  const m = normalizeWhoopMetrics(recovery, sleep, cycle)

  // Never clobber a previously-finalized value with a provisional null. Merge
  // field-by-field against any existing row for this date (coalesce), so good
  // data is only ever replaced by newer good data, not by a pending blank.
  const { data: existing } = await supabase
    .from('wearable_data')
    .select('hrv, rhr, sleep_perf, sleep_hours, recovery, strain')
    .eq('user_id', userId)
    .eq('date', dateKey)
    .eq('provider', 'whoop')
    .maybeSingle()

  const { error } = await supabase
    .from('wearable_data')
    .upsert(
      {
        user_id: userId,
        date: dateKey,
        provider: 'whoop',
        hrv: m.hrv ?? existing?.hrv ?? null,
        rhr: m.rhr ?? existing?.rhr ?? null,
        sleep_perf: m.sleep_perf ?? existing?.sleep_perf ?? null,
        sleep_hours: m.sleep_hours ?? existing?.sleep_hours ?? null,
        recovery: m.recovery ?? existing?.recovery ?? null,
        strain: m.strain ?? existing?.strain ?? null,
        raw: { recovery, sleep, cycle },
      },
      { onConflict: 'user_id,date,provider' },
    )

  if (error) throw error
  return { synced: true, date: dateKey }
}

// ============================================================
// TRAIN 5: history backfill - the score history line on day one
// ============================================================

/** Request budget for a backfill: pages per collection, records per page.
 *  3 collections x 3 pages = at most 9 WHOOP calls, covering ~30+ days. */
const BACKFILL_MAX_PAGES = 3
const BACKFILL_PAGE_LIMIT = 25 // WHOOP collection max

/**
 * Collect up to BACKFILL_MAX_PAGES of one WHOOP collection over a start/end
 * window. Best-effort: a failed page logs and returns what we have so far -
 * a partial backfill is still a win, and callers never fail on it. `ok` is
 * true once ANY page fetched successfully (WHOOP was reachable), so a caller
 * can tell a real-but-empty attempt from a total outage/token blip.
 */
async function whoopCollectAll<T>(
  token: string,
  path: string,
  startIso: string,
  endIso: string,
  opts?: { v1?: boolean },
): Promise<{ records: T[]; ok: boolean }> {
  const records: T[] = []
  let ok = false
  let nextToken: string | undefined
  for (let page = 0; page < BACKFILL_MAX_PAGES; page++) {
    const params = new URLSearchParams({
      limit: String(BACKFILL_PAGE_LIMIT),
      start: startIso,
      end: endIso,
    })
    if (nextToken) params.set('nextToken', nextToken)
    try {
      const res = await whoopFetch<WhoopCollection<T>>(token, `${path}?${params.toString()}`, opts)
      ok = true
      records.push(...(res.records ?? []))
      nextToken = res.next_token || undefined
    } catch (e) {
      console.error(`[Whoop] backfill ${path} page ${page + 1} failed:`, e instanceof Error ? e.message : e)
      break
    }
    if (!nextToken) break
  }
  return { records, ok }
}

/**
 * Pull ~`days` days of recovery / sleep / cycle history and upsert one
 * normalized row per day into `wearable_data` (RLS, provider 'whoop') -
 * exactly the shape syncLatest writes, so every reader downstream just sees
 * more days. Same trust boundary (normalizeWhoopMetrics) per day, same
 * field-by-field coalesce against existing rows (one ranged read, never a
 * per-day query), so a backfill can never clobber good data with a blank.
 */
export async function backfillHistory(
  supabase: SupabaseClient,
  userId: string,
  days = 30,
): Promise<{ upserted: number; providerReached: boolean }> {
  const token = await getValidAccessToken(supabase, userId)
  if (!token) throw new Error('No valid Whoop token for user')

  const endIso = new Date().toISOString()
  const startIso = new Date(Date.now() - days * 86_400_000).toISOString()

  const [recoveriesC, sleepsC, cyclesC] = await Promise.all([
    whoopCollectAll<WhoopRecovery>(token, '/recovery', startIso, endIso),
    whoopCollectAll<WhoopSleep>(token, '/activity/sleep', startIso, endIso),
    whoopCollectAll<WhoopCycle>(token, '/cycle', startIso, endIso, { v1: true }),
  ])
  // WHOOP answered at least one collection: the attempt was real, even if empty.
  const providerReached = recoveriesC.ok || sleepsC.ok || cyclesC.ok
  const recoveries = recoveriesC.records
  const sleeps = sleepsC.records
  const cycles = cyclesC.records
  if (!cycles.length) return { upserted: 0, providerReached }

  const recoveryByCycle = new Map<number, WhoopRecovery>()
  for (const r of recoveries) if (!recoveryByCycle.has(r.cycle_id)) recoveryByCycle.set(r.cycle_id, r)
  const sleepById = new Map<number, WhoopSleep>()
  for (const s of sleeps) if (!sleepById.has(s.id)) sleepById.set(s.id, s)
  // Fallback day index when a cycle has no recovery (so no sleep_id): a night
  // belongs to the day it ENDS on, per that reading's own timezone offset.
  const sleepByDay = new Map<string, WhoopSleep>()
  for (const s of sleeps) {
    if (!s.end) continue
    const day = dateKeyForOffset(new Date(s.end), s.timezone_offset ?? null)
    if (!sleepByDay.has(day)) sleepByDay.set(day, s)
  }

  // One row per day. Collections come newest-first; the first cycle seen for a
  // date wins (the most recent physiological day labelled with that date).
  const byDate = new Map<string, { m: ReturnType<typeof normalizeWhoopMetrics>; raw: unknown }>()
  for (const cycle of cycles) {
    const dateKey = dateKeyForOffset(new Date(cycle.start), cycle.timezone_offset ?? null)
    if (byDate.has(dateKey)) continue
    const recovery = recoveryByCycle.get(cycle.id) ?? null
    const sleep = (recovery ? sleepById.get(recovery.sleep_id) : undefined) ?? sleepByDay.get(dateKey) ?? null
    const m = normalizeWhoopMetrics(recovery, sleep, cycle)
    // A day where nothing survived the trust boundary writes nothing.
    if (m.hrv == null && m.rhr == null && m.recovery == null && m.sleep_perf == null && m.sleep_hours == null && m.strain == null) continue
    byDate.set(dateKey, { m, raw: { recovery, sleep, cycle } })
  }
  if (!byDate.size) return { upserted: 0, providerReached }

  const dateKeys = [...byDate.keys()]
  const { data: existingRows } = await supabase
    .from('wearable_data')
    .select('date, hrv, rhr, sleep_perf, sleep_hours, recovery, strain')
    .eq('user_id', userId)
    .eq('provider', 'whoop')
    .in('date', dateKeys)
  const existingByDate = new Map((existingRows ?? []).map((r) => [String(r.date), r]))

  const upserts = dateKeys.map((date) => {
    const { m, raw } = byDate.get(date)!
    const existing = existingByDate.get(date)
    return {
      user_id: userId,
      date,
      provider: 'whoop',
      hrv: m.hrv ?? existing?.hrv ?? null,
      rhr: m.rhr ?? existing?.rhr ?? null,
      sleep_perf: m.sleep_perf ?? existing?.sleep_perf ?? null,
      sleep_hours: m.sleep_hours ?? existing?.sleep_hours ?? null,
      recovery: m.recovery ?? existing?.recovery ?? null,
      strain: m.strain ?? existing?.strain ?? null,
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
 * the user has a live WHOOP connection, fewer than ~7 stored days, and has
 * never been backfilled (`wearable_connections.history_backfilled_at` is the
 * marker; it is stamped once a REAL attempt has run - enough history already,
 * or WHOOP actually answered the pull - so this never loops, while a total
 * outage/token blip leaves the marker unset and the next sync retries). Fully
 * best-effort: any failure (including the marker column not existing yet)
 * logs and returns without touching the caller's sync result.
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
      .eq('provider', 'whoop')
      .maybeSingle()
    if (error || !conn?.encrypted_access_token || conn.history_backfilled_at) return { ran: false, upserted: 0 }

    const { count } = await supabase
      .from('wearable_data')
      .select('date', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('provider', 'whoop')

    let upserted = 0
    // The count>=7 path needs no pull, so stamping is honest; a pull only
    // counts as the one shot when WHOOP was actually reachable.
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
        .eq('provider', 'whoop')
    }
    return { ran: true, upserted }
  } catch (e) {
    console.error('[Whoop] history catchup failed:', e instanceof Error ? e.message : e)
    return { ran: false, upserted: 0 }
  }
}
