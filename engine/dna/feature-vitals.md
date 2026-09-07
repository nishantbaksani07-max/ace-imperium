# Vitals: signal card, score ring, trend graph, stat grid (sealed-HTML)

Copy-paste recipes for a "readings" tile. Everything is inline HTML + CSS + vanilla JS + inline SVG. No libraries.

## Color law (do not break)

```
mint  #6EE7B7   good, trend line, the workout/fuel side
azure #5E9BFF   the Vitals accent (good). amber's "good" sibling
amber #F59E0B   caution / watch / a recover day. NOT a failure
```

Never red for a non-destructive state. A recover day is the body asking for less. Meaning must ride on a word + shape too (`Low`, `Good`, an arrow), never hue alone, so it survives colorblindness and grayscale.

Drop these tokens once on the page root (`:root` or the tile's outer element):

```css
:root{
  --bg:#000; --fg:#fff; --card:rgba(255,255,255,.02);
  --muted:rgba(255,255,255,.5); --muted-strong:rgba(255,255,255,.7);
  --border:rgba(255,255,255,.08); --border-strong:rgba(255,255,255,.16);
  --azure:#5E9BFF; --azure-hi:#8DB8FF; --azure-glow:rgba(94,155,255,.42);
  --amber:#F59E0B; --mint:#6EE7B7;
  --serif:Georgia,'Instrument Serif',serif; --mono:'SF Mono',monospace;
}
```

## 1. The signal card (push / steady / recover)

One fused daily verdict: a badge, a serif headline, a plain "why", and the source chips that fed it. push + steady use azure; recover uses amber. Both read as healthy.

```html
<section class="sig-card sig-accent">  <!-- swap to sig-amber for recover -->
  <span class="sig-badge">
    <span class="sig-ic">&#9650;</span> Ready to push   <!-- glyphs below -->
  </span>
  <p class="sig-line">Green light. Your body is primed, go after it today.</p>
  <p class="sig-why">Recovery is strong at 72. Go use it.</p>
  <div class="sig-row">
    <div class="sig-chip"><span class="sig-arr sig-up">&#8593;</span>
      <span class="sig-t"><span class="sig-v">Recovery 72</span><span class="sig-m">WHOOP &middot; high</span></span></div>
    <div class="sig-chip"><span class="sig-arr sig-flat">&#8594;</span>
      <span class="sig-t"><span class="sig-v">3 hard days</span><span class="sig-m">Train &middot; on track</span></span></div>
    <div class="sig-chip"><span class="sig-arr sig-up">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>
    </span><span class="sig-t"><span class="sig-v">Fuel on track</span><span class="sig-m">Fuel &middot; adequate</span></span></div>
  </div>
</section>
```

Badge glyphs (HTML entities, no emoji): push `&#9650;` (▲), steady `&#9632;` (■), recover `&#9670;` (◆). Chip arrows: up `&#8593;` ↑, flat `&#8594;` →, down `&#8595;` ↓. A "good" check renders as the inline SVG above; never a unicode checkmark.

```css
.sig-card{position:relative;overflow:hidden;border-radius:18px;padding:2rem;
  display:flex;flex-direction:column;gap:1.25rem;
  border:1px solid rgba(94,155,255,.22);
  background:radial-gradient(130% 90% at 0 0,rgba(94,155,255,.08),transparent 55%),var(--card);
  box-shadow:0 0 0 1px rgba(94,155,255,.07),0 0 70px -30px var(--azure-glow);}
.sig-amber{border-color:rgba(245,158,11,.22);
  background:radial-gradient(130% 90% at 0 0,rgba(245,158,11,.08),transparent 55%),var(--card);
  box-shadow:0 0 0 1px rgba(245,158,11,.07),0 0 70px -30px rgba(245,158,11,.4);}
.sig-badge{align-self:flex-start;display:inline-flex;align-items:center;gap:7px;
  font-family:var(--mono);font-size:.6rem;font-weight:600;letter-spacing:.16em;
  text-transform:uppercase;padding:6px 12px;border-radius:999px;}
.sig-ic{font-weight:700}
.sig-accent .sig-badge{color:var(--azure);border:1px solid rgba(94,155,255,.4);background:rgba(94,155,255,.07)}
.sig-amber  .sig-badge{color:var(--amber);border:1px solid rgba(245,158,11,.4);background:rgba(245,158,11,.07)}
.sig-line{font-family:var(--serif);font-style:italic;font-size:clamp(1.5rem,2.8vw,2rem);
  line-height:1.2;margin:0;color:var(--fg)}
.sig-why{font-size:.875rem;color:var(--muted);line-height:1.6;max-width:60ch;margin:0}
.sig-row{display:flex;gap:12px;flex-wrap:wrap}
.sig-chip{display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:13px;
  border:1px solid var(--border);background:rgba(255,255,255,.04)}
.sig-arr{font-family:var(--mono);font-weight:700;display:inline-flex}
.sig-up{color:var(--azure)} .sig-flat{color:var(--muted-strong)} .sig-down{color:var(--amber)}
.sig-t{display:flex;flex-direction:column;line-height:1.25}
.sig-v{font-size:.95rem;color:var(--fg);font-weight:500}
.sig-m{font-family:var(--mono);font-size:.54rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
@media(max-width:680px){.sig-card{padding:1.5rem}}
```

The lean rule (port of the engine, plain JS): start from recovery band (high→push, mid→steady, low→recover), then only ever step DOWN toward recover. Injury or a "gentle pace" caps at steady; recent heavy load or being under on fuel steps one toward recover. Recover is always amber-toned, never alarmed.

## 2. The 0-100 score ring

Inline SVG. Two stacked circles: a faint track and an azure arc. The arc length is `2*PI*r`; offset it by `(1 - pct/100)` of that.

```html
<div class="ring" style="--r:44">
  <svg width="132" height="132">
    <circle cx="66" cy="66" r="44" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="9"/>
    <circle id="ringArc" cx="66" cy="66" r="44" fill="none" stroke="var(--azure)" stroke-width="9"
      stroke-linecap="round" transform="rotate(-90 66 66)"/>
  </svg>
  <div class="ring-in"><span class="ring-val">74</span><span class="ring-lbl">Vitality</span></div>
</div>
<script>
  (function(){var r=44,c=2*Math.PI*r,pct=74,a=document.getElementById('ringArc');
   a.style.strokeDasharray=c; a.style.strokeDashoffset=c*(1-pct/100);})();
</script>
```

```css
.ring{position:relative;width:132px;height:132px}
.ring svg{display:block}
#ringArc{filter:drop-shadow(0 0 5px rgba(94,155,255,.45));transition:stroke-dashoffset 1s cubic-bezier(.16,1,.3,1)}
.ring-in{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.ring-val{font-family:var(--serif);font-style:italic;font-size:3rem;line-height:.9;color:var(--azure);font-variant-numeric:tabular-nums}
.ring-lbl{font-family:var(--mono);font-size:.6rem;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin-top:6px}
```

`transform="rotate(-90 ...)"` starts the arc at 12 o'clock. The CSS transition makes it sweep on load. For an amber/caution score, swap the arc `stroke` to `var(--amber)` and the value color to match. Big-number variant for a score header: serif italic `4rem` azure with `text-shadow:0 0 38px rgba(94,155,255,.4)`, and a small `/100` in mono muted.

## 3. The trend graph

Inline SVG path with `preserveAspectRatio="none"` so it stretches to any width. A filled area under a stroked line, plus a dot on the latest point. Hand-author a smooth path or build one from data (below).

```html
<div class="chart">
  <svg viewBox="0 0 680 130" preserveAspectRatio="none">
    <defs><linearGradient id="vt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#6EE7B7" stop-opacity=".26"/>
      <stop offset="100%" stop-color="#6EE7B7" stop-opacity="0"/>
    </linearGradient></defs>
    <path id="area" fill="url(#vt)"/>
    <path id="line" fill="none" stroke="#6EE7B7" stroke-width="2.5" stroke-linecap="round"/>
    <circle id="tip" r="4.2" fill="#6EE7B7"/>
  </svg>
</div>
<div class="axis"><span>14 days ago</span><span>last week</span><span>today</span></div>
<script>
 (function(){
   var data=[61,63,60,66,64,70,68,72,71,74,73,77,76,80]; // scores 0-100
   var W=680,H=130,n=data.length,mn=Math.min.apply(0,data),mx=Math.max.apply(0,data),pad=10;
   var pts=data.map(function(v,i){
     return [i/(n-1)*W, H-pad - (v-mn)/((mx-mn)||1)*(H-2*pad)];});
   var d=pts.map(function(p,i){return (i?'L':'M')+p[0].toFixed(1)+','+p[1].toFixed(1);}).join(' ');
   document.getElementById('line').setAttribute('d',d);
   document.getElementById('area').setAttribute('d',d+' L'+W+','+H+' L0,'+H+' Z');
   var last=pts[n-1];var t=document.getElementById('tip');
   t.setAttribute('cx',last[0]);t.setAttribute('cy',last[1]);
 })();
</script>
```

```css
.chart svg{width:100%;height:130px;display:block}
.axis{display:flex;justify-content:space-between;margin-top:.5rem}
.axis span{font-family:var(--mono);font-size:.62rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
```

Use `mint` for an improving/healthy trend. Use `azure` to match the page accent. For a declining-but-fine metric, amber. The dot marks today. Want curves instead of straight segments: the `M`/`L` joins are crisp and good enough at tile scale; smoothing is optional polish, not required.

A bare bar-strip version (last-7-days), no SVG needed, height drives the value:

```html
<div class="strip">
  <!-- repeat per day; add class "watch" for an amber bar -->
  <div class="col"><div class="bw"><div class="bar" style="height:68%"></div></div>
    <span class="bs">68</span><span class="bd">Sun</span></div>
</div>
```

```css
.strip{display:grid;grid-template-columns:repeat(7,1fr);gap:.5rem}
.col{display:flex;flex-direction:column;align-items:center;gap:10px}
.bw{height:84px;width:100%;display:flex;align-items:flex-end;justify-content:center}
.bar{width:60%;max-width:26px;border-radius:6px;background:linear-gradient(180deg,var(--azure),rgba(94,155,255,.25))}
.col.watch .bar{background:linear-gradient(180deg,var(--amber),rgba(245,158,11,.25))}
.bs{font-family:var(--mono);font-size:.66rem;color:var(--muted-strong)}
.bd{font-family:var(--mono);font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
```

## 4. The stat grid

A responsive grid of metric tiles. Each tile: a mono name, a Good/Low tag (azure/amber), a serif value with a small unit, one plain reason line.

```html
<div class="nums">
  <div class="metric">
    <div class="m-top"><span class="m-name">HRV</span><span class="m-tag ok">Good</span></div>
    <div class="m-val">88<small>ms</small></div>
    <div class="m-why">Above baseline. Nervous system ready to push.</div>
  </div>
  <div class="metric">
    <div class="m-top"><span class="m-name">Deep sleep</span><span class="m-tag watch">Low</span></div>
    <div class="m-val">1.0<small>h</small></div>
    <div class="m-why">Vs 1.5h norm. The strength window.</div>
  </div>
</div>
```

```css
.nums{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}
@media(max-width:900px){.nums{grid-template-columns:1fr 1fr}}
@media(max-width:520px){.nums{grid-template-columns:1fr}}
.metric{border:1px solid var(--border);border-radius:14px;padding:1rem 1.25rem;background:var(--card);
  display:flex;flex-direction:column;gap:.5rem;transition:border-color .2s,transform .2s}
.metric:hover{border-color:rgba(94,155,255,.32);transform:translateY(-2px)}
.m-top{display:flex;align-items:center;justify-content:space-between}
.m-name{font-family:var(--mono);font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.m-tag{font-family:var(--mono);font-size:.58rem;letter-spacing:.06em;text-transform:uppercase;padding:3px 8px;border-radius:6px}
.m-tag.ok{color:var(--azure);background:rgba(94,155,255,.1)}
.m-tag.watch{color:var(--amber);background:rgba(245,158,11,.1)}
.m-val{font-family:var(--serif);font-style:italic;font-size:2.1rem;line-height:1;color:var(--fg)}
.m-val small{font-style:normal;font-family:var(--mono);font-size:.8rem;color:var(--muted);margin-left:3px}
.m-why{font-size:.72rem;line-height:1.5;color:var(--muted)}
```

## Section eyebrow (numbered headers above each block)

```html
<div class="eyebrow"><span class="eb-num">&middot;01</span>
  <span class="eb-lbl">Today</span><span class="eb-rule"></span></div>
```

```css
.eyebrow{display:flex;align-items:center;gap:.75rem;margin-bottom:1rem}
.eb-num{font-family:var(--serif);font-style:italic;font-size:1.1rem;color:var(--azure);line-height:1}
.eb-lbl{font-family:var(--mono);font-size:.7rem;letter-spacing:.22em;text-transform:uppercase;color:var(--muted-strong)}
.eb-rule{flex:1;height:1px;background:linear-gradient(90deg,var(--border-strong),transparent)}
```

Stack in order: `&middot;01` signal card, `&middot;02` score ring + trend, `&middot;03` stat grid, `&middot;04` 7-day strip.
