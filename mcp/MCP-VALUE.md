# Why build a tile with the Vitality MCP

**One line:** plain Claude Code builds you a generic widget that lives nowhere and knows nothing. The Vitality MCP builds you a tile that is unmistakably Vitality, already knows food, lifts, and supplements, lands alive on your dashboard, and is provably correct.

---

## Side by side

You say the same thing to both: "build me a macro tracker."

| | Plain Claude Code | The Vitality MCP |
|---|---|---|
| **Look** | Whatever it guesses today. Random colors, a system font, a box with a border. Generic. | On-brand from the first paint. Pure black, mint `#6EE7B7` accent, Instrument Serif numbers, Inter body, JetBrains Mono labels, the signature ease, the color law. It reads as Vitality. |
| **Domain knowledge** | Empty. You type "banana" and it has no idea. You teach it every food, lift, and dose by hand. | Ships knowing the domain. Inline food library, the 58-lift logger library, the supplement catalog with doses and timing. Type "bana" and get a real banana with real macros, offline, no flicker. |
| **Where it lives** | A loose `.html` file in your downloads. Homeless. No data store, no host, no way to see it tomorrow. | A real home with zero setup. Pre-wired to the dashboard bridge (`save`/`load` for its own data) and drops onto your grid. No Supabase, no Vercel, no keys to wire. |
| **Reaching real APIs** | It invents a fetch call, maybe leaks a key, maybe gets the endpoint wrong, maybe never tests the seal. | Vetted bring-your-own-key recipes grounded in Vitality's own working integrations (for example real USDA FoodData Central). The user's key, the user's quota, the seal intact. |
| **Correctness** | No contract. The number it emits matches nothing. You hope. | Guardrails. One optional `report()` line feeds the "Vitality noticed" engine through a locked contract, and the output is proven valid by tests every time. |

Plain Claude gives you a thing. The MCP gives you a Vitality thing that already belongs somewhere.

---

## The five superpowers

1. **Design DNA.** The exact tokens, type roles, motion, icons, components, and voice that make a tile read as Vitality on the first paint, not after ten rounds of "make it match the brand." See `dna/`.

2. **Data libraries.** A tile ships already knowing the domain: real foods with real macros, the canonical lift library, the supplement catalog with doses and timing slots. Inlined, offline, no flicker. See `data/`.

3. **Zero-setup hosted home.** The tile is sealed self-contained HTML pre-wired to the dashboard bridge. It saves and loads its own data and lands on your grid with no Supabase, no Vercel, no keys. It is alive the moment it lands.

4. **API recipes.** Vetted bring-your-own-key patterns grounded in Vitality's own working integrations, so a tile can reach the real internet (USDA macros, FX, weather) without ever holding a Vitality key and without breaking the seal. See `recipes/`.

5. **Contract guardrails.** A small fixed `report()` taxonomy (seven kinds: intake, count, duration, rating, measure, money, done) is the narrow waist any tile MAY report one number through, becoming comparable across the dashboard and, if present, the optional Vee tile. A tile with no meaningful stream simply never calls `report()` and nothing breaks. When a tile does report, the MCP guarantees the output matches the locked contract every time, so the dashboard and the optional Vee tile can never build mismatched halves.

---

## Vanilla is not thrown away. It is weaponized into the engine.

Every tile is one sealed vanilla HTML file. No libraries, no React, no build step. That constraint is the point, not a limitation. Vanilla is what makes a tile portable, instantly hostable, and trivially shareable. The MCP turns that plain file into the engine: it pours in the design DNA so it looks like Vitality, the data libraries so it knows the domain, the bridge so it has a home, the API recipes so it can touch the real world, and the report contract so a hundred users' tiles become one comparable data family that Vee can reason over. The seal stays simple. The capability behind it is overpowered.

---

## What is in the pack

### `dna/` (the look, the feel, the voice)

- `README.md`: how to read the DNA pack and the non-negotiable rules, in build order.
- `theme.md`: exact color tokens, font stacks and type roles, spacing/radii/motion tokens, the black + grain + glow treatment, and a copy-paste base tile shell.
- `motion.md`: easing and duration tokens, the cozy loader, the entrance system, tile-art choreography, staggered entrances, reveal-on-scroll, and the reduced-motion law.
- `icons.md`: the line-art icon house rule with ready-to-inline glyphs, the tile-art motif language (graph, ECG, candles, orbit, inflow, gem), and the flat gem-mark vocabulary.
- `components.md`: reusable UI blocks: card, eyebrow, input, pill, mint button, spark action, progress bar and pips, badge, coach row.
- `voice.md`: the 8-rule copy checklist, glyphs not emojis, the one-phrase highlight, and a before/after copy table.
- `vee-noticed.md`: the "Vitality noticed" insight card: iris-accented tokens, full card anatomy, one-tap action bubbles, one-at-a-time disclosure, and Vee's voice.
- `feature-fuel.md`: Fuel interaction recipes: pre-scan quiz, category-grid food picker, meal breakdown card, analyzing overlay.
- `feature-interactions.md`: the premium micro-motions (sheet, quiz, globals) distilled to vanilla CSS and JS.
- `feature-weight-supps.md`: the glowing weight-trend chart (range pills, stat row) and the time-of-day supplement stack, as sealed-HTML snippets.
- `example-workout-logger.md`: the gold reference tile: state-as-color set rows, the overload celebration, a hand-drawn SVG history chart with editable log, and a capstone finish. This is the bar.

### `data/` (the domain knowledge a tile ships with)

- `exercise-library.md`: the canonical 58-lift library Vitality's logger uses (name, tier, muscle, equipment, form tip, swaps), with an inline sample and a link to the full set.
- `food-library.md`: a sample of the curated USDA-consistent food catalog plus the data shape, so a food tile feels Vitality-grade offline.
- `supplement-library.md`: the supplement domain (doses, timing slots, how to take each), as inline JSON for a daily checkable stack.

### `recipes/` (reaching the real internet safely)

- `api-plugins.md`: the bring-your-own-key pattern, a copy-paste USDA FoodData Central recipe grounded in Vitality's working integration, and which APIs pair with which tile kinds, all without breaking the seal.
