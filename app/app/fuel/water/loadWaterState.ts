import type { SupabaseClient } from '@supabase/supabase-js'
import type { WaterState, Substance, WaterUnit } from './types'

/**
 * Read the user's durable water state (prefs + per-day serving counts) from the
 * `water_prefs` / `water_days` mirror tables — the read half of the write-mirror
 * in ./sync.ts (tables + RLS: 20260615000001_water_supabase.sql). Mirrors
 * peak/loadPeakState.ts, which made Peak read-through.
 *
 * RLS scopes both queries to the calling user. Returns a Partial<WaterState>
 * (prefs fields + the `logs` day map) or null when the user has no server rows
 * yet. Callers merge it over the localStorage load — this is what makes water
 * survive a new phone / cleared cache instead of living in one browser.
 */
export async function loadWaterState(
  supabase: SupabaseClient,
  userId: string,
): Promise<Partial<WaterState> | null> {
  const [prefsRes, daysRes] = await Promise.all([
    supabase
      .from('water_prefs')
      .select('unit, bottle_ml, glass_ml, activity_hrs_per_week, caffeine_mg_per_day, substances, setup_complete')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('water_days')
      .select('date, count')
      .eq('user_id', userId),
  ])

  const prefs = prefsRes.error ? null : prefsRes.data
  const days = daysRes.error ? [] : (daysRes.data ?? [])
  if (!prefs && days.length === 0) return null

  const out: Partial<WaterState> = {}
  if (prefs) {
    out.unit = prefs.unit as WaterUnit
    out.bottleMl = Number(prefs.bottle_ml)
    out.glassMl = Number(prefs.glass_ml)
    out.activityHrsPerWeek = Number(prefs.activity_hrs_per_week)
    out.caffeineMgPerDay = Number(prefs.caffeine_mg_per_day)
    out.substances = Array.isArray(prefs.substances) ? (prefs.substances as Substance[]) : []
    out.setupComplete = !!prefs.setup_complete
  }
  if (days.length) {
    const logs: Record<string, number> = {}
    for (const row of days) {
      const count = Number(row.count)
      if (typeof row.date === 'string' && Number.isFinite(count) && count > 0) {
        logs[row.date] = count
      }
    }
    out.logs = logs
  }
  return out
}
