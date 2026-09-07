import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { gateConnector } from '@/lib/connectors/gate'
import { getConnector } from '@/lib/connectors/registry'
import { getMetricHistory } from '@/lib/connectors/service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/connectors/<provider>/history?brand=<ref>
 *
 * Time-series of a connection's synced metrics, grouped per metric (oldest →
 * newest). Powers the connector trend graph (e.g. Patreon patrons / pledge over
 * time). Auth + tier gated like the rest of the connector routes; reads only the
 * caller's own rows (RLS).
 */
export async function GET(req: Request, { params }: { params: { provider: string } }) {
  const supabase = createClient()
  const gate = await gateConnector(supabase)
  if ('error' in gate) return gate.error

  const def = getConnector(params.provider)
  if (!def) return NextResponse.json({ error: 'unknown connector' }, { status: 404 })

  const brandRef = new URL(req.url).searchParams.get('brand') ?? ''
  const rows = await getMetricHistory(supabase, gate.userId, def.id, brandRef)

  const series: Record<string, { label: string; unit: string; points: { at: string; value: number }[] }> = {}
  for (const r of rows) {
    const s = series[r.metric] ?? (series[r.metric] = { label: r.label, unit: r.unit, points: [] })
    s.points.push({ at: r.capturedAt, value: r.value })
  }

  return NextResponse.json({ series })
}
