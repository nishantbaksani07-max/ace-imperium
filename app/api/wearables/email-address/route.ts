import 'server-only'

import { randomBytes } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'

/*
 * The signed-in user's inbound email address for forwarding wearable summaries.
 *
 *   GET → { address, handle, last_used_at, configured }
 *
 * Mints a handle on first call and is idempotent thereafter (one row per user,
 * enforced by the unique user_id). The address is what the "forward your emails"
 * card displays; the inbound Worker reverses it back to this user via
 * /api/wearables/email. `configured` is false until the inbound domain env is
 * set, so the card can show "coming soon" instead of a dead address.
 */

const DOMAIN = process.env.NEXT_PUBLIC_EMAIL_INGEST_DOMAIN || 'in.vitality.app'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const configured = !!process.env.NEXT_PUBLIC_EMAIL_INGEST_DOMAIN

  let { data: row } = await supabase
    .from('email_ingest_addresses')
    .select('handle, last_used_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!row) {
    // 10 bytes → 20 hex chars (~80 bits): unguessable, and well under the 64-char
    // email local-part limit even with the "u-" prefix.
    const handle = randomBytes(10).toString('hex')
    const { data: inserted, error } = await supabase
      .from('email_ingest_addresses')
      .insert({ user_id: user.id, handle })
      .select('handle, last_used_at')
      .single()

    if (error) {
      // Lost an insert race (two tabs minting at once): the row now exists, re-read it.
      const { data: again } = await supabase
        .from('email_ingest_addresses')
        .select('handle, last_used_at')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!again) return Response.json({ error: error.message }, { status: 500 })
      row = again
    } else {
      row = inserted
    }
  }

  return Response.json({
    address: `u-${row.handle}@${DOMAIN}`,
    handle: row.handle,
    last_used_at: row.last_used_at ?? null,
    configured,
  })
}
