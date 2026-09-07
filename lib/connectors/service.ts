import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { openCredentials, sealCredentials } from './crypto'
import type { ConnectorDef, OAuthTokens, SyncedMetric } from './types'

/**
 * Server-side persistence for connectors. Every call is RLS-scoped: it runs on
 * the caller's own Supabase client and additionally filters `.eq('user_id', …)`
 * for defence in depth (CLAUDE.md #3). No service-role, no cross-user reads.
 */

export interface ConnectionRow {
  id: string
  provider: string
  brand_ref: string
  auth_type: 'oauth' | 'api_key'
  credentials: unknown
  account_label: string | null
  scopes: string | null
  status: string
  last_error: string | null
  last_synced_at: string | null
}

const COLS = 'id, provider, brand_ref, auth_type, credentials, account_label, scopes, status, last_error, last_synced_at'

export async function getConnection(
  supabase: SupabaseClient,
  userId: string,
  provider: string,
  brandRef = '',
): Promise<ConnectionRow | null> {
  const { data } = await supabase
    .from('brand_connections')
    .select(COLS)
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('brand_ref', brandRef)
    .maybeSingle()
  return (data as ConnectionRow | null) ?? null
}

export async function listConnections(
  supabase: SupabaseClient,
  userId: string,
): Promise<ConnectionRow[]> {
  const { data } = await supabase
    .from('brand_connections')
    .select(COLS)
    .eq('user_id', userId)
  return (data as ConnectionRow[] | null) ?? []
}

/** Upsert a connection, sealing the credential blob at rest. */
export async function storeConnection(
  supabase: SupabaseClient,
  userId: string,
  args: {
    provider: string
    brandRef?: string
    authType: 'oauth' | 'api_key'
    credentials: Record<string, unknown>
    accountLabel?: string | null
    scopes?: string | null
  },
): Promise<void> {
  const { error } = await supabase.from('brand_connections').upsert(
    {
      user_id: userId,
      provider: args.provider,
      brand_ref: args.brandRef ?? '',
      auth_type: args.authType,
      credentials: sealCredentials(args.credentials),
      account_label: args.accountLabel ?? null,
      scopes: args.scopes ?? null,
      status: 'active',
      last_error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,provider,brand_ref' },
  )
  if (error) throw error
}

export async function deleteConnection(
  supabase: SupabaseClient,
  userId: string,
  provider: string,
  brandRef = '',
): Promise<void> {
  await supabase
    .from('brand_connections')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('brand_ref', brandRef)
}

export async function markConnectionError(
  supabase: SupabaseClient,
  userId: string,
  provider: string,
  brandRef: string,
  message: string,
): Promise<void> {
  await supabase
    .from('brand_connections')
    .update({ status: 'error', last_error: message.slice(0, 500), updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('brand_ref', brandRef)
}

export function decryptCredentials(row: ConnectionRow): Record<string, unknown> {
  return openCredentials(row.credentials)
}

/**
 * Return a valid access token for an OAuth connection, refreshing (and
 * persisting the new token set) if the stored one is within 60s of expiry.
 * `def` is passed in to avoid a registry↔service import cycle.
 */
export async function getValidOAuthToken(
  supabase: SupabaseClient,
  userId: string,
  def: ConnectorDef,
  row: ConnectionRow,
): Promise<string | null> {
  const creds = decryptCredentials(row) as {
    accessToken?: string
    refreshToken?: string
    expiresAt?: string
    extra?: Record<string, unknown>
  }
  const expMs = creds.expiresAt ? Date.parse(creds.expiresAt) : Infinity
  if (creds.accessToken && expMs - Date.now() > 60_000) return creds.accessToken

  if (!creds.refreshToken || !def.oauth?.refresh) return creds.accessToken ?? null
  const refreshed = await def.oauth.refresh(creds.refreshToken)
  await persistOAuthTokens(supabase, userId, def.id, row.brand_ref, refreshed, {
    ...creds.extra,
    ...refreshed.extra,
  })
  return refreshed.accessToken
}

export async function persistOAuthTokens(
  supabase: SupabaseClient,
  userId: string,
  provider: string,
  brandRef: string,
  tokens: OAuthTokens,
  extra?: Record<string, unknown>,
): Promise<void> {
  const credentials: Record<string, unknown> = {
    accessToken: tokens.accessToken,
    extra: extra ?? tokens.extra ?? {},
  }
  // Keep the old refresh token if the provider didn't return a new one.
  if (tokens.refreshToken) credentials.refreshToken = tokens.refreshToken
  if (tokens.expiresInSeconds != null) {
    credentials.expiresAt = new Date(Date.now() + tokens.expiresInSeconds * 1000).toISOString()
  }
  const { error } = await supabase
    .from('brand_connections')
    .update({ credentials: sealCredentials(credentials), updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('brand_ref', brandRef)
  if (error) throw error
}

/** Persist a batch of synced metrics under a single capture timestamp. */
export async function recordMetrics(
  supabase: SupabaseClient,
  userId: string,
  provider: string,
  brandRef: string,
  metrics: SyncedMetric[],
): Promise<void> {
  if (!metrics.length) return
  const capturedAt = new Date().toISOString()
  const rows = metrics.map((m) => ({
    user_id: userId,
    provider,
    brand_ref: brandRef,
    metric: m.metric,
    label: m.label,
    value: m.value,
    unit: m.unit ?? '',
    period: m.period ?? 'snapshot',
    captured_at: capturedAt,
    raw: m.raw ?? null,
  }))
  const { error } = await supabase
    .from('brand_metrics')
    .upsert(rows, { onConflict: 'user_id,provider,brand_ref,metric,captured_at', ignoreDuplicates: true })
  if (error) throw error
  await supabase
    .from('brand_connections')
    .update({ last_synced_at: capturedAt, status: 'active', last_error: null, updated_at: capturedAt })
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('brand_ref', brandRef)
}

/**
 * Sync one connection end-to-end: refresh OAuth if needed, pull metrics, record
 * them, and update the account label. Shared by the per-provider sync route and
 * the sync-all route so the two never diverge. Throws on failure (caller marks
 * the connection errored).
 */
export async function syncConnection(
  supabase: SupabaseClient,
  userId: string,
  def: ConnectorDef,
  row: ConnectionRow,
): Promise<SyncedMetric[]> {
  let credentials = decryptCredentials(row)
  if (def.authType === 'oauth') {
    const token = await getValidOAuthToken(supabase, userId, def, row)
    if (!token) throw new Error('Could not refresh access token — reconnect needed.')
    credentials = { ...credentials, accessToken: token }
  }
  const result = await def.sync({ credentials, brandRef: row.brand_ref })
  await recordMetrics(supabase, userId, def.id, row.brand_ref, result.metrics)
  const patch: Record<string, unknown> = {}
  if (result.accountLabel) patch.account_label = result.accountLabel
  if (result.externalId) patch.external_id = result.externalId
  if (Object.keys(patch).length) {
    await supabase
      .from('brand_connections')
      .update(patch)
      .eq('user_id', userId)
      .eq('provider', def.id)
      .eq('brand_ref', row.brand_ref)
  }
  return result.metrics
}

/** Newest value per metric for a connection (for the connect-UI preview). */
export async function getLatestMetrics(
  supabase: SupabaseClient,
  userId: string,
  provider: string,
  brandRef = '',
): Promise<SyncedMetric[]> {
  const { data } = await supabase
    .from('brand_metrics')
    .select('metric, label, value, unit, period, captured_at')
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('brand_ref', brandRef)
    .order('captured_at', { ascending: false })
    .limit(50)
  const rows = (data as Array<{ metric: string; label: string; value: number; unit: string; period: string }> | null) ?? []
  const seen = new Set<string>()
  const out: SyncedMetric[] = []
  for (const r of rows) {
    if (seen.has(r.metric)) continue
    seen.add(r.metric)
    out.push({ metric: r.metric, label: r.label, value: Number(r.value), unit: r.unit, period: r.period as SyncedMetric['period'] })
  }
  return out
}

/**
 * Full metric history (every stored snapshot, oldest → newest) for one provider.
 * `brand_metrics` is append-only per captured_at, so this is the time-series that
 * powers a connector's trend graph. Bounded so a long-lived connection can't
 * return an unbounded payload.
 */
export async function getMetricHistory(
  supabase: SupabaseClient,
  userId: string,
  provider: string,
  brandRef = '',
): Promise<Array<{ metric: string; label: string; value: number; unit: string; capturedAt: string }>> {
  const { data } = await supabase
    .from('brand_metrics')
    .select('metric, label, value, unit, captured_at')
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('brand_ref', brandRef)
    .order('captured_at', { ascending: true })
    .limit(2000)
  const rows = (data as Array<{ metric: string; label: string; value: number; unit: string; captured_at: string }> | null) ?? []
  return rows.map((r) => ({ metric: r.metric, label: r.label, value: Number(r.value), unit: r.unit, capturedAt: r.captured_at }))
}
