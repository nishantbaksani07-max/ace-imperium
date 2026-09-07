import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { gmailConfigured } from '@/lib/gmail/client'

export const dynamic = 'force-dynamic'

/** Is Gmail set up on the server, and has this user connected an account? */
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ connected: false, configured: gmailConfigured() }, { status: 401 })
  const { data } = await supabase
    .from('gmail_connections')
    .select('email')
    .eq('user_id', user.id)
    .maybeSingle()
  return NextResponse.json({ connected: !!data, email: data?.email ?? null, configured: gmailConfigured() })
}
