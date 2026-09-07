import type { SupabaseClient } from '@supabase/supabase-js'
import { isLoggedSet, type SavedExercise } from '@/lib/workouts/queries'
import { getLocalDayKey } from '@/lib/nutrition/dayKey'

/**
 * Server-loaded day inputs for the Peak score (BUILD62, Phase 3b) — the real
 * Supabase-backed sources that can't be read from the browser: today's logged
 * workout and today's nutrition vs target. Combined with the client/localStorage
 * sources (water, supplements, goals, mood) and the manual check-in, this is how
 * "everything feeds the peak score". Best-effort: any failure degrades to nulls,
 * so the score still renders from whatever else is present.
 *
 * Note the two date keys: workouts use the midnight key (lib/dates), nutrition
 * uses the macro tracker's 4am-rollover key (lib/nutrition/dayKey).
 */
export interface DayInputs {
  trainedToday: boolean
  workoutSets: number
  ateToday: boolean
  proteinPct: number | null
  caloriesPct: number | null
}

const EMPTY: DayInputs = {
  trainedToday: false,
  workoutSets: 0,
  ateToday: false,
  proteinPct: null,
  caloriesPct: null,
}

export async function loadDayInputs(
  supabase: SupabaseClient,
  userId: string,
  /** Midnight local YYYY-MM-DD (lib/dates) — the workout day key. */
  date: string,
): Promise<DayInputs> {
  try {
    const mealKey = getLocalDayKey() // 4am rollover — nutrition_meals.day_key
    const [workoutRes, goalsRes, mealsRes] = await Promise.all([
      supabase.from('workouts').select('exercises').eq('user_id', userId).eq('date', date).maybeSingle(),
      supabase.from('nutrition_goals').select('kcal_target, protein_target').eq('user_id', userId).maybeSingle(),
      // nutrition_meals is RLS-scoped to the user (mirrors app/app/fuel/page.tsx).
      supabase.from('nutrition_meals').select('totals').eq('day_key', mealKey),
    ])

    // Workouts — count genuinely-logged working sets (same test as history).
    let workoutSets = 0
    const exercises = (workoutRes.data?.exercises as SavedExercise[] | undefined) ?? []
    for (const ex of exercises) {
      for (const s of ex.sets ?? []) if (isLoggedSet(s)) workoutSets++
    }
    const trainedToday = workoutSets > 0

    // Nutrition — sum today's meal totals, compare to base targets.
    const meals = (mealsRes.data as { totals: { kcal?: number; protein?: number } | null }[] | null) ?? []
    const ateToday = meals.length > 0
    let kcal = 0
    let protein = 0
    for (const m of meals) {
      kcal += Number(m.totals?.kcal) || 0
      protein += Number(m.totals?.protein) || 0
    }
    const kcalTarget = Number(goalsRes.data?.kcal_target) || 0
    const proteinTarget = Number(goalsRes.data?.protein_target) || 0

    return {
      trainedToday,
      workoutSets,
      ateToday,
      proteinPct: ateToday && proteinTarget > 0 ? protein / proteinTarget : null,
      caloriesPct: ateToday && kcalTarget > 0 ? kcal / kcalTarget : null,
    }
  } catch {
    return { ...EMPTY }
  }
}
