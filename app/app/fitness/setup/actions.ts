'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { buildSetupWrites } from './setupWrites'
import { gymLevelFromIntake, type GymLevel } from './gymLevel'
import type { PresetDay, IntakeAnswers, IntakeRecommendation } from './presets'

// Re-export the type so existing consumers (setupWrites, ExercisePicker) that
// import GymLevel from './actions' keep working. Type re-exports are erased at
// compile time, so this is allowed in a 'use server' file (unlike a runtime fn).
export type { GymLevel }

export interface SaveSetupInput {
  days: PresetDay[]
  // Profile fields — sent every time so the wizard can heal missing user_profile
  // rows. The wizard pre-fills these from existing user_profile if it exists.
  sex: 'M' | 'F'
  startingWeightKg: number
  units: 'metric' | 'imperial'
  // Optional: the latest tailored-intake snapshot. If the user has taken
  // the 11-question quiz, the wizard passes the answers + computed
  // recommendation through so they're persisted in the same upsert.
  // Null/undefined means "no change" — existing row keeps whatever it has.
  intakeAnswers?: IntakeAnswers | null
  intakeRec?: IntakeRecommendation | null
}

export interface SaveSetupResult {
  ok: boolean
  error?: string
}

/**
 * Server action — persist the fitness setup wizard.
 *
 * Two upserts:
 * 1. user_profile — heals missing rows; updates sex/weight/units from
 *    the wizard's editable step 3 fields. If a row already exists, we
 *    leave first_name/birthday/height_cm/goal/onboarding_step alone
 *    (those were set during onboarding).
 * 2. training_settings — saves rotation_days + gym_level +
 *    recommended_weights (computed server-side from TAILOR_TABLE) +
 *    setup_complete=true.
 *
 * RLS keeps both writes scoped to auth.uid().
 */
export async function saveTrainingSetup(input: SaveSetupInput): Promise<SaveSetupResult> {
  const supabase = createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: 'Not authenticated.' }
  }

  // Heal user_profile — if a row already exists we update only the fields
  // the wizard touches (sex/weight/units); if not, we create one with
  // sensible defaults for the fields onboarding would have set.
  const { data: existingProfile } = await supabase
    .from('user_profile')
    .select('user_id, first_name, birthday, height_cm, goal, onboarding_step')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existingProfile) {
    const { error: updateErr } = await supabase
      .from('user_profile')
      .update({
        sex: input.sex,
        starting_weight_kg: input.startingWeightKg,
        units: input.units,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
    if (updateErr) {
      return { ok: false, error: `Failed to update profile: ${updateErr.message}` }
    }
  } else {
    // Backfill missing row with defaults for the fields the wizard doesn't
    // collect. Goal defaults to 'general_health'; name to 'User'; height to
    // 170 cm; birthday placeholder ~25 years ago. User can edit later in
    // /account once that exists.
    const today = new Date()
    const placeholderBirthday = new Date(today.getFullYear() - 25, 0, 1).toISOString().slice(0, 10)
    const { error: insertErr } = await supabase
      .from('user_profile')
      .insert({
        user_id: user.id,
        first_name: 'User',
        birthday: placeholderBirthday,
        sex: input.sex,
        height_cm: 170,
        starting_weight_kg: input.startingWeightKg,
        units: input.units,
        goal: 'general_health',
        onboarding_step: 5,
      })
    if (insertErr) {
      return { ok: false, error: `Failed to create profile: ${insertErr.message}` }
    }
  }

  // Derive gym_level from the intake snapshot. The wizard no longer
  // collects this directly — intake.experience is the source of truth
  // for both starting-weight multipliers (here) and supplement signals
  // (lib/supplements).
  //
  // Backfill path for returning users: if intake is missing AND the user
  // already has a saved gym_level (from the pre-deletion step 4 era),
  // preserve it rather than overwriting with 'beginner'. Without this
  // an existing 'intermediate'/'advanced' user gets silently demoted on
  // their next setup save.
  let gymLevel: GymLevel
  if (input.intakeAnswers) {
    gymLevel = gymLevelFromIntake(input.intakeAnswers)
  } else {
    const { data: existingSettings } = await supabase
      .from('training_settings')
      .select('gym_level')
      .eq('user_id', user.id)
      .maybeSingle()
    gymLevel = (existingSettings?.gym_level as GymLevel | null) ?? 'beginner'
  }

  // Fan tuned values out to the exact stores the logger reads. Untuned lifts
  // keep a plain-id estimate; tuned lifts get a scoped `${exId}__${dayType}`
  // weight override + a rest_overrides entry. (buildSetupWrites is pure +
  // unit-tested in __tests__/setupWrites.test.ts.)
  const { recommendedWeights, restOverrides } = buildSetupWrites(
    input.days,
    input.startingWeightKg,
    input.sex,
    gymLevel,
  )

  const payload: Record<string, unknown> = {
    user_id: user.id,
    split_type: 'custom',
    rotation_days: input.days,
    gym_level: gymLevel,
    recommended_weights: recommendedWeights,
    setup_complete: true,
    updated_at: new Date().toISOString(),
  }
  if (input.intakeAnswers !== undefined) payload.intake_answers = input.intakeAnswers
  if (input.intakeRec !== undefined) payload.intake_rec = input.intakeRec

  const { error: saveError } = await supabase
    .from('training_settings')
    .upsert(payload)

  if (saveError) {
    return { ok: false, error: `Failed to save: ${saveError.message}` }
  }

  // rest_overrides lives in its own column + is error-tolerant: if the column
  // hasn't been migrated yet, the critical upsert above already succeeded, so
  // we swallow the rest write rather than failing the whole save. Merge so we
  // never clobber rest the user set in the logger for lifts not tuned here.
  if (Object.keys(restOverrides).length > 0) {
    const { data: restRow } = await supabase
      .from('training_settings')
      .select('rest_overrides')
      .eq('user_id', user.id)
      .maybeSingle()
    const merged = { ...((restRow?.rest_overrides as Record<string, number>) ?? {}), ...restOverrides }
    await supabase
      .from('training_settings')
      .update({ rest_overrides: merged })
      .eq('user_id', user.id)
  }

  revalidatePath('/app/fitness/log')
  revalidatePath('/app/fitness/log/[day]', 'page')

  return { ok: true }
}

/**
 * Server action — persist the tailored intake snapshot the moment the
 * 11-question quiz completes, before the user has clicked through the
 * remaining wizard steps. Lets the "✓ Completed" badge + diagnostic card
 * survive a refresh / new device without waiting for full setup save.
 *
 * Upserts only the intake columns on `training_settings`. If the row
 * doesn't exist yet (first-time user landing on /setup), an empty
 * skeleton is inserted with `setup_complete=false` — the full
 * `saveTrainingSetup` call later fills in rotation_days etc.
 *
 * RLS keeps the write scoped to auth.uid().
 */
export async function saveIntakeAnswers(
  answers: IntakeAnswers,
  rec: IntakeRecommendation,
): Promise<SaveSetupResult> {
  const supabase = createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: 'Not authenticated.' }
  }

  const { data: existing } = await supabase
    .from('training_settings')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('training_settings')
      .update({
        intake_answers: answers,
        intake_rec: rec,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
    if (error) return { ok: false, error: `Failed to save intake: ${error.message}` }
  } else {
    const { error } = await supabase
      .from('training_settings')
      .insert({
        user_id: user.id,
        split_type: 'custom',
        rotation_days: [],
        gym_level: 'beginner',
        recommended_weights: {},
        setup_complete: false,
        intake_answers: answers,
        intake_rec: rec,
        updated_at: new Date().toISOString(),
      })
    if (error) return { ok: false, error: `Failed to save intake: ${error.message}` }
  }

  return { ok: true }
}
