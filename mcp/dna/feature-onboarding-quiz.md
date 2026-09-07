# Onboarding / Quiz DNA (sealed-HTML recipes)

The Vitality intake quiz: one question per screen, a cozy springy entrance, one
bespoke widget per question, a named-section progress stepper, and a celebration
done-screen. Below are copy-paste pieces for a single sealed HTML tile. Plain
HTML/CSS/vanilla-JS/inline-SVG only. No libraries.

Color law: mint/azure = good, amber = caution, never red for non-destructive
states. Mint is the accent; amber only for warnings.

## Tokens (paste once in `<style>`)

```css
:root{
  --bg:#000; --bg-elevated:#0a0a0a; --fg:#fff;
  --mint:#6EE7B7; --mint-hover:#5dd6a6; --mint-deep:#1f4d3d;
  --mint-glow:rgba(110,231,183,.4); --mint-ink:#042a1c;
  --amber:#F59E0B;
  --muted:rgba(255,255,255,.5); --muted-strong:rgba(255,255,255,.7);
  --border:rgba(255,255,255,.08); --border-strong:rgba(255,255,255,.16);
  --card:rgba(255,255,255,.02);
  --ease:cubic-bezier(.2,.8,.2,1);
  --ease-premium:cubic-bezier(.16,1,.3,1);     /* signature easing */
  --ease-out-soft:cubic-bezier(.32,.72,0,1);
  --spring:cubic-bezier(.34,1.56,.64,1);       /* the cozy overshoot */
  --serif:'Times New Roman',Georgia,serif;
  --mono:ui-monospace,monospace;
}
body{background:var(--bg);color:var(--fg);font-family:-apple-system,'Segoe UI',sans-serif}
```

Two recurring fonts: titles + answer labels are **italic serif**; eyebrows /
counters / units are **uppercase mono with wide letter-spacing**.

## The dialog shell

Floating card over a blurred backdrop, mint aurora wash at the top edge, drifting
particles. The question body lives in the middle, footer pinned to the bottom.

```html
<div class="ov">
  <div class="dlg">
    <div class="atmos" aria-hidden></div>
    <div class="parts" id="parts" aria-hidden></div>
    <button class="x" aria-label="Cancel">&times;</button>
    <div class="shell">
      <div class="stepper" id="stepper"></div>
      <h2 class="title" id="title"></h2>
      <div class="body" id="body"></div>
      <div class="foot">
        <button class="back" id="back">cancel</button>
        <button class="next" id="next" disabled>continue <span aria-hidden>&rarr;</span></button>
      </div>
    </div>
  </div>
</div>
```

```css
.ov{position:fixed;inset:0;z-index:110;display:flex;align-items:center;justify-content:center;
  padding:1rem;background:rgba(4,6,10,.55);backdrop-filter:blur(22px) saturate(140%);
  -webkit-backdrop-filter:blur(22px) saturate(140%);animation:oin .24s var(--ease-premium)}
@keyframes oin{from{opacity:0}to{opacity:1}}
.dlg{position:relative;width:100%;max-width:760px;min-height:min(82vh,480px);box-sizing:border-box;
  display:flex;flex-direction:column;overflow:hidden;isolation:isolate;border-radius:24px;
  border:1px solid var(--border-strong);
  background:radial-gradient(120% 60% at 50% 0%,rgba(110,231,183,.08),transparent 55%),var(--bg-elevated);
  box-shadow:0 32px 100px rgba(0,0,0,.75),0 0 0 1px rgba(110,231,183,.08),0 0 80px -20px rgba(110,231,183,.18);
  animation:din .38s var(--ease-premium)}
@keyframes din{from{opacity:0;transform:translateY(12px) scale(.99)}to{opacity:1;transform:none}}
.atmos{position:absolute;inset:0;z-index:0;pointer-events:none;background-image:
  radial-gradient(80% 50% at 50% 0%,rgba(110,231,183,.14),rgba(110,231,183,.04) 40%,transparent 75%),
  radial-gradient(60% 40% at 50% 100%,rgba(31,77,61,.5),transparent 70%)}
.parts{position:absolute;inset:0;z-index:1;pointer-events:none;overflow:hidden}
.parts span{position:absolute;border-radius:50%;background:rgba(233,239,233,.7);
  box-shadow:0 0 6px rgba(167,243,208,.5);animation:drift linear infinite}
@keyframes drift{0%{transform:translate3d(0,0,0);opacity:0}10%{opacity:.65}90%{opacity:.5}
  100%{transform:translate3d(var(--dx,12px),var(--dy,-80vh),0);opacity:0}}
.x{position:absolute;top:1rem;right:1rem;z-index:3;width:36px;height:36px;border-radius:999px;
  background:rgba(0,0,0,.3);border:1px solid var(--border);color:var(--muted-strong);
  font-size:22px;line-height:1;cursor:pointer;transition:color .18s,background .18s,border-color .18s}
.x:hover{color:var(--fg);background:rgba(0,0,0,.5);border-color:var(--border-strong)}
.shell{position:relative;z-index:2;display:flex;flex-direction:column;flex:1;gap:1.5rem;padding:2rem 2rem 1.5rem}
.title{margin:0;max-width:28ch;font-family:var(--serif);font-style:italic;font-weight:400;
  font-size:clamp(1.6rem,3.6vw,2.25rem);letter-spacing:-.02em;line-height:1.15;color:var(--fg)}
.body{flex:1;display:flex;flex-direction:column;gap:1rem;min-height:200px;animation:swapIn .38s var(--ease-premium)}
@keyframes swapIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.foot{display:flex;justify-content:space-between;align-items:center;gap:.75rem;
  padding-top:1rem;border-top:1px solid var(--border);margin-top:auto}
.back{padding:.5rem 1rem;background:transparent;border:1px solid transparent;border-radius:999px;
  color:var(--muted);font-family:var(--serif);font-style:italic;font-size:.875rem;cursor:pointer;transition:color .18s,border-color .18s}
.back:hover{color:var(--fg);border-color:var(--border)}
.next{display:inline-flex;align-items:center;gap:6px;padding:11px 24px;border:none;border-radius:999px;
  background:var(--mint);color:var(--bg);font-size:.875rem;font-weight:600;cursor:pointer;
  box-shadow:0 0 24px -8px var(--mint-glow);transition:background .18s,transform .18s,box-shadow .18s}
.next:hover:not(:disabled){background:var(--mint-hover);transform:translateY(-1px)}
.next:disabled{opacity:.35;cursor:not-allowed;box-shadow:none}
```

Drift particles (run once on load):

```js
const root=document.getElementById('parts');
for(let i=0;i<14;i++){const s=document.createElement('span');
  s.style.left=Math.random()*100+'%';s.style.top=50+Math.random()*50+'%';
  const sz=1+Math.random()*1.4;s.style.width=s.style.height=sz+'px';
  const d=22+Math.random()*24;s.style.animationDuration=d+'s';s.style.animationDelay=-Math.random()*d+'s';
  s.style.setProperty('--dx',(Math.random()*28-14)+'px');
  s.style.setProperty('--dy',-(60+Math.random()*50)+'vh');root.appendChild(s);}
```

## Progress: the named-section stepper

Not a global "X of Y" count (that balloons when branch questions unlock). Instead
one labeled segment per chapter; the active one fills as you move through its
questions, finished ones sit full.

```html
<div class="stepper">
  <div class="seg done"><span class="segName">you</span><span class="segTrack"><span class="segFill" style="width:100%"></span></span></div>
  <div class="seg active"><span class="segName">training</span><span class="segTrack"><span class="segFill" style="width:50%"></span></span></div>
  <div class="seg"><span class="segName">goals</span><span class="segTrack"><span class="segFill" style="width:0"></span></span></div>
</div>
```

```css
.stepper{display:flex;gap:10px;width:100%}
.seg{flex:1;min-width:0}
.segName{display:block;margin-bottom:8px;font-family:var(--mono);font-size:9.5px;font-weight:500;
  letter-spacing:.18em;text-transform:uppercase;color:var(--muted);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .18s}
.seg.active .segName,.seg.done .segName{color:var(--mint)}
.segTrack{display:block;height:3px;border-radius:999px;background:var(--border);overflow:hidden}
.segFill{display:block;height:100%;width:0;border-radius:999px;background:var(--mint);
  box-shadow:0 0 12px var(--mint-glow);transition:width .45s var(--ease-premium)}
```

For a simpler per-question dot/segment bar (the classic X-of-N look), use a row of
flex segments; light done ones at `rgba(110,231,183,.55)`, the current one at full
`--mint` with `box-shadow:0 0 12px var(--mint-glow)`.

## Springy entrance choreography

Every question replays an entrance: the title de-blurs in (per-word or as one
block), then options cascade up one-by-one, then each option's icon springs a beat
later. Seven "personalities" cycle by question index so the flow never feels
mechanical. Keep it cozy: the spring overshoot is `--spring`.

The trick that keeps it smooth: stagger via a CSS variable `--enter-delay`, NOT
`animation-delay` (so a later pick-bounce on the same element fires instantly and
isn't pushed back).

```css
/* title, per-word reveal (rise + focus-pull de-blur) */
.word{display:inline-block;white-space:pre;opacity:0;animation:wordPop .56s var(--spring) both}
@keyframes wordPop{0%{opacity:0;transform:translateY(13px) scale(.92);filter:blur(3px)}
  60%{opacity:1;transform:translateY(0) scale(1.03);filter:blur(0)}100%{opacity:1;transform:none}}
/* title as one block (alt personality) */
.titleRise{display:inline-block;opacity:0;animation:tRise .52s var(--ease-premium) both}
@keyframes tRise{0%{opacity:0;transform:translateY(12px);filter:blur(4px)}100%{opacity:1;transform:none;filter:blur(0)}}
.titleFlip{display:inline-block;transform-origin:top;opacity:0;animation:tFlip .62s var(--spring) both}
@keyframes tFlip{0%{opacity:0;transform:perspective(820px) rotateX(-72deg);filter:blur(3px)}
  60%{opacity:1;transform:perspective(820px) rotateX(7deg);filter:blur(0)}100%{opacity:1;transform:none}}

/* options cascade up, staggered by --enter-delay */
.entOpt{opacity:0;animation:oRise .5s var(--ease-premium) both;animation-delay:var(--enter-delay,0s)}
@keyframes oRise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
/* "deal" personality: cards fan in with a slight rotation */
.entDeal{opacity:0;animation:oDeal .56s var(--spring) both;animation-delay:var(--enter-delay,0s)}
@keyframes oDeal{0%{opacity:0;transform:translateY(20px) scale(.95) rotate(var(--rot,-2deg))}
  100%{opacity:1;transform:none}}

/* an option icon springs in a beat after the option lands */
.entIco{opacity:0;animation:icoPop .5s var(--spring) both}
@keyframes icoPop{0%{opacity:0;transform:scale(.3) rotate(-12deg)}
  70%{opacity:1;transform:scale(1.18) rotate(4deg)}100%{opacity:1;transform:none}}

@media(prefers-reduced-motion:reduce){
  .word,.titleRise,.titleFlip,.entOpt,.entDeal,.entIco{animation:none;opacity:1;transform:none;filter:none}
}
```

Wire the title + stagger in JS:

```js
function renderTitle(text){
  const t=document.getElementById('title');t.innerHTML='';
  text.split(' ').forEach((w,i)=>{const s=document.createElement('span');
    s.className='word';s.style.animationDelay=(i*0.055)+'s';s.textContent=w+' ';t.appendChild(s);});
}
// title settles in ~ words*0.055 + 0.14s; first option starts then, +0.055s each:
function optDelay(i,wordCount){return (wordCount*0.055+0.14) + i*0.055;}
// per option: el.style.setProperty('--enter-delay', optDelay(i,n)+'s');
//             icon: ico.style.animationDelay = (optDelay(i,n)+0.16)+'s';
```

Important: once the entrance has settled (a ~1100ms timer, or the moment the user
picks), strip the entrance classes off the DOM. A resting `fill:both` animation can
get re-rasterized to its hidden first frame by a sibling repaint, which flickers
icons. Remove the class, don't just let it finish.

## Bespoke widget 1: segmented single-select tiles

Big centered icon tiles, 2 or 3 across. Picking lights a mint check badge that pops
in, fills the card, and bounces the whole tile. Single-select auto-advances ~520ms
after pick (so the pop is seen); set a flag to require the Continue button instead.

```html
<div class="tiles">
  <button class="tile" data-v="cut">
    <span class="tileIco" aria-hidden><!-- inline svg --></span>
    <span class="tileLabel">lose fat</span><span class="tileSub">lean down</span>
  </button>
  <!-- more tiles -->
</div>
```

```css
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.tile{position:relative;cursor:pointer;border:1px solid var(--border-strong);border-radius:16px;
  padding:24px 16px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;
  background:rgba(255,255,255,.02);color:var(--fg);font-family:inherit;
  transition:border-color .25s var(--ease-premium),transform .25s var(--ease-premium),background .25s var(--ease-premium)}
.tile:hover{transform:translateY(-3px);border-color:var(--mint);
  box-shadow:0 0 0 1px rgba(110,231,183,.35),0 12px 28px -18px var(--mint-glow)}
.tile.on{border-color:var(--mint);background:rgba(110,231,183,.07);box-shadow:0 0 36px -14px var(--mint-glow)}
.tile.just{animation:tilePop .3s var(--ease-premium)}      /* pick bounce */
@keyframes tilePop{0%{transform:scale(1)}50%{transform:scale(1.03);box-shadow:0 0 18px -10px var(--mint-glow)}100%{transform:scale(1)}}
.tileIco{width:44px;height:44px;color:var(--mint);display:grid;place-items:center}
.tileIco svg{width:100%;height:100%}
.tileLabel{font-family:var(--serif);font-style:italic;font-size:1.3rem}
.tileSub{font-size:.8rem;color:var(--muted)}
/* mint check badge for multi-select tiles (springs in via --spring) */
.tileCheck{position:absolute;top:11px;right:11px;width:21px;height:21px;border-radius:50%;
  background:var(--mint);display:grid;place-items:center;color:var(--mint-ink);
  transform:scale(0);transition:transform .24s var(--spring)}
.tile.on .tileCheck{transform:scale(1)}
.tileCheck svg{width:11px;height:11px}
@media(max-width:640px){.tiles{grid-template-columns:1fr}}
```

The check is an inline SVG (never a unicode checkmark):

```html
<span class="tileCheck" aria-hidden>
  <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor"
       stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M 3 8.5 L 7 12 L 13 4.5"/></svg>
</span>
```

```js
document.querySelectorAll('.tile').forEach(t=>t.addEventListener('click',()=>{
  document.querySelectorAll('.tile').forEach(x=>x.classList.remove('on'));
  t.classList.add('on','just');
  setTimeout(()=>t.classList.remove('just'),320);
  setTimeout(()=>advance(),520);   // single-select auto-advance
}));
```

For multi-select, toggle `.on` per tile and show the Continue button; cap selections
and dim over-cap tiles (`opacity:.35;cursor:not-allowed`). For an exclusive option
like "none", picking it clears the rest.

## Bespoke widget 2: slider (drag a dot on a line)

A big italic-serif readout, a draggable mint dot on a thin track, ticks under it. On
entrance the dot sweeps from the start and the number counts up on the same eased
curve, then "clicks into place" with a soft pop. After that, dragging tracks the
pointer exactly.

```html
<div class="scale" id="scale">
  <div class="scaleRead"><span class="scaleN" id="scaleN">4</span><span class="scaleU">days a week</span></div>
  <div class="scaleLine" id="line">
    <div class="scaleFill" id="fill"></div>
    <div class="scaleDot" id="dot"></div>
  </div>
  <div class="scaleTicks" id="ticks"></div>
</div>
```

```css
.scale{padding:4px 2px;touch-action:none}
.scaleRead{display:flex;align-items:baseline;gap:12px;margin-bottom:24px}
.scaleN{font-family:var(--serif);font-size:3.4rem;line-height:.9;color:var(--mint);font-variant-numeric:tabular-nums}
.scaleU{font-family:var(--mono);font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted-strong)}
.scaleLine{position:relative;height:4px;border-radius:99px;background:var(--border-strong);cursor:pointer;margin:18px 13px}
.scaleFill{position:absolute;left:0;top:0;height:100%;border-radius:99px;
  background:linear-gradient(90deg,var(--mint-deep),var(--mint));box-shadow:0 0 12px var(--mint-glow)}
.scaleDot{position:absolute;top:50%;width:26px;height:26px;border-radius:50%;background:var(--mint);
  transform:translate(-50%,-50%);cursor:grab;
  box-shadow:0 0 0 6px rgba(110,231,183,.12),0 0 22px var(--mint-glow);transition:left .1s var(--ease-premium)}
.scaleDot:active{cursor:grabbing}
/* entrance sweep: dot + fill glide together over 1s, removed once swept */
.scale.sweep .scaleFill,.scale.sweep .scaleDot{transition:left 1s var(--ease-out-soft),width 1s var(--ease-out-soft)}
.scaleDot.land{animation:land .5s var(--ease-premium)}
@keyframes land{0%{transform:translate(-50%,-50%) scale(1)}
  42%{transform:translate(-50%,-50%) scale(1.18);box-shadow:0 0 0 10px rgba(110,231,183,.18),0 0 34px var(--mint-glow)}
  100%{transform:translate(-50%,-50%) scale(1)}}
.scaleTicks{display:flex;justify-content:space-between;margin:0 13px}
.scaleTick{font-family:var(--mono);font-size:.66rem;color:var(--muted);transition:color .15s}
.scaleTick.on{color:var(--mint)}
@media(prefers-reduced-motion:reduce){.scaleDot.land{animation:none}.scale.sweep .scaleFill,.scale.sweep .scaleDot{transition:none}}
```

```js
const MIN=1,MAX=7;let val=4,drag=false,swept=false;
const line=document.getElementById('line'),dot=document.getElementById('dot'),
  fill=document.getElementById('fill'),numEl=document.getElementById('scaleN'),scale=document.getElementById('scale');
// ticks
const tk=document.getElementById('ticks');
for(let v=MIN;v<=MAX;v++){const s=document.createElement('span');s.className='scaleTick';s.dataset.v=v;s.textContent=v;tk.appendChild(s);}
function paint(v){const pct=(v-MIN)/(MAX-MIN)*100;fill.style.width=pct+'%';dot.style.left=pct+'%';
  numEl.textContent=Math.round(v);
  tk.querySelectorAll('.scaleTick').forEach(t=>t.classList.toggle('on',+t.dataset.v<=v));}
function endSweep(){if(!swept){swept=true;scale.classList.remove('sweep');dot.classList.remove('land');}}
// entrance: snap to start, then glide to value + count up
scale.classList.add('sweep');paint(MIN);
requestAnimationFrame(()=>paint(val));
const t0=performance.now(),dur=1000;
(function tick(t){const k=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-k,5);
  numEl.textContent=Math.round(MIN+(val-MIN)*e);
  if(k<1)requestAnimationFrame(tick);
  else{swept=true;scale.classList.remove('sweep');dot.classList.add('land');setTimeout(()=>dot.classList.remove('land'),520);}})(t0);
function fromX(x){const r=line.getBoundingClientRect();const f=Math.max(0,Math.min(1,(x-r.left)/r.width));
  val=Math.round(MIN+f*(MAX-MIN));paint(val);}
line.addEventListener('pointerdown',e=>{endSweep();line.setPointerCapture(e.pointerId);drag=true;fromX(e.clientX);});
line.addEventListener('pointermove',e=>{if(drag)fromX(e.clientX);});
line.addEventListener('pointerup',()=>{drag=false;});
```

## Bespoke widget 3: chip-grid multi-select

Pill chips that wrap; tapping toggles a mint fill. Good for "pick what applies".

```html
<div class="chips">
  <button class="chip" data-v="protein">more protein</button>
  <button class="chip" data-v="sleep">better sleep</button>
  <button class="chip" data-v="water">drink water</button>
</div>
```

```css
.chips{display:flex;flex-wrap:wrap;gap:.5rem}
.chip{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:999px;
  background:var(--card);border:1px solid var(--border);color:var(--fg);font-family:inherit;font-size:.875rem;cursor:pointer;
  transition:border-color .18s var(--ease-premium),background .18s var(--ease-premium),color .18s,box-shadow .18s,transform .12s}
.chip:hover{border-color:var(--border-strong);transform:translateY(-1px)}
.chip.on{border-color:var(--mint);background:rgba(110,231,183,.12);color:var(--mint);
  box-shadow:0 0 0 1px rgba(110,231,183,.22),0 0 20px -10px var(--mint-glow)}
.chip.dis{opacity:.35;cursor:not-allowed}
```

```js
document.querySelectorAll('.chip').forEach(c=>c.addEventListener('click',()=>{
  c.classList.toggle('on');
  const any=document.querySelectorAll('.chip.on').length>0;
  const next=document.getElementById('next');next.disabled=!any;   // multi needs Continue
}));
```

Optional inline check inside an active chip (SVG, never a unicode tick):
`<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M 3 8.5 L 7 12 L 13 4.5"/></svg>`.

There is also a list-row "Choice" variant (icon left, label + sub, check badge top-right)
and a "meter" row (4 pips on the right for things like "reps left in the tank").
Same card styling as `.tile`; lay it out as a 2-col grid or full-width rows.

## The completion / done screen

Shown after the final answer saves. Centered crystal-style halo, a thin-rule
eyebrow, an italic-serif headline with a white-to-mint gradient, optional sub line,
a mint pill CTA, and a quiet ghost secondary link. Enter key fires the primary CTA.

```html
<div class="done">
  <div class="gem" aria-hidden>
    <svg viewBox="0 0 120 120" width="120" height="120" fill="none" stroke="var(--mint)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="60" cy="60" r="48" stroke="rgba(110,231,183,.25)"/>
      <path d="M 40 62 L 54 76 L 82 44"/>
    </svg>
  </div>
  <span class="eyebrow"><span class="rule" aria-hidden></span> one step closer</span>
  <h2 class="dHead"><em>you're all set</em></h2>
  <p class="dSub">your plan is ready. let's get into it.</p>
  <button class="cta" autofocus>let's go <span aria-hidden>&rarr;</span></button>
  <button class="ghost">back to checklist</button>
</div>
```

```css
.done{position:fixed;inset:0;z-index:80;display:flex;flex-direction:column;align-items:center;
  justify-content:center;text-align:center;padding:48px 24px;background:var(--bg);overflow:hidden;
  animation:shellFade .45s ease-out both}
@keyframes shellFade{from{opacity:0}to{opacity:1}}
.gem{position:relative;width:clamp(180px,24vmin,220px);height:clamp(180px,24vmin,220px);margin-bottom:24px;
  filter:drop-shadow(0 0 50px rgba(110,231,183,.22)) drop-shadow(0 0 110px rgba(110,231,183,.08));
  animation:gemPop .75s cubic-bezier(.22,1.6,.36,1) both,gemHalo 3.9s ease-in-out .75s infinite}
.gem svg{width:100%;height:100%}
@keyframes gemPop{0%{transform:scale(.55);opacity:0}60%{transform:scale(1.06);opacity:1}100%{transform:scale(1);opacity:1}}
@keyframes gemHalo{0%,100%{filter:drop-shadow(0 0 40px rgba(110,231,183,.16)) drop-shadow(0 0 100px rgba(110,231,183,.06))}
  50%{filter:drop-shadow(0 0 70px rgba(110,231,183,.30)) drop-shadow(0 0 140px rgba(110,231,183,.12))}}
.eyebrow{display:inline-flex;align-items:center;gap:10px;margin-bottom:14px;
  font-size:11px;letter-spacing:.18em;text-transform:lowercase;color:rgba(255,255,255,.55)}
.rule{width:22px;height:1px;background:rgba(110,231,183,.6)}
.dHead{margin:0 0 16px;font-family:var(--serif);font-style:italic;font-weight:400;
  font-size:clamp(28px,5vw,40px);line-height:1.12;letter-spacing:-.01em;color:rgba(255,255,255,.96)}
.dHead em{font-style:italic;background:linear-gradient(180deg,#fff,rgba(110,231,183,.92));
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.dSub{max-width:380px;margin:0 0 30px;font-size:15px;line-height:1.55;color:rgba(255,255,255,.62)}
.cta{display:inline-flex;align-items:center;gap:10px;padding:13px 28px;border:none;border-radius:999px;
  background:var(--mint);color:rgba(8,12,11,.96);font-size:14px;font-weight:500;letter-spacing:.02em;cursor:pointer;
  box-shadow:0 0 0 1px rgba(110,231,183,.55),0 12px 30px -10px rgba(110,231,183,.55);
  transition:transform .18s,background .18s}
.cta:hover{transform:translateY(-1px);background:var(--mint-hover)}
.ghost{margin-top:14px;background:none;border:none;padding:4px 8px;font-family:var(--serif);font-style:italic;
  font-size:14px;color:rgba(255,255,255,.55);cursor:pointer;transition:color .18s}
.ghost:hover{color:var(--mint)}
@media(prefers-reduced-motion:reduce){.gem,.done{animation:none}}
```

```js
document.addEventListener('keydown',e=>{if(e.key==='Enter')document.querySelector('.cta')?.click();});
```

## Patterns worth keeping

- One question per screen. Title is italic serif, eyebrow/units are uppercase mono.
- Single-select auto-advances ~520ms after pick (the pop is the reward, then it
  moves). Multi-select waits for an explicit Continue button.
- Stagger entrances via `--enter-delay`, not `animation-delay`, so pick-bounces stay
  instant. Strip entrance classes after they settle to kill icon flicker.
- Picked state always shows a quiet persistent check (so going back reads clearly).
- All checks are inline SVG, never unicode. Color stays mint; amber only for caution.
- Every animation has a `prefers-reduced-motion:reduce` fallback to instant + visible.
- Esc cancels, Enter confirms the done-screen CTA.
