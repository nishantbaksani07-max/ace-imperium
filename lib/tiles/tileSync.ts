import { createClient } from '@/lib/supabase/client'
import { tileStore } from './tileStore'
import { tileSkin } from './tileSkin'
import type { ReportKind, Tile } from './types'

/**
 * Tile sync layer (the build -> dashboard loop keystone, dashboard side).
 *
 * This is an ADDITIVE layer over the localStorage tileStore, NOT a rewrite. The
 * localStorage v1 stays the fast, synchronous source for the UI; this module
 * folds server `tiles` rows (an MCP-built tile, or one made on another device)
 * into the local index on load, and mirrors locally-made tiles up. So nothing
 * existing changes shape — a tile built in Claude Code just shows up.
 *
 * Shape agreed with the MCP window in mcp/docs/tiles-table-contract.md. Reads /
 * writes are RLS-scoped to the signed-in user. Everything is best-effort: a
 * missing table or a network error leaves the local store exactly as it was.
 *
 * NOTE: the contract `tiles` table carries color but not design/size yet, so a
 * merged tile gets its color skin; design/size default until the contract grows.
 */

export interface ServerTileRow {
  id: string
  name: string
  html: string
  stream: unknown | null
  category: string | null
  color: string | null
  source: string
  created_at: string
  updated_at: string
}

const REPORT_KINDS: readonly string[] = ['intake', 'count', 'duration', 'rating', 'measure', 'money', 'done']

/**
 * Parse a `tiles.stream` jsonb payload ({key,label,kind,goalDirection}) into the
 * Tile's DECLARED-stream fields (PATCH21). Without this, an MCP-built tile loses
 * its report identity on adopt — a "beers, down is good" tile lands with no
 * goalDirection and silently flips scoring mode. Defensive: the blob crossed the
 * network, so every field is shape-checked; a malformed blob or unknown kind
 * yields {}. 'neutral' maps to undefined (Tile carries up/down only, exactly as
 * importTile does for envelopes).
 */
export function streamFieldsOf(stream: unknown): Pick<Tile, 'key' | 'label' | 'kind' | 'goalDirection'> {
  if (!stream || typeof stream !== 'object' || Array.isArray(stream)) return {}
  const s = stream as Record<string, unknown>
  const out: Pick<Tile, 'key' | 'label' | 'kind' | 'goalDirection'> = {}
  if (typeof s.key === 'string' && s.key.trim() !== '') out.key = s.key.trim()
  if (typeof s.label === 'string' && s.label.trim() !== '') out.label = s.label.trim()
  if (typeof s.kind === 'string' && REPORT_KINDS.includes(s.kind)) out.kind = s.kind as ReportKind
  if (s.goalDirection === 'up' || s.goalDirection === 'down') out.goalDirection = s.goalDirection
  return out
}

/** Map a server `tiles` row to the local Tile shape (incl. its declared stream). Pure. */
export function rowToTile(row: ServerTileRow): Tile {
  const tile: Tile = {
    id: row.id,
    name: row.name,
    html: row.html,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    ...streamFieldsOf(row.stream),
  }
  if (row.category) tile.category = row.category
  return tile
}

/**
 * Fold server rows into the local index with last-write-wins: adopt any new id,
 * and overwrite a local tile when the server row is strictly newer (an edit made
 * on another device). A newer-or-equal local copy is left alone (local edit
 * wins). The color skin is (re)seeded on every adopt or update so a recolor
 * crosses devices too. Returns how many rows changed local state. Pure over
 * localStorage — unit-testable without Supabase.
 */
export function mergeRows(userId: string, rows: ServerTileRow[]): { merged: number; newIds: string[] } {
  let merged = 0
  const newIds: string[] = []
  for (const row of rows) {
    const tile = rowToTile(row)
    const result = tileStore.syncServerTile(userId, tile)
    if (result === 'new' || result === 'updated') {
      merged++
      if (row.color) tileSkin.set(userId, tile.id, { color: row.color })
    }
    // A 'new' row is a tile this device has never seen (built by the MCP, or on
    // another device). Surface its id so the dashboard can auto-place it on the
    // board instead of leaving it in the Library drawer.
    if (result === 'new') newIds.push(tile.id)
  }
  return { merged, newIds }
}

/**
 * Remove local copies of tiles that were deleted on ANOTHER device (their ids
 * are in the server tombstone list). Drops the registry entry + the skin; the id
 * may linger in the home order but renders nothing (the grid filters unknown
 * ids). Pure over localStorage — unit-testable. Returns how many were pruned.
 */
export function pruneTombstoned(userId: string, deletedIds: string[]): { pruned: number } {
  const ids = new Set(deletedIds)
  let pruned = 0
  for (const tile of tileStore.listTiles(userId)) {
    if (ids.has(tile.id)) {
      tileStore.deleteTile(userId, tile.id)
      tileSkin.remove(userId, tile.id)
      pruned++
    }
  }
  return { pruned }
}

/**
 * Pull the user's server tiles into the local store and reconcile deletions:
 * merge new/edited rows (last-write-wins) and prune any tile tombstoned on
 * another device. Call on dashboard load; the caller refreshes the UI when the
 * returned count > 0. Best-effort — a missing table / offline leaves the local
 * store untouched, and the tombstone prune is isolated so it never blocks the
 * merge (or vice versa).
 */
export async function pullAndMerge(userId: string): Promise<{ merged: number; newIds: string[] }> {
  try {
    const supabase = createClient()
    let changed = 0
    let newIds: string[] = []
    const { data, error } = await supabase
      .from('tiles')
      .select('id, name, html, stream, category, color, source, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
    if (!error && data) {
      const res = mergeRows(userId, data as ServerTileRow[])
      changed += res.merged
      newIds = res.newIds
    }
    try {
      const { data: tombs } = await supabase.from('deleted_tiles').select('tile_id').eq('user_id', userId)
      if (tombs && tombs.length) changed += pruneTombstoned(userId, tombs.map((t) => t.tile_id as string)).pruned
    } catch {
      /* no tombstone table yet / offline — skip pruning, keep the merge */
    }
    return { merged: changed, newIds }
  } catch {
    return { merged: 0, newIds: [] }
  }
}

/**
 * Mirror a locally-made tile up to the server `tiles` table (write-through) so
 * it persists + reaches other devices. Best-effort: a non-uuid id or any error
 * is swallowed (the local store is unaffected). Reads the color off the skin;
 * design/size aren't in the contract table yet.
 */
export async function pushTile(userId: string, tile: Tile, source: 'paste' | 'hub' | 'mcp' = 'paste'): Promise<void> {
  try {
    const supabase = createClient()
    const color = tileSkin.get(userId, tile.id).color
    // The declared report identity rides up too (PATCH21 across devices): without
    // it, a locally-imported tile mirrors up stream-less and another device
    // adopts it with no kind/goalDirection — the same silent scoring-mode loss
    // the envelope round-trip fix closed.
    const stream =
      tile.key || tile.label || tile.kind || tile.goalDirection
        ? { key: tile.key, label: tile.label, kind: tile.kind, goalDirection: tile.goalDirection }
        : null
    await supabase.from('tiles').upsert(
      {
        id: tile.id,
        user_id: userId,
        name: tile.name,
        html: tile.html,
        stream,
        category: tile.category ?? null,
        color: color ?? null,
        source,
        // Bump on every push so an edit reads as "newer" than other devices'
        // copies (the tiles row has no auto-update trigger); mergeRows uses this
        // timestamp for last-write-wins, so without it an edit never propagates.
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
  } catch {
    /* best-effort mirror; the local store is the source */
  }
}

/**
 * Delete a tile's mirrored server `tiles` row so a local delete is permanent,
 * and write a tombstone so OTHER devices prune their local copy on next pull.
 * Without the row delete, `pullAndMerge` re-adopts the still-present row and the
 * tile resurrects on THIS device; without the tombstone, another device (which
 * already has the tile locally) never learns it was deleted and keeps showing
 * it. RLS-scoped to the signed-in user. Best-effort: any error (incl. no
 * tombstone table yet) leaves things as they are — the tile is already gone
 * locally, and the row delete alone still fixes same-device resurrection.
 */
export async function deleteServerTile(userId: string, id: string): Promise<void> {
  try {
    const supabase = createClient()
    await supabase.from('tiles').delete().eq('id', id).eq('user_id', userId)
    // Separate try: a missing deleted_tiles table must not undo the row delete.
    try {
      await supabase.from('deleted_tiles').upsert({ user_id: userId, tile_id: id }, { onConflict: 'user_id,tile_id' })
    } catch {
      /* no tombstone table yet — cross-device prune activates once it exists */
    }
  } catch {
    /* best-effort; the local delete already happened */
  }
}
