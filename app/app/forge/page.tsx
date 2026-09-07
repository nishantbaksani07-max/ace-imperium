import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ForgeStudio from './ForgeStudio'

export const dynamic = 'force-dynamic'

/**
 * /app/forge - the storefront for Big Brother: describe ANY idea in plain
 * words, copy the build brief for whatever AI you have, and drop the finished
 * .html file on the drop zone. The server gate (/api/forge/gate) judges every
 * file with the same floor the MCP's vitality_add_tile enforces; a pass
 * installs through the one importTile socket, a fail hands back a fix note
 * written for the AI. Claude Code users skip the file entirely via the
 * one-time `claude mcp add --scope user` block at the bottom.
 *
 * The claude.ai handoff (claude.ai/new?q=), the connect card, and the
 * "Claude connected" pill are gone (2026-07-11): URL truncation, composer
 * draft-stacking, and claude.ai's caution banner made that lane unshippable,
 * and the pill could never be verified honestly from here.
 */
export default async function ForgePage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <ForgeStudio userId={user.id} />
}
