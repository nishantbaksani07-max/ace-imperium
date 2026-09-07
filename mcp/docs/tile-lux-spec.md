# Vitality Tile Lux Spec

The buildable design spec for the upgraded MCP tile templates. Implement this verbatim into the TypeScript template functions in `mcp/src/tiles/templates.ts`. Every hex, rgba, clamp, and duration below is taken from the real shipped app (`app/globals.css`, `app/app/fuel/macros/macros.module.css`, `app/welcome/welcome.module.css`) and the DNA pack (`mcp/dna/*`). Do not invent values.

North star (founder's words): **Apple-minimal luxury. Rolls-Royce / Mercedes feel but more Apple: minimal, clean, efficient, professional, never glitchy, strong, simplistic.** The new default tile must read as rich and premium as a real Vitality module (Fuel / Train), not a bare counter. Calm, one accent, lots of negative space, one signature moment, honest states.

---

## 1. EXACT CSS TOKENS (inline these in every tile's `:root`)

These are the real Vitality values from `app/globals.css`. A sealed tile inlines them; it does NOT import globals. The tile body stays transparent so the host paints black. Only `--bg` changes meaning (the tile never paints it).

```css
:root{
  /* ── Surface ── */
  --bg:#000000;                        /* pure black, host paints it; tile body is transparent */
  --bg-elevated:#0a0a0a;               /* near-black raised panel */
  --fg:#ffffff;                        /* primary text */

  /* ── Mint = the brand, = good / success / on-track ── */
  --mint:#6EE7B7;
  --mint-hover:#5dd6a6;
  --mint-deep:#1f4d3d;                 /* dark teal partner (gradient floor of a fill) */
  --mint-glow:rgba(110,231,183,0.4);
  --mint-ink:#042a1c;                  /* dark text/icon ON a mint fill (buttons, seals) */

  /* ── Amber = caution (never red for state) ── */
  --amber:#F59E0B;
  --amber-warm:#d97706;                /* deeper amber for a duotone gradient */
  --amber-glow:rgba(245,158,11,0.4);
  --wine:#7c2d12;                      /* deep red-brown, partners amber; decorative only */

  /* ── Azure = the one "data / reading" accent (use sparingly, Vitals-style) ── */
  --azure:#5E9BFF;                     /* readings + score accent */
  --carb:#8fb8c9;                      /* the softer blue partner Fuel uses for the carbs channel */

  /* ── Text greys: ALWAYS white at an opacity, never a solid grey hex ── */
  --muted:rgba(255,255,255,0.5);
  --muted-strong:rgba(255,255,255,0.7);

  /* ── Borders + card fills (white at low opacity) ── */
  --border:rgba(255,255,255,0.08);
  --border-strong:rgba(255,255,255,0.16);
  --card:rgba(255,255,255,0.02);
  --card-elevated:rgba(255,255,255,0.04);

  /* ── Radii ── */
  --radius-sm:6px;
  --radius-md:8px;
  --radius-lg:12px;
  --radius-card:18px;                  /* THE big-card standard. Cards use 18px, NOT 12px. */
  --radius-xl:20px;                    /* the hero panel radius Fuel uses on its top tiles */
  --radius-pill:999px;

  /* ── Shadows / elevation (pre-mixed, never animate box-shadow in a loop) ── */
  --shadow-card:0 24px 48px -28px rgba(0,0,0,0.8);          /* Fuel .card lift */
  --shadow-inset:inset 0 1px 0 rgba(255,255,255,0.04);      /* top hairline on a hero panel */
  --glow-mint-hover:0 0 44px rgba(110,231,183,0.07);        /* the card mint-hover bloom */
  --glow-mint-hero:0 0 56px -26px var(--mint-glow);         /* the Fuel hero halo */
  --ring-mint:0 0 0 1px rgba(110,231,183,0.06);             /* faint mint keyline on a hero */

  /* ── Type scale (rem) ── */
  --text-xs:0.75rem; --text-sm:0.875rem; --text-base:1rem;
  --text-lg:1.125rem; --text-xl:1.375rem; --text-2xl:1.75rem; --text-3xl:2.5rem;

  /* ── Spacing (4px base) ── */
  --space-1:0.25rem; --space-2:0.5rem; --space-3:0.75rem; --space-4:1rem;
  --space-5:1.25rem; --space-6:1.5rem; --space-8:2rem; --space-10:2.5rem;
  --space-12:3rem; --space-16:4rem;

  /* ── Motion ── */
  --ease:cubic-bezier(0.2,0.8,0.2,1);            /* default UI transition */
  --ease-premium:cubic-bezier(0.16,1,0.3,1);     /* THE signature ease, every meaningful state change */
  --ease-out-soft:cubic-bezier(0.32,0.72,0,1);   /* long smooth lift / glide */
  --spring:cubic-bezier(0.34,1.56,0.64,1);       /* overshoot pop: picks, dots, tags landing */
  --duration-fast:120ms; --duration:180ms; --duration-lift:480ms;
}
```

`--red` (`#EF4444`) exists in globals but is **retired by the color law**. Do NOT inline it and do NOT use it for any state. Red is only ever for a genuinely destructive, confirm-first action, which a tile should almost never have.

---

## 2. FONTS (the exact links, the roles, and the fix for the current bug)

### The bug (must fix)

The current `HEAD` const in `mcp/src/tiles/templates.ts` (line 54) has **no font `<link>` at all**. `body` sets `font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif` (Inter is named but never loaded, so it silently falls to the system UI font), and `.title` sets `font-family:'Instrument Serif',Georgia,serif` (Instrument Serif is never loaded, so **every title renders in Georgia**). Result: the signature serif number/title look is missing on every generated tile. This is the single biggest reason the tiles read as "generic" instead of "Vitality."

### The fix (put these three lines in every tile's `<head>`, before the `<style>`)

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

Note on the sealed-tile "no runtime fonts" rule in `gotchas.md`: that rule means **no fragile local/self-hosted font that may 404**. Google Fonts over a `<link>` is the app's own approach (`app/layout.tsx` uses next/font for the same three families) and is the DNA's prescribed method for a sealed tile (`dna/theme.md` §2). Load them. Keep the fallback stacks so the tile still reads on-brand if the network drops.

### The three families and their exact roles

Declare the stacks once in `:root`:

```css
:root{
  --font-inter:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  --font-serif:'Instrument Serif','Times New Roman',Georgia,serif;
  --font-mono:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace;
}
```

| Family | Token | Used by (which elements) |
|---|---|---|
| **Inter** | `--font-inter` | `body` and ALL UI: body copy, buttons, inputs, list rows, values inside chips. Weights 400 to 700. Always `-webkit-font-smoothing:antialiased`. |
| **Instrument Serif, ITALIC** | `--font-serif` + `font-style:italic` | The tile **title**, the **hero number**, the eyebrow **number** (`01`), any warm one-line voice. `font-weight:400`, `letter-spacing:-0.01em` (title `-0.02em`). This is where the personality lives, use it on purpose, not everywhere. |
| **JetBrains Mono** | `--font-mono` | Eyebrow **labels**, section labels, pill text, unit captions, axis ticks, small-caps meta. Uppercase, tracked `0.2em` for eyebrows/section labels, `0.12em`–`0.14em` for in-component micro-labels. |

Body base rule (put on `body`):

```css
body{
  font-family:var(--font-inter);
  color:var(--fg); background:transparent;
  -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;
}
```

Headings, if any (Inter 600, tight): `h1,h2,h3{font-weight:600;letter-spacing:-0.01em;line-height:1.2}`.

Helper for serif-italic voice: `.serif-italic{font-family:var(--font-serif);font-style:italic;font-weight:400;letter-spacing:-0.01em}`.

---

## 3. THE SHARED "VITALITY TILE SHELL" (HTML + CSS every template inherits)

Every template renders this skeleton, then fills the hero/section slots for its kind. It is: a header row (eyebrow number + mono label + a settings gear), a hero (serif number + mono unit + a status pill), a primary action, at least one real section/card, and honest empty + error states. One centered `max-width` column, one `gap` rhythm, generous negative space, one accent. This is the whole "small on the grid, opens full" trick: a centered column, `clamp()` type/padding, `flex-wrap`, and one narrow `@media`.

### The skeleton HTML

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Vitality Tile</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
/* :root tokens from section 1 + the font stacks from section 2 go here */

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{height:100%}
html{overscroll-behavior-y:none}
body{
  font-family:var(--font-inter); color:var(--fg); background:transparent;
  font-size:var(--text-base); line-height:1.5;
  -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;
  accent-color:var(--mint);
  -webkit-user-select:none; user-select:none;             /* app-like; opt content into .selectable */
}
input,textarea,select,[contenteditable]{caret-color:var(--mint)}
.selectable,.selectable *,input,textarea,[contenteditable]{-webkit-user-select:text;user-select:text}
::selection{background:rgba(110,231,183,0.25)}            /* mint wash, never OS blue */
::-moz-selection{background:rgba(110,231,183,0.25)}
button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit}
input,select{font-family:inherit;color:inherit}

/* ── atmosphere: black (host) + faint mint glow + faint grain. Fixed, non-scrolling, pointer-events:none ── */
.shell{position:relative;min-height:100%;padding:clamp(16px,5vw,40px);z-index:0}
.shell::before{content:'';position:fixed;inset:0;z-index:0;pointer-events:none;
  background:radial-gradient(60% 40% at 50% -5%,rgba(110,231,183,0.10),transparent 70%),
             radial-gradient(50% 30% at 100% 100%,rgba(31,77,61,0.18),transparent 70%)}
.shell::after{content:'';position:fixed;inset:0;z-index:1;pointer-events:none;
  opacity:.035;mix-blend-mode:overlay;background-size:200px 200px;
  background-image:url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")}

/* ── the one centered column ── */
.body{position:relative;z-index:2;max-width:520px;margin:0 auto;
  display:flex;flex-direction:column;gap:clamp(16px,3vw,24px)}

/* ── header: eyebrow (serif num + mono label) on the left, settings gear on the right ── */
.head{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-4)}
.eyebrow{display:flex;align-items:center;gap:var(--space-3);min-width:0}
.eyebrow .num{font-family:var(--font-serif);font-style:italic;font-size:var(--text-lg);color:var(--mint);line-height:1}
.eyebrow .label{font-family:var(--font-mono);font-size:var(--text-xs);text-transform:uppercase;letter-spacing:.22em;color:var(--muted-strong)}
.gear{flex:none;width:38px;height:38px;border-radius:11px;border:1px solid var(--border);
  background:var(--card);color:var(--muted-strong);display:grid;place-items:center;
  transition:color var(--duration) var(--ease),border-color var(--duration) var(--ease),background-color var(--duration) var(--ease)}
.gear:hover{color:var(--mint);border-color:var(--mint-glow)}
.gear:active{transform:scale(.94)}
.gear svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}

/* ── hero: the title + the big serif number + unit + a status pill ── */
.hero{position:relative;overflow:hidden;
  border:1px solid rgba(110,231,183,0.18);border-radius:var(--radius-xl);
  background:radial-gradient(120% 80% at 0% 0%,rgba(110,231,183,0.07),transparent 60%),var(--card);
  box-shadow:var(--ring-mint),var(--glow-mint-hero),var(--shadow-inset);
  padding:clamp(18px,5vw,26px);display:flex;flex-direction:column;gap:var(--space-4)}
.hero .title{font-family:var(--font-serif);font-style:italic;font-weight:400;
  font-size:clamp(2rem,7vw,2.75rem);line-height:1;letter-spacing:-0.02em}
.heroRow{display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-3);flex-wrap:wrap}
.bignum{font-family:var(--font-serif);font-weight:400;
  font-size:clamp(3.5rem,13vw,5.2rem);line-height:.82;letter-spacing:-0.02em;
  font-variant-numeric:tabular-nums}                       /* reserve width for the widest value */
.unit{font-family:var(--font-mono);font-size:var(--text-xs);letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}
.pill{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:var(--radius-pill);
  font-family:var(--font-mono);font-size:.62rem;font-weight:600;text-transform:uppercase;letter-spacing:.16em;border:1px solid var(--border)}
.pill .dot{width:6px;height:6px;border-radius:50%}
.pill.good{color:var(--mint);border-color:rgba(110,231,183,0.4);background:rgba(110,231,183,0.05)} .pill.good .dot{background:var(--mint)}
.pill.caution{color:var(--amber);border-color:rgba(245,158,11,0.4);background:rgba(245,158,11,0.06)} .pill.caution .dot{background:var(--amber)}
.pill.idle{color:var(--muted);border-color:var(--border);background:transparent} .pill.idle .dot{background:var(--muted)}

/* ── section: eyebrow rule + a card ── */
.section{display:flex;flex-direction:column;gap:var(--space-4)}
.secEyebrow{display:flex;align-items:center;gap:var(--space-3)}
.secEyebrow .num{font-family:var(--font-serif);font-style:italic;font-size:var(--text-lg);color:var(--mint);line-height:1}
.secEyebrow .label{font-family:var(--font-mono);font-size:var(--text-xs);text-transform:uppercase;letter-spacing:.22em;color:var(--muted-strong)}
.secEyebrow .rule{flex:1;height:1px;background:linear-gradient(90deg,var(--border-strong),transparent)}
.card{border:1px solid var(--border);border-radius:var(--radius-card);
  background:linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.012));
  padding:var(--space-5);box-shadow:var(--shadow-inset),var(--shadow-card);
  transition:border-color var(--duration) var(--ease-premium),box-shadow var(--duration) var(--ease-premium)}
.card:hover{border-color:rgba(110,231,183,0.28);box-shadow:var(--glow-mint-hover)}

/* ── primary action: mint fill, dark ink, press dips 1px. Full-width hero CTA. ── */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:var(--space-2);
  padding:.6875rem var(--space-4);border-radius:var(--radius-md);
  font-size:var(--text-sm);font-weight:600;line-height:1;
  transition:background var(--duration) var(--ease-premium),transform var(--duration-fast) var(--ease-premium)}
.btn-primary{background:var(--mint);color:var(--mint-ink)}
.btn-primary:hover{background:var(--mint-hover)}
.btn-primary:active{transform:translateY(1px)}
.btn-primary:disabled{opacity:.5;cursor:not-allowed}
.btn-ghost{background:transparent;color:var(--fg);border:1px solid var(--border-strong)}
.btn-ghost:hover{border-color:var(--mint);color:var(--mint)}
.btn-block{width:100%}

/* ── input: faint card fill, mint focus, no OS blue ── */
.input{width:100%;background:var(--card);border:1px solid var(--border-strong);color:var(--fg);
  padding:12px 14px;border-radius:var(--radius-lg);font-size:var(--text-base);outline:none;
  transition:border-color var(--duration) var(--ease),background var(--duration) var(--ease)}
.input::placeholder{color:var(--muted)}
.input:focus{border-color:rgba(110,231,183,0.45);background:rgba(110,231,183,0.04)}

/* ── honest states ── */
.empty{text-align:center;color:var(--muted);padding:var(--space-8) var(--space-4);
  border:1px dashed var(--border);border-radius:var(--radius-card)}
.empty .lead{font-family:var(--font-serif);font-style:italic;font-size:var(--text-lg);color:var(--muted-strong)}
.msg{min-height:16px;font-size:var(--text-xs);color:var(--muted)}   /* transient status line */
.msg.warn{color:var(--amber)}                                       /* a caution / soft error, amber never red */

/* ── settings drawer (optional; hidden by default, gear toggles it) ── */
.settings{border:1px solid rgba(110,231,183,0.26);border-radius:16px;background:rgba(110,231,183,0.05);
  padding:16px;display:flex;flex-direction:column;gap:10px;text-align:left}
.settings h3{font-family:var(--font-mono);font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:var(--mint);font-weight:700}
.settings p{font-size:.8rem;color:var(--muted-strong);line-height:1.55}

/* ── the one signature entrance: a cozy spring pop, staggered via --i. Resting state opacity:1 (fill-mode both) ── */
@keyframes rise{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
.rise{opacity:0;animation:rise var(--duration-lift) var(--spring) both;animation-delay:calc(var(--i,0)*70ms)}

@media (max-width:420px){.hero .title{font-size:clamp(1.8rem,9vw,2.4rem)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}
  .rise{opacity:1;transform:none}}
</style>
</head>
<body>
  <main class="shell">
    <div class="body">

      <!-- header -->
      <div class="head rise" style="--i:0">
        <div class="eyebrow"><span class="num">01</span><span class="label">YOUR TILE</span></div>
        <button class="gear" id="gear" type="button" aria-label="settings">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>

      <!-- hero -->
      <section class="hero rise" style="--i:1">
        <h1 class="title">Cold plunges</h1>
        <div class="heroRow">
          <span class="bignum" id="value">0</span>
          <span class="pill idle" id="status"><span class="dot"></span>nothing yet</span>
        </div>
        <span class="unit">today</span>
      </section>

      <!-- settings drawer (optional) -->
      <div class="settings rise" id="settings" style="--i:2" hidden>
        <h3>settings</h3>
        <p>Only shown if the kind actually needs a setting, for example a bring-your-own-key or a goal target. If there is nothing to set, drop this block entirely.</p>
      </div>

      <!-- primary action -->
      <button class="btn btn-primary btn-block rise" style="--i:2" id="primary">Log one</button>

      <!-- section / card (the real, kind-specific content) -->
      <section class="section rise" style="--i:3">
        <div class="secEyebrow"><span class="num">02</span><span class="label">THIS WEEK</span><span class="rule"></span></div>
        <div class="card" id="section"><!-- 7-day chart, list, or history goes here --></div>
      </section>

      <div class="msg" id="msg" aria-live="polite"></div>

    </div>
  </main>
</body>
</html>
```

Rules for the shell:
- **One accent.** Mint carries good/brand. Amber only for the single caution spot per tile. Never two loud colors competing.
- **Negative space is the luxury.** The `gap:clamp(16px,3vw,24px)` between beats and the roomy hero padding are the point. Do not fill every pixel.
- **The hero number is the star.** Serif, tabular-nums, huge (`clamp(3.5rem,13vw,5.2rem)`), sitting alone with air around it. This is the Fuel `.calNum` treatment.
- **Every tile has at least one real section** below the hero (a 7-day chart, a history list, a plan card). A lone number + two buttons is the floor we are leaving behind.
- **Honest states are built in:** `.empty` invites the first entry, `.msg.warn` shows a calm one-line caution/error (amber, never a red stack trace), a status pill that reads `idle` when the tile can't yet make a claim.
- **Settings is optional.** Include it only when the kind has something to set. If not, the gear can still open a tiny "about this tile" note, or drop the gear.

---

## 4. MOTION RULES (the "never janky" law)

The feel: things arrive softly and confidently, settle with a tiny overshoot, then are still. Never linear, never harsh, never strobing.

**What may animate.** ONLY `transform` and `opacity`. Never `width`, `height`, `top`, `left`, `right`, `bottom`, `margin`, `padding`, or `box-shadow` in a loop or transition (they trigger layout/paint every frame and drop below 60fps on a phone). A width becomes `scaleX`. A position becomes `translate`. A glow pulse becomes `opacity` on a pre-blurred layer. Color/border/background transitions on discrete state changes are fine (they do not thrash).

**Durations + easing (use the tokens, never a hand-picked bezier):**
- Discrete state change (hover, active, color, border): `var(--duration)` `180ms` on `var(--ease-premium)`.
- Tiny tap transform: `var(--duration-fast)` `120ms`.
- Entrance lift / a value settling / a bar filling: `var(--duration-lift)` `480ms`.
- Anything that should feel "landed" (a pick, a dot arriving, a tag popping): `var(--spring)` overshoot.
- A long single glide across a track: `var(--ease-out-soft)`.
- `cubic-bezier(0.16,1,0.3,1)` (`--ease-premium`) is the heartbeat. When unsure, use it.

**Never-janky rules (from `gotchas.md`, non-negotiable):**
- Resting state is `opacity:1` with `animation-fill-mode:both`. Never depend on the entrance to reveal (a dropped animation with an `opacity:0` base renders invisible).
- No `filter:blur()` transition and no dragging a `backdrop-filter:blur` element's transform on mobile (the phone GPU re-rasterizes every frame). If a glass element must move, drop the blur for the motion.
- The dramatic intro plays ONCE (`forwards`). Only slow glows/breathes loop (6.5s to 10s), never strobe.
- Reserve width for the widest value an animated number reaches; align with `tabular-nums` (a count-up that widens clips at the edge).
- Stagger via a resolved inline `--i` (or `--enter-delay`), not a `calc()` with an unset var (an unset var silently drops the whole `animation` shorthand).
- One-shot re-trigger: remove the class, force a reflow (`void el.offsetWidth`), re-add.

**Tasteful micro-interactions only (the whole allowed set):**
- Button press dips `translateY(1px)` or `scale(.96)`.
- Card hover lifts with the mint `box-shadow` glow, never a `translateY(-4px)` inside an `overflow:hidden` clip.
- The one-tile entrance: `.rise` cozy spring pop, staggered ~70ms per beat.
- A bar/meter fills via `width` on `--duration-lift` OR (preferred, buttery) `scaleX` with `transform-origin:left`.
- A live status dot may pulse slowly (`opacity`+`scale`, ~2.6s).
- One signature moment per tile (a 7-day chart drawing on, a ring counting up, a single confetti-free "logged" pulse). Not five.

**Reduced motion is mandatory.** Every tile ends with:
```css
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.rise{opacity:1;transform:none}}
```
Gate JS-driven motion too: `const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches; if(!reduce){/* particles, sweeps, bursts */}`.

---

## 5. COLOR LAW + VOICE (quote these rules; they are absolute)

### Color law (from `dna/theme.md` and `gotchas.md`)
- Background is **pure black** (`#000`). The tile renders transparent so the host black shows through.
- **Mint = good / success / the brand. Azure = good (data / readings, used sparingly, Vitals-style). Amber = caution. NEVER red for state.** Red only for a genuinely destructive action that confirms first (a tile almost never has one).
- **Meaning must live on the word + a small dot/pip + a glyph, never on color alone** (colorblind-safe). A "caution" pill says the word, shows an amber dot, and uses an amber glyph.
- **Reserve amber for ONE deliberate caution spot per tile.** Sprinkling it kills the signal.
- Greys are **always white at an opacity** (`rgba(255,255,255,a)`), never a solid grey hex.
- **Never shame.** Any miss / off-target / low state is warm: amber or soft neutral, never red, ideally with a gentle "give me grace" out.
- No rainbow, no off-palette coral, no random hues. Iris (`#a78bfa`) is Vee-only; do NOT use it on a general tile.

### Voice (the 8-rule checklist from `dna/voice.md`, run on every string)
1. **Zero em dashes or en dashes. Anywhere.** Copy, headings, demo text, visible code comments. Use a period, a comma, or "and". Non-negotiable.
2. **No emojis. Ever.** If a word needs a symbol, inline a stroked SVG glyph colored with `currentColor`, never an emoji or unicode checkmark.
3. **Plain English first, jargon second.** Say the everyday word. If a technical term is genuinely useful, lead with the plain meaning, then name it.
4. **No noise text.** Every word earns its place. If deleting a sentence changes nothing the user understands or can do, delete it. No "welcome to your dashboard", no clever sayings.
5. **Warm, no-shame feedback.** A miss is met with encouragement, colored amber or soft neutral, never red, with a one-tap gentle out.
6. **Character warmth in celebration.** When the user wins, the tile is allowed to be genuinely happy for them. This is the one place it can be a little extra. Personal, not corporate.
7. **Sentence case, simple, inviting.** Short, powerful, scannable in seconds, readable by any age. No Title Case Headings, no ALL CAPS shouting (small mono uppercase labels are a visual style, not shouting copy).
8. **Personal over generic.** Speak to this user's real data. "You logged 5 days this week" beats "Great progress!"

Voice examples to copy the tone (right column, never left):
- Empty: not "No data available." -> "nothing logged yet. add your first one and the page comes alive."
- Missed day: not "You FAILED to log." -> "yesterday slipped by, that happens. tap once and we pick it right back up."
- Error: not "Error 500: request failed." -> "that did not save. give it another tap and it should land."
- Off-target: not "Over by 600 (BAD)." -> "a little over today, no big deal. one lighter day evens out the week."

Highlight one phrase per sentence (the phrase that carries the value) in mint (good lever) or amber (gentle caution), with a soft underline glow. One per sentence, never more.

---

## 6. PER-KIND RICHNESS (what makes each kind Fuel-grade vs a bare number)

Every kind inherits the shell (header, hero number, primary action, honest states, reduced-motion). The difference between "bare counter" and "Fuel-grade" is the **section(s) below the hero** and the **microcopy**. Below, for each of the six archetypes, is what to add so it earns its place. Each reports exactly one `report()` stream when the value is real (never a fabricated zero).

### count / tally (kind `count`, and `intake`) — the counter template
The canonical beer/water/reps tile.
- **Hero:** big serif today count + a mono unit ("beers today", "glasses today"). Status pill: `idle` before any log, then `good` (up goals) or a neutral count.
- **Primary:** a large `+` (and a smaller `-`), each dip-on-press. For intake with a natural serving, offer 1-2 quick-add chips (a "+1 glass") rather than only raw stepping.
- **The section that makes it Fuel-grade:** a **7-day mini bar chart** (`.card`), one bar per day, today's bar mint and taller, past days dimmer, bars grow via `scaleX`/height-on-entrance once. A tiny stat line under it: "best day 6, 7-day avg 3.1". This turns a number into a trend the user recognizes as theirs.
- **Microcopy:** for a down goal (beer, sugar), warm not preachy: "three today. an easy evening keeps the week light." For an up goal (water): "two glasses in. a few more and you are set."
- **Report:** `{kind:'count'|'intake', value: today's running total, goalDirection}`.

### rating 1 to 5 (kind `rating`) — the scale template
Mood, energy, quality out of 5 (or 10 if the goal says /10).
- **Hero:** today's chosen rating as the big serif number over the scale max ("4 / 5"), or the word ("good") if the tile can honestly name it.
- **Primary:** a row of tap targets 1..N, each ≥44px, the chosen one fills mint with a spring pop, the rest are faint outlines. The whole row is the control, not a separate submit.
- **The section:** a **7-day dot/pip strip** or a tiny sparkline of past ratings so the user sees the shape of their week (a dip mid-week is visible and un-shamed). Under it, one honest line only when there is real data: "you have rated 5 days, your calm days all followed an early night."
- **Microcopy:** never a value judgment on a low rating. "a 2 today. rough days are data too, not a failure."
- **Report:** `{kind:'rating', value: today's last rating, goalDirection}`.

### currency / money (kind `money`) — the money template
Daily spend, savings added, a running total.
- **Hero:** the amount formatted (`$1,240`, tabular-nums, no cents on the big number) with a mono caption ("spent today" / "saved"). For a down goal (spend), status `good` when under a soft budget, `caution` (amber, never red) when over.
- **Primary:** a numeric amount input (`inputmode=decimal`) + an "add" button. Clamp an absurd typo, never log it raw.
- **The section:** a **this-week list** of entries (each: label, amount, a soft-confirm remove) OR a 7-day spend bar chart, plus a "this week $X, 7-day avg $Y" stat. If it is a budget, a slim meter (mint fill, amber past the line) shows the lane.
- **Microcopy:** over budget is amber and warm: "a bit over today, no big deal. one quiet day evens the week." Never "BAD" or red.
- **Report:** `{kind:'money', value: amount today, goalDirection}`.

### measurement, e.g. weight (kind `measure`) — the measure template
Weight, body fat, blood pressure, distance.
- **Hero:** the last value + unit as the big serif number ("82.4 kg"), plus a tiny delta vs the previous reading (mint if moving toward the goal, amber if away, an up/down glyph + the word, never color alone).
- **Primary:** one numeric input snapped to the unit's real increment (0.1 for bodyweight, 0.5/0.25 for plates) + a "save" button, saved only on an explicit commit (never on Enter alone). Show the last value as a placeholder hint, not prefilled text.
- **The section that makes it Fuel-grade:** a **glowing trend sparkline** (the Fuel/Peak line-draw: a mint gradient stroke drawing on via `stroke-dashoffset`, a soft glow, dots welded to the vertices) with **"nice" padded y-bounds** so a steady line sits mid-card, not pinned to the floor. Range pills (7d / 30d / all) optional. A one/zero-point series shows a quiet "log a couple more and your line starts here", never a blank box.
- **Microcopy:** "down 0.3 since last week, that is the average doing its job." Trend over any single reading.
- **Report:** `{kind:'measure', value: latest measurement, goalDirection}` (weight is often `neutral`).

### duration / streak (kind `duration`, and streak via `count`/`done`) — the timer template
Meditation minutes, reading time, screen time; or a day streak.
- **Hero:** today's total minutes as the big serif number + "min today". For a streak, the streak count + a small flame glyph, and the flame only lights after the day is truly logged (honesty of state).
- **Primary:** deterministic steppers (`+5 / +10 / +15 min`) and a clear, NOT a live stopwatch (a stepper keeps reporting clean). Each button dips on press.
- **The section:** a **7-day minutes bar chart** with a weekly total + average ("this week 95 min, 4 of 7 days"). For a streak tile, a 7-dot week row with earned days lit and a calm "longest 12 days" note.
- **Microcopy:** "twenty minutes in. that is a real sit, not a token one." A broken streak is warm: "the streak reset, that is fine. day one again starts now."
- **Report:** `{kind:'duration', value: minutes today, goalDirection}`.

### yes-no / binary (kind `done`) — the toggle template
Habits: did I read, took my supplement, no-alcohol day.
- **Hero:** a state word ("done today" / "not yet") + a large mint check glyph when done, a faint outline when not. The pill reads `good` only after the commit, `idle` before, gated on the entry's date equalling today (never a stale flag).
- **Primary:** one big yes/no toggle. Tapping done fills mint with a spring pop and a single "logged" pulse; tapping again un-does (with a soft confirm if that clears real history).
- **The section:** a **7 (or 30) day dot grid** of done/missed days so the habit's rhythm is visible, plus a streak stat ("5 in a row, 18 this month"). This is what turns a toggle into a habit tracker people keep.
- **Microcopy:** a missed day is never shame: "missed yesterday, no big deal. today is a fresh mark." A win can be warm: "five days straight. you are quietly becoming the person who just does this."
- **Report:** `{kind:'done', value: 1 if done today else 0, goalDirection}`.

**Across all kinds:** persist through the host bridge (`Vitality.save`/`load`) with a try/catch localStorage fallback, hold saves behind a `loaded` flag, build local date keys with local getters (never `toISOString().slice`), and `report()` only when the value is real.

---

## 7. DOs / DON'Ts (the Apple-minimal-luxury bar)

**DO**
- Load the three webfonts and use Instrument Serif italic for the title + hero number, Inter for UI, JetBrains Mono for eyebrows/labels/units.
- Give every tile a real hero number AND at least one real section (chart/list/history). No lone counters.
- Keep one accent (mint), one caution spot (amber), lots of negative space, one signature moment.
- Make the big number the star: serif, huge, tabular-nums, air around it.
- Keep the body transparent and let the host paint pure black. Atmosphere (glow + grain) goes on a fixed non-scrolling wrapper.
- Carry meaning on word + dot + glyph, not color alone.
- Write every state honestly: an inviting empty state, a calm amber one-line error, a status pill that reads `idle` when it cannot make a claim.
- Persist on every interaction, soft-confirm before deleting, clamp numeric typos, honor `prefers-reduced-motion`.
- Read every string aloud as a friend who cares. Warm, plain, specific, no shame.

**DON'T**
- Don't ship a bare number with two buttons and call it a tile.
- Don't use red for state, ever. Amber is the strongest caution. Never shame.
- Don't leave Instrument Serif unloaded (the current bug: it falls to Georgia and the tile stops looking like Vitality).
- Don't use em dashes, en dashes, emojis, or OS-blue selection/caret/tap-flash.
- Don't animate layout properties or `box-shadow` in a loop, or transition `filter:blur` on mobile. Transform + opacity only.
- Don't paint a solid grey hex for text; use white at an opacity.
- Don't use Tailwind, a CDN, a library, or a runtime font that could 404. One sealed file.
- Don't use iris/violet on a general tile (Vee-only), and don't sprinkle amber.
- Don't hand-roll fake "gems" as decoration; a simple mint glyph chip is the inline-safe stand-in.
- Don't fabricate a `report()` value; report one stream, only when it is real.
```
