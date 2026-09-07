// Macro math + the meal pipeline + derived daily/weekly stats.
//
// Pure functions ported from the calories-standalone. The orchestration
// (lookupMacrosForMeal) takes an injected searchFn so the browser can call it
// against /api/nutrition/usda-search while tests pass a stub.

import type {
  Macros,
  MealFood,
  MealType,
  UnmatchedFood,
  ParsedMeal,
  UsdaMatch,
  Meal,
  NutritionGoals,
} from './types'
import { previousDayKey } from './dayKey'

export const ZERO_MACROS: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 }

export function scaleMacros(per100: Macros, grams: number): Macros {
  const scale = (Number(grams) || 0) / 100
  return {
    kcal: per100.kcal * scale,
    protein: per100.protein * scale,
    carbs: per100.carbs * scale,
    fat: per100.fat * scale,
  }
}

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
  }
}

export function sumFoodMacros(foods: { macros: Macros }[]): Macros {
  return foods.reduce((acc, f) => addMacros(acc, f.macros), { ...ZERO_MACROS })
}

// ─── favorites (templates) ────────────────────────────────────────────────
// A favorite counts as "the same" as another when its name (case/whitespace-
// insensitive), meal type, and rounded macro totals all match. Tapping the
// star on one meal more than once inserts distinct rows with identical content;
// this content key is what lets us collapse and de-duplicate them.
export function templateContentKey(t: { name: string; mealType?: MealType; totals: Macros }): string {
  const name = (t.name || '').trim().toLowerCase().replace(/\s+/g, ' ')
  const tot = t.totals || ZERO_MACROS
  return [
    name,
    t.mealType ?? 'auto',
    Math.round(tot.kcal || 0),
    Math.round(tot.protein || 0),
    Math.round(tot.carbs || 0),
    Math.round(tot.fat || 0),
  ].join('|')
}

// Collapse content-duplicate favorites, keeping the first occurrence. Templates
// arrive newest-first, so the survivor is the most recently saved copy. Order of
// the survivors is preserved.
export function dedupeTemplates<T extends { name: string; mealType?: MealType; totals: Macros }>(list: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const t of list) {
    const key = templateContentKey(t)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

export function computeRemaining(
  consumed: number,
  target: number
): { remaining: number; over: boolean } {
  const remaining = target - consumed
  return { remaining: Math.abs(remaining), over: remaining < 0 }
}

// ─── Meal pipeline: parsed foods → USDA lookup → scaled totals ──────────

export type MacroSearchFn = (hint: string) => Promise<UsdaMatch | null>

export interface ResolvedMeal {
  totals: Macros
  foods: MealFood[]
  unmatched: UnmatchedFood[]
}

// Walks parsed.foods[], resolving each via searchFn (trying search_hints in
// order). Composite foods are expanded into their components. Scales per-100g
// macros by estimated grams. Composite components carry id=null (recompute on
// composites is out of v1 scope, same as the standalone).
export async function lookupMacrosForMeal(
  parsed: Pick<ParsedMeal, 'foods'>,
  searchFn: MacroSearchFn
): Promise<ResolvedMeal> {
  let totals: Macros = { ...ZERO_MACROS }
  const foods: MealFood[] = []
  const unmatched: UnmatchedFood[] = []

  const items: { id: string | null; name: string; grams: number; hints: string[] }[] = []
  for (const food of parsed.foods || []) {
    if (Array.isArray(food.components) && food.components.length > 0) {
      for (const c of food.components) {
        items.push({ id: null, name: c.name, grams: c.grams, hints: c.search_hints || [] })
      }
    } else {
      items.push({
        id: food.id || null,
        name: food.name,
        grams: food.estimated_grams,
        hints: food.search_hints || [],
      })
    }
  }

  // Resolve every food concurrently. Within a food, hints are still tried in
  // order (broad → specific) so the first good match wins; across foods the
  // lookups run in parallel — the difference between a ~12s waterfall and a
  // ~2s burst on a 5-item plate.
  const resolved = await Promise.all(
    items.map(async (item) => {
      let match: UsdaMatch | null = null
      let hintUsed: string | null = null
      for (const hint of item.hints) {
        const found = await searchFn(hint)
        if (found) {
          match = found
          hintUsed = hint
          break
        }
      }
      return { item, match, hintUsed }
    })
  )

  // Aggregate in original order so totals + UI stay deterministic.
  for (const { item, match, hintUsed } of resolved) {
    if (!match) {
      unmatched.push({ id: item.id, name: item.name, grams: item.grams, hintsTried: item.hints })
      continue
    }
    const macros = scaleMacros(match.per100, item.grams)
    totals = addMacros(totals, macros)
    foods.push({
      id: item.id,
      name: item.name,
      grams: item.grams,
      macros,
      hintUsed,
      usdaDescription: match.description || '',
    })
  }
  return { totals, foods, unmatched }
}

// Returns true when the user's clarifying answer is just a more-detailed
// restatement of the food already identified (all significant words of the
// current name appear in the answer) — skip the USDA re-query in that case.
export function isClarifyingAnswer(currentName: string, answerLabel: string): boolean {
  const sig = (s: string) =>
    new Set((s || '').toLowerCase().split(/[\s,]+/).filter((w) => w.length > 2))
  const cur = sig(currentName)
  const ans = sig(answerLabel)
  if (cur.size === 0) return false
  for (const w of Array.from(cur)) if (!ans.has(w)) return false
  return true
}

// ─── Quick drinks + unit presets (hardcoded references) ─────────────────

export interface QuickDrink {
  id: string
  name: string
  grams: number
  macros: Macros
}

export const QUICK_DRINKS: QuickDrink[] = [
  { id: 'water', name: 'Water', grams: 250, macros: { kcal: 0, protein: 0, carbs: 0, fat: 0 } },
  { id: 'coffee', name: 'Coffee (black)', grams: 250, macros: { kcal: 3, protein: 0.3, carbs: 0, fat: 0 } },
  { id: 'milk', name: 'Milk, 2%', grams: 245, macros: { kcal: 122, protein: 8, carbs: 12, fat: 5 } },
  { id: 'oatmilk', name: 'Oat milk', grams: 240, macros: { kcal: 120, protein: 3, carbs: 16, fat: 5 } },
  { id: 'beer', name: 'Beer (12 oz)', grams: 355, macros: { kcal: 153, protein: 1.6, carbs: 13, fat: 0 } },
]

export interface UnitPreset {
  id: string
  label: string
  toGrams: number
}

// "Cup" is deliberately omitted: cup-to-grams varies wildly by food.
export const UNIT_PRESETS: UnitPreset[] = [
  { id: 'g', label: 'g', toGrams: 1 },
  { id: 'oz', label: 'oz', toGrams: 28.3495 },
  { id: 'egg', label: 'eggs', toGrams: 50 },
  { id: 'tbsp', label: 'tbsp', toGrams: 15 },
  { id: 'tsp', label: 'tsp', toGrams: 5 },
  { id: 'ml', label: 'ml', toGrams: 1 },
]

export function unitToGrams(value: number, unitId: string): number {
  const unit = UNIT_PRESETS.find((u) => u.id === unitId)
  return Number(value) * (unit ? unit.toGrams : 1)
}

export function gramsToUnit(grams: number, unitId: string): number {
  const unit = UNIT_PRESETS.find((u) => u.id === unitId)
  return Number(grams) / (unit ? unit.toGrams : 1)
}

// ─── Drink sizes (true-to-scale vessel guide) ───────────────────────────
// Six real-world vessels, each anchored to a familiar object so "how big is
// 470 ml?" reads instantly. Drawn true-to-scale in the picker; ascending volume.

export interface DrinkSize {
  id: string
  name: string
  ml: number
  /** an everyday object this size is like — the "smart" relatability anchor */
  anchor: string
}

export const DRINK_SIZES: DrinkSize[] = [
  { id: 'glass', name: 'Glass', ml: 250, anchor: 'a juice glass' },
  { id: 'can', name: 'Can', ml: 330, anchor: 'a soda can' },
  { id: 'mug', name: 'Mug', ml: 350, anchor: 'a coffee mug' },
  { id: 'pint', name: 'Pint', ml: 470, anchor: 'a pub pint' },
  { id: 'bottle', name: 'Bottle', ml: 500, anchor: 'a water bottle' },
  { id: 'large', name: 'Large', ml: 600, anchor: 'a big gas-station cup' },
]

/** Daily hydration goal, ml — the denominator for "% of your day". */
export const HYDRATION_GOAL_ML = 2500

export const ML_PER_OZ = 29.5735

/** ml → US fluid ounces, rounded to .1 */
export function mlToOz(ml: number): number {
  return Math.round((ml / ML_PER_OZ) * 10) / 10
}

// Validate a custom caloric drink's "per serving (ml)" field. Returns the
// integer ml for a real positive number, else null. A caloric drink's calories
// are stated per this serving, so a blank/zero value must block Save rather than
// silently defaulting to 330 ml (which mis-states the drink's calorie density).
export function parseDrinkServingMl(servStr: string): number | null {
  const n = Number(servStr)
  if (!Number.isFinite(n) || n < 1) return null
  return Math.round(n)
}

// Scale a quick-drink preset to an arbitrary volume (ml). The preset's macros
// are stated for its default `grams` (drinks are ~1 g/ml), so we scale linearly.
// Water/coffee (≈0 kcal) stay ≈0; caloric drinks scale their P·C·F·kcal.
export function scaleDrinkToMl(drink: QuickDrink, ml: number): { grams: number; macros: Macros } {
  const base = drink.grams > 0 ? drink.grams : ml
  const f = base > 0 ? ml / base : 1
  return {
    grams: ml,
    macros: {
      kcal: drink.macros.kcal * f,
      protein: drink.macros.protein * f,
      carbs: drink.macros.carbs * f,
      fat: drink.macros.fat * f,
    },
  }
}

// ─── Derived: recent foods, streaks, week summary ───────────────────────

export interface RecentFood {
  name: string
  grams: number
  macros: Macros
  eatCount: number
  usdaDescription: string
}

// Top-N foods eaten >=2 times across the supplied meals, with average grams +
// average per-portion macros. Pass the last ~7 days of meals.
export function getRecentFoods(meals: Meal[], n = 5): RecentFood[] {
  const agg = new Map<
    string,
    { name: string; count: number; grams: number } & Macros & { lastUsdaDescription: string }
  >()
  for (const m of meals) {
    for (const f of m.foods || []) {
      if (!f.name || !f.macros) continue
      const entry =
        agg.get(f.name) ||
        ({ name: f.name, count: 0, grams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0, lastUsdaDescription: '' } as any)
      entry.count++
      entry.grams += f.grams || 0
      entry.kcal += f.macros.kcal || 0
      entry.protein += f.macros.protein || 0
      entry.carbs += f.macros.carbs || 0
      entry.fat += f.macros.fat || 0
      if (f.usdaDescription) entry.lastUsdaDescription = f.usdaDescription
      agg.set(f.name, entry)
    }
  }
  return Array.from(agg.values())
    .filter((e) => e.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
    .map((e) => ({
      name: e.name,
      grams: Math.round(e.grams / e.count),
      macros: {
        kcal: e.kcal / e.count,
        protein: e.protein / e.count,
        carbs: e.carbs / e.count,
        fat: e.fat / e.count,
      },
      eatCount: e.count,
      usdaDescription: e.lastUsdaDescription,
    }))
}

// Consecutive days ending at today (or yesterday) with >=1 meal. Today being
// empty doesn't break the streak — only an empty yesterday does.
export function getStreakDays(
  todayKey: string,
  hasMealsForDay: (dayKey: string) => boolean
): number {
  let streak = 0
  let checkKey = todayKey
  let isToday = true
  for (let i = 0; i < 365; i++) {
    if (hasMealsForDay(checkKey)) {
      streak++
      isToday = false
    } else if (isToday) {
      isToday = false
    } else {
      break
    }
    checkKey = previousDayKey(checkKey)
  }
  return streak
}

export interface WeekSummary {
  daysLogged: number
  avgKcal: number
  avgProtein: number
  kcalTargetHits: number
  proteinTargetHits: number
}

// kcal hit = within +-10% of target; protein hit = at/above target (a floor).
// targetFor, when provided, returns each day's own target (gym vs rest), so a
// day is scored against the target the user actually marked it for. Without it,
// the single base goals target is used for every day (legacy behaviour).
export function getWeekSummary(
  meals: Meal[],
  goals: NutritionGoals,
  targetFor?: (dayKey: string) => { kcal: number; protein: number }
): WeekSummary {
  const byDay = new Map<string, { kcal: number; protein: number }>()
  for (const m of meals) {
    const entry = byDay.get(m.dayKey) || { kcal: 0, protein: 0 }
    entry.kcal += (m.totals && m.totals.kcal) || 0
    entry.protein += (m.totals && m.totals.protein) || 0
    byDay.set(m.dayKey, entry)
  }
  const entries = Array.from(byDay.entries())
  const daysLogged = entries.length
  const totalKcal = entries.reduce((s, [, d]) => s + d.kcal, 0)
  const totalProtein = entries.reduce((s, [, d]) => s + d.protein, 0)
  const targetForKey = (dayKey: string) =>
    targetFor ? targetFor(dayKey) : { kcal: goals.kcalTarget || 0, protein: goals.proteinTarget || 0 }
  return {
    daysLogged,
    avgKcal: daysLogged > 0 ? totalKcal / daysLogged : 0,
    avgProtein: daysLogged > 0 ? totalProtein / daysLogged : 0,
    kcalTargetHits: entries.filter(([k, d]) => {
      const t = targetForKey(k).kcal
      return t > 0 && d.kcal >= t * 0.9 && d.kcal <= t * 1.1
    }).length,
    proteinTargetHits: entries.filter(([k, d]) => {
      const t = targetForKey(k).protein
      return t > 0 && d.protein >= t
    }).length,
  }
}
