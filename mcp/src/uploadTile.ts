// upload_tile's pure core: build a tile from a goal, then package it into the
// TileUploadEnvelope the dashboard Library consumes. Brick 3 SHIPPED (BUILD83): the
// upload_tile TOOL now posts via addTile by default, so this pure packager serves two
// callers - the tool's {package_only:true} escape hatch (envelope to paste in via the
// "Add a tile" door) and addTile's goal path, which builds through the same envelope.
// See docs/tile-upload-contract.md.

import { scaffoldTile, PASTE_INSTRUCTIONS, type ScaffoldInput } from './scaffoldTile.js';
import { buildUploadEnvelope, assertTileExportable, type TileUploadEnvelope, type Category } from './tiles/uploadEnvelope.js';

// The locked door now lives at the envelope boundary (so every packaging path is
// guarded, not just this one). Re-exported here for callers and tests that import it
// from upload_tile's module.
export { assertTileExportable };

export interface UploadTileInput extends ScaffoldInput {
  category?: Category;
  color?: string;
  design?: string;
}

export interface UploadTileResult {
  envelope: TileUploadEnvelope;
  text: string;
}

export function buildUploadTile(input: UploadTileInput): UploadTileResult {
  const { category, color, design, ...scaffoldInput } = input;
  const tile = scaffoldTile(scaffoldInput);
  // buildUploadEnvelope enforces the floor + report contract at the boundary, so a
  // tile that fails lint is refused here with a fix-it list (scaffold output passes).
  const envelope = buildUploadEnvelope({ html: tile.html, meta: tile.meta }, { category, color, design });
  const header = [
    `Your "${envelope.name}" tile is packaged and ready (${envelope.category}).`,
    PASTE_INSTRUCTIONS,
    `---------------- copy everything below this line ----------------`,
  ].join('\n');
  return { envelope, text: `${header}\n${JSON.stringify(envelope, null, 2)}` };
}
