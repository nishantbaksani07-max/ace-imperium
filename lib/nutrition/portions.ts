// Single source of truth for unit conversion lives in macros.ts (UNIT_PRESETS,
// unitToGrams, gramsToUnit). portions.ts re-exports a typed UI-friendly surface
// and keeps rescaleByGrams which is new here.
import type { Macros } from './types'
import {
  UNIT_PRESETS,
  unitToGrams as _unitToGrams,
  gramsToUnit as _gramsToUnit,
} from './macros'

// Dropdown-friendly list derived from the canonical table. The `{ id, label }`
// shape is what FoodEditor/FoodSearchPicker consume; `toGrams` is intentionally
// omitted here — callers use `unitToGrams`/`gramsToUnit` below.
export const PORTION_UNITS = UNIT_PRESETS.map((u) => ({
  id: u.id as PortionUnit,
  label: u.label,
}))

export type PortionUnit = 'g' | 'oz' | 'egg' | 'tbsp' | 'tsp' | 'ml'

// Delegate to macros.ts — ratios live in exactly one place.
export function unitToGrams(value: number, unit: PortionUnit): number {
  return _unitToGrams(value, unit)
}
export function gramsToUnit(grams: number, unit: PortionUnit): number {
  return _gramsToUnit(grams, unit)
}

// Rescale already-scaled macros from one gram amount to another, no new lookup.
// Guards a zero/invalid source so we never divide by zero.
export function rescaleByGrams(macros: Macros, fromGrams: number, toGrams: number): Macros {
  if (!(fromGrams > 0)) return macros
  const f = (Number(toGrams) || 0) / fromGrams
  return { kcal: macros.kcal * f, protein: macros.protein * f, carbs: macros.carbs * f, fat: macros.fat * f }
}

// Parse a free-text amount field into grams, returning 0 for anything that
// isn't a real positive number (empty, blank, NaN, Infinity, zero, negative).
// Callers gate "Save" on a positive result so clearing the field or typing a
// stray "-" can never silently zero out a food's macros. Never returns < 0.
export function portionStrToGrams(amountStr: string, unit: PortionUnit): number {
  const n = Number(amountStr)
  if (!Number.isFinite(n) || n <= 0) return 0
  return unitToGrams(n, unit)
}
