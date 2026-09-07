This is the lean icon core. For the full motif set (every domain's bespoke glyphs), read {section:"icons"}.

# Vitality DNA: Icon Core (inlinable SVG)

Everything here is plain HTML, CSS, and inline SVG. No libraries, no React, no
Three.js, no emoji. This core covers what EVERY tile build needs: the house icon
style, the handful of universal glyphs a typical tile reaches for, and the ship
checklist. For a domain-specific mark (flame, drop, dumbbell, pill, moon, bolt,
heart, leaf, scale, camera, chat, sun, trend up/flat/down, plus the full tile-art
motif recipes), read the full doc at {section:"icons"}.

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
- Inline SVG only. No icon fonts, no `<img>`, no external sprite sheets.

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

Group several of these for texture (a week grid, a sprinkle of chips).

---

## 2. Universal glyph snippets

The small set almost every tile reaches for. Each drops straight inside the SVG
frame above. Verbatim from the app's real icon set. If you need a domain glyph
that is not here, read the full doc at {section:"icons"}.

```html
<!-- plus / add -->
<path d="M12 5v14M5 12h14"/>

<!-- check / done -->
<path d="M5 12.5 9.5 17 19 6.5"/>

<!-- close / dismiss -->
<path d="M6 6 18 18 M18 6 6 18"/>

<!-- arrow right / go -->
<path d="M4 12h15M13 6l6 6-6 6"/>

<!-- sparkles / AI (spark) -->
<path d="M11 4l1.5 3.9L16.4 9.4 12.5 11 11 14.9 9.5 11 5.6 9.4 9.5 7.9 11 4Z"/><path d="M18 14.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8.8-1.9Z"/>

<!-- star / favorite -->
<path d="M12 3.6l2.5 5.2 5.6.8-4.1 4 1 5.6L12 16.6 6.9 19.2l1-5.6-4.1-4 5.6-.8L12 3.6Z"/>

<!-- target / goal (generic ring + progress motif) -->
<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.8"/><circle cx="12" cy="12" r="0.9"/>

<!-- clock / time -->
<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3.2 1.9"/>

<!-- calendar -->
<rect x="4" y="5.5" width="16" height="14.5" rx="2.4"/><path d="M4 10h16M8.5 3v4.5M15.5 3v4.5"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/>

<!-- search -->
<circle cx="11" cy="11" r="6"/><path d="M19.5 19.5 15.3 15.3"/>

<!-- gear / settings -->
<circle cx="12" cy="12" r="3"/><path d="M19.4 13a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V19a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4.6 13H4.5a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H10a1.6 1.6 0 0 0 1-1.5V2.5a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.1a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>

<!-- trash / delete -->
<path d="M5 7h14M9 7V5h6v2M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/>
```

Chevron (momentum / forward): there is no separate snippet, use the `arrow right`
glyph above, or a bare `<path d="M9 6l6 6-6 6"/>` on the same 24x24 frame.

If a glyph you need is not here, draw a new one on the same 24x24 grid following
the house rule, or pull the exact domain glyph from {section:"icons"}.

---

## 3. Mint palette tokens (use these exact values)

Glyphs inherit `currentColor`; set that color from these tokens. Default mint.
```
--mint        #6EE7B7   line, default glyph color
--mint-bright #A7F3D0   peak dot, core, "live" highlight
--mint-glow   rgba(110,231,183, .25 .55 .7)  drop-shadow glows
--amber-art   #d98e3c   tile-art caution / candle-down tint
```
Color law: mint = good/up, amber = caution/down, never pure red. The UI state
amber is always `#F59E0B` (the `--amber-art` above is a softer tile-art tint).

### The self-draw primitive (universal)

Set `pathLength="100"` on any path, then animate `stroke-dashoffset` from 100 to 0
with `stroke-dasharray:100`. The line draws itself on. Works for any line-art
glyph. Never animate `filter` on a loop (re-rasterizes the blur every frame and
tanks the frame rate); pulse `opacity` on a pre-blurred twin instead.

---

## 4. Quick checklist for a Vitality-grade tile visual

- Icons: `viewBox 0 0 24 24`, `fill="none"`, `stroke="currentColor"`,
  `stroke-width="1.7"`, round caps and joins. Color from CSS.
- Inline SVG only. No emojis anywhere. Use a glyph from section 2 (or the full
  motif set at {section:"icons"}).
- Background motif keyed to the data (graph, ECG, candles, orbit, inflow, gem)
  lives in the full doc, {section:"icons"} section 4.
- Mint = good/up, amber = caution/down, never pure red.
- Pure-black backdrop with a soft mint radial glow.
- Animate lines with the `pathLength="100"` + `stroke-dashoffset` self-draw.
- Calm over busy. Few elements, slow loops, breathing glows.
- Always include the reduced-motion guard:
  `@media (prefers-reduced-motion: reduce) { .tile-art * { animation:none !important; } }`
