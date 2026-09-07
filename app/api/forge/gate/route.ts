import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { gateTile } from '@/lib/tiles/gate'

export const dynamic = 'force-dynamic'

/**
 * POST /api/forge/gate - the bouncer's door for dropped tile files.
 *
 * The Forge drop zone (and the Library Upload) sends the raw html of a
 * user-supplied tile here; the server runs the SAME floor the MCP's
 * vitality_add_tile enforces (assertTileExportable) plus the kind-aware
 * Vee-readability read, and answers with one of two verdicts:
 *
 *   { ok: true,  envelope }            install it via tileStore.importTile
 *   { ok: false, errors, fixBrief }    show the fix card; the fixBrief is
 *                                      written FOR the user's AI to consume
 *
 * Auth-gated but touches no user data: judging a file reads nothing and
 * writes nothing; persistence happens client-side through the one importTile
 * socket after a pass. Guardrails live here, not in any prompt - every file
 * faces this scan no matter what conversation produced it.
 */
export async function POST(req: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const html = typeof body.html === 'string' ? body.html : ''
  const name = typeof body.name === 'string' ? body.name : undefined
  if (!html.trim()) return NextResponse.json({ error: 'empty_html' }, { status: 400 })

  return NextResponse.json(gateTile(html, name))
}
