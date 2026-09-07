# Vitality tile components

Copy-paste blocks for a sealed single-file HTML tile. No libraries, no React. Inline everything.
Color law: mint = good/brand, azure = data, amber = caution, never red, iris is Vee-only (do not use iris for a general tile). No emojis in UI, use inline SVG.

## Tokens (paste once in :root)

```css
:root{
  --bg:#000; --fg:#ffffff; --text:#e9efe9;
  --mint:#6EE7B7; --mint-glow:rgba(110,231,183,.4);
  --amber:#F59E0B; --amber-glow:rgba(245,158,11,.4); --iris:#a78bfa;
  --muted:rgba(255,255,255,.46); --muted-strong:rgba(255,255,255,.68);
  --border:rgba(255,255,255,.08); --border-strong:rgba(255,255,255,.15);
  --serif:'Instrument Serif',Georgia,serif;
  --mono:'JetBrains Mono',monospace;
  --inter:'Inter',system-ui,sans-serif;
  --ease:cubic-bezier(0.2,0.8,0.2,1);
  --ease-premium:cubic-bezier(.16,1,.3,1);
  --spring:cubic-bezier(0.34,1.56,0.64,1);
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--inter);line-height:1.5;-webkit-font-smoothing:antialiased}
```

Fonts (one link in head): `Inter:wght@400;500;600`, `Instrument+Serif:ital@0;1`, `JetBrains+Mono:wght@400;500`.

## Card / panel

```css
.card{position:relative;border:1px solid var(--border);border-radius:18px;
  background:linear-gradient(180deg,rgba(255,255,255,.02),rgba(255,255,255,.003));
  padding:28px 32px;overflow:hidden}
.card::before{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;
  background:radial-gradient(44% 64% at 12% 32%,rgba(110,231,183,.07),transparent 70%),
            radial-gradient(50% 52% at 97% 2%,rgba(255,255,255,.04),transparent 72%)}
.card>*{position:relative;z-index:1}
```

```html
<div class="card"> ...content... </div>
```

## Section header / eyebrow

```css
.eyebrow{display:flex;align-items:center;gap:12px;margin:28px 0 0}
.eyebrow .num{font-family:var(--serif);font-style:italic;font-size:1.1rem;color:var(--mint);line-height:1}
.eyebrow .lbl{font-family:var(--mono);font-size:.6rem;letter-spacing:.22em;text-transform:uppercase;color:var(--muted-strong)}
.eyebrow .rule{flex:1;height:1px;background:linear-gradient(90deg,var(--border-strong),transparent)}
/* standalone uppercase mono eyebrow */
.whyLabel{font-family:var(--mono);font-size:.56rem;letter-spacing:.2em;text-transform:uppercase;color:var(--muted)}
```

```html
<div class="eyebrow"><span class="num">·01</span><span class="lbl">Section</span><span class="rule"></span></div>
```

## Rounded input

```css
.input{font-family:var(--inter);font-size:.92rem;color:var(--fg);width:100%;
  border:1px solid var(--border-strong);background:rgba(255,255,255,.022);border-radius:12px;
  padding:11px 14px;outline:none;transition:border-color .2s var(--ease),background .2s var(--ease)}
.input::placeholder{color:var(--muted)}
.input:focus{border-color:rgba(110,231,183,.45);background:rgba(110,231,183,.04)}
```

```html
<input class="input" placeholder="Type here" />
```

## Pill

```css
.pill{display:inline-flex;align-items:center;gap:8px;cursor:pointer;white-space:nowrap;
  background:rgba(110,231,183,.06);border:1px solid rgba(110,231,183,.26);border-radius:999px;
  padding:8px 15px;color:var(--mint);font-size:.82rem;font-weight:500;font-family:var(--inter);transition:.2s var(--ease)}
.pill:hover{border-color:rgba(110,231,183,.55);background:rgba(110,231,183,.11);color:#d6f7ea}
.pill svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
```

```html
<span class="pill"><svg viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/></svg>Label</span>
```

## Mint primary button

```css
.btn{font-family:var(--inter);font-size:.88rem;font-weight:600;cursor:pointer;
  border:1px solid rgba(110,231,183,.5);border-radius:12px;padding:11px 18px;
  background:rgba(110,231,183,.12);color:var(--mint);
  transition:transform .2s var(--spring),background .2s var(--ease),box-shadow .2s var(--ease)}
.btn:hover{background:rgba(110,231,183,.18);box-shadow:0 6px 24px -12px var(--mint-glow);transform:translateY(-1px)}
.btn:active{transform:scale(.97)}
/* ghost variant */
.btn.ghost{background:transparent;border-color:var(--border-strong);color:var(--muted-strong)}
.btn.ghost:hover{border-color:var(--mint);color:var(--mint);box-shadow:none}
```

```html
<button class="btn">Save</button>
```

## Spark action (flat color-coded text + icon, lights up on hover/tap, no idle glow)

Idle state is flat and muted. On hover or active it gains color, a subtle lift, and a one-shot ripple.

```css
.spark{position:relative;display:inline-flex;align-items:center;gap:8px;cursor:pointer;
  border:1px solid var(--border);background:rgba(255,255,255,.02);border-radius:12px;padding:9px 13px;
  font-family:var(--inter);transition:transform .25s var(--spring),border-color .25s var(--ease),background .25s var(--ease)}
.spark .ic{width:15px;height:15px;flex:none;stroke:currentColor;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;color:var(--muted-strong);transition:color .25s var(--ease),transform .25s var(--spring)}
.spark .lb{font-family:var(--mono);font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted-strong)}
.spark:hover{border-color:var(--border-strong)}
/* good (mint) on hover or .active */
.spark.good:hover,.spark.good.active{background:rgba(110,231,183,.09);border-color:rgba(110,231,183,.4);box-shadow:0 6px 24px -12px var(--mint-glow);transform:translateY(-1px)}
.spark.good:hover .ic,.spark.good:hover .lb,.spark.good.active .ic,.spark.good.active .lb{color:var(--mint)}
/* watch (amber) on hover or .active */
.spark.watch:hover,.spark.watch.active{background:rgba(245,158,11,.09);border-color:rgba(245,158,11,.42);box-shadow:0 6px 24px -12px var(--amber-glow);transform:translateY(-1px)}
.spark.watch:hover .ic,.spark.watch:hover .lb,.spark.watch.active .ic,.spark.watch.active .lb{color:var(--amber)}
.spark.active .ic{transform:scale(1.12)}
.spark:active{transform:scale(.96)}
/* one-shot ripple on apply: JS toggles .fire (remove, reflow, add) */
.spark::after{content:'';position:absolute;inset:-1px;border-radius:12px;pointer-events:none;opacity:0;border:1px solid currentColor;color:var(--mint)}
.spark.watch::after{color:var(--amber)}
.spark.fire::after{animation:sparkfx .55s var(--ease)}
@keyframes sparkfx{0%{opacity:.55;transform:scale(1)}100%{opacity:0;transform:scale(1.12)}}
```

```html
<button class="spark good"><svg class="ic" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg><span class="lb">Apply</span></button>
```

```js
// trigger the ripple when applied
function fireSpark(el){el.classList.remove('fire');void el.offsetWidth;el.classList.add('fire');}
```

## Progress bar

```css
.bar{height:8px;border-radius:999px;background:rgba(255,255,255,.11);overflow:hidden}
.bar>i{display:block;height:100%;width:0;border-radius:999px;background:var(--mint);
  box-shadow:0 0 7px var(--mint-glow);transition:width 1s var(--ease)}
.bar.watch>i{background:var(--amber);box-shadow:0 0 7px var(--amber-glow)}
```

```html
<div class="bar"><i style="width:68%"></i></div>
```

Dot-pip variant (discrete points, staggered fill):

```css
.pips{display:flex;gap:5px}
.pips .pip{width:9px;height:9px;border-radius:50%;background:rgba(255,255,255,.13);transition:background .35s var(--ease),box-shadow .35s var(--ease)}
.pips .pip.on{background:var(--mint);box-shadow:0 0 7px var(--mint-glow)}
.pips.watch .pip.on{background:var(--amber);box-shadow:0 0 7px var(--amber-glow)}
```

## Tier / category badge

```css
.badge{display:inline-flex;align-items:center;gap:6px;font-family:var(--mono);font-size:.56rem;
  letter-spacing:.16em;text-transform:uppercase;border-radius:999px;padding:4px 10px;
  border:1px solid var(--border-strong);color:var(--muted-strong);background:rgba(255,255,255,.022)}
.badge.good{color:var(--mint);border-color:rgba(110,231,183,.4);background:rgba(110,231,183,.08)}
.badge.watch{color:var(--amber);border-color:rgba(245,158,11,.42);background:rgba(245,158,11,.08)}
/* Vee-surface badge: iris is Vee-only, never use it on a general tile */
.badge.vee{color:#c9bbfb;border-color:rgba(167,139,250,.4);background:rgba(167,139,250,.08)}
```

```html
<span class="badge vee">Vee</span>
```

## List / coach row

A left accent rail keyed to tone, an uppercase mono name, a serif delta value, and a soft reason line.

```css
.row{position:relative;border:1px solid var(--border);border-radius:18px;
  background:rgba(255,255,255,.022);padding:18px 20px;overflow:hidden;margin-top:12px}
.row::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;transition:background .3s var(--ease)}
.row.good::before{background:var(--mint)} .row.watch::before{background:var(--amber)}
.row.good{box-shadow:0 0 40px -22px var(--mint-glow)} .row.watch{box-shadow:0 0 40px -22px var(--amber-glow)}
.rTop{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:11px}
.rName{font-family:var(--mono);font-size:.66rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted-strong)}
.rDelta{font-family:var(--serif);font-size:1.5rem;line-height:1}
.row.good .rDelta{color:var(--mint)} .row.watch .rDelta{color:var(--amber)}
.rReason{font-size:.9rem;color:#e7efe9;line-height:1.55}
.rMeta{font-family:var(--mono);font-size:.56rem;letter-spacing:.06em;color:var(--muted);margin-top:9px}
/* entrance: JS removes then re-adds .in for a spring pop */
.row.in{animation:rowpop .42s var(--spring)}
@keyframes rowpop{0%{opacity:0;transform:translateY(8px) scale(.99)}100%{opacity:1;transform:none}}
```

```html
<div class="row watch">
  <div class="rTop"><span class="rName">Calories</span><span class="rDelta">−1</span></div>
  <div class="rReason">A bit behind pace. Room for a solid meal to climb.</div>
  <div class="rMeta">2 of 3 points</div>
</div>
```

## Motion notes

- One-shot animations: remove class, force reflow (`void el.offsetWidth`), re-add.
- Always honor reduced motion:

```css
@media(prefers-reduced-motion:reduce){*{animation-duration:.001ms!important;transition-duration:.05s!important}}
```
