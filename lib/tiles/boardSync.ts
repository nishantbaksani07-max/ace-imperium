import { createClient } from '@/lib/supabase/client'
import { homeLayout } from './homeLayout'
import { tileSkin, type Skin } from './tileSkin'

/**
 * Board sync layer (the arranged-dashboard cross-device keystone).
 *
 * This is an ADDITIVE mirror over the localStorage homeLayout + tileSkin stores,
 * NOT a rewrite. Those two stay the fast, synchronous source the grid renders
 * from; this module writes the WHOLE board (the ordered tile ids + every tile's
 * skin) up to `board_layout` on each mutation, and pulls it back on mount so a
 * dashboard arranged on one device reappears on a second.
 *
 * Shape mirrors how the state is stored: homeLayout is one `string[]` blob and
 * tileSkin is one `Record<tileId, Skin>` blob, so the server row is ONE row per
 * user carrying both. A reorder / resize is a single whole-board upsert; a pull
 * adopts the whole board last-write-wins. Reads / writes are RLS-scoped to the
 * signed-in user. Everything is best-effort: a missing table or a network error
 * leaves the local board exactly as it was — the local UI never breaks on sync.
 *
 * NOTE: the tiles THEMSELVES (their html + registry) sync via lib/tiles/tileSync
 * against the `tiles` table. This module only mirrors the arrangement, so a pull
 * here can reference a tile id whose row has not merged yet — that is fine, the
 * grid filters unknown ids and the tile pops in once tileSync adopts it.
 */

export interface ServerBoardRow {
  ordering: unknown
  skins: unknown
  updated_at: string
}

/** Narrow an unknown server `ordering` value to a clean id list. Pure. */
export function toOrder(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((x): x is string => typeof x === 'string')
}

/** Narrow an unknown server `skins` value to a tileId -> Skin map. Pure. Bad
 *  entries are dropped rather than trusted; tileSkin.set re-merges each over its
 *  own DEFAULT so a partial skin is still safe to apply. */
export function toSkins(value: unknown): Record<string, Partial<Skin>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, Partial<Skin>> = {}
  for (const [id, skin] of Object.entries(value as Record<string, unknown>)) {
    if (skin && typeof skin === 'object' && !Array.isArray(skin)) {
      out[id] = skin as Partial<Skin>
    }
  }
  return out
}

/**
 * Fold a server board row into the local stores: replace the home order with the
 * server order and set each tile's skin. Pure over localStorage — unit-testable
 * without Supabase. An empty server order is treated as "nothing saved yet" and
 * left alone (never wipe a real local board with an empty remote). Returns
 * whether the local board changed so the caller can refresh the grid.
 */
export function applyServerLayout(userId: string, row: ServerBoardRow): { applied: boolean } {
  const order = toOrder(row.ordering)
  const skins = toSkins(row.skins)
  if (order.length === 0 && Object.keys(skins).length === 0) return { applied: false }

  let applied = false
  if (order.length > 0) {
    // Compare against what the store ACTUALLY holds before + after: getOrder
    // backfills the always-on Library tile, so comparing the raw incoming order
    // to getOrder would never match and would re-apply every mount. Diff the
    // real before/after so idempotency holds and `applied` is honest.
    const before = homeLayout.getOrder(userId).join()
    homeLayout.setOrder(userId, order)
    if (homeLayout.getOrder(userId).join() !== before) applied = true
  }
  for (const [id, patch] of Object.entries(skins)) {
    tileSkin.set(userId, id, patch)
    applied = true
  }
  return { applied }
}

/**
 * Pull the user's server board into the local stores. Call on dashboard mount;
 * the caller refreshes the UI when `applied` is true. Best-effort — a missing
 * table / offline / no saved row leaves the local board untouched.
 */
export async function pullLayout(userId: string): Promise<{ applied: boolean }> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('board_layout')
      .select('ordering, skins, updated_at')
      .eq('user_id', userId)
      .maybeSingle()
    if (error || !data) return { applied: false }
    return applyServerLayout(userId, data as ServerBoardRow)
  } catch {
    return { applied: false }
  }
}

/**
 * Mirror the CURRENT local board up to the server (write-through) so the
 * arrangement persists + reaches other devices. Reads the whole home order and
 * the whole skin map straight from the local stores, so every caller (reorder,
 * add, remove, reset, resize, redesign) is the same single upsert — no caller
 * has to assemble a payload. Best-effort: any error is swallowed and the local
 * board is unaffected. Bumps updated_at so a later pull reads this as newest.
 */
export async function pushLayout(userId: string): Promise<void> {
  try {
    const supabase = createClient()
    await supabase.from('board_layout').upsert(
      {
        user_id: userId,
        ordering: homeLayout.getOrder(userId),
        skins: tileSkin.all(userId),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
  } catch {
    /* best-effort mirror; the local board is the source */
  }
}
