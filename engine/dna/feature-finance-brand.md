# Feature DNA: Finance + Brand (money + KPI tiles)

Sealed-HTML recipes distilled from Vitality's Finance and Brand modules. Plain
HTML/CSS/vanilla-JS/inline-SVG. No libraries, no build step. Copy a block, rename
the classes, feed it real numbers.

Tokens used below (define once at `:root`):

```css
:root{
  --bg:#000; --fg:#fff;
  --mint:#6EE7B7;                /* good / up */
  --amber:#F59E0B;               /* caution / down / outflow (NOT red) */
  --muted:rgba(255,255,255,.5); --muted-strong:rgba(255,255,255,.7);
  --card:rgba(255,255,255,.02); --border:rgba(255,255,255,.08);
  --ease:cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-premium:cubic-bezier(.16,1,.3,1);
}
```

Color law: mint = up/good, amber = caution/down/outflow. Never red for an
ordinary down move (a market dip and a renewal-due are not errors). Numbers
always `font-variant-numeric:tabular-nums` so digits do not jitter.

---

## 1. Net-worth header (big number + 24h delta pill)

A serif-italic label, a 38px bold total, and a delta pill that flips mint/amber.

```html
<header class="nw-hero">
  <div>
    <div class="nw-label">Net worth</div>
    <div class="nw-num-row">
      <span class="nw-num">CHF 48,210</span>
      <!-- up: class up · sign + ; down: class down · sign - (minus glyph) -->
      <span class="delta-pill up">+CHF 320<span class="delta-pct">+0.67%</span><span class="delta-win">24h</span></span>
    </div>
    <div class="nw-break">Bank 41% · Stocks 33% · Crypto 26%</div>
  </div>
</header>
```

```css
.nw-hero{display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px}
.nw-label{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.nw-num-row{display:inline-flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-top:4px}
.nw-num{font-size:38px;font-weight:700;line-height:1.05;font-variant-numeric:tabular-nums}
.nw-break{font-size:11px;color:var(--muted);margin-top:6px;font-variant-numeric:tabular-nums}
.delta-pill{display:inline-flex;align-items:baseline;gap:6px;font-size:11px;font-weight:600;
  font-variant-numeric:tabular-nums;letter-spacing:.02em;padding:3px 9px;border-radius:999px;
  border:1px solid transparent;background:rgba(255,255,255,.04);color:var(--muted-strong);white-space:nowrap}
.delta-pill.up  {background:rgba(110,231,183,.10);border-color:rgba(110,231,183,.22);color:var(--mint)}
.delta-pill.down{background:rgba(245,158,11,.10); border-color:rgba(245,158,11,.22); color:var(--amber)}
.delta-pill.flat{color:var(--muted);font-style:italic}
.delta-pct{font-size:10px} .delta-win{font-size:10px;color:var(--muted)}
```

Delta math (latest vs snapshot ~24h ago): skip the pill if you have under an hour
of separation, and if `|baseline| < 0.005` show the amount only, no percent (a
0 -> 1000 jump should not read as +999900%).

---

## 2. Account / subscription rows

A category card: serif-italic label + tabular total on the head, then rows. Each
row = name (with optional accent dot) · amount · delete. Amounts are tap-to-edit
(dotted mint underline signals it). Subscription rows are the same shape with a
"due in Nd" tail instead of a delete.

```html
<div class="acct-card">
  <div class="acct-head">
    <span class="acct-label">Bank accounts</span>
    <span class="acct-total">CHF 19,840 <span class="acct-pct">· 41.2%</span></span>
  </div>
  <div class="acct-list">
    <div class="acct-row">
      <span class="acct-name-wrap">
        <span class="acct-dot" style="background:#6EE7B7"></span>
        <span class="acct-name" tabindex="0" title="Tap to rename">Revolut</span>
      </span>
      <span class="acct-amt" tabindex="0" title="Tap: type +500, -200, or a new total">CHF 8,210</span>
      <button class="acct-del" title="Delete">&times;</button>
    </div>
  </div>
  <button class="acct-add">+ add</button>
</div>
```

```css
.acct-card{display:flex;flex-direction:column;gap:12px;padding:16px;background:var(--card);
  border:1px solid var(--border);border-radius:12px}
.acct-head{display:flex;align-items:baseline;justify-content:space-between}
.acct-label{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:16px;color:var(--muted-strong)}
.acct-total{font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}
.acct-pct{color:var(--muted);font-weight:400}
.acct-list{display:flex;flex-direction:column}
.acct-row{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:12px;
  padding:8px 10px;border-radius:8px;transition:background .35s var(--ease)}
.acct-row:hover{background:rgba(255,255,255,.03)}
.acct-name-wrap{display:flex;align-items:center;gap:8px;min-width:0}
.acct-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto;box-shadow:0 0 6px rgba(255,255,255,.12)}
.acct-name{font-size:13px;color:var(--fg);cursor:pointer}
.acct-amt{font-size:13px;font-weight:500;text-align:right;color:var(--fg);cursor:pointer;font-variant-numeric:tabular-nums}
/* dotted mint underline = "this is tappable to edit" (works on touch, no hover needed) */
.acct-name,.acct-amt{text-decoration:underline dotted rgba(110,231,183,.22);text-underline-offset:3px;
  border-radius:4px;padding:2px 4px}
.acct-del{background:none;border:0;color:var(--muted);font-size:16px;cursor:pointer;line-height:1}
.acct-add{align-self:flex-start;background:none;border:0;color:var(--mint);font-size:12px;cursor:pointer;padding:2px 0}
```

Inline-edit amount trick (vanilla): on tap, swap the `<span>` for an `<input>`.
Accept `+500` / `-200` as a delta off the current value, or a bare number as a
new total. Per-row accent dots are picked deterministically from the row id so a
given account keeps its color across sessions:

```js
const DOTS=['#6EE7B7','#34D399','#5EEAD4','#38BDF8','#818CF8','#C084FC','#F472B6','#FBBF24','#FB923C','#A3E635'];
function dotFor(id){let h=0;for(const ch of id)h=(h*31+ch.charCodeAt(0))>>>0;return DOTS[h%DOTS.length];}
```

Subscription / renewal ticker (rotates the soonest renewal, amber when <= 5 days
out): one absolutely-positioned item per sub, only `.active` is visible, advance
the index every 5s. Pause on hover/focus and skip entirely under
`prefers-reduced-motion`. Tail label: `today` / `tomorrow` / `in Nd` / `Nd late`.

---

## 3. Candlestick chart motif (Finance tile background)

A market candle chart over a faint price grid on a warm amber base. Candles draw
in left to right; the last one blinks "live". Pure CSS + a static candle list.
Each candle: `bodyH` body height as a fraction of column height (scaled x0.6),
`wickTop` wick height as a fraction, `dir` up (mint) or down (amber). No JS loop
needed: emit the spans, set per-candle `animation-delay`.

```html
<div class="fin-tile">
  <div class="fin-base"></div>
  <div class="fin-axis"></div>
  <div class="fin-candles">
    <!-- repeat per candle; .last on the final one for the live blink -->
    <div class="c up"   style="animation-delay:.30s"><span class="wick" style="height:70%"></span><span class="body" style="height:30%"></span></div>
    <div class="c down" style="animation-delay:.42s"><span class="wick" style="height:40%"></span><span class="body" style="height:33%"></span></div>
    <div class="c up"   style="animation-delay:.54s"><span class="wick" style="height:66%"></span><span class="body" style="height:24%"></span></div>
    <div class="c down" style="animation-delay:.66s"><span class="wick" style="height:50%"></span><span class="body" style="height:37%"></span></div>
    <div class="c up"   style="animation-delay:.78s"><span class="wick" style="height:78%"></span><span class="body" style="height:30%"></span></div>
    <div class="c up last" style="animation-delay:.90s"><span class="wick" style="height:95%"></span><span class="body" style="height:40%"></span></div>
  </div>
</div>
```

```css
.fin-tile{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.fin-base{position:absolute;inset:0;
  background:radial-gradient(ellipse 80% 75% at 50% 38%,rgba(217,142,60,.18) 0%,rgba(90,44,24,.4) 50%,rgba(20,12,9,1) 100%)}
.fin-axis{position:absolute;inset:0;opacity:.5;
  background:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px);background-size:100% 38px}
.fin-candles{position:absolute;left:8%;right:8%;top:44px;bottom:84px;
  display:flex;align-items:center;justify-content:space-between}
.c{position:relative;width:9px;height:100%;display:flex;align-items:center;justify-content:center;
  opacity:0;animation:finCandle .5s var(--ease) forwards}
.c.up{color:var(--mint)} .c.down{color:#e0795f}  /* warm down, never pure red */
.wick{position:absolute;width:1px;background:currentColor}
.body{width:7px;border-radius:1px;background:currentColor;box-shadow:0 0 6px currentColor}
@keyframes finCandle{to{opacity:.95}}
.c.last{animation:finCandle .5s var(--ease) forwards,finBlink 4.5s 2s ease-in-out infinite}
@keyframes finBlink{0%,100%{filter:brightness(1)}50%{filter:brightness(1.5)}}
@media (prefers-reduced-motion:reduce){.c,.c.last{animation:none;opacity:.95}}
```

`body height` is set as `bodyH * 60`% of the column; `wick height` as
`wickTop * 100`%. The down candle uses a warm `#e0795f`, not red, so a dip still
reads on-brand.

---

## 4. KPI card (target progress + 7d delta + line chart)

Brand's per-metric card: label + delta chip on the head, a big serif-italic value
with its goal, an animated line chart with a dashed target line, and a progress
bar with a "% · N to go" / "Goal hit" caption.

```html
<article class="kpi-card">
  <header class="kpi-head">
    <span class="kpi-label">MRR</span>
    <span class="delta-chip up">&uarr; $420</span> <!-- &uarr; up / &darr; down -->
  </header>
  <div class="kpi-value-row">
    <span class="kpi-value">$3,180</span>
    <span class="kpi-goal">goal $5,000</span>
  </div>
  <div class="kpi-plot"><!-- inline SVG line chart from section 5 --></div>
  <div class="kpi-pace">
    <div class="prog-track"><div class="prog-fill" style="width:64%"></div></div>
    <span class="kpi-pace-text">64% &middot; $1,820 to go</span>
  </div>
</article>
```

```css
.kpi-card{display:flex;flex-direction:column;gap:8px;padding:16px;background:var(--card);
  border:1px solid var(--border);border-radius:8px;transition:border-color .35s var(--ease),background .35s var(--ease)}
.kpi-card:hover{border-color:rgba(110,231,183,.3);background:rgba(110,231,183,.03)}
.kpi-head{display:flex;align-items:center;justify-content:space-between}
.kpi-label{font-size:13px;color:var(--muted-strong)}
.kpi-value-row{display:flex;align-items:baseline;gap:10px}
.kpi-value{font-family:Georgia,serif;font-style:italic;font-size:28px;line-height:1;font-variant-numeric:tabular-nums}
.kpi-goal{font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.kpi-pace{display:flex;flex-direction:column;gap:6px;margin-top:2px}
.kpi-pace-text{font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted-strong)}
/* delta chip */
.delta-chip{display:inline-flex;align-items:center;padding:3px 9px;border-radius:999px;
  font-family:ui-monospace,monospace;font-size:11px;font-weight:600;letter-spacing:.02em;font-variant-numeric:tabular-nums}
.delta-chip.up  {background:rgba(110,231,183,.10);color:var(--mint); border:1px solid rgba(110,231,183,.32)}
.delta-chip.down{background:rgba(245,158,11,.10); color:var(--amber);border:1px solid rgba(245,158,11,.30)}
/* progress bar (mint fill with a soft glow; gradient when complete) */
.prog-track{height:4px;background:rgba(255,255,255,.05);border-radius:999px;overflow:hidden}
.prog-fill{height:100%;background:var(--mint);border-radius:999px;transition:width .5s var(--ease);
  box-shadow:0 0 10px rgba(110,231,183,.4)}
.prog-fill.done{background:linear-gradient(90deg,rgba(110,231,183,.7),var(--mint))}
@media (prefers-reduced-motion:reduce){.prog-fill{transition:none}}
```

`pct = clamp(value / goal * 100, 0, 100)`. Caption: at >= 100% show
`Goal hit` with an inline-SVG check; otherwise ``${round(pct)}% &middot;
${remaining} to go``. The "follower momentum" hero (Brand analytics) is the same
pattern at 44px: total reach value + a "this week" / "this month" delta chip pair
+ a `N to <milestone>` hint, beside a sparkline.

---

## 5. Line chart / sparkline (draw-in + area + target line)

One SVG primitive serves the KPI plot, the follower sparkline, and the net-worth
line. Index-spaced x, min/max-scaled y, a soft area fill, a draw-in via
`stroke-dasharray`, a dot on the latest point, and an optional dashed target
line. `preserveAspectRatio="none"` lets it stretch to any container width.

```html
<svg class="spark" viewBox="0 0 240 64" preserveAspectRatio="none" width="100%" height="64" aria-hidden="true">
  <defs>
    <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--mint)" stop-opacity=".22"/>
      <stop offset="100%" stop-color="var(--mint)" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <polygon class="spark-area" fill="url(#sparkFill)"/>     <!-- 0,H ...pts H...  W,H -->
  <line class="spark-target" stroke="var(--mint)" stroke-width="1" stroke-dasharray="3 4" opacity=".55"/>
  <polyline class="spark-line" fill="none" stroke="var(--mint)" stroke-width="1.5"
            stroke-linecap="round" stroke-linejoin="round"/>
  <circle class="spark-dot" r="2.5" fill="var(--mint)"/>
</svg>
```

```js
function drawSpark(svg, values, target){
  const W=240,H=64,pad=6;
  const hasT=Number.isFinite(target);
  const lo=Math.min(...values, ...(hasT?[target]:[]));
  const hi=Math.max(...values, ...(hasT?[target]:[]));
  const range=(hi-lo)||1;
  const xOf=i=>(i/(values.length-1))*W;
  const yOf=v=>H-pad-((v-lo)/range)*(H-pad*2);
  const pts=values.map((v,i)=>`${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
  svg.querySelector('.spark-line').setAttribute('points',pts);
  svg.querySelector('.spark-area').setAttribute('points',`0,${H} ${pts} ${W},${H}`);
  const dot=svg.querySelector('.spark-dot');
  dot.setAttribute('cx',W); dot.setAttribute('cy',yOf(values.at(-1)));
  const tl=svg.querySelector('.spark-target');
  if(hasT){tl.setAttribute('x1',0);tl.setAttribute('x2',W);tl.setAttribute('y1',yOf(target));tl.setAttribute('y2',yOf(target));}
  else tl.remove();
}
```

```css
/* draw-in: start dashed-offset, flip .drawn (set via requestAnimationFrame) to draw */
.spark-line{stroke-dasharray:480;stroke-dashoffset:480;transition:stroke-dashoffset .8s cubic-bezier(.32,.72,0,1)}
.spark-area,.spark-dot{opacity:0;transition:opacity .6s ease .2s}
.spark.drawn .spark-line{stroke-dashoffset:0}
.spark.drawn .spark-area{opacity:1} .spark.drawn .spark-dot{opacity:1;transition-delay:.6s}
@media (prefers-reduced-motion:reduce){.spark .spark-line{transition:none;stroke-dashoffset:0}
  .spark-area,.spark-dot{transition:none;opacity:1}}
```

For the net-worth line use a smooth Catmull-Rom path instead of a polyline and an
up/down color that follows the period delta (mint up, amber down). The
green up / amber down read carries the whole money story without text, but always
mirror it in an `aria-label` ("7-day trend: up 4.2%") since it is otherwise
color-only.

---

## 6. Live FX / odometer count-up

When a refreshed number lands, tween it like a stock-app odometer (easeOutQuint:
fast then glides in). No animation on first paint, only on change, so a refresh
feels like a win.

```js
function countUp(el, to, fmt = n => Math.round(n).toLocaleString(), ms = 900){
  const from = Number(el.dataset.v || to); el.dataset.v = to;
  if (from === to){ el.textContent = fmt(to); return; }
  const t0 = performance.now();
  (function tick(now){
    const t = Math.min(1,(now-t0)/ms);
    const eased = 1-Math.pow(1-t,5);              // easeOutQuint
    el.textContent = fmt(from + (to-from)*eased);
    if (t<1) requestAnimationFrame(tick);
  })(performance.now());
}
```

Live FX / quotes in a sealed tile: a tile cannot hold API keys, so let the user
paste a rate or tap "refresh", cache it with a timestamp in `localStorage`, and
show a `· cached` tag when a value is stale rather than blanking it. Format money
as `<code>CCY 1,234.56</code>` with `tabular-nums`; convert on display, store one
base currency.
