# Fuel feature recipes (copy-paste, sealed HTML)

Vitality's Fuel module has the gold interaction patterns: a pre-scan quiz, a category-grid food picker, a meal breakdown card, and an analyzing overlay. Below are plain HTML/CSS/JS recipes distilled from the real React source so a tile can reuse the exact feel. No libraries, no React. Mint accent on pure black. Source for full sets: `app/app/fuel/macros/` (ScanContextSheet, FoodSearchPicker, Macros, AnalyzingOverlay, categoryMeta).

Shared tokens (drop in `:root`): `--mint:#6ee7b7; --mint-hi:#a7f3d0; --carb:#a9b2f5; --amber:#F59E0B; --bg:#000; --rule:rgba(255,255,255,.08); --ink-dim:rgba(255,255,255,.62); --ink-faint:rgba(255,255,255,.4); --spring:cubic-bezier(.34,1.56,.64,1); --ease:cubic-bezier(0.2, 0.8, 0.2, 1); --ease-premium:cubic-bezier(0.16, 1, 0.3, 1);`

---

## 1. Pre-scan quiz: segmented chips + labeled slider

Pattern (from ScanContextSheet "Tell me about this plate"): a free-text "what's on the plate" input, then a grid of selectable chips, then a slider that only appears once a chip is picked and seeds itself from that chip. Selecting a chip pops a mint check badge top-left. The slider is a labeled hidden-fat dial; the word above it changes as you drag.

### Segmented chips (2-up grid, springy select + check badge)

```html
<div class="opt-grid">
  <button class="opt" data-val="breakfast"><span class="opt-ic">[icon]</span><span class="opt-label">Breakfast</span><span class="opt-check">&#10003;</span></button>
  <button class="opt" data-val="lunch"><span class="opt-ic">[icon]</span><span class="opt-label">Lunch</span><span class="opt-check">&#10003;</span></button>
  <button class="opt" data-val="dinner"><span class="opt-ic">[icon]</span><span class="opt-label">Dinner</span><span class="opt-check">&#10003;</span></button>
  <button class="opt" data-val="snack"><span class="opt-ic">[icon]</span><span class="opt-label">Snack</span><span class="opt-check">&#10003;</span></button>
</div>
```

```css
.opt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin-bottom: 16px; }
.opt { position: relative; display: flex; align-items: center; gap: 9px; padding: 12px 13px;
  border: 1px solid var(--rule); border-radius: 14px; background: rgba(255,255,255,.022);
  color: var(--ink-dim); font-weight: 600; font-size: .86rem; cursor: pointer; text-align: left;
  transition: background .22s var(--ease), border-color .22s var(--ease), color .22s var(--ease), transform .18s var(--spring); }
.opt:active { transform: scale(.97); }
.opt.on { background: rgba(110,231,183,.12); border-color: var(--mint); color: var(--mint-hi);
  box-shadow: 0 0 0 1px rgba(110,231,183,.55), 0 0 16px rgba(110,231,183,.18); }
.opt-ic { display: flex; flex: none; color: var(--ink-faint); transition: color .2s var(--ease); }
.opt.on .opt-ic { color: var(--mint); }
.opt-label { flex: 1; min-width: 0; }
/* mint check badge that springs in on select */
.opt-check { position: absolute; top: -7px; left: -7px; width: 20px; height: 20px; border-radius: 999px;
  background: var(--mint); color: #04130c; display: flex; align-items: center; justify-content: center;
  font-size: 11px; box-shadow: 0 2px 8px rgba(0,0,0,.45);
  opacity: 0; transform: scale(0); transition: opacity .2s var(--ease), transform .32s var(--spring); pointer-events: none; }
.opt.on .opt-check { opacity: 1; transform: scale(1); }
```

```js
// single-select-with-toggle-off (real sheet lets you tap the active chip to clear it)
document.querySelectorAll('.opt-grid').forEach(grid => {
  grid.addEventListener('click', e => {
    const btn = e.target.closest('.opt'); if (!btn) return;
    const wasOn = btn.classList.contains('on');
    grid.querySelectorAll('.opt').forEach(b => b.classList.remove('on'));
    if (!wasOn) btn.classList.add('on');
    grid.dispatchEvent(new CustomEvent('pick', { detail: { val: wasOn ? null : btn.dataset.val } }));
  });
});
```

### Labeled hidden-fat slider (mint fill behind the thumb, word changes on drag)

Real model: 4 stops (`none`, `low`, `medium`, `high`) mapped to words ("almost none", "a little", "a fair bit", "a lot"). The `--fill` inline var paints mint up to the thumb.

```html
<div class="fat-row"><span>Hidden fat we add back</span><span class="fat-word" id="fatWord">a little</span></div>
<input type="range" min="0" max="3" step="1" value="1" class="fat-slider" id="fat" style="--fill:33%">
<p class="fat-note">Plain food? Drag it down.</p>
```

```css
.fat-row { display: flex; justify-content: space-between; align-items: baseline; font-family: monospace;
  font-size: .58rem; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-faint); margin: 10px 2px 8px; }
.fat-word { color: var(--mint-hi); font-weight: 500; }
.fat-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 8px; border-radius: 999px;
  background: linear-gradient(90deg, var(--mint), #34d399) no-repeat, rgba(255,255,255,.06);
  background-size: var(--fill, 50%) 100%; cursor: pointer; outline: none; }
.fat-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 22px; height: 22px;
  border-radius: 50%; background: var(--mint-hi); border: 3px solid #0a0f0c; box-shadow: 0 0 10px rgba(110,231,183,.5); cursor: grab; }
.fat-slider::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: var(--mint-hi);
  border: 3px solid #0a0f0c; box-shadow: 0 0 10px rgba(110,231,183,.5); cursor: grab; }
.fat-note { font-size: .7rem; color: var(--ink-faint); margin-top: 9px; padding-left: 2px; font-style: italic; }
```

```js
const FAT_WORDS = ['almost none', 'a little', 'a fair bit', 'a lot'];
const fat = document.getElementById('fat');
fat.addEventListener('input', () => {
  const i = Number(fat.value);
  fat.style.setProperty('--fill', (i / 3 * 100) + '%');
  document.getElementById('fatWord').textContent = FAT_WORDS[i];
});
```

Primary CTA is "Scan my plate" (sticky to viewport bottom so it is always reachable): `position: sticky; bottom: 0;` on its wrapper, mint-filled button.

---

## 2. Category-grid picker: icon tiles + Basic/Advanced toggle

Pattern (from FoodSearchPicker): a search input, a two-button segmented Basic/Advanced toggle, and (before any query) a grid of category tiles. Each tile is a colored inline-SVG glyph plus a short uppercase label; tapping one filters. The 14 real categories with their tints live in `categoryMeta.tsx`.

```html
<div class="search-wrap">
  <svg class="search-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
  <input class="search-input" placeholder="Search any food">
</div>
<div class="mode-toggle">
  <button class="mode-btn on" data-mode="basic">Basic</button>
  <button class="mode-btn" data-mode="advanced">Advanced</button>
</div>
<div class="browse-grid" id="grid"></div>
```

```css
.search-wrap { position: relative; display: flex; align-items: center; }
.search-ic { position: absolute; left: 14px; color: var(--ink-faint); }
.search-input { width: 100%; padding: 13px 14px 13px 40px; border: 1px solid var(--rule); border-radius: 14px;
  background: rgba(255,255,255,.03); color: #fff; font-size: 1rem; }
.search-input:focus { outline: none; border-color: var(--mint); }
.search-input::placeholder { color: var(--ink-faint); }
.mode-toggle { display: inline-flex; gap: 2px; padding: 3px; border-radius: 11px; background: rgba(255,255,255,.04); margin: 12px 0; }
.mode-btn { padding: 6px 16px; border: 0; border-radius: 8px; background: none; color: var(--ink-faint); font-weight: 600; font-size: .85rem; cursor: pointer; }
.mode-btn:hover { color: #fff; }
.mode-btn.on { background: rgba(110,231,183,.12); color: var(--mint-hi); }
/* tile grid: auto-fill, ~104px min, so it reflows on any width */
.browse-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 12px; }
.tile { display: flex; flex-direction: column; align-items: center; gap: 9px; padding: 14px 8px;
  border: 1px solid var(--rule); border-radius: 16px; background: rgba(255,255,255,.022); cursor: pointer;
  transition: border-color .2s var(--ease), background .2s var(--ease); }
.tile.on { border-color: var(--mint); background: rgba(110,231,183,.05); }
.tile-ico { width: 44px; height: 44px; border-radius: 13px; display: grid; place-items: center; }
.tile-lbl { font-family: monospace; font-size: .68rem; letter-spacing: .2em; text-transform: uppercase; color: var(--ink-dim); text-align: center; }
```

```js
// Each category = label + tint. The tint paints both the tile icon disc and result-row badges.
// (Full 14 in categoryMeta.tsx. Sample below; glyphs are inline SVG, fill:none stroke:currentColor.)
const CATEGORIES = [
  { short: 'Fruits',   color: '#e893b0' }, { short: 'Veggies',     color: '#8fd28a' },
  { short: 'Poultry',  color: '#e6bd72' }, { short: 'Seafood',     color: '#7fb8e8' },
  { short: 'Eggs & dairy', color: '#ecd285' }, { short: 'Grains',  color: '#d4b483' },
  { short: 'Nuts & beans', color: '#b6c47d' }, { short: 'Drinks',  color: '#84cbe0' },
];
const tint = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`; };
const grid = document.getElementById('grid');
grid.innerHTML = CATEGORIES.map(c => `
  <button class="tile" data-cat="${c.short}">
    <span class="tile-ico" style="color:${c.color};background:${tint(c.color,.15)}">[glyph svg]</span>
    <span class="tile-lbl">${c.short}</span>
  </button>`).join('');
grid.addEventListener('click', e => {
  const t = e.target.closest('.tile'); if (!t) return;
  const wasOn = t.classList.contains('on');
  grid.querySelectorAll('.tile').forEach(x => x.classList.remove('on'));
  if (!wasOn) t.classList.add('on'); // tap again to clear, then list that category's foods below
});
```

Result rows (after a search/pick) carry the same category badge: a colored square `<span>` using `color:tint(.x)`, `background:tint(.15)`, `border:tint(.3)`, then name, then a `42P · 18C · 9F · 1 cup` meta line, then a right-aligned bold kcal. Picking a row reveals a confirm strip with quick "serving size" chips and a Grams number input.

---

## 3. Meal breakdown card: stacked macro bar + per-item rows + expand/collapse

Pattern (from Macros MealCard): a collapsed header row (thumb, title, one slim stacked protein/carb/fat bar split by each macro's share of calories, kcal, chevron). Tapping toggles a drawer with per-food rows (`grams + kcal`) that stagger-rise in.

```html
<article class="meal-card">
  <button class="meal-head" aria-expanded="false">
    <span class="meal-title">Chicken bowl <small>+2 more</small></span>
    <span class="macro-stack"><i class="seg-p" style="width:38%"></i><i class="seg-c" style="width:44%"></i><i class="seg-f" style="width:18%"></i></span>
    <span class="meal-kcal"><b>620</b><i>kcal</i></span>
    <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
  </button>
  <div class="meal-detail">
    <div class="meal-detail-inner">
      <div class="macro-legend">
        <span><i class="dot dot-p"></i><b>42g</b> protein</span>
        <span><i class="dot dot-c"></i><b>68g</b> carbs</span>
        <span><i class="dot dot-f"></i><b>12g</b> fat</span>
      </div>
      <div class="food-row"><span>Grilled chicken</span><span class="food-meta">180g &middot; 297 kcal</span></div>
      <div class="food-row"><span>White rice</span><span class="food-meta">200g &middot; 260 kcal</span></div>
      <div class="food-row"><span>Avocado</span><span class="food-meta">40g &middot; 63 kcal</span></div>
    </div>
  </div>
</article>
```

```css
.meal-card { border: 1px solid var(--rule); border-radius: 16px; background: rgba(255,255,255,.02); overflow: hidden; margin-bottom: 10px; }
.meal-head { display: flex; align-items: center; gap: 14px; width: 100%; padding: 14px 16px; background: none; border: 0; color: #fff; cursor: pointer; text-align: left; }
.meal-title { flex: 1; min-width: 0; font-weight: 600; }
.meal-title small { color: var(--ink-faint); font-weight: 400; }
/* stacked bar: each macro's WIDTH = its share of meal kcal (P*4, C*4, F*9) */
.macro-stack { display: flex; gap: 2px; width: 140px; height: 8px; border-radius: 999px; overflow: hidden; background: rgba(255,255,255,.05); flex: none; }
.macro-stack i { display: block; height: 100%; animation: macroGrow .9s var(--ease) both; transform-origin: left; }
.seg-p { background: linear-gradient(90deg, var(--mint), #3fcf97); }
.seg-c { background: linear-gradient(90deg, #a9b2f5, #7e8be6); }
.seg-f { background: linear-gradient(90deg, var(--amber), #f5c896); }
@keyframes macroGrow { from { transform: scaleX(0); } }
.meal-kcal b { font-variant-numeric: tabular-nums; font-weight: 600; }
.meal-kcal i { color: var(--ink-faint); font-style: normal; font-size: .7rem; margin-left: 3px; }
.chev { width: 18px; height: 18px; color: var(--ink-faint); transition: transform .3s var(--ease); }
.meal-card[data-open] .chev { transform: rotate(180deg); }
/* grid-rows 0fr -> 1fr is the smoothest pure-CSS height collapse */
.meal-detail { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .4s var(--ease); }
.meal-card[data-open] .meal-detail { grid-template-rows: 1fr; }
.meal-detail-inner { overflow: hidden; padding: 0 16px; }
.meal-card[data-open] .meal-detail-inner { padding-bottom: 14px; }
/* staggered rise of each child when opened */
.meal-card[data-open] .meal-detail-inner > * { animation: rise .5s var(--ease) both; }
.meal-card[data-open] .meal-detail-inner > *:nth-child(1) { animation-delay: .06s; }
.meal-card[data-open] .meal-detail-inner > *:nth-child(2) { animation-delay: .12s; }
.meal-card[data-open] .meal-detail-inner > *:nth-child(3) { animation-delay: .18s; }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } }
.macro-legend { display: flex; gap: 20px; padding: 10px 0; font-size: .82rem; color: var(--ink-dim); }
.macro-legend b { color: #fff; font-variant-numeric: tabular-nums; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 7px; }
.dot-p { background: var(--mint); } .dot-c { background: #a9b2f5; } .dot-f { background: var(--amber); }
.food-row { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-top: 1px solid var(--rule); font-size: .9rem; }
.food-meta { color: var(--ink-faint); font-variant-numeric: tabular-nums; }
```

```js
// share() turns grams into a % width of the stacked bar
function share(p, c, f) { const cals = p*4 + c*4 + f*9 || 1; return [p*4/cals*100, c*4/cals*100, f*9/cals*100].map(n => Math.round(n) + '%'); }
document.querySelectorAll('.meal-head').forEach(h => h.addEventListener('click', () => {
  const card = h.closest('.meal-card');
  const open = card.toggleAttribute('data-open');
  h.setAttribute('aria-expanded', open);
}));
```

The single goal-progress meters (Calories tile + per-macro rows on the day view) use the same idea: a pill track with a width-driven fill. When over target the fill swaps to amber (`linear-gradient(90deg, var(--amber), #f5c896)`) instead of mint, never red. Track: `height:7px; background:rgba(255,255,255,.07); border-radius:999px`; fill transitions width.

---

## 4. Analyzing overlay (cycling steps + facts, pulsing rings)

Pattern (from AnalyzingOverlay): a blurred full-screen scrim with concentric pulsing mint rings, a step line that rotates every ~2.6s, and a "did you know" fact that rotates every ~3.9s (offset so they never change in lockstep). Make the wait feel like a treat, never a dead spinner.

```html
<div class="analyze" id="analyze" hidden>
  <div class="analyze-card">
    <div class="analyze-pulse"><span class="ring"></span><span class="ring"></span><span class="ring"></span><span class="dot"></span></div>
    <p class="analyze-step" id="aStep">Reading your plate</p>
    <p class="analyze-fact" id="aFact">Macros come from a verified database, not a guess.</p>
  </div>
</div>
```

```css
.analyze { position: fixed; inset: 0; z-index: 60; background: rgba(0,0,0,.82); backdrop-filter: blur(10px);
  display: flex; align-items: center; justify-content: center; }
.analyze-card { display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 40px 28px; text-align: center; max-width: 320px; }
.analyze-pulse { position: relative; width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; }
.ring { position: absolute; inset: 0; border-radius: 50%; border: 1.5px solid var(--mint); opacity: 0; animation: ringPulse 2.4s ease-out infinite; }
.ring:nth-child(2) { animation-delay: .8s; } .ring:nth-child(3) { animation-delay: 1.6s; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: var(--mint); opacity: .9; }
@keyframes ringPulse { 0% { transform: scale(.35); opacity: .7; } 100% { transform: scale(1); opacity: 0; } }
.analyze-step { font-size: 1rem; font-weight: 500; color: #fff; margin: 0; transition: opacity .3s var(--ease); }
.analyze-fact { font-size: .9rem; color: var(--ink-dim); line-height: 1.5; margin: 0; transition: opacity .3s var(--ease); }
@media (prefers-reduced-motion: reduce) { .ring { animation: none; opacity: .25; } }
```

```js
const STEPS = ['Reading your plate', 'Spotting each food', 'Estimating portion sizes', 'Matching to the database', 'Verifying the macros', 'Adding up your plate'];
const FACTS = ['Macros come from a verified database, not a guess.', 'Protein keeps you fuller for longer than carbs or fat.', 'Cooked and raw weights differ a lot. We account for it.', 'You can fix any food or portion after it logs.'];
let stepT, factT;
function startAnalyze() {
  const el = document.getElementById('analyze'); el.hidden = false;
  let s = 0, f = 0;
  document.getElementById('aStep').textContent = STEPS[0];
  document.getElementById('aFact').textContent = FACTS[0];
  stepT = setInterval(() => { s = (s + 1) % STEPS.length; document.getElementById('aStep').textContent = STEPS[s]; }, 2600);
  factT = setInterval(() => { f = (f + 1) % FACTS.length; document.getElementById('aFact').textContent = FACTS[f]; }, 3900);
}
function stopAnalyze() { clearInterval(stepT); clearInterval(factT); document.getElementById('analyze').hidden = true; }
```

---

Voice across all four: warm, plain, never shame. Off-target reads amber, not red. Copy is short ("Tell me about this plate", "Scan my plate", "Not sure, skip"). Selection and progress always animate in with a spring or ease, never strobe-cut.
