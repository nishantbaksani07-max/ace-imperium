'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { getLocalDateKey } from '@/lib/dates'
import type { DayType } from './splitData'
import type { Units } from '@/lib/units'
import type { MuscleIconKey } from '@/components/MuscleIcon'

export interface ExerciseOverrideInput {
  exerciseId: string
  /** Day type the override applies to. Same exercise on HEAVY vs VOLUME = different keys. */
  dayType: DayType
  /** Day number (1-based) — which rotation slot to mutate sets on. */
  dayNum: number
  /** New base weight in kg. Stored under `${exId}__${dayType}` in recommended_weights. */
  weight: number
  /** New target set count. Stored on rotation_days[dayIdx].exercises[exIdx].sets. */
  sets: number
  /** New target reps. Stored on rotation_days[dayIdx].exercises[exIdx].reps. */
  reps: number
  /** Rest between sets, in seconds. Stored under `${exId}__${dayType}` in
   *  rest_overrides — follows the exercise across splits, separate per day type. */
  rest: number
}

export interface ExerciseOverrideResult {
  ok: boolean
  error?: string
}

/**
 * Persist a per-exercise override: weight (scoped to day type) + set count
 * (scoped to a specific rotation day).
 *
 * Weight override key encoding: `${exerciseId}__${dayType}` — lets the same
 * lift have different base weights on heavy vs volume days. Falls back to the
 * unscoped `${exerciseId}` key (the wizard-computed default) when no override
 * exists for a given day type.
 *
 * Set count override: mutates the rotation_days JSONB directly. New count takes
 * effect on the next visit to that day; today's session keeps its set count
 * (avoids the data-loss edge case of shrinking past already-logged sets).
 */
export async function saveExerciseOverride(
  input: ExerciseOverrideInput,
): Promise<ExerciseOverrideResult> {
  const supabase = createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, error: 'unauthorized' }

  // Pull current state — we have to read-modify-write because both targets
  // live in JSONB blobs.
  const { data: settings, error: readErr } = await supabase
    .from('training_settings')
    .select('recommended_weights, rotation_days')
    .eq('user_id', user.id)
    .maybeSingle()
  if (readErr) return { ok: false, error: readErr.message }
  if (!settings) return { ok: false, error: 'no training_settings row — run setup first' }

  const scopedKey = `${input.exerciseId}__${input.dayType}`

  const recommended = { ...(settings.recommended_weights as Record<string, number> ?? {}) }
  recommended[scopedKey] = input.weight

  const rotation = [...((settings.rotation_days as Array<{ exercises: Array<{ id: string; sets: number; reps: number }> }>) ?? [])]
  const dayIdx = input.dayNum - 1
  if (rotation[dayIdx]) {
    const day = { ...rotation[dayIdx], exercises: [...rotation[dayIdx].exercises] }
    const exIdx = day.exercises.findIndex(e => e.id === input.exerciseId)
    if (exIdx >= 0) {
      day.exercises[exIdx] = { ...day.exercises[exIdx], sets: input.sets, reps: input.reps }
      rotation[dayIdx] = day
    }
  }

  const { error: writeErr } = await supabase
    .from('training_settings')
    .update({
      recommended_weights: recommended,
      rotation_days: rotation,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
  if (writeErr) return { ok: false, error: writeErr.message }

  // Rest override is best-effort + decoupled: it lives in the `rest_overrides`
  // column (keyed by exId + day type, so it follows the exercise across splits).
  // Kept separate so weight/sets/reps still save even if the column hasn't been
  // migrated onto this database yet — a missing column just no-ops here.
  const restSel = await supabase
    .from('training_settings')
    .select('rest_overrides')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!restSel.error) {
    const restOverrides = { ...((restSel.data?.rest_overrides as Record<string, number>) ?? {}) }
    restOverrides[scopedKey] = input.rest
    await supabase
      .from('training_settings')
      .update({ rest_overrides: restOverrides })
      .eq('user_id', user.id)
  }

  revalidatePath('/app/fitness/log/[day]', 'page')
  return { ok: true }
}

export interface KeepExerciseInput {
  /** 1-based rotation day the lift was added to. */
  dayNum: number
  exerciseId: string
  sets: number
  reps: number
  /** Id of the lift it should follow in the split, or null to append at the end. */
  afterId: string | null
}

/**
 * "Keep" a mid-session added lift: append it to the day's rotation_days so it
 * returns every time this day comes around. Inserted right after `afterId` to
 * preserve where the user placed it. Idempotent — a no-op if it's already in
 * the split.
 */
export async function keepExerciseInSplit(
  input: KeepExerciseInput,
): Promise<ExerciseOverrideResult> {
  const supabase = createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, error: 'unauthorized' }

  const { data: settings, error: readErr } = await supabase
    .from('training_settings')
    .select('rotation_days')
    .eq('user_id', user.id)
    .maybeSingle()
  if (readErr) return { ok: false, error: readErr.message }
  if (!settings) return { ok: false, error: 'no training_settings row — run setup first' }

  const rotation = [...((settings.rotation_days as Array<{ exercises: Array<{ id: string; sets: number; reps: number }> }>) ?? [])]
  const dayIdx = input.dayNum - 1
  if (!rotation[dayIdx]) return { ok: false, error: 'day not found' }

  const day = { ...rotation[dayIdx], exercises: [...rotation[dayIdx].exercises] }
  if (!day.exercises.some(e => e.id === input.exerciseId)) {
    const entry = { id: input.exerciseId, sets: input.sets, reps: input.reps }
    const afterIdx = input.afterId ? day.exercises.findIndex(e => e.id === input.afterId) : -1
    if (afterIdx >= 0) day.exercises.splice(afterIdx + 1, 0, entry)
    else day.exercises.push(entry)
    rotation[dayIdx] = day
  }

  const { error: writeErr } = await supabase
    .from('training_settings')
    .update({ rotation_days: rotation, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
  if (writeErr) return { ok: false, error: writeErr.message }

  revalidatePath('/app/fitness/log/[day]', 'page')
  return { ok: true }
}

/**
 * Persist a new exercise order for one rotation day. Called when the user
 * drag-reorders lifts in the logger — without this the new order is session
 * only and snaps back to the split order on reload.
 *
 * `orderedIds` is the full on-screen order (may include added/swapped lifts
 * that aren't in the split). We sort the day's rotation_days exercises to
 * follow that order; any split lift not named in `orderedIds` keeps its
 * relative position at the end. Ids in `orderedIds` that aren't in the split
 * (a just-added lift) are simply ignored — they live on the workout row.
 */
export async function reorderSplitExercises(
  input: { dayNum: number; orderedIds: string[] },
): Promise<ExerciseOverrideResult> {
  const supabase = createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, error: 'unauthorized' }

  const { data: settings, error: readErr } = await supabase
    .from('training_settings')
    .select('rotation_days')
    .eq('user_id', user.id)
    .maybeSingle()
  if (readErr) return { ok: false, error: readErr.message }
  if (!settings) return { ok: false, error: 'no training_settings row — run setup first' }

  const rotation = [...((settings.rotation_days as Array<{ exercises: Array<{ id: string }> }>) ?? [])]
  const dayIdx = input.dayNum - 1
  if (!rotation[dayIdx]) return { ok: false, error: 'day not found' }

  const pos = new Map(input.orderedIds.map((id, i) => [id, i]))
  const rank = (id: string) => (pos.has(id) ? pos.get(id)! : Number.POSITIVE_INFINITY)
  // Array.prototype.sort is stable (ES2019+), so split lifts the user didn't
  // touch keep their relative order.
  const nextExercises = [...rotation[dayIdx].exercises].sort((a, b) => rank(a.id) - rank(b.id))
  rotation[dayIdx] = { ...rotation[dayIdx], exercises: nextExercises }

  const { error: writeErr } = await supabase
    .from('training_settings')
    .update({ rotation_days: rotation, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
  if (writeErr) return { ok: false, error: writeErr.message }

  revalidatePath('/app/fitness/log/[day]', 'page')
  return { ok: true }
}

/**
 * Persist the user's unit preference (kg / lbs) for the workout logger.
 *
 * Stored on user_profile.units. The display layer reads this and converts
 * stored kg → preferred unit at every pill render + modal input. Storage
 * stays in kg, so toggling back and forth is non-destructive.
 */
export async function setUnits(units: Units): Promise<ExerciseOverrideResult> {
  const supabase = createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, error: 'unauthorized' }

  const { error } = await supabase
    .from('user_profile')
    .update({ units })
    .eq('user_id', user.id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/app/fitness/log')
  revalidatePath('/app/fitness/log/[day]', 'page')
  return { ok: true }
}

/** One user-defined lift, stored in training_settings.custom_exercises. */
export interface CustomExercise {
  /** Stable id, `custom_<uuid>`. Saved into workout rows + keys history. */
  id: string
  name: string
  /** Optional body-part classification picked in the build-a-lift wizard, so a
   *  custom lift shows the same muscle glyph + label as a built-in. */
  muscle?: MuscleIconKey
}

export interface AddCustomExerciseResult {
  ok: boolean
  exercise?: CustomExercise
  error?: string
}

/**
 * Create a user-defined lift the built-in EX library doesn't have (e.g.
 * "Barbell pause reps"). Saved per-user in training_settings.custom_exercises
 * so it's reusable: it shows up in the add-picker search every session and,
 * because its id is stable and workout history is keyed by exercise id, it
 * accumulates history week to week like a built-in lift.
 *
 * Dedupes case-insensitively on name so re-creating an existing custom lift
 * returns the same id (and therefore the same history) instead of forking it.
 */
export async function addCustomExercise(rawName: string, muscle?: MuscleIconKey): Promise<AddCustomExerciseResult> {
  const name = rawName.trim().replace(/\s+/g, ' ')
  if (!name) return { ok: false, error: 'empty name' }
  if (name.length > 60) return { ok: false, error: 'name too long' }

  const supabase = createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, error: 'unauthorized' }

  const { data: settings, error: readErr } = await supabase
    .from('training_settings')
    .select('custom_exercises')
    .eq('user_id', user.id)
    .maybeSingle()
  if (readErr) return { ok: false, error: readErr.message }
  if (!settings) return { ok: false, error: 'no training_settings row — run setup first' }

  const existing = ((settings.custom_exercises as CustomExercise[]) ?? [])
  // Reuse an existing custom lift with the same name (case-insensitive) so the
  // user doesn't fork a duplicate — and keeps its accumulated history. Backfill
  // a body part onto it if it didn't have one and the user just picked one.
  const dupe = existing.find(c => c.name.toLowerCase() === name.toLowerCase())
  if (dupe) {
    if (muscle && !dupe.muscle) {
      const patched = { ...dupe, muscle }
      const next = existing.map(c => (c.id === dupe.id ? patched : c))
      await supabase
        .from('training_settings')
        .update({ custom_exercises: next, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
      revalidatePath('/app/fitness/log/[day]', 'page')
      return { ok: true, exercise: patched }
    }
    return { ok: true, exercise: dupe }
  }

  const exercise: CustomExercise = { id: `custom_${crypto.randomUUID()}`, name, ...(muscle ? { muscle } : {}) }
  const next = [...existing, exercise]

  const { error: writeErr } = await supabase
    .from('training_settings')
    .update({ custom_exercises: next, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
  if (writeErr) return { ok: false, error: writeErr.message }

  revalidatePath('/app/fitness/log/[day]', 'page')
  return { ok: true, exercise }
}

/**
 * Inverse of keepExerciseInSplit — pull a lift back OUT of the day's
 * rotation_days. Lets the ✕ remove control take off a lift the user kept this
 * session (keep is no longer a one-way trap). Idempotent: a no-op if the lift
 * isn't in the split.
 */
export async function removeExerciseFromSplit(
  input: { dayNum: number; exerciseId: string },
): Promise<ExerciseOverrideResult> {
  const supabase = createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, error: 'unauthorized' }

  const { data: settings, error: readErr } = await supabase
    .from('training_settings')
    .select('rotation_days')
    .eq('user_id', user.id)
    .maybeSingle()
  if (readErr) return { ok: false, error: readErr.message }
  if (!settings) return { ok: false, error: 'no training_settings row — run setup first' }

  const rotation = [...((settings.rotation_days as Array<{ exercises: Array<{ id: string }> }>) ?? [])]
  const dayIdx = input.dayNum - 1
  if (!rotation[dayIdx]) return { ok: false, error: 'day not found' }

  const day = { ...rotation[dayIdx], exercises: rotation[dayIdx].exercises.filter(e => e.id !== input.exerciseId) }
  rotation[dayIdx] = day

  const { error: writeErr } = await supabase
    .from('training_settings')
    .update({ rotation_days: rotation, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
  if (writeErr) return { ok: false, error: writeErr.message }

  revalidatePath('/app/fitness/log/[day]', 'page')
  return { ok: true }
}

/**
 * Start a deload week. Stamps today's local date on training_settings; from
 * here each training day in the split is eased once (see getDeloadedDayNamesSince
 * + the [day] page), then the block resumes at the real baseline. Graceful: if
 * the deload_started_on column hasn't been migrated yet the update errors and we
 * return ok:false — the caller still eases the current session locally, so a
 * pre-migration deload simply behaves like a single eased day.
 */
export async function startDeload(): Promise<ExerciseOverrideResult> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, error: 'unauthorized' }

  const cookieDate = cookies().get('vitality_local_date')?.value
  const today = cookieDate && /^\d{4}-\d{2}-\d{2}$/.test(cookieDate) ? cookieDate : getLocalDateKey()

  const { error } = await supabase
    .from('training_settings')
    .update({ deload_started_on: today, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/app/fitness/log/[day]', 'page')
  revalidatePath('/app/fitness/log', 'page')
  return { ok: true }
}

/** End the current deload early (or clear a finished one). Sets the start date
 *  back to null so no further sessions auto-ease. Graceful like startDeload. */
export async function endDeload(): Promise<ExerciseOverrideResult> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, error: 'unauthorized' }

  const { error } = await supabase
    .from('training_settings')
    .update({ deload_started_on: null, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/app/fitness/log/[day]', 'page')
  revalidatePath('/app/fitness/log', 'page')
  return { ok: true }
}

/**
 * Start a new week — wipe the schedule board back to a clean slate without
 * touching a single logged workout row. Stamps the current moment on
 * training_settings.cycle_started_at; the schedule then hides every day
 * completed on or before this instant (see the log page), so the board clears
 * immediately and lights back up as the user trains. Fully reversible: Undo
 * restores the previous marker via revertNewWeek. Graceful — if the column
 * hasn't been migrated yet the update errors and we return ok:false (the client
 * still clears its tiles optimistically for the session).
 */
export async function startNewWeek(): Promise<ExerciseOverrideResult> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, error: 'unauthorized' }

  const { error } = await supabase
    .from('training_settings')
    .update({ cycle_started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/app/fitness/log', 'page')
  revalidatePath('/app/fitness/log/[day]', 'page')
  return { ok: true }
}

/**
 * Undo a "start a new week": restore the previous cycle_started_at marker (the
 * value from before the reset, which may be null). Lossless — it only moves the
 * read-time filter back; no workout rows were ever changed.
 */
export async function revertNewWeek(previous: string | null): Promise<ExerciseOverrideResult> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, error: 'unauthorized' }

  const { error } = await supabase
    .from('training_settings')
    .update({ cycle_started_at: previous, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/app/fitness/log', 'page')
  revalidatePath('/app/fitness/log/[day]', 'page')
  return { ok: true }
}
