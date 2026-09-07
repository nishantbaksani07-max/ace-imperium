/**
 * Wearable provider registry — the single source of truth for which bands
 * Vitals supports and what each one offers. Client-safe on purpose: pure data
 * + helpers, NO server imports (the WHOOP/Oura API clients are server-only and
 * live behind the loader in readings.ts). Both the gallery (a Client Component)
 * and the server pages import from here so the device list never drifts.
 *
 * Adding a band later (Fitbit, Apple Watch) is mostly: add an entry here, add
 * its syncer to readings.ts SYNCERS, and ship its OAuth routes.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

// 'manual' is the no-wearable band (BUILD68): the Peak check-in (and the
// screenshot importer) derive WHOOP-style numbers and write them to wearable_data
// provider 'manual', so a user with no device still gets a Recovery/Sleep/Strain
// band. It has no OAuth — "connected" means it has data, not a token row.
export type WearableProviderId = 'whoop' | 'oura' | 'manual'

/** A band's connection state for the gallery card. */
export type WearableConnState = 'disconnected' | 'awaiting' | 'connected'

export interface WearableMeta {
  id: WearableProviderId
  /** Display name, exactly as the brand writes it. */
  label: string
  /** The metrics line under the device name in the gallery. */
  blurb: string
  /** Whoop reports strain; Oura has no equivalent. Drives whether the Strain
   *  stat is even expected (the dashboard also hides any null metric). */
  hasStrain: boolean
  /** The readings page for this band. */
  readingsPath: string
}

export const WEARABLES: Record<WearableProviderId, WearableMeta> = {
  whoop: {
    id: 'whoop',
    label: 'WHOOP',
    blurb: 'recovery · sleep · strain',
    hasStrain: true,
    readingsPath: '/app/vitals/whoop',
  },
  oura: {
    id: 'oura',
    label: 'Oura',
    blurb: 'recovery · sleep',
    hasStrain: false,
    readingsPath: '/app/vitals/oura',
  },
  manual: {
    id: 'manual',
    label: 'Manual',
    blurb: 'check-in · no device',
    hasStrain: true,
    readingsPath: '/app/vitals/manual',
  },
}

/** Priority order when a user happens to have more than one band connected.
 *  'manual' falls last so a real device's same-day data always wins. */
export const WEARABLE_ORDER: WearableProviderId[] = ['whoop', 'oura', 'manual']

export function isWearableProvider(p: string | null | undefined): p is WearableProviderId {
  return p === 'whoop' || p === 'oura' || p === 'manual'
}

/**
 * The user's primary connected band (first in priority order), or null if none.
 * Lives here (not in the server loader) so the goal + signal gathers can share
 * it without an import cycle. Takes the supabase client as an argument — pure
 * data + a query, no server-only imports, so it stays client-safe.
 */
export async function getPrimaryProvider(
  supabase: SupabaseClient,
  userId: string,
): Promise<WearableProviderId | null> {
  const { data } = await supabase
    .from('wearable_connections')
    .select('provider')
    // Token-less rows (WHOOP keys saved, not yet authorized) aren't connected.
    // Filter in the query so the token value is never returned — keeps this
    // helper safe to call with a browser Supabase client.
    .not('encrypted_access_token', 'is', null)
    .eq('user_id', userId)
  const connected = new Set((data ?? []).map((r) => r.provider).filter(isWearableProvider))
  for (const p of WEARABLE_ORDER) if (connected.has(p)) return p

  // 'manual' has no OAuth connection — it's "connected" once a check-in or
  // import has written any wearable_data row. Checked last (only when no real
  // band is connected) so a device always wins; one cheap existence query.
  const { data: manualRows } = await supabase
    .from('wearable_data')
    .select('provider')
    .eq('user_id', userId)
    .eq('provider', 'manual')
    .limit(1)
  if (manualRows && manualRows.length > 0) return 'manual'
  return null
}
