'use server'

import { createClient } from '@/lib/supabase/server'
import { upsertFactByRef } from '@/lib/memory/userFacts'

/**
 * Feed today's Fuel coach read into the shared memory (user_facts) so Vee and
 * the rest of the connection web can speak to the user's fuel ("your fuel today
 * was a 5, calories ran over your cut"). One fact per day (upsert by ref so it
 * never piles up), short-lived (auto-cleans after a few days), RLS-scoped to the
 * caller, and never throws. The coach only READS goals and WRITES this fact; it
 * never edits Vee-owned code.
 */
export async function syncCoachFact(dayKey: string, body: string, salience = 0.5): Promise<{ ok: boolean }> {
  try {
    if (!dayKey || !body.trim()) return { ok: false }
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false }

    const expires = new Date()
    expires.setDate(expires.getDate() + 4)

    return await upsertFactByRef(supabase, user.id, {
      source: 'nutrition',
      kind: 'fuel_today',
      body: body.trim().slice(0, 280),
      salience,
      expiresAt: expires.toISOString(),
      refId: `coach-read-${dayKey}`,
    })
  } catch {
    return { ok: false }
  }
}
