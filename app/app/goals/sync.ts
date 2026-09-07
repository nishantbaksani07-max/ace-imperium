'use client'

import { createClient } from '@/lib/supabase/client'
import type { GoalsPersistedState } from './types'

/**
 * Best-effort mirror of the local goals state into Supabase (`goals_state`,
 * one jsonb row per user). localStorage (`vitality_goals_v1`) stays the PRIMARY
 * client store — this only adds a durable, MCP-readable copy. Failures are
 * swallowed so the UI is never affected. See BUILD36.
 */
let cachedUserId: string | null = null

export async function mirrorGoalsToSupabase(state: GoalsPersistedState): Promise<void> {
  try {
    const db = createClient()
    if (!cachedUserId) {
      const { data } = await db.auth.getUser()
      cachedUserId = data.user?.id ?? null
    }
    if (!cachedUserId) return
    await db.from('goals_state').upsert({
      user_id: cachedUserId,
      data: state,
      updated_at: new Date().toISOString(),
    })
  } catch {
    // best-effort mirror; never affects the UI
  }
}
