// Row <-> model mappers for the Macros module. Shared by the server page
// loader (page.tsx) and the server actions (actions.ts), so it stays a plain
// module (no 'use server' — that file may only export async actions).

import type {
  Meal,
  MealFood,
  MealTemplate,
  MealType,
  MealState,
  MealSource,
  Macros,
  NutritionGoals,
  DayTarget,
  SearchMode,
  UnmatchedFood,
  ClarifyingQuestion,
} from '@/lib/nutrition/types'
import { goalBandFor, type Checkin, type CheckinStatus } from '@/lib/nutrition/adaptive'

export const DEFAULT_GOALS: NutritionGoals = {
  kcalTarget: 2400,
  proteinTarget: 180,
  carbsTarget: null,
  fatTarget: null,
  searchMode: 'basic',
  onboarded: false,
  cycleEnabled: false,
  training: null,
  rest: null,
  approach: null,
  activity: null,
  trainingDays: null,
  goalBand: goalBandFor(''),
  adaptiveEnabled: true,
  bodyFatPct: null,
  fiberTarget: null,
  sugarLimitG: null,
  sodiumLimitMg: null,
}

const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 }

function asMacros(v: unknown): Macros {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return {
    kcal: Number(o.kcal) || 0,
    protein: Number(o.protein) || 0,
    carbs: Number(o.carbs) || 0,
    fat: Number(o.fat) || 0,
  }
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

// ─── meals ──────────────────────────────────────────────────────────────

export interface MealRow {
  id: string
  day_key: string
  logged_at: string
  state: string
  what_i_see: string | null
  meal_type: string
  notes: string | null
  totals: unknown
  foods: unknown
  unmatched: unknown
  questions: unknown
  thumbnail: string | null
  source: string | null
  source_ref: string | null
}

export function rowToMeal(r: MealRow): Meal {
  return {
    id: r.id,
    dayKey: r.day_key,
    loggedAt: r.logged_at,
    state: (r.state || 'confident') as MealState,
    whatISee: r.what_i_see || '',
    mealType: (r.meal_type || 'auto') as MealType,
    notes: r.notes || undefined,
    totals: asMacros(r.totals),
    foods: asArray<MealFood>(r.foods),
    unmatched: asArray<UnmatchedFood>(r.unmatched),
    clarifyingQuestions: asArray<ClarifyingQuestion>(r.questions),
    thumbnail: r.thumbnail,
    source: (r.source || undefined) as MealSource | undefined,
    sourceRef: r.source_ref,
  }
}

// Columns for an insert/update. id/user_id/timestamps handled by caller + DB.
export function mealToRow(m: Partial<Meal>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (m.dayKey !== undefined) row.day_key = m.dayKey
  if (m.loggedAt !== undefined) row.logged_at = m.loggedAt
  if (m.state !== undefined) row.state = m.state
  if (m.whatISee !== undefined) row.what_i_see = m.whatISee
  if (m.mealType !== undefined) row.meal_type = m.mealType
  if (m.notes !== undefined) row.notes = m.notes ?? null
  if (m.totals !== undefined) row.totals = m.totals ?? ZERO
  if (m.foods !== undefined) row.foods = m.foods ?? []
  if (m.unmatched !== undefined) row.unmatched = m.unmatched ?? []
  if (m.clarifyingQuestions !== undefined) row.questions = m.clarifyingQuestions ?? []
  if (m.thumbnail !== undefined) row.thumbnail = m.thumbnail ?? null
  if (m.source !== undefined) row.source = m.source ?? null
  if (m.sourceRef !== undefined) row.source_ref = m.sourceRef ?? null
  return row
}

// ─── templates ──────────────────────────────────────────────────────────

export interface TemplateRow {
  id: string
  name: string
  foods: unknown
  totals: unknown
  thumbnail: string | null
  meal_type: string
  created_at: string
}

export function rowToTemplate(r: TemplateRow): MealTemplate {
  return {
    id: r.id,
    name: r.name,
    foods: asArray<MealFood>(r.foods),
    totals: asMacros(r.totals),
    thumbnail: r.thumbnail,
    mealType: (r.meal_type || 'auto') as MealType,
    createdAt: r.created_at,
  }
}

// ─── goals ──────────────────────────────────────────────────────────────

export interface GoalsRow {
  kcal_target: number | null
  protein_target: number | null
  carbs_target: number | null
  fat_target: number | null
  search_mode: string | null
  onboarded: boolean | null
  // Gym/rest cycle columns (macro_cycle migration). Optional so this still
  // deserializes on a DB that hasn't run the migration — the cycle just stays
  // disabled and the tracker shows the single base target.
  cycle_enabled?: boolean | null
  training_kcal?: number | null
  training_protein?: number | null
  training_carbs?: number | null
  training_fat?: number | null
  rest_kcal?: number | null
  rest_protein?: number | null
  rest_carbs?: number | null
  rest_fat?: number | null
  goal_outcome?: string | null
  activity_level?: string | null
  training_days?: number[] | null
  // Adaptive band columns (adaptive_engine migration). Optional so this still
  // deserializes on a DB without the migration — rowToGoals backfills the band
  // from goal_outcome and defaults adaptive_enabled to true.
  goal_rate_low_kg_wk?: number | null
  goal_rate_high_kg_wk?: number | null
  adaptive_enabled?: boolean | null
  // Custom Targets columns (nutrition_custom_targets migration). Optional so this
  // still deserializes on a DB without the migration (each defaults to null).
  body_fat_pct?: number | null
  fiber_target?: number | null
  sugar_limit_g?: number | null
  sodium_limit_mg?: number | null
}

// Build a DayTarget from a row's training_*/rest_* columns, or null if the
// calorie figure is missing (migration not applied, or quiz saved base-only).
function dayTargetFromRow(
  kcal: number | null | undefined,
  protein: number | null | undefined,
  carbs: number | null | undefined,
  fat: number | null | undefined
): DayTarget | null {
  if (kcal == null) return null
  return {
    kcal: Number(kcal),
    protein: Number(protein ?? 0),
    carbs: Number(carbs ?? 0),
    fat: Number(fat ?? 0),
  }
}

export function rowToGoals(r: GoalsRow | null): NutritionGoals {
  if (!r) return { ...DEFAULT_GOALS }
  const training = dayTargetFromRow(r.training_kcal, r.training_protein, r.training_carbs, r.training_fat)
  const rest = dayTargetFromRow(r.rest_kcal, r.rest_protein, r.rest_carbs, r.rest_fat)
  // Only a real, differing cycle counts — equal gym/rest (maintenance) shows a
  // single number, never a pointless toggle between two identical targets.
  const cycleEnabled = !!r.cycle_enabled && training != null && rest != null && training.kcal !== rest.kcal
  // Adaptive band: prefer the persisted columns, else backfill the lane from the
  // stored goal_outcome so older accounts get a correct band with no redo.
  const persistedBand =
    r.goal_rate_low_kg_wk != null && r.goal_rate_high_kg_wk != null
      ? { lowKgPerWeek: Number(r.goal_rate_low_kg_wk), highKgPerWeek: Number(r.goal_rate_high_kg_wk) }
      : null
  const goalBand = goalBandFor(r.goal_outcome ?? '', persistedBand)
  return {
    kcalTarget: Number(r.kcal_target ?? DEFAULT_GOALS.kcalTarget),
    proteinTarget: Number(r.protein_target ?? DEFAULT_GOALS.proteinTarget),
    carbsTarget: r.carbs_target != null ? Number(r.carbs_target) : null,
    fatTarget: r.fat_target != null ? Number(r.fat_target) : null,
    searchMode: (r.search_mode || 'basic') as SearchMode,
    onboarded: !!r.onboarded,
    cycleEnabled,
    training,
    rest,
    approach: r.goal_outcome ?? null,
    activity: r.activity_level ?? null,
    trainingDays: Array.isArray(r.training_days) && r.training_days.length > 0 ? Number(r.training_days[0]) : null,
    goalBand,
    adaptiveEnabled: r.adaptive_enabled ?? true,
    bodyFatPct: r.body_fat_pct != null ? Number(r.body_fat_pct) : null,
    fiberTarget: r.fiber_target != null ? Number(r.fiber_target) : null,
    sugarLimitG: r.sugar_limit_g != null ? Number(r.sugar_limit_g) : null,
    sodiumLimitMg: r.sodium_limit_mg != null ? Number(r.sodium_limit_mg) : null,
  }
}

// ─── body weight (reuses the existing public.weights table) ──────────────

export interface WeightEntry {
  dayKey: string
  kg: number
  loggedAt: string
}

export interface WeightRow {
  date: string
  weight_kg: number
  created_at: string
}

export function rowToWeight(r: WeightRow): WeightEntry {
  return { dayKey: r.date, kg: Number(r.weight_kg), loggedAt: r.created_at }
}

// ─── adaptive weekly check-in ────────────────────────────────────────────

export type CheckinDecision = 'pending' | 'accepted' | 'dismissed' | 'grace'

export interface CheckinRow {
  week_start: string
  status: string
  trend_rate_kg_wk: number | null
  maintenance_kcal: number | null
  avg_kcal: number | null
  prev_kcal: number | null
  suggested_kcal: number | null
  decision: string
}

// A persisted check-in carries the engine's Checkin shape plus the week key and
// the user's decision. `reason` is recomputed by the UI/coach, not stored.
export interface PersistedCheckin extends Checkin {
  weekStart: string
  decision: CheckinDecision
}

export function rowToCheckin(r: CheckinRow): PersistedCheckin {
  return {
    weekStart: r.week_start,
    status: (r.status || 'calibrating') as CheckinStatus,
    trendRateKgPerWeek: r.trend_rate_kg_wk != null ? Number(r.trend_rate_kg_wk) : null,
    maintenanceKcal: r.maintenance_kcal != null ? Number(r.maintenance_kcal) : null,
    avgKcal: r.avg_kcal != null ? Number(r.avg_kcal) : null,
    suggestedKcal: r.suggested_kcal != null ? Number(r.suggested_kcal) : null,
    deltaKcal:
      r.suggested_kcal != null && r.prev_kcal != null ? Number(r.suggested_kcal) - Number(r.prev_kcal) : null,
    logScaleGap: null,
    reason: '',
    decision: (r.decision || 'pending') as CheckinDecision,
  }
}
