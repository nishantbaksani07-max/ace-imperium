import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getConnector } from '@/lib/connectors/registry'
import { syncConnection, markConnectionError, type ConnectionRow } from '@/lib/connectors/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * Patreon webhook — live updates. Patreon POSTs an event (members:create /
 * :update / :delete, pledges…) whenever a patron changes, signed with HMAC-MD5
 * of the raw body using the webhook secret (PATREON_WEBHOOK_SECRET). We verify
 * it, read the campaign id off the payload, find the matching brand_connection by
 * its stored `external_id` (service-role — no user session on a webhook), and
 * re-sync that connection so the numbers refresh in real time.
 *
 * Setup: in your Patreon creator dashboard create a webhook pointing at
 * <app>/api/connectors/patreon/webhook with this secret, subscribed to the
 * members/pledges triggers. Needs a public URL (won't reach localhost).
 */

const COLS = 'id, provider, brand_ref, auth_type, credentials, account_label, scopes, status, last_error, last_synced_at, user_id'

function verify(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false
  const expected = crypto.createHmac('md5', secret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/** Pull the campaign id out of a webhook payload (member/pledge events). */
function campaignIdOf(payload: unknown): string | null {
  const rel = (payload as { data?: { relationships?: { campaign?: { data?: { id?: string } } } }; included?: Array<{ type?: string; id?: string }> })
  const fromRel = rel?.data?.relationships?.campaign?.data?.id
  if (typeof fromRel === 'string' && fromRel) return fromRel
  const fromIncluded = rel?.included?.find((i) => i.type === 'campaign')?.id
  return typeof fromIncluded === 'string' && fromIncluded ? fromIncluded : null
}

export async function POST(req: NextRequest) {
  const secret = process.env.PATREON_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'webhook_not_configured' }, { status: 503 })

  const rawBody = await req.text()
  if (!verify(rawBody, req.headers.get('x-patreon-signature'), secret)) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'bad_payload' }, { status: 400 })
  }

  const campaignId = campaignIdOf(payload)
  // Ack with 200 even when there's nothing to do, so Patreon doesn't retry.
  if (!campaignId) return NextResponse.json({ ok: true, note: 'no campaign id' })

  const def = getConnector('patreon')
  if (!def) return NextResponse.json({ ok: true, note: 'connector missing' })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('brand_connections')
    .select(COLS)
    .eq('provider', 'patreon')
    .eq('external_id', campaignId)
  if (error) {
    if (error.code === '42P01') return NextResponse.json({ ok: true, note: 'table not migrated' })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as Array<ConnectionRow & { user_id: string }>
  let synced = 0
  for (const row of rows) {
    try {
      await syncConnection(admin, row.user_id, def, row)
      synced++
    } catch (e) {
      await markConnectionError(admin, row.user_id, 'patreon', row.brand_ref, e instanceof Error ? e.message : 'webhook_sync_failed').catch(() => {})
      console.error(`[patreon/webhook] sync ${row.user_id}:`, e instanceof Error ? e.message : e)
    }
  }

  const event = req.headers.get('x-patreon-event') ?? 'unknown'
  console.log(`[patreon/webhook] ${event} campaign=${campaignId} synced ${synced}/${rows.length}`)
  return NextResponse.json({ ok: true, synced })
}
