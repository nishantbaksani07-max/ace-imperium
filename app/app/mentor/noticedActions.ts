'use server'

/**
 * "Vitality noticed" cooldown write (step 3 of the cross-domain engine). Mirrors
 * the drift logDriftShown action: RLS-scoped, never throws to the client. When a
 * fusion seam is surfaced on the §01 card, the client logs the show so that
 * pattern rests on its cooldown (see lib/insights/noticedLedger.ts) and the next
 * find lands like a gift instead of a feed of repeats.
 */

import { createClient } from '@/lib/supabase/server'
import { NOTICED_COOLDOWN_DAYS } from '@/lib/insights/noticedLedger'

export async function logNoticedShown(patternKey: string): Promise<{ ok: boolean }> {
  if (!patternKey) return { ok: false }
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  // Dedupe: if this pattern already has a show within its rest window, don't write
  // another row (guards the read-then-write race on a fast double-open, and keeps
  // one show = one row). The gather already skips rested patterns, so in the normal
  // flow this only fires for a fresh pattern.
  const cutoff = new Date(Date.now() - NOTICED_COOLDOWN_DAYS.shown * 86_400_000).toISOString()
  const { data: existing } = await supabase
    .from('noticed_ledger')
    .select('id')
    .eq('user_id', user.id)
    .eq('pattern_key', patternKey)
    .gte('last_shown_at', cutoff)
    .limit(1)
  if (existing && existing.length > 0) return { ok: true }

  const { error } = await supabase
    .from('noticed_ledger')
    .insert({ user_id: user.id, pattern_key: patternKey, last_shown_at: new Date().toISOString() })
  return { ok: !error }
}
