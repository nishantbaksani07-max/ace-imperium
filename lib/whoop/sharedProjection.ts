import type { SupabaseClient } from '@supabase/supabase-js'

interface SharedProjectionConfig {
  url: string
  anonKey: string
  ownerKey: string
  providerUserId: string
}

interface WearableReading {
  date: string
  provider: string
  recovery: number | null
  hrv: number | null
  rhr: number | null
  sleep_perf: number | null
  sleep_hours: number | null
  strain: number | null
}

export interface SharedWhoopProjection {
  connection: { rows: Array<{ provider: 'whoop'; encrypted_access_token: 'connected' }> }
  readings: { rows: WearableReading[] }
}

function projectionConfig(): SharedProjectionConfig | null {
  const values = {
    url: process.env.SHARED_BRAIN_SUPABASE_URL ?? '',
    anonKey: process.env.SHARED_BRAIN_SUPABASE_ANON_KEY ?? '',
    ownerKey: process.env.SHARED_BRAIN_OWNER_KEY ?? '',
    providerUserId: process.env.WHOOP_SHARED_PROVIDER_USER_ID ?? '',
  }
  const configured = Object.values(values).filter(Boolean).length
  if (configured === 0) return null
  if (configured !== Object.keys(values).length) {
    throw new Error('shared_whoop_projection_misconfigured')
  }
  return values
}

/** Build the summary-only shape consumed by the Sam/Alex shared brain. */
export function buildSharedWhoopProjection(rows: WearableReading[]): SharedWhoopProjection {
  const readings = rows
    .filter((row) => row.provider === 'whoop' && typeof row.date === 'string')
    .map((row) => ({
      date: row.date,
      provider: 'whoop',
      recovery: row.recovery,
      hrv: row.hrv,
      rhr: row.rhr,
      sleep_perf: row.sleep_perf,
      sleep_hours: row.sleep_hours,
      strain: row.strain,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return {
    // The shared reader checks only whether this field is truthy. Never copy
    // an OAuth token, app credential, raw provider payload, email or user id.
    connection: { rows: [{ provider: 'whoop', encrypted_access_token: 'connected' }] },
    readings: { rows: readings },
  }
}

async function upsertSharedTile(
  config: SharedProjectionConfig,
  tileId: string,
  data: SharedWhoopProjection['connection'] | SharedWhoopProjection['readings'],
) {
  const response = await fetch(`${config.url.replace(/\/$/, '')}/rest/v1/tile_data?on_conflict=tile_id`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      'x-owner-key': config.ownerKey,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify([{
      tile_id: tileId,
      data,
      updated_at: new Date().toISOString(),
      owner_key: config.ownerKey,
    }]),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`shared_whoop_projection_http_${response.status}`)
}

/**
 * Publish Sam's normalized WHOOP history to the separate owner-key-protected
 * shared-brain store. Returns a non-secret status for cron observability.
 */
export async function publishSharedWhoopProjection(
  admin: SupabaseClient,
): Promise<{ published: boolean; rows: number; latestDate: string | null; reason?: 'not_configured' }> {
  const config = projectionConfig()
  if (!config) return { published: false, rows: 0, latestDate: null, reason: 'not_configured' }

  const { data: connections, error: connectionError } = await admin
    .from('wearable_connections')
    .select('user_id')
    .eq('provider', 'whoop')
    .eq('provider_user_id', config.providerUserId)
    .not('encrypted_access_token', 'is', null)
    .limit(1)
  if (connectionError) throw new Error('shared_whoop_connection_lookup_failed')
  const connection = connections?.[0]
  if (!connection?.user_id) throw new Error('shared_whoop_connection_not_found')

  const { data: readings, error: readingsError } = await admin
    .from('wearable_data')
    .select('date, provider, recovery, hrv, rhr, sleep_perf, sleep_hours, strain')
    .eq('user_id', connection.user_id)
    .eq('provider', 'whoop')
    .order('date', { ascending: true })
    .limit(365)
  if (readingsError) throw new Error('shared_whoop_readings_lookup_failed')

  const projection = buildSharedWhoopProjection((readings ?? []) as WearableReading[])
  await Promise.all([
    upsertSharedTile(config, 'me:app:wearable_connections', projection.connection),
    upsertSharedTile(config, 'me:app:wearable_data', projection.readings),
  ])

  return {
    published: true,
    rows: projection.readings.rows.length,
    latestDate: projection.readings.rows.at(-1)?.date ?? null,
  }
}
