/**
 * buildTile - the in-app tile builder's brain, shared by the /api/create-tile
 * route and its test so they can never disagree.
 *
 * It is the SAME deterministic path scaffold_tile uses (infer -> renderTile from
 * mcp/src/tiles), run server-side, so a user builds a full-grade tile - progress
 * ring, target-aware 7-day chart, streak, warm insight - for ZERO tokens and no
 * Claude. This is why an in-app builder is possible at all: the render is pure
 * tested code, not an LLM call.
 *
 * SERVER-ONLY. Like lib/tiles/featuredCodegen, this imports mcp/ (the tile
 * builder) so it must only ever be pulled into a route handler or a test, never
 * a client bundle (it would drag the MCP server source into the browser).
 *
 * Lint-then-recolor order matters: lintTile enforces the templates' native mint
 * brand rules (e.g. the mint ::selection), so we prove the tile on its mint
 * render, THEN apply the accent recolor - a pure literal color swap that cannot
 * change the seal or structure. That keeps every accent (iris, azure, violet,
 * rose, seafoam) shippable without weakening the hard floor.
 */
import { infer } from '@/mcp/src/tiles/infer'
import { renderTile } from '@/mcp/src/tiles/templates'
import { lintTile } from '@/mcp/src/tiles/lintTile'
import { assertTileExportable } from '@/mcp/src/tiles/uploadEnvelope'
import { ACCENTS, recolorTile, type TileAccent } from './tileRecolor'
import { sampleValues } from './buildSample'
import type { ReportKind } from './types'

export interface BuildTileInput {
  /** The user's plain-English "what do you want to track?" line. */
  prompt: string
  /** Override the inferred display name. */
  name?: string
  /** Override the daily goal (additive kinds only). */
  target?: number
  /** Override the inferred unit. */
  unit?: string
  /** Override the inferred goal direction. */
  goalDirection?: 'up' | 'down'
  /** The accent to recolor to. Defaults to mint (the native template accent). */
  accent?: TileAccent
}

export interface BuiltTileMeta {
  key: string
  label: string
  kind: ReportKind
  goalDirection?: 'up' | 'down'
  unit: string
  target?: number
  scaleMax?: number
  accent: TileAccent
}

export interface BuiltTile {
  /** The finished, sealed tile HTML (already recolored to the chosen accent). */
  html: string
  meta: BuiltTileMeta
  /** 7 sample values (oldest -> today) for the builder's alive preview only. */
  sampleValues: number[]
}

export function buildTile(input: BuildTileInput): BuiltTile {
  const prompt = (input.prompt ?? '').trim()
  if (!prompt) throw new Error('buildTile: empty prompt')

  // Any accent in the ACCENTS map is buildable; anything else falls back to
  // mint, the templates' native accent (fail soft, never fail the build).
  const accent: TileAccent = input.accent && ACCENTS[input.accent] ? input.accent : 'mint'

  const meta = infer({
    goal: prompt,
    name: input.name?.trim() || undefined,
    unit: input.unit?.trim() || undefined,
    goalDirection: input.goalDirection,
    target: input.target && input.target > 0 ? input.target : undefined,
  })

  // Prove the tile on its native mint render (the floor lintTile enforces)...
  const mintHtml = renderTile(meta)
  const lint = lintTile(mintHtml)
  if (lint.errors > 0) {
    const detail = lint.findings
      .filter((f) => f.severity === 'error')
      .map((f) => f.rule)
      .join(', ')
    throw new Error(`buildTile: tile did not lint clean (${lint.errors} errors: ${detail})`)
  }
  assertTileExportable(mintHtml, meta.label, meta.kind)

  // ...then recolor. A pure literal swap, so the proof above still holds.
  const html = recolorTile(mintHtml, accent)

  // infer can return 'neutral'; the report contract + tile envelope only carry
  // 'up'/'down', so a neutral direction is simply no direction downstream.
  const goalDirection: 'up' | 'down' | undefined =
    meta.goalDirection === 'up' || meta.goalDirection === 'down' ? meta.goalDirection : undefined

  return {
    html,
    meta: {
      key: meta.key,
      label: meta.label,
      kind: meta.kind,
      goalDirection,
      unit: meta.unit,
      target: meta.target,
      scaleMax: meta.scaleMax,
      accent,
    },
    sampleValues: sampleValues({
      kind: meta.kind,
      target: meta.target,
      scaleMax: meta.scaleMax,
      goalDirection,
    }),
  }
}
