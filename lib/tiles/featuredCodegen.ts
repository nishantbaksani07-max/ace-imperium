/**
 * The single render path that turns a featured tile's `build` recipe into its sealed
 * html, via the deterministic MCP builder (infer + renderTile). Used by BOTH:
 *   - scripts/genFeatured.ts   (writes lib/tiles/featuredHtml.json)
 *   - __tests__/featuredTiles.test.ts  (drift alarm: committed html === this output)
 *
 * Keeping it in ONE place is what guarantees the codegen and the drift guard can never
 * disagree. This module imports mcp/ (the tile builder) and so must only ever be pulled
 * in by the script and the test, never by app/component runtime code (it would drag the
 * MCP server source into a client bundle).
 */
import { infer } from '@/mcp/src/tiles/infer'
import { renderTile } from '@/mcp/src/tiles/templates'
import { lintTile } from '@/mcp/src/tiles/lintTile'
import { assertTileExportable } from '@/mcp/src/tiles/uploadEnvelope'
import type { BuildRecipe } from './featured'

/**
 * Render one featured tile's sealed html from its recipe, fully verified:
 *   - infer() derives the tile meta; explicit recipe fields (unit/direction/target)
 *     win over inference so the tile never depends on goal-text parsing.
 *   - scaleMax + the report `key` are pinned post-infer (infer singularizes keys, e.g.
 *     "steps"->"step", "focus"->"focu"; we keep the shipped key BYTE-IDENTICAL so no
 *     user's Vee stream re-keys).
 *   - lintTile must be 0 errors / 0 warnings and assertTileExportable must pass, so a
 *     tile that would not clear the hard floor throws here instead of shipping thin.
 */
export function renderFeaturedHtml(build: BuildRecipe): string {
  const meta = infer({
    goal: build.goal,
    kind: build.kind,
    name: build.name,
    unit: build.unit,
    goalDirection: build.goalDirection,
    target: build.target,
  })
  if (build.scaleMax != null) meta.scaleMax = build.scaleMax
  meta.key = build.key

  const html = renderTile(meta)

  const lint = lintTile(html)
  if (lint.errors !== 0 || lint.warnings !== 0) {
    const detail = lint.findings.map((f) => `${f.severity}:${f.rule}`).join(', ')
    throw new Error(
      `featured "${build.key}" did not lint clean (${lint.errors} errors / ${lint.warnings} warnings): ${detail}`,
    )
  }
  assertTileExportable(html, build.name, build.kind)

  return html
}
