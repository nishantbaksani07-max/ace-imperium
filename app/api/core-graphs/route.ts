import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadCoreGraphs } from '@/lib/insights/loadCoreGraphs'

export const dynamic = 'force-dynamic'

/**
 * GET /api/core-graphs - the goal card's Graph Library, as data. Returns the
 * SAME catalog the Core Room page renders (one shared loader, they can never
 * disagree): every graphable core series for the signed-in user, real points
 * included. Auth-gated, RLS-scoped, strictly read-only. Fetched lazily the
 * first time a user opens "choose the graph" on a goal, so the Vee tab pays
 * nothing until the picker is actually wanted.
 */
export async function GET() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const graphs = await loadCoreGraphs(supabase, user.id)
  return NextResponse.json({ graphs })
}
