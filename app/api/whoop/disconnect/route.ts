import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Drops the user's Whoop connection. The tokens are forgotten on our side
 * (the user can also revoke from their Whoop account settings), but we KEEP
 * their own app's client_id + client_secret so reconnecting is one tap and
 * doesn't mean re-pasting keys. To forget the keys too, DELETE
 * /api/whoop/credentials.
 */
export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('wearable_connections')
    .update({
      encrypted_access_token: null,
      encrypted_refresh_token: null,
      access_token_expires_at: null,
      provider_user_id: null,
    })
    .eq('user_id', user.id)
    .eq('provider', 'whoop')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ disconnected: true })
}
