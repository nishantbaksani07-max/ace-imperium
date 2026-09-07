'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { tilePublishPayload, publishedRowToEnvelope } from '@/lib/tiles/publish'
import { isFounder } from '@/lib/auth/admin'
import type { Tile, TileEnvelope } from '@/lib/tiles/types'
import type { Skin } from '@/lib/tiles/tileSkin'

/**
 * Publish + credit server actions (Arts District v3).
 *
 * Publishing snapshots a sealed tile into public.published_tiles, credited to the
 * maker's creator_profiles handle. Reads/writes are RLS-scoped (creator owns own
 * rows; the public shop sees only 'approved'). The add path reuses the LOCKED
 * tileStore.importTile on the client — these actions only fetch the envelope.
 * See docs/superpowers/plans/2026-06-30-arts-district-v3-publish-credit.md.
 */

export interface PublishTileInput {
  tile: Tile
  skin: Skin
  optInReuse?: boolean
}

export interface PublishTileResult {
  ok: boolean
  error?: string
  /** true when the user has no handle yet — UI should send them to /account */
  needsHandle?: boolean
  id?: string
  status?: string
}

export async function publishTile(input: PublishTileInput): Promise<PublishTileResult> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, error: 'unauthorized' }

  // Credit requires a claimed handle. Gate publishing on it.
  const { data: profile } = await supabase
    .from('creator_profiles')
    .select('username')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!profile) {
    return { ok: false, needsHandle: true, error: 'Claim your maker handle first.' }
  }

  const payload = tilePublishPayload(input.tile, input.skin, user.id, {
    optInReuse: input.optInReuse,
  })
  if (!payload.ok) return { ok: false, error: payload.error }

  const { data, error } = await supabase
    .from('published_tiles')
    .insert(payload.row)
    .select('id, status')
    .single()
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/u/${profile.username}`)
  return { ok: true, id: data.id, status: data.status }
}

export async function unpublishTile(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, error: 'unauthorized' }

  // RLS restricts the delete to the caller's own row; the explicit eq is belt-and-braces.
  const { error } = await supabase
    .from('published_tiles')
    .delete()
    .eq('id', id)
    .eq('creator_id', user.id)
  if (error) return { ok: false, error: error.message }

  // Bump the maker page (best-effort; we don't have the handle here without a read).
  revalidatePath('/u/[username]', 'page')
  return { ok: true }
}

export interface MyPublishedTile {
  id: string
  name: string
  category: string | null
  status: 'pending' | 'approved' | 'rejected'
  install_count: number
  created_at: string
}

export async function listMyPublished(): Promise<MyPublishedTile[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from('published_tiles')
    .select('id, name, category, status, install_count, created_at')
    .eq('creator_id', user.id)
    .order('created_at', { ascending: false })
  return (data ?? []) as MyPublishedTile[]
}

/**
 * Fetch a published tile's importable envelope for the "Add" path. RLS returns
 * the row only if it is approved (public) or owned by the caller, so this is
 * safe to call from any client. v4 will increment install_count here.
 */
export async function getPublishedEnvelope(
  id: string
): Promise<{ ok: true; envelope: TileEnvelope } | { ok: false; error: string }> {
  const supabase = createClient()
  const { data } = await supabase
    .from('published_tiles')
    .select('envelope, name, html')
    .eq('id', id)
    .maybeSingle()
  if (!data) return { ok: false, error: 'not_found' }
  const envelope = publishedRowToEnvelope(data)
  if (!envelope) return { ok: false, error: 'corrupt' }
  return { ok: true, envelope }
}

/* ── Founders-only moderation (Arts District v3) ────────────────────────────
 *
 * approveTile / rejectTile flip a pending published_tiles row's status so a
 * community drop can go live (or be turned away). Two guarantees:
 *
 *  1. DEFENSE IN DEPTH — every action re-checks isFounder() server-side. The
 *     /admin page also gates, but a server action is a public HTTP endpoint, so
 *     the founder check MUST live inside the action, never only on the page.
 *  2. NO SERVICE-ROLE CLIENT — the flip runs as the founder's own authed
 *     session (the anon/authed server client), never a service-role bypass.
 *
 * RLS FOLLOW-UP REQUIRED (surfaced, not worked around): the current
 * published_tiles policies only let a caller UPDATE their OWN rows
 * (`using (auth.uid() = creator_id)`), and the guard_published_tiles_status
 * trigger raises when a non-service_role caller flips status to 'approved'.
 * So a founder's session cannot yet update ANOTHER creator's row — approveTile
 * will affect 0 rows (approve) or be blocked (reject on a non-owned row). This
 * lane does NOT add a service-role bypass; instead it detects the no-op and
 * returns `needs_rls_policy` so the captain applies the follow-up migration
 * that grants founders UPDATE on any row and lets them set 'approved'. Once
 * that policy + a trigger exception for founder emails ship, these actions work
 * unchanged. Tracked as a required migration follow-up (see report).
 */

type ModerationResult = { ok: boolean; error?: string }

function isUuid(id: unknown): id is string {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

async function setPublishedStatus(
  id: string,
  status: 'approved' | 'rejected'
): Promise<ModerationResult> {
  // 1. Founder-only. Re-checked here, never trusting the calling page.
  if (!(await isFounder())) return { ok: false, error: 'not_allowed' }
  if (!isUuid(id)) return { ok: false, error: 'bad_id' }

  const supabase = createClient()

  // 2. Flip ONLY rows still in the queue. Guards a double-click / stale tab from
  //    re-deciding something already approved or rejected. The update runs as the
  //    founder's session (no service-role); RLS still governs which rows it can
  //    touch. `select('id')` lets us tell an RLS-blocked no-op from a real write.
  const { data, error } = await supabase
    .from('published_tiles')
    .update({ status })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')

  if (error) {
    // The self-approve guard trigger surfaces here if RLS lets the row through
    // but the trigger blocks the 'approved' flip — a clear signal for the
    // follow-up migration rather than a silent failure.
    return { ok: false, error: error.message }
  }

  // Zero rows changed with no error ⇒ RLS hid the row from this founder (they
  // don't own it) OR it was already decided. Surface the RLS gap explicitly.
  if (!data || data.length === 0) {
    return { ok: false, error: 'needs_rls_policy' }
  }

  revalidatePath('/admin')
  return { ok: true }
}

export async function approveTile(id: string): Promise<ModerationResult> {
  return setPublishedStatus(id, 'approved')
}

export async function rejectTile(id: string): Promise<ModerationResult> {
  return setPublishedStatus(id, 'rejected')
}
