# Vitality feature interactions (sealed-tile recipes)

The motions that make Vitality feel premium, distilled into vanilla HTML, CSS,
and JS you can paste into one sealed tile file. No libraries, no React.
Source: app/app/fuel/macros/MyMacrosSheet + components/Quiz.tsx + app/globals.css.

## Tokens to inline first

These come from globals.css. A tile has no shared stylesheet, so paste them.

```css
:root{
  --bg:#000; --fg:#fff;
  --mint:#6EE7B7; --mint-hi:#a7f3d0; --mint-hover:#5dd6a6; --mint-ink:#042a1c;
  --mint-glow:rgba(110,231,183,.4); --amber:#F59E0B;
  --muted:rgba(255,255,255,.5); --muted-strong:rgba(255,255,255,.7);
  --border:rgba(255,255,255,.08); --border-strong:rgba(255,255,255,.16);
  --ease:cubic-bezier(.2,.8,.2,1);
  --ease-premium:cubic-bezier(.16,1,.3,1);   /* the signature easing */
  --ease-out-soft:cubic-bezier(.32,.72,0,1);
  --spring:cubic-bezier(.34,1.56,.64,1);     /* overshoot bounce */
  --duration-fast:120ms; --duration:180ms;
}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--fg);font-family:Inter,system-ui,sans-serif}
```

The look: near-black surface, hairline white borders, mint only as the accent
for "good / chosen / live". Headlines use an italic serif; labels use uppercase
mono with wide letter-spacing. Every meaningful state change rides `--ease-premium`.

## 1. Bottom-sheet entrance (slide + spring + grabber)

A dimmed scrim fades in. The sheet rises and settles with a soft overshoot, a
mint glow washes the top edge, and a grabber handle reads as draggable.

```html
<div class="scrim" id="scrim">
  <div class="sheet" id="sheet">
    <span class="glow" aria-hidden="true"></span>
    <span class="grabber" aria-hidden="true"></span>
    <div class="eyebrow">Fuel · Add to today</div>
    <h2 class="sheet-title"><em>My Macros</em></h2>
    <div class="sheet-body"><!-- staggered rows go here --></div>
  </div>
</div>
```

```css
.scrim{position:fixed;inset:0;z-index:70;display:flex;align-items:flex-end;
  justify-content:center;background:rgba(2,4,7,.66);
  -webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);
  animation:scrimFade .28s var(--ease) forwards}
@keyframes scrimFade{from{opacity:0}to{opacity:1}}
.sheet{position:relative;width:100%;max-width:560px;max-height:88vh;overflow-y:auto;
  padding:22px 24px 26px;border-radius:28px 28px 0 0;
  border:1px solid var(--border-strong);
  background:linear-gradient(180deg,rgba(13,20,16,.97),rgba(6,10,8,.99));
  box-shadow:0 -40px 120px -40px #000;scrollbar-width:none;
  animation:sheetRise .42s var(--ease-premium) forwards}
.sheet::-webkit-scrollbar{display:none}
/* desktop: center it instead and rise from below with a gentle scale */
@media(min-width:600px){.scrim{align-items:center;padding:20px}
  .sheet{border-radius:28px}}
@keyframes sheetRise{from{opacity:0;transform:translateY(40px) scale(.98)}
  to{opacity:1;transform:none}}
.grabber{position:absolute;top:9px;left:50%;transform:translateX(-50%);
  width:38px;height:4px;border-radius:999px;background:rgba(255,255,255,.22)}
.glow{position:absolute;inset:0 0 auto;height:130px;pointer-events:none;
  background:radial-gradient(80% 100% at 50% 0,rgba(110,231,183,.09),transparent 70%)}
.eyebrow{font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.32em;
  text-transform:uppercase;color:var(--mint);opacity:.85;margin-top:8px}
.sheet-title{font-family:'Instrument Serif',Georgia,serif;font-weight:400;
  font-size:33px;line-height:1;margin:7px 0 14px}
.sheet-title em{font-style:italic}
```

```js
// Open. Lock body scroll. Close on scrim tap or Escape.
const scrim = document.getElementById('scrim'), sheet = document.getElementById('sheet');
function openSheet(){ scrim.style.display='flex'; document.body.style.overflow='hidden'; }
function closeSheet(){ scrim.style.display='none'; document.body.style.overflow=''; }
scrim.addEventListener('click', closeSheet);
sheet.addEventListener('click', e => e.stopPropagation());
document.addEventListener('keydown', e => { if(e.key==='Escape') closeSheet(); });
```

Optional drag-to-dismiss the grabber: track `pointerdown` to `pointermove` dy,
translate the sheet by `dy` while positive, and on `pointerup` either snap back
(transition transform to 0) or close if dy > 120.

## 2. Staggered content reveal on open

Each row animates up and in, delayed by its index so the list "deals" itself.
Cap the delay so a long list does not crawl.

```css
.row{animation:rowIn .4s var(--ease-premium) both}
@keyframes rowIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){
  .scrim,.sheet,.row{animation:none}}
```

```js
// Stagger: 30ms per row, capped at the 10th so a big list stays snappy.
document.querySelectorAll('.row').forEach((el,i)=>{
  el.style.animationDelay = (Math.min(i,10) * 0.03) + 's';
});
```

Swapping a section (tab change) instead of opening? Re-run a short pane fade so
the new content reads as fresh: `animation:paneIn .32s var(--ease)` with
`@keyframes paneIn{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}`.

## 3. Smooth scroll container with fade edges

A scroll region whose top and bottom edges fade to black, so content melts out
instead of cutting hard. Two pinned gradient strips, scrollbar hidden.

```html
<div class="scroll-wrap">
  <span class="fade fade-top" aria-hidden="true"></span>
  <div class="scroll-area"><!-- many rows --></div>
  <span class="fade fade-bot" aria-hidden="true"></span>
</div>
```

```css
.scroll-wrap{position:relative}
.scroll-area{max-height:60vh;overflow-y:auto;scroll-behavior:smooth;
  -webkit-overflow-scrolling:touch;scrollbar-width:none;
  /* breathing room so first/last rows clear the fades */
  padding:14px 0}
.scroll-area::-webkit-scrollbar{display:none}
.fade{position:absolute;left:0;right:0;height:28px;pointer-events:none;z-index:2}
.fade-top{top:0;background:linear-gradient(180deg,rgba(6,10,8,.99),transparent)}
.fade-bot{bottom:0;background:linear-gradient(0deg,rgba(6,10,8,.99),transparent)}
```

Match the fade color to whatever surface sits behind the scroller (here the
sheet's dark base). For a horizontal strip, swap to left/right gradients and
`overflow-x:auto`.

## 4. Segmented control (pill tabs)

A horizontal row of pill tabs. The active one glows mint. The strip itself
scrolls when it overflows, with the scrollbar hidden.

```html
<div class="seg" role="tablist">
  <button class="seg-tab seg-on">Search</button>
  <button class="seg-tab">My Foods</button>
  <button class="seg-tab">Favorites</button>
</div>
```

```css
.seg{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;margin:0 0 16px;
  scrollbar-width:none}
.seg::-webkit-scrollbar{display:none}
.seg-tab{flex:0 0 auto;padding:8px 14px;border-radius:999px;
  border:1px solid var(--border);background:transparent;color:var(--muted-strong);
  font:inherit;font-weight:600;font-size:13px;cursor:pointer;white-space:nowrap;
  transition:all .2s var(--ease)}
.seg-tab:hover{color:var(--fg);border-color:var(--border-strong)}
.seg-on{background:rgba(110,231,183,.12);border-color:var(--mint);color:var(--mint-hi)}
```

```js
document.querySelectorAll('.seg-tab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    document.querySelectorAll('.seg-tab').forEach(t=>t.classList.remove('seg-on'));
    tab.classList.add('seg-on');
    // then show the matching pane and re-run the paneIn fade (section 2)
  });
});
```

## 5. Chip select / deselect with the mint check

Multi-select chips. Off = hairline outline. On = mint border, mint tint, a mint
ring glow, and a check that pops in. Tap toggles. Honor a max cap by dimming
chips that are not yet on once the cap is hit.

```html
<div class="chips">
  <button class="chip"><span class="chip-check" aria-hidden="true">
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor"
      stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 3 8.5 L 7 12 L 13 4.5"/></svg></span>Protein</button>
  <button class="chip"><span class="chip-check" aria-hidden="true"><!-- same svg --></span>Carbs</button>
</div>
```

```css
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;
  background:rgba(255,255,255,.03);border:1px solid var(--border);
  border-radius:999px;color:var(--fg);font:inherit;font-size:14px;cursor:pointer;
  transition:border-color var(--duration) var(--ease-premium),
    background var(--duration) var(--ease-premium),
    color var(--duration) var(--ease-premium),
    box-shadow var(--duration) var(--ease-premium),
    transform var(--duration-fast) var(--ease-premium)}
.chip:hover{border-color:var(--border-strong);transform:translateY(-1px)}
.chip-on{border-color:var(--mint);background:rgba(110,231,183,.12);color:var(--mint);
  box-shadow:0 0 0 1px rgba(110,231,183,.22),0 0 20px -10px var(--mint-glow)}
/* the check hides until selected, then springs in */
.chip-check{display:inline-flex;width:0;overflow:hidden;color:var(--mint);
  transform:scale(.4);opacity:0;
  transition:width .22s var(--spring),transform .22s var(--spring),opacity .18s var(--ease)}
.chip-on .chip-check{width:12px;transform:scale(1);opacity:1}
.chip-cap{opacity:.35;cursor:not-allowed}
.chip-cap:hover{border-color:var(--border);transform:none}
@media(prefers-reduced-motion:reduce){
  .chip,.chip-check{transition:none}}
```

```js
const MAX = 3; // pick up to 3
const chips = [...document.querySelectorAll('.chip')];
function syncCap(){
  const n = chips.filter(c=>c.classList.contains('chip-on')).length;
  chips.forEach(c=>c.classList.toggle('chip-cap',
    n>=MAX && !c.classList.contains('chip-on')));
}
chips.forEach(c=>c.addEventListener('click',()=>{
  if(c.classList.contains('chip-cap')) return;
  c.classList.toggle('chip-on'); syncCap();
}));
```

Single-select variant: use the same `.chip-on` styling but clear every other
chip's `chip-on` before setting the tapped one, and skip the cap logic.

## 6. Two extras worth copying

Expanding drawer (the "more, optional" reveal): animate `max-height` from 0 to a
generous cap on `--ease-premium`, and rotate a chevron 180deg.

```css
.drawer{max-height:0;overflow:hidden;transition:max-height .38s var(--ease-premium)}
.drawer-open{max-height:460px}
.chev{transition:transform .25s var(--ease)} .chev-open{transform:rotate(180deg)}
```

Spark CTA (the mint button): solid mint fill, dark ink text, a small scale-down
on press for tactile feedback.

```css
.cta{width:100%;padding:15px;border:none;border-radius:15px;background:var(--mint);
  color:var(--mint-ink);font:inherit;font-weight:700;font-size:15px;cursor:pointer;
  transition:background .2s var(--ease),transform .15s var(--ease)}
.cta:hover{background:var(--mint-hover)} .cta:active{transform:scale(.99)}
```

Always pair motion with `@media(prefers-reduced-motion:reduce){...animation:none}`.
