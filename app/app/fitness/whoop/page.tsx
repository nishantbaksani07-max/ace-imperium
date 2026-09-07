import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * BANISHED (Alex, 2026-07-12): this was the bring-your-own-keys WHOOP page
 * (paste your own client_id / client_secret). With the central Vitality WHOOP
 * app now the default (lib/whoop/client getWhoopCredentials falls back to
 * WHOOP_CLIENT_ID/SECRET), no user ever supplies keys again - they just tap
 * Connect -> Allow. The route stays only to redirect any old link to the real
 * readings page instead of 404ing. The old WhoopModule/TickerBar components
 * are dead and can be deleted whenever.
 */
export default function WhoopModulePage() {
  redirect('/app/vitals/whoop')
}
