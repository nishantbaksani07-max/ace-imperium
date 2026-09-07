import { randomClientId } from '../../crypto'
import {
  anonClient,
  CLIENT_ID_SCHEME,
  corsPreflight,
  jsonCors,
  mcpEnabled,
} from '../shared'

// RFC 7591 Dynamic Client Registration. Open + unauthenticated (that is how MCP
// clients self-register), and harmless: a registration binds no user — the
// user binding only happens at /authorize under a logged-in session. We supply
// DCR because Supabase's OAuth server has none (see the spike doc). Public
// clients only: no client_secret is issued; auth is PKCE at /token.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isValidRedirectUri(uri: unknown): uri is string {
  if (typeof uri !== 'string' || !uri) return false
  try {
    const u = new URL(uri)
    // Only https, or http on loopback (RFC 8252 native clients). Reject plain
    // http to arbitrary hosts and exotic schemes — a registered URI becomes a
    // trusted redirect target at /authorize, so narrow the surface here.
    if (u.protocol === 'https:') return true
    if (u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]')) {
      return true
    }
    return false
  } catch {
    return false
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!mcpEnabled()) return new Response('Not found', { status: 404 })

  let body: { redirect_uris?: unknown; client_name?: unknown }
  try {
    body = await req.json()
  } catch {
    return jsonCors({ error: 'invalid_client_metadata' }, { status: 400 })
  }

  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : []
  if (redirectUris.length === 0 || !redirectUris.every(isValidRedirectUri)) {
    return jsonCors(
      { error: 'invalid_redirect_uri', error_description: 'redirect_uris must be absolute URIs' },
      { status: 400 },
    )
  }
  const clientName = typeof body.client_name === 'string' ? body.client_name.slice(0, 120) : null

  const db = anonClient()
  if (!db) return jsonCors({ error: 'mcp_misconfigured' }, { status: 500 })

  const clientId = randomClientId(CLIENT_ID_SCHEME)
  const { error } = await db.rpc('mcp_oauth_register_client', {
    p_client_id: clientId,
    p_client_name: clientName,
    p_redirect_uris: redirectUris,
  })
  if (error) return jsonCors({ error: 'registration_failed' }, { status: 500 })

  return jsonCors(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      ...(clientName ? { client_name: clientName } : {}),
    },
    { status: 201 },
  )
}

export function OPTIONS(): Response {
  return corsPreflight()
}
