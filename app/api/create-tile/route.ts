import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildTile } from '@/lib/tiles/buildTile'
import { ACCENTS, type TileAccent } from '@/lib/tiles/tileRecolor'

export const dynamic = 'force-dynamic'

/**
 * POST /api/create-tile - the in-app tile builder's server endpoint.
 *
 * Runs the DETERMINISTIC builder (infer + renderTile, the same path scaffold_tile
 * uses) fully server-side and hands back a finished, sealed, full-grade tile. No
 * LLM, no Claude, no tokens - so a user can build and re-build freely. The client
 * shows the returned HTML in a sandboxed iframe and, on Keep, installs it through
 * the normal tileStore.importTile socket.
 *
 * Body: { prompt, name?, target?, unit?, goalDirection?, accent? }. The client
 * accumulates refinement knobs into these fields and re-requests; the server is
 * stateless and re-infers from the original prompt + the merged overrides each
 * time.
 *
 * Auth-gated (must be a signed-in user) but touches no user data - building a tile
 * reads nothing and writes nothing; persistence happens later via importTile.
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

  const prompt = typeof body.prompt === 'string' ? body.prompt.slice(0, 200) : ''
  if (!prompt.trim()) return NextResponse.json({ error: 'empty_prompt' }, { status: 400 })

  try {
    const built = buildTile({
      prompt,
      name: typeof body.name === 'string' ? body.name.slice(0, 40) : undefined,
      target: typeof body.target === 'number' && isFinite(body.target) ? body.target : undefined,
      unit: typeof body.unit === 'string' ? body.unit.slice(0, 24) : undefined,
      goalDirection: body.goalDirection === 'up' || body.goalDirection === 'down' ? body.goalDirection : undefined,
      // Accept any real accent (mint/iris/azure/violet/rose/seafoam); buildTile
      // fail-softs an unknown accent to mint, so an unrecognized value is safe.
      accent: typeof body.accent === 'string' && body.accent in ACCENTS ? (body.accent as TileAccent) : 'mint',
    })
    return NextResponse.json({ ok: true, ...built })
  } catch {
    // The deterministic builder should always produce a clean tile; a throw here
    // means an unexpected input slipped the floor. Fail closed, never ship a tile
    // that did not clear lint.
    return NextResponse.json({ error: 'build_failed' }, { status: 422 })
  }
}
