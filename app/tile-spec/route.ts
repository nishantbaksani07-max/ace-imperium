import { TILE_SPEC } from '@/lib/tiles/tileSpec'

/**
 * GET /tile-spec - the PUBLIC, fetchable build rules for a Vitality tile.
 *
 * The same text ships inside the Forge brief's clipboard copy
 * (lib/tiles/forgePrompt.ts), so an AI with no web access never needs this
 * URL; it exists for AIs that prefer to fetch and for humans to read. Plain
 * text, no auth, no secrets - the server gate re-checks every rule on upload,
 * so reading this is a courtesy, not a security boundary. Source of truth for
 * the text: lib/tiles/tileSpec.ts (kept in lockstep with lintTile.ts).
 */

export const dynamic = 'force-static'

export async function GET() {
  return new Response(TILE_SPEC, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  })
}
