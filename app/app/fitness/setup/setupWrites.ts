import { computeRecommendedWeights } from './tailorTable'
import type { GymLevel } from './actions'
import type { PresetDay } from './presets'

export interface SetupWrites {
  /** training_settings.recommended_weights — plain-id estimates for all lifts
   *  plus scoped `${exId}__${dayType}` overrides for tuned lifts. The logger's
   *  lookupStartingWeight reads scoped first, then plain id. */
  recommendedWeights: Record<string, number>
  /** training_settings.rest_overrides — scoped `${exId}__${dayType}`, tuned only. */
  restOverrides: Record<string, number>
}

/** Build the two persistence maps from the wizard's days. Pure — no Supabase. */
export function buildSetupWrites(
  days: PresetDay[],
  startingWeightKg: number,
  sex: 'M' | 'F',
  gymLevel: GymLevel,
): SetupWrites {
  const exerciseIds = Array.from(new Set(days.flatMap(d => d.exercises.map(e => e.id))))
  const recommendedWeights = computeRecommendedWeights(exerciseIds, startingWeightKg, sex, gymLevel)

  const restOverrides: Record<string, number> = {}
  for (const day of days) {
    for (const ex of day.exercises) {
      if (!ex.tuned) continue
      const key = `${ex.id}__${day.type}`
      if (typeof ex.weightKg === 'number') recommendedWeights[key] = ex.weightKg
      if (typeof ex.restSec === 'number') restOverrides[key] = ex.restSec
    }
  }

  return { recommendedWeights, restOverrides }
}
