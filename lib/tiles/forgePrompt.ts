/**
 * buildForgePrompt - the PURE composer behind the Forge tile (/app/forge).
 *
 * The pivot (2026-07-11): the claude.ai/new?q= handoff is DEAD (URL truncation,
 * composer draft-stacking, and claude.ai's caution banner on prefilled prompts
 * made it unshippable). Forge now has two lanes and this composes both:
 *
 *   brief - the UNIVERSAL build brief, copied to the clipboard and pasted into
 *           ANY AI the user has (Claude Code, claude.ai, anything). It assumes
 *           NO tools: read the public /tile-spec URL, hand back ONE sealed
 *           .html file, and the user drops it on Forge's drop zone where the
 *           server gate judges it (fix-brief round-trip on failure).
 *
 *   code  - the Claude Code POWER LANE: the one-time `claude mcp add` hookup
 *           (now --scope user so it works in every folder), then the real MCP
 *           ritual: vitality_tile_kit -> hand-author -> check_tile to 0 errors
 *           -> vitality_add_tile with kind + born classification. The tile
 *           lands on the dashboard without any file handling.
 *
 * Hard rule: no em dash anywhere in this copy, only plain " - " hyphens.
 * The idea is embedded verbatim, but any em dash the user typed is swapped
 * for " - " so the rule holds end to end. NO copy anywhere may point users
 * at claude.ai Settings > Connectors - that path is deleted.
 */

import { TILE_SPEC } from './tileSpec'

export const FORGE_MCP_URL = 'http://localhost:3000/api/mcp/mcp'

/** The public, fetchable tile spec (app/tile-spec/route.ts serves lib/tiles/tileSpec.ts). */
export const TILE_SPEC_URL = 'http://localhost:3000/tile-spec'

/** The one-time Claude Code hookup. --scope user: registered for every folder,
 *  not just the directory it was run in ("worked yesterday, broken today in a
 *  new project" is a support ticket we refuse to ship). */
export const FORGE_CONNECT_CMD = `claude mcp add --scope user --transport http vitality ${FORGE_MCP_URL}`

/** The kit's real domain list (vitality_tile_kit inputSchema in mcp/src/tools.ts). */
const KIT_DOMAINS = 'food, workout, supplement, vee, finance, vitals, goals'

export interface ForgePrompt {
  /** The universal build brief: any AI, no tools assumed, ends at the drop zone. */
  brief: string
  /** Claude Code power lane: connect command first, then the MCP ritual. */
  code: string
}

/** Hard cap on the embedded idea (mirrored as maxLength on the Forge textarea). */
export const FORGE_IDEA_MAX = 1500

/**
 * Flatten the idea to one honest line: trim, collapse whitespace, and swap
 * any em dash for " - " so the no-em-dash rule survives user input. A blank
 * idea falls back to a line that makes the AI ask instead of guessing.
 */
function cleanIdea(raw: string): string {
  const flat = raw
    .replace(/—/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, FORGE_IDEA_MAX)
  return flat || 'a tile I will describe when you ask me'
}

/** The universal brief: no tools, no fetching, one file back, the gate judges it.
 *  The FULL spec rides along under the brief, so one paste hands any AI the
 *  complete rulebook + design DNA even if it cannot fetch a URL. */
function universalBrief(idea: string): string {
  return [
    'You are building a custom tile for my Vitality dashboard: ONE sealed, self-contained HTML file that runs sandboxed and talks to the dashboard only through the Vitality bridge.',
    '',
    `My idea: "${idea}"`,
    '',
    `The complete build spec is included below this brief (it is also live at ${TILE_SPEC_URL}). Follow it exactly: the sealed-file rules, the Vitality design DNA, the bridge API (Vitality.save / Vitality.load), and the Vitality.report({key,label,value,date,kind}) contract with its seven kinds: intake, count, duration, rating, measure, money, done.`,
    '',
    'Hand-author ONE complete single-file .html tile for my idea that meets every hard-floor rule in the spec. Full-grade, not a stub. Style it with the design DNA (no emoji, no em dashes, the palette and type recipe) so it looks native to Vitality, unless I ask for my own style - looks are my freedom, only the floor and the data contract are law.',
    '',
    "When you are done, give me the finished file to download (or the complete html to save as a .html file). I will upload it on Vitality's Forge page, where a gate re-checks every rule. If it fails, I will paste the gate's fix list back to you: fix every item and return the corrected file, keeping it ONE sealed .html file.",
    '',
    'If my idea is ambiguous, pick the strongest interpretation and tell me what you chose.',
    '',
    '----- THE BUILD SPEC (for the AI, not you - you can skip past this, it is the rulebook the AI reads) -----',
    '',
    TILE_SPEC.trim(),
  ].join('\n')
}

/** The MCP ritual for the Claude Code lane (the real tool surface, in order). */
function mcpBrief(idea: string): string {
  return [
    'You are building a custom tile for my Vitality dashboard: ONE sealed, self-contained HTML file that runs sandboxed and talks to the dashboard only through the Vitality bridge.',
    '',
    `My idea: "${idea}"`,
    '',
    'In order:',
    '',
    '1. Check your tools. If the Vitality tools (vitality_tile_kit, check_tile, vitality_add_tile) are not connected yet, run the claude mcp add command at the top of this message once, approve it, then continue.',
    '',
    `2. Call vitality_tile_kit with the best-fit domain, one of: ${KIT_DOMAINS} (no arguments if none fits) and build to what it returns. Its descriptions steer simple trackers to a goal-only default - here the hand-authored kit path is exactly what I am asking for. Do not take the goal-only shortcut or scaffold_tile.`,
    '',
    '3. Hand-author ONE complete single-file HTML tile that meets every kit floor rule: sealed and self-contained, transform/opacity motion only, local YYYY-MM-DD dates, bridge wired (Vitality.save / Vitality.load, plus one honest Vitality.report). Style it native (dark Vitality look, no emoji, no em dashes) unless I ask for my own style - taste warns, never blocks. Full-grade, not a stub.',
    '',
    '4. Prove it with check_tile; fix every error until it passes with 0 errors, and keep the Proof line from the passing receipt.',
    '',
    '5. Ship it with vitality_add_tile: the finished html, a short name, its `kind` when measurable (one of intake, count, duration, rating, measure, money, done), the Proof value as `check` so the identical re-lint is skipped, plus its born classification: `goalCategory` (the life bucket it serves, one of fitness, health, mind, money, career, craft, audience, people, general) and a one-line `veeNote` saying why it was built. If a write refuses, run vitality_connection, give me its one-step reconnect fix, then retry; do not hand me html to paste. Tell me the tile name at the end.',
    '',
    'If my idea is ambiguous, pick the strongest interpretation and tell me what you chose.',
  ].join('\n')
}

export function buildForgePrompt(idea: string): ForgePrompt {
  const clean = cleanIdea(idea)
  return {
    brief: universalBrief(clean),
    code: `${FORGE_CONNECT_CMD}\n\n${mcpBrief(clean)}`,
  }
}
