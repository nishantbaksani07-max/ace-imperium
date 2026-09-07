import type { SupabaseClient } from '@supabase/supabase-js'

import { createClient as createServerClient } from '@/lib/supabase/server'

import { mintOpaqueToken, signConsentToken, verifyConsentToken } from '../../crypto'
import {
  appUrl,
  CODE_SCHEME,
  CODE_TTL_SECONDS,
  mcpEnabled,
  mcpResourceUrl,
  MCP_SCOPES_GRANTED,
  oauthSigningSecret,
} from '../shared'

// OAuth 2.1 authorization endpoint. We are the AS; Supabase is the login
// backend. GET validates the client + registered redirect_uri + PKCE, makes the
// user sign in (bounce to /login if needed), then renders an Allow/Deny CONSENT
// page — it does NOT silently mint a code. The Allow button POSTs a signed
// consent token (CSRF + intent binding); only then is a single-use PKCE-bound
// code minted and redirected back. The consent screen is what stops an attacker
// from silently exfiltrating a logged-in user's code to a rogue registered
// client. Connect is not Pro-gated; the tools are (403 at call time).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function redirectBack(redirectUri: string, params: Record<string, string>): Response {
  const u = new URL(redirectUri)
  for (const [k, v] of Object.entries(params)) {
    if (v) u.searchParams.set(k, v)
  }
  return Response.redirect(u.toString(), 302)
}

// Untrusted redirect_uri (missing/unregistered): show an error directly, never
// redirect — that is the open-redirect guard.
function hardError(description: string): Response {
  return new Response(`Authorization error: ${description}`, {
    status: 400,
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
  })
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

/** Look up a registered client; returns its registered redirect_uris + name, or
 *  null if the client is unknown. */
async function getClient(
  supabase: SupabaseClient,
  clientId: string,
): Promise<{ redirectUris: string[]; clientName: string | null } | null> {
  const { data, error } = await supabase.rpc('mcp_oauth_get_client', { p_client_id: clientId })
  if (error) return null
  const row = Array.isArray(data) ? data[0] : null
  if (!row?.redirect_uris) return null
  return { redirectUris: row.redirect_uris as string[], clientName: (row.client_name as string) ?? null }
}

function consentPage(opts: {
  clientName: string
  redirectHost: string
  consentToken: string
  state: string
  base: string
}): Response {
  const name = esc(opts.clientName)
  const host = esc(opts.redirectHost)
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect to Vitality</title>
<style>
  :root { --bg:#04060a; --mint:#6ee7b7; --ink:#e9efe9; --dim:rgba(233,239,233,.62); --line:rgba(110,231,183,.25); }
  * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink);
    font-family:Inter,-apple-system,system-ui,sans-serif; display:flex; min-height:100vh;
    align-items:center; justify-content:center; padding:24px; }
  .card { width:100%; max-width:420px; border:1px solid var(--line); border-radius:16px;
    padding:32px; background:rgba(110,231,183,.04); }
  h1 { font-size:20px; margin:0 0 8px; } p { color:var(--dim); font-size:14px; line-height:1.6; margin:0 0 16px; }
  .who { color:var(--mint); font-weight:600; } .host { font-family:ui-monospace,Menlo,monospace; font-size:13px; }
  ul { color:var(--dim); font-size:13px; line-height:1.7; padding-left:18px; margin:0 0 24px; }
  .row { display:flex; gap:12px; } button { flex:1; font:inherit; font-size:15px; font-weight:600;
    padding:12px; border-radius:999px; cursor:pointer; border:1px solid var(--line); }
  .allow { background:var(--mint); color:#04060a; border:none; } .deny { background:transparent; color:var(--ink); }
</style></head><body>
<div class="card">
  <h1>Connect to Vitality</h1>
  <p><span class="who">${name}</span> wants <strong>read &amp; write</strong> access to your Vitality data and will receive it at <span class="host">${host}</span>.</p>
  <ul><li>It can read your workouts, sleep, weight, nutrition and more.</li>
  <li>It can add entries on your behalf — e.g. log a weigh-in or save a note.</li>
  <li>It cannot delete anything, and you can revoke access anytime in your account.</li></ul>
  <form method="POST" action="/api/mcp/oauth/authorize">
    <input type="hidden" name="consent_token" value="${esc(opts.consentToken)}">
    <input type="hidden" name="state" value="${esc(opts.state)}">
    <div class="row">
      <button class="deny" name="action" value="deny" type="submit">Deny</button>
      <button class="allow" name="action" value="allow" type="submit">Allow</button>
    </div>
  </form>
</div></body></html>`
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

// GET — validate, sign in, render the Allow/Deny consent page (no state change).
export async function GET(req: Request): Promise<Response> {
  if (!mcpEnabled()) return new Response('Not found', { status: 404 })
  const base = appUrl()
  const secret = oauthSigningSecret()
  if (!base || !secret) return hardError('server misconfigured')

  const url = new URL(req.url)
  const p = url.searchParams
  const clientId = p.get('client_id') ?? ''
  const redirectUri = p.get('redirect_uri') ?? ''
  const responseType = p.get('response_type') ?? ''
  const codeChallenge = p.get('code_challenge') ?? ''
  const codeChallengeMethod = p.get('code_challenge_method') ?? ''
  const state = p.get('state') ?? ''
  const resource = p.get('resource') ?? ''

  if (!clientId || !redirectUri) return hardError('missing client_id or redirect_uri')

  const supabase = createServerClient()
  const client = await getClient(supabase, clientId)
  if (!client || !client.redirectUris.includes(redirectUri)) {
    return hardError('unknown client or unregistered redirect_uri')
  }

  // redirect_uri is trusted now → protocol errors go back to the client.
  if (responseType !== 'code') return redirectBack(redirectUri, { error: 'unsupported_response_type', state })
  if (!codeChallenge || codeChallengeMethod !== 'S256') {
    return redirectBack(redirectUri, { error: 'invalid_request', error_description: 'PKCE S256 required', state })
  }
  if (resource && resource !== mcpResourceUrl(base)) {
    return redirectBack(redirectUri, { error: 'invalid_target', state })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    const self = url.pathname + url.search
    return Response.redirect(`${base}/login?next=${encodeURIComponent(self)}`, 302)
  }

  // No code minted on GET. Render consent; the Allow POST carries this token.
  const consentToken = signConsentToken({ clientId, redirectUri, codeChallenge, sub: user.id }, secret)
  let redirectHost = redirectUri
  try {
    redirectHost = new URL(redirectUri).host
  } catch {
    /* validated above */
  }
  return consentPage({
    clientName: client.clientName || clientId,
    redirectHost,
    consentToken,
    state,
    base,
  })
}

// POST — the Allow/Deny submit. CSRF-bound via the signed consent token; only
// here is a code minted.
export async function POST(req: Request): Promise<Response> {
  if (!mcpEnabled()) return new Response('Not found', { status: 404 })
  const base = appUrl()
  const secret = oauthSigningSecret()
  if (!base || !secret) return hardError('server misconfigured')

  // Same-origin only (the form is served from our origin).
  const origin = req.headers.get('origin')
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.get('host')) return hardError('bad origin')
    } catch {
      return hardError('bad origin')
    }
  }

  const form = await req.formData()
  const consentToken = String(form.get('consent_token') ?? '')
  const action = String(form.get('action') ?? '')
  const state = String(form.get('state') ?? '')

  const consent = verifyConsentToken(consentToken, secret)
  if (!consent) return hardError('consent expired or invalid — restart the connection')

  const supabase = createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // The approval must be made BY the user it was issued to.
  if (!user || user.id !== consent.sub) return hardError('session mismatch — restart the connection')

  // Re-validate the client + redirect_uri (defense in depth; registration could
  // have changed since the token was issued).
  const client = await getClient(supabase, consent.clientId)
  if (!client || !client.redirectUris.includes(consent.redirectUri)) {
    return hardError('unknown client or unregistered redirect_uri')
  }

  if (action !== 'allow') {
    return redirectBack(consent.redirectUri, { error: 'access_denied', state })
  }

  // Mint a single-use, PKCE-bound code for this user (auth.uid() inside the fn).
  const { raw, hash } = mintOpaqueToken(CODE_SCHEME)
  const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString()
  const { error } = await supabase.rpc('mcp_oauth_create_code', {
    p_code_hash: hash,
    p_client_id: consent.clientId,
    p_redirect_uri: consent.redirectUri,
    p_code_challenge: consent.codeChallenge,
    p_scope: MCP_SCOPES_GRANTED,
    p_resource: mcpResourceUrl(base),
    p_expires_at: expiresAt,
  })
  if (error) return redirectBack(consent.redirectUri, { error: 'server_error', state })

  return redirectBack(consent.redirectUri, { code: raw, state })
}
