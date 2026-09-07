import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncLatest, maybeBackfillHistory } from '@/lib/oura/client'

export const dynamic = 'force-dynamic'

export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const result = await syncLatest(supabase, user.id)
    // TRAIN 5 one-time catchup: users who connected before backfill shipped
    // get their ~30 days of history on the next sync. Best-effort, never
    // fails the sync, and self-disarms via history_backfilled_at.
    await maybeBackfillHistory(supabase, user.id)
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'sync_failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
