import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * BANISHED (Alex, 2026-07-12): the "Make your key" bring-your-own-credentials
 * step. With the central Vitality app now the default, the band gallery links
 * straight to /api/<band>/connect (OAuth Allow), so no user ever makes a key.
 * This route stays only to send any old link to the OAuth start for a real
 * band, else back to Vitals.
 */
export default function ConnectBandPage({ params }: { params: { band: string } }) {
  const band = params.band === 'whoop' || params.band === 'oura' ? params.band : null
  redirect(band ? `/api/${band}/connect` : '/app/vitals')
}
