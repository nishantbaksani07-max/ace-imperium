// Common-foods canon for the Vitality Macros manual-picker.
//
// When a user searches a plain whole food, the USDA candidate set contains the
// right answer but it often ranks too low (dishes, processed forms, obscure
// cuts float above it).  This module defines a curated list of the most-logged
// foods and their preferred USDA descriptions, so the plain form is pinned to
// the top of the picker.
//
// Usage: call canonBoost(description, query) → add the returned number to the
// food's heuristic score.  A boost of 1000 = pinned first; each subsequent
// prefer[] tier drops by 25.  Returns 0 when the food doesn't match any canon
// entry (no effect on ranking).

export interface CommonFood {
  /** Matches the user's lowercased query */
  triggers: RegExp
  /** Ordered best→worst canonical USDA description forms. First match wins the highest boost. */
  prefer: { pattern: RegExp; label: string; serving?: { grams: number; label: string } }[]
  /** Matches ONLY the bare food word (e.g. /^chickens?$/i) — no cuts/qualifiers. */
  bareQuery?: RegExp
  /** Extra queries to fetch + merge when bareQuery matches, so canonical cuts surface in results. */
  seeds?: string[]
  /** Default serving size for this food; prefer-level serving overrides this. */
  serving?: { grams: number; label: string }
}

export const COMMON_FOODS: CommonFood[] = [
  // ── Proteins ────────────────────────────────────────────────────────────
  {
    triggers: /\bchicken\b/,
    prefer: [
      { pattern: /chicken,?\s*breast/i, label: 'Chicken breast', serving: { grams: 120, label: '1 breast' } },
      { pattern: /chicken,?\s*thigh/i, label: 'Chicken thigh', serving: { grams: 80, label: '1 thigh' } },
      { pattern: /chicken,?\s*(drumstick|leg)/i, label: 'Chicken drumstick', serving: { grams: 75, label: '1 drumstick' } },
      { pattern: /chicken,?\s*ground/i, label: 'Ground chicken', serving: { grams: 100, label: '100g' } },
      { pattern: /^chicken,?\s*nfs/i, label: 'Chicken', serving: { grams: 100, label: '100g' } },
    ],
    bareQuery: /^chickens?$/i,
    seeds: ['chicken breast', 'chicken thigh'],
  },
  {
    triggers: /\bbeef\b/,
    prefer: [
      { pattern: /beef,?\s*ground/i, label: 'Ground beef' },
      { pattern: /ground\s*beef/i, label: 'Ground beef' },
      { pattern: /beef,?\s*steak/i, label: 'Beef steak' },
      { pattern: /^beef,?\s*nfs/i, label: 'Beef' },
      { pattern: /beef,?\s*(sirloin|round|loin|chuck|tenderloin)/i, label: 'Beef steak' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\bsteak\b/,
    prefer: [
      { pattern: /beef,?\s*steak/i, label: 'Beef steak' },
      { pattern: /\bsteak\b/i, label: 'Beef steak' },
    ],
    bareQuery: /^steaks?$/i,
    seeds: ['beef steak', 'sirloin steak'],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\bpork\b/,
    prefer: [
      { pattern: /pork,?\s*chop/i, label: 'Pork chop', serving: { grams: 110, label: '1 chop' } },
      { pattern: /pork,?\s*(loin|tenderloin)/i, label: 'Pork loin', serving: { grams: 100, label: '100g' } },
      { pattern: /pork,?\s*ground/i, label: 'Ground pork', serving: { grams: 100, label: '100g' } },
      { pattern: /^pork,?\s*nfs/i, label: 'Pork', serving: { grams: 100, label: '100g' } },
    ],
    bareQuery: /^porks?$/i,
    seeds: ['pork chop', 'pork loin'],
  },
  {
    triggers: /\bturkey\b/,
    prefer: [
      { pattern: /turkey,?\s*breast/i, label: 'Turkey breast' },
      { pattern: /turkey,?\s*ground/i, label: 'Ground turkey' },
      { pattern: /^turkey,?\s*nfs/i, label: 'Turkey' },
    ],
    bareQuery: /^turkeys?$/i,
    seeds: ['turkey breast', 'ground turkey'],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\bbacon\b/,
    prefer: [
      { pattern: /bacon,?\s*cooked/i, label: 'Bacon' },
      { pattern: /^bacon\b/i, label: 'Bacon' },
    ],
    serving: { grams: 8, label: '1 slice' },
  },
  {
    triggers: /\bsalmon\b/,
    prefer: [
      { pattern: /salmon,?\s*cooked/i, label: 'Salmon' },
      { pattern: /^salmon,?\s*nfs/i, label: 'Salmon' },
      { pattern: /salmon,?\s*raw/i, label: 'Salmon (raw)' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\btuna\b/,
    prefer: [
      { pattern: /tuna,?\s*nfs/i, label: 'Tuna' },
      { pattern: /tuna.*canned|canned.*tuna/i, label: 'Canned tuna' },
      { pattern: /tuna,?\s*cooked/i, label: 'Tuna' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\bshrimp\b/,
    prefer: [
      { pattern: /shrimp,?\s*cooked/i, label: 'Shrimp' },
      { pattern: /^shrimp,?\s*nfs/i, label: 'Shrimp' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\begg(s)?\b/,
    prefer: [
      { pattern: /egg\s*whole$/i, label: 'Whole egg', serving: { grams: 50, label: '1 egg' } },
      { pattern: /egg,?\s*whole,?\s*cooked/i, label: 'Cooked egg', serving: { grams: 50, label: '1 egg' } },
      { pattern: /scrambled/i, label: 'Scrambled egg', serving: { grams: 50, label: '1 egg' } },
      { pattern: /hard.?(boil|cook)/i, label: 'Boiled egg', serving: { grams: 50, label: '1 egg' } },
      { pattern: /egg\s*white/i, label: 'Egg whites', serving: { grams: 33, label: '1 egg white' } },
      { pattern: /egg,?\s*whole,?\s*raw/i, label: 'Whole egg (raw)', serving: { grams: 50, label: '1 egg' } },
    ],
    serving: { grams: 50, label: '1 egg' },
  },
  {
    triggers: /\btofu\b/,
    prefer: [
      { pattern: /tofu,?\s*(raw|nfs|firm)/i, label: 'Tofu' },
      { pattern: /^tofu\b/i, label: 'Tofu' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\bcod\b/,
    prefer: [
      { pattern: /cod,?\s*cooked/i, label: 'Cod' },
      { pattern: /^cod,?\s*nfs/i, label: 'Cod' },
      { pattern: /cod,?\s*raw/i, label: 'Cod (raw)' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\btilapia\b/,
    prefer: [
      { pattern: /tilapia,?\s*cooked/i, label: 'Tilapia' },
      { pattern: /^tilapia\b/i, label: 'Tilapia' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\blamb\b/,
    prefer: [
      { pattern: /lamb,?\s*(chop|loin|leg)/i, label: 'Lamb' },
      { pattern: /^lamb,?\s*nfs/i, label: 'Lamb' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\bbison\b/,
    prefer: [
      { pattern: /bison,?\s*ground/i, label: 'Ground bison' },
      { pattern: /^bison\b/i, label: 'Bison' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\bham\b/,
    prefer: [
      { pattern: /^ham,?\s*(nfs|cooked|baked|roasted)/i, label: 'Ham' },
      { pattern: /^ham\b/i, label: 'Ham' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\bsausage\b/,
    prefer: [
      { pattern: /sausage,?\s*cooked/i, label: 'Sausage' },
      { pattern: /^sausage\b/i, label: 'Sausage' },
    ],
    serving: { grams: 100, label: '100g' },
  },

  // ── Staples / Carbs ─────────────────────────────────────────────────────
  {
    triggers: /\brice\b/,
    prefer: [
      { pattern: /rice,?\s*white,?\s*cooked/i, label: 'White rice' },
      { pattern: /rice,?\s*cooked,?\s*nfs/i, label: 'White rice' },
      { pattern: /rice,?\s*brown,?\s*cooked/i, label: 'Brown rice' },
      { pattern: /rice,?\s*cooked/i, label: 'Rice' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\bpasta\b/,
    prefer: [
      { pattern: /pasta,?\s*cooked$/i, label: 'Pasta' },
      { pattern: /spaghetti,?\s*cooked/i, label: 'Pasta' },
      { pattern: /pasta,?\s*cooked/i, label: 'Pasta' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\bbread\b/,
    prefer: [
      { pattern: /bread,?\s*white/i, label: 'White bread' },
      { pattern: /bread,?\s*whole.?wheat/i, label: 'Whole wheat bread' },
      { pattern: /^bread,?\s*nfs/i, label: 'Bread' },
    ],
    serving: { grams: 30, label: '1 slice' },
  },
  {
    triggers: /\b(oat|oatmeal|oats)\b/,
    prefer: [
      { pattern: /oatmeal,?\s*nfs/i, label: 'Oatmeal' },
      { pattern: /oatmeal,?\s*cooked/i, label: 'Oatmeal' },
      { pattern: /^oats/i, label: 'Oatmeal' },
      { pattern: /oatmeal/i, label: 'Oatmeal' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /(?<!sweet )potato(es)?/i,
    prefer: [
      { pattern: /^potato,?\s*nfs/i, label: 'Potato' },
      { pattern: /potato,?\s*baked/i, label: 'Potato' },
      { pattern: /potatoes,?\s*boiled/i, label: 'Potato' },
      { pattern: /potato,?\s*mashed/i, label: 'Mashed potato' },
    ],
    serving: { grams: 170, label: '1 potato' },
  },
  {
    triggers: /\bsweet\s*potato/,
    prefer: [
      { pattern: /sweet\s*potato,?\s*(nfs|baked|cooked)/i, label: 'Sweet potato' },
    ],
    serving: { grams: 130, label: '1 potato' },
  },
  {
    triggers: /\bquinoa\b/,
    prefer: [
      { pattern: /quinoa,?\s*cooked/i, label: 'Quinoa' },
      { pattern: /^quinoa\b/i, label: 'Quinoa' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\bbean(s)?\b/,
    prefer: [
      { pattern: /black\s*beans?,?\s*cooked/i, label: 'Black beans' },
      { pattern: /kidney\s*beans?,?\s*cooked/i, label: 'Kidney beans' },
      { pattern: /beans?,?\s*cooked/i, label: 'Beans' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\blentil(s)?\b/,
    prefer: [
      { pattern: /lentils?,?\s*cooked/i, label: 'Lentils' },
      { pattern: /^lentils?\b/i, label: 'Lentils' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\btortilla\b/,
    prefer: [
      { pattern: /tortilla,?\s*flour/i, label: 'Flour tortilla' },
      { pattern: /tortilla,?\s*corn/i, label: 'Corn tortilla' },
      { pattern: /^tortilla\b/i, label: 'Tortilla' },
    ],
    serving: { grams: 100, label: '100g' },
  },

  // ── Dairy ───────────────────────────────────────────────────────────────
  {
    triggers: /\bmilk\b/,
    prefer: [
      { pattern: /^milk,?\s*nfs/i, label: 'Milk' },
      { pattern: /milk,?\s*whole/i, label: 'Whole milk' },
      { pattern: /milk,?\s*(reduced|low).?fat/i, label: 'Low-fat milk' },
      { pattern: /milk,?\s*(nonfat|skim)/i, label: 'Skim milk' },
    ],
    serving: { grams: 240, label: '1 cup' },
  },
  {
    triggers: /\byogurt\b/,
    prefer: [
      { pattern: /yogurt,?\s*greek,?\s*(plain|nfs)/i, label: 'Greek yogurt' },
      { pattern: /yogurt,?\s*greek/i, label: 'Greek yogurt' },
      { pattern: /^yogurt,?\s*(plain|nfs)/i, label: 'Yogurt' },
    ],
    serving: { grams: 170, label: '1 container' },
  },
  {
    triggers: /(?<!cottage )cheese/i,
    prefer: [
      { pattern: /cheese,?\s*cheddar/i, label: 'Cheddar cheese' },
      { pattern: /^cheese,?\s*nfs/i, label: 'Cheese' },
      { pattern: /cheese,?\s*mozzarella/i, label: 'Mozzarella' },
    ],
    serving: { grams: 28, label: '1 slice' },
  },
  {
    triggers: /\bcottage\s*cheese/,
    prefer: [
      { pattern: /cottage/i, label: 'Cottage cheese' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /(?<!peanut )(?<!almond )(?<!cashew )(?<!apple )\bbutter\b/i,
    prefer: [
      { pattern: /^butter,?\s*nfs/i, label: 'Butter' },
      { pattern: /^butter\b/i, label: 'Butter' },
    ],
    serving: { grams: 14, label: '1 tbsp' },
  },

  // ── Fruits (RAW is the normal / logged form) ─────────────────────────────
  {
    triggers: /\bbanana\b/,
    prefer: [
      { pattern: /^bananas?,?\s*raw$/i, label: 'Banana' },
      { pattern: /^bananas?,?\s*ripe[^,]*,?\s*raw/i, label: 'Banana' },
      { pattern: /^bananas?$/i, label: 'Banana' },
    ],
    serving: { grams: 118, label: '1 banana' },
  },
  {
    triggers: /\bapple\b/,
    prefer: [
      { pattern: /^apples?,?\s*raw/i, label: 'Apple' },
      { pattern: /^apples?$/i, label: 'Apple' },
    ],
    serving: { grams: 180, label: '1 apple' },
  },
  {
    triggers: /\borange\b/,
    prefer: [
      { pattern: /^oranges?,?\s*raw/i, label: 'Orange' },
      { pattern: /^oranges?$/i, label: 'Orange' },
    ],
    serving: { grams: 130, label: '1 orange' },
  },
  {
    triggers: /\bstrawberr/,
    prefer: [
      { pattern: /strawberries,?\s*raw/i, label: 'Strawberries' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\bblueberr/,
    prefer: [
      { pattern: /blueberries,?\s*raw/i, label: 'Blueberries' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\bgrape(s)?\b/,
    prefer: [
      { pattern: /^grapes,?\s*raw/i, label: 'Grapes' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\bmango\b/,
    prefer: [
      { pattern: /^mangos?,?\s*raw/i, label: 'Mango' },
      { pattern: /^mangoes?,?\s*raw/i, label: 'Mango' },
      { pattern: /^mango\b/i, label: 'Mango' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\bpineapple\b/,
    prefer: [
      { pattern: /^pineapple,?\s*raw/i, label: 'Pineapple' },
      { pattern: /^pineapple\b/i, label: 'Pineapple' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\bwatermelon\b/,
    prefer: [
      { pattern: /^watermelon,?\s*raw/i, label: 'Watermelon' },
      { pattern: /^watermelon\b/i, label: 'Watermelon' },
    ],
    serving: { grams: 100, label: '100g' },
  },

  // ── Vegetables ──────────────────────────────────────────────────────────
  {
    triggers: /\bbroccoli\b/,
    prefer: [
      { pattern: /broccoli,?\s*cooked/i, label: 'Broccoli' },
      { pattern: /broccoli,?\s*raw/i, label: 'Broccoli (raw)' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\bspinach\b/,
    prefer: [
      { pattern: /spinach,?\s*raw/i, label: 'Spinach' },
      { pattern: /spinach,?\s*cooked/i, label: 'Spinach' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\bavocado\b/,
    prefer: [
      { pattern: /^avocados?,?\s*raw/i, label: 'Avocado' },
    ],
    serving: { grams: 150, label: '1 avocado' },
  },
  {
    triggers: /\btomato\b/,
    prefer: [
      { pattern: /^tomatoes?,?\s*raw/i, label: 'Tomato' },
      { pattern: /^tomato,?\s*nfs/i, label: 'Tomato' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\bonion\b/,
    prefer: [
      { pattern: /^onions?,?\s*raw/i, label: 'Onion' },
      { pattern: /onion,?\s*cooked/i, label: 'Onion' },
      { pattern: /^onions?\b/i, label: 'Onion' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\bcucumber\b/,
    prefer: [
      { pattern: /^cucumbers?,?\s*raw/i, label: 'Cucumber' },
      { pattern: /^cucumber\b/i, label: 'Cucumber' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\bcarrot\b/,
    prefer: [
      { pattern: /^carrots?,?\s*raw/i, label: 'Carrot' },
      { pattern: /carrots?,?\s*cooked/i, label: 'Carrot' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\bzucchini\b/,
    prefer: [
      { pattern: /zucchini,?\s*cooked/i, label: 'Zucchini' },
      { pattern: /zucchini,?\s*raw/i, label: 'Zucchini (raw)' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\bkale\b/,
    prefer: [
      { pattern: /kale,?\s*raw/i, label: 'Kale' },
      { pattern: /kale,?\s*cooked/i, label: 'Kale' },
    ],
    serving: { grams: 100, label: '100g' },
  },
  {
    triggers: /\blettuce\b/,
    prefer: [
      { pattern: /lettuce,?\s*(raw|nfs)/i, label: 'Lettuce' },
      { pattern: /^lettuce\b/i, label: 'Lettuce' },
    ],
    serving: { grams: 100, label: '100g' },
  },

  // ── Fats / Nuts / Seeds ─────────────────────────────────────────────────
  {
    triggers: /\balmond(s)?\b/,
    prefer: [
      { pattern: /^almonds/i, label: 'Almonds' },
    ],
    serving: { grams: 28, label: '1 oz' },
  },
  {
    triggers: /\bpeanut\s*butter/,
    prefer: [
      { pattern: /peanut\s*butter/i, label: 'Peanut butter' },
    ],
    serving: { grams: 32, label: '2 tbsp' },
  },
  {
    triggers: /\bwalnut(s)?\b/,
    prefer: [
      { pattern: /^walnuts?/i, label: 'Walnuts' },
    ],
    serving: { grams: 28, label: '1 oz' },
  },
  {
    triggers: /\bcashew(s)?\b/,
    prefer: [
      { pattern: /^cashews?/i, label: 'Cashews' },
    ],
    serving: { grams: 28, label: '1 oz' },
  },
  {
    triggers: /\bolive\s*oil/,
    prefer: [
      { pattern: /olive\s*oil/i, label: 'Olive oil' },
    ],
    serving: { grams: 14, label: '1 tbsp' },
  },
  {
    triggers: /\bchia\s*seed/,
    prefer: [
      { pattern: /chia\s*seeds?/i, label: 'Chia seeds' },
    ],
    serving: { grams: 12, label: '1 tbsp' },
  },
]

const DEFAULT_SERVING = { grams: 100, label: '100g' }

/**
 * Returns the serving size for `description` when the user's `query`
 * matches a known common food. Resolution order: prefer-level serving override
 * > food-level serving > 100g default.
 */
export function servingFor(description: string, query: string): { grams: number; label: string } {
  const q = (query || '').toLowerCase()
  const desc = description || ''
  for (const food of COMMON_FOODS) {
    if (!food.triggers.test(q)) continue
    for (const pref of food.prefer) {
      if (pref.pattern.test(desc)) return pref.serving ?? food.serving ?? DEFAULT_SERVING
    }
    // Trigger matched but this is a non-canonical variant (e.g. "Banana chips"
    // for the banana trigger) — use 100g, NOT the food's unit serving.
    return DEFAULT_SERVING
  }
  return DEFAULT_SERVING
}

/**
 * Returns a positive score boost for `description` when the user's `query`
 * matches a known common food and the description is a preferred canonical form.
 *
 * Boost values: 100000 for the best preferred form, dropping by 2000 per tier.
 * The per-tier gap (2000) is deliberately MUCH larger than USDA's base-score
 * spread (~250) and our heuristic boosts/penalties (~±80), so the canon's
 * preferred ORDER dominates (e.g. chicken breast always ranks above thigh),
 * while standard ranking still orders foods WITHIN a tier (picks the cleanest
 * breast form). Returns 0 when no canon entry matches the query, or the
 * description didn't match any preferred pattern (so standard ranking applies).
 */
export function canonBoost(description: string, query: string): number {
  const q = (query || '').toLowerCase()
  const desc = description || ''
  if (!q || !desc) return 0

  for (const food of COMMON_FOODS) {
    if (!food.triggers.test(q)) continue
    // Labels the QUERY itself names (e.g. "chicken breast" -> {"chicken breast"}).
    // If the query specifies one or more cuts/variants, only boost foods whose
    // matched prefer-entry shares a label the query also matched.
    const queryLabels = new Set(
      food.prefer.filter((pf) => pf.pattern.test(q)).map((pf) => pf.label.toLowerCase())
    )
    for (let i = 0; i < food.prefer.length; i++) {
      if (food.prefer[i].pattern.test(desc)) {
        // If the query specified cut(s), only boost foods of that same cut.
        if (queryLabels.size > 0 && !queryLabels.has(food.prefer[i].label.toLowerCase())) continue
        return 100000 - i * 2000
      }
    }
    // Query matched a canon food entry but this description isn't a preferred form.
    return 0
  }
  return 0
}

/**
 * Returns the friendly display label for `description` when the user's `query`
 * matches a known common food and the description is a preferred canonical form.
 * Returns null when no canon prefer matches (use friendlyFoodName as fallback).
 */
export function canonLabel(description: string, query: string): string | null {
  const q = (query || '').toLowerCase()
  const desc = description || ''
  if (!q || !desc) return null
  for (const food of COMMON_FOODS) {
    if (!food.triggers.test(q)) continue
    for (const pref of food.prefer) {
      if (pref.pattern.test(desc)) return pref.label
    }
    return null
  }
  return null
}

/**
 * Returns seed queries to fetch + merge when the user typed just the bare food
 * word (e.g. "chicken"). USDA's relevance ranking for bare queries often omits
 * the canonical cuts (breast, thigh) entirely; seed fetches pull them in so
 * canonBoost can pin them to the top.
 *
 * Returns [] when the query contains qualifiers (e.g. "chicken wing") or the
 * food has no registered seeds.
 */
export function canonSeedsFor(query: string): string[] {
  const q = (query || '').trim().toLowerCase()
  for (const food of COMMON_FOODS) {
    if (food.bareQuery && food.seeds && food.bareQuery.test(q)) return food.seeds
  }
  return []
}
