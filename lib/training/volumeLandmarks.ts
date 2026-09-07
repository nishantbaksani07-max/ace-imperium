/**
 * Weekly volume landmarks per muscle group.
 *
 * The single most consequential finding from resistance-training research
 * is the dose-response relationship between weekly working sets per
 * muscle and hypertrophy / strength outcomes. Schoenfeld, Ogborn &
 * Krieger 2017 (J Sports Sci 35:11) found each added weekly set produced
 * an additional ~0.37% gain in muscle size — but the curve flattens
 * past 10–20 sets per muscle for most lifters, and pushes diminishing
 * (or negative) returns past 22–25 sets.
 *
 * Renaissance Periodization codifies this into four landmarks:
 *   MV  — maintenance volume (below this, muscle shrinks)
 *   MEV — minimum effective volume (below this, no growth signal)
 *   MAV — maximum adaptive volume range (the productive zone)
 *   MRV — maximum recoverable volume (above this, junk/regression)
 *
 * Values below are RP's published landmarks, cross-checked against
 * Schoenfeld's dose-response data and Heaselgrave et al. 2019 IJSPP
 * (which showed no further biceps growth past ~18 sets/wk in N=49
 * trained men). Where RP and Schoenfeld disagree, we cap at the lower
 * value to stay on the well-supported side of the evidence.
 *
 * "Hard set" definition (Schoenfeld/Nuckols convention): a working set
 * taken to within 3 reps of failure in the prescribed rep range.
 * Warm-ups and feeder sets do not count.
 */

export type MuscleGroup =
  | 'chest' | 'lats' | 'mid_upper_back'
  | 'front_delts' | 'side_delts' | 'rear_delts'
  | 'biceps' | 'triceps'
  | 'quads' | 'hamstrings' | 'glutes' | 'calves'
  | 'core'

export interface VolumeLandmark {
  /** Maintenance volume — below this, the muscle de-trains. */
  mv: number
  /** Minimum effective volume — below this, no growth signal. */
  mev: number
  /** Maximum adaptive volume range — the productive zone. */
  mav: [number, number]
  /** Maximum recoverable volume — above this, growth regresses. */
  mrv: number
}

// Sources cited above the constant per project convention.
export const VOLUME_LANDMARKS: Record<MuscleGroup, VolumeLandmark> = {
  chest:          { mv: 6, mev: 10, mav: [12, 18], mrv: 22 },
  lats:           { mv: 6, mev: 10, mav: [14, 20], mrv: 25 },
  mid_upper_back: { mv: 6, mev: 10, mav: [14, 22], mrv: 25 },
  front_delts:    { mv: 0, mev: 6,  mav: [8,  12], mrv: 16 },
  side_delts:     { mv: 6, mev: 8,  mav: [12, 20], mrv: 26 },
  rear_delts:     { mv: 0, mev: 6,  mav: [10, 18], mrv: 22 },
  biceps:         { mv: 5, mev: 8,  mav: [10, 18], mrv: 22 },
  triceps:        { mv: 4, mev: 6,  mav: [8,  14], mrv: 18 },
  quads:          { mv: 6, mev: 8,  mav: [10, 16], mrv: 20 },
  hamstrings:     { mv: 4, mev: 6,  mav: [8,  14], mrv: 18 },
  glutes:         { mv: 0, mev: 6,  mav: [8,  14], mrv: 18 },
  calves:         { mv: 6, mev: 8,  mav: [10, 16], mrv: 20 },
  core:           { mv: 0, mev: 4,  mav: [6,  12], mrv: 16 },
}

import type { Goal } from '@/app/app/fitness/setup/presets'

/**
 * Target weekly sets per muscle for a given goal. The target is where
 * we want the program to land before any individual modifiers
 * (recovery, cardio, outside training, priorities) shift it.
 *
 *   strength : low end of MAV — strength saturates ~10–15 sets/muscle
 *   muscle   : upper MAV       — push toward the dose-response ceiling
 *   fat_loss : low MAV         — recovery is the limiter in a deficit
 *   recomp   : mid MAV         — split the difference
 *   health   : MEV             — minimum effective dose is sufficient
 */
export function targetSetsForGoal(goal: Goal, lm: VolumeLandmark): number {
  switch (goal) {
    case 'strength': return Math.round((lm.mev + lm.mav[0]) / 2)
    case 'muscle':   return lm.mav[1]
    case 'fat_loss': return Math.round((lm.mev + lm.mav[0]) / 2)
    case 'recomp':   return Math.round((lm.mav[0] + lm.mav[1]) / 2)
    case 'health':   return lm.mev
  }
}
