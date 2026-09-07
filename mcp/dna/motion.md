# Vitality Motion + Animation DNA

How Vitality moves. Every recipe here is plain CSS / vanilla JS / inline SVG, ready to paste into a single sealed HTML tile (no React, no libraries, no build step). Where a source used React or Three.js, the idea is translated to something a flat tile reproduces.

The feel in one line: things arrive softly and confidently, settle with a tiny overshoot, then breathe. Never linear, never harsh, never strobing. Mint accent on near-black. Always reduced-motion safe.

> **The buttery law.** Animate only transform and opacity, never width, height, top, left, right, bottom, margin, padding, or box-shadow in a loop or transition (because those trigger layout and paint every frame and drop below 60fps on a phone, while transform and opacity are GPU-composited). A width becomes scaleX, a position becomes translate, a glow pulse becomes opacity on a pre-blurred layer.

> **Frame budget.** 60fps is about 16ms per frame, so the whole tile shares one tiny budget. Keep the number of nodes looping at once under ~12, and cap idle particles around 10. Fewer things moving calmly beats many things moving cheaply.

---

## 1. The motion tokens (paste into :root)

These are Vitality's exact easing + timing constants. Use the tokens, do not hand-pick random cubic-beziers.

```css
:root {
  /* ── easing ── */
  --ease:         cubic-bezier(0.2, 0.8, 0.2, 1);    /* default UI transitions */
  --ease-premium: cubic-bezier(0.16, 1, 0.3, 1);     /* THE signature ease. use on every meaningful state change */
  --ease-out-soft:cubic-bezier(0.32, 0.72, 0, 1);    /* long smooth lift / glide (slider sweep) */
  --spring:       cubic-bezier(0.34, 1.56, 0.64, 1); /* overshoot "pop": picks, tags, dots landing */

  /* ── durations ── */
  --duration-fast: 120ms;   /* taps, tiny transforms */
  --duration:      180ms;   /* standard color/border/bg transition */
  --duration-lift: 480ms;   /* entrance lifts */

  /* ── accent (for glows) ── */
  --mint: #6EE7B7;
  --mint-hi: #A7F3D0;
  --mint-glow: rgba(110, 231, 183, 0.4);
}
```

Rule of thumb:
- State change (hover, active, color, border, width)  -> `var(--ease-premium)` at `--duration`.
- Anything that should feel alive / clicked / landed (a pick, a tag appearing, a dot arriving) -> `var(--spring)` (the overshoot one).
- A long single glide across a track -> `var(--ease-out-soft)`.

`cubic-bezier(0.16, 1, 0.3, 1)` is the heartbeat of the whole product. When unsure, use it.

---

## 2. The cozy loader (Alex's favorite waiting treatment)

Use this instead of a spinner whenever the tile is waiting (a fetch, an AI call, a save). It is warm, not mechanical. Five parts make the mechanic:

1. A playful TAG bounces in (spring overshoot, slight rotate).
2. The CONTENT springs up under it, with ONE phrase color-emphasized.
3. The WHOLE CARD is tinted to a tone (border, tag, bar, dots, highlight all share `--tone`).
4. A thin shimmer bar slides left to right.
5. Three dots pulse.

Rotate the line + tag every ~3.2s so the wait feels like company, not a freeze.

```html
<article class="cozy" data-tone="mint" aria-live="polite">
  <div class="cozy-body">
    <div class="cozy-bar" aria-hidden><span></span></div>
    <div class="cozy-fact">
      <span class="cozy-tag" id="cozyTag">Fuel fact</span>
      <p class="cozy-text" id="cozyText">Protein near every meal keeps you <span class="cozy-hl">fuller longer</span>.</p>
      <div class="cozy-dots" aria-hidden><i></i><i></i><i></i></div>
    </div>
  </div>
</article>
```

```css
.cozy {
  --tone: var(--mint);
  --tone-soft: rgba(110, 231, 183, 0.28);
  display: flex; gap: 12px; padding: 12px;
  border: 1px solid var(--tone-soft);
  background: rgba(255,255,255,0.02);
  border-radius: 12px;
  transition: border-color 0.5s var(--ease-premium);
}
/* tones: swap data-tone to recolor the whole card */
.cozy[data-tone='mint']  { --tone:#6EE7B7; --tone-soft:rgba(110,231,183,0.28); --tone-ink:#06281d; }
.cozy[data-tone='blue']  { --tone:#8fb8c9; --tone-soft:rgba(143,184,201,0.34); --tone-ink:#08222b; }
.cozy[data-tone='amber'] { --tone:#F59E0B; --tone-soft:rgba(245,158,11,0.30);  --tone-ink:#2a1903; }
.cozy[data-tone='violet']{ --tone:#a78bfa; --tone-soft:rgba(167,139,250,0.32); --tone-ink:#1b1233; }

.cozy-body { flex:1; min-width:0; display:flex; flex-direction:column; gap:8px; }

.cozy-bar { height:4px; border-radius:999px; background:rgba(255,255,255,0.16); overflow:hidden; }
.cozy-bar span {
  display:block; height:100%; width:40%; border-radius:999px;
  background:linear-gradient(90deg, transparent, var(--tone), transparent);
  animation: cozySlide 1.4s var(--ease-premium) infinite;
}
.cozy-fact { display:flex; flex-direction:column; align-items:flex-start; gap:8px; min-height:3.6em; }
.cozy-tag {
  font:600 0.58rem ui-monospace, monospace; letter-spacing:0.14em; text-transform:uppercase;
  color:var(--tone-ink); background:var(--tone); border-radius:999px; padding:3px 10px;
  transition: background 0.5s var(--ease-premium);
  animation: cozyTagPop 0.5s var(--spring);
}
.cozy-text { font-weight:500; font-size:0.875rem; line-height:1.35; color:#eafff7;
  animation: cozyPop 0.55s var(--spring); }
.cozy-hl { color:var(--tone); font-weight:700; transition: color 0.5s var(--ease-premium); }
.cozy-dots { display:flex; gap:6px; }
.cozy-dots i { width:6px; height:6px; border-radius:50%; background:var(--tone); opacity:.4;
  animation: cozyDot 1.2s ease-in-out infinite; }
.cozy-dots i:nth-child(2){ animation-delay:.2s } .cozy-dots i:nth-child(3){ animation-delay:.4s }

@keyframes cozyTagPop { 0%{opacity:0;transform:scale(.6) rotate(-6deg)} 100%{opacity:1;transform:scale(1) rotate(0)} }
@keyframes cozyPop    { 0%{opacity:0;transform:scale(.8) translateY(8px)} 60%{opacity:1;transform:scale(1.04)} 100%{transform:scale(1) translateY(0)} }
@keyframes cozyDot    { 0%,100%{opacity:.35;transform:scale(1)} 50%{opacity:1;transform:scale(1.5)} }
@keyframes cozySlide  { from{transform:translateX(-120%)} to{transform:translateX(320%)} }

@media (prefers-reduced-motion: reduce) {
  .cozy, .cozy-tag, .cozy-text, .cozy-dots i, .cozy-bar span { transition:none; animation:none; }
  .cozy-bar span { width:100%; opacity:.5; }   /* calm static fill, content still shows */
}
```

```js
// rotate the line + tag; re-trigger the pop by reflow
const FACTS = [
  { text: 'Protein near every meal keeps you fuller longer.', hl: 'fuller longer', tone: 'mint' },
  { text: 'Most progress is just showing up on the average day.', hl: 'the average day', tone: 'blue' },
];
const TAGS = ['Fuel fact', 'Hot take', 'Did you know'];
const tagEl = document.getElementById('cozyTag');
const textEl = document.getElementById('cozyText');
const card = document.querySelector('.cozy');
let i = 0;
setInterval(() => {
  i = (i + 1) % FACTS.length;
  const f = FACTS[i];
  card.dataset.tone = f.tone;
  tagEl.textContent = TAGS[Math.floor(Math.random() * TAGS.length)];
  const k = f.text.indexOf(f.hl);
  textEl.innerHTML = f.text.slice(0,k) + '<span class="cozy-hl">' + f.hl + '</span>' + f.text.slice(k + f.hl.length);
  // replay the pop: clone-free reflow trick
  tagEl.style.animation = 'none'; textEl.style.animation = 'none';
  void tagEl.offsetWidth;
  tagEl.style.animation = ''; textEl.style.animation = '';
}, 3200);
```

Note: "cozy loader" is a STYLE (warm, springy, tinted, with a real fact). It is not a literal spinner overlay. Do not fake a loading screen over content that is already there.

---

## 3. Entrance system: draw-on, scale-from-inside, spring-pop

Three primitives compose every Vitality entrance. Combine them; stagger them.

### A. Line / path draws itself on (pathLength trick)

Set `pathLength="100"` on any SVG path so its length is normalized to 100 regardless of real geometry. Then dash-offset from 100 to 0. Works for contour lines, charts, trend lines, even icon strokes.

```html
<svg viewBox="0 0 400 150">
  <path class="draw" d="M10,118 L102,114 L196,100 L292,82 L390,46" pathLength="100"/>
</svg>
```

```css
.draw {
  fill:none; stroke:#6EE7B7; stroke-width:2.4; stroke-linecap:round; stroke-linejoin:round;
  stroke-dasharray:100; stroke-dashoffset:100;
  animation: drawOn 1.7s var(--ease-premium) 0.25s forwards;
  filter: drop-shadow(0 0 4px var(--mint-glow));
}
@keyframes drawOn { to { stroke-dashoffset: 0; } }

/* icon strokes can draw too, applies to every shape in the icon */
.ico-draw svg path, .ico-draw svg circle, .ico-draw svg rect {
  stroke-dasharray:96; stroke-dashoffset:96;
  animation: drawOn 0.68s var(--ease-premium) both;
}
@media (prefers-reduced-motion: reduce) { .draw, .ico-draw svg * { animation:none; stroke-dashoffset:0; } }
```

### B. Rings scale from the inside out, then breathe

A celebration / "fed" pulse: rings start small, expand outward, fade. For idle life, the same orb then breathes forever on a slow loop. This is the Fuel tile mechanic translated to flat CSS.

```css
/* the core orb */
.orb {
  width:30px; height:30px; border-radius:50%;
  background: radial-gradient(circle at 50% 42%, #f2fff8, #a7f3d0 38%, #6ee7b7 70%);
  box-shadow: 0 0 18px var(--mint-glow), 0 0 36px rgba(110,231,183,.35);
  animation: breathe 6.5s ease-in-out infinite;       /* idle life */
}
@keyframes breathe { 0%,100%{transform:scale(1);filter:brightness(1)} 50%{transform:scale(1.12);filter:brightness(1.22)} }

/* one-shot rings expanding inside-out on an event */
.ring { position:absolute; inset:0; margin:auto; width:26px; height:26px;
  border:1px solid #6EE7B7; border-radius:50%; opacity:0;
  animation: ringOut 1.5s ease-out forwards; }
.ring:nth-child(2){ animation-delay:.15s } .ring:nth-child(3){ animation-delay:.30s }
@keyframes ringOut {
  0%  { transform:scale(.6); opacity:0; border-width:1px; }
  12% { opacity:.7; }
  100%{ transform:scale(2.6); opacity:0; border-width:.3px; }   /* thins as it grows */
}
```

To fire it from JS on an event: add the ring nodes, then remove after ~2s. Pop the core at the same moment with a brief overshoot:

```css
.orb.fed { animation: breathe 6.5s ease-in-out infinite, corePop .7s var(--ease-premium); }
@keyframes corePop { 0%{transform:scale(1)} 40%{transform:scale(1.3);filter:brightness(1.5)} 100%{transform:scale(1)} }
```

### C. Dots spring-pop into place (with a landing pop)

Data dots / pips arrive scaled-down then overshoot to full. Two flavors:

```css
/* welded SVG data dots: fade + scale in, staggered L->R via inline animation-delay */
.dot { fill:rgba(110,231,183,0.6); opacity:0; transform-box:fill-box; transform-origin:center;
  animation: dotIn .6s var(--ease-premium) forwards; }
@keyframes dotIn { from{opacity:0;transform:scale(.4)} to{opacity:.9;transform:scale(1)} }

/* a value/marker landing into place: spring overshoot past 1 then settle */
@keyframes pop { 0%{opacity:0;transform:scale(0)} 70%{opacity:1;transform:scale(1.35)} 100%{opacity:1;transform:scale(1)} }
.cdot { animation: pop .42s var(--spring) both; }
```

Stagger dots so they ride along the line draw. Set `animation-delay` inline per dot, e.g. evenly across the draw duration:

```js
dots.forEach((d, i) => {
  const delay = 0.25 + 1.7 * (i / (dots.length - 1)) * 0.86;  // ride the 1.7s draw
  d.style.animationDelay = delay + 's';
});
```

---

## 4. Tile-art choreography (intro once, then breathe)

The signature shape of a Vitality background tile: play an intro sequence ONCE, then settle into a slow idle breathe. Never loop the dramatic part.

Order for a graph tile (the Train "Ascent"):
1. Base wash slow-breathes from the start (`scale 1.02 -> 1.05`, opacity `.92 -> 1`, 9s loop).
2. Contour lines draw on (`drawOn`, ~3s, staggered 0.25s apart).
3. Data dots fade+scale in L to R (start ~3.0s, ~0.16s apart).
4. The bold trend line draws through them (~5s starting ~3.1s).
5. After it lands, only the line glow + the peak dot keep breathing on slow infinite loops.

```css
.base { animation: baseBreathe 9s ease-in-out infinite; }
@keyframes baseBreathe { 0%,100%{transform:scale(1.02);opacity:.92} 50%{transform:scale(1.05);opacity:1} }

.trend {
  animation: drawOn 5s 3.1s cubic-bezier(0.45,0,0.25,1) forwards;   /* draw once */
}
/* glow loop: do NOT animate filter:drop-shadow (it re-blurs every frame).
   Stack a pre-blurred copy of the line behind it and cross-fade its opacity. */
.trend-glow {
  filter: drop-shadow(0 0 7px rgba(110,231,183,.85));   /* blurred ONCE, never animated */
  opacity:.55;
  animation: glowBreathe 10s 8.2s ease-in-out infinite;
}
@keyframes glowBreathe {
  0%,100%{ opacity:.45 }
  50%    { opacity:.9 }
}
```

Two craft rules from the real tiles:
- Keep the dramatic draw as `forwards` (no loop). Only glows / scale-breathes loop, and slowly (6.5s to 10s).
- Weld dots to the line by giving them the EXACT same coordinates as the path vertices, in one shared SVG coordinate space, so they can never drift when the tile resizes. Match the band's `aspect-ratio` to the viewBox ratio so circles stay round.

Idle particles (Fuel "inflow"): spawn ~10 small dots near a center, give each a random `--tx/--ty` toward the core, and a slow random duration (6 to 11s) with a negative delay so they are mid-flight on load. Calm and few beats fast and many.

```css
.p { position:absolute; width:3px; height:3px; border-radius:50%; background:#A7F3D0;
  box-shadow:0 0 5px rgba(167,243,208,.8); opacity:0;
  animation: inflow var(--dur,8s) cubic-bezier(0.5,0,0.8,1) infinite var(--delay,0s); }
@keyframes inflow {
  0%{opacity:0;transform:translate(0,0) scale(1)} 12%{opacity:.9} 78%{opacity:.85}
  96%{opacity:0;transform:translate(var(--tx),var(--ty)) scale(.4)} 100%{opacity:0}
}
@media (prefers-reduced-motion: reduce) { .p { display:none } .base,.trend,.orb { animation:none } }
```

---

## 5. Staggered question / list entrances (the quiz feel)

When several items appear together (options, list rows, words of a title), they cascade in. The driver is a per-item delay fed through a CSS custom property, NOT `animation-delay` directly. Why: if a later "pick" bounce reuses `animation-delay`, the entrance delay would also delay the bounce and the item would seem to vanish. Keep entrance timing on `--enter-delay`, leave `animation-delay` free for the pick.

```css
.opt {
  opacity:0;
  animation: optRise 0.5s var(--ease-premium) both;
  animation-delay: var(--enter-delay, 0s);     /* entrance timing rides here */
}
@keyframes optRise { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }

/* a springier variant (the "deal" personality): slight rotate, overshoot */
.opt-deal {
  opacity:0;
  animation: optDeal 0.56s var(--spring) both;
  animation-delay: var(--enter-delay, 0s);
}
@keyframes optDeal {
  0%  { opacity:0; transform:translateY(20px) scale(.95) rotate(var(--rot,-2deg)); }
  100%{ opacity:1; transform:translateY(0) scale(1) rotate(0); }
}
```

```js
// stagger: title settles first, then options cascade ~55ms apart
const titleSettle = 0.14;
document.querySelectorAll('.opt').forEach((el, i) => {
  el.style.setProperty('--enter-delay', (titleSettle + i * 0.055) + 's');
  el.style.setProperty('--rot', i % 2 ? '2deg' : '-2deg');  // only if using optDeal
});
```

Per-word title reveal (rise + de-blur, the premium "focus pull"). Wrap each word in a span, stagger ~55ms:

```css
.word { display:inline-block; white-space:pre; opacity:0;
  animation: wordIn 0.5s var(--ease-premium) both;
  animation-delay: var(--enter-delay, 0s);     /* entrance timing rides here, same as .opt */
}
@keyframes wordIn { from{opacity:0;transform:translateY(12px);filter:blur(4px)} to{opacity:1;transform:translateY(0);filter:blur(0)} }
```
```js
// set the concrete per-word delay on --enter-delay, leave animation-delay free for a later pick
title.innerHTML = text.split(' ').map((w,i) =>
  `<span class="word" style="--enter-delay:${0.04 + i*0.055}s">${w} </span>`).join('');
```

Pick / select feedback (fires the instant the user taps, overshoots, settles). Make it a separate class with its own short spring so it visibly "clicks" before any auto-advance:

```css
.opt.picked { animation: pickPop 0.3s var(--ease-premium); }
@keyframes pickPop {
  0%{transform:scale(1)} 50%{transform:scale(1.015); box-shadow:0 0 16px -10px var(--mint-glow)} 100%{transform:scale(1)}
}
/* a check mark bursting in on pick */
@keyframes checkBurst { 0%{opacity:0;transform:scale(.3)} 45%{opacity:1;transform:scale(1.2)} 70%{transform:scale(.92)} 100%{opacity:1;transform:scale(1)} }
```

Important craft note from the real engine: once an entrance has played (~1.1s), strip the entrance classes from the DOM. A resting element still carrying a `fill: both` "from opacity:0" animation can get re-rasterized by a sibling's bounce and flash back to its hidden first frame. After settle, set the class to empty.

Slider "sweep" entrance: never animate the fill `width` or the handle `left` (that thrashes layout every frame). Instead `scaleX` the fill from 0 to 1 with `transform-origin:left`, and `translateX` the handle across the track, both on `--ease-out-soft` over 1s. Count the number up on a matched quintic ease-out (`1 - (1-k)^5`) so the value lands exactly as the handle arrives. The handle then does a small landing pop (scale 1.18 + a pre-blurred glow layer fading in, `--ease-premium`, 0.5s). Any pointer interaction cancels the sweep so dragging is immediate.

```css
.track  { position:relative; height:6px; border-radius:999px; background:rgba(255,255,255,0.12); }
.fill   { height:100%; border-radius:999px; background:var(--mint); transform-origin:left;
  transform:scaleX(0); animation: fillSweep 1s var(--ease-out-soft) forwards; }
.handle { position:absolute; top:50%; left:0; width:16px; height:16px; margin:-8px 0 0 -8px;
  border-radius:50%; background:var(--mint);
  transform:translateX(0); animation: handleSweep 1s var(--ease-out-soft) forwards; }
@keyframes fillSweep   { to { transform:scaleX(1); } }
@keyframes handleSweep { to { transform:translateX(var(--track-w,100%)); } }   /* set --track-w in px from JS */
```

---

## 6. Reveal-on-scroll (do the intro when seen, not on load)

For taller tiles, hold the dramatic entrance until the element scrolls into view. Use IntersectionObserver, add a `.play` class, and gate every keyframe behind it. Falls back to playing immediately if reduced-motion or no IO.

```css
.climbline { stroke-dashoffset: var(--len); }
.play .climbline { animation: drawOn 1.7s var(--ease) .25s forwards; }
.play .cdot { animation: pop .42s var(--spring) both; }
.arrive { opacity:0; }
.arrive.play { animation: arrive 1.05s var(--spring) both; }
@keyframes arrive {
  0%  { opacity:0; transform:translateY(28px) scale(.965); filter:blur(8px); }
  60% { opacity:1; filter:blur(0); }
  100%{ opacity:1; transform:none; filter:blur(0); }
}
```
```js
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
if ('IntersectionObserver' in window && !reduce) {
  const io = new IntersectionObserver((ents) => ents.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('play'); io.unobserve(e.target); }
  }), { threshold: 0.32 });
  document.querySelectorAll('.arrive, .climb').forEach(el => io.observe(el));
} else {
  document.querySelectorAll('.arrive, .climb').forEach(el => el.classList.add('play'));
}
```

Lock-on / arrival flourish (the soul-c card landing): a single ring pulses once over the card as it arrives, then never again. One-shot, `forwards`, no loop.

```css
.lockring { position:absolute; inset:-1px; border-radius:20px; border:1px solid var(--mint-hi); opacity:0; pointer-events:none; }
.play .lockring { animation: lock 1.4s var(--ease) .35s 1 both; }
@keyframes lock { 0%{opacity:0;transform:scale(1.04)} 30%{opacity:.7} 100%{opacity:0;transform:scale(1)} }
```

A pulsing status dot (the "live signal" eyebrow dot) is cheap, on-brand life for any header:

```css
.dot { width:5px; height:5px; border-radius:50%; background:var(--mint); box-shadow:0 0 9px var(--mint);
  animation: dotPulse 2.6s ease-in-out infinite; }
@keyframes dotPulse { 0%,100%{opacity:.55;transform:scale(.85)} 50%{opacity:1;transform:scale(1.15)} }
```

---

## 7. Reduced-motion: non-negotiable

Every tile MUST honor `prefers-reduced-motion: reduce`. The pattern: kill animations + transitions, but leave content fully visible and finished (no hidden first-frame).

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
  /* finish anything that animates from a hidden state */
  .word, .opt, .opt-deal, .arrive { opacity: 1 !important; transform: none !important; filter: none !important; }
  .draw, .climbline { stroke-dashoffset: 0 !important; }   /* show the full line */
  .dot, .cdot { opacity: .9 !important; transform: scale(1) !important; }
  .scan, .p { display: none; }                              /* drop pure-decoration motion */
  .cozy-bar span { width: 100%; opacity: .5; }              /* calm static fill */
}
```

Also gate JS-driven motion at the top:
```js
const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!reduce) { /* spawn particles, schedule bursts, start sweeps */ }
```

---

## Cheat sheet

- Signature ease: `cubic-bezier(0.16, 1, 0.3, 1)`. Overshoot/pop ease: `cubic-bezier(0.34, 1.56, 0.64, 1)`.
- Line draws on: `pathLength="100"` + dash 100 -> 0.
- Rings/orbs: expand inside-out once, then slow-breathe forever (6.5s to 10s).
- Dots: scale from .4 -> overshoot 1.35 -> settle 1, staggered to ride the line.
- Lists/words: cascade ~55ms apart, entrance delay on `--enter-delay` (keep `animation-delay` free for the pick bounce).
- Intro plays ONCE (`forwards`); only glows/breathes loop, slowly. Never strobe.
- Reveal-on-scroll via IntersectionObserver + a `.play` class.
- Always `prefers-reduced-motion: reduce`, content stays visible.
