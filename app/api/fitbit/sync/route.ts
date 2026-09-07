import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncLatest } from '@/lib/fitbit/client'

export const dynamic = 'force-dynamic'

export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const result = await syncLatest(supabase, user.id)
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'sync_failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
