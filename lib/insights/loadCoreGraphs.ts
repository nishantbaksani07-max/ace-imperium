import type { SupabaseClient } from '@supabase/supabase-js'
import { buildCoreRoom } from './coreRoom'
import type { CoreGraph, RoomWorkout, RoomMealDay, RoomWater, RoomWeight, RoomWearable } from './coreRoom'

/**
 * The ONE server-side read behind every Graph Library surface: the Core Room
 * page and the goal card's graph picker both call this, so the two can never
 * disagree about what is graphable. RLS-scoped, read-only, best-effort - a
 * failed table dims a shelf, never throws.
 */
export async function loadCoreGraphs(supabase: SupabaseClient, userId: string): Promise<CoreGraph[]> {
  const yearAgo = (() => {
    const d = new Date()
    d.setDate(d.getDate() - 365)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  const [workoutsRes, mealsRes, waterRes, weightsRes, wearRes, fuelGoalRes] = await Promise.allSettled([
    supabase
      .from('workouts')
      .select('date, exercises, off_day')
      .eq('user_id', userId)
      .not('submitted_at', 'is', null)
      .gte('date', yearAgo)
      .order('date', { ascending: true })
      .limit(400),
    supabase.from('nutrition_meals').select('day_key, totals').eq('user_id', userId).gte('day_key', yearAgo).limit(3000),
    supabase.from('water_log').select('date, amount_ml').eq('user_id', userId).gte('date', yearAgo).limit(2000),
    supabase.from('weights').select('date, weight_kg').eq('user_id', userId).gte('date', yearAgo).order('date', { ascending: true }).limit(500),
    supabase
      .from('wearable_data')
      .select('date, recovery, strain, sleep_hours, sleep_perf, hrv, rhr')
      .eq('user_id', userId)
      .gte('date', yearAgo)
      .order('date', { ascending: true })
      .limit(400),
    // The fuel target, so the Food score line grades each day against it.
    supabase.from('nutrition_goals').select('kcal_target, protein_target').eq('user_id', userId).maybeSingle(),
  ])

  const rows = <T,>(r: PromiseSettledResult<{ data: unknown }>): T[] =>
    r.status === 'fulfilled' && Array.isArray(r.value.data) ? (r.value.data as T[]) : []

  const goal =
    fuelGoalRes.status === 'fulfilled' && fuelGoalRes.value.data
      ? (fuelGoalRes.value.data as { kcal_target?: number; protein_target?: number })
      : null
  const fuelTarget =
    goal && Number(goal.kcal_target) > 0
      ? { kcal: Number(goal.kcal_target), protein: Number(goal.protein_target ?? 0) }
      : undefined

  return buildCoreRoom({
    workouts: rows<RoomWorkout>(workoutsRes),
    meals: rows<RoomMealDay>(mealsRes),
    water: rows<RoomWater>(waterRes),
    weights: rows<RoomWeight>(weightsRes),
    wearables: rows<RoomWearable>(wearRes),
    fuelTarget,
  })
}
