import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * One RLS-scoped read that answers "is this user's Claude hooked up, and when
 * did their newest tile land?" Shared by the Forge page (server component) and
 * /api/mcp/status (the tiny poll endpoint), so the definition of "connected"
 * can never drift between the two.
 *
 * Connected means EITHER live lane into the hosted MCP:
 *   - a Phase-1 connect token (`mcp_tokens`: not revoked, not expired), the
 *     Claude Code `claude mcp add` path, or
 *   - a Phase-2 OAuth grant (via the SECURITY DEFINER
 *     `mcp_oauth_list_connections()`, which is auth.uid()-scoped), the
 *     claude.ai / Desktop / mobile connector path.
 *
 * Every query here runs under the caller's session, so RLS scopes all three
 * reads to the signed-in user. No service role anywhere.
 */

export type McpConnection = {
  connected: boolean
  /** ISO timestamp of the user's newest tile row, or null if they have none. */
  latestTileAt: string | null
}

export async function readMcpConnection(
  supabase: SupabaseClient,
): Promise<McpConnection> {
  const nowIso = new Date().toISOString()

  const [tokenRes, oauthRes, tileRes] = await Promise.all([
    supabase
      .from('mcp_tokens')
      .select('id', { count: 'exact', head: true })
      .is('revoked_at', null)
      .gt('expires_at', nowIso),
    supabase.rpc('mcp_oauth_list_connections'),
    supabase
      .from('tiles')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1),
  ])

  const tokenCount = tokenRes.count ?? 0
  const oauthCount = Array.isArray(oauthRes.data) ? oauthRes.data.length : 0
  const latest = tileRes.data?.[0]?.created_at
  return {
    connected: tokenCount > 0 || oauthCount > 0,
    latestTileAt: typeof latest === 'string' ? latest : null,
  }
}
