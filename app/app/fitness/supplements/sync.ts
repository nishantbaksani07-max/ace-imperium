'use client'

import { createClient } from '@/lib/supabase/client'
import type { SupplementsState } from './types'

/**
 * Best-effort mirror of the local supplements state into Supabase
 * (`supplements_state`, one jsonb row per user). localStorage
 * (`vitality_supplements_v1`) stays the PRIMARY client store — this only adds a
 * durable, MCP-readable copy. Failures are swallowed so the UI is never
 * affected. (The legacy `supplements_stack` table is unused/mismatched and
 * stays dormant.) See BUILD36.
 */
let cachedUserId: string | null = null

export async function mirrorSupplementsToSupabase(state: SupplementsState): Promise<void> {
  try {
    const db = createClient()
    if (!cachedUserId) {
      const { data } = await db.auth.getUser()
      cachedUserId = data.user?.id ?? null
    }
    if (!cachedUserId) return
    await db.from('supplements_state').upsert({
      user_id: cachedUserId,
      data: state,
      updated_at: new Date().toISOString(),
    })
  } catch {
    // best-effort mirror; never affects the UI
  }
}
