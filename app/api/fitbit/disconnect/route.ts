import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  await supabase
    .from('wearable_connections')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', 'fitbit')

  return NextResponse.json({ ok: true })
}
