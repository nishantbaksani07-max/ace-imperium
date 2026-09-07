import { createClient } from '@/lib/supabase/server'

import { mintToken } from '../crypto'

// Mint a hosted-MCP connect credential. Browser-session-gated (the user must be
// logged into the website) + a same-origin check, since this mints a secret.
// The raw `vitm_…` is returned exactly ONCE here and never persisted — only its
// hash/prefix/last4 land in `mcp_tokens` (via the RLS insert policy). Listing +
// revoking happen client-side against the same table under RLS, so this route is
// mint-only.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TOKEN_TTL_DAYS = 90

const noStore = { 'Cache-Control': 'no-store' }

export async function POST(req: Request): Promise<Response> {
  // CSRF: a forged cross-site POST would carry the session cookie but a foreign
  // Origin. Require Origin's host to match the request host when present.
  const origin = req.headers.get('origin')
  if (origin) {
    const host = req.headers.get('host')
    let originHost: string | null = null
    try {
      originHost = new URL(origin).host
    } catch {
      originHost = null
    }
    if (!originHost || originHost !== host) {
      return Response.json({ error: 'bad_origin' }, { status: 403, headers: noStore })
    }
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: noStore })
  }

  // Optional device label.
  let name = 'Claude'
  try {
    const body = await req.json()
    if (body && typeof body.name === 'string' && body.name.trim()) {
      name = body.name.trim().slice(0, 40)
    }
  } catch {
    // no/invalid body — keep the default label
  }

  const { raw, tokenHash, tokenPrefix, tokenLast4 } = mintToken()
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 86_400_000).toISOString()

  const { error } = await supabase.from('mcp_tokens').insert({
    user_id: user.id,
    name,
    token_hash: tokenHash,
    token_prefix: tokenPrefix,
    token_last4: tokenLast4,
    expires_at: expiresAt,
  })
  if (error) {
    return Response.json({ error: 'could_not_mint' }, { status: 500, headers: noStore })
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
  const addCommand =
    `claude mcp add --transport http vitality ${base}/api/mcp/mcp ` +
    `--header "Authorization: Bearer ${raw}"`

  return Response.json({ raw, addCommand, expiresAt }, { headers: noStore })
}
