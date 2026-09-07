'use client'

import { createClient } from '@/lib/supabase/client'
import type { BrandState } from './types'

/**
 * Best-effort mirror of the local brand state into Supabase (`brand_state`, one
 * jsonb row per user — the whole BrandState blob; see BUILD36 for why a single
 * blob is the right shape here). localStorage (`vitality_brand_v1`) stays the
 * PRIMARY client store — this only adds a durable, MCP-readable copy. Failures
 * are swallowed so the UI is never affected.
 */
let cachedUserId: string | null = null

export async function mirrorBrandToSupabase(state: BrandState): Promise<void> {
  try {
    const db = createClient()
    if (!cachedUserId) {
      const { data } = await db.auth.getUser()
      cachedUserId = data.user?.id ?? null
    }
    if (!cachedUserId) return
    await db.from('brand_state').upsert({
      user_id: cachedUserId,
      data: state,
      updated_at: new Date().toISOString(),
    })
  } catch {
    // best-effort mirror; never affects the UI
  }
}

/**
 * Read the durable Supabase copy back so Supabase is the source of truth across
 * devices (not just a write-mirror). Returns the RAW jsonb blob (caller runs it
 * through `normalize()` so old rows get migrated + new fields back-filled), or
 * null when there's no row / no user / any error. RLS scopes the row to the
 * current user. Best-effort: a failure just falls back to localStorage.
 */
export async function loadBrandFromSupabase(): Promise<unknown | null> {
  try {
    const db = createClient()
    if (!cachedUserId) {
      const { data } = await db.auth.getUser()
      cachedUserId = data.user?.id ?? null
    }
    if (!cachedUserId) return null
    const { data, error } = await db
      .from('brand_state')
      .select('data')
      .eq('user_id', cachedUserId)
      .maybeSingle()
    if (error || !data) return null
    return (data as { data?: unknown }).data ?? null
  } catch {
    return null
  }
}
