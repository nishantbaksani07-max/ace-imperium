/**
 * Unit conversion helpers for the workout logger.
 *
 * Storage is ALWAYS kg (canonical, single source of truth in
 * recommended_weights and workouts.exercises.sets[].weight). Conversion
 * happens at the UI boundary only — pills + modal display in the user's
 * preferred unit, then convert back to kg before saving.
 *
 * Display snaps to the nearest sensible gym increment, NOT a whole number.
 * Real plate-based entries survive exactly (1.25, 2.5, 47.5); only junk
 * decimals from kg<->lb round-trips and coef-based system estimates get
 * cleaned up (e.g. 5.693 -> 5.75). kg snaps to 0.25 so 1.25kg micro plates
 * are preserved; lb snaps to 0.5.
 */

export type Units = 'metric' | 'imperial'

const LB_PER_KG = 2.20462262
const KG_PER_LB = 0.45359237

/** Snap a display value to the nearest gym increment (0.25 kg / 0.5 lb).
 *  Preserves precise plate weights (47.5 stays 47.5), cleans junk decimals
 *  (5.693 -> 5.75). 0.25 is the finest step that still keeps 1.25kg multiples. */
function snapDisplay(value: number, units: Units): number {
  const stepUnit = units === 'imperial' ? 0.5 : 0.25
  const snapped = Math.round(value / stepUnit) * stepUnit
  // Drop binary float fuzz (47.50000000001 -> 47.5) before it reaches the UI.
  return Math.round(snapped * 100) / 100
}

/** Convert a stored kg value into the user's display unit, snapped to a
 *  sensible gym increment (keeps 47.5, cleans 5.693 -> 5.75). */
export function kgToDisplay(kg: number, units: Units): number {
  if (units === 'imperial') return snapDisplay(kg * LB_PER_KG, units)
  return snapDisplay(kg, units)
}

/** Convert a user-entered display value back into kg for storage. */
export function displayToKg(value: number, units: Units): number {
  if (units === 'imperial') return value * KG_PER_LB
  return value
}

/** Short unit label used in pill rows + modal inputs. */
export function unitLabel(units: Units): 'kg' | 'lb' {
  return units === 'imperial' ? 'lb' : 'kg'
}
