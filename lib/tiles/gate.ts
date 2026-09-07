/**
 * gateTile - THE bouncer for tiles that arrive as a bare .html file (the Forge
 * drop zone and the Library Upload). One verdict for every door:
 *
 *   pass -> the install envelope for tileStore.importTile (kind/key/label read
 *           from the tile's OWN Vitality.report(), so the stored row matches
 *           what the tile will actually report at runtime)
 *   fail -> a fix brief written FOR the builder AI, not the human. The user's
 *           whole job is copy, paste it back to their Claude, drop the
 *           corrected file again. Round-trip until green.
 *
 * SERVER-ONLY. Like lib/tiles/buildTile, this imports mcp/ (the tile floor's
 * single source of truth) - never pull it into a client bundle. The guardrails
 * live HERE, not in any prompt: whatever conversation produced the file, it
 * faces the same scan at the same door.
 */

import {
  assertTileExportable,
  reportIdentityFromHtml,
  reportKindFromHtml,
} from '@/mcp/src/tiles/uploadEnvelope'
import type { TileEnvelope } from './types'
import { TILE_SPEC_URL } from './forgePrompt'

export type GateVerdict =
  | { ok: true; envelope: TileEnvelope }
  | { ok: false; errors: string[]; fixBrief: string }

/** Same ceiling importTile enforces; refusing here gives a real reason instead
 *  of importTile's silent null. */
const MAX_HTML = 1_000_000
const MAX_NAME = 40

/** One honest display name: caller's pick, else the tile's own label, else 'Tile'. */
function cleanName(raw: string | undefined, fallback: string | undefined): string {
  const flat = (raw || fallback || 'Tile')
    .replace(/—/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME)
  return flat || 'Tile'
}

/** The thrown fix-it list is "  - rule: message -> hint" lines; keep just those. */
function errorLines(message: string): string[] {
  const lines = message
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
  return lines.length > 0 ? lines : [message.split('\n')[0] || 'the tile failed the gate']
}

function buildFixBrief(name: string, errors: string[]): string {
  return [
    `You built a Vitality dashboard tile ("${name}") and it failed Vitality's upload gate. Fix every item below, keep it ONE sealed self-contained .html file, and return the corrected file for me to upload again.`,
    '',
    'What failed:',
    ...errors.map((e) => `  ${e}`),
    '',
    'Rules recap (the blocking floor): sealed (no external scripts, fonts, or network calls), one complete document, animate transform and opacity only, local YYYY-MM-DD date keys, no color-scheme declaration. If the tile tracks a number or a done-mark it must call Vitality.report({key,label,value,date,kind}) once with literal values and kind one of: intake, count, duration, rating, measure, money, done. Style is free and only ever warns.',
    `Full spec: ${TILE_SPEC_URL}`,
  ].join('\n')
}

export function gateTile(rawHtml: string, rawName?: string): GateVerdict {
  const html = (rawHtml || '').trim()
  const probeName = cleanName(rawName, undefined)
  if (!html) {
    return {
      ok: false,
      errors: ['- empty-file: no html arrived'],
      fixBrief: buildFixBrief(probeName, [
        '- empty-file: the upload contained no html at all -> return the complete single-file tile, not a fragment or a link',
      ]),
    }
  }
  if (html.length > MAX_HTML) {
    const err = `- too-large: the file is ${Math.round(html.length / 1000)}kb; the ceiling is 1000kb -> inline assets leaner (no embedded video/images) and return one smaller file`
    return { ok: false, errors: [err], fixBrief: buildFixBrief(probeName, [err]) }
  }

  const kind = reportKindFromHtml(html)
  const identity = reportIdentityFromHtml(html)
  const name = cleanName(rawName, identity?.label ?? undefined)

  // The no-maybes floor: if the tile carries ANY report() call, its whole
  // stream identity (kind, key, label) must be readable as plain literals so
  // the stored row is guaranteed to match what the tile says at runtime.
  // Unreadable = refused with the exact fix, never admitted as a guess.
  if (identity !== null) {
    const idErrors: string[] = []
    if (!kind) {
      idErrors.push(
        "- report-unclassified: the Vitality.report() kind is not a plain literal from the locked 7 (intake, count, duration, rating, measure, money, done) -> write it as a quoted string, e.g. kind: 'count', never a variable",
      )
    }
    if (!identity.key) {
      idErrors.push(
        "- report-key-unreadable: the Vitality.report() key is not a plain string literal -> write it as a short quoted slug, e.g. key: 'bb_accuracy', never a variable",
      )
    }
    if (!identity.label) {
      idErrors.push(
        "- report-label-unreadable: the Vitality.report() label is not a plain string literal -> write it as a short quoted name, e.g. label: 'Bb Accuracy', never a variable",
      )
    }
    if (idErrors.length > 0) {
      return { ok: false, errors: idErrors, fixBrief: buildFixBrief(name, idErrors) }
    }
  }

  try {
    assertTileExportable(html, name, kind ?? undefined)
  } catch (e) {
    const errors = errorLines(e instanceof Error ? e.message : String(e))
    return { ok: false, errors, fixBrief: buildFixBrief(name, errors) }
  }

  return {
    ok: true,
    envelope: {
      name,
      html,
      // category is left to importTile, which derives it from kind (else 'Custom').
      ...(identity?.key ? { key: identity.key } : {}),
      label: identity?.label ?? name,
      ...(kind ? { kind } : {}),
      // The web envelope only knows up/down; a neutral tile simply omits it.
      ...(identity?.goalDirection === 'up' || identity?.goalDirection === 'down'
        ? { goalDirection: identity.goalDirection }
        : {}),
    },
  }
}
