import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncLatest } from '@/lib/whoop/client'
import { openSecret } from '@/lib/wearables/secretbox'
import {
  parseWhoopWebhookEvent,
  verifyWhoopSignature,
  WHOOP_SYNC_EVENT_TYPES,
} from '@/lib/whoop/webhook'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Signed WHOOP v2 webhook receiver.
 *
 * The event body tells us which WHOOP user changed. We use that untrusted id
 * only to find candidate connections, then accept the request only when its
 * HMAC matches the client secret belonging to that connection's WHOOP app.
 * syncLatest is idempotent, so duplicate WHOOP deliveries are safe.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const event = parseWhoopWebhookEvent(rawBody)
  if (!event) return NextResponse.json({ error: 'invalid_event' }, { status: 400 })

  const signature = req.headers.get('x-whoop-signature')
  const timestamp = req.headers.get('x-whoop-signature-timestamp')

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data: candidates, error } = await admin
    .from('wearable_connections')
    .select('user_id, client_secret')
    .eq('provider', 'whoop')
    .eq('provider_user_id', String(event.user_id))
    .not('encrypted_access_token', 'is', null)

  if (error) {
    console.error('[Whoop webhook] connection lookup failed:', error.message)
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
  }

  const verifiedUserIds = (candidates ?? []).flatMap((connection) => {
    let clientSecret: string | null = null
    try {
      clientSecret = connection.client_secret
        ? openSecret(connection.client_secret)
        : process.env.WHOOP_CLIENT_SECRET ?? null
    } catch (e) {
      console.error('[Whoop webhook] could not open app secret:', e instanceof Error ? e.message : e)
    }

    return clientSecret && verifyWhoopSignature(rawBody, timestamp, signature, clientSecret)
      ? [connection.user_id as string]
      : []
  })

  if (verifiedUserIds.length === 0) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 })
  }

  // WHOOP publishes workout/deletion events too. Vitality's current projection
  // is recovery/sleep/cycle, so acknowledge unrelated events without API work.
  if (!WHOOP_SYNC_EVENT_TYPES.has(event.type)) {
    return NextResponse.json({ accepted: true, synced: 0 })
  }

  const results = await Promise.allSettled(
    [...new Set(verifiedUserIds)].map((userId) => syncLatest(admin, userId)),
  )
  const synced = results.filter((result) => result.status === 'fulfilled').length
  const failed = results.length - synced

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('[Whoop webhook] sync failed:', result.reason instanceof Error ? result.reason.message : result.reason)
    }
  }

  if (failed > 0) {
    // A non-2xx response asks WHOOP to retry; the nightly reconciliation cron
    // remains the final safety net if all retries fail.
    return NextResponse.json({ error: 'sync_failed', synced, failed }, { status: 503 })
  }

  return NextResponse.json({ accepted: true, synced })
}
