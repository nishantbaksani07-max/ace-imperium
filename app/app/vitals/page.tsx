import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ConnectScreen from './ConnectScreen'
import DevResetVitals from './DevResetVitals'
import {
  WEARABLE_ORDER, WEARABLES, isWearableProvider,
  type WearableConnState, type WearableProviderId,
} from '@/lib/vitals/wearables'
import { getConfiguredProviders } from '@/lib/vitals/readings'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Vitals' }

/**
 * Vitals home — the wearables gallery, and the connect-first front door.
 * Reachable WITHOUT the setup quiz: a user lands here, connects a device, and
 * only then takes the quiz (see /app/vitals/paired). The readings pages
 * (/app/vitals/<band>) stay hard-walled behind the quiz; this gallery does not,
 * because it is the entry funnel. Every band's card state (connect / awaiting /
 * connected) is resolved server-side, and a connected user is dispatched
 * straight to THEIR band's dashboard.
 */
export default async function VitalsHomePage({ searchParams }: { searchParams?: { manage?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Which bands are connected, and which of those have any synced data yet.
  // A row counts as connected only when it holds live OAuth tokens — WHOOP's
  // bring-your-own-credentials flow leaves a token-less row once a user has
  // saved their app keys but not yet authorized, and that isn't "connected".
  const { data: conns } = await supabase
    .from('wearable_connections').select('provider, encrypted_access_token').eq('user_id', user.id)
  const connected = new Set(
    (conns ?? []).filter((c) => c.encrypted_access_token).map((c) => c.provider).filter(isWearableProvider),
  )

  // Both reads below only depend on the conns result, so they share one round
  // trip: which connected bands have synced data, and whether 'manual' has any
  // (manual has no OAuth connection — it's "connected" once any check-in or
  // import has written a wearable_data row; resolved from data, not a token).
  const [dataRows, manualRows] = await Promise.all([
    connected.size > 0
      ? supabase
          .from('wearable_data').select('provider')
          .eq('user_id', user.id).in('provider', Array.from(connected))
          .then((r) => r.data)
      : null,
    supabase
      .from('wearable_data').select('provider')
      .eq('user_id', user.id).eq('provider', 'manual').limit(1)
      .then((r) => r.data),
  ])
  const hasData = new Set<WearableProviderId>()
  for (const r of dataRows ?? []) if (isWearableProvider(r.provider)) hasData.add(r.provider)
  const hasManualData = (manualRows ?? []).length > 0

  const states: Partial<Record<WearableProviderId, WearableConnState>> = {}
  for (const id of WEARABLE_ORDER) {
    if (id === 'manual') {
      states[id] = hasManualData ? 'connected' : 'disconnected'
      continue
    }
    states[id] = !connected.has(id) ? 'disconnected' : hasData.has(id) ? 'connected' : 'awaiting'
  }

  const manage = searchParams?.manage === '1'

  // Connected users land straight on their band's dashboard; the gallery is only
  // the first-run front door or the explicit "manage devices" entry (settings).
  const primary = WEARABLE_ORDER.find((id) => states[id] === 'connected')
  if (primary && !manage) redirect(WEARABLES[primary].readingsPath)

  return (
    <>
      <ConnectScreen states={states} available={getConfiguredProviders()} manage={manage} />
      {process.env.VERCEL_ENV !== 'production' && <DevResetVitals />}
    </>
  )
}
