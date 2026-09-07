# Vitality Theme + Tokens (tile DNA)

How a sealed-HTML tile looks and feels like Vitality. Everything here is inline-able into one self-contained `.html` file: plain CSS, vanilla JS, inline SVG. No libraries, no build step, no frameworks.

A tile is hosted inside the Vitality shell, so the tile itself sets a transparent background and lets the host paint pure black behind it. Copy the base shell at the bottom and build on top of it.

---

## 1. Color tokens (exact)

Drop these into `:root`. These are the real Vitality values.

```css
:root {
  /* Surface */
  --bg: #000000;              /* pure black, the canvas */
  --bg-elevated: #0a0a0a;     /* near-black raised panels */
  --fg: #ffffff;              /* primary text */

  /* Mint = the brand, = "good" */
  --mint: #6EE7B7;            /* the signature mint */
  --mint-hover: #5dd6a6;      /* darker mint for hover */
  --mint-deep: #1f4d3d;       /* dark teal partner */
  --mint-glow: rgba(110, 231, 183, 0.4);
  --mint-ink: #042a1c;        /* dark text/icon ON a mint fill */

  /* Amber = caution (never red) */
  --amber: #F59E0B;
  --amber-warm: #d97706;      /* deeper amber for gradients */
  --wine: #7c2d12;            /* deep red-brown, partners amber */

  /* Azure = the one "good/data" accent (Vitals only; use mint elsewhere) */
  --azure: #5E9BFF;           /* readings + score accent */

  /* Text greys (white at opacity, never solid grey) */
  --muted: rgba(255, 255, 255, 0.5);
  --muted-strong: rgba(255, 255, 255, 0.7);

  /* Borders + card fills (white at low opacity) */
  --border: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.16);
  --card: rgba(255, 255, 255, 0.02);
  --card-elevated: rgba(255, 255, 255, 0.04);

  /* --red exists in the app but is RETIRED by the color law. Do not use it for state. */
}
```

### THE COLOR LAW (non-negotiable)

- Background is **pure black** (`#000`). Tiles render transparent so the host black shows through.
- **Mint = good / success / the brand. Azure = good (data/readings, used sparingly). Amber = caution. NEVER red for state.**
- Meaning must also live on **the word + a small dot/pip + a glyph**, never on color alone (colorblind-safe). A pill that means "caution" says the word, shows an amber dot, and uses an amber glyph.
- No rainbow, no off-palette coral, no random hues. Mint, amber, white-greys. Azure only where it leads (Vitals-style readings).
- Greys are always **white at an opacity** (`rgba(255,255,255,a)`), never a solid grey hex. Keeps text living on true black.
- **Never shame.** Any miss / off-target / low state is warm: amber or soft neutral, never red, ideally with a gentle "give me grace" out.

---

## 2. Fonts (the exact stacks)

The app loads these via next/font; in a sealed tile, load them from Google Fonts in `<head>` and use the stacks below. If you cannot load webfonts, the fallbacks still read on-brand.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

```css
:root {
  --font-inter: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-serif: 'Instrument Serif', 'Times New Roman', Georgia, serif;
  --font-mono:  'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
}
```

Roles (use them this way, not interchangeably):

- **Inter** (`--font-inter`) = body and all UI. Weights 400 to 700. `-webkit-font-smoothing: antialiased`.
- **Instrument Serif, ITALIC** (`--font-serif` + `font-style: italic`) = titles, big numbers, the warm voice, eyebrow numbers like `01`. Italic is where the personality lives. Use sparingly and on purpose. `letter-spacing: -0.01em`, `font-weight: 400`.
- **JetBrains Mono** (`--font-mono`) = eyebrows, small-caps labels, pill text, axis ticks. Uppercase, tracked. Eyebrows and section labels track at `0.2em`; in-component micro-labels at `0.12em` to `0.14em`.

Helper classes:

```css
.serif        { font-family: var(--font-serif); font-weight: 400; letter-spacing: -0.01em; }
.serif-italic { font-family: var(--font-serif); font-style: italic; font-weight: 400; letter-spacing: -0.01em; }
```

Headings are Inter 600, tight tracking, tight line-height:

```css
h1,h2,h3,h4,h5,h6 { font-weight: 600; letter-spacing: -0.01em; line-height: 1.2; }
```

Type scale tokens:

```css
:root {
  --text-xs: 0.75rem;  --text-sm: 0.875rem; --text-base: 1rem;
  --text-lg: 1.125rem; --text-xl: 1.375rem; --text-2xl: 1.75rem; --text-3xl: 2.5rem;
}
```

---

## 3. Spacing, radii, motion

```css
:root {
  /* Spacing (4px base) */
  --space-1: 0.25rem; --space-2: 0.5rem; --space-3: 0.75rem; --space-4: 1rem;
  --space-5: 1.25rem; --space-6: 1.5rem; --space-8: 2rem; --space-10: 2.5rem;
  --space-12: 3rem; --space-16: 4rem;

  /* Radius */
  --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px;
  --radius-card: 18px;   /* THE card standard. Big cards use 18px, not 12px. */
  --radius-pill: 999px;

  /* Motion */
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-premium: cubic-bezier(0.16, 1, 0.3, 1);   /* the signature easing; use on every meaningful state change */
  --ease-out-soft: cubic-bezier(0.32, 0.72, 0, 1); /* smooth lift / float */
  --duration-fast: 120ms; --duration: 180ms; --duration-lift: 480ms;
}
```

Conventions:

- **Card radius is 18px** (`--radius-card`). Buttons/inputs use the smaller 6 to 8px. Pills use 999px.
- Padding inside a card: `var(--space-6)` (24px), or a responsive `clamp(1rem, 4vw, 1.5rem)` on small tiles.
- Gaps between stacked items: `--space-3` / `--space-4`; between sections: `--space-6` / `--space-8`.
- Use `--ease-premium` on hovers, reveals, any state change. `--ease-out-soft` for lift/float. A spring overshoot is used for cozy entrances (see snippet 6).

---

## 4. Dark background + grain treatment

The host is pure black. The signature atmosphere is: black, an optional soft **mint radial glow**, then an extremely faint **film grain** on top. Grain is SVG noise, very low opacity, blend `overlay`, `pointer-events: none`, `position: fixed` so it does not scroll.

Every feature file inherits this; none overrides --bg. The standalone preview value is #000.

```css
/* Faint film grain. Add .grain to a full-tile wrapper. */
.grain { position: relative; }
.grain::after {
  content: '';
  position: fixed; inset: 0;
  pointer-events: none;
  z-index: 1;
  opacity: 0.035;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
  background-size: 200px 200px;
}

/* Optional soft mint glow behind content (atmosphere). */
.glow-bg::before {
  content: '';
  position: fixed; inset: 0;
  pointer-events: none;
  z-index: 0;
  background: radial-gradient(60% 50% at 50% 0%, rgba(110,231,183,0.10), transparent 70%);
}
```

Keep real content at `z-index: 2` so it sits above glow (0) and grain (1).

---

## 5. How a tile sets its background (IMPORTANT)

A tile is embedded in the Vitality shell. The tile must NOT paint its own black, or it will double up and may clip. Set the body transparent and let the host black show through. Atmosphere (glow + grain) is optional and goes on an inner wrapper, not the body.

```css
html, body { height: 100%; }
body {
  background: transparent;   /* host paints pure black behind the tile */
  color: var(--fg);
  font-family: var(--font-inter);
  font-size: var(--text-base);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  accent-color: var(--mint);             /* retint native controls to mint, never OS blue */
}
```

If a tile is opened standalone (not in the host) and you want black behind it anyway, gate it: `body:not(.in-host){ background: var(--bg); }`. Default stays transparent.

---

## 6. Copy-paste base tile shell

A complete, sealed, on-brand starting point. Self-contained, no external files except the Google Fonts link. Replace the content inside `.tile-body`.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Vitality Tile</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#000; --bg-elevated:#0a0a0a; --fg:#fff;
  --mint:#6EE7B7; --mint-hover:#5dd6a6; --mint-deep:#1f4d3d;
  --mint-glow:rgba(110,231,183,0.4); --mint-ink:#042a1c;
  --amber:#F59E0B; --amber-warm:#d97706; --wine:#7c2d12; --azure:#5E9BFF;
  --muted:rgba(255,255,255,0.5); --muted-strong:rgba(255,255,255,0.7);
  --border:rgba(255,255,255,0.08); --border-strong:rgba(255,255,255,0.16);
  --card:rgba(255,255,255,0.02); --card-elevated:rgba(255,255,255,0.04);
  --font-inter:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  --font-serif:'Instrument Serif','Times New Roman',Georgia,serif;
  --font-mono:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace;
  --space-2:.5rem; --space-3:.75rem; --space-4:1rem; --space-6:1.5rem; --space-8:2rem;
  --radius-md:8px; --radius-card:18px; --radius-pill:999px;
  --text-xs:.75rem; --text-sm:.875rem; --text-lg:1.125rem; --text-2xl:1.75rem; --text-3xl:2.5rem;
  --ease-premium:cubic-bezier(.16,1,.3,1); --ease-out-soft:cubic-bezier(.32,.72,0,1);
  --duration:180ms; --duration-fast:120ms; --duration-lift:480ms;
  --spring:cubic-bezier(.34,1.56,.64,1); /* overshoot for cozy entrances */
}
*,*::before,*::after{ box-sizing:border-box; margin:0; padding:0; -webkit-tap-highlight-color:transparent; }
html,body{ height:100%; }
body{
  background:transparent;            /* host paints black */
  color:var(--fg);
  font-family:var(--font-inter); font-size:1rem; line-height:1.5;
  -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;
  accent-color:var(--mint);
  -webkit-user-select:none; user-select:none; /* app-like; opt content into .selectable */
}
input,textarea,select,[contenteditable]{ caret-color:var(--mint); }
.selectable,.selectable *,input,textarea,[contenteditable]{ -webkit-user-select:text; user-select:text; }
::selection{ background:rgba(110,231,183,0.25); }      /* mint, never OS blue */
::-moz-selection{ background:rgba(110,231,183,0.25); }
button{ font-family:inherit; cursor:pointer; border:none; background:none; color:inherit; }
input,textarea,select{ font-family:inherit; color:inherit; }
h1,h2,h3{ font-weight:600; letter-spacing:-0.01em; line-height:1.2; }
.serif-italic{ font-family:var(--font-serif); font-style:italic; font-weight:400; letter-spacing:-0.01em; }

/* atmosphere */
.tile-shell{ position:relative; min-height:100%; padding:clamp(1rem,5vw,2rem); z-index:0; }
.tile-shell::before{ content:''; position:fixed; inset:0; z-index:0; pointer-events:none;
  background:radial-gradient(60% 50% at 50% 0%, rgba(110,231,183,0.10), transparent 70%); }
.tile-shell::after{ content:''; position:fixed; inset:0; z-index:1; pointer-events:none;
  opacity:.035; mix-blend-mode:overlay; background-size:200px 200px;
  background-image:url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>"); }
.tile-body{ position:relative; z-index:2; max-width:560px; margin:0 auto;
  display:flex; flex-direction:column; gap:var(--space-6); }

/* eyebrow: serif number + mono tracked label + thin rule */
.eyebrow{ display:flex; align-items:center; gap:var(--space-3); color:var(--muted-strong); }
.eyebrow .num{ font-family:var(--font-serif); font-style:italic; font-size:var(--text-lg); color:var(--mint); }
.eyebrow .label{ font-family:var(--font-mono); font-size:var(--text-xs); text-transform:uppercase; letter-spacing:.2em; }
.eyebrow .rule{ flex:1; height:1px; background:var(--border); }

/* card: 18px radius, faint fill, mint hover */
.card{ background:var(--card); border:1px solid var(--border); border-radius:var(--radius-card);
  padding:var(--space-6); transition:border-color var(--duration) var(--ease-premium), box-shadow var(--duration) var(--ease-premium); }
.card:hover{ border-color:rgba(110,231,183,0.28); box-shadow:0 0 44px rgba(110,231,183,0.07); }

/* gem chip: rounded-square mint-glyph icon, ~44px */
.gem-chip{ width:44px; height:44px; border-radius:11px; display:inline-flex; align-items:center; justify-content:center;
  background:rgba(110,231,183,0.10); border:1px solid rgba(110,231,183,0.22); color:var(--mint); }

/* pill: mono uppercase + colored dot (colorblind cue), mint/amber/neutral only */
.pill{ display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:var(--radius-pill);
  font-family:var(--font-mono); font-size:var(--text-xs); text-transform:uppercase; letter-spacing:.08em; border:1px solid var(--border); }
.pill .dot{ width:6px; height:6px; border-radius:50%; }
.pill.good   { color:var(--mint);  border-color:rgba(110,231,183,0.3); } .pill.good .dot{ background:var(--mint); }
.pill.caution{ color:var(--amber); border-color:rgba(245,158,11,0.3); }  .pill.caution .dot{ background:var(--amber); }
.pill.neutral{ color:var(--muted-strong); }                              .pill.neutral .dot{ background:var(--muted); }

/* primary button: mint fill, dark ink, press dips 1px */
.btn{ display:inline-flex; align-items:center; justify-content:center; gap:var(--space-2);
  padding:.6875rem var(--space-4); border-radius:var(--radius-md); font-size:var(--text-sm); font-weight:600; line-height:1;
  transition:background var(--duration) var(--ease-premium), transform var(--duration-fast) var(--ease-premium); }
.btn-primary{ background:var(--mint); color:var(--mint-ink); }
.btn-primary:hover{ background:var(--mint-hover); }
.btn-primary:active{ transform:translateY(1px); }
.btn-ghost{ background:transparent; color:var(--fg); border:1px solid var(--border); }
.btn-ghost:hover{ border-color:var(--border-strong); background:var(--card); }

/* input: faint card fill, mint focus */
.input{ width:100%; background:var(--card); border:1px solid var(--border); color:var(--fg);
  padding:.6875rem var(--space-3); border-radius:6px; font-size:var(--text-sm); outline:none;
  transition:border-color var(--duration) var(--ease-premium), background var(--duration) var(--ease-premium); }
.input::placeholder{ color:var(--muted); }
.input:focus{ border-color:var(--mint); background:rgba(110,231,183,0.04); }

/* cozy springy entrance (the standard reveal). Stagger via --i. */
@keyframes cozyPop{ from{ opacity:0; transform:translateY(10px) scale(.98); } to{ opacity:1; transform:none; } }
.cozy{ opacity:0; animation:cozyPop var(--duration-lift) var(--spring) forwards; animation-delay:calc(var(--i,0)*70ms); }

@media (prefers-reduced-motion: reduce){ .cozy{ animation:none; opacity:1; transform:none; } }
</style>
</head>
<body>
  <main class="tile-shell">
    <div class="tile-body">

      <div class="eyebrow cozy" style="--i:0">
        <span class="num">01</span>
        <span class="label">your tile</span>
        <span class="rule"></span>
      </div>

      <section class="card cozy" style="--i:1">
        <h2 class="serif-italic" style="font-size:var(--text-2xl)">A warm title in serif italic</h2>
        <p style="color:var(--muted-strong); margin-top:var(--space-3)">
          Body copy in Inter. Short, plain, scannable. Mint means good, amber means caution, never red.
        </p>
        <div style="display:flex; gap:var(--space-2); margin-top:var(--space-4)">
          <span class="pill good"><span class="dot"></span> on track</span>
          <span class="pill caution"><span class="dot"></span> ease up</span>
        </div>
        <button class="btn btn-primary" style="margin-top:var(--space-6)">Do the thing</button>
      </section>

    </div>
  </main>
</body>
</html>
```

---

## 7. Quick do/don't

- DO use Instrument Serif italic for titles and big numbers; Inter for everything else; JetBrains Mono for eyebrows/labels/pills.
- DO keep the body transparent and let the host paint black.
- DO carry meaning on word + dot + glyph, not color alone.
- DON'T use red for state, ever. Amber is the strongest caution. Never shame.
- DON'T use Tailwind, em dashes, emojis, or OS-blue selection/caret.
- DON'T paint a solid grey hex for text; use white at an opacity.
- DON'T hand-roll fake "gems" as decoration; a simple mint glyph chip is the inline-safe stand-in for the real Three.js gems.
