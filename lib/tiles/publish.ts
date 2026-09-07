import type { Tile, TileEnvelope } from './types'
import type { Skin } from './tileSkin'
import { tileToEnvelope } from './share'

/**
 * Publishing a tile (Arts District v3). Pure logic that turns a Kept tile + its
 * skin into the `published_tiles` insert row, and a published row back into an
 * importable envelope. The server action wraps these with auth + the RLS write;
 * the public /u gallery + the shop read the rows. The envelope is built by the
 * SAME `tileToEnvelope` the v1 share code uses, so a published tile and a shared
 * tile are byte-identical and install through the one LOCKED importTile socket.
 *
 * See docs/superpowers/plans/2026-06-30-arts-district-v3-publish-credit.md.
 */

/** Mirrors tileStore.MAX_TILE_HTML (1MB) — a published tile MUST be importable. */
export const MAX_PUBLISH_HTML = 1024 * 1024

/** The shape inserted into public.published_tiles (status/install_count/id are DB-defaulted). */
export interface PublishRow {
  creator_id: string
  name: string
  html: string
  envelope: TileEnvelope
  category: string | null
  opt_in_reuse: boolean
  status: 'pending'
}

export type PublishResult =
  | { ok: true; row: PublishRow }
  | { ok: false; error: string }

export interface PublishOptions {
  /** Free for anyone to add (the credit license). Default true. */
  optInReuse?: boolean
}

/**
 * Build the insert payload for publishing a tile, credited to `creatorId`.
 * Validates the same minimum importTile needs (non-empty name + html) and the
 * 1MB html cap, so a published tile can never be un-addable. Returns a friendly
 * error instead of throwing.
 */
export function tilePublishPayload(
  tile: Tile,
  skin: Skin,
  creatorId: string,
  opts: PublishOptions = {}
): PublishResult {
  if (!creatorId || !creatorId.trim()) {
    return { ok: false, error: 'Missing creator.' }
  }

  const envelope = tileToEnvelope(tile, skin)

  if (typeof envelope.name !== 'string' || envelope.name.trim().length === 0) {
    return { ok: false, error: 'Give the tile a name before publishing.' }
  }
  if (typeof envelope.html !== 'string' || envelope.html.trim().length === 0) {
    return { ok: false, error: 'This tile has no content to publish.' }
  }
  if (envelope.html.length > MAX_PUBLISH_HTML) {
    return { ok: false, error: 'This tile is too large to publish (over the 1MB limit).' }
  }

  return {
    ok: true,
    row: {
      creator_id: creatorId.trim(),
      name: envelope.name.trim().slice(0, 80),
      html: envelope.html,
      envelope,
      category: envelope.category ?? null,
      opt_in_reuse: opts.optInReuse ?? true,
      status: 'pending',
    },
  }
}

/** The subset of a published_tiles row needed to reconstruct its envelope. */
export interface PublishedRowLike {
  envelope: unknown
  name: string
  html: string
}

/**
 * Turn a stored published row back into a TileEnvelope for the add/reuse path
 * (-> importTile). Prefers the stored `envelope` jsonb; if it's missing or junk,
 * falls back to the row's name + html so a tile is never un-addable.
 */
export function publishedRowToEnvelope(row: PublishedRowLike): TileEnvelope | null {
  const e = row.envelope
  if (e && typeof e === 'object') {
    const env = e as TileEnvelope
    if (typeof env.name === 'string' && env.name.trim().length > 0 &&
        typeof env.html === 'string' && env.html.trim().length > 0) {
      return env
    }
  }
  // Fallback: rebuild a minimal envelope from the flat columns.
  if (typeof row.name === 'string' && row.name.trim().length > 0 &&
      typeof row.html === 'string' && row.html.trim().length > 0) {
    return { name: row.name.trim(), html: row.html }
  }
  return null
}
