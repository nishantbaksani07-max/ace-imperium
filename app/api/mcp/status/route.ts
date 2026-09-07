import { createClient } from '@/lib/supabase/server'
import { readMcpConnection } from '@/lib/mcp/connection'

/**
 * GET /api/mcp/status - the tiny poll target behind the Forge two-state page.
 *
 * Browser-session-gated and RLS-scoped (the reads run under the caller's own
 * Supabase session, see lib/mcp/connection.ts). Returns:
 *   { connected: boolean, latestTileAt: string | null }
 *
 * The Forge client polls this every 5s while waiting for the claude.ai
 * connector Allow, and every 10s (max 5 minutes) after "Build it with Claude"
 * to spot the freshly landed tile. Cheap by design: two head-counts + one
 * single-row select.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'no-store' }

export async function GET(): Promise<Response> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: noStore })
  }

  const { connected, latestTileAt } = await readMcpConnection(supabase)
  return Response.json({ connected, latestTileAt }, { headers: noStore })
}
