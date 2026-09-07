import type { DayExercise } from '../log/splitData'

export interface TunePatch {
  weightKg: number
  restSec: number
  sets: number
  reps: number
}

/** Apply a saved tune to one exercise in a day's list. Pure: returns a new
 *  array, marks the lift `tuned`, leaves every other row untouched. */
export function setExerciseTune(
  exercises: DayExercise[],
  id: string,
  patch: TunePatch,
): DayExercise[] {
  return exercises.map(e =>
    e.id === id
      ? { ...e, weightKg: patch.weightKg, restSec: patch.restSec, sets: patch.sets, reps: patch.reps, tuned: true }
      : e,
  )
}
