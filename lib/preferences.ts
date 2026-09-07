/**
 * User preferences — the per-quiz answer slices saved on
 * `user_profile.preferences` (JSONB). Read on demand by every module
 * that wants to personalize itself. Schema is intentionally permissive:
 * a missing slice means "user hasn't taken that quiz yet," not "broken."
 *
 * Add a new quiz: add a typed slice here + a new `lib/quizzes/[id].ts`
 * data file + a `/app/quiz/[id]` route. Consumers read whatever slice
 * they need with `getUserPreferences()`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Slice types ─────────────────────────────────────────────────────

// Goal — the dedicated "Set your Vitality goal" quiz was retired (the training
// intake + Fuel quizzes already capture the headline goal). The quiz, its
// route, checklist row, and coach/mentor wiring are gone, but this type + the
// `goal?` slice below are kept: the training program generator still accepts an
// optional GoalPreferences signal (now always null), and removing the slice key
// would break lib/onboardingTasks.ts which has in-flight work in another window.
// Clean these up once that work lands.
export type GoalOutcome    = 'cut' | 'recomp' | 'bulk' | 'maintain' | 'longevity'
export type GoalWindow     = '30' | '60' | '90' | '180' | 'open'
export type GoalConstraint = 'time' | 'equipment' | 'motivation' | 'injury' | 'none'

export interface GoalPreferences {
  outcome: GoalOutcome
  window: GoalWindow
  constraint: GoalConstraint
  completed_at: string
}

export type MentorTone   = 'direct' | 'encouraging' | 'data_driven' | 'socratic'
export type MentorFocus  = 'fitness' | 'business' | 'habits' | 'life' | 'recovery'

export interface MentorPreferences {
  tone: MentorTone
  focus: MentorFocus[]
  memory_notes: string
  completed_at: string
}

// Hydration — the quiz was retired (PATCH14): the water target already
// auto-computes from bodyweight + activity, and the quiz's headline question
// was unused. Type + `hydration?` slice kept inert (nothing writes it) so
// existing data + lib/onboardingTasks.ts (in-flight elsewhere) still type-check.
export type CaffeineLoad = 'none' | 'light' | 'moderate' | 'heavy'

export interface HydrationPreferences {
  daily_target_oz: number
  caffeine_load: CaffeineLoad
  workout_days: number
  completed_at: string
}

export type NutritionFix =
  | 'energy' | 'digestion' | 'sleep' | 'fat_loss' | 'muscle'
  | 'skin' | 'focus' | 'mood' | 'cravings' | 'healthier'
export type NutritionSkin = 'acne' | 'redness' | 'none'
export type NutritionRestriction =
  | 'gluten_free' | 'lactose' | 'peanut' | 'tree_nut' | 'egg' | 'soy' | 'fish'
  | 'shellfish' | 'sesame' | 'vegetarian' | 'vegan' | 'halal' | 'kosher'
  | 'pork_free' | 'none'
export type NutritionGut = 'often' | 'sometimes' | 'fine'
export type NutritionAdventure = 'high' | 'simple' | 'routine'
export type NutritionApproach = 'balanced' | 'feel_first'
export type NutritionPace = 'gentle' | 'balanced' | 'driven'

export interface NutritionPreferences {
  fix: NutritionFix[]
  skin: NutritionSkin[]
  gut: NutritionGut
  restrictions: NutritionRestriction[]
  avoid_notes: string
  adventurous: NutritionAdventure
  approach: NutritionApproach
  pace: NutritionPace
  completed_at: string
}

// ── Vitals (wearable onboarding quiz) ───────────────────────────────
//
// The 3-question quiz that captures the NEW signal the advice engine needs to
// turn raw wearable data (recovery, sleep, HRV, strain) into goal-tied, plain-
// English insights. Everything else (training goal, experience, days/week,
// coaching tone) is INHERITED from the existing quizzes — these three are the
// only non-duplicate additions. Stored on `user_profile.preferences.vitals`,
// exactly like the food-story `nutrition` slice.
//
// ─── answer → advice routing — REFERENCE FOR THE DOWNSTREAM ENGINE ────
//     (not used by the capture build; the insight engine inherits this intent)
//   sleepConsistency 'irregular' → lead with sleep-timing-regularity insight;
//                    'steady'    → suppress schedule nags.
//   caffeineCutoff   'late'      → unlock caffeine→deep-sleep insight when deep
//                                  sleep / HRV dips;
//                    'morning'/'none' → suppress caffeine advice entirely.
//   biggestLimiter sets the headline metric + lens:
//                    'sleep'    → deep/REM + duration
//                    'energy'   → RHR trend + sleep
//                    'soreness' → HRV/recovery + "recovery is not soreness" reframe
//                    'stress'   → HRV + RHR downregulation framing
//                    'plateau'  → load vs recovery, "you're recovered, push" permission
//                    'optimize' → weekly-anomaly mode
//   healthFlags 'injury'             → never "push harder"; don't read reduced
//                                      activity as backsliding.
//   healthFlags 'condition'/'medication' → suppress / caveat baseline-deviation
//                                      alarms (e.g. a beta-blocker mechanically
//                                      lowers HR + HRV — don't misread or alarm).
//   healthFlags 'cycle'              → phase-aware framing (luteal-phase RHR up /
//                                      HRV down is expected, not a red flag).

export type VitalsSleepConsistency = 'steady' | 'workday_consistent' | 'irregular'
export type VitalsCaffeineCutoff   = 'morning' | 'early_afternoon' | 'late' | 'none'
export type VitalsLimiter          = 'sleep' | 'energy' | 'soreness' | 'stress' | 'plateau' | 'optimize'
export type VitalsHealthFlag       = 'injury' | 'condition' | 'medication' | 'cycle' | 'other'

export interface VitalsPreferences {
  /** Schema version — bump when the question set changes (downstream engine
   *  reads this to stay compatible). */
  v: 1
  sleepConsistency: VitalsSleepConsistency
  caffeineCutoff: VitalsCaffeineCutoff
  biggestLimiter: VitalsLimiter
  /** Multi-select guardrails. Empty array = "none of these" / Q3 skipped. */
  healthFlags: VitalsHealthFlag[]
  /** Free text describing a guardrail the presets don't cover (the "something
   *  else" escape). Only meaningful when healthFlags includes 'other'. */
  healthFlagsOther?: string
  /** Stamped server-side by `saveQuizSlice`. snake_case to match every other
   *  slice + the `hasCompleted()` helper (which checks `'completed_at' in value`). */
  completed_at: string
}

export interface UserPreferences {
  /** Retired quiz — never written anymore; kept so existing data + the
   *  training generator's optional goal signal still type-check. */
  goal?: GoalPreferences
  mentor?: MentorPreferences
  hydration?: HydrationPreferences
  nutrition?: NutritionPreferences
  vitals?: VitalsPreferences
}

export type QuizSliceKey = keyof UserPreferences

// ── Reader ──────────────────────────────────────────────────────────

/**
 * Pull the full preferences object for a user. Returns {} if the column
 * is missing or the row doesn't exist — never throws — so consumers can
 * safely `prefs.mentor?.tone ?? 'encouraging'` without try/catch chains.
 */
export async function getUserPreferences(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserPreferences> {
  try {
    const { data } = await supabase
      .from('user_profile')
      .select('preferences')
      .eq('user_id', userId)
      .maybeSingle()
    const prefs = data?.preferences
    if (prefs && typeof prefs === 'object' && !Array.isArray(prefs)) {
      return prefs as UserPreferences
    }
  } catch {
    // Column or row may not exist on stale schemas — silent fallback.
  }
  return {}
}

/**
 * Convenience: is a particular quiz slice present (i.e., the user
 * completed that quiz)? Used by the onboarding checklist to compute
 * `done` status.
 */
export function hasCompleted(prefs: UserPreferences, slice: QuizSliceKey): boolean {
  const value = prefs[slice]
  return !!(value && typeof value === 'object' && 'completed_at' in value)
}

/**
 * Read just the Vitals (wearable) quiz slice. Returns `null` when the user
 * hasn't taken it yet — the gating signal the Vitals module uses to decide
 * "show the quiz" vs "show the dashboard" on entry.
 */
export async function getVitalsQuiz(
  supabase: SupabaseClient,
  userId: string,
): Promise<VitalsPreferences | null> {
  const prefs = await getUserPreferences(supabase, userId)
  return prefs.vitals ?? null
}
