/**
 * Weekly volume audit for a personalized program.
 *
 * Given a PresetDay[] (the engine's tailored output), count working
 * sets per MuscleGroup across the whole week, compare to the
 * goal-conditioned target after modifier composition, and report
 * any muscle that falls below MEV. Callers can use the audit result
 * to add accessories (backfill below-MEV muscles) or just surface
 * the numbers to the user in the picker.
 */

import type { PresetDay, IntakeAnswers } from '@/app/app/fitness/setup/presets'
import {
  VOLUME_LANDMARKS,
  targetSetsForGoal,
  type MuscleGroup,
  type VolumeLandmark,
} from './volumeLandmarks'
import { setCredits } from './muscleMapping'
import {
  composeModifiers,
  recoveryModifier,
  cardioAndOutsideModifier,
  applyModifier,
} from './modifiers'

export interface MuscleAudit {
  muscle: MuscleGroup
  /** Working sets credited this week (primary 1.0× + secondary 0.5×). */
  weeklySets: number
  /** Target after composing recovery/outside/cardio modifiers. */
  target: number
  landmark: VolumeLandmark
  /** Quick categorization of where the volume lands. */
  status: 'under_mv' | 'under_mev' | 'in_range' | 'at_mrv_ceiling'
}

export function auditWeeklyVolume(
  days: PresetDay[],
  answers: IntakeAnswers,
): Record<MuscleGroup, MuscleAudit> {
  // Step 1: count sets per muscle across all days.
  const tally: Partial<Record<MuscleGroup, number>> = {}
  for (const day of days) {
    if (day.category === 'rest') continue
    for (const ex of day.exercises) {
      const credits = setCredits(ex.id, ex.sets)
      for (const [m, c] of Object.entries(credits)) {
        const muscle = m as MuscleGroup
        tally[muscle] = (tally[muscle] ?? 0) + c
      }
    }
  }

  // Step 2: compose modifiers once per audit. v2 merged outside training
  // + cardio into one modality-aware modifier.
  const mod = composeModifiers(
    recoveryModifier(answers.recovery),
    cardioAndOutsideModifier(answers.cardioAndOutside),
  )

  // Step 3: per muscle, compute target and status.
  const out = {} as Record<MuscleGroup, MuscleAudit>
  for (const [m, landmark] of Object.entries(VOLUME_LANDMARKS)) {
    const muscle = m as MuscleGroup
    const weeklySets = Math.round((tally[muscle] ?? 0) * 10) / 10
    const baseTarget = targetSetsForGoal(answers.goal, landmark)
    const target = applyModifier(muscle, baseTarget, mod)
    let status: MuscleAudit['status']
    if (weeklySets < landmark.mv)  status = 'under_mv'
    else if (weeklySets < landmark.mev) status = 'under_mev'
    else if (weeklySets >= landmark.mrv) status = 'at_mrv_ceiling'
    else status = 'in_range'
    out[muscle] = { muscle, weeklySets, target, landmark, status }
  }
  return out
}

/** Muscles that are below MEV — the audit flags these as "the program
 *  isn't giving you a growth signal here." Sorted by deficit (largest
 *  gap first) so backfill callers know which to address first. */
export function musclesUnderMEV(audit: Record<MuscleGroup, MuscleAudit>): MuscleAudit[] {
  return Object.values(audit)
    .filter(a => a.status === 'under_mev' || a.status === 'under_mv')
    .sort((a, b) => (a.landmark.mev - a.weeklySets) > (b.landmark.mev - b.weeklySets) ? -1 : 1)
}
