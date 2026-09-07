'use client'

import { createClient } from '@/lib/supabase/client'
import type { PeakState } from './types'
import { SUBSTANCES } from './substances'

/**
 * Best-effort mirror of the local Peak state into Supabase (`peak_state`, one
 * jsonb row per user — see 20260620000002_peak_state_mirror.sql). localStorage
 * (`vitality_peak_v1`) stays the PRIMARY client store; this only adds a durable,
 * MCP-readable copy. Failures are swallowed so the UI is never affected.
 *
 * Substance logs only carry a `key`; here (the one place with the catalog) we
 * enrich each with its display `name`, `category`, and `unit` so the server can
 * render "Coffee 95mg" and sum caffeine WITHOUT duplicating the catalog.
 *
 * READ-THROUGH: this mirror is read back — ./loadPeakState.ts loads it
 * server-side and page.tsx seeds usePeakState from it, so Peak survives a new
 * phone / cleared cache. The stored blob must therefore stay a SUPERSET of
 * PeakState (extra enrichment fields are fine; renames/removals are not).
 */
let cachedUserId: string | null = null

export async function mirrorPeakToSupabase(state: PeakState): Promise<void> {
  try {
    const db = createClient()
    if (!cachedUserId) {
      const { data } = await db.auth.getUser()
      cachedUserId = data.user?.id ?? null
    }
    if (!cachedUserId) return

    const substances = state.substances.map((s) => {
      const def = SUBSTANCES[s.key]
      return {
        ...s,
        name: def?.name ?? s.key,
        category: def?.category ?? null,
        unit: def?.unit ?? null,
      }
    })

    await db.from('peak_state').upsert({
      user_id: cachedUserId,
      data: { ...state, substances },
      updated_at: new Date().toISOString(),
    })
  } catch {
    // best-effort mirror; never affects the UI
  }
}
