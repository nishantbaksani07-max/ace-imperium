import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { assertPro } from '@/lib/auth/tier'
import { readPaywallConfig } from '@/lib/auth/paywall'
import type { VitalityDb } from '@/mcp/src/supabase'

import {
  isMcpToken,
  looksLikeJwt,
  prefixOf,
  sha256Hex,
  signSupabaseJwt,
  verifyMcpAccessToken,
} from './crypto'
import { appUrl as oauthAppUrl, mcpResourceUrl, MCP_SCOPE, MCP_SCOPES_GRANTED, oauthSigningSecret } from './oauth/shared'

// Headless auth for the hosted MCP route. The mental model: this is the
// request-time analogue of `lib/supabase/server.ts` — it reads identity from an
// opaque `Authorization: Bearer vitm_…` credential (resolved server-side)
// instead of from the session cookie, and yields an RLS-scoped client so every
// tool the request runs is confined to that user's rows.
//
// Flow: resolve credential → userId (via the SECURITY DEFINER RPC; no service
// role, no anon table grant) → mint a short-lived user JWT → build the
// per-request RLS client → strict tier gate. RLS is the only boundary.

export type AuthResult =
  | { ok: true; vdb: VitalityDb }
  | { ok: false; status: number; error: string }

type McpEnv = {
  supabaseUrl: string
  anonKey: string
  jwtSecret: string
}

function readEnv(): McpEnv | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const jwtSecret = process.env.SUPABASE_JWT_SECRET
  if (!supabaseUrl || !anonKey || !jwtSecret) return null
  return { supabaseUrl, anonKey, jwtSecret }
}

/** Global write kill-switch (hosted route only). Writes are ON by default; set
 *  `MCP_WRITE_ENABLED=false` in Vercel to instantly make every connection
 *  read-only (we swap `mcp:write` for a paused marker in the granted scope before
 *  the client is built, so the write tools' `requireWrite` refuses with an honest
 *  "temporarily paused" message instead of reconnect advice). Read-per-request so
 *  flipping it takes effect on the next call, no redeploy. The stdio CLI is the
 *  local user on their own machine and is unaffected. */
function writesEnabled(): boolean {
  return process.env.MCP_WRITE_ENABLED !== 'false'
}

function bearerOf(req: Request): string | null {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!header) return null
  const [scheme, ...rest] = header.split(' ')
  if (scheme.toLowerCase() !== 'bearer' || rest.length === 0) return null
  const value = rest.join(' ').trim()
  return value || null
}

/**
 * Resolve the opaque credential to a userId via the SECURITY DEFINER resolver.
 * Returns undefined for any missing/expired/revoked/unknown credential — the
 * function never exposes row data, so it cannot be used as a token-hash oracle.
 */
type Resolved = { userId: string; scope: string }

async function resolveCredential(bearer: string, env: McpEnv): Promise<Resolved | undefined> {
  // Phase 1: opaque `vitm_` credential → SECURITY DEFINER resolver. These are the
  // user's OWN tokens, minted via /account for their own automation, so they
  // carry full read+write — there is no third party to consent on their behalf.
  if (isMcpToken(bearer)) {
    const anon = createClient(env.supabaseUrl, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await anon.rpc('mcp_resolve_token', {
      p_prefix: prefixOf(bearer),
      p_hash: sha256Hex(bearer),
    })
    if (error) return undefined
    const row = Array.isArray(data) ? data[0] : data
    const userId = row?.user_id as string | undefined
    return userId ? { userId, scope: MCP_SCOPES_GRANTED } : undefined
  }

  // Phase 2: OAuth MCP access token (JWT) → verify HS256 signature + `aud`
  // (RFC 8707). This is the ONLY resolve mechanism Phase 2 adds; everything
  // below the resolve — buildVitalityDb (which still mints the SEPARATE
  // aud:"authenticated" RLS JWT), strict assertPro, scope — is unchanged. A
  // plain website session JWT has aud:"authenticated", not our resource, so it
  // fails the aud check here and can never be replayed as an MCP bearer.
  if (looksLikeJwt(bearer)) {
    const base = oauthAppUrl()
    const secret = oauthSigningSecret()
    if (!base || !secret) return undefined
    const verified = verifyMcpAccessToken(bearer, {
      secret,
      expectedAud: mcpResourceUrl(base),
      issuer: base,
    })
    return verified ? { userId: verified.userId, scope: verified.scope } : undefined
  }

  return undefined
}

/** Build the per-request RLS-scoped client: the minted JWT rides as the Bearer
 *  to Vitality's own Supabase (and nowhere else), so auth.uid() = userId. The
 *  granted scopes travel on the client so write tools can refuse a read-only
 *  credential — RLS already confines rows; scope confines capability. */
function buildVitalityDb(userId: string, scope: string, env: McpEnv): VitalityDb {
  const accessToken = signSupabaseJwt(userId, env.jwtSecret, { supabaseUrl: env.supabaseUrl })
  // The web app and the vendored mcp/ package each resolve their own copy of
  // @supabase/supabase-js, so createClient()'s type is nominally (not structurally)
  // distinct from the one VitalityDb expects. Bridge the duplicate-package boundary
  // with a type-only cast; the runtime object is identical.
  const db = createClient(env.supabaseUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  }) as unknown as VitalityDb['db']
  return { db, userId, mode: 'user', scopes: scope.split(/\s+/).filter(Boolean) }
}

export async function authenticateMcpRequest(req: Request): Promise<AuthResult> {
  const env = readEnv()
  if (!env) return { ok: false, status: 500, error: 'mcp_misconfigured' }

  const bearer = bearerOf(req)
  if (!bearer) return { ok: false, status: 401, error: 'missing_credential' }

  const resolved = await resolveCredential(bearer, env)
  if (!resolved) return { ok: false, status: 401, error: 'invalid_credential' }
  const { userId, scope } = resolved

  // M5 (defense-in-depth): the credential must carry the mcp:read scope. Today
  // every credential is minted with exactly this scope, so this never trips —
  // but it stops a future broader-scoped token from reaching the tools unchecked.
  if (!scope.split(/\s+/).includes(MCP_SCOPE)) {
    return { ok: false, status: 403, error: 'insufficient_scope' }
  }

  // Global kill-switch: neutralize write capability before the client is built so
  // a single Vercel env flip pauses the whole write surface (read stays). The
  // granted 'mcp:write' is swapped for a paused marker rather than dropped, so
  // requireWrite can tell "paused by the Vitality team" apart from "never granted"
  // and give guidance that actually helps (wait vs reconnect). Mirrors
  // WRITE_PAUSED_SCOPE in mcp/src/supabase.ts; keep the literals identical.
  const effectiveScope = writesEnabled()
    ? scope
    : scope.split(/\s+/).map((s) => (s === 'mcp:write' ? 'mcp:write:paused' : s)).join(' ')

  const vdb = buildVitalityDb(userId, effectiveScope, env)

  // The MCP honors the SAME whole-app paywall master switch as the /app layout
  // (lib/auth/paywall.ts): while PAYWALL_ENABLED !== 'true', every signed-in
  // user passes, exactly like the web. Before this, the MCP demanded Pro
  // unconditionally, so with the launch paywall OFF the whole create-tile loop
  // was dead behind a gate the rest of the app did not have (found live
  // 2026-07-10: token minted fine, then every /api/mcp/mcp call 403
  // requires_pro). Flip PAYWALL_ENABLED=true and this gate arms again.
  if (readPaywallConfig(process.env).enabled) {
    const gate = await assertPro(vdb.db as unknown as Parameters<typeof assertPro>[0], userId, { strict: true })
    if (!gate.ok) {
      // Infra blip → 503 retryable, never "pay again". Genuine non-pro/lapsed → 403.
      if (gate.reason === 'error') return { ok: false, status: 503, error: 'temporarily_unavailable' }
      return { ok: false, status: 403, error: 'requires_pro' }
    }
  }

  return { ok: true, vdb }
}
