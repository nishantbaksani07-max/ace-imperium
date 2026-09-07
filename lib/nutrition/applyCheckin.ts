// Turn an accepted check-in's suggested weekly-average calories into the
// nutrition_goals column patch to persist. Cycle-aware: re-splits gym/rest
// preserving the gap (via the engine's resplitForCycle); otherwise shifts the
// single base target, holding protein + fat and absorbing the kcal delta into
// carbs (consistent with macroCalc's cycle invariant). The target stays
// user-editable afterwards.

import { resplitForCycle } from './adaptive'
import type { NutritionGoals } from './types'

export function acceptedGoalPatch(goals: NutritionGoals, suggestedKcal: number): Record<string, number> {
  if (goals.cycleEnabled && goals.training && goals.rest && goals.trainingDays != null) {
    const { training, rest } = resplitForCycle(
      { training: goals.training, rest: goals.rest, trainingDaysPerWeek: goals.trainingDays },
      suggestedKcal,
    )
    return {
      kcal_target: suggestedKcal, // base = the new weekly average (cyclers never see it)
      training_kcal: training.kcal,
      training_protein: training.protein,
      training_carbs: training.carbs,
      training_fat: training.fat,
      rest_kcal: rest.kcal,
      rest_protein: rest.protein,
      rest_carbs: rest.carbs,
      rest_fat: rest.fat,
    }
  }
  const deltaKcal = suggestedKcal - goals.kcalTarget
  const carbs = Math.max(0, Math.round((goals.carbsTarget ?? 0) + deltaKcal / 4))
  return {
    kcal_target: suggestedKcal,
    protein_target: goals.proteinTarget,
    carbs_target: carbs,
    fat_target: goals.fatTarget ?? 0,
  }
}
