// Fuel · Macros loader set. Reuses the existing FOOD_FACTS (the macro tracker's
// shipped fun facts) rather than duplicating them, mapping each fact's `macro`
// to a CozyLoader tone. foodFacts.ts stays the source of truth and is untouched.

import { FOOD_FACTS, FACT_TAGS, type FactMacro } from '@/lib/nutrition/foodFacts'
import type { CozySet, ToneKey } from './types'

const MACRO_TONE: Record<FactMacro, ToneKey> = {
  protein: 'mint',
  general: 'mint',
  carbs: 'blue',
  fiber: 'blue',
  hydration: 'blue',
  fat: 'amber',
}

export const FUEL_SET: CozySet = {
  id: 'fuel',
  label: 'Fuel · Macros',
  title: 'Analyzing your photo…',
  tags: FACT_TAGS,
  tones: ['mint', 'blue', 'amber'],
  items: FOOD_FACTS.map((f) => ({ text: f.text, highlight: f.highlight, tone: MACRO_TONE[f.macro] })),
}
