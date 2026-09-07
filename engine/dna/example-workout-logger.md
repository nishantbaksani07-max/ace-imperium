# Gold example: the Workout Logger (the standard for a rich tile)

This is the bar. A great Vitality tile is not a form. It is a small, living
instrument: every action lands with color and motion that carry meaning, every
number is your real history, and finishing feels like an event. The logger is
the reference. Below is its anatomy, translated into patterns a single sealed
HTML file (vanilla CSS + JS + inline SVG, no libraries) can reproduce.

Source: `app/app/fitness/log/` (SplitLog, SetPill, HistoryModal). Translated,
not copied. Where the source uses React state + Supabase, a tile uses plain
DOM + `localStorage` (and later `report()` to Vee).

---

## Tokens to inline (the logger's local palette)

Put these at `:root` in the tile. They are the colors that carry meaning.

```css
:root {
  --bg:        #000;             /* #000, host paints it, tile body stays transparent */
  --fg:        #ffffff;
  --body-text: #e9efe9;          /* softened body text, separate from pure-white --fg */
  --muted:     rgba(233,239,233,0.55);
  --muted-strong: rgba(233,239,233,0.78);
  --rule:      rgba(233,239,233,0.14);
  --rule-strong: rgba(233,239,233,0.22);

  --mint:      #6ee7b7;          /* "good / done / progress" */
  --mint-soft: #a7f3d0;
  --amber:     #f59e0b;          /* "partial / fell short", warm, NOT alarm */
  --amber-soft:#e9c87a;
  --red:       #ef4444;          /* destructive-confirm actions only */
  --coral:     #f08a8a;          /* soft down-trend, gentler than red */
  --gold:      #f1cf7a;          /* "conquered / personal best", rare, earned */
  --twilight:  rgba(138,180,208,0.85); /* "off / rest day", off the progress line */

  --ease:        cubic-bezier(0.2, 0.8, 0.2, 1);   /* the plain default */
  --ease-premium:cubic-bezier(0.16, 1, 0.3, 1);    /* the signature */
  --spring:      cubic-bezier(0.34, 1.56, 0.64, 1);  /* the springy pop */
  --duration:    180ms;
  --radius-pill: 999px;
}
```

Type law: emotive text (titles, dates, status words, captions) is serif italic
(`font-family: 'Instrument Serif', Georgia, serif; font-style: italic`). All
numbers are `font-variant-numeric: tabular-nums` so columns never jitter.
Labels/eyebrows are tiny, uppercase, wide letter-spacing (`0.14em`).

Color LAW (do not break it): mint = good, amber = caution/short, gold = earned
peak, twilight blue = rest. Red is reserved for genuinely destructive actions
(deleting real data), never for a user who simply did less than target.

---

## The anatomy of the tile (top to bottom)

1. **Header**: a tiny uppercase eyebrow + a serif-italic title. Optional state
   pill on the right (e.g. HEAVY / VOLUME / REST), color-coded.
2. **Session progress bar**: one thin mint-gradient bar that fills as you log.
   It is the heartbeat of the tile.
3. **The work**: a stack of cards (here, lifts). Each card has the set-row state
   language below and its own little progressive-overload celebration.
4. **History**: each item can open a modal with a real line chart, range pills,
   a stats row, and an editable session log.
5. **Capstone**: an "after the lifts" section (cardio) + a **Finish** action
   that triggers a celebration and a calm auto-return.

Everything saves continuously via `Vitality.save` on every discrete action (never
"save at the end"); `localStorage` is only a standalone fallback, wrapped in
try/catch. On finish, if the tile has one meaningful stream, it may `report()` a
summary to the dashboard, as a comparable stream.

---

## 1. Session progress bar

A single thin track + a gradient fill whose width is `done/total %`. Animates
with the premium ease so progress feels like it glides up.

```html
<div class="progress-row">
  <div class="progress-track"><div class="progress-fill" id="pfill"></div></div>
  <span class="progress-label" id="plabel">0 of 12 sets</span>
</div>
```
```css
.progress-row{display:flex;align-items:center;gap:12px}
.progress-track{flex:1;height:5px;background:rgba(255,255,255,.07);
  border-radius:var(--radius-pill);overflow:hidden}
.progress-fill{height:100%;width:0;border-radius:var(--radius-pill);
  background:linear-gradient(90deg,#3ddc97,#a7f3d0);
  transition:width 480ms var(--ease-premium)}
.progress-label{font-family:'Instrument Serif',Georgia,serif;font-style:italic;
  font-size:.9rem;color:var(--muted-strong);white-space:nowrap}
```
```js
function renderProgress(done,total){
  document.getElementById('pfill').style.width = total? (done/total*100)+'%':'0';
  document.getElementById('plabel').textContent = `${done} of ${total} sets`;
}
```

A multi-item rail variant (one segment per day/section) uses the same colors as
states: solid mint gradient = done, an animated dotted line = the current/active
one, a half-fill = partial. That is the whole status vocabulary, reused.

---

## 2. The set-row state language (the heart of it)

Each set is one **pill**: a rounded row (radius 16) holding an index, an inline
weight x reps, and a right-side affordance. The pill has five states, and its
background color alone tells the story. This is the single most important idea
to copy: **state is color, words only confirm.**

| State     | Meaning                       | Background / border        | Right-side word |
|-----------|-------------------------------|----------------------------|-----------------|
| `empty`   | not logged yet                | faint white, hairline rule | `hit it ->` (+ `miss`) |
| `clean`   | logged at target              | solid **mint** fill, black text | `done` |
| `over`    | beat target (more reps/wt)    | solid **mint** fill + a gold star | `done . +2` |
| `partial` | logged but short of target    | **amber** tint + amber border | `partial . -1` |
| `failed`  | tried and missed              | **amber** tint + amber border, value struck through | `missed` |

Resting (empty) rows are tappable; logging an empty row floods it mint with an
**800ms shimmer** sweep so the commit is felt, not just shown. No shimmer on
partial/failed (the color flood alone carries those, no celebration for short).

```html
<div class="pill" data-state="empty">
  <span class="pill-idx">i</span>
  <span class="pill-val">
    <input class="pill-in" type="number" value="60" inputmode="decimal">
    <span class="pill-unit">kg</span><span class="pill-x">×</span>
    <input class="pill-in" type="number" value="8" inputmode="numeric">
  </span>
  <span class="pill-spacer"></span>
  <button class="pill-hit">hit it →</button>
  <button class="pill-miss">miss</button>
</div>
```
```css
.pill{display:flex;align-items:center;gap:12px;padding:14px 16px;
  border-radius:16px;border:1px solid var(--rule);background:rgba(255,255,255,.022);
  position:relative;overflow:hidden;
  transition:background 220ms var(--ease-premium),border-color 220ms var(--ease-premium),
             box-shadow 220ms var(--ease-premium),color 220ms var(--ease-premium)}
.pill-idx{font-family:'Instrument Serif',Georgia,serif;font-style:italic;
  width:18px;flex-shrink:0;color:var(--muted)}
.pill-in{background:transparent;border:none;outline:none;color:inherit;font:inherit;
  font-weight:600;font-variant-numeric:tabular-nums;text-align:center;
  field-sizing:content;min-width:1.4ch;border-bottom:1px solid transparent;
  transition:border-color var(--duration),color var(--duration)}
.pill:hover .pill-in{border-bottom-color:rgba(110,231,183,.22)}
.pill-in:focus{color:var(--mint);border-bottom-color:var(--mint)}
.pill-unit{color:var(--muted);font-family:'Instrument Serif',serif;font-style:italic;
  font-size:.7em;margin-left:3px}
.pill-x{color:var(--muted);margin:0 6px}
.pill-spacer{flex:1}
.pill-hit,.pill-miss{background:none;border:none;cursor:pointer;
  font-family:'Instrument Serif',Georgia,serif;font-style:italic;font-size:.9rem}
.pill-hit{color:var(--mint)} .pill-miss{color:var(--muted)}
.pill-miss:hover{color:var(--amber)}

/* state variants, driven by data-state */
.pill[data-state="clean"],.pill[data-state="over"]{
  background:var(--mint);border-color:var(--mint);color:#000}
.pill[data-state="clean"] .pill-idx,.pill[data-state="over"] .pill-idx{color:#000}
.pill[data-state="clean"] .pill-in,.pill[data-state="over"] .pill-in{color:#000}
.pill[data-state="partial"]{background:rgba(245,158,11,.14);border-color:var(--amber);color:var(--fg)}
.pill[data-state="partial"] .pill-idx{color:var(--amber)}
.pill[data-state="failed"]{background:rgba(245,158,11,.12);border-color:var(--amber);color:var(--fg)}
.pill[data-state="failed"] .pill-idx{color:var(--amber)}
.pill[data-state="failed"] .pill-val{text-decoration:line-through;color:var(--muted-strong)}

/* the mint-flood shimmer on empty -> clean/over (NOT on partial/failed) */
.pill.shimmer::after{content:'';position:absolute;inset:0;border-radius:16px;pointer-events:none;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.35) 50%,transparent);
  background-size:200% 100%;animation:pill-shimmer 800ms var(--ease-premium) forwards}
@keyframes pill-shimmer{from{background-position:100% 0}to{background-position:-100% 0}}
```
```js
// Classify a logged set against its target, then set the data-state + shimmer.
function classify(weight,reps,targetWeight,targetReps,failed){
  if(failed) return 'failed';
  if(weight>=targetWeight && reps>targetReps) return 'over';
  if(weight>=targetWeight && reps>=targetReps) return 'clean';
  return 'partial';
}
function setPill(el,state){
  const was=el.dataset.state; el.dataset.state=state;
  if(was==='empty' && (state==='clean'||state==='over')){
    el.classList.add('shimmer'); setTimeout(()=>el.classList.remove('shimmer'),800);
  }
}
```

Two rules that make it feel humane:
- An empty/zero reps field is a **no-op**, never an auto-miss. A miss is only the
  explicit `miss` button. Fewer reps than target logs normally as a `partial`.
- Logging is an explicit button (`hit it ->`), so typing in a field never
  silently commits a set.

---

## 3. The "conquered" progressive-overload celebration

When a logged set beats the item's previous best, the whole card flushes **gold
once** (a one-time burst), then settles into a calm persistent "conquered" mark:
a small steady gold star by the title. The burst is the reward; the star is the
memory. It is fully reversible (unlog and it clears, re-fires if you beat it
again).

Key trap learned the hard way: do NOT put the celebration on the card's own
`animation` shorthand if that card also has an entrance animation. It will
replace the entrance, drop its `forwards` fill, and blank the card. Drive the
glow and ring from **pseudo-elements** and pin `opacity:1`.

```css
.card.celebrate{opacity:1 !important}              /* never let the burst blank it */
.card.celebrate::before{content:'';position:absolute;inset:-2px;border-radius:18px;
  z-index:-1;pointer-events:none;animation:ex-glow 1.6s var(--ease) forwards}
@keyframes ex-glow{0%{box-shadow:0 0 0 0 rgba(241,207,122,0)}
  22%{box-shadow:0 0 56px -4px rgba(241,207,122,.5)}
  100%{box-shadow:0 0 0 0 rgba(241,207,122,0)}}
.card.celebrate::after{content:'';position:absolute;inset:-2px;border-radius:18px;
  border:1.5px solid rgba(241,207,122,.7);pointer-events:none;
  animation:ex-ring 1.6s var(--ease) forwards}
@keyframes ex-ring{0%{opacity:0;transform:scale(.985)}18%{opacity:1;transform:scale(1)}
  100%{opacity:0;transform:scale(1.012)}}
.card.celebrate .pill{animation:gold-set 1.5s var(--ease)}  /* gold wash over each row */
@keyframes gold-set{0%,100%{box-shadow:inset 0 0 0 999px rgba(241,207,122,0)}
  30%{box-shadow:inset 0 0 0 999px rgba(241,207,122,.2)}}

/* the persistent earned star */
.conquered-star{width:14px;height:14px;color:var(--gold);
  filter:drop-shadow(0 0 5px rgba(241,207,122,.35))}
```
```js
function maybeCelebrate(card, beatsPrevBest){
  const wasConq = card.classList.contains('conquered');
  card.classList.toggle('conquered', beatsPrevBest);
  if(beatsPrevBest && !wasConq){               // only on the crossing
    card.classList.add('celebrate');
    setTimeout(()=>card.classList.remove('celebrate'),1600);
  }
}
```

There is also an optional **arm-ahead star**: before lifting, the user can arm a
"+2.5kg / +1 rep" goal; the star breathes gold while armed (`armedBreathe`
2.8s), goes calm-dim once the goal is met, and is reversible. Nice-to-have, not
required.

---

## 4. The history modal: line chart + range pills + stats + editable log

This is what turns a tile from a tracker into an instrument. Tapping an item
opens a centered, blurred-backdrop modal containing:

- a **stock-quote-style chart card** (a hand-drawn inline-SVG sparkline),
- a row of **range pills** `W / M / 3M / 6M / Y / All` that window the points by
  date,
- a three-cell **stats row** (Sessions, Last 30 days, Best),
- an **editable session log** (newest-first rows, expand to step values, delete
  with a confirm dialog), and
- a dashed **"log a session"** backfill form.

### Range pills + windowing
```js
const RANGES=[['W',7],['M',30],['3M',90],['6M',180],['Y',365],['all',Infinity]];
// points are {date:'YYYY-MM-DD', top:Number, reps:Number, sets:Number}
function daysAgo(d){const[y,m,da]=d.split('-').map(Number);
  const t=new Date(y,m-1,da).getTime();const z=new Date();z.setHours(0,0,0,0);
  return Math.round((z.getTime()-t)/864e5)}
function windowPoints(points,win){return Number.isFinite(win)
  ? points.filter(p=>daysAgo(p.date)<=win) : points}
```
```css
.range-tabs{display:flex;gap:3px;justify-content:center;padding:4px;width:fit-content;
  margin:18px auto 0;background:rgba(255,255,255,.025);border:1px solid var(--rule);border-radius:13px}
.range-tab{font-size:.62rem;letter-spacing:.05em;text-transform:uppercase;font-weight:700;
  color:var(--muted);background:none;border:none;border-radius:9px;padding:6px 13px;cursor:pointer;
  transition:color var(--duration),background 200ms var(--spring),transform var(--duration)}
.range-tab:active{transform:scale(.94)}
.range-tab.on{color:#04140d;background:var(--mint)}   /* selected = mint chip */
```

### The sparkline (inline SVG, drawn by hand)
Geometry: viewBox `0 0 320 88` (or 120 tall in the framed card), `preserveAspectRatio="none"`.
Place each point by **date inside the window** (not evenly by index), so a short
recent run reads as a small blip on the right of a year view. Mint stroke, a soft
mint area-fill gradient, three faint horizontal gridlines with "nice" rounded
y-bounds (round to nearest 5, pad 5 above and below so a steady line sits
mid-card, never pinned to the floor reading as "failing at zero"). Use
`vector-effect="non-scaling-stroke"` so the 2px line stays 2px under the stretch.

```js
const GW=320,GH=88,GPAD=12;
function buildPath(points,lo,hi,domainDays){
  const yFor=w=>GPAD+(GH-2*GPAD)*(1-(w-lo)/(hi-lo));
  const xFor=p=>GPAD+(GW-2*GPAD)*Math.min(1,Math.max(0,1-daysAgo(p.date)/domainDays));
  const pts=points.map(p=>[xFor(p),yFor(p.top)]);
  const d=pts.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area=`${d} L${pts.at(-1)[0].toFixed(1)} ${GH} L${pts[0][0].toFixed(1)} ${GH} Z`;
  return {d,area,pts};
}
```
```html
<svg viewBox="0 0 320 88" preserveAspectRatio="none" style="width:100%;height:120px;overflow:visible">
  <defs><linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#6EE7B7" stop-opacity=".18"/>
    <stop offset="100%" stop-color="#6EE7B7" stop-opacity="0"/>
  </linearGradient></defs>
  <!-- 3 gridlines: stroke rgba(255,255,255,.08), non-scaling-stroke -->
  <path id="area" fill="url(#hg)"/>
  <path id="line" fill="none" stroke="#6ee7b7" stroke-width="2"
        stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
  <!-- a small dot on every past session; the latest is a bigger filled mint dot -->
</svg>
```

Each plotted dot is color-coded by trend (mint if held/up, soft coral
`#f08a8a` if down vs the previous point). The latest session's dot goes **amber**
if its best set fell short of target (a warmly-marked down day, never red).

### Scrubber (finger across the line)
On `pointerdown/move`, snap to the nearest point by x, then move three absolutely
positioned overlay elements: a faint vertical line, a dot pinned on the point,
and a floating tag showing that session's date + weight + reps + delta. Throttle
the rep-chip update so the modal re-renders at most once per dot crossing, not
per frame. Set `touch-action:none` on the graph box. Color the scrub dot mint up
/ coral down.

### Off / rest days (the humane touch)
A rest day is plotted as a **soft twilight-blue dot OFF the line** plus a moon
tick on the baseline, and is **excluded** from best / progression / the line, so
an easy day never reads as a dip or resets your baseline. In the log list it gets
a calm "off day" label and a moon glyph instead of a progress number.

### Stats row
```html
<div class="stats">
  <div class="cell"><div class="lbl">Sessions</div><div class="val">14</div></div>
  <div class="cell"><div class="lbl">Last 30 days</div><div class="val up">+5 kg</div></div>
  <div class="cell"><div class="lbl">Best</div><div class="val gold">80 kg</div></div>
</div>
```
```css
.stats{display:flex;gap:8px;margin:18px 0;padding:15px 0;
  border-top:1px solid var(--rule);border-bottom:1px solid var(--rule)}
.cell{flex:1;text-align:center}
.lbl{font-size:.6rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.val{font-family:'Instrument Serif',Georgia,serif;font-style:italic;font-size:1.2rem;margin-top:6px}
.val.up{color:var(--mint)} .val.soft{color:#f3c98b} .val.gold{color:var(--gold)}
```
The "Best" value glows gold; a positive 30-day delta is mint, negative is soft
amber (`#f3c98b`, never red), flat is muted. The chart caption echoes this:
`+5 kg . this month` in mint, or `holding steady` in muted.

### Editable log + delete confirm
Rows are newest-first, each delta vs the previous **real** session (skip off-days).
A row expands (CSS grid-rows `0fr -> 1fr` transition) to show `-/+` steppers and a
serif-italic `remove session` link in coral. Because removing erases real data,
deletion goes through a small **centered confirm card** ("keep it" / "remove"),
not an inline tap. The best-ever row shows a gold star and a gold weight.

### The modal shell
```css
.overlay{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.6);
  backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;padding:18px;
  animation:fade 200ms var(--ease)}
@keyframes fade{from{opacity:0}to{opacity:1}}
.dialog{width:100%;max-width:440px;max-height:86vh;display:flex;flex-direction:column;
  border:1px solid var(--rule-strong);border-radius:26px;background:#0a0b0a;padding:22px;
  transform:translateY(10px) scale(.985);animation:dlg 320ms var(--ease-premium) forwards}
@keyframes dlg{to{transform:none}}
```
Close on overlay click, on the X button, and on Escape; lock `body` scroll while
open. Empty state is its own card: a small mint trend glyph, a serif-italic line
("Nothing this month yet."), and a quiet sub ("log another and your line starts
here"), entering with the `cozyItem` spring.

---

## 5. The capstone: "after the lifts" + Finish

A separate section below the main work, divided by a rule with a serif eyebrow
("AFTER THE LIFTS") and an animated SVG pulse line (a heartbeat trace that draws
itself on a `stroke-dashoffset` loop). It holds a big serif **summary readout**
(e.g. "23 min" zone-2) over a mint meter bar, a list of logged bouts, and a
mint-fill add button with an icon-tile picker. The pattern: a hero number in
serif italic mint, a thin animated meter underneath, then the editable rows.

```css
.capstone{margin-top:24px;padding-top:24px;border-top:1px solid var(--rule)}
.capstone-eyebrow{font-size:.75rem;letter-spacing:.2em;text-transform:uppercase;color:var(--mint);opacity:.85}
.capstone-big{font-family:'Instrument Serif',Georgia,serif;font-style:italic;
  font-size:3rem;line-height:.95;color:var(--mint);margin-top:9px}
.capstone-meter{height:7px;border-radius:999px;background:rgba(255,255,255,.07);overflow:hidden;margin-top:13px}
.capstone-meter i{display:block;height:100%;border-radius:999px;
  background:linear-gradient(90deg,#3ddc97,#a7f3d0);box-shadow:0 0 12px rgba(110,231,183,.4);
  transition:width .55s var(--ease-premium)}
```

### The rest timer between sets
On logging a non-final set, float a fixed glass pill bottom-center with a
serif-italic countdown. Drive the countdown from a wall-clock `endsAt` epoch (not
a per-second decrement) so a backgrounded tab self-corrects on its next tick /
on focus. When it hits zero, flood the pill mint, bounce in a serif "GO ->", buzz
`navigator.vibrate([140,70,140])` where supported, then fade out after ~1.1s.

```css
.rest-pill{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:30;
  display:flex;align-items:center;gap:12px;padding:12px 16px;min-width:320px;
  background:rgba(8,16,12,.92);border:1px solid rgba(110,231,183,.35);border-radius:var(--radius-pill);
  backdrop-filter:blur(16px);box-shadow:0 0 60px rgba(110,231,183,.1),0 8px 32px rgba(0,0,0,.5);
  animation:rest-in 320ms var(--ease-premium)}
@keyframes rest-in{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}
.rest-time{font-family:'Instrument Serif',Georgia,serif;font-style:italic;font-size:1.25rem;
  color:var(--mint);font-variant-numeric:tabular-nums}
.rest-pill.done{background:var(--mint);border-color:var(--mint);justify-content:center;
  animation:rest-flood 1100ms var(--ease-premium) forwards}
@keyframes rest-flood{0%{transform:translateX(-50%) scale(1);opacity:1}
  16%{transform:translateX(-50%) scale(1.06)}34%{transform:translateX(-50%) scale(1)}
  78%{opacity:1}100%{transform:translateX(-50%) scale(1);opacity:0}}
```

### Finish
On "finish": auto-complete every untouched set at its shown target (a forgotten
tap should never lose a logged session), persist, then take over the view with a
celebration screen that breathes for ~3.6s and auto-returns. If the tile has one
meaningful stream, finishing is also where it may call `report()`, sending one
number to the dashboard as a comparable stream (and the optional Vee tile if
present); a tile without such a stream never calls it and nothing breaks.

---

## The distilled checklist for a great tile

- [ ] `#000` bg, host paints it, tile body stays transparent; mint accents,
      serif-italic for emotive text, tabular-nums on every number.
- [ ] Color carries state: mint=good, amber=short, gold=earned, twilight=rest,
      red=destructive-only. Words only confirm.
- [ ] One action = one felt response (shimmer on a clean log, color flood on a
      partial, gold burst on a personal best).
- [ ] A session progress bar that glides.
- [ ] Real history behind a tap: a hand-drawn SVG line chart, range pills, a
      stats row, an editable + deletable (with confirm) log.
- [ ] Rest/off days are honored, never punished (off the progress line, calm
      twilight blue).
- [ ] Save continuously via `Vitality.save` on every discrete action; no "save
      at the end". `localStorage` only as a standalone fallback (try/catch).
- [ ] A capstone moment on finish: a celebration and a calm return. (Optional:
      if the tile has one meaningful stream, `report()` it to the dashboard as a
      comparable stream.)
- [ ] Respect `prefers-reduced-motion` (kill the drifts, shimmers, and pulses).
