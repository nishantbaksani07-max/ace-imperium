'use client'

import { createClient } from '@/lib/supabase/client'
import type { WaterState } from './types'

/**
 * Best-effort mirror of the local water state into Supabase
 * (`water_prefs` + `water_days`).
 *
 * localStorage (`vitality_water_v1`) remains the PRIMARY client store — this
 * adds a durable, cross-device, MCP-readable copy on top. Any failure is
 * swallowed so the UI is never affected. Modelled on the BUILD13 finance
 * migration.
 *
 * READ-THROUGH: this mirror is read back — ./loadWaterState.ts loads it
 * server-side (fuel/page.tsx) and useWaterState merges it over the local load
 * (server prefs win; day logs merge per-day by max), so water survives a new
 * phone / cleared cache. Keep the written shape in step with the loader.
 *
 * See supabase/migrations/20260615000001_water_supabase.sql.
 */

let cachedUserId: string | null = null

export async function mirrorWaterToSupabase(state: WaterState): Promise<void> {
  try {
    const db = createClient()
    if (!cachedUserId) {
      const { data } = await db.auth.getUser()
      cachedUserId = data.user?.id ?? null
    }
    const uid = cachedUserId
    if (!uid) return

    const now = new Date().toISOString()

    await db.from('water_prefs').upsert({
      user_id: uid,
      unit: state.unit,
      bottle_ml: state.bottleMl,
      glass_ml: state.glassMl,
      activity_hrs_per_week: state.activityHrsPerWeek,
      caffeine_mg_per_day: state.caffeineMgPerDay,
      substances: state.substances,
      setup_complete: state.setupComplete,
      updated_at: now,
    })

    const rows = Object.entries(state.logs)
      .filter(([, c]) => typeof c === 'number' && c > 0)
      .map(([date, count]) => ({ user_id: uid, date, count, updated_at: now }))
    if (rows.length) {
      await db.from('water_days').upsert(rows, { onConflict: 'user_id,date' })
    }
  } catch {
    // best-effort mirror; never affects the UI
  }
}
