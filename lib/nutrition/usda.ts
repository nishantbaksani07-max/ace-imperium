// USDA FoodData Central client + ranking heuristics.
//
// Ported verbatim (logic-wise) from the calories-standalone. The pure
// functions (clean/rank/filter/extract) are the "common-foods" IP that turns
// USDA's noisy relevance ranking into the entry a calorie-tracker actually
// ate. The fetch functions run SERVER-SIDE ONLY (the API key never reaches the
// browser) — they're called from app/api/nutrition/usda-search.

import type { Macros, UsdaMatch, UsdaCandidate } from './types'
import { canonBoost, canonSeedsFor, canonLabel, servingFor } from './commonFoods'

const USDA_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search'

// Minimal shape of a USDA food result we rely on.
interface UsdaNutrient {
  nutrientName?: string
  unitName?: string
  value?: number
}
export interface UsdaFood {
  fdcId?: number
  description?: string
  score?: number
  dataType?: string
  foodNutrients?: UsdaNutrient[]
}

// USDA's API rejects (400) queries with odd punctuation and gives poor results
// when human labels are passed raw. Strip parenthesized asides, keep only
// letters/digits/space/hyphen, collapse whitespace, cap length.
export function cleanUsdaQuery(text: string): string {
  if (!text) return ''
  return String(text)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-zA-Z0-9 -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

// Progressively-shorter query variants to fall back through. Last 2 words tend
// to be the noun phrase ("white rice"); last word is the bare noun ("rice").
export function progressiveUsdaQueries(text: string): string[] {
  const clean = cleanUsdaQuery(text)
  if (!clean) return []
  const words = clean.split(' ').filter((w) => w.length > 1)
  const variants = [clean]
  if (words.length > 2) variants.push(words.slice(-2).join(' '))
  if (words.length > 1) variants.push(words[words.length - 1])
  return Array.from(new Set(variants))
}

// Raw-food markers. We prefer the COOKED form when the query doesn't ask for
// raw — prevents "white rice → Rice, white, raw → 360 kcal/100g" overcounting
// cooked staples ~3x.
const RAW_MARKERS = /\b(raw|dry|uncooked|unprepared)\b/i

// Whole foods normally eaten RAW. For these the plain "<noun>, raw" form is the
// correct default — the cooked-staple preference (raw penalty + cooked boost) is
// wrong, and dressed-up variants ("Onion dip", "Banana, baked", "Spinach,
// creamed", "Carrots, glazed") must not win. usdaSearchBest (the vision path) has
// no canon override, so this lives in the ranker. Bounded to this list, so meat
// and dry staples (rice/oats/pasta) are completely unaffected.
const RAW_PRODUCE = new Set([
  'onion', 'banana', 'apple', 'cucumber', 'lettuce', 'spinach', 'broccoli', 'carrot',
  'tomato', 'pepper', 'strawberry', 'blueberry', 'raspberry', 'blackberry', 'grape',
  'celery', 'mushroom', 'kale', 'cabbage', 'zucchini', 'orange', 'peach', 'pear',
  'melon', 'watermelon', 'pineapple', 'mango', 'cauliflower', 'asparagus', 'radish',
  'beet', 'cherry', 'plum', 'apricot', 'kiwi', 'spinach', 'arugula',
])
// Loose singularize so "onions"/"peppers"/"strawberries"/"tomatoes" match canon.
function singularizeWord(w: string): string {
  if (/ies$/.test(w)) return w.replace(/ies$/, 'y')
  if (/(ches|shes|sses|oes)$/.test(w)) return w.replace(/es$/, '')
  if (/s$/.test(w) && !/ss$/.test(w)) return w.replace(/s$/, '')
  return w
}

// Cooking / prep / state adjectives that the vision parser routinely puts in
// front of the real food ("ground beef", "smoked salmon", "canned tuna",
// "grilled chicken"). They are NOT the head noun, so the lead-match ranking
// bonus must skip them — otherwise a dish/spread/salad that leads with the
// adjective ("Ground beef, fast food", "Smoked salmon spread", "Canned tuna
// salad") wins over the plain food and inflates calories. Bounded to prep words,
// so genuine food-first compounds ("peanut butter", "chicken breast") are
// untouched.
const LEADING_MODIFIERS = new Set([
  'ground', 'smoked', 'canned', 'grilled', 'fried', 'baked', 'roasted', 'steamed',
  'boiled', 'poached', 'sauteed', 'braised', 'stewed', 'pickled', 'marinated',
  'breaded', 'mashed', 'shredded', 'sliced', 'diced', 'chopped', 'minced',
  'grated', 'melted', 'toasted', 'dried', 'fresh', 'frozen', 'scrambled',
  'whole', 'lean', 'cured', 'salted', 'unsalted', 'sweetened', 'unsweetened',
  'creamed', 'glazed', 'candied', 'raw', 'cooked', 'jarred', 'bottled', 'mixed',
])

// The head noun of a query = its first word that isn't a leading prep/state
// modifier. "ground beef" → "beef", "smoked salmon" → "salmon"; "peanut butter"
// and single words are returned unchanged. Falls back to the first word if every
// word is a modifier.
function headNounOf(queryWords: string[]): string {
  for (const w of queryWords) {
    if (!LEADING_MODIFIERS.has(singularizeWord(w))) return w
  }
  return queryWords[0] || ''
}
// Prep/dish words. If a bare produce query didn't type one of these, a result
// carrying it is a dressed-up variant and should lose to the plain raw form.
const PRODUCE_DRESSING =
  /\b(dip|creamed|glazed|candied|breaded|gratin|scalloped|cooked|roasted|baked|grilled|fried|steamed|boiled|sauteed|pickled|dried|chips|juice|sauce|salad|casserole|pie|soup|jam|jelly|fritter|au gratin)\b/i

// True when the query names a raw-eaten whole food and the user did NOT type a
// prep/dish word. For these, the plain raw form is the answer — the ranker pins
// it and the picker must NOT swap it for a cooked sibling.
function isRawProduceQuery(query: string): boolean {
  const q = (query || '').toLowerCase()
  const words = q.split(/\s+/).filter((w) => w.length > 1)
  return (
    words.some((w) => RAW_PRODUCE.has(w) || RAW_PRODUCE.has(singularizeWord(w))) &&
    !PRODUCE_DRESSING.test(q)
  )
}

// Dish / composite indicators. When the user did NOT type the term, penalise
// multi-ingredient dishes so plain staples float to the top (e.g. "rice" → cooked
// rice beats rice pilaf, dirty rice, rice cakes, etc.).
const USDA_DISH_TERMS = [
  'pilaf', 'dirty', 'fried', 'patty', 'pancake', 'cake', 'crackers', 'pudding',
  'salad', 'burgundy', 'curry', 'noodles', 'chips', 'fries', 'casserole', 'pie',
]

// Re-rank toward foods people actually eat: cuts/preps (+), processed (-).
const USDA_GOOD_TERMS = [
  'breast', 'thigh', 'wing', 'drumstick', 'leg', 'loin', 'filet', 'fillet',
  'tenderloin', 'sirloin', 'ribeye', 'ground', 'ribs',
  'broiler', 'broilers', 'roaster', 'roasters', 'fryer', 'fryers',
  'meat only', 'whole', 'boneless', 'skinless', 'lean',
  'cooked', 'roasted', 'broiled', 'grilled', 'baked', 'steamed',
]
const USDA_BAD_TERMS = [
  'spread', 'paste', 'puree', 'powder', 'concentrate',
  'soup', 'stew', 'sauce', 'gravy',
  'frankfurter', 'sausage', 'hot dog',
  'meatless', 'vegetarian', 'imitation', 'substitute',
  'snack', 'snacks', 'lunchmeat', 'deli', 'luncheon',
  'fast food', 'fast foods', 'restaurant',
  'frozen meal', 'frozen dinner', 'tv dinner',
  'ready-to-eat', 'canned',
  'with sauce', 'with gravy',
  'cured', 'corned', 'imported', 'manufacturing', 'new zealand',
  'tallow', 'variety meats', 'mechanically separated',
  'baby food', 'infant', 'strained', 'junior',
]

// Obscure-qualifier regex for Basic-mode filtering.
// If the user typed one of these words, we opt them back in for that term.
const OBSCURE =
  /\b(imported|manufacturing|new zealand|tallow|variety meats|mechanically separated|baby food|infant|strained|junior|cured|corned)\b/i

// Noise parts to drop when cleaning up a USDA description for non-canon foods.
const USDA_NOISE = /grade [a-z]\b|^large$|^medium$|^small$|^nfs$|ns as to|all grades|^choice$|^select$|enhanced|boneless|skinless|meat only|meat and skin|separable.*|trimmed.*|with skin|skin (not )?eaten|bone-?in/i

/**
 * Lightly cleans a USDA description for display as a fallback friendly name
 * when no canon label applies. Drops noise qualifiers and trims to 2-3 parts.
 * Does NOT reorder parts — safe, readable output for the long tail of USDA foods.
 */
export function friendlyFoodName(description: string): string {
  if (!description) return ''
  const parts = description.split(',').map((p) => p.trim()).filter(Boolean)
  const cleaned = parts.filter((p) => !USDA_NOISE.test(p))
  // Deduplicate adjacent identical parts (case-insensitive).
  const deduped: string[] = []
  for (const p of cleaned) {
    if (deduped.length === 0 || p.toLowerCase() !== deduped[deduped.length - 1].toLowerCase()) {
      deduped.push(p)
    }
  }
  // Keep at most 3 parts; if nothing survived, fall back to the first original part.
  const result = deduped.slice(0, 3).join(', ')
  if (!result) return (parts[0] || description).replace(/^\w/, (c) => c.toUpperCase())
  return result.replace(/^\w/, (c) => c.toUpperCase())
}

// Basic-mode filter: drop zero-kcal records and obscure/industrial entries
// (unless the user typed the qualifying word).
//
// NOTE: Raw entries are NO LONGER dropped here. For fruits (banana, apple,
// etc.) raw IS the normal form. Instead, rankUsdaResults applies a mild
// raw-penalty for non-raw queries so cooked staples stay above raw — and
// canonBoost in rankForPicker overrides that penalty for canon raw-fruit forms.
export function filterBasicResults(foods: UsdaFood[], query: string): UsdaFood[] {
  if (!foods || foods.length === 0) return []
  const q = (query || '').toLowerCase()
  return foods.filter((f) => {
    const energy = (f.foodNutrients || []).find(
      (n) =>
        (n.nutrientName || '').toLowerCase() === 'energy' &&
        (n.unitName || '').toUpperCase() === 'KCAL'
    )
    if (energy && Number(energy.value) === 0) return false
    // Drop obscure/industrial qualifiers unless the user specifically typed at least
    // one of the matching obscure terms (e.g. "corned beef" opts "corned" back in).
    const descForMatch = f.description || ''
    const obscureRegexGlobal =
      /\b(imported|manufacturing|new zealand|tallow|variety meats|mechanically separated|baby food|infant|strained|junior|cured|corned)\b/gi
    const allObscureMatches: string[] = []
    let obscureM: RegExpExecArray | null
    while ((obscureM = obscureRegexGlobal.exec(descForMatch)) !== null) {
      allObscureMatches.push(obscureM[0].toLowerCase())
    }
    if (allObscureMatches.length > 0) {
      const userOptedIn = allObscureMatches.some((term) => q.includes(term))
      if (!userOptedIn) return false
    }
    return true
  })
}

export function rankUsdaResults(foods: UsdaFood[], query: string): UsdaFood[] {
  if (!foods || foods.length === 0) return []
  const q = (query || '').toLowerCase()
  const queryWords = q.split(/\s+/).filter((w) => w.length > 1)
  // The food noun to match on, not the leading adjective: "ground beef" → "beef".
  const firstQueryWord = headNounOf(queryWords)
  const headNoun = singularizeWord(firstQueryWord)
  const queryWantsRaw =
    RAW_MARKERS.test(q) || /\b(sushi|sashimi|tartare|carpaccio)\b/i.test(q)
  // A bare produce query: any query word names a raw-eaten whole food AND the user
  // did not type a prep/dish word (then they meant the cooked/dressed form).
  const isRawProduce = isRawProduceQuery(q)
  const scored = foods.map((f) => {
    const desc = (f.description || '').toLowerCase()
    let score = Number(f.score) || 0
    const descLead = desc.split(/[,\s]+/)[0]
    if (firstQueryWord && (descLead === firstQueryWord || singularizeWord(descLead) === headNoun)) score += 50
    for (const term of USDA_GOOD_TERMS) if (desc.includes(term)) score += 10
    for (const term of USDA_BAD_TERMS) {
      if (desc.includes(term) && !q.includes(term)) score -= 30
    }
    for (const term of USDA_DISH_TERMS) {
      if (desc.includes(term) && !q.includes(term)) score -= 20
    }
    // Mild raw penalty: when the query doesn't ask for raw, prefer cooked staples.
    // This prevents "Rice, white, raw" (360 kcal/100g) from beating "Rice, cooked"
    // (130 kcal/100g) which would cause ~3x overcounting. Skipped for raw produce,
    // where raw IS the expected eaten form.
    if (!queryWantsRaw && !isRawProduce && RAW_MARKERS.test(f.description || '')) score -= 15
    // Raw-produce correction: pin the plain raw form to the top and sink dressed-up
    // dish/prep variants, so "onion" → "Onions, raw" (not "Onion dip"), "banana" →
    // "Banana, raw" (not "Banana, baked"), "cucumber" → raw (not "Cucumber, cooked").
    if (isRawProduce) {
      if (RAW_MARKERS.test(f.description || '')) score += 45
      if (PRODUCE_DRESSING.test(f.description || '')) score -= 40
    }
    // Ingredient-form boost: "Beef, ground" / "Beef, NFS" — starts with query word + comma.
    if (firstQueryWord && desc.startsWith(firstQueryWord + ',')) score += 30
    // NFS boost: "not further specified" is the ideal generic default.
    if (/\bnfs\b/i.test(f.description || '') || /not further specified/i.test(f.description || ''))
      score += 15
    // FNDDS boost: "as eaten" everyday database is more representative of real foods.
    if (f.dataType === 'Survey (FNDDS)') score += 8
    // Over-qualified penalty: each extra comma beyond the first reduces score.
    const commaCount = (f.description || '').split(',').length - 1
    score -= 6 * Math.max(0, commaCount - 1)
    return { food: f, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.map((r) => r.food)
}

// Ranking for the manual picker UI: same as rankUsdaResults but adds
// canonBoost so plain whole-food basics (banana, chicken breast, etc.) are
// pinned to the top. Used by usdaSearchMany; usdaSearchBest (vision pipeline)
// keeps the plain heuristic ranking — do NOT change that.
export function rankForPicker(foods: UsdaFood[], query: string): UsdaFood[] {
  if (!foods || foods.length === 0) return []
  const baseRanked = rankUsdaResults(foods, query)
  // Apply canon boosts additively on top of the heuristic scores. We re-score
  // using the already-sorted array (which preserves relative order within a
  // canon tier) and then do a final stable sort.
  const withBoost = baseRanked.map((f, idx) => ({
    food: f,
    // Use a large decreasing base so the existing rankUsdaResults order is
    // preserved within each canon tier. idx subtracted so identical-boost
    // foods keep their prior relative ordering.
    finalScore: canonBoost(f.description || '', query) * 10000 - idx,
  }))
  withBoost.sort((a, b) => b.finalScore - a.finalScore)
  return withBoost.map((r) => r.food)
}

// Head noun of a USDA description — its leading food-name word ("Peppers, bell,
// raw" → "peppers", "Rice, white, raw" → "rice"). USDA descriptions lead with the
// food name, so two foods sharing this are the same food family.
function usdaLeadNoun(description: string): string {
  return (description || '').toLowerCase().split(/[,\s]+/).filter((w) => w.length > 1)[0] || ''
}

// Pick the entry a tracker actually ate. rankUsdaResults already floats the
// correct food family to the top, so selection must STAY in that family and only
// choose the right VARIANT within it. Preferring a non-raw (cooked) form is only
// correct for the SAME food — e.g. "Rice, …, raw" → "Rice, …, cooked" to avoid
// counting dry-grain density. It must NEVER jump families: the old "first non-raw
// anywhere" rule turned "Peppers, bell, …, raw" (all skipped) into the rank-#5
// "TACO BELL, Nachos" (350 kcal/100g → 130 g = 455 kcal). Produce/meat whose
// normal form is raw, with no same-food cooked sibling, keeps its raw rank winner.
export function pickBestUsdaFood(foods: UsdaFood[], originalQuery: string): UsdaFood | null {
  if (!foods || foods.length === 0) return null
  const top = foods[0]
  const queryWantsRaw =
    RAW_MARKERS.test(originalQuery || '') ||
    /\b(sushi|tartare|sashimi|carpaccio)\b/i.test(originalQuery || '')
  if (queryWantsRaw) return top
  // For raw produce the ranker already pinned the plain raw form at #1 — do NOT
  // swap it for a cooked sibling (that turned "Banana, raw" → "Banana, baked").
  // The cooked-swap is only for dry staples (rice/oats) where raw = dense/dry.
  if (isRawProduceQuery(originalQuery)) return top
  if (RAW_MARKERS.test(top.description || '')) {
    const noun = usdaLeadNoun(top.description || '')
    const cookedSameFood = noun
      ? foods.find((f) => !RAW_MARKERS.test(f.description || '') && usdaLeadNoun(f.description || '') === noun)
      : undefined
    if (cookedSameFood) return cookedSameFood
  }
  return top
}

// Per-100g macros from a USDA food's foodNutrients array.
export function extractMacrosPer100g(usdaFood: UsdaFood | null): Macros {
  const out: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  if (!usdaFood || !usdaFood.foodNutrients) return out
  // Energy is reported inconsistently: SR Legacy / FNDDS use plain "Energy" in
  // KCAL, but Foundation foods (e.g. raw chicken breast) report ONLY
  // "Energy (Atwater General Factors)" / "(Atwater Specific Factors)", and some
  // entries give only kJ. Missing this returned 0 kcal — foods logged as zero
  // calories. Collect all energy rows and pick the best.
  const energies: { name: string; unit: string; val: number }[] = []
  for (const n of usdaFood.foodNutrients) {
    const name = (n.nutrientName || '').toLowerCase()
    const unit = (n.unitName || '').toUpperCase()
    const val = typeof n.value === 'number' ? n.value : 0
    if (name.includes('energy')) energies.push({ name, unit, val })
    else if (name === 'protein') out.protein = val
    else if (name === 'carbohydrate, by difference') out.carbs = val
    else if (name === 'total lipid (fat)') out.fat = val
  }
  // Prefer plain "Energy" kcal, then Atwater General kcal, then any kcal,
  // then convert kJ to kcal (divide by 4.184) as a last resort.
  const kcalRow =
    energies.find((e) => e.name === 'energy' && e.unit === 'KCAL') ||
    energies.find((e) => e.name.includes('atwater general') && e.unit === 'KCAL') ||
    energies.find((e) => e.unit === 'KCAL') ||
    null
  if (kcalRow) out.kcal = kcalRow.val
  else {
    const kj = energies.find((e) => e.unit === 'KJ')
    if (kj) out.kcal = Math.round(kj.val / 4.184)
  }
  // Last-resort fallback: if no energy nutrient was found at all but macros are
  // present (e.g. "Oil, olive, extra virgin" in some USDA entries), compute kcal
  // via Atwater factors (protein 4 kcal/g, carbs 4 kcal/g, fat 9 kcal/g).
  if (out.kcal === 0 && (out.protein > 0 || out.carbs > 0 || out.fat > 0)) {
    out.kcal = Math.round(out.protein * 4 + out.carbs * 4 + out.fat * 9)
  }
  return out
}

// The physical ceiling for a food's energy density: pure fat is 9 kcal/g, so
// ~900 kcal per 100 g. The small margin (902) covers pure-fat USDA rows
// (tallow, ghee, butter oil). Anything above this isn't food — it's a bad USDA
// row (e.g. a kJ value sitting in a kcal-labelled field, ~4.2× too high) or a
// wildly-off match.
export const MAX_FOOD_KCAL_PER_100G = 902

// A numeric backstop for the matcher: true when a per-100g energy is physically
// impossible for food. Zero is NOT implausible — water, black coffee, and diet
// drinks are legitimately ~0 and handled upstream; this only catches the high end.
export function isImplausibleKcal(kcalPer100g: number): boolean {
  return kcalPer100g > MAX_FOOD_KCAL_PER_100G
}

// Pure selection step for the vision path: from already-ranked USDA foods, return
// the match a tracker should use. Normally that's the rank+family winner
// (pickBestUsdaFood). But if the winner's energy density is physically
// impossible, fall back to the best-ranked candidate with a sane density rather
// than overcount the meal — and if none qualifies, return null so the food
// becomes an unmatched item the user can resolve, never a poisoned total.
export function selectPlausibleMatch(ranked: UsdaFood[], cleaned: string): UsdaMatch | null {
  const best = pickBestUsdaFood(ranked, cleaned)
  if (!best) return null
  const per100 = extractMacrosPer100g(best)
  if (!isImplausibleKcal(per100.kcal)) {
    return { description: best.description || '', per100 }
  }
  for (const f of ranked) {
    const m = extractMacrosPer100g(f)
    if (m.kcal > 0 && !isImplausibleKcal(m.kcal)) {
      return { description: f.description || '', per100: m }
    }
  }
  return null
}

// ─── Server-side fetches (USDA key required) ────────────────────────────

// Raised by the route to classify the failure for the client message.
export class UsdaError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'UsdaError'
  }
}

// PRIMARY search: POST with a JSON body. This RELIABLY includes Survey (FNDDS),
// where the everyday foods live ("Beef, ground", "Rice, cooked, NFS", etc.).
// The GET form with repeated/encoded "Survey (FNDDS)" intermittently returns
// HTTP 400 (~1 in 3 calls, confirmed against the live API) — which silently
// emptied search in production. POST with a dataType array has no such flake.
// Returns null on 400 (treated as "no match"), throws on other non-OK.
async function fetchUsdaPost(
  cleaned: string,
  apiKey: string,
  pageSize: number
): Promise<UsdaFood[] | null> {
  const res = await fetch(`${USDA_SEARCH_URL}?api_key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: cleaned,
      dataType: ['Foundation', 'SR Legacy', 'Survey (FNDDS)'],
      pageSize,
    }),
  })
  if (res.status === 400) {
    console.warn(`[usda] POST 400 for "${cleaned}"`)
    return null
  }
  if (!res.ok) throw new UsdaError(res.status, `USDA API ${res.status}`)
  const data = await res.json()
  return data.foods || []
}

// FALLBACK search: GET with comma-joined 'Foundation,SR Legacy' (no FNDDS). This
// has always been reliable; it's the safety net if POST ever comes back empty.
// `withDataType=false` drops the filter entirely (last resort).
async function fetchUsdaGet(
  cleaned: string,
  apiKey: string,
  pageSize: number,
  withDataType: boolean
): Promise<UsdaFood[] | null> {
  const params = new URLSearchParams()
  params.set('api_key', apiKey)
  params.set('query', cleaned)
  if (withDataType) params.set('dataType', 'Foundation,SR Legacy')
  params.set('pageSize', String(pageSize))
  const res = await fetch(`${USDA_SEARCH_URL}?${params.toString()}`)
  if (res.status === 400) return null
  if (!res.ok) throw new UsdaError(res.status, `USDA API ${res.status}`)
  const data = await res.json()
  return data.foods || []
}

// Resilient search: POST (reliable FNDDS) first, then progressively looser GET
// fallbacks so a valid query never returns empty just because one path failed.
// Warnings surface a failing primary in production logs.
async function rawUsdaSearch(
  query: string,
  apiKey: string,
  pageSize: number
): Promise<UsdaFood[] | null> {
  const cleaned = cleanUsdaQuery(query)
  if (!cleaned) return null

  const primary = await fetchUsdaPost(cleaned, apiKey, pageSize)
  if (primary && primary.length > 0) return primary

  console.warn(`[usda] POST primary returned ${primary ? 'empty' : 'null'} for "${cleaned}" — falling back to comma GET`)
  const comma = await fetchUsdaGet(cleaned, apiKey, pageSize, true)
  if (comma && comma.length > 0) return comma

  console.warn(`[usda] comma GET returned ${comma ? 'empty' : 'null'} for "${cleaned}" — falling back to no dataType`)
  return fetchUsdaGet(cleaned, apiKey, pageSize, false)
}

// Single best match for a hint → per-100g macros + description, or null.
export async function usdaSearchBest(
  query: string,
  apiKey: string
): Promise<UsdaMatch | null> {
  const cleaned = cleanUsdaQuery(query)
  if (!cleaned) return null
  const foods = await rawUsdaSearch(cleaned, apiKey, 15)
  if (!foods) return null
  const ranked = rankUsdaResults(foods, cleaned)
  return selectPlausibleMatch(ranked, cleaned)
}

// Deduplicate an array of UsdaCandidate by displayName (case-insensitive),
// keeping the first (highest-ranked) occurrence of each label.
// Exported so it can be unit-tested in isolation.
export function dedupeByDisplayName(cands: UsdaCandidate[]): UsdaCandidate[] {
  const seen = new Set<string>()
  return cands.filter((c) => {
    const key = c.displayName.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Up to `max` ranked candidates for the manual-picker UI.
// Uses rankForPicker (= heuristic ranking + canon boost) so plain whole-food
// basics appear first. usdaSearchBest (vision pipeline) is unchanged.
export async function usdaSearchMany(
  query: string,
  apiKey: string,
  max = 5,
  mode: 'basic' | 'advanced' = 'basic'
): Promise<UsdaCandidate[]> {
  const cleaned = cleanUsdaQuery(query)
  if (!cleaned) return []
  let foods = await rawUsdaSearch(cleaned, apiKey, 50)
  const seeds = canonSeedsFor(cleaned)
  if (seeds.length > 0) {
    const seedResults = await Promise.all(seeds.map((s) => rawUsdaSearch(s, apiKey, 12).catch(() => null)))
    const pool = foods ? [...foods] : []
    const seen = new Set(pool.map((f) => f.fdcId))
    for (const sr of seedResults) {
      for (const f of sr || []) {
        if (f.fdcId && !seen.has(f.fdcId)) { pool.push(f); seen.add(f.fdcId) }
      }
    }
    foods = pool
  }
  if (!foods || foods.length === 0) return []
  const ranked = rankForPicker(foods, cleaned)
  const filtered = mode === 'advanced' ? ranked : filterBasicResults(ranked, cleaned)
  let cands = filtered.map((f) => {
    const desc = f.description || ''
    return {
      fdcId: f.fdcId || 0,
      description: desc,
      displayName: canonLabel(desc, cleaned) ?? friendlyFoodName(desc),
      serving: servingFor(desc, cleaned),
      per100: extractMacrosPer100g(f),
    }
  })
  // Drop entries with no usable macros at all — some USDA search results omit
  // nutrients entirely (e.g. certain Foundation oil entries), which would show
  // "0 kcal" and log as nothing. A food with zero of everything is noise.
  cands = cands.filter((c) => c.per100.kcal + c.per100.protein + c.per100.carbs + c.per100.fat > 0)
  if (mode === 'basic') {
    cands = dedupeByDisplayName(cands)
  }
  return cands.slice(0, max)
}
