import { displayToKg, type Units } from '@/lib/units'
import type { SavedExercise, SavedSet } from './queries'

/**
 * Past-workout ("Log a past workout") form → stored workout shape.
 *
 * The backfill form collects a list of lifts, each with one or more sets. This
 * converts that into the canonical `SavedExercise[]` JSONB the workouts row
 * stores, so a backfilled session reads identically to a live-logged one in
 * history + graphs. Weights arrive in the user's DISPLAY unit and are stored in
 * kg; each set is classified the same way the live logger does (a non-missed
 * set with a real weight + reps is `done`; a missed set is `failed`).
 */

export interface BackfillSetInput {
  /** Weight in the user's DISPLAY unit (kg or lb). null = not entered. */
  weight: number | null
  reps: number | null
  /** The user marked this set as missed (failed). */
  missed: boolean
}

export interface BackfillLiftInput {
  id: string
  name: string
  targetReps: number
  sets: BackfillSetInput[]
}

/** Generous ceilings (in the user's DISPLAY unit) that still clear any real
 *  human lift, so a fat-finger like "99999" can't silently corrupt the
 *  exercise's history graph / peak / PR detection. */
export const MAX_WEIGHT_DISPLAY = 1000
export const MAX_REPS = 100

/**
 * Validate raw form input BEFORE building/saving. Returns a friendly,
 * lift-named message for the first out-of-range value, or null if all good.
 * Lower-bound (negative) and emptiness are handled by buildBackfillExercises;
 * this guards the UPPER bound the build step would otherwise pass straight to
 * the DB.
 */
export function validateBackfillInputs(lifts: BackfillLiftInput[]): string | null {
  for (const lift of lifts) {
    const who = lift.name.trim() || 'A lift'
    for (const s of lift.sets) {
      if (s.weight != null && s.weight > MAX_WEIGHT_DISPLAY) return `${who}: that weight looks too high — double-check?`
      if (s.reps != null && s.reps > MAX_REPS) return `${who}: that rep count looks too high — double-check?`
    }
  }
  return null
}

/**
 * Fold a backfilled session's exercises into whatever already sits in the
 * "(history)" row for that date. A same-id exercise is REPLACED (re-backfilling
 * is a correction, never a duplicate); new ids are appended; unrelated stored
 * exercises are left untouched. Mirrors saveBackfillSession's single-exercise
 * merge, generalised to a whole session.
 */
export function mergeBackfillExercises(prior: SavedExercise[], incoming: SavedExercise[]): SavedExercise[] {
  const out = prior.map(e => ({ ...e }))
  for (const ex of incoming) {
    const i = out.findIndex(e => e.id === ex.id)
    if (i >= 0) out[i] = ex
    else out.push(ex)
  }
  return out
}

export function buildBackfillExercises(lifts: BackfillLiftInput[], units: Units): SavedExercise[] {
  const out: SavedExercise[] = []
  for (const lift of lifts) {
    const name = lift.name.trim()
    if (!name) continue

    const sets: SavedSet[] = []
    for (const s of lift.sets) {
      const hasWeight = s.weight != null && s.weight > 0
      const hasReps = s.reps != null && s.reps > 0
      // An untouched row (no weight, no reps, not missed) is noise — skip it.
      if (!hasWeight && !hasReps && !s.missed) continue
      sets.push({
        weight: hasWeight ? displayToKg(s.weight as number, units) : null,
        reps: hasReps ? Math.round(s.reps as number) : null,
        // Same logged-set test the rest of the app uses (isLoggedSet): a real
        // weight AND reps, not missed. A missed set is failed, never done.
        done: !s.missed && hasWeight && hasReps,
        failed: s.missed,
      })
    }
    if (sets.length === 0) continue

    out.push({
      id: lift.id,
      name,
      targetSets: sets.length,
      targetReps: lift.targetReps,
      sets,
    })
  }
  return out
}
