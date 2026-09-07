# Feature DNA: Goals streak + Water hydration

Sealed-HTML recipes distilled from Vitality's Goals (Duolingo-style streak,
identity-tagged big goals with progress and days-left, plan-tomorrow queue)
and Water (hydration ring with servings target). One file, no libraries, no
React. Plain HTML, CSS, vanilla JS, inline SVG. Color law: mint/azure good,
amber caution, never red for non-destructive states.

Tokens used below (drop into `:root`):

```css
:root{
  --bg:#000; --fg:#fff; --card:rgba(255,255,255,.02);
  --mint:#6EE7B7; --mint-hover:#5dd6a6; --mint-ink:#042a1c;
  --mint-glow:rgba(110,231,183,.4); --amber:#F59E0B;
  --muted:rgba(255,255,255,.5); --muted-strong:rgba(255,255,255,.7);
  --border:rgba(255,255,255,.08); --border-strong:rgba(255,255,255,.16);
  --ease:cubic-bezier(0.2,0.8,0.2,1); --ease-premium:cubic-bezier(.16,1,.3,1);
  --spring:cubic-bezier(.34,1.56,.64,1);
}
body{background:var(--bg);color:var(--fg);font-family:Inter,system-ui,sans-serif}
```

---

## 1. Streak ring with flame (Duolingo-style)

A circular SVG ring fills toward today's goal count and a flame glyph sits in
the center with the streak number. The ring goes amber when the day is
incomplete, mint when all goals are done. Streak number lives below.

```html
<div class="streak-card">
  <div class="streak-ring-wrap">
    <svg class="streak-ring" viewBox="-60 -60 120 120" aria-hidden="true">
      <circle cx="0" cy="0" r="52" fill="none"
              stroke="rgba(255,255,255,.06)" stroke-width="6"/>
      <circle id="streakArc" cx="0" cy="0" r="52" fill="none"
              stroke="var(--amber)" stroke-width="6" stroke-linecap="round"
              transform="rotate(-90)"
              stroke-dasharray="326.7" stroke-dashoffset="326.7"/>
    </svg>
    <div class="streak-center">
      <!-- flame, inline SVG (no emoji) -->
      <svg id="flame" width="26" height="26" viewBox="0 0 24 24" fill="none"
           stroke="var(--amber)" stroke-width="1.6"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 2c1 3-1 5-2 6.5C8.7 10.3 8 11.8 8 13.5a4 4 0 0 0 8 0c0-1.6-.7-3-1.6-4.2C16 12 17 14 15 17"/>
        <path d="M12 22a5 5 0 0 1-5-5c0-2 1-3.5 2-5"/>
      </svg>
      <span class="streak-num" id="streakNum">7</span>
    </div>
  </div>
  <div class="streak-label"><span id="streakDone">3</span> of <span id="streakTotal">4</span> done today</div>
</div>
```

```css
.streak-card{display:flex;flex-direction:column;align-items:center;gap:10px;
  padding:20px;border:1px solid var(--border);border-radius:18px;background:var(--card)}
.streak-ring-wrap{position:relative;width:120px;height:120px}
.streak-ring{width:120px;height:120px;display:block}
/* circumference = 2*PI*52 = 326.7. offset = circ*(1 - pct). */
#streakArc{transition:stroke-dashoffset .7s var(--ease),stroke .4s var(--ease)}
.streak-center{position:absolute;inset:0;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:2px}
.streak-num{font-family:Georgia,serif;font-style:italic;font-size:30px;
  line-height:1;color:var(--amber);font-variant-numeric:tabular-nums}
.streak-card.all-done #streakArc,
.streak-card.all-done #flame{stroke:var(--mint)}
.streak-card.all-done .streak-num{color:var(--mint)}
.streak-card.all-done #flame{filter:drop-shadow(0 0 8px var(--mint-glow))}
.streak-label{font-size:12px;color:var(--muted);letter-spacing:.02em}
@media(prefers-reduced-motion:reduce){#streakArc{transition:none}}
```

```js
const CIRC = 326.7; // 2 * Math.PI * 52
function renderStreak(done, total, streak){
  const card = document.querySelector('.streak-card');
  const pct = total > 0 ? Math.min(1, done / total) : 0;
  document.getElementById('streakArc').style.strokeDashoffset = CIRC * (1 - pct);
  document.getElementById('streakNum').textContent = streak;
  document.getElementById('streakDone').textContent = done;
  document.getElementById('streakTotal').textContent = total;
  card.classList.toggle('all-done', total > 0 && done === total);
}
renderStreak(3, 4, 7);
```

Streak rules (Duolingo model, store in localStorage):

```js
// extend streak only when ALL required goals are done; one calendar day each.
function localKey(d=new Date()){
  const m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${d.getFullYear()}-${m}-${day}`;
}
function maybeExtendStreak(s, done, total){
  const today = localKey();
  if (total === 0 || done < total) return s;        // day not complete
  if (s.lastExtendedDate === today) return s;        // already counted today
  // if last extend was not yesterday, the run resets to 1 (unless a freeze)
  const yest = localKey(new Date(Date.now() - 86400000));
  const continued = s.lastExtendedDate === yest;
  const current = continued ? s.current + 1 : 1;
  return { ...s, current, longest: Math.max(s.longest, current), lastExtendedDate: today };
}
```

---

## 2. Identity-tagged big-goal card (progress bar + days-left countdown)

A long-term goal: a category seal/word badge, an italic title, an optional
amount-progress bar (current of target), and a horizon track that shows the
journey from today to the target date with a marker and a "N days left"
countdown. Mint fills, amber reserved for caution only.

```html
<article class="big-goal">
  <div class="bg-top">
    <span class="cat-badge">
      <span class="cat-seal">
        <!-- identity glyph, inline SVG -->
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--mint-ink)"
             stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>
        </svg>
      </span>
      <span class="cat-word">Health</span>
    </span>
    <!-- priority pips (filled = active) -->
    <span class="prio" aria-label="priority 2 of 3">
      <i class="pip on"></i><i class="pip on"></i><i class="pip"></i>
    </span>
  </div>

  <h3 class="bg-title">Run a half marathon</h3>

  <div class="bg-prog">
    <div class="prog-head">
      <span class="prog-num">8<small>of 13 mi</small></span>
      <span class="meta-chip">62%</span>
    </div>
    <div class="prog-track"><div class="prog-fill" style="width:62%"></div></div>
  </div>

  <div class="horizon">
    <div class="horizon-track">
      <div class="horizon-fill" style="width:45%"></div>
      <span class="horizon-marker" style="left:45%"></span>
    </div>
    <div class="horizon-labels">
      <span class="horizon-today">Today</span>
      <span class="horizon-target">
        <svg width="11" height="11" viewBox="-12 -12 24 24" fill="none" stroke="currentColor"
             stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M-7 9 V-9 L8 -5 L-7 -1"/>
        </svg>
        <b>Sep 14</b> &middot; 31 days left
      </span>
    </div>
  </div>
</article>
```

```css
.big-goal{position:relative;display:flex;flex-direction:column;gap:14px;
  padding:22px;border:1px solid rgba(110,231,183,.26);border-radius:18px;
  background:radial-gradient(130% 95% at 0% 0%, rgba(110,231,183,.08), transparent 55%), var(--card);
  box-shadow:0 0 0 1px rgba(110,231,183,.06), 0 0 60px -28px var(--mint-glow)}
.bg-top{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px}
.cat-badge{display:inline-flex;align-items:center;gap:11px;min-width:0}
.cat-seal{flex:0 0 auto;width:44px;height:44px;border-radius:13px;
  display:flex;align-items:center;justify-content:center;color:var(--mint-ink);
  background:linear-gradient(150deg,#a7f3d0,var(--mint));
  box-shadow:0 0 24px -4px var(--mint-glow), inset 0 1px 0 rgba(255,255,255,.4)}
.cat-word{font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.16em;
  text-transform:uppercase;color:var(--mint)}
.prio{display:inline-flex;gap:5px}
.pip{width:7px;height:7px;border-radius:50%;background:var(--border-strong)}
.pip.on{background:var(--mint);box-shadow:0 0 6px var(--mint-glow)}
.bg-title{margin:0;font-family:Georgia,serif;font-style:italic;font-size:25px;line-height:1.2;color:#fff}

/* amount progress */
.bg-prog{display:flex;flex-direction:column;gap:7px}
.prog-head{display:flex;align-items:center;justify-content:space-between}
.prog-num{font-family:Georgia,serif;font-style:italic;font-size:19px;color:var(--mint)}
.prog-num small{font-family:ui-monospace,monospace;font-style:normal;font-size:10px;
  letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-left:6px}
.prog-track{height:8px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden}
.prog-fill{height:100%;border-radius:999px;
  background:linear-gradient(90deg,#1f4d3d,var(--mint));
  box-shadow:0 0 16px -2px var(--mint-glow);transition:width .9s var(--ease)}
.meta-chip{font-family:ui-monospace,monospace;font-size:9px;letter-spacing:.1em;
  text-transform:uppercase;color:var(--muted-strong);border:1px solid var(--border-strong);
  border-radius:999px;padding:5px 10px}

/* deadline horizon: today -> target */
.horizon{display:flex;flex-direction:column;gap:11px;margin-top:6px}
.horizon-track{position:relative;height:6px;border-radius:999px;background:rgba(255,255,255,.06)}
.horizon-fill{position:absolute;inset:0 auto 0 0;border-radius:999px;
  background:linear-gradient(90deg,#1f4d3d,var(--mint));
  box-shadow:0 0 14px -2px var(--mint-glow);transition:width .5s var(--ease)}
.horizon-marker{position:absolute;top:50%;width:13px;height:13px;border-radius:50%;
  background:#a7f3d0;border:2px solid #000;box-shadow:0 0 12px var(--mint-glow);
  transform:translate(-50%,-50%);transition:left .5s var(--ease)}
.horizon-labels{display:flex;align-items:center;justify-content:space-between;gap:10px}
.horizon-today{font-family:ui-monospace,monospace;font-size:9px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--muted)}
.horizon-target{display:inline-flex;align-items:center;gap:7px;font-family:ui-monospace,monospace;
  font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted-strong)}
.horizon-target svg{color:var(--mint);flex:0 0 auto}
.horizon-target b{font-family:Georgia,serif;font-style:italic;font-weight:400;font-size:15px;
  color:var(--mint);text-transform:none;letter-spacing:0}
```

```js
// horizon % = elapsed share of created -> target window; days-left countdown.
function daysFromToday(key){
  const t=new Date(`${key}T00:00:00`), now=new Date(); now.setHours(0,0,0,0);
  return Math.max(0, Math.round((t - now)/86400000));
}
function horizonPct(createdKey, targetKey){
  const a=+new Date(`${createdKey}T00:00:00`), b=+new Date(`${targetKey}T00:00:00`), n=Date.now();
  if (b <= a) return 100;
  return Math.max(0, Math.min(100, ((n - a)/(b - a))*100));
}
// progress %: Math.round(current/target*100); width = Math.min(100, pct)+'%'
```

---

## 3. Plan-tomorrow queue (locked-until-morning list)

A lighter list under the today card. Items are written tonight and presented
as a calm queue, not interactive checkboxes.

```html
<section class="tom-card">
  <div class="tom-head">
    <div class="eyebrow">Plan tomorrow</div>
    <span class="tom-count">2 planned</span>
  </div>
  <ul class="tom-list">
    <li class="tom-row"><span class="tom-dot" aria-hidden="true">&middot;</span>Morning run</li>
    <li class="tom-row"><span class="tom-dot" aria-hidden="true">&middot;</span>Read 20 pages</li>
  </ul>
  <div class="add-row">
    <input class="add-input" type="text" placeholder="Add a goal for tomorrow...">
    <button class="add-btn">+ Add</button>
  </div>
</section>
```

```css
.tom-card{padding:20px;border:1px solid var(--border);border-radius:18px;
  background:var(--card);opacity:.92}
.tom-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px}
.eyebrow{font-family:ui-monospace,monospace;font-size:10px;font-weight:600;
  letter-spacing:.22em;text-transform:uppercase;color:var(--muted)}
.tom-count{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);
  padding:4px 10px;border:1px solid var(--border);border-radius:999px}
.tom-list{list-style:none;margin:0 0 14px;padding:0;display:flex;flex-direction:column;gap:2px}
.tom-row{display:inline-flex;align-items:center;gap:10px;padding:8px 12px;font-size:14px;color:var(--muted-strong)}
.tom-dot{color:var(--mint);font-size:18px;line-height:0}
.add-row{display:flex;gap:6px}
.add-input{flex:1;min-width:0;background:rgba(255,255,255,.03);border:1px solid var(--border);
  border-radius:12px;padding:10px 14px;color:var(--fg);font:inherit;font-size:13px;outline:none}
.add-input:focus{border-color:rgba(110,231,183,.4);background:rgba(255,255,255,.05)}
.add-btn{background:var(--mint);color:var(--mint-ink);font:inherit;font-size:13px;font-weight:600;
  border:0;border-radius:12px;padding:0 16px;cursor:pointer}
.add-btn:hover{background:var(--mint-hover)}
```

---

## 4. Hydration ring with servings target

A 280px ring gauge. Mint progress arc with a head-dot, a giant italic count in
the center, an aurora glow behind it, drifting particles, and a "drank one"
ripple. A "healthy zone" pill (inline-SVG check) drops in at target.

```html
<section class="hydro">
  <div class="hydro-visual">
    <div class="hydro-aurora" aria-hidden="true"></div>
    <div class="hydro-particles" id="parts" aria-hidden="true"></div>
    <svg class="hydro-ring" viewBox="-130 -130 260 260" aria-hidden="true">
      <defs>
        <linearGradient id="hydroGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#a7f3d0"/><stop offset="100%" stop-color="#6ee7b7"/>
        </linearGradient>
      </defs>
      <circle cx="0" cy="0" r="112" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="3"/>
      <circle id="hydroArc" cx="0" cy="0" r="112" fill="none" stroke="url(#hydroGrad)"
              stroke-width="3" stroke-linecap="round" transform="rotate(-90)"
              stroke-dasharray="703.7" stroke-dashoffset="703.7"/>
      <circle id="hydroDot" cx="0" cy="-112" r="4" fill="var(--mint)"
              transform="rotate(0)" style="opacity:0"/>
    </svg>
    <div class="hydro-num-wrap" id="numWrap">
      <span class="hydro-num" id="hydroNum">0</span>
      <span class="hydro-target">of <span id="hydroTarget">8</span> glasses</span>
    </div>
  </div>

  <div class="zone-pill" id="zonePill" hidden>
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 13l4 4L19 7"/>
    </svg>
    healthy zone
  </div>

  <p class="hydro-helper" id="helper">Start the day. First one in.</p>

  <div class="hydro-actions">
    <button class="undo-btn" id="undoBtn" aria-label="Undo last glass" disabled>&minus;</button>
    <button class="drink-btn" id="drinkBtn">Drank a glass <span class="drink-arrow">&uarr;</span></button>
  </div>
</section>
```

```css
.hydro{padding:20px;border:1px solid var(--border);border-radius:18px;background:var(--card)}
.hydro-visual{position:relative;width:100%;height:300px;display:flex;align-items:center;justify-content:center}
.hydro-aurora{position:absolute;inset:-10%;z-index:0;pointer-events:none;filter:blur(14px);
  background:radial-gradient(ellipse 55% 45% at 50% 50%, rgba(110,231,183,.18), transparent 70%),
             radial-gradient(ellipse 35% 30% at 50% 50%, rgba(167,243,208,.10), transparent 75%);
  animation:auroraDrift 14s ease-in-out infinite alternate}
@keyframes auroraDrift{0%{transform:scale(1) translateY(0)}100%{transform:scale(1.08) translateY(-4px)}}
.hydro-particles{position:absolute;inset:0;z-index:1;overflow:hidden;border-radius:50%;pointer-events:none;
  -webkit-mask-image:radial-gradient(ellipse 55% 45% at 50% 50%, #000 60%, transparent 100%);
  mask-image:radial-gradient(ellipse 55% 45% at 50% 50%, #000 60%, transparent 100%)}
.particle{position:absolute;bottom:-6px;width:3px;height:3px;border-radius:50%;background:var(--mint);
  filter:blur(.5px);box-shadow:0 0 6px rgba(110,231,183,.7);opacity:0;animation:rise 6s linear infinite}
@keyframes rise{0%{transform:translateY(0);opacity:0}15%{opacity:.85}90%{opacity:.6}100%{transform:translateY(-300px);opacity:0}}
.hydro-ring{position:relative;width:280px;height:280px;z-index:2;overflow:visible}
#hydroArc{transition:stroke-dashoffset .7s var(--ease),stroke .4s var(--ease)}
#hydroDot{transition:transform .7s var(--ease),opacity .3s ease;transform-origin:0 0;
  filter:drop-shadow(0 0 6px rgba(110,231,183,.9))}
.hydro-num-wrap{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:4;
  display:flex;flex-direction:column;align-items:center;pointer-events:none;transition:transform .36s var(--ease)}
.hydro-num-wrap.punch{animation:punch .36s var(--ease)}
@keyframes punch{0%{transform:translate(-50%,-50%) scale(1)}40%{transform:translate(-50%,-50%) scale(1.08)}100%{transform:translate(-50%,-50%) scale(1)}}
.hydro-num{font-family:Georgia,serif;font-style:italic;font-size:104px;line-height:.9;
  letter-spacing:-.025em;color:var(--fg);font-variant-numeric:tabular-nums}
.hydro-target{margin-top:8px;font-family:Georgia,serif;font-style:italic;font-size:16px;color:var(--muted-strong)}
.ripple{position:absolute;top:50%;left:50%;width:224px;height:224px;border-radius:50%;
  border:2px solid rgba(110,231,183,.55);transform:translate(-50%,-50%) scale(.6);
  z-index:3;pointer-events:none;opacity:0;animation:rippleOut 1.2s var(--ease) forwards}
@keyframes rippleOut{0%{transform:translate(-50%,-50%) scale(.6);opacity:.9}60%{opacity:.4}100%{transform:translate(-50%,-50%) scale(1.35);opacity:0}}
.zone-pill{display:flex;width:fit-content;align-items:center;gap:6px;margin:0 auto 12px;
  padding:5px 14px;border-radius:999px;background:rgba(110,231,183,.12);
  border:1px solid rgba(110,231,183,.32);color:var(--mint);font-size:10px;letter-spacing:.14em;
  text-transform:uppercase;font-weight:600;animation:zoneIn .48s var(--ease)}
@keyframes zoneIn{from{opacity:0;transform:translateY(-6px) scale(.94)}to{opacity:1;transform:none}}
.hydro-helper{margin:0 0 16px;text-align:center;font-family:Georgia,serif;font-style:italic;font-size:13px;color:var(--muted)}
.hydro-helper.good{font-style:normal;color:var(--mint);font-family:Inter,system-ui;font-weight:500}
.hydro-actions{display:grid;grid-template-columns:52px 1fr;gap:12px}
.undo-btn{background:rgba(255,255,255,.04);border:1px solid var(--border);color:var(--fg);
  border-radius:12px;font-size:22px;cursor:pointer}
.undo-btn:disabled{opacity:.3;cursor:not-allowed}
.drink-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:16px;
  background:var(--mint);color:var(--mint-ink);border:0;border-radius:12px;font:inherit;
  font-size:16px;font-weight:600;cursor:pointer;transition:transform .15s var(--ease),background .25s var(--ease)}
.drink-btn:hover{background:var(--mint-hover)}.drink-btn:active{transform:scale(.98)}
@media(prefers-reduced-motion:reduce){.hydro-aurora,.particle,.ripple,.punch{animation:none}#hydroArc,#hydroDot{transition:none}}
```

```js
const HCIRC = 703.7; // 2 * Math.PI * 112
let count = 0; const target = 8;
const arc=document.getElementById('hydroArc'), dot=document.getElementById('hydroDot');
const numWrap=document.getElementById('numWrap'), num=document.getElementById('hydroNum');
const zone=document.getElementById('zonePill'), helper=document.getElementById('helper');
const undo=document.getElementById('undoBtn'), visual=document.querySelector('.hydro-visual');

// seed drifting particles
const parts=document.getElementById('parts');
for(let i=0;i<8;i++){const s=document.createElement('span');s.className='particle';
  s.style.left=(8+i*11)+'%';s.style.animationDelay=(i*0.9)+'s';
  s.style.animationDuration=(5.5+(i%3)*1.2)+'s';parts.appendChild(s);}

function render(){
  const pctRaw = target>0 ? (count/target)*100 : 0;
  const ringPct = Math.min(100, pctRaw);
  arc.style.strokeDashoffset = HCIRC*(1 - ringPct/100);
  dot.style.opacity = ringPct>0 ? 1 : 0;
  dot.setAttribute('transform', `rotate(${(ringPct/100)*360})`);
  num.textContent = count;
  zone.hidden = pctRaw < 100;
  let h, good=false;
  if(count===0) h='Start the day. First one in.';
  else if(pctRaw<50) h='Behind pace. Drink one in the next hour.';
  else if(pctRaw<100){ h=(target-count)+' to go. Pacing well.'; }
  else { h='Target hit. Nicely done.'; good=true; }
  helper.textContent=h; helper.classList.toggle('good',good);
  undo.disabled = count<=0;
}
document.getElementById('drinkBtn').onclick=()=>{
  count++;
  const r=document.createElement('span');r.className='ripple';visual.appendChild(r);
  setTimeout(()=>r.remove(),1200);
  numWrap.classList.add('punch');setTimeout(()=>numWrap.classList.remove('punch'),360);
  render();
};
undo.onclick=()=>{ if(count>0){count--;render();} };
render();
```

---

## 5. Bottle row (alt to ring, same servings model)

When a ring is too big for the slot, render the target as a row of bottle
glyphs that fill mint as servings are logged. Same `count` of `target`.

```html
<div class="bottle-row" id="bottles" aria-label="3 of 8 glasses"></div>
```

```css
.bottle-row{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.bottle{width:22px;height:34px;color:var(--border-strong);transition:color .3s var(--ease),filter .3s var(--ease)}
.bottle.full{color:var(--mint);filter:drop-shadow(0 0 6px var(--mint-glow))}
```

```js
function renderBottles(count, target){
  const wrap=document.getElementById('bottles'); wrap.innerHTML='';
  for(let i=0;i<target;i++){
    wrap.insertAdjacentHTML('beforeend',
      `<svg class="bottle ${i<count?'full':''}" viewBox="0 0 24 36" fill="none"
            stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">
         <path d="M9 2h6v3l2 3v23a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8l2-3z"/>
         <path d="M7 18h10" stroke-opacity=".5"/>
       </svg>`);
  }
}
renderBottles(3, 8);
```

---

### Notes for tile builders

- Ring math: `dashoffset = circumference * (1 - pct)`. Circumference =
  `2 * Math.PI * r`. Always start the arc at top with `transform="rotate(-90)"`.
- Color law: progress and success are mint. Amber is for "behind / caution"
  only (the incomplete streak flame). Never use red for an unmet target or a
  missed day. Reserve red for destructive confirm only.
- All checks and glyphs are inline SVG, never emoji or unicode marks.
- Wrap motion in `@media (prefers-reduced-motion: reduce)`.
- Persist `count`, `streak`, and goals in `localStorage`; key dates with the
  local `YYYY-MM-DD` helper, never `toISOString` (UTC drift).
