import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { gateConnector } from '@/lib/connectors/gate'
import { CONNECTORS, isConfigured } from '@/lib/connectors/registry'
import { listConnections, getLatestMetrics } from '@/lib/connectors/service'
import type { ConnectorStatus } from '@/lib/connectors/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/connectors[?brand=<ref>]
 *
 * Returns every registered connector plus this user's connection status for the
 * given brand scope. Secrets are never returned — only field descriptors (so the
 * UI can render the paste form) and synced metrics.
 */
export async function GET(req: Request) {
  const supabase = createClient()
  const gate = await gateConnector(supabase)
  if ('error' in gate) return gate.error

  const brandRef = new URL(req.url).searchParams.get('brand') ?? ''
  const conns = await listConnections(supabase, gate.userId)

  const out: ConnectorStatus[] = []
  for (const def of CONNECTORS) {
    const conn = conns.find((c) => c.provider === def.id && c.brand_ref === brandRef)
    const metrics = conn ? await getLatestMetrics(supabase, gate.userId, def.id, brandRef) : undefined
    out.push({
      id: def.id,
      label: def.label,
      blurb: def.blurb,
      authType: def.authType,
      configured: isConfigured(def),
      fields: def.apiKey?.fields,
      connected: !!conn,
      status: conn?.status,
      accountLabel: conn?.account_label ?? null,
      lastError: conn?.last_error ?? null,
      lastSyncedAt: conn?.last_synced_at ?? null,
      metrics,
    })
  }

  return NextResponse.json({ connectors: out })
}
