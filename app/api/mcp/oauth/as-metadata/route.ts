import {
  appUrl,
  corsPreflight,
  jsonCors,
  mcpEnabled,
  MCP_SCOPES_SUPPORTED,
  oauthPaths,
} from '../shared'

// RFC 8414 Authorization Server Metadata. Served (via next.config rewrite) at
// `/.well-known/oauth-authorization-server` (and the openid-configuration alias
// some clients probe) — the client constructs that URL itself from the issuer,
// so we cannot relocate it. Describes OUR /authorize, /token, /register: we are
// the AS, Supabase is only the login backend. Public clients + PKCE S256 only.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  if (!mcpEnabled()) return new Response('Not found', { status: 404 })
  const base = appUrl()
  if (!base) return jsonCors({ error: 'mcp_misconfigured' }, { status: 500 })

  return jsonCors({
    issuer: base,
    authorization_endpoint: `${base}${oauthPaths.authorize}`,
    token_endpoint: `${base}${oauthPaths.token}`,
    registration_endpoint: `${base}${oauthPaths.register}`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    // Public clients only (claude.ai uses PKCE, no client secret).
    token_endpoint_auth_methods_supported: ['none'],
    // PKCE is REQUIRED — we reject `plain` and missing challenges at /authorize.
    code_challenge_methods_supported: ['S256'],
    scopes_supported: MCP_SCOPES_SUPPORTED,
  })
}

export function OPTIONS(): Response {
  return corsPreflight()
}
