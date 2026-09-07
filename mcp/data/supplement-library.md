# Vitality Supplement Library (for any supplement / stack tile)

Build a sealed HTML tile that knows Vitality's supplement domain: doses, timing
slots, and how to take each one. Everything below inlines into one file. No
libraries, no fetches. Copy the JSON sample, render a daily stack grouped by
time of day, and let the user check things off.

Full catalog lives at: app/app/fitness/supplements/supplements.ts (the
`SUPPLEMENT_DB` array, 106 supplements). Slot + condition metadata: the
`WINDOWS`, `CONDITIONS`, `DB_CONDITION_HINTS`, and `CONSISTENCY_IDS` exports in
the same file. The sample below is a representative ~12. Add more rows by
copying the same shape from that source.

## The data shape (per supplement)

```
{
  "id":     "creatine",            // stable slug, unique
  "name":   "Creatine monohydrate",
  "dose":   "5 g",                  // typical range as plain text
  "slot":   "anytime",             // one of: morning | midday | evening | bed | anytime
  "helps":  "Strength, power, short-term work capacity.",  // one sentence
  "bestTime": "Any time of day, every day. Skip the loading phase.",
  "note":   "Daily. Consistency matters more than timing.",
  "tags":   ["be-consistent"]      // see tag vocabulary below
}
```

Source row carries more (brand, priceUsdMonthly, baseScore, signalBoosts,
aliases). A tile only needs the fields above. Note the source uses `window`
for the slot key with value `lunch`; this pack renames it to `slot` / `midday`
for readability. Map `lunch -> midday` when copying rows.

## The timing-slot model

Five slots, shown top to bottom. Each has a label, a rough time, and a cutoff
hour past which an un-taken item reads as "missed" for the day.

```
morning  "Morning"      7-10 AM   cutoff 10:00
midday   "Midday"       12-2 PM   cutoff 14:00
evening  "Evening"      6-9 PM    cutoff 21:00
bed      "Before bed"   10 PM     no cutoff
anytime  "Anytime"      no window  no cutoff
```

Day boundary is 06:00 local, not midnight. A dose logged at 1 AM still counts
as the previous day's evening. So when computing "today's" check-offs: if the
current hour is before 6, use yesterday's date as the key.

## Tag vocabulary (how to take it)

Tags are "how to take it" hints. The three the prompt calls out:

- `pairs-with-caffeine` (source id `with-caffeine`): take alongside coffee
  (e.g. L-theanine for cleaner focus).
- `before-bed`: take 30 to 90 min before sleep (magnesium, glycine, melatonin).
- `be-consistent`: benefit builds from daily cumulative use, not one dose.
  Source flags this for creatine, vit D, omega-3, ashwagandha, adaptogens,
  nootropics, etc. Acute items (caffeine, melatonin, protein) intentionally
  skip it.

Full set from the source `CONDITIONS` list (use these strings as tags):
`with-food`, `with-meal`, `with-fat`, `after-meal`, `empty-stomach`,
`away-caffeine`, `away-minerals` (away from iron/calcium), `before-bed`,
`before-training`, `after-training`, `morning-light`, `plenty-water`,
`pairs-with-caffeine`, `be-consistent`.

## Ready-to-inline JSON sample (~12 supplements)

```html
<script id="supps-data" type="application/json">
[
  { "id": "creatine", "name": "Creatine monohydrate", "dose": "5 g", "slot": "anytime",
    "helps": "Strength, power, short-term work capacity.", "bestTime": "Any time, every day. Skip the loading phase.",
    "note": "Consistency matters more than timing.", "tags": ["be-consistent"] },
  { "id": "whey", "name": "Whey protein", "dose": "25-40 g", "slot": "anytime",
    "helps": "Fast protein for muscle repair and hitting daily targets.", "bestTime": "Post-workout or any low-protein meal.",
    "note": "Use to hit your daily protein number.", "tags": ["after-training"] },
  { "id": "l-citrulline", "name": "L-citrulline", "dose": "6-8 g", "slot": "morning",
    "helps": "Boosts nitric oxide for better pumps and endurance.", "bestTime": "30-45 min before training.",
    "note": "Empty stomach for absorption.", "tags": ["before-training", "empty-stomach"] },
  { "id": "caffeine", "name": "Caffeine", "dose": "100-200 mg", "slot": "morning",
    "helps": "Wakefulness and endurance. Half-life is about 5 h.", "bestTime": "90 min after waking.",
    "note": "Stack with L-theanine for cleaner focus.", "tags": ["before-training"] },
  { "id": "l-theanine", "name": "L-theanine", "dose": "100-200 mg", "slot": "morning",
    "helps": "Calm, focused alertness. Takes the edge off caffeine.", "bestTime": "With your morning coffee.",
    "note": "Stack with caffeine 2:1.", "tags": ["pairs-with-caffeine"] },
  { "id": "vit-d3", "name": "Vitamin D3", "dose": "2,000-5,000 IU", "slot": "midday",
    "helps": "Immune, bone, and mood support. Most people run low.", "bestTime": "With your fattiest meal.",
    "note": "Fat-soluble. Pair with your biggest meal.", "tags": ["be-consistent", "with-food", "with-fat"] },
  { "id": "vit-k2", "name": "Vitamin K2 (MK-7)", "dose": "100-200 mcg", "slot": "midday",
    "helps": "Routes calcium to bones, away from arteries. Pairs with D3.", "bestTime": "Same meal as your D3.",
    "note": "Take with D3.", "tags": ["be-consistent", "with-food", "with-fat"] },
  { "id": "omega-3", "name": "Omega-3 (fish oil)", "dose": "2-3 g EPA + DHA", "slot": "midday",
    "helps": "Anti-inflammatory, brain and heart support.", "bestTime": "With the meal that has the most fat.",
    "note": "Take with your fattiest meal.", "tags": ["be-consistent", "with-food", "with-fat"] },
  { "id": "mag-glycinate", "name": "Magnesium glycinate", "dose": "200-400 mg", "slot": "bed",
    "helps": "Relaxes muscles and nervous system. Better sleep quality.", "bestTime": "30-60 min before bed.",
    "note": "Sleep helper.", "tags": ["be-consistent", "before-bed"] },
  { "id": "glycine", "name": "Glycine", "dose": "3 g", "slot": "bed",
    "helps": "Lowers core body temperature for faster sleep onset.", "bestTime": "Right before bed.",
    "note": "Drops body temp slightly.", "tags": ["before-bed"] },
  { "id": "melatonin", "name": "Melatonin", "dose": "0.3-3 mg", "slot": "bed",
    "helps": "Shifts circadian rhythm. Good for jet lag.", "bestTime": "30-60 min before target bedtime.",
    "note": "Lowest effective dose. More is not better.", "tags": ["before-bed"] },
  { "id": "ashwagandha", "name": "Ashwagandha (KSM-66)", "dose": "300-600 mg", "slot": "evening",
    "helps": "Lowers cortisol and stress. Modest sleep benefit.", "bestTime": "With dinner.",
    "note": "KSM-66 is the most-studied form.", "tags": ["be-consistent"] }
]
</script>
```

## How a sealed tile renders the daily stack with check-off

Group items by slot in the fixed order, render a header per non-empty slot,
then one row per supplement with a tap-to-log circle. Persist check-offs to
localStorage keyed by the active date.

```html
<div id="stack"></div>
<script>
  const SLOTS = [
    { key: 'morning', label: 'Morning',     time: '7-10 AM', cutoff: 10 },
    { key: 'midday',  label: 'Midday',      time: '12-2 PM', cutoff: 14 },
    { key: 'evening', label: 'Evening',     time: '6-9 PM',  cutoff: 21 },
    { key: 'bed',     label: 'Before bed',  time: '10 PM',   cutoff: null },
    { key: 'anytime', label: 'Anytime',     time: '',        cutoff: null },
  ];
  const SUPPS = JSON.parse(document.getElementById('supps-data').textContent);

  // 6 AM day boundary: before 6 AM, today's key is yesterday.
  function activeDateKey() {
    const d = new Date();
    if (d.getHours() < 6) d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  const STORE = 'tile_supps_taken';
  function load() { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } }
  function save(v) { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch {} }

  function render() {
    const key = activeDateKey();
    const taken = load()[key] || {};
    const hour = new Date().getHours() + new Date().getMinutes() / 60;
    const root = document.getElementById('stack');
    root.innerHTML = '';
    for (const slot of SLOTS) {
      const items = SUPPS.filter(s => (s.slot || 'anytime') === slot.key);
      if (!items.length) continue;
      const pastCutoff = slot.cutoff !== null && hour > slot.cutoff;
      const head = document.createElement('div');
      head.className = 'slot-head';
      head.textContent = slot.label + (slot.time ? '  ' + slot.time : '');
      root.appendChild(head);
      for (const s of items) {
        const done = !!taken[s.id];
        const missed = pastCutoff && !done;
        const row = document.createElement('button');
        row.className = 'supp-row' + (done ? ' is-taken' : '') + (missed ? ' is-missed' : '');
        row.innerHTML =
          '<span class="dot">' + (done ? '<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.2 5 8.6 9.5 3.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '') + '</span>' +
          '<span class="body"><b>' + s.name + '</b><i>' + s.dose +
          (s.note ? '  ·  ' + s.note : '') + '</i></span>';
        row.onclick = () => {
          const all = load(); const day = all[key] || {};
          if (day[s.id]) delete day[s.id]; else day[s.id] = Date.now();
          all[key] = day; save(all); render();
        };
        root.appendChild(row);
      }
    }
  }
  render();
</script>
```

Vitality look: pure black background, mint accent (`#5fe3b3` ish) for the
taken-circle and the check, a softer amber for the missed state (never red),
Inter font. The taken circle is the primary tap target on the right of each
row in the real module; the version above keeps the whole row tappable for a
compact tile. Show a small "X of Y taken today" count at the top from
`Object.keys(taken).length` against `SUPPS.length`.
