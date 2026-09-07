import { createClient } from '@/lib/supabase/client'

/**
 * tile_data sync: the RUNTIME data half of a tile (whatever its Vitality.save()
 * persists) mirrored to Supabase so it backs up and crosses devices, instead of
 * living only in this browser's localStorage.
 *
 * This is an ADDITIVE mirror over tileStore's localStorage, exactly like tileSync
 * is for the tiles registry. localStorage stays the fast, synchronous source the
 * host reads; these calls are fire-and-forget best-effort (a missing table, a
 * non-uuid id, or offline leaves local state untouched). The public.tile_data
 * table already exists (20260630000003_tiles_registry.sql), RLS-scoped by
 * user_id; this is the client code that was never wired.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Mirror a tile's saved data up (upsert). No-op for a non-uuid id (core tiles). */
export async function push(userId: string, tileId: string, data: unknown): Promise<void> {
  if (!UUID_RE.test(tileId)) return
  try {
    const supabase = createClient()
    await supabase
      .from('tile_data')
      .upsert(
        { user_id: userId, tile_id: tileId, data, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,tile_id' },
      )
  } catch {
    /* best-effort; localStorage is the source of truth */
  }
}

/** Delete a tile's mirrored data (called when the tile is destroyed). */
export async function remove(userId: string, tileId: string): Promise<void> {
  if (!UUID_RE.test(tileId)) return
  try {
    const supabase = createClient()
    await supabase.from('tile_data').delete().eq('user_id', userId).eq('tile_id', tileId)
  } catch {
    /* best-effort */
  }
}

/**
 * Pull every mirrored tile_data row for the user in one round-trip, so a fresh
 * device can pre-warm localStorage before its tiles read their data. Returns the
 * rows; the caller writes them into the local store (tileStore.hydrateData).
 */
export async function pullAll(userId: string): Promise<Array<{ tileId: string; data: unknown }>> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase.from('tile_data').select('tile_id, data').eq('user_id', userId)
    if (error || !data) return []
    return (data as Array<{ tile_id: string; data: unknown }>).map((r) => ({ tileId: r.tile_id, data: r.data }))
  } catch {
    return []
  }
}

export const tileDataSync = { push, remove, pullAll }
