This is the lean motion core. For cozy loaders, tile-art choreography, quiz stagger and scroll reveals, read {section:"motion"}.

# Vitality Motion Core

The essentials every tile needs. Plain CSS / vanilla JS / inline SVG, ready to paste into a single sealed HTML tile (no React, no libraries, no build step).

The feel in one line: things arrive softly and confidently, settle with a tiny overshoot, then breathe. Never linear, never harsh, never strobing. Mint accent on near-black. Always reduced-motion safe.

---

## 1. The never-jank law

> **The buttery law.** Animate only transform and opacity, never width, height, top, left, right, bottom, margin, padding, or box-shadow in a loop or transition (because those trigger layout and paint every frame and drop below 60fps on a phone, while transform and opacity are GPU-composited). A width becomes scaleX, a position becomes translate, a glow pulse becomes opacity on a pre-blurred layer.

> **Never animate filter:blur / filter:drop-shadow in a loop.** Re-blurring every frame is the single most expensive thing a tile can do. To make a glow "breathe," stack a pre-blurred copy of the shape behind it (blurred ONCE) and cross-fade only its `opacity`.

> **Frame budget.** 60fps is about 16ms per frame, so the whole tile shares one tiny budget. Keep the number of nodes looping at once under ~12, and cap idle particles around 10. Fewer things moving calmly beats many things moving cheaply.

---

## 2. The motion tokens (paste into :root)

Vitality's exact easing + timing constants. Use the tokens, do not hand-pick random cubic-beziers.

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

## 3. The canonical entrance recipe (rise + fade, staggered)

Almost every entrance in Vitality is this: items fade up ~10px on the signature ease, cascading ~55ms apart. The stagger driver is a per-item delay fed through a CSS custom property, NOT `animation-delay` directly. Why: if a later "pick" bounce reuses `animation-delay`, the entrance delay would also delay the bounce and the item would seem to vanish. Keep entrance timing on `--enter-delay`, leave `animation-delay` free for the pick.

```css
.opt {
  opacity:0;
  animation: optRise 0.5s var(--ease-premium) both;
  animation-delay: var(--enter-delay, 0s);     /* entrance timing rides here */
}
@keyframes optRise { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
```

```js
// stagger: title settles first, then items cascade ~55ms apart
const titleSettle = 0.14;
document.querySelectorAll('.opt').forEach((el, i) => {
  el.style.setProperty('--enter-delay', (titleSettle + i * 0.055) + 's');
});
```

Springier variant for a landing "pop" (a pick, a tag, a dot arriving): overshoot past 1, then settle.

```css
/* a value/marker landing into place: spring overshoot past 1 then settle */
@keyframes pop { 0%{opacity:0;transform:scale(0)} 70%{opacity:1;transform:scale(1.35)} 100%{opacity:1;transform:scale(1)} }
.cdot { animation: pop .42s var(--spring) both; }
```

Two craft rules:
- Intro plays ONCE (`forwards` / `both`). Only glows and slow breathes loop, and slowly (6.5s to 10s). Never strobe.
- After an entrance has played (~1.1s), strip the entrance class. A resting element still carrying a `both` "from opacity:0" animation can get re-rasterized by a sibling's bounce and flash back to its hidden first frame. After settle, set the class to empty.

---

## 4. Reduced-motion: non-negotiable

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
- Durations: taps `120ms`, standard transition `180ms`, entrance lift `480ms`.
- Animate ONLY transform + opacity. Never width/height/top/left/margin/padding/box-shadow, never `filter:blur` in a loop.
- Glow "breathe" = a pre-blurred copy behind, cross-fade its `opacity` only.
- Entrance = fade up ~10px on `--ease-premium`; cascade ~55ms apart; delay on `--enter-delay`, keep `animation-delay` free for the pick bounce.
- Landings/picks pop: scale from 0/.4 -> overshoot ~1.35 -> settle 1, on `var(--spring)`.
- Intro plays ONCE (`forwards`); only glows/breathes loop, slowly (6.5s to 10s). Never strobe.
- Keep looping nodes under ~12, idle particles under ~10.
- Always `prefers-reduced-motion: reduce`, content stays visible and finished.

> Need more? For cozy loaders, tile-art intro-then-breathe choreography, quiz/word stagger, slider sweeps, and reveal-on-scroll, read the full doc: `{section:"motion"}`.
