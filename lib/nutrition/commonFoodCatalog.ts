// Common-food catalog — the instant, typo-tolerant funnel that sits in front of
// the live USDA search in the Fuel · Macros picker.
//
// Why this exists: typing a plain whole food ("banana", or the misspelling
// "bana") used to hit the USDA API directly and surface branded junk (Sun-Maid
// banana chips, V8 juice) while the real banana ranked nowhere — and every
// 0-result keystroke wiped the visible cards. This catalog answers the common
// case locally and synchronously: ~400 of the foods people actually eat in a
// day, matched fuzzily, rendered instantly with no network round-trip and no
// flicker. The live USDA search still runs underneath for everything else.
//
// Trust: per docs/NUTRITION-PRINCIPLES.md the macro numbers are USDA-owned. The
// values here are curated reference per-100g values, internally macro-consistent
// and fully user-correctable (grams editor + the Advanced USDA lane). Follow-up:
// backfill real USDA fdcIds/numbers via a server-side pass (USDA_API_KEY lives in
// the deploy env, not locally).

import type { Macros, UsdaCandidate } from './types'
import { COMMON_CATALOG } from './commonFoodCatalog.data'

export interface CatalogFood {
  name: string
  category: string
  per100: Macros
  serving: { grams: number; label: string }
  aliases: string[]
}

/** A catalog match, shaped as a UsdaCandidate (so it flows straight into the
 *  existing pick → buildManualMeal path) plus the bits the picker UI needs. */
export interface CommonFoodCandidate extends UsdaCandidate {
  category: string
  /** true when the user's query was a misspelling/partial we corrected. */
  corrected: boolean
}

/** Stable synthetic, always-negative fdcId so catalog foods never collide with
 *  real USDA ids (which are positive). Deterministic from the name. */
function synthId(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return -((Math.abs(h) % 1_900_000_000) + 1)
}

export function normFood(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
}

// ── fuzzy scoring ───────────────────────────────────────────────────────────
function lev(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  let prev = new Array(n + 1)
  let cur = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    cur[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    const tmp = prev
    prev = cur
    cur = tmp
  }
  return prev[n]
}

/** Score a normalized query against one normalized candidate string. */
function scoreStr(q: string, cand: string): number {
  if (!q || !cand) return 0
  if (q === cand) return 120
  if (cand.startsWith(q)) return 100 - (cand.length - q.length) * 1.0 // "bana" → "banana"
  if (q.startsWith(cand)) return 92 - (q.length - cand.length) * 2 // "bananana" → "banana"
  for (const tok of cand.split(' ')) {
    if (q.length >= 3 && tok.startsWith(q)) return 86 // "drum" → "chicken drumstick"
  }
  if (q.length >= 4 && cand.includes(q)) return 78
  const d = lev(q, cand)
  const tol = Math.max(1, Math.round(Math.max(q.length, cand.length) * 0.34))
  if (d <= tol) return 74 - (d - 1) * 9 // "chiken" → "chicken"
  for (const tok of cand.split(' ')) {
    const dt = lev(q, tok)
    const t2 = Math.max(1, Math.round(Math.max(q.length, tok.length) * 0.34))
    if (dt <= t2) return 66 - (dt - 1) * 9
  }
  return 0
}

// The foods people log most — boosted so a plain query surfaces the canonical
// item first (e.g. "chicken" → Chicken Breast/Thigh ahead of Chicken Liver, and
// "egg" → Whole Egg ahead of Eggs Benedict). Normalized via normFood at load.
const STAPLES: Set<string> = new Set(
  [
    'Chicken Breast', 'Chicken Thigh', 'Chicken Wing', 'Chicken Drumstick',
    'Ground Beef (Regular)', 'Ground Beef (Lean)', 'Sirloin Steak', 'Ribeye Steak',
    'Salmon', 'Canned Tuna', 'Shrimp',
    'Whole Egg', 'Scrambled Eggs', 'Egg White', 'Boiled Eggs',
    'Whole Milk', '2% Milk', 'Greek Yogurt', 'Cheddar Cheese', 'Cottage Cheese', 'Butter',
    'White Rice (cooked)', 'Brown Rice (cooked)', 'Dry Oats', 'Oatmeal',
    'Pasta (cooked)', 'White Bread', 'Whole Wheat Bread', 'Bagel',
    'Banana', 'Apple', 'Orange', 'Strawberries', 'Blueberries', 'Grapes', 'Avocado',
    'Broccoli', 'Spinach', 'Carrot', 'Tomato', 'White Potato', 'Sweet Potato',
    'Black Beans', 'Chickpeas', 'Lentils', 'Almonds', 'Peanut Butter', 'Olive Oil',
    'Cheeseburger', 'Hamburger', 'French Fries', 'Pizza Slice',
    'Protein Shake', 'Protein Bar', 'Black Coffee', 'Orange Juice',
  ].map(normFood),
)

function scoreFood(q: string, f: CatalogFood): number {
  const nameScore = scoreStr(q, normFood(f.name))
  let aliasScore = 0
  for (const a of f.aliases) aliasScore = Math.max(aliasScore, scoreStr(q, normFood(a)))
  // Name matches outrank alias-only matches (so "chicken" ranks Chicken Breast
  // above a burrito whose alias happens to be "chicken burrito").
  let s = Math.max(nameScore, aliasScore * 0.9)
  if (s <= 0) return 0
  if (nameScore > 0) s += Math.max(0, 6 - f.name.length * 0.1) // canonical short-name nudge
  if (STAPLES.has(normFood(f.name))) s += 14 // popularity
  return s
}

function toCandidate(f: CatalogFood, q: string): CommonFoodCandidate {
  // "corrected" = the query has no clean prefix relationship with the display
  // NAME (a real misspelling like chiken→chicken, or a token/alias hit), as
  // opposed to a plain partial of the name (bana→banana). Note we judge against
  // the name only — misspellings live in `aliases`, so an alias match must still
  // count as corrected. Drives the subtle "closest matches" hint.
  const nameN = normFood(f.name)
  const clean = !q || nameN.startsWith(q) || q.startsWith(nameN)
  return {
    fdcId: synthId(f.name),
    description: f.name,
    displayName: f.name,
    serving: { grams: f.serving.grams, label: f.serving.label },
    per100: f.per100,
    category: f.category,
    corrected: !clean,
  }
}

/** Typo-tolerant local match. Returns instantly (no network). */
export function matchCommonFoods(
  query: string,
  opts: { limit?: number; threshold?: number } = {},
): CommonFoodCandidate[] {
  const q = normFood(query)
  if (q.length < 2) return []
  const limit = opts.limit ?? 8
  const threshold = opts.threshold ?? 58
  const scored: { f: CatalogFood; s: number }[] = []
  for (const f of COMMON_CATALOG) {
    const s = scoreFood(q, f)
    if (s >= threshold) scored.push({ f, s })
  }
  scored.sort((a, b) => b.s - a.s)
  return scored.slice(0, limit).map((x) => toCandidate(x.f, q))
}

// ── browse-by-type (empty-state) ─────────────────────────────────────────────
const CATEGORY_ORDER = [
  'Fruits', 'Vegetables', 'Poultry', 'Beef & lamb', 'Pork', 'Seafood',
  'Eggs & dairy', 'Grains, bread & pasta', 'Legumes, nuts, seeds & fats',
  'Fast food & restaurant', 'Snacks & sweets', 'Beverages',
  'Breakfast & prepared', 'Condiments, sauces & spreads',
]

export const CATALOG_CATEGORIES: string[] = (() => {
  const present = new Set(COMMON_CATALOG.map((f) => f.category))
  const ordered = CATEGORY_ORDER.filter((c) => present.has(c))
  for (const c of Array.from(present)) if (!ordered.includes(c)) ordered.push(c)
  return ordered
})()

export function browseCategory(category: string, limit = 14): CommonFoodCandidate[] {
  return COMMON_CATALOG.filter((f) => f.category === category)
    .slice(0, limit)
    .map((f) => toCandidate(f, ''))
}

// ── portion size presets ─────────────────────────────────────────────────────
export interface SizeOption {
  label: string
  grams: number
}

// Named S/M/L style presets for high-variance foods (matched by lowercased name).
const NAMED_SIZES: Record<string, SizeOption[]> = {
  'french fries': [{ label: 'Small', grams: 71 }, { label: 'Medium', grams: 117 }, { label: 'Large', grams: 154 }],
  'pizza slice': [{ label: '1 slice', grams: 107 }, { label: '2 slices', grams: 214 }, { label: '3 slices', grams: 321 }],
  cheeseburger: [{ label: 'Single', grams: 150 }, { label: 'Double', grams: 250 }, { label: 'Triple', grams: 350 }],
  hamburger: [{ label: 'Single', grams: 110 }, { label: 'Double', grams: 200 }, { label: 'Triple', grams: 290 }],
  'beef burger patty': [{ label: '⅓ lb', grams: 113 }, { label: '¼ lb', grams: 85 }, { label: '½ lb', grams: 170 }],
}

// Category-level fallbacks (e.g. drink sizes).
const CATEGORY_SIZES: Record<string, SizeOption[]> = {
  Beverages: [{ label: 'Small 8oz', grams: 240 }, { label: 'Medium 12oz', grams: 355 }, { label: 'Large 16oz', grams: 470 }],
}

/** Quick portion chips for a picked food. The grams field stays editable. */
export function sizeOptionsFor(c: { displayName?: string; category?: string; serving: { grams: number; label: string } }): SizeOption[] {
  const key = (c.displayName || '').toLowerCase().trim()
  if (NAMED_SIZES[key]) return NAMED_SIZES[key]
  if (c.category && CATEGORY_SIZES[c.category]) return CATEGORY_SIZES[c.category]
  // generic: half / one serving / double, anchored to the food's serving size
  const g = c.serving.grams || 100
  const half = Math.max(1, Math.round(g * 0.5))
  return [
    { label: 'Half', grams: half },
    { label: c.serving.label || '1 serving', grams: g },
    { label: 'Double', grams: g * 2 },
  ]
}
