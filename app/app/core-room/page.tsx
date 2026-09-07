import { createClient } from '@/lib/supabase/server'
import { loadCoreGraphs } from '@/lib/insights/loadCoreGraphs'
import CoreRoom from './CoreRoom'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'The Core Room · Imperium' }

/**
 * /app/core-room - THE CORE ROOM: every graphable series the core tiles have
 * ever recorded for THIS user, one browsable library. Server-side, RLS-scoped,
 * strictly READ-ONLY (the room is a window, not a lever - it writes nothing,
 * so it can break nothing). The read lives in lib/insights/loadCoreGraphs so
 * this page and the goal picker's /api/core-graphs can never disagree.
 */
export default async function CoreRoomPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const graphs = await loadCoreGraphs(supabase, user.id)
  return <CoreRoom graphs={graphs} />
}
