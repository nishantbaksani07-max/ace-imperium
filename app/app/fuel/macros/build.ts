// Client-side meal builders. Each returns a SaveMealInput (no id / loggedAt —
// the server assigns those). Mirrors the standalone's mealFrom* helpers but
// emits Vitality's camelCase Meal shape.

import type {
  Macros,
  MealType,
  ParsedMeal,
  UsdaCandidate,
  OffMatch,
  Meal,
} from '@/lib/nutrition/types'
import { scaleMacros, scaleDrinkToMl } from '@/lib/nutrition/macros'
import type { QuickDrink, ResolvedMeal, RecentFood } from '@/lib/nutrition/macros'
import type { MealTemplate } from '@/lib/nutrition/types'
import type { SaveMealInput } from './actions'

let seq = 0
function tmpId(prefix: string): string {
  seq += 1
  return `${prefix}_${seq}_${Math.round(performance.now())}`
}

export function buildPhotoMeal(
  parsed: ParsedMeal,
  lookup: ResolvedMeal,
  thumbnail: string | null,
  dayKey: string,
  mealType: MealType
): SaveMealInput {
  return {
    dayKey,
    state: parsed.state,
    whatISee: parsed.what_i_see || '',
    mealType,
    totals: lookup.totals,
    foods: lookup.foods,
    unmatched: lookup.unmatched,
    clarifyingQuestions: parsed.clarifying_questions || [],
    thumbnail,
    source: 'photo',
    sourceRef: null,
  }
}

// `ml` is the chosen serving size from the size guide. Omit it to fall back to
// the preset's default volume (back-compat). Macros scale to the chosen size.
export function buildDrinkMeal(drink: QuickDrink, dayKey: string, ml?: number): SaveMealInput {
  const amount = typeof ml === 'number' && ml > 0 ? Math.round(ml) : drink.grams
  const { grams, macros } = scaleDrinkToMl(drink, amount)
  const sizeNote = amount !== drink.grams ? `, ${amount} ml` : ''
  return {
    dayKey,
    state: 'confident',
    whatISee: `(quick drink: ${drink.name}${sizeNote})`,
    mealType: 'snack',
    totals: { ...macros },
    foods: [
      {
        id: tmpId('food'),
        name: drink.name,
        grams,
        macros: { ...macros },
        hintUsed: drink.id,
        usdaDescription: `Quick drink preset: ${drink.name} (${amount} ml)`,
      },
    ],
    unmatched: [],
    clarifyingQuestions: [],
    thumbnail: null,
    source: 'drink',
    sourceRef: drink.id,
  }
}

export function buildManualMeal(
  candidate: UsdaCandidate,
  name: string,
  grams: number,
  dayKey: string
): SaveMealInput {
  const macros = scaleMacros(candidate.per100, grams)
  const displayName = (name || '').trim() || candidate.description || 'Manual entry'
  return {
    dayKey,
    state: 'confident',
    whatISee: `(manual entry: ${displayName})`,
    mealType: 'auto',
    totals: macros,
    foods: [
      {
        id: tmpId('food'),
        name: displayName,
        grams,
        macros,
        hintUsed: displayName,
        usdaDescription: candidate.description || '',
      },
    ],
    unmatched: [],
    clarifyingQuestions: [],
    thumbnail: null,
    source: 'manual',
    sourceRef: null,
  }
}

/** Optional per-100g micronutrients on a custom food. */
export type MicroKey = 'sugar' | 'fiber' | 'sodium' | 'potassium' | 'satFat' | 'cholesterol'

export interface CustomSpec {
  name: string
  grams: number
  kcal: number
  protein: number
  carbs: number
  fat: number
  /** Per-100g micros. Stored in the meal's totals jsonb under `micros` (no
   *  schema change); only the keys the user filled are kept. */
  micros?: Partial<Record<MicroKey, number>>
}

export function buildCustomMeal(spec: CustomSpec, dayKey: string): SaveMealInput {
  const per100: Macros = {
    kcal: Number(spec.kcal) || 0,
    protein: Number(spec.protein) || 0,
    carbs: Number(spec.carbs) || 0,
    fat: Number(spec.fat) || 0,
  }
  const grams = Number(spec.grams) || 0
  const macros = scaleMacros(per100, grams)
  const displayName = (spec.name || '').trim() || 'Custom food'
  // Scale any provided micros by the eaten grams and tuck them into the totals
  // jsonb (schema-free). Only keep keys the user actually filled.
  const scaledMicros: Record<string, number> = {}
  if (spec.micros) {
    for (const [k, v] of Object.entries(spec.micros)) {
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) scaledMicros[k] = Math.round(n * grams) / 100
    }
  }
  const totals = (Object.keys(scaledMicros).length ? { ...macros, micros: scaledMicros } : macros) as Macros
  return {
    dayKey,
    state: 'confident',
    whatISee: `(custom: ${displayName})`,
    mealType: 'auto',
    totals,
    foods: [
      {
        id: tmpId('food'),
        name: displayName,
        grams,
        macros,
        hintUsed: 'custom',
        usdaDescription: `Custom entry: ${Math.round(per100.kcal)} kcal/100g`,
      },
    ],
    unmatched: [],
    clarifyingQuestions: [],
    thumbnail: null,
    source: 'custom',
    sourceRef: null,
  }
}

export function buildTemplateMeal(template: MealTemplate, dayKey: string): SaveMealInput {
  const foods = (template.foods || []).map((f) => ({ ...f, id: tmpId('food') }))
  return {
    dayKey,
    state: 'confident',
    whatISee: `(from favorite: ${template.name})`,
    mealType: template.mealType || 'auto',
    totals: template.totals,
    foods,
    unmatched: [],
    clarifyingQuestions: [],
    thumbnail: template.thumbnail || null,
    source: 'template',
    sourceRef: template.id,
  }
}

export function buildBarcodeMeal(off: OffMatch, grams: number, dayKey: string): SaveMealInput {
  const macros = scaleMacros(off.per100, grams)
  const name = (off.name || '').trim() || 'Scanned product'
  return {
    dayKey,
    state: 'confident',
    whatISee: `(barcode: ${name})`,
    mealType: 'auto',
    totals: macros,
    foods: [{ id: tmpId('food'), name, grams, macros, hintUsed: off.code || 'barcode', usdaDescription: `Open Food Facts: ${name}` }],
    unmatched: [],
    clarifyingQuestions: [],
    thumbnail: off.thumbnail || null,
    source: 'barcode',
    sourceRef: off.code,
  }
}

export function buildRecentMeal(recent: RecentFood, dayKey: string): SaveMealInput {
  return {
    dayKey,
    state: 'confident',
    whatISee: `(quick re-log: ${recent.name})`,
    mealType: 'auto',
    totals: { ...recent.macros },
    foods: [
      {
        id: tmpId('food'),
        name: recent.name,
        grams: recent.grams,
        macros: { ...recent.macros },
        hintUsed: recent.name,
        usdaDescription: recent.usdaDescription || '',
      },
    ],
    unmatched: [],
    clarifyingQuestions: [],
    thumbnail: null,
    source: 'recent',
    sourceRef: null,
  }
}

/** Re-log a whole past meal (all its foods) onto another day — the "My Meals"
 *  one-tap repeat. Fresh food ids; keeps the meal's totals + type. */
export function buildRepeatMeal(meal: Meal, dayKey: string): SaveMealInput {
  return {
    dayKey,
    state: 'confident',
    whatISee: meal.whatISee || 'Meal',
    mealType: meal.mealType || 'auto',
    totals: { ...meal.totals },
    foods: (meal.foods || []).map((f) => ({ ...f, id: tmpId('food') })),
    unmatched: [],
    clarifyingQuestions: [],
    thumbnail: meal.thumbnail || null,
    source: 'manual',
    sourceRef: null,
  }
}
