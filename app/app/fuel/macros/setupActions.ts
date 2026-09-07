'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import type { ActivityLevel, Approach, MacroTarget } from '@/lib/nutrition/macroCalc'
import { goalBandFor } from '@/lib/nutrition/adaptive'
import type { DietStyle } from '@/lib/nutrition/dietStyle'

// Save the computed macro plan from the macro setup flow. Writes the base
// (weekly-average / fallback) target plus the training-day and rest-day cycle
// columns added in the macro_cycle migration. One row per user (upsert on
// user_id). RLS on nutrition_goals enforces ownership.

type Result = { ok: true } | { ok: false; error: string }

export interface SaveMacroPlanInput {
  activity: ActivityLevel
  approach: Approach
  trainingDaysPerWeek: number
  base: MacroTarget
  training: MacroTarget
  rest: MacroTarget
  /** The user's eater-type / focus. Persisted so the coach tailors itself. */
  dietStyle?: DietStyle
  /** Body fat % from the quiz slider, so the editor + coach have it. */
  bodyFatPct?: number | null
  /** Recommended micronutrient goals the quiz computed, editable later. */
  fiberTarget?: number | null
  sugarLimitG?: number | null
  sodiumLimitMg?: number | null
}

/** Write diet_style + setup_skipped as a SEPARATE, error-tolerant update (mirrors
 *  the adaptive-band decoupling): if the diet_style migration has not landed on
 *  this DB yet, the plan already saved and this is swallowed. Never throws. */
async function tagDietStyle(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  dietStyle: DietStyle | undefined,
  skipped: boolean,
): Promise<void> {
  const patch: Record<string, unknown> = { setup_skipped: skipped }
  if (dietStyle) patch.diet_style = dietStyle
  const { error } = await supabase.from('nutrition_goals').update(patch).eq('user_id', userId)
  if (error) console.warn('[setupActions] diet_style/setup_skipped columns not present yet:', error.message)
}

export async function saveMacroPlan(input: SaveMacroPlanInput): Promise<Result> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  const cycleEnabled = input.training.kcal !== input.rest.kcal
  const ts = new Date().toISOString()

  // Core targets — these columns are guaranteed (BUILD25). The plan always saves.
  const baseRow = {
    user_id: user.id,
    kcal_target: input.base.kcal,
    protein_target: input.base.protein,
    carbs_target: input.base.carbs,
    fat_target: input.base.fat,
    onboarded: true,
    updated_at: ts,
  }
  // Cycle + meta columns added by the macro_cycle migration. If that migration has
  // not landed on this database yet, the full upsert errors on the missing columns,
  // so we fall back to base-only — the user's daily targets still save, and the
  // gym/rest cycle persists automatically once the columns exist.
  const fullRow = {
    ...baseRow,
    activity_level: input.activity,
    goal_outcome: input.approach,
    // training_days holds the weekly count in element 0 (not weekdays anymore).
    // The column is int[], so round — a half-step pick like 5.5 would otherwise
    // throw "invalid input syntax for integer" and silently drop the whole plan
    // to the base-only fallback (leaving the old gym/rest cycle in place).
    training_days: [Math.round(input.trainingDaysPerWeek)],
    cycle_enabled: cycleEnabled,
    training_kcal: input.training.kcal,
    training_protein: input.training.protein,
    training_carbs: input.training.carbs,
    training_fat: input.training.fat,
    rest_kcal: input.rest.kcal,
    rest_protein: input.rest.protein,
    rest_carbs: input.rest.carbs,
    rest_fat: input.rest.fat,
  }

  const { error } = await supabase.from('nutrition_goals').upsert(fullRow, { onConflict: 'user_id' })
  if (error) {
    console.error('[saveMacroPlan] full upsert failed, saving base only:', error.message)
    const fallback = await supabase.from('nutrition_goals').upsert(baseRow, { onConflict: 'user_id' })
    if (fallback.error) return { ok: false, error: fallback.error.message }
  }

  // Adaptive goal band — a SEPARATE, error-tolerant write (mirrors the
  // rest_overrides decoupling in the logger). If the adaptive_engine migration
  // has not landed on this DB yet, this update errors on the missing columns and
  // we swallow it: the plan + gym/rest cycle still saved above, and rowToGoals
  // backfills the band from goal_outcome at read time anyway.
  const band = goalBandFor(input.approach)
  const { error: bandErr } = await supabase
    .from('nutrition_goals')
    .update({
      goal_rate_low_kg_wk: band.lowKgPerWeek,
      goal_rate_high_kg_wk: band.highKgPerWeek,
      adaptive_enabled: true,
    })
    .eq('user_id', user.id)
  if (bandErr) {
    console.warn('[saveMacroPlan] adaptive band columns not present yet:', bandErr.message)
  }

  await tagDietStyle(supabase, user.id, input.dietStyle, false)

  // Body fat + recommended micro goals: a SEPARATE, error-tolerant update (mirrors
  // tagDietStyle). If the custom-targets migration has not landed yet, the macros
  // already saved and this is swallowed; the values seed once the columns exist.
  const { error: microErr } = await supabase
    .from('nutrition_goals')
    .update({
      body_fat_pct: input.bodyFatPct ?? null,
      fiber_target: input.fiberTarget ?? null,
      sugar_limit_g: input.sugarLimitG ?? null,
      sodium_limit_mg: input.sodiumLimitMg ?? null,
    })
    .eq('user_id', user.id)
  if (microErr) console.warn('[saveMacroPlan] body-comp/micro columns not present yet:', microErr.message)

  revalidatePath('/app/fuel')
  revalidatePath('/app/fuel/macros')
  return { ok: true }
}

// One day's macros as typed into the Custom Targets editor.
interface CustomDay {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export interface SaveCustomTargetsInput {
  cycleEnabled: boolean
  training: CustomDay
  rest: CustomDay
  base: CustomDay
  bodyFatPct: number | null
  fiberTarget: number | null
  sugarLimitG: number | null
  sodiumLimitMg: number | null
}

/**
 * Save hand-set targets from the Custom Targets editor, no quiz required. Writes
 * the base daily target plus the gym/rest cycle columns (like saveMacroPlan),
 * then a SEPARATE error-tolerant update for the body-comp + micro columns so an
 * un-migrated DB still saves the macros. When cycleEnabled is false the caller
 * passes base === training === rest so downstream cycle logic stays consistent.
 */
export async function saveCustomTargets(input: SaveCustomTargetsInput): Promise<Result> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  const ts = new Date().toISOString()

  // User-proof: never trust the numbers the client sent. Clamp everything to sane
  // ranges (a fat-fingered 999999 or a negative can never poison the tracker or
  // the coach math) and reject a target with no calories, since the tracker
  // divides by kcal. Blank micro/body-fat fields arrive as null and stay null.
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)))
  const clampOpt = (n: number | null, lo: number, hi: number) => (n == null ? null : clamp(n, lo, hi))
  const day = (d: CustomDay) => ({
    kcal: clamp(d.kcal, 0, 12000),
    protein: clamp(d.protein, 0, 2000),
    carbs: clamp(d.carbs, 0, 2000),
    fat: clamp(d.fat, 0, 2000),
  })
  const training = day(input.training)
  const rest = day(input.rest)
  const base = day(input.base)
  if (base.kcal < 1) return { ok: false, error: 'Please enter your calories.' }
  // With a gym/rest cycle on, both days need calories or the coach goes dark on a
  // 0-kcal day (it divides by kcal). The client guards this too.
  if (input.cycleEnabled && (training.kcal < 1 || rest.kcal < 1)) {
    return { ok: false, error: 'Enter calories for both your gym day and your rest day.' }
  }
  const bodyFatPct = clampOpt(input.bodyFatPct, 3, 75)
  const fiberTarget = clampOpt(input.fiberTarget, 0, 300)
  const sugarLimitG = clampOpt(input.sugarLimitG, 0, 1000)
  const sodiumLimitMg = clampOpt(input.sodiumLimitMg, 0, 50000)

  // Mirror saveMacroPlan: a cycle only counts when the two day calorie figures
  // actually differ, so an "on" toggle with matching numbers stays a single target.
  const cycleEnabled = input.cycleEnabled && training.kcal !== rest.kcal

  const baseRow = {
    user_id: user.id,
    kcal_target: base.kcal,
    protein_target: base.protein,
    carbs_target: base.carbs,
    fat_target: base.fat,
    onboarded: true,
    updated_at: ts,
  }
  const fullRow = {
    ...baseRow,
    cycle_enabled: cycleEnabled,
    training_kcal: training.kcal,
    training_protein: training.protein,
    training_carbs: training.carbs,
    training_fat: training.fat,
    rest_kcal: rest.kcal,
    rest_protein: rest.protein,
    rest_carbs: rest.carbs,
    rest_fat: rest.fat,
  }

  const { error } = await supabase.from('nutrition_goals').upsert(fullRow, { onConflict: 'user_id' })
  if (error) {
    console.error('[saveCustomTargets] full upsert failed, saving base only:', error.message)
    const fallback = await supabase.from('nutrition_goals').upsert(baseRow, { onConflict: 'user_id' })
    if (fallback.error) return { ok: false, error: fallback.error.message }
  }

  // Body composition + micronutrient goals: a SEPARATE, error-tolerant update
  // (mirrors tagDietStyle). If the custom-targets migration has not landed yet,
  // the macros above already saved and this is swallowed.
  const { error: microErr } = await supabase
    .from('nutrition_goals')
    .update({
      body_fat_pct: bodyFatPct,
      fiber_target: fiberTarget,
      sugar_limit_g: sugarLimitG,
      sodium_limit_mg: sodiumLimitMg,
    })
    .eq('user_id', user.id)
  if (microErr) {
    console.warn('[saveCustomTargets] custom-target columns not present yet:', microErr.message)
  }

  revalidatePath('/app/fuel')
  revalidatePath('/app/fuel/macros')
  return { ok: true }
}

/**
 * Skip setup. Unlocks the Fuel tracker WITHOUT a tailored macro plan: the user
 * gets the DB's default targets (kcal/protein) and an untailored coach. Marked
 * setup_skipped so the tracker can offer a one-tap "set my real goal" later.
 * This is the deliberate softening of the old hard wall (Alex, 2026-07-11): a
 * user who does not want the quiz can still log food and hydrate.
 */
export async function saveSkippedSetup(dietStyle?: DietStyle): Promise<Result> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  // Minimal upsert: flip onboarded so the gate opens. On a first-timer INSERT the
  // remaining columns take their table defaults (kcal 2400 / protein 180); on an
  // existing row nothing else is disturbed.
  const { error } = await supabase
    .from('nutrition_goals')
    .upsert({ user_id: user.id, onboarded: true, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) return { ok: false, error: error.message }

  await tagDietStyle(supabase, user.id, dietStyle, true)

  revalidatePath('/app/fuel')
  revalidatePath('/app/fuel/macros')
  return { ok: true }
}
