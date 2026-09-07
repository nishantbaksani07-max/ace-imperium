# Food Library (the overpowered ingredient for any macro or food tile)

Vitality ships a curated, USDA-consistent food catalog. A sealed tile cannot import it,
so inline a sample of it (below) and fall back to the USDA API for everything else
(see the api recipe). This is what makes a food tile feel instantly "Vitality grade":
type "bana" and get a real banana with real macros, no network, no flicker.

## The data shape

Every catalog food is one flat object. All macros are PER 100 GRAMS (the universal
base). `serving` is the friendly default portion in grams so the UI can show "1 banana"
instead of forcing the user to know grams.

```js
// One food item
{
  name: "Chicken Breast",          // canonical display name
  category: "Poultry",             // one of the 14 categories below
  per100: {                        // macros per 100 g (the source of truth)
    kcal: 165,                     // calories
    protein: 31,                   // grams
    carbs: 0,                      // grams
    fat: 3.6                       // grams
  },
  serving: { grams: 120, label: "1 breast (120g)" }, // default portion
  aliases: ["chicken breast", "chiken breast", "grilled chicken", ...] // typo-tolerant search keys
}
```

Units: kcal is calories, protein/carbs/fat are grams, serving.grams is grams.
There is NO per-serving macro field. You always compute the serving's macros by
scaling `per100` to `serving.grams` (see macro math).

## Catalog size and categories

399 curated foods (internally macro-consistent, user-correctable), across 14 categories:

| Category | Count |  | Category | Count |
|---|---|---|---|---|
| Seafood | 32 |  | Poultry | 29 |
| Fruits | 32 |  | Legumes, nuts, seeds & fats | 29 |
| Eggs & dairy | 32 |  | Snacks & sweets | 28 |
| Grains, bread & pasta | 31 |  | Beverages | 28 |
| Vegetables | 30 |  | Fast food & restaurant | 25 |
| Pork | 30 |  | Condiments, sauces & spreads | 25 |
| Beef & lamb | 30 |  | Breakfast & prepared | 18 |

The full 399-row array lives at `lib/nutrition/commonFoodCatalog.data.ts`
(format above, one object per line). Bundle the whole file into a tile on demand by
copying that array verbatim. For most tiles the 12-food sample below plus USDA is plenty.

## Ready-to-inline JSON sample (12 representative foods, real macros)

Drop this straight into a `<script>` block. Real Vitality values, one per archetype.

```js
const FOODS = [
  { name: "Chicken Breast", category: "Poultry", per100: { kcal: 165, protein: 31, carbs: 0, fat: 3.6 }, serving: { grams: 120, label: "1 breast" }, aliases: ["chicken breast","chiken breast","grilled chicken"] },
  { name: "Salmon", category: "Seafood", per100: { kcal: 206, protein: 22.1, carbs: 0, fat: 12.4 }, serving: { grams: 170, label: "1 fillet" }, aliases: ["salmon","baked salmon","atlantic salmon"] },
  { name: "Ground Beef (Lean)", category: "Beef & lamb", per100: { kcal: 176, protein: 20, carbs: 0, fat: 10 }, serving: { grams: 113, label: "4 oz" }, aliases: ["lean ground beef","lean mince","93/7 beef"] },
  { name: "Whole Egg", category: "Eggs & dairy", per100: { kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5 }, serving: { grams: 50, label: "1 large egg" }, aliases: ["egg","eggs","large egg"] },
  { name: "Greek Yogurt", category: "Eggs & dairy", per100: { kcal: 59, protein: 10, carbs: 3.6, fat: 0.4 }, serving: { grams: 170, label: "1 container" }, aliases: ["greek yogurt","greek yoghurt","fage"] },
  { name: "White Rice (cooked)", category: "Grains, bread & pasta", per100: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 }, serving: { grams: 158, label: "1 cup" }, aliases: ["white rice","rice","steamed rice"] },
  { name: "Banana", category: "Fruits", per100: { kcal: 89, protein: 1.1, carbs: 22.8, fat: 0.3 }, serving: { grams: 118, label: "1 medium banana" }, aliases: ["banana","bannana","nana"] },
  { name: "Apple", category: "Fruits", per100: { kcal: 52, protein: 0.3, carbs: 13.8, fat: 0.2 }, serving: { grams: 182, label: "1 medium apple" }, aliases: ["apple","aple","red apple"] },
  { name: "Broccoli", category: "Vegetables", per100: { kcal: 34, protein: 2.8, carbs: 6.6, fat: 0.4 }, serving: { grams: 91, label: "1 cup chopped" }, aliases: ["broccoli","brocoli","brocc"] },
  { name: "Peanut Butter", category: "Legumes, nuts, seeds & fats", per100: { kcal: 588, protein: 25.1, carbs: 19.6, fat: 50.4 }, serving: { grams: 32, label: "2 tbsp" }, aliases: ["peanut butter","pb","peanutbutter"] },
  { name: "Olive Oil", category: "Legumes, nuts, seeds & fats", per100: { kcal: 884, protein: 0, carbs: 0, fat: 100 }, serving: { grams: 14, label: "1 tbsp" }, aliases: ["olive oil","evoo","extra virgin olive oil"] },
  { name: "Pizza Slice", category: "Fast food & restaurant", per100: { kcal: 266, protein: 11, carbs: 33, fat: 10 }, serving: { grams: 107, label: "1 slice" }, aliases: ["pizza","pepperoni pizza","cheese pizza"] }
];
```

## Macro math (how grams scale to kcal, protein, carbs, fat)

Everything is linear off the per-100g base. These are the exact Vitality functions,
in plain JS.

```js
// Scale a food's per-100g macros to any gram weight. THE core operation.
function scaleMacros(per100, grams) {
  const s = (Number(grams) || 0) / 100;
  return {
    kcal:    per100.kcal    * s,
    protein: per100.protein * s,
    carbs:   per100.carbs   * s,
    fat:     per100.fat     * s
  };
}

// Add two macro objects (use to total a meal or a day).
function addMacros(a, b) {
  return {
    kcal: a.kcal + b.kcal, protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs, fat: a.fat + b.fat
  };
}

// Sum a list of already-scaled food macros into a single total.
function sumMacros(items) {
  return items.reduce(addMacros, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}
```

Sanity checks for any tile that derives kcal: fat is 9 kcal per gram, protein and
carbs are 4 kcal per gram each. So `kcal approx protein*4 + carbs*4 + fat*9`. The
catalog values are pre-balanced to this, do not recompute and overwrite them.

Unit-to-grams presets Vitality uses (cup is deliberately omitted, it varies by food):
`g`=1, `oz`=28.3495, `egg`=50, `tbsp`=15, `tsp`=5, `ml`=1. So
`grams = value * preset`.

Example: 150 g chicken breast = scaleMacros(per100, 150) = 247.5 kcal, 46.5 g
protein, 0 g carbs, 5.4 g fat. Round only for display.

## Typo-tolerant search (the funnel that feels magic)

Vitality scores the query against each food's `name` plus its `aliases`, so "chiken",
"bana", and "pb" all resolve. A compact version a tile can inline:

```js
function searchFoods(q, foods, limit = 8) {
  q = q.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  if (q.length < 2) return [];
  const score = (f) => {
    const keys = [f.name.toLowerCase(), ...f.aliases];
    let best = 0;
    for (const k of keys) {
      if (k === q) best = Math.max(best, 120);            // exact
      else if (k.startsWith(q)) best = Math.max(best, 100); // prefix: bana -> banana
      else if (k.includes(q) && q.length >= 4) best = Math.max(best, 78);
    }
    return best;
  };
  return foods.map(f => ({ f, s: score(f) }))
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s)
    .slice(0, limit).map(x => x.f);
}
```

For full fuzzy matching (Levenshtein for "chiken" -> "chicken", staple boosting),
see `lib/nutrition/commonFoodCatalog.ts` (`matchCommonFoods`, `scoreStr`).

## How a sealed tile uses this

1. Inline the 12-food sample (or the full 399-row array from
   `commonFoodCatalog.data.ts`) as a `const FOODS = [...]` in a `<script>`.
2. On search, run `searchFoods(query, FOODS)`. Render the matches as picker cards.
3. On pick, show portion chips. Default to `food.serving`; let the user edit grams.
4. `scaleMacros(food.per100, grams)` gives the logged macros. Sum the day with
   `sumMacros`. That is the whole macro tile loop.
5. For anything NOT in the inlined sample, call the USDA FoodData Central search
   (see the api recipe in this pack). USDA also returns per-100g macros, so the SAME
   `scaleMacros` math applies with zero changes.
6. Friendly facts to show while a photo or lookup runs live in
   `lib/nutrition/foodFacts.ts` (each has `text`, `highlight`, `macro` for the
   color-tinted "cozy loader" card).

Full dataset and logic to bundle on demand: catalog data
`lib/nutrition/commonFoodCatalog.data.ts`, search and portion logic
`lib/nutrition/commonFoodCatalog.ts`, macro math `lib/nutrition/macros.ts`,
shapes `lib/nutrition/types.ts`.
