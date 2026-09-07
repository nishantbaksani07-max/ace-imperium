// scaffold_tile's pure core: a plain-English goal in, one finished Vitality tile out.
// Deterministic (no LLM, no IO). Infers the tile's identity, renders the matching
// themed template, and packages it with a short header naming the inferred fields.

import { infer, type InferInput, type TileMeta } from './tiles/infer.js';
import { renderTile } from './tiles/templates.js';
import { gradeStamp } from './checkTile.js';

export type ScaffoldInput = InferInput;

/**
 * The one manual paste path on the shipped dashboard: the "Add a tile" door
 * (dashboard header and Library) opens the "Build a tile" drawer, whose paste box
 * accepts raw tile HTML and the upload envelope alike, with "Run it" and "Keep"
 * buttons. Shared by scaffold_tile and upload_tile so the two tools' paste
 * instructions can never drift apart. ("Upload a tile" no longer exists in the app.)
 */
export const PASTE_INSTRUCTIONS =
  'To add it: copy everything below the dashed line, press "Add a tile" on your Vitality dashboard, paste it in, press "Run it", then "Keep".';

export interface ScaffoldResult {
  /** The finished, self-contained sealed-HTML tile. */
  html: string;
  /** What was inferred (or overridden). */
  meta: TileMeta;
  /** Human + machine readable summary of the inferred fields + how to use it. */
  header: string;
  /** header + a blank line + html: the full text the MCP tool returns. */
  text: string;
}

function buildHeader(meta: TileMeta, html: string): string {
  const fields = [
    `key: ${meta.key}`,
    `label: ${meta.label}`,
    `kind: ${meta.kind}`,
    meta.goalDirection ? `goalDirection: ${meta.goalDirection}` : null,
    `template: ${meta.template}`,
  ]
    .filter(Boolean)
    .join(' | ');
  return [
    `Your "${meta.label}" tile is ready.`,
    gradeStamp(html),
    `${PASTE_INSTRUCTIONS} It is just HTML, so you can edit it freely.`,
    `(${fields})`,
    `---------------- copy everything below this line ----------------`,
  ].join('\n');
}

export function scaffoldTile(input: ScaffoldInput): ScaffoldResult {
  const meta = infer(input);
  const html = renderTile(meta);
  const header = buildHeader(meta, html);
  return { html, meta, header, text: `${header}\n\n${html}` };
}
