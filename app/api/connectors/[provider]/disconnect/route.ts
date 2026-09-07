import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { gateConnector } from '@/lib/connectors/gate'
import { getConnector } from '@/lib/connectors/registry'
import { deleteConnection } from '@/lib/connectors/service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/connectors/<provider>/disconnect  { brand? }
 *
 * Removes the connection (and its credential). Synced metric history in
 * brand_metrics is left intact — it's the user's own data and harmless to keep;
 * deleting the connection just stops future syncs.
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

  await deleteConnection(supabase, gate.userId, def.id, brandRef)
  return NextResponse.json({ ok: true })
}
