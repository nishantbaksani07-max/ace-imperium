import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Shared constants + helpers for the Phase 2 OAuth Authorization-Server
// front-door. We are the AS (Supabase's native OAuth server is disabled and
// has no DCR — see docs/ideas/mcp-phase2-oauth-spike.md); Supabase is only the
// login backend. claude.ai / Desktop / mobile connect by pasting the bare URL
// and signing in, with no token to copy.
//
// The MCP *access token* issued here is HS256-signed with MCP_OAUTH_SIGNING_SECRET
// and stamped with `aud = <resource>` so a plain website session JWT
// (aud:"authenticated") can never be replayed as an MCP bearer. It is NOT the
// token sent to Supabase: per request the route still mints a separate
// aud:"authenticated" RLS JWT (crypto.signSupabaseJwt). Two tokens, two roots.

export const MCP_SCOPE = 'mcp:read' // the baseline scope every credential must carry
export const MCP_WRITE_SCOPE = 'mcp:write' // required by write tools (logging, notes)
// What a fresh connection is granted/consents to. Stored per-grant in SQL
// (mcp_oauth_codes/refresh.scope), so EXISTING read-only grants keep 'mcp:read'
// across refresh — only new consents carry write. No migration needed.
export const MCP_SCOPES_GRANTED = `${MCP_SCOPE} ${MCP_WRITE_SCOPE}`
export const MCP_SCOPES_SUPPORTED = [MCP_SCOPE, MCP_WRITE_SCOPE]

// TTLs (the spike's chosen defaults; access short by design — it is the
// revocation-lag bound, since access tokens are verified statelessly).
export const ACCESS_TTL_SECONDS = 60 * 60 // 1h
export const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30 // 30d
export const CODE_TTL_SECONDS = 60 // authorization code: single-use, 60s

export const TOKEN_USE_ACCESS = 'mcp_access'

export const CLIENT_ID_SCHEME = 'mcpc_'
export const CODE_SCHEME = 'mcpac_' // authorization code
export const REFRESH_SCHEME = 'mcprt_' // refresh token

export function mcpEnabled(): boolean {
  return process.env.MCP_ENABLED === 'true'
}

/** Public base URL of the deployment (issuer). Required for OAuth. */
export function appUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_APP_URL
  return url ? url.replace(/\/+$/, '') : null
}

/** The protected-resource identifier (RFC 8707). MUST string-equal the URL
 *  clients POST JSON-RPC to (/api/mcp/mcp), and the `aud` we stamp on tokens. */
export function mcpResourceUrl(base: string): string {
  return `${base}/api/mcp/mcp`
}

/** HS256 secret for the OAuth MCP access token. Dedicated (NOT the Supabase JWT
 *  secret) so the "token for our route" trust root is separate from the "token
 *  for Supabase RLS" root. Required once Phase 2 OAuth is live. */
export function oauthSigningSecret(): string | null {
  return process.env.MCP_OAUTH_SIGNING_SECRET || null
}

/** Anon Supabase client for the unauthenticated OAuth endpoints (/register,
 *  /token). Calls only SECURITY DEFINER RPCs — never a raw table read. */
export function anonClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return null
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export const oauthPaths = {
  authorize: '/api/mcp/oauth/authorize',
  token: '/api/mcp/oauth/token',
  register: '/api/mcp/oauth/register',
  // Canonical RFC well-known locations (served via next.config rewrites so they
  // work regardless of Next's dot-folder routing). The PRM URL is also what we
  // advertise in `WWW-Authenticate: resource_metadata=...`.
  asMetadata: '/.well-known/oauth-authorization-server',
  prm: '/.well-known/oauth-protected-resource',
} as const

// CORS: browser MCP clients (claude.ai web) fetch discovery cross-origin.
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-protocol-version',
}

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export function jsonCors(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...CORS_HEADERS,
      ...(init.headers ?? {}),
    },
  })
}
