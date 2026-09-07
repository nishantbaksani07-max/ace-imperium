import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { gateConnector } from '@/lib/connectors/gate'
import { getConnector } from '@/lib/connectors/registry'
import { getConnection, syncConnection, markConnectionError } from '@/lib/connectors/service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/connectors/<provider>/sync  { brand? }
 *
 * Pulls fresh metrics for an existing connection. OAuth connections refresh
 * their access token first (persisting the new one); api-key connections use
 * the stored credential directly. Records the metrics and bumps last_synced_at.
 */
export async function POST(req: Request, { params }: { params: { provider: string } }) {
  const supabase = createClient()
  const gate = await gateConnector(supabase)
  if ('error' in gate) return gate.error

  const def = getConnector(params.provider)
  if (!def) return NextResponse.json({ error: 'unknown connector' }, { status: 404 })

  let brandRef = ''
  try {
    const body = (await req.json()) as { brand?: string }
    brandRef = body?.brand ?? ''
  } catch {
    /* body optional */
  }

  const conn = await getConnection(supabase, gate.userId, def.id, brandRef)
  if (!conn) return NextResponse.json({ error: 'not connected' }, { status: 404 })

  try {
    const metrics = await syncConnection(supabase, gate.userId, def, conn)
    return NextResponse.json({ ok: true, metrics })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'sync_failed'
    await markConnectionError(supabase, gate.userId, def.id, brandRef, message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
