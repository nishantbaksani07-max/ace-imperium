# Vitality celebration moments (sealed-tile recipes)

The "you did it" screens that break minimalism on purpose: a gem burst, a warm
character voice, one big payoff. Distilled into vanilla HTML, CSS, and JS you can
paste into one sealed tile file. No libraries, no React, no canvas.
Source: components/CelebrationScreen.tsx + celebrationScreen.module.css +
components/GemBurst.tsx + .module.css + docs/SKILL-celebration-screens.md.

## When to fire one

Only on a real win: first thing logged, a goal reached, a streak hit, setup
finished. The rest of the tile stays calm and minimal. The celebration is the
exception that earns its noise because it is rare.

## Tokens to inline first

A tile has no shared stylesheet, so paste these.

```css
:root{
  --bg:#000; --fg:#fff;
  --mint:#6EE7B7; --mint-hi:#a7f3d0; --mint-hover:#8af0c4; --mint-ink:#042a1c;
  --mint-glow:rgba(110,231,183,0.4);
  --muted:rgba(255,255,255,.5); --muted-strong:rgba(255,255,255,.7);
  --body:rgba(240,255,245,.78);          /* brightened body copy, reads premium */
  --spring:cubic-bezier(.34,1.56,.64,1); /* the cozy overshoot, used everywhere */
  --ease-premium:cubic-bezier(.16,1,.3,1);
}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--fg);font-family:Inter,system-ui,sans-serif}
```

## The anatomy (top to bottom, one centered stack)

```
overlay (fixed, dark, grid place-items center, fades in)
  gem hero (a glowing node) + burst layer behind it
  eyebrow      ← mono uppercase mint, with a leading rule
  title        ← serif italic, the payoff, one glowing word
  sub          ← warm one-liner in the character voice
  card         ← optional summary { key / value / chip }
  buttons      ← pill primary (with arrow) + optional mono ghost
```

Every line rides the same springy entrance on a staggered cascade. The
consistency IS the brand. Do not invent a new entrance per screen.

## 1. The celebration overlay (full recipe)

A dark overlay fades up. The gem pops in with a spring overshoot, rings and motes
loop outward behind it, then the copy cascades in line by line. One primary
action, one quiet dismiss.

```html
<div class="celebrate" id="celebrate" role="dialog" aria-modal="true">
  <div class="cel-shell">

    <div class="gem-wrap" aria-hidden="true">
      <span class="ring"></span>
      <span class="ring ring2"></span>
      <span class="ring ring3"></span>
      <div class="bursts" id="bursts"></div>
      <div class="gem"><span class="gem-check" id="gemCheck"></span></div>
    </div>

    <span class="eyebrow"><span class="rule"></span>you did it</span>
    <h1 class="cel-title">your first day is <em>logged</em>.</h1>
    <p class="cel-sub">that is the hard part done. i will keep the streak with you.</p>

    <div class="cel-card">
      <span class="card-key">streak</span>
      <span class="card-value">1 day</span>
      <span class="chip"><span class="chip-dot"></span>keep it alive tomorrow</span>
    </div>

    <div class="cel-buttons">
      <button class="primary-btn" id="celDone">keep going <span aria-hidden="true">&rarr;</span></button>
      <button class="ghost-btn" id="celDismiss">not now</button>
    </div>

  </div>
</div>
```

```css
.celebrate{
  position:fixed; inset:0; z-index:50;
  display:grid; place-items:center;
  padding:32px 24px 40px;
  background:var(--bg); overflow:hidden;
  animation:celFade .35s ease both;
}
@keyframes celFade{ from{opacity:0} to{opacity:1} }

/* a soft mint field behind everything, never a flat black page */
.celebrate::before{
  content:""; position:absolute; inset:0;
  background:radial-gradient(60% 50% at 50% 38%, rgba(110,231,183,.12), transparent 70%);
  pointer-events:none;
}

.cel-shell{
  position:relative; width:100%; max-width:600px;
  display:flex; flex-direction:column; align-items:center; text-align:center;
}

/* ── gem hero: springy pop entrance ── */
.gem-wrap{
  position:relative; width:200px; height:200px; margin:0 auto 8px;
  animation:cozyPop .72s var(--spring) .05s both;
}
@keyframes cozyPop{
  0%{ opacity:0; transform:scale(.82) }
  60%{ opacity:1; transform:scale(1.04) }
  100%{ transform:scale(1) }
}
.gem{
  position:absolute; inset:50% auto auto 50%;
  width:104px; height:104px; transform:translate(-50%,-50%);
  border-radius:30% 70% 62% 38% / 42% 36% 64% 58%;  /* organic gem silhouette */
  background:radial-gradient(circle at 38% 30%, var(--mint-hi), var(--mint) 55%, #1f8f6a 100%);
  box-shadow:0 0 38px var(--mint-glow), inset 0 0 22px rgba(255,255,255,.35);
  z-index:1;
  animation:gemLive 3.4s ease-in-out infinite;
}
@keyframes gemLive{
  0%,100%{ transform:translate(-50%,-50%) scale(1) }
  50%{ transform:translate(-50%,-50%) scale(1.045) }
}
/* the check drawn inside the gem (the shared "confirm" signature) */
.gem-check{
  position:absolute; inset:50% auto auto 50%;
  width:30px; height:16px; transform:translate(-50%,-62%) rotate(-45deg);
  border-left:3px solid var(--mint-ink); border-bottom:3px solid var(--mint-ink);
  border-radius:1px; opacity:0; clip-path:inset(0 100% 0 0);
}
.gem-check.show{ animation:checkDraw .5s var(--ease-premium) forwards; }
@keyframes checkDraw{
  0%{ opacity:1; clip-path:inset(0 100% 0 0) }
  100%{ opacity:1; clip-path:inset(0 0 0 0) }
}

/* ── looping sonar rings ── */
.ring{
  position:absolute; left:50%; top:50%; width:120px; height:120px;
  margin:-60px 0 0 -60px; border:1px solid var(--mint); border-radius:50%;
  opacity:0; animation:celRing 2.8s ease-out infinite;
}
.ring2{ animation-delay:.93s } .ring3{ animation-delay:1.86s }
@keyframes celRing{
  0%{ transform:scale(.42); opacity:.5 }
  70%{ opacity:.1 }
  100%{ transform:scale(1.8); opacity:0 }
}

/* motes that pop outward and fade, on a loop */
.bursts{ position:absolute; inset:0 }
.mote{
  position:absolute; left:50%; top:50%; width:5px; height:5px; border-radius:50%;
  background:var(--mint); box-shadow:0 0 9px var(--mint); opacity:0;
  animation:celMote 3.2s ease-out infinite;
}
@keyframes celMote{
  0%{ transform:translate(-50%,-50%) scale(0); opacity:0 }
  16%{ opacity:1 }
  100%{ transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy))) scale(.3); opacity:0 }
}

/* ── eyebrow ── */
.eyebrow{
  display:inline-flex; align-items:center; gap:12px;
  font-family:ui-monospace,monospace; font-size:.72rem; letter-spacing:.22em;
  text-transform:uppercase; color:var(--mint);
  animation:cozyUp .5s var(--spring) .12s both;
}
.rule{ display:inline-block; width:34px; height:1px; background:var(--mint); opacity:.7 }
@keyframes cozyUp{
  0%{ opacity:0; transform:translateY(16px) scale(.97) }
  60%{ opacity:1 }
  100%{ transform:translateY(0) scale(1) }
}

/* ── title + sub ── */
.cel-title{
  font-family:'Newsreader',Georgia,serif; font-weight:400;
  font-size:clamp(2.1rem,5.5vw,3rem); line-height:1.06; letter-spacing:-.02em;
  margin:12px 0; animation:cozyUp .55s var(--spring) .18s both;
}
.cel-title em{ font-style:italic; color:var(--mint); text-shadow:0 0 24px var(--mint-glow); }
.cel-sub{
  font-family:'Newsreader',Georgia,serif; font-style:italic; font-size:1.125rem;
  color:var(--body); line-height:1.55; max-width:42ch; margin:0 auto 24px;
  animation:cozyUp .55s var(--spring) .42s both;
}

/* ── summary card: glowing mint panel ── */
.cel-card{
  width:100%; max-width:360px;
  border:1px solid rgba(110,231,183,.35); border-radius:18px;
  background:rgba(110,231,183,.05); box-shadow:0 0 36px -18px var(--mint-glow);
  padding:20px 24px; margin:0 0 24px;
  display:flex; flex-direction:column; align-items:center; gap:12px;
  animation:cozyUp .55s var(--spring) .62s both;
}
.card-key{ font-family:ui-monospace,monospace; font-size:.72rem; letter-spacing:.16em;
  text-transform:uppercase; color:var(--muted-strong); }
.card-value{ font-family:'Newsreader',Georgia,serif; font-style:italic; font-size:1.6rem; line-height:1.15; }
.chip{
  display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border-radius:999px;
  border:1px solid rgba(110,231,183,.25); background:rgba(110,231,183,.08); color:var(--mint);
  font-family:ui-monospace,monospace; font-size:.7rem; letter-spacing:.06em; text-transform:uppercase;
}
.chip-dot{ width:5px; height:5px; border-radius:50%; background:var(--mint); flex:none }

/* ── buttons ── */
.cel-buttons{ display:flex; flex-direction:column; align-items:center; gap:16px;
  animation:cozyUp .55s var(--spring) .78s both; }
.primary-btn{
  display:inline-flex; align-items:center; gap:8px; cursor:pointer;
  background:var(--mint); color:var(--mint-ink); border:none; border-radius:999px;
  padding:14px 32px; font:600 1rem Inter,system-ui,sans-serif;
  transition:background .18s ease, transform .18s ease;
}
.primary-btn:hover{ background:var(--mint-hover); transform:translateY(-1px) }
.primary-btn:active{ transform:translateY(0) }
.ghost-btn{
  cursor:pointer; background:none; border:none; color:var(--muted);
  font-family:ui-monospace,monospace; font-size:.68rem; letter-spacing:.14em; text-transform:uppercase;
  transition:color .18s ease;
}
.ghost-btn:hover{ color:var(--mint) }

@media (prefers-reduced-motion:reduce){
  .cel-shell,.cel-shell *{ animation:none !important }
  .ring,.mote{ opacity:0 }
}
```

```js
// Build the looping motes (deterministic so it never jumps), draw the check,
// wire the two exits. Call openCelebration() on a real win.
const bursts = document.getElementById('bursts');
for (let i = 0; i < 12; i++){
  const angle = (i / 12) * Math.PI * 2 + (i % 2) * 0.32;
  const dist = 90 + (i % 4) * 16;
  const m = document.createElement('span');
  m.className = 'mote';
  m.style.setProperty('--dx', Math.round(Math.cos(angle) * dist) + 'px');
  m.style.setProperty('--dy', Math.round(Math.sin(angle) * dist) + 'px');
  m.style.animationDelay = ((i * 0.41) % 3.2).toFixed(2) + 's';
  bursts.appendChild(m);
}

function openCelebration(){
  const el = document.getElementById('celebrate');
  el.style.display = 'grid';
  setTimeout(() => document.getElementById('gemCheck').classList.add('show'), 120);
  fireBurst('confetti');           // optional one-shot burst, recipe below
}
function closeCelebration(){ document.getElementById('celebrate').style.display = 'none'; }

document.getElementById('celDone').addEventListener('click', closeCelebration);
document.getElementById('celDismiss').addEventListener('click', closeCelebration);
```

## 2. One-shot bursts (confetti / particles / sparkles)

The looping rings + motes above keep the overlay alive. For the single punch at
the instant of the win, fire a one-shot burst that spawns nodes, animates once,
then removes them. Drop this layer inside any `position:relative` stage.

```html
<div class="burst-layer" id="burstLayer" aria-hidden="true"></div>
```

```css
.burst-layer{ position:absolute; inset:0; z-index:0; pointer-events:none }

/* confetti: shards radiate, spin, fade. for big wins. */
.confetti{
  position:absolute; top:50%; left:50%; width:6px; height:9px;
  margin:-4.5px 0 0 -3px; border-radius:1.5px;
  background:var(--mint); box-shadow:0 0 8px rgba(110,231,183,.5);
  opacity:0; transform-origin:center;
  --angle:0deg; --dist:120px; --spin:540deg;
  animation:bConfetti 1.7s cubic-bezier(.16,.7,.4,1) forwards;
}
@keyframes bConfetti{
  0%{ transform:rotate(var(--angle)) translateY(0) rotate(0); opacity:0 }
  12%{ opacity:1 }
  100%{ transform:rotate(var(--angle)) translateY(calc(-1 * var(--dist))) rotate(var(--spin)); opacity:0 }
}

/* particles: dots shoot straight out and fade. lighter than confetti. */
.particle{
  position:absolute; top:50%; left:50%; width:5px; height:5px;
  margin:-2.5px 0 0 -2.5px; border-radius:50%;
  background:var(--mint); box-shadow:0 0 10px rgba(110,231,183,.7);
  opacity:0; transform-origin:center; --angle:0deg;
  animation:bParticle 1.5s cubic-bezier(.16,.84,.44,1) forwards;
}
@keyframes bParticle{
  0%{ transform:rotate(var(--angle)) translateY(0) scale(.4); opacity:0 }
  15%{ opacity:1 }
  100%{ transform:rotate(var(--angle)) translateY(-90px) scale(.7); opacity:0 }
}

/* sparkles: soft twinkles scattered near the gem. */
.sparkle{
  position:absolute; width:7px; height:7px; margin:-3.5px 0 0 -3.5px; border-radius:50%;
  background:radial-gradient(circle,rgba(255,255,255,.95) 0%,rgba(167,243,208,.6) 45%,rgba(110,231,183,0) 70%);
  box-shadow:0 0 12px rgba(110,231,183,.7); opacity:0;
  animation:bSparkle 1.8s ease-out forwards;
}
@keyframes bSparkle{
  0%{ opacity:0; transform:scale(.3) }
  25%{ opacity:1; transform:scale(1.4) }
  55%{ opacity:.6; transform:scale(.9) }
  100%{ opacity:0; transform:scale(.5) }
}
@media (prefers-reduced-motion:reduce){ .confetti,.particle,.sparkle{ animation:none; opacity:0 } }
```

```js
// fireBurst('confetti' | 'particles' | 'sparkles'). Spawns, plays once, cleans up.
function fireBurst(kind){
  const layer = document.getElementById('burstLayer');
  layer.innerHTML = '';
  if (kind === 'confetti'){
    for (let i = 0; i < 22; i++){
      const s = document.createElement('span');
      s.className = 'confetti';
      s.style.setProperty('--angle', ((360 / 22) * i + (i % 3) * 5) + 'deg');
      s.style.setProperty('--dist', (104 + (i % 5) * 26) + 'px');
      s.style.setProperty('--spin', ((i % 2 ? 1 : -1) * (480 + (i % 3) * 200)) + 'deg');
      s.style.animationDelay = ((i % 5) * 0.03) + 's';
      s.style.opacity = i % 2 ? 1 : 0.82;
      layer.appendChild(s);
    }
  } else if (kind === 'particles'){
    for (let i = 0; i < 14; i++){
      const s = document.createElement('span');
      s.className = 'particle';
      s.style.setProperty('--angle', ((360 / 14) * i) + 'deg');
      layer.appendChild(s);
    }
  } else if (kind === 'sparkles'){
    for (let i = 0; i < 14; i++){
      const a = Math.random() * Math.PI * 2, r = 32 + Math.random() * 16;
      const s = document.createElement('span');
      s.className = 'sparkle';
      s.style.left = (50 + Math.cos(a) * r) + '%';
      s.style.top = (50 + Math.sin(a) * r) + '%';
      s.style.animationDelay = (Math.random() * 0.35) + 's';
      layer.appendChild(s);
    }
  }
  setTimeout(() => { layer.innerHTML = ''; }, 2000);  // clean up after the longest run
}
```

## 3. Timing (the cascade, in order)

The whole thing reads as one wave. Hold this stagger.

| Element        | Entrance        | Delay   |
|----------------|-----------------|---------|
| overlay        | fade in         | 0s      |
| gem            | cozyPop spring  | 0.05s   |
| eyebrow        | cozyUp          | 0.12s   |
| title          | cozyUp          | 0.18s   |
| gem check draw | clip-path wipe  | 0.12s after open |
| sub            | cozyUp          | 0.42s   |
| card           | cozyUp          | 0.62s   |
| buttons        | cozyUp          | 0.78s   |

The looping rings (2.8s) and motes (3.2s) run forever behind the gem. The
one-shot confetti fires once at open (1.7s) and self-removes. Both springs are
`cubic-bezier(.34,1.56,.64,1)`; the check wipe uses `cubic-bezier(.16,1,.3,1)`.

## Copy rules (the character voice)

No em dashes. Lowercase, warm, first person from the character. The eyebrow is
the state ("you did it", "you're paired"). The title is the payoff in serif with
one glowing word. The sub is the next-step reassurance ("i will keep the streak
with you"). Color law: mint and azure for good, amber for caution, never red for
a celebration. The burst is allowed to be loud because it is rare.
