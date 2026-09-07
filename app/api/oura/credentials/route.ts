import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sealSecret } from '@/lib/wearables/secretbox'

export const dynamic = 'force-dynamic'

/**
 * Stores (or clears) the user's own Oura developer-app credentials.
 *
 * Oura's shared developer app is capped to a handful of authorized users while
 * it waits on Oura's approval, so each user brings their own: they register a
 * free Oura developer app, and its owner can always authorize their own Oura
 * account without waiting on Oura's review. We persist client_id + client_secret
 * on the user's wearable_connections row (RLS-scoped to them, server-only —
 * plaintext for v1, same as the token columns; encryption-at-rest is the shared
 * pre-launch hardening task).
 *
 * The row is created here BEFORE the OAuth round-trip, so /api/oura/connect has
 * an app to authorize against. Token columns stay null until the callback.
 */
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { clientId?: unknown; clientSecret?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : ''
  const clientSecret = typeof body.clientSecret === 'string' ? body.clientSecret.trim() : ''
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'client_id and client_secret are required' }, { status: 400 })
  }

  // Upsert keeps any existing tokens untouched (columns not in the payload are
  // left as-is on conflict) — so re-saving keys mid-connection doesn't sign the
  // user out, and saving keys for the first time creates a tokenless row.
  const { error } = await supabase
    .from('wearable_connections')
    .upsert(
      { user_id: user.id, provider: 'oura', client_id: clientId, client_secret: sealSecret(clientSecret) },
      { onConflict: 'user_id,provider' },
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ saved: true })
}

/**
 * Forgets the user's Oura app keys entirely (and any connection with them).
 * Use disconnect to keep the keys but drop the live tokens.
 */
export async function DELETE() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('wearable_connections')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', 'oura')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cleared: true })
}
