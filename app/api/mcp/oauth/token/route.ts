import { mintOpaqueToken, sha256Hex, signMcpAccessToken } from '../../crypto'
import {
  ACCESS_TTL_SECONDS,
  anonClient,
  appUrl,
  corsPreflight,
  jsonCors,
  mcpEnabled,
  mcpResourceUrl,
  MCP_SCOPE,
  oauthSigningSecret,
  REFRESH_SCHEME,
  REFRESH_TTL_SECONDS,
} from '../shared'

// OAuth 2.1 token endpoint. Public clients (PKCE) — no client authentication.
// authorization_code: the SECURITY DEFINER redeem fn verifies redirect_uri +
// client_id + PKCE S256 (in SQL), single-use-consumes the code, and issues a
// refresh row — all bound to the code's user_id, never a caller parameter. We
// then mint the audience-bound MCP access token. refresh_token rotates.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function readParams(req: Request): Promise<URLSearchParams> {
  const ct = req.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) {
    try {
      const obj = (await req.json()) as Record<string, unknown>
      const sp = new URLSearchParams()
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string') sp.set(k, v)
      }
      return sp
    } catch {
      return new URLSearchParams()
    }
  }
  return new URLSearchParams(await req.text())
}

function tokenResponse(
  accessToken: string,
  refreshToken: string,
  scope: string,
): Response {
  return jsonCors({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_SECONDS,
    refresh_token: refreshToken,
    scope,
  })
}

// The scope a credential gets is whatever was stored on its grant at consent
// time (mcp_oauth_codes/refresh.scope) — NOT a global constant. So a connection
// that consented to read-only keeps 'mcp:read' across every refresh, and only a
// fresh read+write consent carries 'mcp:write'. Empty/legacy rows fall back to
// the read baseline. This is the consent-bypass guard: refresh never widens scope.
function grantScope(stored: unknown): string {
  const s = typeof stored === 'string' ? stored.trim() : ''
  return s || MCP_SCOPE
}

export async function POST(req: Request): Promise<Response> {
  if (!mcpEnabled()) return new Response('Not found', { status: 404 })
  const base = appUrl()
  const secret = oauthSigningSecret()
  const db = anonClient()
  if (!base || !secret || !db) return jsonCors({ error: 'mcp_misconfigured' }, { status: 500 })

  const params = await readParams(req)
  const grantType = params.get('grant_type') ?? ''
  const resource = mcpResourceUrl(base)

  const mintAccess = (userId: string, scope: string) =>
    signMcpAccessToken(userId, {
      secret,
      resource,
      issuer: base,
      scope,
      ttlSeconds: ACCESS_TTL_SECONDS,
    })

  if (grantType === 'authorization_code') {
    const code = params.get('code') ?? ''
    const redirectUri = params.get('redirect_uri') ?? ''
    const clientId = params.get('client_id') ?? ''
    const codeVerifier = params.get('code_verifier') ?? ''
    if (!code || !redirectUri || !clientId || !codeVerifier) {
      return jsonCors({ error: 'invalid_request' }, { status: 400 })
    }

    const refresh = mintOpaqueToken(REFRESH_SCHEME)
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000).toISOString()

    const { data, error } = await db.rpc('mcp_oauth_redeem_code', {
      p_code_hash: sha256Hex(code),
      p_verifier: codeVerifier,
      p_client_id: clientId,
      p_redirect_uri: redirectUri,
      p_refresh_hash: refresh.hash,
      p_refresh_expires_at: refreshExpiresAt,
    })
    const row = Array.isArray(data) ? data[0] : null
    if (error || !row?.user_id) {
      return jsonCors({ error: 'invalid_grant' }, { status: 400 })
    }
    const scope = grantScope(row.scope)
    return tokenResponse(mintAccess(row.user_id as string, scope), refresh.raw, scope)
  }

  if (grantType === 'refresh_token') {
    const refreshToken = params.get('refresh_token') ?? ''
    if (!refreshToken) return jsonCors({ error: 'invalid_request' }, { status: 400 })

    const next = mintOpaqueToken(REFRESH_SCHEME)
    const nextExpiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000).toISOString()

    const { data, error } = await db.rpc('mcp_oauth_rotate_refresh', {
      p_old_hash: sha256Hex(refreshToken),
      p_new_hash: next.hash,
      p_new_expires_at: nextExpiresAt,
    })
    const row = Array.isArray(data) ? data[0] : null
    if (error || !row?.user_id) {
      return jsonCors({ error: 'invalid_grant' }, { status: 400 })
    }
    const scope = grantScope(row.scope)
    return tokenResponse(mintAccess(row.user_id as string, scope), next.raw, scope)
  }

  return jsonCors({ error: 'unsupported_grant_type' }, { status: 400 })
}

export function OPTIONS(): Response {
  return corsPreflight()
}
