import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { gateConnector } from '@/lib/connectors/gate'
import { getConnector } from '@/lib/connectors/registry'
import { listConnections, syncConnection, markConnectionError } from '@/lib/connectors/service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/connectors/sync-all  { brand? }
 *
 * Refreshes every connection for the user (optionally scoped to one brand). One
 * connection failing doesn't abort the rest — each result reports ok/error. The
 * hook for a future nightly cron (have it call this per active user).
 */
export async function POST(req: Request) {
  const supabase = createClient()
  const gate = await gateConnector(supabase)
  if ('error' in gate) return gate.error

  let brandFilter: string | null = null
  try {
    const body = (await req.json()) as { brand?: string }
    if (typeof body?.brand === 'string') brandFilter = body.brand
  } catch {
    /* body optional */
  }

  const conns = (await listConnections(supabase, gate.userId)).filter(
    (c) => brandFilter == null || c.brand_ref === brandFilter,
  )

  const results = await Promise.all(
    conns.map(async (conn) => {
      const def = getConnector(conn.provider)
      if (!def) return { provider: conn.provider, brand: conn.brand_ref, ok: false, error: 'unknown connector' }
      try {
        const metrics = await syncConnection(supabase, gate.userId, def, conn)
        return { provider: conn.provider, brand: conn.brand_ref, ok: true, count: metrics.length }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'sync_failed'
        await markConnectionError(supabase, gate.userId, conn.provider, conn.brand_ref, message)
        return { provider: conn.provider, brand: conn.brand_ref, ok: false, error: message }
      }
    }),
  )

  return NextResponse.json({ ok: true, synced: results.filter((r) => r.ok).length, total: results.length, results })
}
