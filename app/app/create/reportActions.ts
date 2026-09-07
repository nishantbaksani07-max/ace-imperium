'use server'

/**
 * Vitality.report() server write. The thin authed wrapper around
 * lib/tiles/reportWrites: resolves the user from the SESSION (never the iframe),
 * then upserts the stream + datapoint under RLS. The tile-to-Vee waist in code.
 *
 * Never throws to the client; the tile fires this and does not block on it.
 */

import { createClient } from '@/lib/supabase/server'
import { reportStreamWith, type DbLike } from '@/lib/tiles/reportWrites'

export async function reportStream(
  tileId: string,
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  // tileId comes from the HOST's window registry (useTileHost), so a stream's
  // per-tile identity is real: two tiles reporting the same key stay separate.
  const res = await reportStreamWith(supabase as unknown as DbLike, user.id, tileId, input)
  return res.ok ? { ok: true } : { ok: false, error: res.error }
}

/**
 * Re-parent the Create page's draft streams onto a just-Kept tile. A pre-Keep
 * preview reports under the provisional 'draft' id (so nothing is dropped);
 * once the tile gets its real id, its streams must follow - otherwise every
 * Keep strands an orphan (user, 'draft', key) row that the drift watch, the
 * noticed engine and any picker would read as a phantom duplicate stream.
 * Datapoints reference stream_id, so they follow the row automatically.
 *
 * `keys` scopes the move to the streams THIS Keep's preview actually reported,
 * so a second Create tab's in-progress draft is never misattributed onto this
 * tile. Rows move ONE BY ONE: the unique index tile_streams(user_id, tile_id,
 * key) can reject a single key the target tile already owns, and that one
 * collision must never strand the rest.
 * RLS-scoped; best-effort for the caller (a failed move never blocks a Keep).
 */
export async function adoptDraftStreams(tileId: string, keys?: string[]): Promise<{ ok: boolean; error?: string }> {
  const tid = typeof tileId === 'string' ? tileId.trim() : ''
  if (!tid || tid === 'draft') return { ok: false, error: 'bad tile id' }
  const wanted = Array.isArray(keys)
    ? [...new Set(keys.filter((k): k is string => typeof k === 'string' && !!k.trim()).map((k) => k.trim()))].slice(0, 50)
    : null

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  let read = supabase
    .from('tile_streams')
    .select('id')
    .eq('user_id', user.id)
    .eq('tile_id', 'draft')
  if (wanted) read = read.in('key', wanted)
  const { data: rows, error: readError } = await read
  if (readError) return { ok: false, error: 'failed to adopt draft streams' }

  let failed = 0
  for (const row of rows ?? []) {
    const { error } = await supabase
      .from('tile_streams')
      .update({ tile_id: tid })
      .eq('user_id', user.id)
      .eq('id', row.id)
    if (error) failed++
  }
  return failed === 0 ? { ok: true } : { ok: false, error: 'some draft streams could not be adopted' }
}
