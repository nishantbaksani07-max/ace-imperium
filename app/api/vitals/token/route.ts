import 'server-only'

import { randomBytes, createHash } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'

/**
 * Vitals ingest-token management (Phase 4b). Session-authed — the logged-in
 * user mints the bearer token their iOS Shortcut will carry to
 * POST /api/vitals/ingest. Only the sha256 hash is stored; the raw token is
 * returned once here and never again (regenerate to get a new one).
 *
 *   GET  → { exists, last_used_at }     does a token exist yet?
 *   POST → { token, ingest_url }        mint/regenerate (replaces any old one)
 *
 * The "paste your token into the Shortcut" settings UI (Phase 4c-adjacent)
 * will call these; for now they make the endpoint testable.
 */

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('vitals_ingest_tokens')
    .select('last_used_at, created_at')
    .eq('user_id', user.id)
    .maybeSingle()

  return Response.json({ exists: !!data, last_used_at: data?.last_used_at ?? null })
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  // One token per user: drop any existing, then insert the fresh hash.
  await supabase.from('vitals_ingest_tokens').delete().eq('user_id', user.id)

  const token = randomBytes(32).toString('hex')
  const tokenHash = createHash('sha256').update(token).digest('hex')

  const { error } = await supabase
    .from('vitals_ingest_tokens')
    .insert({ user_id: user.id, token_hash: tokenHash, label: 'iOS Shortcut' })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const origin = new URL(req.url).origin
  // The "personal link" carries the token in the URL, so a user pastes ONE
  // thing into their Shortcut — no separate token + Authorization header.
  return Response.json({
    token,
    ingest_url: `${origin}/api/vitals/ingest`,
    link: `${origin}/api/vitals/ingest?key=${token}`,
  })
}
