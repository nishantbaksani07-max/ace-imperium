// Nutrition (Fuel · Macros) shared types.
//
// Ported from ~/Desktop/Vitality/calories-standalone. The standalone kept these
// shapes implicit in plain JS objects; Vitality makes them explicit so the
// Supabase rows, API routes, and React state all agree.

export interface Macros {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export type MealType =
  | 'auto'
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'snack'
  | 'restaurant'
  | 'other'

export type MealState = 'confident' | 'uncertain' | 'can_tell' | 'bad_photo'

export type MealSource =
  | 'photo'
  | 'manual'
  | 'drink'
  | 'recent'
  | 'template'
  | 'barcode'
  | 'custom'

// A resolved food line on a logged meal (macros already scaled to `grams`).
export interface MealFood {
  id: string | null
  name: string
  grams: number
  macros: Macros
  hintUsed: string | null
  usdaDescription: string
}

// A food the vision parse identified but USDA/OFF could not resolve — the
// user supplies macros manually to clear it.
export interface UnmatchedFood {
  id: string | null
  name: string
  grams: number
  hintsTried: string[]
}

export interface ClarifyingQuestionOption {
  label: string
  default: boolean
}

export interface ClarifyingQuestion {
  id: string
  type: 'identification' | 'preparation' | 'portion' | 'hidden_ingredient' | 'context'
  about_food_id: string
  question: string
  options: ClarifyingQuestionOption[]
  estimated_kcal_swing: number
  answer?: string
}

// A fully logged meal. Mirrors a public.nutrition_meals row (camelCase here,
// snake_case in the DB — mapped in actions.ts).
export interface Meal {
  id: string
  dayKey: string
  loggedAt: string
  state: MealState
  whatISee: string
  mealType: MealType
  notes?: string
  totals: Macros
  foods: MealFood[]
  unmatched: UnmatchedFood[]
  clarifyingQuestions: ClarifyingQuestion[]
  thumbnail: string | null
  source?: MealSource
  sourceRef?: string | null
  // Client-only: a photo meal whose analysis is still running in the background.
  // Never persisted (mealToRow ignores it) — it's swapped for the real meal when
  // the parse + USDA resolve land, or removed on failure/cancel.
  pending?: boolean
}

export interface MealTemplate {
  id: string
  name: string
  foods: MealFood[]
  totals: Macros
  thumbnail: string | null
  mealType: MealType
  createdAt: string
}

// ─── Correction memory (learning loop) ──────────────────────────────────────
// Written by saveCorrection() when a user re-identifies a mislabeled food.
// Read by getRecentCorrections() to build prompt priors for the vision pipeline.
export interface Correction {
  id: string
  createdAt: string
  guessedName: string | null
  correctedName: string
  fdcId: number | null
  context: string | null
  mealId: string | null
}

// One day's macro target (gym day or rest day, or the single base target).
export interface DayTarget {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

// Which kind of day the user is fuelling for. Drives which target applies.
export type DayType = 'gym' | 'rest'

export interface NutritionGoals {
  kcalTarget: number
  proteinTarget: number
  carbsTarget: number | null
  fatTarget: number | null
  searchMode: SearchMode
  onboarded: boolean
  // Gym/rest calorie cycling (from the macro quiz). When cycleEnabled is false
  // (maintenance / no lifting) training === rest === the base target and the
  // tracker shows a single number with no day toggle. The kcalTarget/* above
  // remain the weekly-average base, used only as the fallback when no cycle.
  cycleEnabled: boolean
  training: DayTarget | null
  rest: DayTarget | null
  // Recoverable plan inputs (stored on the plan, used to backfill the "what you
  // picked" chips for plans saved before the quiz cached its raw answers).
  approach: string | null
  activity: string | null
  trainingDays: number | null
  // Adaptive engine: the goal-rate lane (kg/wk) the weekly check-in steers
  // toward, and the master toggle. Persisted on nutrition_goals at setup and
  // backfilled from `approach` for older plans (resolved in rowToGoals via the
  // engine's goalBandFor). Structural shape matches adaptive.ts GoalBand; kept
  // inline here so types.ts stays a leaf module (no import cycle).
  goalBand: { lowKgPerWeek: number; highKgPerWeek: number }
  adaptiveEnabled: boolean
  // Custom Targets editor (nutrition_custom_targets migration). Hand-set body
  // composition and micronutrient goals, independent of the quiz. Optional so
  // the app degrades gracefully on a DB without the columns (each defaults to
  // null in rowToGoals). Null on a micro means "no goal set", not zero.
  bodyFatPct: number | null
  fiberTarget: number | null
  sugarLimitG: number | null
  sodiumLimitMg: number | null
}

export type SearchMode = 'basic' | 'advanced'

// ─── Vision parse contract (Claude → parse-meal route → client) ─────────

export interface ParsedComponent {
  name: string
  grams: number
  search_hints: string[]
}

export interface ParsedFood {
  id: string
  name: string
  estimated_grams: number
  portion_confidence: 'high' | 'medium' | 'low'
  preparation: string
  search_hints: string[]
  components: ParsedComponent[]
}

export interface ParsedMeal {
  alternatives_considered: Array<{
    item_in_photo: string
    chosen: string
    alternatives: string[]
    disqualifying_feature_of_alternative: string
    would_swing_50_kcal: boolean
    reasoning: string
  }>
  state: MealState
  what_i_see: string
  photo_quality: 'good' | 'marginal' | 'bad'
  photo_issues: string[]
  retake_guidance: string
  meal_context: 'restaurant' | 'homemade' | 'unknown'
  foods: ParsedFood[]
  clarifying_questions: ClarifyingQuestion[]
}

// ─── USDA / OFF lookup contracts (server routes → client) ───────────────

// What usda-search returns for a single best-match lookup.
export interface UsdaMatch {
  description: string
  per100: Macros
}

// One ranked candidate for the manual-picker UI.
export interface UsdaCandidate {
  fdcId: number
  description: string   // raw USDA description (shown in Advanced; the macro source label)
  displayName: string   // friendly name (shown in Basic; used as the logged food name)
  serving: { grams: number; label: string }
  per100: Macros
}

export interface OffMatch {
  name: string
  code: string | null
  thumbnail: string | null
  per100: Macros
}
