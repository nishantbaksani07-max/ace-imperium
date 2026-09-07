# Vitality DNA: Weight trend chart + Supplement stack

Two flagship Vitality UI patterns distilled to copyable, sealed-HTML snippets.
Vanilla CSS, vanilla JS, inline SVG only. No libraries, no React, no build step.

Source (read-only, for the full version):
- `app/app/fuel/macros/WeightLogger.tsx` (glowing trend line, range pills, stat row)
- `app/app/fitness/supplements/StackList.tsx` + `supplements.module.css` (time-of-day stack)

Tokens used (define these once at the top of your tile):

```css
:root {
  --bg:#000; --fg:#fff;
  --mint:#6EE7B7; --mint-ink:#042a1c; --mint-glow:rgba(110,231,183,0.4);
  --amber:#F59E0B;
  --muted:rgba(255,255,255,0.5); --muted-strong:rgba(255,255,255,0.7);
  --faint:rgba(233,239,233,0.32);
  --border:rgba(255,255,255,0.08); --card:rgba(255,255,255,0.02); --card-up:rgba(255,255,255,0.04);
  --ease:cubic-bezier(0.16,1,0.3,1);
  --mono:ui-monospace,"SF Mono",monospace; --serif:Georgia,serif;
}
```

---

## 1. Glowing weight trend chart

A card with a big serif number + range pills, a glowing mint line over a gradient
fill, a right-side y-axis (hi/mid/lo), and a 3-up stat row (Average / Change / Logged).
The line is smoothed (Catmull-Rom to cubic bezier) so daily noise reads as a calm trend.

### HTML shell

```html
<div class="card chart-card">
  <div class="chart-head">
    <div>
      <div class="chart-big"><span id="bigNum">74.2</span><small>kg avg</small></div>
      <div class="chart-lbl" id="rangeWord">30 day average</div>
    </div>
    <div class="range" role="group" aria-label="Timeframe">
      <button data-days="7">7D</button>
      <button data-days="30" class="on">30D</button>
      <button data-days="90">3M</button>
      <button data-days="100000">ALL</button>
    </div>
  </div>

  <div class="chart-row">
    <svg class="chart" viewBox="0 0 660 200" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="wlFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="rgba(110,231,183,0.22)"/>
          <stop offset="1" stop-color="rgba(110,231,183,0)"/>
        </linearGradient>
        <filter id="wlGlow" x="-10%" y="-40%" width="120%" height="180%">
          <feGaussianBlur stdDeviation="3" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <line class="grid" x1="0" y1="14" x2="660" y2="14"/>
      <line class="grid" x1="0" y1="94" x2="660" y2="94"/>
      <line class="grid" x1="0" y1="174" x2="660" y2="174"/>
      <path id="wlArea" fill="url(#wlFill)" stroke="none"/>
      <path id="wlLine" fill="none" stroke="var(--mint)" stroke-width="2.4"
            stroke-linecap="round" stroke-linejoin="round" filter="url(#wlGlow)"/>
      <circle id="wlHaloDot" r="9" fill="rgba(110,231,183,0.25)"/>
      <circle id="wlDot" r="4.5" fill="var(--mint)"/>
      <circle id="wlRing" r="4.5" fill="none" stroke="#fff" stroke-width="1.5"/>
    </svg>
    <div class="y-axis"><span id="yHi">76</span><span id="yMid">74</span><span id="yLo">72</span></div>
  </div>

  <div class="stats">
    <div class="stat"><span class="stat-lbl">Average</span><span class="stat-num"><span id="sAvg">74.2</span> <i>kg</i></span></div>
    <div class="stat"><span class="stat-lbl">Change</span><span class="stat-num" id="sChange">-1.3 <i>kg</i></span><span class="stat-sub" id="sChangeWord">30 day</span></div>
    <div class="stat"><span class="stat-lbl">Logged</span><span class="stat-num" id="sLogged">24/30</span><span class="stat-sub">mornings</span></div>
  </div>
</div>
```

### CSS

```css
.card { border:1px solid var(--border); border-radius:18px; background:var(--card);
        padding:2rem; display:flex; flex-direction:column; gap:1.25rem;
        transition:border-color .18s var(--ease), box-shadow .18s var(--ease); }
.card:hover { border-color:rgba(110,231,183,0.25); box-shadow:0 0 32px -16px var(--mint-glow); }

.chart-head { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; }
.chart-big { font-family:var(--serif); font-size:2.6rem; line-height:1; font-variant-numeric:tabular-nums; color:var(--fg); }
.chart-big small { font-family:sans-serif; font-size:1rem; color:var(--muted); margin-left:5px; }
.chart-lbl { font-family:var(--mono); font-size:.66rem; letter-spacing:.16em; text-transform:uppercase; color:var(--muted); margin-top:8px; }

.range { display:inline-flex; gap:2px; border:1px solid var(--border); border-radius:999px;
         padding:3px; background:rgba(255,255,255,0.02); flex:none; }
.range button { font-family:var(--mono); font-size:.64rem; letter-spacing:.06em; color:var(--muted);
                background:none; border:none; padding:6px 13px; border-radius:999px; cursor:pointer;
                transition:color .2s var(--ease), background .2s var(--ease); }
.range button:hover { color:var(--mint); }
.range button.on { background:rgba(110,231,183,0.14); color:var(--mint); }

.chart-row { display:flex; gap:12px; margin-top:18px; }
.chart { flex:1; height:210px; min-width:0; display:block; }
.grid { stroke:rgba(255,255,255,0.05); stroke-width:1; }
.y-axis { display:flex; flex-direction:column; justify-content:space-between; padding:12px 0 24px;
          width:36px; text-align:right; flex:none; font-family:var(--mono); font-size:.64rem; color:var(--faint); }

.stats { display:flex; border-top:1px solid var(--border); margin-top:18px; padding-top:18px; }
.stat { flex:1; text-align:center; display:flex; flex-direction:column; align-items:center; gap:5px; }
.stat-lbl { font-family:var(--mono); font-size:.6rem; letter-spacing:.16em; text-transform:uppercase; color:var(--muted); }
.stat-num { font-family:var(--serif); font-size:1.6rem; font-variant-numeric:tabular-nums; color:var(--mint); display:inline-flex; align-items:center; gap:3px; }
.stat-num i { font-style:normal; font-family:sans-serif; font-size:.85rem; color:var(--muted); }
.stat-num svg { width:.8em; height:.8em; fill:none; stroke:var(--mint); stroke-width:2.6; stroke-linecap:round; stroke-linejoin:round; }
.stat-sub { font-family:var(--mono); font-size:.58rem; color:var(--faint); }
@media (max-width:560px){ .chart-big{font-size:2.1rem;} .chart{height:170px;} .stat-num{font-size:1.3rem;} }
```

### JS (smoothing + render). Feed it `[{date:'2026-06-01', value:74.5}, ...]` oldest-first.

```js
const W=660,H=200,PADT=14,PADB=26,PADX=6;
function smoothPath(pts){ // Catmull-Rom -> cubic bezier
  if(!pts.length) return ''; if(pts.length===1) return `M${pts[0].x},${pts[0].y}`;
  let d=`M${pts[0].x},${pts[0].y}`;
  for(let i=0;i<pts.length-1;i++){
    const p0=pts[i-1]??pts[i], p1=pts[i], p2=pts[i+1], p3=pts[i+2]??p2;
    const c1x=p1.x+(p2.x-p0.x)/6, c1y=p1.y+(p2.y-p0.y)/6;
    const c2x=p2.x-(p3.x-p1.x)/6, c2y=p2.y-(p3.y-p1.y)/6;
    d+=` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}
function renderChart(rows){            // rows oldest-first
  if(rows.length<2) return;            // (real app draws a ghost demo line here)
  const ys=rows.map(r=>r.value), lo=Math.min(...ys), hi=Math.max(...ys), span=(hi-lo)||1;
  const pts=rows.map((r,i)=>({ x:PADX+(i/(rows.length-1))*(W-PADX*2),
                               y:PADT+(1-(r.value-lo)/span)*(H-PADT-PADB) }));
  const line=smoothPath(pts), end=pts[pts.length-1];
  document.getElementById('wlLine').setAttribute('d',line);
  document.getElementById('wlArea').setAttribute('d',
    `${line} L${end.x.toFixed(1)},${H} L${pts[0].x.toFixed(1)},${H} Z`);
  for(const id of ['wlHaloDot','wlDot','wlRing']){
    const c=document.getElementById(id); c.setAttribute('cx',end.x); c.setAttribute('cy',end.y);
  }
  document.getElementById('yHi').textContent=hi.toFixed(1);
  document.getElementById('yMid').textContent=((hi+lo)/2).toFixed(1);
  document.getElementById('yLo').textContent=lo.toFixed(1);
  // stats
  const avg=ys.reduce((a,b)=>a+b,0)/ys.length, change=rows[rows.length-1].value-rows[0].value;
  document.getElementById('sAvg').textContent=avg.toFixed(1);
  document.getElementById('bigNum').textContent=avg.toFixed(1);
  const flat=Math.abs(change)<0.05;
  document.getElementById('sChange').innerHTML =
    (flat?'~ 0.0':`${arrow(change<0)}${Math.abs(change).toFixed(1)}`)+' <i>kg</i>';
}
// inline arrow glyph: down when losing, flipped when gaining (warm, never red)
function arrow(down){ return `<svg viewBox="0 0 24 24" style="${down?'':'transform:rotate(180deg)'}"><path d="M12 5v14M6 13l6 6 6-6"/></svg>`; }

document.querySelectorAll('.range button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.range button').forEach(x=>x.classList.remove('on'));
  b.classList.add('on');
  const days=+b.dataset.days, word={7:'7 day',30:'30 day',90:'3 month',100000:'all time'}[days]||'';
  document.getElementById('rangeWord').textContent=word+' average';
  document.getElementById('sChangeWord').textContent=word;
  // filter your rows by `days` from the last date, then renderChart(filtered)
});
```

Tuning notes:
- The line carries a soft glow via `filter:url(#wlGlow)` (feGaussianBlur stdDev 3 + feMerge).
  The end point is a stack of 3 circles: a faint mint halo (r9), a solid mint dot (r4.5),
  and a white ring (r4.5). Drop the halo + ring for a flatter look.
- Gradient fill (`#wlFill`) fades mint .22 to 0 top-to-bottom; the area path closes the
  line down to the chart floor (`L end,H L start,H Z`).
- `preserveAspectRatio="none"` lets the 660x200 viewBox stretch to any card width.
- Empty state: when fewer than 2 points, draw the same line with `stroke-dasharray="2 9"`
  and `opacity:.4` over a `[0.6,0.64,...]` sample so the card always reads as a grapher.

---

## 2. Time-of-day supplement stack

Sections grouped by intake window (Morning / Midday / Evening / Before bed / Anytime),
each with a mono-caps eyebrow (icon + title + time on the right) sitting OUTSIDE an
inset grouped card. Rows are divider-separated, name in serif italic, dose/note as a
mono meta line, and a big circular check on the right (mint with glow + checkmark when
taken). Strike-through + dimmed when taken. Pulsing border when missed past its cutoff.

### Window data (translated from emoji to inline-SVG glyphs)

```js
const WINDOWS = [
  { key:'morning', title:'Morning',    time:'7-10 AM', cutoff:10,
    icon:'<svg viewBox="0 0 24 24"><circle cx="12" cy="14" r="4"/><path d="M12 4v2M5 8l1.4 1.4M19 8l-1.4 1.4M3 18h18"/></svg>' },
  { key:'lunch',   title:'Midday',     time:'12-2 PM', cutoff:14,
    icon:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>' },
  { key:'evening', title:'Evening',    time:'6-9 PM',  cutoff:21,
    icon:'<svg viewBox="0 0 24 24"><path d="M21 13a8 8 0 1 1-10-10 7 7 0 0 0 10 10z"/></svg>' },
  { key:'bed',     title:'Before bed', time:'10 PM',   cutoff:null,
    icon:'<svg viewBox="0 0 24 24"><path d="M3 18v-6h13a4 4 0 0 1 4 4v2M3 12V6M3 18h18"/></svg>' },
  { key:'anytime', title:'Anytime',    time:'No fixed window', cutoff:null,
    icon:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' },
];
// glyph stroke set on .win-icon svg below. A "missed" item = past its window cutoff hour and not taken.
```

### HTML pattern (one window group; repeat per non-empty window)

```html
<section class="stack-list">
  <div class="win-group">
    <header class="win-head">
      <span class="win-icon" aria-hidden="true"><!-- WINDOWS[i].icon --></span>
      <span class="win-title">Morning</span>
      <span class="win-time">7-10 AM</span>
    </header>
    <ul class="win-items">
      <!-- per item: -->
      <li class="item-row">
        <div class="item-main">
          <span class="item-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><rect x="3" y="9" width="18" height="6" rx="3"/><path d="M12 9v6"/></svg>
          </span>
          <div class="item-body">
            <div class="item-name-row"><span class="item-name">Creatine</span></div>
            <div class="item-meta">5 g . with water</div>
          </div>
          <div class="quiet-actions">
            <button class="low-btn" title="Flag as running low">&#8595;</button>
            <button class="del-btn" aria-label="Remove">&times;</button>
          </div>
          <button class="check-btn" aria-pressed="false" aria-label="Mark taken"></button>
        </div>
      </li>
    </ul>
  </div>
</section>
```

When taken add `item-row--taken` to the `li` and `check-btn--on` to the button (sets `&check;`
text). When missed add `item-row--missed`. The dose + note meta is built as
`[dose, note].filter(Boolean).join(' . ')`.

### CSS

```css
.stack-list { display:flex; flex-direction:column; gap:1rem; }
.win-group { display:flex; flex-direction:column; gap:10px; }
.win-group + .win-group { margin-top:1rem; }

.win-head { display:flex; align-items:center; gap:8px; padding:0 .75rem; }
.win-icon svg { width:14px; height:14px; fill:none; stroke:var(--muted-strong); stroke-width:2;
                stroke-linecap:round; stroke-linejoin:round; }
.win-title { font-family:var(--mono); font-size:11px; font-weight:600; letter-spacing:.16em;
             text-transform:uppercase; color:var(--muted-strong); }
.win-time { font-family:var(--mono); font-size:10px; letter-spacing:.14em; text-transform:uppercase;
            color:var(--muted); margin-left:auto; }

.win-items { list-style:none; margin:0; padding:0; display:flex; flex-direction:column;
             background:var(--card-up); border:1px solid var(--border); border-radius:12px; overflow:hidden; }

.item-row { padding:14px 1rem; transition:background .18s var(--ease); }
.item-row + .item-row { border-top:1px solid rgba(255,255,255,0.05); }
.item-row:hover { background:rgba(255,255,255,0.02); }
.item-row--taken { background:rgba(110,231,183,0.04); }
.item-row--taken .item-name { text-decoration:line-through; color:var(--muted); }

.item-main { display:grid; grid-template-columns:auto 1fr auto auto; gap:.75rem; align-items:center; width:100%; }
.item-icon svg { width:22px; height:22px; fill:none; stroke:var(--mint); stroke-width:2;
                 stroke-linecap:round; stroke-linejoin:round; }
.item-body { min-width:0; display:flex; flex-direction:column; gap:3px; }
.item-name-row { display:inline-flex; align-items:center; gap:.5rem; min-width:0; }
.item-name { font-family:var(--serif); font-style:italic; font-size:17px; letter-spacing:-0.01em;
             color:var(--fg); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.item-meta { font-family:var(--mono); font-size:11px; color:var(--muted); font-variant-numeric:tabular-nums;
             white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* quiet actions: hidden until row hover so the check circle dominates */
.quiet-actions { display:inline-flex; align-items:center; gap:4px; opacity:0; transition:opacity .18s var(--ease); }
.item-row:hover .quiet-actions, .item-row:focus-within .quiet-actions { opacity:1; }
.low-btn,.del-btn { background:transparent; border:0; color:var(--muted); padding:4px 6px;
                    border-radius:6px; cursor:pointer; font-family:inherit; }
.low-btn:hover { color:var(--amber); background:rgba(245,158,11,0.08); }
.del-btn { font-size:18px; line-height:1; } .del-btn:hover { color:#ef4444; background:rgba(239,68,68,0.08); }

/* big circular log button: mint fill + glow + checkmark when on */
.check-btn { width:32px; height:32px; border-radius:50%; border:2px solid rgba(255,255,255,0.16);
             background:rgba(255,255,255,0.03); color:transparent; cursor:pointer; flex-shrink:0;
             display:inline-flex; align-items:center; justify-content:center; font-size:15px; font-weight:700; padding:0;
             transition:background .18s var(--ease), border-color .18s var(--ease), color .18s var(--ease),
                        box-shadow .18s var(--ease), transform .12s var(--ease); }
.check-btn:hover { border-color:var(--mint); }
.check-btn:active { transform:scale(0.92); }
.check-btn--on { background:var(--mint); border-color:var(--mint); color:var(--mint-ink); box-shadow:0 0 16px var(--mint-glow); }

@keyframes pulseAmber { 0%,100%{box-shadow:inset 0 0 0 0 rgba(245,158,11,0.30);} 50%{box-shadow:inset 0 0 0 2px rgba(245,158,11,0.40);} }
.item-row--missed { animation:pulseAmber 1.8s var(--ease) infinite; }
```

Note: the source uses a red pulse for missed. Vitality's color law is azure good / amber
caution / never red for nudges, so this recipe pulses amber instead.

### JS (toggle taken + mark missed)

```js
function bindStack(){
  document.querySelectorAll('.check-btn').forEach(btn=>{
    btn.onclick=()=>{
      const row=btn.closest('.item-row'), on=btn.classList.toggle('check-btn--on');
      row.classList.toggle('item-row--taken', on);
      if(on) row.classList.remove('item-row--missed');
      btn.innerHTML = on ? '<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.2 5 8.6 9.5 3.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '';
      btn.setAttribute('aria-pressed', on);
      // persist + report() to Vee here
    };
  });
}
// "missed": current hour past the window cutoff and not taken
function markMissed(){
  const hour=new Date().getHours()+new Date().getMinutes()/60;
  document.querySelectorAll('.win-group').forEach((g,i)=>{
    const cut=WINDOWS[i]?.cutoff; if(cut==null) return;
    g.querySelectorAll('.item-row:not(.item-row--taken)').forEach(r=>r.classList.toggle('item-row--missed', hour>cut));
  });
}
```

Dose + tag pills: the source keeps dose/note as a single mono meta line. For richer
"with food / empty stomach / before bed" tags, render small mono chips under the name,
color-coded by tone (food=amber, water=mint, timing=mint, empty/habit=muted).
