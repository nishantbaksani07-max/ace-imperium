# Vitality DNA: Icons + Tile Art (inlinable SVG)

Everything here is plain HTML, CSS, and inline SVG. No libraries, no React, no
Three.js. The core app uses 3D Three.js gems, but those are core-app only. Tiles
use flat SVG that captures the same idea. Where this doc references a "gem", it
means a flat SVG translation, never a WebGL canvas.

Two layers make a tile feel Vitality-grade:
1. A line-art icon set (the glyph vocabulary) for buttons, labels, list rows.
2. A living background motif keyed to the tile's theme (the tile-art language).

---

## 1. The line-art icon style (the house rule)

Every icon in the app is ONE component drawing the same SVG frame and swapping
inner paths. Copy this frame verbatim. It is the single most important rule.

```html
<svg viewBox="0 0 24 24" width="20" height="20"
     fill="none" stroke="currentColor" stroke-width="1.7"
     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <!-- icon paths go here -->
</svg>
```

Rules, non-negotiable:
- `viewBox="0 0 24 24"` always. Design every glyph on this 24-unit grid.
- `fill="none"` always. Stroke-only. No filled shapes (the one exception:
  tiny dot markers drawn as a zero-length path, see "living dots" below).
- `stroke="currentColor"`. The icon takes its color from the element's CSS
  `color`. Default to mint. Never hardcode a hex inside the SVG.
- `stroke-width="1.7"`. Thin and technical. (1.3 for big decorative line art.)
- `stroke-linecap="round"` and `stroke-linejoin="round"` always. Soft ends.
- Geometric and minimal. One readable gesture per glyph. If it needs a second
  glance to read, simplify it.
- No emojis, ever. An emoji in UI is a bug. Replace it with a glyph below.

Color it from CSS, not the SVG:
```css
.icon-row { color: var(--mint, #6EE7B7); }   /* the svg inherits via currentColor */
.icon-row.is-warn { color: #F59E0B; }          /* UI caution amber, never red */
```

### The "living dots" trick

Small filled dots inside a stroke-only icon (cookie chips, calendar day cells,
fish eye) are drawn as a zero-length rounded path. The round linecap turns it
into a perfect dot, so you never break the `fill="none"` rule:

```html
<path d="M9.4 9.6 h0.01" />   <!-- renders as a single round dot -->
```

Group several of these for texture (a week grid, a sprinkle of chips). This is
the same idea the backgrounds use at large scale (see "living dots" in tile art).

---

## 2. Ready-to-inline glyph snippets

All of these drop straight inside the SVG frame above. Pulled from the app's
real icon set (`VitalityIcon`, `SubstanceIcon`, `NutritionIcon`). Pick the one
that matches your tile's data.

```html
<!-- plus / add -->
<path d="M12 5v14M5 12h14"/>

<!-- check / done -->
<path d="M5 12.5 9.5 17 19 6.5"/>

<!-- close / dismiss -->
<path d="M6 6 18 18 M18 6 6 18"/>

<!-- arrow right / go -->
<path d="M4 12h15M13 6l6 6-6 6"/>

<!-- flame / calories / streak -->
<path d="M12.6 2.8 C12.4 6 10.6 7.4 9.4 9.6 C8.5 11.2 7.2 12.6 7.2 14.8 a4.8 4.8 0 0 0 9.6 0 c0 -2.5 -1.2 -4.3 -2.8 -5.9 c-0.3 1.4 -1 2 -1.9 2.2 c0.9 -2.9 0.5 -5.8 0.5 -8.1 Z"/>

<!-- drop / water / hydration -->
<path d="M12 3.2c3.6 4.6 5.8 7.6 5.8 10.6a5.8 5.8 0 0 1-11.6 0c0-3 2.2-6 5.8-10.6Z"/>

<!-- dumbbell / training -->
<path d="M9 12h6"/><path d="M6.6 9.4v5.2M9 8.2v7.6"/><path d="M17.4 9.4v5.2M15 8.2v7.6"/>

<!-- pill / supplement (split capsule) -->
<path d="M10.5 20.5 20.5 10.5a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="M8.5 8.5 15.5 15.5"/>

<!-- coffee / caffeine -->
<path d="M5 8.5h11v4.5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8.5Z"/><path d="M16 9.5h2.3a2.2 2.2 0 0 1 0 4.4H16"/><path d="M8.2 3.6c-.5 1 .5 1.5 0 2.6M11.4 3.6c-.5 1 .5 1.5 0 2.6"/>

<!-- crescent moon / sleep -->
<path d="M19 14.6A7.5 7.5 0 1 1 11 5a6 6 0 0 0 8 9.6Z"/>

<!-- bolt / energy / peak -->
<path d="M13 3 6 13.2h4.4L10 21l7-10.2h-4.4L13 3Z"/>

<!-- heart / health -->
<path d="M12 20.3 4.6 12.9a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9a4.6 4.6 0 0 1 6.5 6.5L12 20.3Z"/>

<!-- target / goal -->
<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.8"/><circle cx="12" cy="12" r="0.9"/>

<!-- star / favorite -->
<path d="M12 3.6l2.5 5.2 5.6.8-4.1 4 1 5.6L12 16.6 6.9 19.2l1-5.6-4.1-4 5.6-.8L12 3.6Z"/>

<!-- clock / time -->
<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3.2 1.9"/>

<!-- calendar -->
<rect x="4" y="5.5" width="16" height="14.5" rx="2.4"/><path d="M4 10h16M8.5 3v4.5M15.5 3v4.5"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/>

<!-- bell / reminder -->
<path d="M6 16.5h12l-1.5-2.4V10a4.5 4.5 0 0 0-9 0v4.1L6 16.5Z"/><path d="M10 19.5a2 2 0 0 0 4 0"/>

<!-- gear / settings -->
<circle cx="12" cy="12" r="3"/><path d="M19.4 13a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V19a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4.6 13H4.5a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H10a1.6 1.6 0 0 0 1-1.5V2.5a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.1a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>

<!-- trash / delete -->
<path d="M5 7h14M9 7V5h6v2M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/>

<!-- search -->
<circle cx="11" cy="11" r="6"/><path d="M19.5 19.5 15.3 15.3"/>

<!-- camera / photo scan -->
<rect x="3.5" y="7" width="17" height="12.5" rx="2.6"/><path d="M9 7l1.2-2.2h3.6L15 7"/><circle cx="12" cy="13.2" r="3.1"/>

<!-- chat / mentor -->
<path d="M5 5.5h14a2.2 2.2 0 0 1 2.2 2.2v6.4a2.2 2.2 0 0 1-2.2 2.2h-7.2L7 19.5v-3.2H5A2.2 2.2 0 0 1 2.8 14.1V7.7A2.2 2.2 0 0 1 5 5.5Z"/>

<!-- sparkles / AI -->
<path d="M11 4l1.5 3.9L16.4 9.4 12.5 11 11 14.9 9.5 11 5.6 9.4 9.5 7.9 11 4Z"/><path d="M18 14.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8.8-1.9Z"/>

<!-- sun / daytime -->
<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.4M12 19.1v2.4M21.5 12h-2.4M4.9 12H2.5M18.7 5.3l-1.7 1.7M7 17l-1.7 1.7M18.7 18.7 17 17M7 7 5.3 5.3"/>

<!-- trend up / bulk -->
<path d="M4 16 L9.3 13 L13.4 14.4 L19.5 8.4"/><path d="M16.1 8.4 L19.5 8.4 L19.5 11.8"/>

<!-- trend flat / maintain -->
<path d="M4 12 L9.3 11 L13.4 13 L18 12"/><path d="M14.9 8.7 L18 12 L14.9 15.3"/>

<!-- trend down / cut -->
<path d="M4 8 L9.3 11 L13.4 9.6 L19.5 15.6"/><path d="M16.1 15.6 L19.5 15.6 L19.5 12.2"/>

<!-- leaf / whole foods -->
<path d="M5 19 C5 11 11 5 19 5 C19 13 13 19 5 19 Z"/><path d="M9 15 C12 12 15 10 17.5 9"/>

<!-- scale / weigh-in -->
<rect x="4" y="4" width="16" height="16" rx="3.2"/><path d="M8.6 13a3.4 3.4 0 0 1 6.8 0"/><path d="M12 13l1.8-2.2"/>
```

If a glyph you need is not here, draw a new one on the same 24x24 grid following
the house rule. Match the geometric, single-gesture feel of the set above.

---

## 3. The tile-art motif language

Each core tile has a signature animated background built from cheap, looping CSS
on a `viewBox="0 0 24 24"`-style SVG or pure CSS gradients. The motif is keyed
to what the tile tracks. Pick the motif that matches your tile's data shape.

| Theme            | Motif              | What it looks like |
|------------------|--------------------|--------------------|
| Train / progress | mint line graph    | rising trend line, dots welded to its vertices |
| Fuel / intake    | inflow + waves     | particles streaming into a breathing core |
| Peak / energy    | orbit / pulse      | expanding ring + glow lighting a dot grid |
| Vitals / health  | ECG                | flat baseline with one QRS heartbeat spike |
| Finance / money  | candlesticks       | up (mint) / down (amber) candle bars |
| Mind / Vee       | gem / sonar        | a calm flat gem mark, or a rare radar sweep |

Shared frame for every tile-art layer:
```css
.tile-art      { position:absolute; inset:0; overflow:hidden; pointer-events:none; }
.tile-art-base { position:absolute; inset:0; }  /* the radial-gradient backdrop */
```
Background is pure black with a mint radial glow. Color law: mint = good/up,
amber `--amber-art` = caution/down, never pure red. Always honor reduced motion:
```css
@media (prefers-reduced-motion: reduce) { .tile-art * { animation:none !important; } }
```

### Mint palette tokens (use these exact values)
```
--mint        #6EE7B7   line, default glyph color
--mint-bright #A7F3D0   peak dot, core, "live" highlight
--mint-glow   rgba(110,231,183, .25 .55 .7)  drop-shadow glows
--amber-art   #d98e3c   tile-art caution / candle-down tint
--amber-down  #e0795f   finance down candle (tile-art tint)
bg            #060d0a -> #040806  near-black, slightly green-tinted
```
These are tile-art tints; the UI state amber is always #F59E0B.

---

## 4. Tile-art recipes (copyable)

### Train motif: mint line graph + welded dots

One SVG holds the trend line and the data dots as `<circle>`s at the EXACT same
coordinates as the line vertices, so dots can never drift off the line. Lock the
container's aspect-ratio to the viewBox ratio so dots stay round at any size.

The glow loops by cross-fading the opacity of a pre-blurred copy of the line,
NOT by animating `filter` on a loop. A looping `filter:drop-shadow` re-rasterizes
the blur every frame and tanks the frame rate; that is the trap. The one-shot
draw-on filter on `.trend` is fine because it runs once. So we draw the line
once, then sit a static blurred twin behind it and pulse only its opacity.
```html
<div class="train-art" aria-hidden="true">
  <svg viewBox="0 0 400 150" preserveAspectRatio="xMidYMid meet">
    <!-- pre-blurred twin of the trend line: a cheap opacity pulse rides on this -->
    <path class="trend-glow" d="M10,118 L56,110 L102,114 L148,96 L196,100 L244,78 L292,82 L340,60 L390,46"
          pathLength="100"/>
    <!-- main trend line: one solid glowing mint stroke -->
    <path class="trend" d="M10,118 L56,110 L102,114 L148,96 L196,100 L244,78 L292,82 L340,60 L390,46"
          pathLength="100"/>
    <!-- dots at the SAME coords as the line vertices -->
    <circle class="dot" cx="10" cy="118" r="3"/>
    <circle class="dot" cx="56" cy="110" r="3"/>
    <circle class="dot" cx="102" cy="114" r="3"/>
    <circle class="dot" cx="148" cy="96" r="3"/>
    <circle class="dot" cx="196" cy="100" r="3"/>
    <circle class="dot" cx="244" cy="78" r="3"/>
    <circle class="dot" cx="292" cy="82" r="3"/>
    <circle class="dot" cx="340" cy="60" r="3"/>
    <circle class="dot peak" cx="390" cy="46" r="4"/>
  </svg>
</div>
```
```css
.train-art svg { width:86%; aspect-ratio:400/150; display:block; overflow:visible; }
.trend {
  fill:none; stroke:#6EE7B7; stroke-width:2.4; stroke-linecap:round; stroke-linejoin:round;
  filter:drop-shadow(0 0 4px rgba(110,231,183,.7));   /* one-shot, set once, fine */
  stroke-dasharray:100; stroke-dashoffset:100;     /* pathLength trick */
  animation: draw 5s cubic-bezier(.45,0,.25,1) forwards;
}
@keyframes draw { to { stroke-dashoffset:0; } }    /* line draws itself in L to R */
/* the looping glow: a static pre-blurred twin whose OPACITY cross-fades.
   never animate `filter` on a loop, that is the frame-rate trap. */
.trend-glow {
  fill:none; stroke:#A7F3D0; stroke-width:2.4; stroke-linecap:round; stroke-linejoin:round;
  filter:drop-shadow(0 0 7px rgba(110,231,183,.85));  /* blurred once, never re-filtered */
  opacity:0;
  animation: glowFade 10s 5s ease-in-out infinite;
}
@keyframes glowFade {                               /* cheap: only opacity moves */
  0%,100% { opacity:.35; }
  50%     { opacity:.9; }
}
.dot { fill:rgba(110,231,183,.6); }
.dot.peak { fill:#A7F3D0; filter:drop-shadow(0 0 4px rgba(167,243,208,.8)); }
```
Key trick: set `pathLength="100"` on any path, then animate `stroke-dashoffset`
from 100 to 0 with `stroke-dasharray:100`. The line draws itself on. This works
for any line-art glyph, not just the graph.

### Vitals motif: ECG heartbeat (translated from the gem PULSE glyph)

A flat baseline with one tall QRS spike. Same self-drawing trick.
```html
<svg viewBox="0 0 400 120" preserveAspectRatio="xMidYMid meet">
  <path class="ecg" pathLength="100"
        d="M20,60 L150,60 L172,90 L196,20 L220,100 L244,60 L380,60"/>
</svg>
```
```css
.ecg { fill:none; stroke:#6EE7B7; stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round;
       filter:drop-shadow(0 0 4px rgba(110,231,183,.7));
       stroke-dasharray:100; animation: ecgScan 3.2s linear infinite; }
@keyframes ecgScan { from { stroke-dashoffset:100; } to { stroke-dashoffset:-100; } }
```

### Finance motif: candlesticks (up = mint, down = amber)

Each candle is a flex column with a thin wick and a glowing body, colored by
`currentColor`. Last candle blinks "live". Candles draw in L to R via delay.
```html
<div class="candles" aria-hidden="true">
  <div class="c up"   style="animation-delay:.30s"><span class="wick" style="height:70%"></span><span class="body" style="height:30%"></span></div>
  <div class="c down" style="animation-delay:.42s"><span class="wick" style="height:40%"></span><span class="body" style="height:33%"></span></div>
  <div class="c up"   style="animation-delay:.54s"><span class="wick" style="height:66%"></span><span class="body" style="height:24%"></span></div>
  <div class="c up last" style="animation-delay:.66s"><span class="wick" style="height:95%"></span><span class="body" style="height:40%"></span></div>
</div>
```
```css
.candles { position:absolute; inset:0; display:flex; align-items:center; justify-content:space-between; padding:0 8%; }
.c { position:relative; width:9px; height:100%; display:flex; align-items:center; justify-content:center;
     opacity:0; animation: candle .5s cubic-bezier(.16,1,.3,1) forwards; }
.c.up   { color:#6EE7B7; }
.c.down { color:#e0795f; }                                  /* never pure red */
.wick { position:absolute; width:1px; background:currentColor; }
.body { width:7px; border-radius:1px; background:currentColor; box-shadow:0 0 6px currentColor; }
@keyframes candle { to { opacity:.95; } }
.c.last { animation: candle .5s cubic-bezier(.16,1,.3,1) forwards, blink 4.5s 2s ease-in-out infinite; }
@keyframes blink { 0%,100%{ filter:brightness(1); } 50%{ filter:brightness(1.5); } }
```
Body height = a fraction of the column times 0.6; wick height = a fraction.

### Peak motif: expanding glow over a dot grid (pure CSS, no SVG)

A dim dot grid with a brighter copy revealed by a growing, decaying radial mask.
Pure CSS gradients. This is the "living dots" idea at background scale.
```css
.peak-art { position:absolute; inset:0; overflow:hidden; background:#070908; }
.dots {            /* dim resting grid */
  position:absolute; inset:0;
  background-image: radial-gradient(rgba(110,231,183,.22) 1.2px, transparent 1.4px);
  background-size:14px 14px; background-position:center;
}
.bright {          /* same grid, lit, revealed by a growing mask that decays */
  position:absolute; inset:0;
  background-image: radial-gradient(rgba(167,243,208,.95) 1.3px, transparent 1.5px);
  background-size:14px 14px; background-position:center;
  filter: drop-shadow(0 0 3px rgba(110,231,183,.7));
  -webkit-mask-image: radial-gradient(circle at 50% 46%, #000, transparent 70%);
          mask-image: radial-gradient(circle at 50% 46%, #000, transparent 70%);
  -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat;
  -webkit-mask-position:center 46%; mask-position:center 46%;
  opacity:0; animation: pulse 5.5s linear infinite;
}
@keyframes pulse {                       /* flares bright at birth, fades as it spreads */
  0%   { -webkit-mask-size:8% 8%;    mask-size:8% 8%;    opacity:0; }
  10%  { opacity:1; }
  40%  { -webkit-mask-size:90% 90%;  mask-size:90% 90%;  opacity:.55; }
  100% { -webkit-mask-size:210% 210%;mask-size:210% 210%;opacity:0; }
}
```
Pair with a `<div class="ring">` (a 1px mint border circle scaling 0.5 to 1.8,
fading out) and a small breathing `.core` dot for the full effect.

### Fuel motif: inflow particles + breathing core

Spans positioned near a centre point, each drifting inward via a CSS transform.
Tiles can hardcode the spans or spawn ~10 with a few lines of vanilla JS.
```css
.core { position:absolute; left:68%; top:52%; width:34px; height:34px; transform:translate(-50%,-50%);
        border-radius:50%; background:radial-gradient(circle, #A7F3D0, rgba(110,231,183,.2) 70%, transparent);
        box-shadow:0 0 18px rgba(110,231,183,.6); animation: breathe 4s ease-in-out infinite; }
@keyframes breathe { 0%,100%{ transform:translate(-50%,-50%) scale(1); } 50%{ transform:translate(-50%,-50%) scale(1.08); } }
.p { position:absolute; width:3px; height:3px; border-radius:50%; background:#6EE7B7;
     /* set --tx/--ty toward the core, then: */
     animation: inflow var(--dur,8s) linear infinite; }
@keyframes inflow {
  0%   { transform:translate(0,0); opacity:0; }
  20%  { opacity:.8; }
  100% { transform:translate(var(--tx), var(--ty)); opacity:0; }   /* absorbed by the core */
}
```
Keep particles TIGHT around the core (start 60 to 110px out), short travel, few
dots. Scattered particles make the tile read as transparent. Calm and cozy beats
busy. Optionally fire a small celebratory burst (rings, sparkles, rays) every 5
to 15s when the tile's value goes up.

### Mind / Vee motif: flat gem mark (the V) + rare sonar sweep

3D gems are core-app only. A tile renders the gem as a flat self-drawing SVG V
mark with radial spokes, or as a calm sonar disc that sweeps rarely.

Flat brand gem (radial spokes + the V mark, both self-draw with the pathLength trick):
```html
<svg viewBox="-100 -100 200 200" class="gem">
  <g class="spokes" stroke="rgba(110,231,183,.18)" stroke-width="1">
    <line x1="0" y1="0" x2="0" y2="-100"/><line x1="0" y1="0" x2="71" y2="-71"/>
    <line x1="0" y1="0" x2="100" y2="0"/><line x1="0" y1="0" x2="71" y2="71"/>
    <line x1="0" y1="0" x2="0" y2="100"/><line x1="0" y1="0" x2="-71" y2="71"/>
    <line x1="0" y1="0" x2="-100" y2="0"/><line x1="0" y1="0" x2="-71" y2="-71"/>
  </g>
  <path class="vmark" d="M-28 -20 L0 28 L28 -20" pathLength="100"
        fill="none" stroke="#6EE7B7" stroke-width="6"
        stroke-linecap="round" stroke-linejoin="round"
        style="filter:drop-shadow(0 0 6px rgba(110,231,183,.7));
               stroke-dasharray:100; animation:draw 2s ease forwards;"/>
</svg>
```

Sonar sweep (calm, idle most of the time, one rare spin):
```html
<div class="radar">
  <svg viewBox="-100 -100 200 200">
    <g stroke="rgba(110,231,183,.22)" fill="none">
      <circle r="32"/><circle r="60"/><circle r="88"/>
    </g>
    <g stroke="rgba(110,231,183,.14)"><line x1="-100" y1="0" x2="100" y2="0"/><line x1="0" y1="-100" x2="0" y2="100"/></g>
  </svg>
  <div class="sweep"></div>
</div>
```
```css
.radar { position:absolute; left:50%; top:46%; height:68%; aspect-ratio:1; transform:translate(-50%,-50%);
         border-radius:50%; overflow:hidden; border:1px solid rgba(110,231,183,.16); }
.sweep { position:absolute; inset:0; opacity:0; transform-origin:50% 50%;
         background:conic-gradient(from 0deg at 50% 50%,
           rgba(110,231,183,.30) 0deg, rgba(110,231,183,.10) 16deg, rgba(110,231,183,0) 52deg, transparent 360deg); }
.sweep.spin { animation: sweep 2.4s cubic-bezier(.4,0,.4,1) forwards; }
@keyframes sweep { 0%{transform:rotate(0);opacity:0;} 8%{opacity:1;} 92%{opacity:1;} 100%{transform:rotate(360deg);opacity:0;} }
```
Trigger the sweep rarely (every 25 to 45s) by adding `.spin`, removing it, and
forcing a reflow to re-run the one-shot. Minimal beats busy.

---

## 5. The gem-mark vocabulary (flat translations)

The core app's 3D gems each carry a single line-art glyph drawn on a 512-unit
canvas. Tiles reuse the SAME marks as flat inline SVG. Each is one or two
stroked paths, scaled to 24x24 they become the icons in section 2. The mapping:

| Mark    | Meaning              | Flat shape |
|---------|----------------------|-----------|
| V       | Vitality / brand     | a wide checkmark `M-28 -20 L0 28 L28 -20` |
| CHECK   | done / completion    | sharp tick |
| PLUS    | add / new            | clean cross |
| HEX     | foundation / steady  | 6-sided outline |
| PULSE   | recovery / vitals    | flat line + one QRS spike (ECG) |
| ASCEND  | streak / progression | 3-step staircase climbing |
| BOLT    | energy / peak        | two-segment lightning |
| BAR     | fitness / strength   | dumbbell (two plates + bar) |
| DROP    | water / hydration    | closed teardrop |
| STAR    | twinkle / reward     | 5-point star |
| RAYS    | cheer / celebrate    | 8 short rays around an open centre |
| FLAG    | start / let's go     | pennant on a pole |
| CHEVRON | momentum / forward   | climbing chevrons |
| RINGS   | focus                | concentric circles |
| SINE    | wearables / signal   | a sine wave |

Use the mark that matches the tile's purpose. A water tile gets DROP, a workout
tile gets BAR or ASCEND, a focus tile gets RINGS. Keep it to one mark.

---

## 6. Quick checklist for a Vitality-grade tile visual

- Icons: `viewBox 0 0 24 24`, `fill="none"`, `stroke="currentColor"`,
  `stroke-width="1.7"`, round caps and joins. Color from CSS.
- No emojis anywhere. Use a glyph from section 2.
- Background motif keyed to the data (graph, ECG, candles, orbit, inflow, gem).
- Mint = good/up, amber = caution/down, never pure red.
- Pure-black backdrop with a soft mint radial glow.
- Animate lines with the `pathLength="100"` + `stroke-dashoffset` self-draw.
- Calm over busy. Few elements, slow loops, breathing glows.
- Always include the reduced-motion guard.
