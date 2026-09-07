import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkoutReadRow } from './workoutRead'

const LOOKBACK_DAYS = 28

// Pure date-key arithmetic on local YYYY-MM-DD (no UTC drift, no Date.now()).
export function shiftDateKey(key: string, deltaDays: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + deltaDays)
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${dt.getFullYear()}-${mm}-${dd}`
}

// RLS-scoped read of the user's recent workouts. Never throws: any failure
// degrades to an empty list so Peak just falls back to wearable + circadian.
export async function loadRecentWorkouts(
  supabase: SupabaseClient,
  userId: string,
  todayKey: string,
): Promise<WorkoutReadRow[]> {
  try {
    const since = shiftDateKey(todayKey, -LOOKBACK_DAYS)
    const { data, error } = await supabase
      .from('workouts')
      .select('date, day_name, exercises, off_day')
      .eq('user_id', userId)
      .gte('date', since)
      .order('date', { ascending: false })
    if (error || !data) return []
    return data.map(r => ({
      date: r.date as string,
      day_name: (r.day_name as string) ?? '',
      exercises: (r.exercises as WorkoutReadRow['exercises']) ?? [],
      off_day: (r.off_day as WorkoutReadRow['off_day']) ?? null,
    }))
  } catch {
    return []
  }
}
