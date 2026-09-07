// Where a photographed meal came from. Picked by the user on the scan-context
// sheet, it nudges how the vision model reads hidden fats: dining-hall and
// restaurant cooking hide a lot of oil/butter the camera never sees; whole
// single foods carry almost none. One source of truth for both the UI (label,
// icon, info note) and the model-facing hint sentence the API forwards.

import type { IconName } from '@/components/VitalityIcon'

export type FoodSource = 'homemade' | 'restaurant' | 'hall' | 'whole'

/** How much unseen oil/butter/sauce we add back, drives the info-card meter. */
export type FatLevel = 'none' | 'low' | 'medium' | 'high'

export interface FoodSourceDef {
  id: FoodSource
  label: string
  icon: IconName
  /** One-line "what this is", shown big in the info card. */
  meaning: string
  /** One concrete, scannable example of the hidden fat (or lack of it). */
  example: string
  /** Drives the animated "hidden fat" meter in the info card. */
  fatLevel: FatLevel
  /** The sentence forwarded to the vision model as a hidden-fat prior. */
  hint: string
}

export const FOOD_SOURCES: FoodSourceDef[] = [
  {
    id: 'homemade',
    label: 'Homemade',
    icon: 'home',
    meaning: 'You cooked it, so you know what went in.',
    example: 'You measured the oil, so the plate is the plate.',
    fatLevel: 'low',
    hint: 'Meal source: home cooking. The user knows what went in, so trust the visible plate and do not inflate hidden fats.',
  },
  {
    id: 'restaurant',
    label: 'Restaurant',
    icon: 'storefront',
    meaning: 'Cooked with more oil and butter than you see.',
    example: 'A seared chicken breast can hide a spoon of pan butter.',
    fatLevel: 'medium',
    hint: 'Meal source: restaurant or takeout. Restaurant cooking uses noticeably more oil and butter than is visible, so bias fat and total kcal upward (roughly 20 to 40 percent on cooked savory items).',
  },
  {
    id: 'hall',
    label: 'Dining hall',
    icon: 'building',
    meaning: 'Heavy hidden sauces and oils.',
    example: 'Buffet ladles and flat tops add fat fast.',
    fatLevel: 'high',
    hint: 'Meal source: dining hall. Dining halls add heavy unseen oils, butter and sauces, so bias fat and total kcal upward at least as much as a restaurant for cooked savory items.',
  },
  {
    id: 'whole',
    label: 'Whole foods',
    icon: 'leaf',
    meaning: 'Plain single foods, almost nothing hidden.',
    example: 'An apple is an apple. We read it tight.',
    fatLevel: 'none',
    hint: "Meal source: whole, minimally processed single foods. Assume little to no hidden added fat, estimate tightly, and lean toward state 'confident' when the items are clear.",
  },
]

/** Meter fill % + plain word for each hidden-fat level. */
export const FAT_METER: Record<FatLevel, { fill: number; word: string }> = {
  none: { fill: 8, word: 'almost none' },
  low: { fill: 30, word: 'a little' },
  medium: { fill: 62, word: 'a fair bit' },
  high: { fill: 92, word: 'a lot' },
}

/** Slider order, low → high. */
export const FAT_LEVELS: FatLevel[] = ['none', 'low', 'medium', 'high']

/** What the user's chosen fat level tells the model. Always paired with the
 *  smart guard below so the photo still wins for obviously plain food. */
const FAT_LEVEL_HINT: Record<FatLevel, string> = {
  none: 'The user says this plate has almost no added oil or fat, so estimate fat tightly and do not inflate it.',
  low: 'The user says this plate has only a little added oil or fat, so add just a small amount of hidden fat to any cooked savory items.',
  medium: 'The user says this plate has a fair bit of added oil or fat, so bias fat moderately upward on cooked savory items.',
  high: 'The user says this plate has a lot of added oil or fat, so bias fat strongly upward on cooked savory items.',
}

// Keeps the feature smart: a user-set fat level is a prior, never a blind bump.
// The model must still read the photo and leave plain food plain.
const FAT_SMART_GUARD =
  'Still judge from the photo: do not add hidden fat to obviously plain foods. A plain salad, fruit, plain boiled eggs, or a plain grilled chicken breast are what they look like, even from a dining hall.'

export function sourceHint(source: FoodSource | null | undefined): string | undefined {
  if (!source) return undefined
  return FOOD_SOURCES.find((s) => s.id === source)?.hint
}

/**
 * The hidden-fat prior forwarded to the vision model. The source picker sets a
 * default fat level; if the user leaves the slider there, the source's own hint
 * stands (unchanged behavior). If they move it, THAT level wins — sent with the
 * smart guard so plain plates never get fat added regardless of where they came
 * from.
 */
export function mealFatHint(
  source: FoodSource | null | undefined,
  level: FatLevel | null | undefined,
): string | undefined {
  const src = source ? FOOD_SOURCES.find((s) => s.id === source) : undefined
  // No explicit level, or it matches the source default → source hint stands.
  if (!level || (src && level === src.fatLevel)) return src?.hint
  const where = src ? `Meal source: ${src.label.toLowerCase()}. ` : ''
  return `${where}${FAT_LEVEL_HINT[level]} ${FAT_SMART_GUARD}`
}
