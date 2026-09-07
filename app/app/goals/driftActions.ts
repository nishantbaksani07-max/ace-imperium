'use server'

/**
 * Drift-watch server actions (BUILD42 flagship). Both write to goal_nudges
 * (RLS-scoped, auth.uid() = user_id) and never throw to the client:
 *   - logDriftShown: record that a nudge of this kind was surfaced, so the
 *     cooldown keeps Vee present-not-naggy (won't re-show for a couple days).
 *   - resolveDrift: record how the user responded (graced / shrunk / talk),
 *     which rests the nudge longer and honours their choice.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { DriftKind, DriftResolution } from '@/lib/goals/drift'

export async function logDriftShown(kind: DriftKind): Promise<{ ok: boolean }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  // Dedupe: if this kind was already logged within the 2-day "shown" window,
  // don't write another row (guards the read-then-write race on a fast re-open).
  const cutoff = new Date(Date.now() - 2 * 86_400_000).toISOString()
  const { data: existing } = await supabase
    .from('goal_nudges')
    .select('id')
    .eq('user_id', user.id)
    .eq('kind', kind)
    .gte('last_nudged_at', cutoff)
    .limit(1)
  if (existing && existing.length > 0) return { ok: true }

  const { error } = await supabase
    .from('goal_nudges')
    .insert({ user_id: user.id, kind, last_nudged_at: new Date().toISOString() })
  return { ok: !error }
}

export async function resolveDrift(kind: DriftKind, resolution: DriftResolution): Promise<{ ok: boolean }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('goal_nudges')
    .insert({ user_id: user.id, kind, resolution, last_nudged_at: now, resolved_at: now })

  revalidatePath('/app/mentor')
  return { ok: !error }
}
