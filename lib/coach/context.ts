// Food Coach — context assembler.
//
// Gathers everything Vitality knows about the user (every questionnaire + live
// data) in parallel, then composes a tight context block by running each
// collector. This is what makes the coach feel like it "read your file."

import type { SupabaseClient } from '@supabase/supabase-js'

import { getUserPreferences } from '@/lib/preferences'
import {
  collectOnboarding,
  collectFitnessIntake,
  collectMentorQuiz,
  collectNutritionQuiz,
  collectCoachMemory,
  collectMacros,
  collectWeightTrend,
  collectWearables,
  collectWaterSupps,
  collectAdaptiveCheckin,
} from './collectors'
import { evaluateCheckin } from '@/lib/nutrition/adaptive'
import { toWeighIns, toDailyKcal } from '@/lib/nutrition/adaptiveInputs'
import { rowToGoals, type GoalsRow } from '@/app/app/fuel/macros/serialize'
import type { CoachSnapshot, CoachMemoryRow, UserContext } from './types'

type Row = Record<string, unknown>

const MEAL_WINDOW_DAYS = 10
const WEIGHT_WINDOW_DAYS = 30

function cutoffKey(daysBack: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - daysBack)
  return d.toISOString().slice(0, 10)
}

interface MealLite {
  dayKey: string
  totals: { kcal: number; protein: number; carbs: number; fat: number }
  whatISee: string | null
}

function asMeal(r: Row): MealLite {
  const t = (r.totals && typeof r.totals === 'object' ? r.totals : {}) as Record<string, unknown>
  return {
    dayKey: String(r.day_key ?? ''),
    totals: {
      kcal: Number(t.kcal) || 0,
      protein: Number(t.protein) || 0,
      carbs: Number(t.carbs) || 0,
      fat: Number(t.fat) || 0,
    },
    whatISee: typeof r.what_i_see === 'string' ? r.what_i_see : null,
  }
}

/**
 * Build the user context block for the coach. `todayKey` is the client's local
 * day key (so "today" matches what the user sees). `snapshot` carries the
 * localStorage-only water + supplements data. Never throws: a failed read just
 * drops that fragment.
 */
export async function buildCoachContext(
  supabase: SupabaseClient,
  userId: string,
  todayKey: string,
  snapshot: CoachSnapshot | null | undefined,
): Promise<UserContext> {
  const mealCutoff = cutoffKey(MEAL_WINDOW_DAYS)
  const weightCutoff = cutoffKey(WEIGHT_WINDOW_DAYS)

  const [profileRes, goalsRes, mealsRes, weightsRes, wearableRes, trainingRes, memoryRes, adaptiveMealsRes, prefs] = await Promise.all([
    supabase
      .from('user_profile')
      .select('first_name, sex, birthday, height_cm, starting_weight_kg, units, goal, focus_areas')
      .eq('user_id', userId)
      .maybeSingle(),
    // '*' so the adaptive goal band (goal_outcome / goal_rate_* / adaptive_enabled)
    // is available to compute the weekly check-in; collectMacros reads only the
    // target columns it needs.
    supabase.from('nutrition_goals').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('nutrition_meals').select('day_key, totals, what_i_see').gte('day_key', mealCutoff).order('logged_at', { ascending: true }),
    supabase.from('weights').select('date, weight_kg').gte('date', weightCutoff).order('date', { ascending: false }).limit(30),
    supabase.from('wearable_data').select('date, recovery, sleep_hours').gte('date', cutoffKey(7)).order('date', { ascending: false }),
    supabase.from('training_settings').select('intake_answers, intake_rec, gym_level').eq('user_id', userId).maybeSingle(),
    supabase.from('coach_memory').select('summary, message_count, updated_at').eq('user_id', userId).maybeSingle(),
    // Wider 28-day meal window just for the adaptive check-in (the recency window
    // above is intentionally short for the macro-adherence collector).
    supabase.from('nutrition_meals').select('day_key, totals').gte('day_key', cutoffKey(28)).order('logged_at', { ascending: true }),
    getUserPreferences(supabase, userId),
  ])

  const profile = (profileRes.data ?? null) as Row | null
  const goals = (goalsRes.data ?? null) as Row | null
  const meals = ((mealsRes.data as Row[]) ?? []).map(asMeal)
  const weights = (weightsRes.data as Row[]) ?? []
  const wearable = (wearableRes.data as Row[]) ?? []
  const training = (trainingRes.data ?? null) as Row | null
  const memory = (memoryRes.data ?? null) as CoachMemoryRow | null

  const macros = collectMacros(goals, meals, todayKey)

  // Live adaptive check-in: computed here (not read from nutrition_checkins) so the
  // coach can speak the trend + nudge even before the audit table is applied. Uses
  // the wider 28-day meal window + the goal band resolved/backfilled by rowToGoals.
  const adaptiveGoals = rowToGoals((goalsRes.data ?? null) as GoalsRow | null)
  const adaptiveMeals = ((adaptiveMealsRes.data as Row[]) ?? []).map((r) => ({
    dayKey: String(r.day_key ?? ''),
    totals: { kcal: Number((r.totals as Record<string, unknown>)?.kcal) || 0 },
  }))
  const adaptiveWeighIns = toWeighIns(
    weights.map((w) => ({ dayKey: String(w.date ?? ''), kg: Number(w.weight_kg) || 0 })),
  )
  const adaptiveCheckin = adaptiveGoals.adaptiveEnabled
    ? evaluateCheckin({
        weighIns: adaptiveWeighIns,
        dailyKcal: toDailyKcal(adaptiveMeals),
        band: adaptiveGoals.goalBand,
        currentTargetKcal: adaptiveGoals.kcalTarget,
      })
    : null

  const fragments = [
    // Long-term memory leads — it is the highest-signal "who is this person".
    collectCoachMemory(memory),
    collectOnboarding(profile),
    collectFitnessIntake(
      (training?.intake_answers ?? null) as Row | null,
      (training?.intake_rec ?? null) as Row | null,
      typeof training?.gym_level === 'string' ? (training.gym_level as string) : null,
    ),
    collectMentorQuiz(prefs.mentor),
    collectNutritionQuiz(prefs.nutrition),
    macros.fragment,
    collectWeightTrend(weights),
    collectAdaptiveCheckin(adaptiveCheckin),
    collectWearables(wearable),
    collectWaterSupps(snapshot),
  ].filter((f): f is string => !!f)

  return {
    text: fragments.join('\n'),
    firstName: typeof profile?.first_name === 'string' ? (profile.first_name as string) : null,
    todayMealCount: macros.todayCount,
  }
}
