'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import type { Meal, MealTemplate, NutritionGoals, Correction } from '@/lib/nutrition/types'
import {
  mealToRow,
  rowToMeal,
  rowToTemplate,
  type MealRow,
  type TemplateRow,
} from './serialize'

// Persistence for the Macros module. Every query is implicitly user-scoped:
// auth.getUser() gates entry and RLS (migration BUILD25) enforces row
// ownership at the database. The Pro-tier gate lives on the AI routes
// (/api/nutrition/*), not here — manual logging, drinks, weight and goals
// work for any signed-in user so the module is usable while dogfooding.

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string }

const PATH = '/app/fuel/macros'

async function userScope() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'unauthorized' as const }
  return { ok: true as const, supabase, userId: user.id }
}

// ─── meals ──────────────────────────────────────────────────────────────

export type SaveMealInput = Omit<Meal, 'id' | 'loggedAt'> & { loggedAt?: string }

export async function saveMeal(input: SaveMealInput): Promise<Result<{ id: string; loggedAt: string }>> {
  const scope = await userScope()
  if (!scope.ok) return { ok: false, error: scope.error }

  const row: Record<string, unknown> = { ...mealToRow(input), user_id: scope.userId }
  if (input.loggedAt) row.logged_at = input.loggedAt

  const { data, error } = await scope.supabase
    .from('nutrition_meals')
    .insert(row)
    .select('id, logged_at')
    .single()

  if (error) return { ok: false, error: error.message }
  revalidatePath(PATH)
  return { ok: true, data: { id: data.id, loggedAt: data.logged_at } }
}

export async function updateMeal(id: string, patch: Partial<Meal>): Promise<Result> {
  const scope = await userScope()
  if (!scope.ok) return { ok: false, error: scope.error }

  const { error } = await scope.supabase
    .from('nutrition_meals')
    .update({ ...mealToRow(patch), updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath(PATH)
  return { ok: true }
}

export async function deleteMeal(id: string): Promise<Result> {
  const scope = await userScope()
  if (!scope.ok) return { ok: false, error: scope.error }

  const { error } = await scope.supabase.from('nutrition_meals').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(PATH)
  return { ok: true }
}

// Re-fetch a single day when the user navigates outside the initial window
// the page server-loaded.
export async function getMealsForDay(dayKey: string): Promise<Result<Meal[]>> {
  const scope = await userScope()
  if (!scope.ok) return { ok: false, error: scope.error }

  const { data, error } = await scope.supabase
    .from('nutrition_meals')
    .select('*')
    .eq('day_key', dayKey)
    .order('logged_at', { ascending: true })

  if (error) return { ok: false, error: error.message }
  return { ok: true, data: (data as MealRow[]).map(rowToMeal) }
}

// ─── goals ──────────────────────────────────────────────────────────────

export async function saveGoals(goals: Partial<NutritionGoals>): Promise<Result> {
  const scope = await userScope()
  if (!scope.ok) return { ok: false, error: scope.error }

  const row: Record<string, unknown> = { user_id: scope.userId, updated_at: new Date().toISOString() }
  if (goals.kcalTarget !== undefined) row.kcal_target = goals.kcalTarget
  if (goals.proteinTarget !== undefined) row.protein_target = goals.proteinTarget
  if (goals.carbsTarget !== undefined) row.carbs_target = goals.carbsTarget
  if (goals.fatTarget !== undefined) row.fat_target = goals.fatTarget
  if (goals.searchMode !== undefined) row.search_mode = goals.searchMode
  if (goals.onboarded !== undefined) row.onboarded = goals.onboarded

  const { error } = await scope.supabase
    .from('nutrition_goals')
    .upsert(row, { onConflict: 'user_id' })

  if (error) return { ok: false, error: error.message }
  revalidatePath(PATH)
  return { ok: true }
}

// The Fuel section wall (nutrition_goals.onboarded) is set ONLY by the quiz
// summary via saveMacroPlan (setupActions.ts). There is deliberately no general
// "mark onboarded" helper — that would be a bypass of the quiz-only invariant.

// ─── templates (favorites) ───────────────────────────────────────────────

export type SaveTemplateInput = Omit<MealTemplate, 'id' | 'createdAt'>

export async function saveTemplate(input: SaveTemplateInput): Promise<Result<{ id: string; createdAt: string }>> {
  const scope = await userScope()
  if (!scope.ok) return { ok: false, error: scope.error }

  const { data, error } = await scope.supabase
    .from('nutrition_templates')
    .insert({
      user_id: scope.userId,
      name: (input.name || '').trim() || 'Untitled favorite',
      foods: input.foods ?? [],
      totals: input.totals ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      thumbnail: input.thumbnail ?? null,
      meal_type: input.mealType ?? 'auto',
    })
    .select('id, created_at')
    .single()

  if (error) return { ok: false, error: error.message }
  revalidatePath(PATH)
  return { ok: true, data: { id: data.id, createdAt: data.created_at } }
}

export async function deleteTemplate(id: string): Promise<Result> {
  const scope = await userScope()
  if (!scope.ok) return { ok: false, error: scope.error }

  const { error } = await scope.supabase.from('nutrition_templates').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(PATH)
  return { ok: true }
}

// ─── body weight (reuses public.weights) ─────────────────────────────────

export async function saveWeight(dayKey: string, kg: number): Promise<Result> {
  const scope = await userScope()
  if (!scope.ok) return { ok: false, error: scope.error }

  const { error } = await scope.supabase
    .from('weights')
    .upsert({ user_id: scope.userId, date: dayKey, weight_kg: kg }, { onConflict: 'user_id,date' })

  if (error) return { ok: false, error: error.message }
  revalidatePath(PATH)
  return { ok: true }
}

// Bulk import for the "Bring your history" flow. FILL-GAPS-ONLY: existing days
// are left untouched (ignoreDuplicates), so importing history can never clobber
// a real weigh-in. Returns how many NEW days actually landed.
export async function saveWeights(
  entries: { dayKey: string; kg: number }[],
): Promise<Result<{ saved: number }>> {
  const scope = await userScope()
  if (!scope.ok) return { ok: false, error: scope.error }

  // sanitize: valid date key, plausible kg, dedupe by day (last wins), cap.
  const byDay = new Map<string, number>()
  for (const e of entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.dayKey)) continue
    if (!Number.isFinite(e.kg) || e.kg < 25 || e.kg > 320) continue
    byDay.set(e.dayKey, Math.round(e.kg * 10) / 10)
  }
  const rows = [...byDay.entries()]
    .slice(0, 400)
    .map(([date, weight_kg]) => ({ user_id: scope.userId, date, weight_kg }))
  if (rows.length === 0) return { ok: false, error: 'No valid weigh-ins to add.' }

  const { data, error } = await scope.supabase
    .from('weights')
    .upsert(rows, { onConflict: 'user_id,date', ignoreDuplicates: true })
    .select('date')

  if (error) return { ok: false, error: error.message }
  revalidatePath(PATH)
  return { ok: true, data: { saved: data?.length ?? 0 } }
}

// ─── correction memory (learning loop) ──────────────────────────────────────
// Capture side only — the vision/prompt pipeline consumes getRecentCorrections()
// server-side; this module owns the write path.

export interface SaveCorrectionInput {
  guessedName: string | null
  correctedName: string
  fdcId: number | null
  context: string | null
  mealId: string | null
}

export async function saveCorrection(
  input: SaveCorrectionInput,
): Promise<Result<{ id: string }>> {
  const scope = await userScope()
  if (!scope.ok) return { ok: false, error: scope.error }

  const { data, error } = await scope.supabase
    .from('nutrition_corrections')
    .insert({
      user_id: scope.userId,
      guessed_name: input.guessedName ?? null,
      corrected_name: input.correctedName,
      fdc_id: input.fdcId ?? null,
      context: input.context ?? null,
      meal_id: input.mealId ?? null,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, data: { id: data.id } }
}

export async function getRecentCorrections(limit = 25): Promise<Result<Correction[]>> {
  const scope = await userScope()
  if (!scope.ok) return { ok: false, error: scope.error }

  const { data, error } = await scope.supabase
    .from('nutrition_corrections')
    .select('id, created_at, guessed_name, corrected_name, fdc_id, context, meal_id')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return { ok: false, error: error.message }
  return {
    ok: true,
    data: (data as {
      id: string
      created_at: string
      guessed_name: string | null
      corrected_name: string
      fdc_id: number | null
      context: string | null
      meal_id: string | null
    }[]).map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      guessedName: r.guessed_name,
      correctedName: r.corrected_name,
      fdcId: r.fdc_id,
      context: r.context,
      mealId: r.meal_id,
    })),
  }
}

// ─── progress photos (.03 weight section) ────────────────────────────────
// Durable per-user photo log. Image is a compressed base64 JPEG kept inline.

export interface ProgressPhotoRow {
  id: string
  dayKey: string
  image: string
  weightKg: number | null
  createdAt: string
  /** Optional short user note. Null when the note migration hasn't landed. */
  note: string | null
}

// Row -> ProgressPhotoRow. `note` is selected defensively: if the note column
// isn't present yet, the wider select falls back to the note-less columns.
function toPhotoRow(r: Record<string, unknown>): ProgressPhotoRow {
  return {
    id: r.id as string,
    dayKey: r.day_key as string,
    image: r.image as string,
    weightKg: (r.weight_kg as number | null) ?? null,
    createdAt: r.created_at as string,
    note: (r.note as string | null) ?? null,
  }
}

export async function listProgressPhotos(): Promise<ProgressPhotoRow[]> {
  const scope = await userScope()
  if (!scope.ok) return []
  // Try with note; if the column isn't there yet, retry without it.
  const withNote = await scope.supabase
    .from('progress_photos')
    .select('id, day_key, image, weight_kg, created_at, note')
    .order('created_at', { ascending: false })
  let rows: Record<string, unknown>[] | null = (withNote.data as Record<string, unknown>[] | null) ?? null
  if (withNote.error) {
    const noNote = await scope.supabase
      .from('progress_photos')
      .select('id, day_key, image, weight_kg, created_at')
      .order('created_at', { ascending: false })
    rows = (noNote.data as Record<string, unknown>[] | null) ?? null
  }
  if (!rows) return []
  return rows.map((r) => toPhotoRow(r))
}

export async function saveProgressPhoto(input: {
  dayKey: string
  image: string
  weightKg: number | null
  note?: string | null
}): Promise<{ ok: true; data: ProgressPhotoRow } | { ok: false; error: string }> {
  const scope = await userScope()
  if (!scope.ok) return { ok: false, error: scope.error }
  if (!input.image || input.image.length > 8_000_000) {
    return { ok: false, error: 'That photo is too large. Try a smaller one.' }
  }
  const note = (input.note ?? '').trim().slice(0, 280) || null
  const base = { user_id: scope.userId, day_key: input.dayKey, image: input.image, weight_kg: input.weightKg }
  // Insert with note; if the column isn't present yet, retry without it so the
  // photo still saves (the note just won't persist until the migration lands).
  const withNote = await scope.supabase
    .from('progress_photos')
    .insert({ ...base, note })
    .select('id, day_key, image, weight_kg, created_at, note')
    .single()
  let row: Record<string, unknown> | null = (withNote.data as Record<string, unknown> | null) ?? null
  let errMsg = withNote.error?.message
  if (withNote.error) {
    const noNote = await scope.supabase
      .from('progress_photos')
      .insert(base)
      .select('id, day_key, image, weight_kg, created_at')
      .single()
    row = (noNote.data as Record<string, unknown> | null) ?? null
    errMsg = noNote.error?.message
  }
  if (!row) return { ok: false, error: errMsg || 'Could not save your photo. Please try again.' }
  return { ok: true, data: toPhotoRow(row) }
}

export async function updateProgressPhotoNote(
  id: string,
  note: string,
): Promise<{ ok: boolean; error?: string }> {
  const scope = await userScope()
  if (!scope.ok) return { ok: false, error: scope.error }
  const clean = note.trim().slice(0, 280) || null
  const { error } = await scope.supabase
    .from('progress_photos')
    .update({ note: clean })
    .eq('id', id)
    .eq('user_id', scope.userId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteProgressPhoto(id: string): Promise<{ ok: boolean; error?: string }> {
  const scope = await userScope()
  if (!scope.ok) return { ok: false, error: scope.error }
  const { error } = await scope.supabase.from('progress_photos').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
