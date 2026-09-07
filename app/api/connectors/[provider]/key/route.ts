import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { gateConnector } from '@/lib/connectors/gate'
import { getConnector, isConfigured } from '@/lib/connectors/registry'
import { storeConnection, recordMetrics } from '@/lib/connectors/service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/connectors/<provider>/key  { brand?, creds: { … } }
 *
 * Saves an API-key connector: verifies the pasted credential against the
 * provider (a cheap live call), stores it sealed, and runs a first sync.
 */
export async function POST(req: Request, { params }: { params: { provider: string } }) {
  const supabase = createClient()
  const gate = await gateConnector(supabase)
  if ('error' in gate) return gate.error

  const def = getConnector(params.provider)
  if (!def || def.authType !== 'api_key' || !def.apiKey) {
    return NextResponse.json({ error: 'unknown api-key connector' }, { status: 404 })
  }
  if (!isConfigured(def)) {
    return NextResponse.json({ error: `${def.label} isn’t set up yet` }, { status: 400 })
  }

  let body: { brand?: string; creds?: Record<string, string> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const brandRef = body.brand ?? ''
  const creds = body.creds ?? {}

  try {
    const { accountLabel } = await def.apiKey.verify(creds)
    await storeConnection(supabase, gate.userId, {
      provider: def.id,
      brandRef,
      authType: 'api_key',
      credentials: creds,
      accountLabel,
    })

    let metrics
    try {
      const result = await def.sync({ credentials: creds, brandRef })
      await recordMetrics(supabase, gate.userId, def.id, brandRef, result.metrics)
      metrics = result.metrics
    } catch (e) {
      console.error(`[connector ${def.id}] initial sync failed`, e)
    }

    return NextResponse.json({ ok: true, accountLabel, metrics })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'connect_failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
