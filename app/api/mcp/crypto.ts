import 'server-only'

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { TOKEN_USE_ACCESS } from './oauth/shared'

// Crypto for the hosted MCP credential, shared by the resolver (this route) and
// the future issuance endpoint (`POST /api/mcp/token`) so the two never disagree
// on token shape or hashing. Pure node:crypto — no extra dependency.

// Opaque MCP credential: `vitm_<base64url(32 bytes)>`. The raw value is shown
// once at issuance; only `tokenHash` + `tokenPrefix` + `tokenLast4` are stored.
export const TOKEN_SCHEME = 'vitm_'
const PREFIX_LEN = 12 // 'vitm_' (5) + 7 chars — non-secret, indexed for lookup

/** Mint a fresh raw credential + its stored derivatives. Raw is never persisted. */
export function mintToken(): {
  raw: string
  tokenHash: string
  tokenPrefix: string
  tokenLast4: string
} {
  const raw = TOKEN_SCHEME + randomBytes(32).toString('base64url')
  return {
    raw,
    tokenHash: sha256Hex(raw),
    tokenPrefix: prefixOf(raw),
    tokenLast4: raw.slice(-4),
  }
}

export function isMcpToken(bearer: string): boolean {
  return bearer.startsWith(TOKEN_SCHEME)
}

/** Non-secret prefix used to narrow the resolver lookup before the hash match. */
export function prefixOf(raw: string): string {
  return raw.slice(0, PREFIX_LEN)
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

const b64url = (input: string): string =>
  Buffer.from(input, 'utf8').toString('base64url')

/**
 * Mint a short-lived Supabase-compatible JWT (HS256) for `userId`, signed with
 * the project's JWT secret. This is open-decision #7's load-bearing primitive:
 * it turns the resolver's `user_id` into an RLS principal. The token is built
 * server-side, lives only for the duration of one MCP request (it is sent to
 * Vitality's own Supabase as the Bearer and nowhere else), and carries
 * `role: 'authenticated'` + `sub: userId` so PostgREST sets the right DB role
 * and `auth.uid()` resolves to this user — RLS unchanged.
 */
export function signSupabaseJwt(
  userId: string,
  secret: string,
  opts: { supabaseUrl: string; ttlSeconds?: number },
): string {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = {
    sub: userId,
    role: 'authenticated',
    aud: 'authenticated',
    iss: `${opts.supabaseUrl}/auth/v1`,
    iat: now,
    exp: now + (opts.ttlSeconds ?? 120),
  }
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const signature = createHmac('sha256', secret).update(signingInput).digest('base64url')
  return `${signingInput}.${signature}`
}

// ── Phase 2 OAuth: the MCP access token ──────────────────────────────────────
// Distinct from signSupabaseJwt above. signSupabaseJwt mints the per-request
// RLS principal sent to Supabase (aud:"authenticated"). This mints the token
// the OAuth CLIENT holds and presents to OUR route: HS256 signed with
// MCP_OAUTH_SIGNING_SECRET and stamped `aud = <resource>` (the /api/mcp/mcp
// URL). Because we set `aud` and check it on verify, a plain website session
// JWT (aud:"authenticated") can never be replayed as an MCP bearer.

/** Mint the OAuth MCP access token (the bearer the client sends to /api/mcp/mcp). */
export function signMcpAccessToken(
  userId: string,
  opts: { secret: string; resource: string; issuer: string; scope: string; ttlSeconds: number },
): string {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = {
    sub: userId,
    aud: opts.resource, // RFC 8707 audience binding
    iss: opts.issuer,
    scope: opts.scope,
    token_use: TOKEN_USE_ACCESS,
    iat: now,
    exp: now + opts.ttlSeconds,
  }
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const signature = createHmac('sha256', opts.secret).update(signingInput).digest('base64url')
  return `${signingInput}.${signature}`
}

/**
 * Verify an MCP access token: HS256 signature (timing-safe), not expired, the
 * `token_use` is ours, and `aud` string-equals the expected resource (the
 * confused-deputy control). Returns the subject + scope, or null on any failure.
 */
export function verifyMcpAccessToken(
  jwt: string,
  opts: { secret: string; expectedAud: string; issuer: string },
): { userId: string; scope: string } | null {
  const parts = jwt.split('.')
  if (parts.length !== 3) return null
  const [encodedHeader, encodedPayload, encodedSig] = parts
  const signingInput = `${encodedHeader}.${encodedPayload}`

  // Pin the algorithm (reject alg-confusion / "none").
  let header: { alg?: string }
  try {
    header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (header.alg !== 'HS256') return null

  const expected = createHmac('sha256', opts.secret).update(signingInput).digest()
  let provided: Buffer
  try {
    provided = Buffer.from(encodedSig, 'base64url')
  } catch {
    return null
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null

  let payload: {
    sub?: unknown
    aud?: unknown
    iss?: unknown
    scope?: unknown
    token_use?: unknown
    exp?: unknown
  }
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
  } catch {
    return null
  }

  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.exp !== 'number' || payload.exp < now) return null
  if (payload.token_use !== TOKEN_USE_ACCESS) return null
  if (payload.aud !== opts.expectedAud) return null
  if (payload.iss !== opts.issuer) return null
  if (typeof payload.sub !== 'string' || !payload.sub) return null

  return { userId: payload.sub, scope: typeof payload.scope === 'string' ? payload.scope : '' }
}

/** A JWT-looking bearer (3 dot-separated base64url segments). Lets the resolver
 *  branch between the opaque `vitm_` credential and an OAuth access token. */
export function looksLikeJwt(bearer: string): boolean {
  const parts = bearer.split('.')
  return parts.length === 3 && parts.every((p) => p.length > 0)
}

// ── Opaque OAuth secrets (authorization codes + refresh tokens) ──────────────
// Same shape as the vitm_ credential: a high-entropy `<scheme><base64url>` raw
// value whose sha256 is what we store. The raw is delivered once (code → via
// redirect; refresh → in the token response) and never persisted.

export function mintOpaqueToken(scheme: string): { raw: string; hash: string } {
  const raw = scheme + randomBytes(32).toString('base64url')
  return { raw, hash: sha256Hex(raw) }
}

/** Public, non-secret client identifier issued at DCR. */
export function randomClientId(scheme: string): string {
  return scheme + randomBytes(24).toString('base64url')
}

// ── OAuth consent token (CSRF + intent binding for the /authorize Allow step) ──
// The /authorize GET renders an Allow/Deny page; the Allow POST carries this
// signed token. It binds the approval to (client, redirect, PKCE challenge, the
// approving user) for a short window, so an attacker can neither forge a consent
// POST (no secret) nor replay one across users. HMAC over the same MCP signing
// secret.

type ConsentData = { clientId: string; redirectUri: string; codeChallenge: string; sub: string }

export function signConsentToken(data: ConsentData, secret: string, ttlSeconds = 300): string {
  const payload = { ...data, exp: Math.floor(Date.now() / 1000) + ttlSeconds }
  const body = b64url(JSON.stringify(payload))
  const sig = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyConsentToken(token: string, secret: string): ConsentData | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = createHmac('sha256', secret).update(body).digest()
  let provided: Buffer
  try {
    provided = Buffer.from(sig, 'base64url')
  } catch {
    return null
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null
  let p: { clientId?: unknown; redirectUri?: unknown; codeChallenge?: unknown; sub?: unknown; exp?: unknown }
  try {
    p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (typeof p.exp !== 'number' || p.exp < Math.floor(Date.now() / 1000)) return null
  if (
    typeof p.clientId !== 'string' ||
    typeof p.redirectUri !== 'string' ||
    typeof p.codeChallenge !== 'string' ||
    typeof p.sub !== 'string'
  ) {
    return null
  }
  return { clientId: p.clientId, redirectUri: p.redirectUri, codeChallenge: p.codeChallenge, sub: p.sub }
}
