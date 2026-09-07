import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { syncLatest as syncWhoop, maybeBackfillHistory as backfillWhoop } from '@/lib/whoop/client'
import { publishSharedWhoopProjection } from '@/lib/whoop/sharedProjection'
import { syncLatest as syncOura, maybeBackfillHistory as backfillOura } from '@/lib/oura/client'

export const dynamic = 'force-dynamic'
// Give the fleet loop room. Sequential + isolated, so a handful of users sync
// in a couple seconds; bump / parallelize when the user base grows.
export const maxDuration = 60

/**
 * Daily wearable sync — the heartbeat that keeps the shared brain fed.
 *
 * Triggered by Vercel Cron (see vercel.json) once a day. It is ONE half of the
 * freshness story; the other half is a self-healing sync-on-open in the vitals
 * page, so if this cron ever misfires the data still catches up when the user
 * opens the app. Neither path can let the data silently rot.
 *
 * Design notes (why this won't break over time):
 *  - Provider-agnostic: add Fitbit/Oura to SYNCERS and the cron picks them up.
 *  - Per-user isolation: one dead token can never stop the rest of the fleet.
 *  - Idempotent: each syncer upserts by (user_id, date, provider) — re-running
 *    overwrites the day's row, never duplicates.
 *  - Self-refreshing tokens: syncLatest refreshes expired access tokens and
 *    returns/throws cleanly if the user fully revoked us (then they reconnect).
 */

// Provider -> its sync function. Each MUST be idempotent and self-contained.
const SYNCERS: Record<string, (sb: SupabaseClient, userId: string) => Promise<unknown>> = {
  whoop: syncWhoop,
  oura: syncOura,
}

// Provider -> one-time ~30-day history catchup. Self-disarming via
// wearable_connections.history_backfilled_at and never throws, so the fleet
// loop can call it every night: after the first real run it costs one row-read.
const BACKFILLERS: Record<string, (sb: SupabaseClient, userId: string) => Promise<unknown>> = {
  whoop: backfillWhoop,
  oura: backfillOura,
}

export async function GET(req: NextRequest) {
  // Only Vercel Cron (which sends this secret) or an authorized caller may run
  // this — otherwise anyone could hammer the wearable APIs on our behalf.
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Service-role client: the cron has no logged-in user, so it reads every
  // connection itself. Each syncer still only ever writes its own user's rows.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // Only rows with live tokens are syncable. WHOOP's bring-your-own-credentials
  // flow can leave a token-less row (keys saved, not yet authorized) — skip
  // those so the cron doesn't churn on a connection that can't sync yet.
  const { data: conns, error } = await admin
    .from('wearable_connections')
    .select('user_id, provider')
    .not('encrypted_access_token', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let synced = 0
  let failed = 0
  let skipped = 0
  for (const c of conns ?? []) {
    const syncer = SYNCERS[c.provider]
    if (!syncer) { skipped++; continue }
    try {
      await syncer(admin, c.user_id)
      await BACKFILLERS[c.provider]?.(admin, c.user_id)
      synced++
    } catch (e) {
      failed++
      console.error(`[cron/sync] ${c.provider} ${c.user_id}:`, e instanceof Error ? e.message : e)
    }
  }

  // Sam/Alex's AI tasks use a separate owner-key-protected Supabase store.
  // Publish only Sam's normalized metric rows after the source sync finishes;
  // tokens, app keys, raw WHOOP payloads and identity fields never cross over.
  let sharedProjection: Awaited<ReturnType<typeof publishSharedWhoopProjection>>
  try {
    sharedProjection = await publishSharedWhoopProjection(admin)
  } catch (e) {
    console.error('[cron/sync] shared WHOOP projection failed:', e instanceof Error ? e.message : e)
    return NextResponse.json(
      { total: conns?.length ?? 0, synced, failed, skipped, sharedProjection: 'failed' },
      { status: 502 },
    )
  }

  console.log(`[cron/sync] ${synced} synced, ${failed} failed, ${skipped} skipped of ${conns?.length ?? 0}`)
  return NextResponse.json({ total: conns?.length ?? 0, synced, failed, skipped, sharedProjection })
}
