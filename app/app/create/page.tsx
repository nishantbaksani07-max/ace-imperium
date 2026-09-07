import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CreateTile from './CreateTile'
import TileBuilder from './TileBuilder'

export const dynamic = 'force-dynamic'

/**
 * /app/create - the one hero "create a tile" path.
 *
 * Default: TileBuilder. The user types what they want to track in plain words and
 * the deterministic server builder (/api/create-tile -> infer + renderTile) hands
 * back a finished, sealed, full-grade tile for zero tokens and no Claude. This is
 * the front door for everyone, including users who never touch Claude.
 *
 * ?mode=advanced: CreateTile, the paste-your-own-HTML editor - the quiet power-user
 * path (hand-written or MCP-scaffolded tiles). Same sealed iframe host + the same
 * tileStore.importTile socket underneath, so both paths land a tile on the dashboard
 * identically and speak the Vitality bridge (save / load / report into Vee).
 */
export default async function CreatePage({
  searchParams,
}: {
  searchParams: { mode?: string; idea?: string }
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (searchParams?.mode === 'advanced') return <CreateTile userId={user.id} />
  // ?idea=<text> prefills the finder bar (the Vee goals panel's
  // "Create a tile for this" door lands here with the goal title).
  const idea = (searchParams?.idea ?? '').slice(0, 200)
  return <TileBuilder userId={user.id} initialIdea={idea} />
}
