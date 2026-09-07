import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getConnector } from '@/lib/connectors/registry'
import { syncConnection, markConnectionError, type ConnectionRow } from '@/lib/connectors/service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Daily business-connector sync (BUILD51). Mirrors sync-wearables: Vercel Cron
 * hits this with the CRON_SECRET, we read every brand_connection with the
 * service-role client and sync each. Per-connection isolation (one dead token
 * can't stop the fleet); syncConnection is idempotent (recordMetrics upserts by
 * user/provider/brand/metric/capture-time) and refreshes OAuth tokens itself.
 * The on-open/manual paths stay the freshness backstop.
 */

const COLS = 'id, provider, brand_ref, auth_type, credentials, account_label, scopes, status, last_error, last_synced_at, user_id'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data: conns, error } = await admin.from('brand_connections').select(COLS)
  if (error) {
    // Table not migrated yet → nothing to do, not a failure.
    if (error.code === '42P01') return NextResponse.json({ total: 0, synced: 0, note: 'table not migrated' })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let synced = 0
  let failed = 0
  let skipped = 0
  for (const row of (conns ?? []) as Array<ConnectionRow & { user_id: string }>) {
    const def = getConnector(row.provider)
    if (!def) { skipped++; continue }
    try {
      await syncConnection(admin, row.user_id, def, row)
      synced++
    } catch (e) {
      failed++
      await markConnectionError(admin, row.user_id, row.provider, row.brand_ref, e instanceof Error ? e.message : 'sync_failed').catch(() => {})
      console.error(`[cron/sync-connectors] ${row.provider} ${row.user_id}:`, e instanceof Error ? e.message : e)
    }
  }

  console.log(`[cron/sync-connectors] ${synced} synced, ${failed} failed, ${skipped} skipped of ${conns?.length ?? 0}`)
  return NextResponse.json({ total: conns?.length ?? 0, synced, failed, skipped })
}
