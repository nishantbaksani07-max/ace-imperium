// Fuel Coach — deterministic food-quality classifier (pure, zero AI).
//
// The vision/USDA pipeline already gave every logged food a name + a USDA
// description at log time. Classifying "whole vs processed" on top of that is a
// keyword match, so it is instant, free, never goes dark, and works for
// photo, manual, and barcode meals alike.
//
// Guiding rule (never punish for missing data): a food we cannot classify is
// NEUTRAL and counts as neutral-positive, so a typed "lunch" with no descriptors
// never tanks the whole-foods row.

import type { MealFood } from './types'
import type { NutritionRestriction } from '@/lib/preferences'

export type Processing = 'whole' | 'neutral' | 'processed'

export interface FoodQuality {
  /** 0..1 share of the day's grams from whole / minimally processed food
   *  (neutral grams count as 0.6 so unknowns never punish). */
  wholeRatio: number
  /** 0..1 share of grams from clearly processed food. */
  processedShare: number
  /** 0..1 how much fruit/veg is on the plate (drives the micros row). */
  produceRatio: number
  /** 0..1 neutral-positive micros proxy (fiber is not tracked per-meal yet, so
   *  this leans on produce; defaults to ~0.5 with no signal). */
  microsScore: number
  /** Names of the whole foods, for the reason line. */
  topWholeFoods: string[]
  /** 0..1 share of grams from clearly sugar-forward food (drives the cut_sugar
   *  dietStyle coach). */
  sugarShare: number
  /** 0..1 share of grams from fast food / ultra-processed brands + items (drives
   *  the quit_fastfood dietStyle coach). */
  fastFoodShare: number
  /** Names of the sugary items on the plate, for the coach's reason line. */
  topSugaryFoods: string[]
  /** Names of the fast-food / ultra-processed items, for the reason line. */
  topFastFoods: string[]
}

// Keyword lists live in one place, easy to extend. Matched against the food
// name + its USDA description (both lowercased).
const WHOLE = [
  'egg', 'chicken', 'beef', 'steak', 'turkey', 'pork', 'lamb', 'fish', 'tuna',
  'salmon', 'cod', 'shrimp', 'tofu', 'tempeh', 'lentil', 'bean', 'chickpea',
  'yogurt', 'greek', 'cottage cheese', 'milk', 'oat', 'rice', 'quinoa', 'potato',
  'sweet potato', 'avocado', 'almond', 'walnut', 'peanut', 'seed', 'broccoli',
  'spinach', 'kale', 'lettuce', 'carrot', 'pepper', 'tomato', 'cucumber',
  'onion', 'mushroom', 'zucchini', 'asparagus', 'green bean', 'pea', 'corn',
  'apple', 'banana', 'berry', 'orange', 'grape', 'melon', 'pear', 'mango',
  'vegetable', 'fruit', 'salad',
]
const PRODUCE = [
  'broccoli', 'spinach', 'kale', 'lettuce', 'carrot', 'pepper', 'tomato',
  'cucumber', 'onion', 'mushroom', 'zucchini', 'asparagus', 'green bean', 'pea',
  'corn', 'apple', 'banana', 'berry', 'orange', 'grape', 'melon', 'pear',
  'mango', 'vegetable', 'fruit', 'salad', 'greens',
]
const PROCESSED = [
  'chip', 'fries', 'fried', 'soda', 'cola', 'candy', 'chocolate bar', 'cookie',
  'cake', 'pastry', 'donut', 'doughnut', 'pizza', 'burger', 'cheeseburger',
  'nugget', 'hot dog', 'mac and cheese', 'macaroni and cheese', 'ramen',
  'instant noodle', 'ice cream', 'bacon', 'sausage', 'pepperoni', 'processed',
  'fast food', 'mcdonald', 'taco bell', 'kfc', 'wendy', 'pop tart', 'cereal bar',
  'energy drink', 'milkshake', 'frosting', 'syrup', 'white bread',
]
// Sugar-forward items — for the cut_sugar dietStyle. Not "processed" per se (a
// smoothie or flavoured yogurt is not junk), just where the sugar hides.
const HIGH_SUGAR = [
  'soda', 'cola', 'candy', 'chocolate', 'cookie', 'cake', 'pastry', 'donut',
  'doughnut', 'ice cream', 'milkshake', 'frosting', 'syrup', 'honey', 'jam',
  'jelly', 'juice', 'lemonade', 'energy drink', 'sports drink', 'gatorade',
  'frappuccino', 'latte', 'mocha', 'sweetened', 'dessert', 'brownie', 'muffin',
  'granola bar', 'cereal', 'pop tart', 'sugar', 'gummy', 'caramel', 'sherbet',
]
// Fast food / ultra-processed brands + items — for the quit_fastfood dietStyle.
const FAST_FOOD = [
  'fast food', 'mcdonald', 'burger king', 'taco bell', 'kfc', 'wendy',
  'chick-fil-a', 'chickfila', 'popeyes', 'subway', 'dominos', "domino's",
  'pizza hut', 'chipotle', 'five guys', 'in-n-out', 'in n out', 'sonic',
  'arby', 'dairy queen', 'drive-thru', 'drive thru', 'takeout', 'take-out',
  'fries', 'cheeseburger', 'nugget', 'hot dog', 'fried chicken',
]

function haystack(food: { name?: string; usdaDescription?: string }): string {
  return `${food?.name || ''} ${food?.usdaDescription || ''}`.toLowerCase()
}

function matches(hay: string, list: string[]): boolean {
  for (const kw of list) if (hay.includes(kw)) return true
  return false
}

// Stricter match for the ALLERGEN guard, where a false positive is embarrassing
// and erodes trust. Word-boundary + optional plural, so "eggs"/"peanuts" match
// but "eggplant"/"hamburger"/"honeydew"/"butternut" do NOT. Broad substring
// matching stays for the quality classifier (where "blueberry" -> "berry" is
// wanted); this narrow matcher is allergen-only.
const allergenRe = new Map<string, RegExp>()
function matchesAllergen(hay: string, list: string[]): boolean {
  for (const kw of list) {
    let re = allergenRe.get(kw)
    if (!re) {
      const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      re = new RegExp(`\\b${esc}(?:s|es)?\\b`)
      allergenRe.set(kw, re)
    }
    if (re.test(hay)) return true
  }
  return false
}

/** Classify a single food. Processed wins over whole when both hit (e.g.
 *  "fried chicken"); unknown text is neutral, never punished. */
export function classifyFood(food: { name?: string; usdaDescription?: string }): Processing {
  const hay = haystack(food)
  if (!hay.trim()) return 'neutral'
  if (matches(hay, PROCESSED)) return 'processed'
  if (matches(hay, WHOLE)) return 'whole'
  return 'neutral'
}

function isProduce(food: { name?: string; usdaDescription?: string }): boolean {
  return matches(haystack(food), PRODUCE)
}

/**
 * Aggregate quality over the day's foods (gram-weighted). Empty day → a calm
 * neutral-positive default (never zero), so a fresh or detail-poor day is not
 * graded harshly.
 */
export function dayFoodQuality(foods: MealFood[]): FoodQuality {
  const list = Array.isArray(foods) ? foods : []
  let whole = 0
  let processed = 0
  let neutral = 0
  let produce = 0
  let sugar = 0
  let fastfood = 0
  let total = 0
  const wholeNames: string[] = []
  const sugaryNames: string[] = []
  const fastNames: string[] = []
  const push = (arr: string[], name?: string) => {
    if (name && arr.length < 4 && !arr.includes(name)) arr.push(name)
  }

  for (const f of list) {
    const g = Math.max(0, Number(f?.grams) || 0)
    if (g <= 0) continue
    total += g
    const c = classifyFood(f)
    if (c === 'whole') {
      whole += g
      push(wholeNames, f?.name)
    } else if (c === 'processed') {
      processed += g
    } else {
      neutral += g
    }
    if (isProduce(f)) produce += g
    const hay = haystack(f)
    if (matches(hay, HIGH_SUGAR)) { sugar += g; push(sugaryNames, f?.name) }
    if (matches(hay, FAST_FOOD)) { fastfood += g; push(fastNames, f?.name) }
  }

  if (total <= 0) {
    return {
      wholeRatio: 0.6, processedShare: 0, produceRatio: 0, microsScore: 0.5,
      topWholeFoods: [], sugarShare: 0, fastFoodShare: 0, topSugaryFoods: [], topFastFoods: [],
    }
  }

  // Neutral grams count as 0.6 (neutral-positive) so unknowns never punish.
  const wholeRatio = Math.min(1, (whole + 0.6 * neutral) / total)
  const processedShare = Math.min(1, processed / total)
  const produceRatio = Math.min(1, produce / total)
  // Micros proxy: fiber is not tracked per meal yet, so lean on produce with a
  // neutral 0.4 floor (a day with greens scores higher; a day without is not
  // punished, just not rewarded).
  const microsScore = Math.max(0, Math.min(1, 0.4 + 0.6 * produceRatio))

  return {
    wholeRatio, processedShare, produceRatio, microsScore, topWholeFoods: wholeNames,
    sugarShare: Math.min(1, sugar / total),
    fastFoodShare: Math.min(1, fastfood / total),
    topSugaryFoods: sugaryNames,
    topFastFoods: fastNames,
  }
}

// ── Allergen guard (deterministic, warm, never red) ──────────────────────────
//
// A safety net, not a diagnosis: keyword-matches a logged food's name + USDA
// description against the allergens/diets the user asked to avoid (stored in
// user_profile.preferences.nutrition, already captured by the food-story quiz).
// The coach surfaces a HEDGED caution ("looks like it may contain ..."), because
// a keyword match is a heads-up, not a lab test. Anything the user cannot eat is
// worth a gentle second look; false positives cost a glance, a miss costs more.

// Only the restrictions that describe something that can be physically IN a food
// map to keywords. 'none' and preference-only values fall through to no match.
const RESTRICTION_KEYWORDS: Partial<Record<NutritionRestriction, string[]>> = {
  gluten_free: ['wheat', 'bread', 'pasta', 'flour', 'barley', 'rye', 'cracker', 'bagel', 'tortilla', 'noodle', 'couscous', 'breaded', 'batter', 'crouton', 'pretzel'],
  // 'butter' intentionally omitted: it collides with peanut/almond/nut butter
  // (dairy-free). Dairy is caught via milk/cheese/cream/yogurt/whey/dairy.
  lactose: ['milk', 'cheese', 'yogurt', 'cream', 'ice cream', 'custard', 'latte', 'whey', 'dairy'],
  peanut: ['peanut'],
  tree_nut: ['almond', 'walnut', 'cashew', 'pecan', 'pistachio', 'hazelnut', 'macadamia', 'brazil nut', 'pine nut'],
  egg: ['egg', 'omelet', 'omelette', 'mayonnaise', 'mayo', 'meringue', 'custard', 'frittata', 'quiche'],
  soy: ['soy', 'soybean', 'tofu', 'tempeh', 'edamame', 'miso', 'soya'],
  fish: ['fish', 'salmon', 'tuna', 'cod', 'tilapia', 'anchovy', 'sardine', 'mackerel', 'trout', 'haddock'],
  shellfish: ['shrimp', 'prawn', 'crab', 'lobster', 'clam', 'mussel', 'oyster', 'scallop', 'shellfish', 'crayfish', 'calamari', 'squid'],
  sesame: ['sesame', 'tahini', 'hummus'],
  pork_free: ['pork', 'bacon', 'ham', 'prosciutto', 'chorizo', 'lard', 'pancetta', 'salami'],
  vegetarian: ['chicken', 'beef', 'steak', 'pork', 'lamb', 'turkey', 'bacon', 'ham', 'fish', 'salmon', 'tuna', 'shrimp', 'sausage', 'pepperoni', 'meat'],
  vegan: ['chicken', 'beef', 'steak', 'pork', 'lamb', 'turkey', 'bacon', 'ham', 'fish', 'salmon', 'shrimp', 'sausage', 'egg', 'milk', 'cheese', 'yogurt', 'butter', 'cream', 'honey', 'gelatin', 'whey'],
  halal: ['pork', 'bacon', 'ham', 'lard', 'prosciutto', 'pancetta', 'gelatin', 'wine', 'beer', 'rum', 'vodka'],
  kosher: ['pork', 'bacon', 'ham', 'shellfish', 'shrimp', 'crab', 'lobster', 'clam', 'oyster'],
}

// How to phrase each restriction. 'allergen' items get "looks like it may
// contain <label>" (something IN the food). 'diet' items get "may not be
// <label>" (the food itself breaks the diet), so "scrambled eggs may not be
// vegan" instead of the awkward "eggs may contain an animal product".
const RESTRICTION_META: Partial<Record<NutritionRestriction, { kind: 'allergen' | 'diet'; label: string }>> = {
  gluten_free: { kind: 'allergen', label: 'gluten' },
  lactose: { kind: 'allergen', label: 'dairy' },
  peanut: { kind: 'allergen', label: 'peanuts' },
  tree_nut: { kind: 'allergen', label: 'tree nuts' },
  egg: { kind: 'allergen', label: 'egg' },
  soy: { kind: 'allergen', label: 'soy' },
  fish: { kind: 'allergen', label: 'fish' },
  shellfish: { kind: 'allergen', label: 'shellfish' },
  sesame: { kind: 'allergen', label: 'sesame' },
  pork_free: { kind: 'diet', label: 'pork-free' },
  vegetarian: { kind: 'diet', label: 'vegetarian' },
  vegan: { kind: 'diet', label: 'vegan' },
  halal: { kind: 'diet', label: 'halal' },
  kosher: { kind: 'diet', label: 'kosher' },
}

export interface AllergenFlag {
  /** The food name that tripped the match. */
  food: string
  /** The restriction it appears to conflict with. */
  restriction: NutritionRestriction
  /** 'allergen' = the food may contain <label>; 'diet' = the food may not be <label>. */
  kind: 'allergen' | 'diet'
  /** The allergen or diet name, for the coach's sentence. */
  label: string
}

/**
 * Scan a set of logged foods against the user's restrictions and return gentle
 * flags. Pure + deterministic. Returns [] when the user has no restrictions
 * (or only 'none'), so it is free to call on every render. At most one flag per
 * food (the first restriction it trips), newest-food-first is the caller's job.
 */
export function flaggedAllergens(
  foods: Pick<MealFood, 'name' | 'usdaDescription'>[] | null | undefined,
  restrictions: NutritionRestriction[] | null | undefined,
): AllergenFlag[] {
  const active = (restrictions || []).filter((r) => r && r !== 'none' && RESTRICTION_KEYWORDS[r])
  if (!active.length) return []
  const out: AllergenFlag[] = []
  for (const f of foods || []) {
    const hay = haystack(f)
    if (!hay.trim()) continue
    for (const r of active) {
      if (matchesAllergen(hay, RESTRICTION_KEYWORDS[r]!)) {
        const meta = RESTRICTION_META[r] ?? { kind: 'allergen' as const, label: 'something you avoid' }
        out.push({ food: f?.name || 'that food', restriction: r, kind: meta.kind, label: meta.label })
        break // one flag per food is enough; don't pile on
      }
    }
  }
  return out
}
