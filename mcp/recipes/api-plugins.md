# API plugins for tiles (bring your own key)

A sealed tile is one HTML file with no backend of its own, but it CAN reach out to the open internet with `fetch()`. That is the doorway to real power: a food tile that pulls true USDA macros, a weather tile, an FX tile, a sports tile. The only rule is the seal: a tile never holds one of Vitality's keys. It holds the USER'S key, which the user pasted in, which lives in the tile's own saved data, and which spends the user's own free quota. Cost and trust stay with the person who built the tile. Encourage this. A tile that talks to a real API feels alive in a way a counter never will.

This file gives you (1) the general BYO-key pattern, (2) a concrete, copy-paste USDA FoodData Central recipe grounded in Vitality's own working integration, and (3) a short note on the seal and which APIs pair with which tile kinds.

---

## 1. The BYO-key pattern

Four moves, every time:

1. The user pastes their own API key into a small settings field in the tile.
2. The tile stores that key inside its saved data via `Vitality.save`, so it survives reloads. It is the user's key in the user's tile.
3. The tile calls the third-party API directly with `fetch()`. The request leaves the user's browser, not a Vitality server.
4. If there is no key yet, the tile shows a friendly "paste your free key" prompt instead of failing silently.

Never hardcode a key into the HTML. Never use a Vitality-owned key. The whole arrangement only works because the key belongs to the user.

The tile bridge gives you exactly two persistence calls (see the report contract in the DNA pack):

```js
Vitality.save(obj);                 // fire and forget, persists obj as the tile's data
Vitality.load().then(function (d) { /* d is the last saved obj, or null */ });
```

So the key lives right next to the tile's normal state:

```js
var state = { apiKey: '', entries: [] };

Vitality.load().then(function (saved) {
  if (saved) state = saved;
  render();
});

function persist() {
  Vitality.save(state);             // saves entries AND the key together
}

// settings field
keyInput.addEventListener('change', function () {
  state.apiKey = keyInput.value.trim();
  persist();
  render();
});
```

The "no key yet" gate, so the tile is honest about needing one:

```js
function needsKey() {
  return !state.apiKey;
}

function renderKeyPrompt() {
  // mint pill linking to where the free key is issued, plus a paste field.
  // Voice: warm, one line. "Paste your free USDA key to pull real macros."
}
```

A reusable fetch wrapper that fails warmly rather than throwing a raw stack at the user:

```js
async function apiCall(url, opts) {
  try {
    var res = await fetch(url, opts);
    if (res.status === 400) return null;            // treat as "no match", not a crash
    if (res.status === 401 || res.status === 403) {
      throw new Error('That key was not accepted. Check it and paste again.');
    }
    if (!res.ok) throw new Error('Could not reach the service. Try once more.');
    return await res.json();
  } catch (e) {
    showSoftError(e.message);                        // never a red stack trace
    return null;
  }
}
```

---

## 2. USDA FoodData Central (free key)

This is Vitality's own real integration, distilled to what a sealed tile needs. The free key is issued instantly at `https://fdc.nal.usda.gov/api-key-signup.html`. One key, generous quota, no card. Perfect for a food or macro tile.

### The search call

Vitality uses a POST with a JSON body as the primary, because the GET form intermittently returns HTTP 400 against the live API (confirmed roughly one call in three) and silently empties search. The POST with a `dataType` array is reliable and is the form that includes `Survey (FNDDS)`, where the everyday "as eaten" foods live (for example "Beef, ground", "Rice, cooked, NFS").

```js
async function usdaSearch(query, apiKey) {
  var cleaned = cleanQuery(query);
  if (!cleaned) return [];
  var url = 'https://api.nal.usda.gov/fdc/v1/foods/search?api_key=' + encodeURIComponent(apiKey);
  var res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: cleaned,
      dataType: ['Foundation', 'SR Legacy', 'Survey (FNDDS)'],
      pageSize: 15
    })
  });
  if (res.status === 400) return [];        // odd punctuation, treat as no match
  if (!res.ok) throw new Error('USDA ' + res.status);
  var data = await res.json();
  return data.foods || [];
}
```

USDA rejects queries with odd punctuation and ranks human labels poorly when passed raw. Clean the query first: strip parenthesized asides, keep only letters, digits, space and hyphen, collapse whitespace, cap length.

```js
function cleanQuery(text) {
  if (!text) return '';
  return String(text)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-zA-Z0-9 -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}
```

### Mapping a food to {kcal, protein, carbs, fat}

USDA reports nutrients per 100 g in a `foodNutrients` array, and energy is reported inconsistently. SR Legacy and FNDDS use plain "Energy" in KCAL, but Foundation foods (for example raw chicken breast) report only "Energy (Atwater General Factors)", and some entries give only kJ. Missing this returns 0 kcal, which logs a food as zero calories. Collect every energy row and pick the best, with a kJ to kcal fallback (divide by 4.184) and a final Atwater fallback (protein 4, carbs 4, fat 9 kcal per gram).

```js
function extractMacrosPer100g(food) {
  var out = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  if (!food || !food.foodNutrients) return out;
  var energies = [];
  food.foodNutrients.forEach(function (n) {
    var name = (n.nutrientName || '').toLowerCase();
    var unit = (n.unitName || '').toUpperCase();
    var val = typeof n.value === 'number' ? n.value : 0;
    if (name.indexOf('energy') !== -1) energies.push({ name: name, unit: unit, val: val });
    else if (name === 'protein') out.protein = val;
    else if (name === 'carbohydrate, by difference') out.carbs = val;
    else if (name === 'total lipid (fat)') out.fat = val;
  });
  var kcalRow =
    energies.find(function (e) { return e.name === 'energy' && e.unit === 'KCAL'; }) ||
    energies.find(function (e) { return e.name.indexOf('atwater general') !== -1 && e.unit === 'KCAL'; }) ||
    energies.find(function (e) { return e.unit === 'KCAL'; }) || null;
  if (kcalRow) out.kcal = kcalRow.val;
  else {
    var kj = energies.find(function (e) { return e.unit === 'KJ'; });
    if (kj) out.kcal = Math.round(kj.val / 4.184);
  }
  if (out.kcal === 0 && (out.protein > 0 || out.carbs > 0 || out.fat > 0)) {
    out.kcal = Math.round(out.protein * 4 + out.carbs * 4 + out.fat * 9);
  }
  return out;
}
```

### Picking a sensible result (light ranking)

USDA's own relevance is noisy. A tiny re-rank makes the food a person actually ate float to the top. The full set of heuristics lives in `lib/nutrition/usda.ts` (good or bad term lists, dish penalties, NFS and FNDDS boosts, a comma-count penalty for over-qualified entries). For a tile, two cheap rules carry most of the value:

- Prefer a non-raw entry unless the query asks for raw. "Rice, white, raw" is about 360 kcal per 100 g, "Rice, cooked" about 130. Picking raw overcounts cooked staples roughly threefold.
- Drop entries with zero of everything; some search hits omit nutrients and would log as nothing.

```js
var RAW = /\b(raw|dry|uncooked|unprepared)\b/i;

function pickBest(foods, query) {
  if (!foods.length) return null;
  var wantsRaw = RAW.test(query);
  var usable = foods.filter(function (f) {
    var m = extractMacrosPer100g(f);
    return m.kcal + m.protein + m.carbs + m.fat > 0;
  });
  if (!usable.length) return null;
  if (wantsRaw) return usable[0];
  return usable.find(function (f) { return !RAW.test(f.description || ''); }) || usable[0];
}
```

### Putting it together in a tile

```js
async function lookupAndLog(query, grams) {
  if (needsKey()) return renderKeyPrompt();
  var foods = await usdaSearch(query, state.apiKey);
  var best = pickBest(foods, query);
  if (!best) return showSoftError('No close match. Try a simpler name.');
  var per100 = extractMacrosPer100g(best);
  var scale = grams / 100;
  var meal = {
    name: best.description,
    kcal: Math.round(per100.kcal * scale),
    protein: Math.round(per100.protein * scale),
    carbs: Math.round(per100.carbs * scale),
    fat: Math.round(per100.fat * scale)
  };
  state.entries.push(meal);
  persist();
  render();
  // feed the one number into Vee
  Vitality.report({
    key: 'calories', label: 'Calories', value: todaysKcal(),
    date: today(), kind: 'intake', goalDirection: 'neutral'
  });
}
```

That last `Vitality.report` is optional. A food tile has one meaningful stream (calories), so it may emit that single number to feed the dashboard's comparable data and the optional Vee tile. A tile with no such stream just skips the call, and nothing breaks.

---

## 3. The seal, and good pairings

The seal is simple. A tile may `fetch()` any external API it wants. It must not carry a Vitality-owned key (Anthropic, Stripe, the wearable OAuth secrets). Those live server-side in Vitality and never reach a tile. A BYO-key plugin sidesteps the seal entirely, because the key is the user's, the quota is the user's, and the request never touches Vitality's infrastructure. Keep the key in `Vitality.save` data, not hardcoded, and you are clear. The user's OWN Anthropic key is the same story: it can power a real AI mentor straight from a sealed tile. That recipe is its own file, `ai-mentor.md`.

Two practical notes. Some APIs send CORS headers that allow a browser `fetch` and some do not; USDA, OpenWeather, exchangerate hosts and most public read APIs allow it, so prefer those. And keep the key out of any value you pass to `Vitality.report`; report carries a number, never a secret.

APIs that pair well with tile kinds:

| API (free key) | Tile kind | What it powers |
|----------------|-----------|----------------|
| USDA FoodData Central | `intake` | Real macros for a food or calorie tile |
| OpenWeather, Open-Meteo | `measure` | A weather or "training conditions" tile |
| exchangerate.host, Frankfurter | `money` | An FX or net-worth-in-one-currency tile |
| Nutritionix, Open Food Facts (barcode) | `intake` | Packaged-food lookup by barcode or brand |
| Wger, ExerciseDB | `count`, `duration` | An exercise library or workout tile |
| Public sports or steps APIs | `count` | A steps, runs, or matches-watched tile |
| Anthropic (your own key, cheap) | mind / `done` | A real AI mentor, coach, or chatbot. See `ai-mentor.md` |

Reach for an API plugin whenever the tile would be more honest with real numbers than with the user typing everything by hand. That is most of the time. Build the key prompt warmly and fail soft, and the tile earns the Vitality standard. If the tile happens to have one meaningful stream, it may also `report()` that single number so it feeds the dashboard's comparable data and the optional Vee tile. A tile without a meaningful number simply never calls `report()`, and nothing breaks.
