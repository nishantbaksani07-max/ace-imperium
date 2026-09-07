# Vitality reference pack (master index)

The whole reference the Vitality MCP hands a tile-builder's Claude Code. Read it, then build a tile that comes out at the full Vitality standard: a small living instrument on black with mint accents, soft springy motion, line-art icons, real history behind a tap, a warm voice that never shames, and real domain knowledge baked in. The pack spans four folders: `dna/` (how it looks, moves, sounds), `data/` (what it already knows), `recipes/` (how it safely reaches the real internet), and `lessons/` (the distilled bug-and-doc corpus the rules came from).

A tile is ONE self-contained sealed HTML file. No libraries, no React, no frameworks, no build step. Everything here inlines as plain CSS, vanilla JS, inline SVG, and inline JSON. The one allowed external load is a Google Fonts stylesheet link (Instrument Serif, Inter, JetBrains Mono). Where a Vitality source used React or Three.js, the idea is translated to something a flat HTML tile reproduces.

---

## What is in the pack

### `dna/` (the look, the feel, the voice)

| File | What it gives you |
|------|-------------------|
| `README.md` | This master index: every file, the build order, the non-negotiables. |
| `gotchas.md` | **MUST-READ.** Vitality's hard-won "do X, not Y (because Z)" rules: local date keys, the backdrop-filter drag trap, the color law, reduced-motion, save-on-action, no-emoji, and more. Bugs Alex already fixed, so a tile is right the first time. |
| `theme.md` | The look. Exact color tokens, font stacks + type roles, spacing/radii/motion tokens, the black + grain + glow treatment, how a tile sets a transparent background, and a copy-paste base tile shell. |
| `motion.md` | How Vitality moves. Easing + duration tokens, the cozy loader, the entrance system (draw-on, scale-from-inside, spring-pop), tile-art choreography (intro once then breathe), staggered list entrances, reveal-on-scroll, and the reduced-motion law. |
| `icons.md` | The line-art icon house rule + ready-to-inline glyph snippets, the tile-art motif language (graph, ECG, candles, orbit, inflow, gem) with copyable recipes, and the flat gem-mark vocabulary. |
| `components.md` | Reusable UI blocks: card/panel, eyebrow, input, pill, mint button, spark action, progress bar + pips, badge, coach row. |
| `voice.md` | How Vitality writes. The 8-rule checklist, glyphs not emojis, the one-phrase highlight, and a before/after copy table. |
| `vee-noticed.md` | The soul: the "Vitality noticed" insight card. Iris-accented tokens, full card anatomy, the highlight + underline sauce, one-tap action bubbles, one-at-a-time disclosure, entrance set, and Vee's voice. |
| `feature-fuel.md` | Fuel interaction recipes: the pre-scan quiz (chips + labeled slider), the category-grid food picker, the meal breakdown card, and the analyzing overlay. |
| `feature-weight-supps.md` | The glowing weight-trend chart (range pills, stat row) and the time-of-day supplement stack, as sealed-HTML snippets. |
| `feature-peak.md` | The "when am I at my best" tile: a circadian energy curve bent by what you log, an energy dial, a peak-aware day schedule, a substance log, a mood dial, and a CSS/SVG orbit gem standing in for the Three.js original. |
| `feature-finance-brand.md` | Money and KPI tile recipes from Finance and Brand: net-worth and balance cards, subscription and order rows, a live-FX number, and brand KPI readouts. |
| `feature-goals-water.md` | The Duolingo-style streak, identity-tagged big goals with progress and days-left, a plan-tomorrow queue, and the Water hydration ring with a servings target. |
| `feature-onboarding-quiz.md` | The intake quiz: one question per screen, a cozy springy entrance, one bespoke widget per question, a named-section progress stepper, and a celebration done-screen. |
| `feature-celebrations.md` | The "you did it" screens that break minimalism on purpose: the gem burst, the warm character voice, one big payoff, and when to fire one (only on a real win). |
| `feature-vee.md` | The Vee mentor surface: iris-accented chat (a warm character, not a chatbot widget), cards, and the cozy spring-settle entrances. |
| `feature-vitals.md` | The "readings" tile: the fused signal card, the 0 to 100 score ring, an SVG trend graph, and a stat grid, on the azure Vitals accent. |
| `feature-interactions.md` | The premium micro-motions (sheet, quiz, globals) distilled to vanilla CSS and JS. |
| `example-workout-logger.md` | The gold reference tile: state-as-color set rows, the overload celebration, a hand-drawn SVG history chart with editable log, and a capstone finish. This is the bar. |
| `showcase.html` | A live, openable render of the whole pack: the tokens, motion, icons, and feature recipes assembled into one sealed page so you can see the standard, not just read it. |

### `data/` (the domain knowledge a tile ships with)

| File | What it gives you |
|------|-------------------|
| `food-library.md` | A sample of the curated USDA-consistent food catalog plus the data shape (macros per 100g, friendly serving). Makes a food tile feel Vitality-grade offline: type "bana" and get a real banana with real macros, no flicker. Pull this for any macro or food tile. |
| `exercise-library.md` | A representative sample of the canonical 58-lift logger library (name, tier, muscle, equipment, form tip, two weight-matched swaps) as inline JSON, plus where the full set lives. Pull this for any workout or training tile. |
| `supplement-library.md` | The supplement domain as inline JSON (dose, timing slot, how to take each), enough to render a daily checkable stack grouped by time of day. Pull this for any supplement or stack tile. |

### `recipes/` (reaching the real internet safely)

| File | What it gives you |
|------|-------------------|
| `api-plugins.md` | The bring-your-own-key pattern (the user's key in the user's tile, the user's quota), a copy-paste USDA FoodData Central recipe grounded in Vitality's working integration, and which APIs pair with which tile kinds. All without breaking the seal or holding a Vitality key. Pull this whenever a tile needs live data the libraries do not cover. |
| `ai-mentor.md` | The bring-your-own-key Claude recipe: the settings gear that stores the user's own Anthropic key, the verified browser-direct Messages API call, the Vee-grounded mentor system prompt, and the warm no-key gate. Pull this for any AI mentor, coach, or chatbot tile. |
| `example-markets-tile.md` | The CEILING for a DATA tile: ONE complete, sealed, multi-section, responsive, on-brand BYO-key tile (a stock watchlist) that passes the floor at 0 errors / 0 warnings. The gold pattern for a tile richer than a counter. Steal its shell and swap the domain. |
| `example-mentor-tile.md` | The CEILING for an AI tile: ONE complete, sealed chat mentor (BYO Anthropic key) that talks browser-direct to Claude in Vee's voice and passes the floor at 0/0. Shows the one safety move for any tile that displays text it did not write: render with textContent, never innerHTML. Build any coach or chatbot from this. |

### `lessons/` (the corpus behind the rules)

| File | What it gives you |
|------|-------------------|
| `from-docs.md` | Lessons distilled from Vitality's own design and product docs: the principles the look and voice rules encode. |
| `from-git.md` | Lessons mined from real fixes in the git history: the bugs that became the gotchas, in their original context. |

---

## How to build a tile at the Vitality standard

Read in this order, then build. Step 0 is the MUST-READ that keeps the tile correct. Steps 1 to 6 give every tile the look, feel, and voice. Step 7 is where you pull in the domain pieces for YOUR tile.

0. `dna/gotchas.md` first, and MUST-READ. The hard-won "do X, not Y (because Z)" rules: local date keys, the backdrop-filter drag trap, the color law, reduced-motion, save-on-action, no emojis. These are bugs already fixed. Skipping this is how a tile ships broken.
1. `dna/theme.md`. Get the tokens and the look into your `:root`; start from its base tile shell.
2. `dna/motion.md`. Wire the easing tokens and the entrance + cozy-loader patterns.
3. `dna/icons.md`. Pick your glyphs and the one background motif that matches your data.
4. `dna/components.md`. Assemble from the shared pieces, do not reinvent them.
5. `dna/voice.md`. Write every user-facing string in the voice.
6. `dna/vee-noticed.md`. Reproduce this card only if the tile's whole job is to surface one insight.
7. Pull in the domain for your tile's kind:
   - A macro or food tile: inline the sample from `data/food-library.md`, and if it needs foods beyond the sample, add the USDA recipe from `recipes/api-plugins.md`.
   - A workout or training tile: inline the sample from `data/exercise-library.md`. Study `dna/example-workout-logger.md` as the worked example.
   - A supplement or stack tile: inline the JSON from `data/supplement-library.md` and render a daily checkable stack grouped by time of day.
   - Any tile needing live data the libraries do not cover (weather, FX, sports): use the bring-your-own-key pattern in `recipes/api-plugins.md`.
   - An AI mentor, coach, or chatbot tile: follow `recipes/ai-mentor.md` for the user's-own-key Claude call and the Vee voice, and build from the complete `recipes/example-mentor-tile.md`.
8. For anything richer than a counter, study a full worked example last: `dna/example-workout-logger.md`, `recipes/example-markets-tile.md` (a complete BYO-key DATA tile), and `recipes/example-mentor-tile.md` (a complete BYO-key AI chat tile), each passing the floor at 0 errors / 0 warnings. Aim for this richness: state carries meaning, history lives behind a tap, finishing feels like an event. Steal a shell and swap the domain.

A tile MAY report one number: only if it has one meaningful stream, end it with one optional `report({ key, label, value, date, kind })` line so that number feeds the dashboard's comparable data and, if present, the optional "Vitality noticed" engine. A tile without one never calls `report()` and nothing breaks. The seven kinds are intake, count, duration, rating, measure, money, done. See `vee-noticed.md` and `recipes/api-plugins.md` for the bridge contract.

---

## Non-negotiable rules (pulled forward, do not skip)

- **Self-contained sealed HTML.** One file. No libraries, no React, no frameworks, no build step. Only inline CSS, vanilla JS, inline SVG, inline JSON. The Google Fonts link is the one allowed external. Persist with the tile bridge (`Vitality.save` / `Vitality.load`) on every discrete action, never "save at the end".

- **The theme tokens.** Background is pure black `#000` (the tile renders transparent and lets the host paint black; do not double-paint). Mint accent is `#6EE7B7`. Emotive text (titles, big numbers, status words) is Instrument Serif italic; body and UI are Inter; eyebrows/labels/pills are JetBrains Mono, tiny uppercase, wide letter-spacing (eyebrows and section labels track at `0.2em`, in-component micro-labels at `0.12em` to `0.14em`). Greys are always white at an opacity, never a solid grey hex. Card radius is `18px`. Use the tokens, do not hand-pick stray hexes.

- **The signature ease + spring pop.** Signature ease is `cubic-bezier(0.16, 1, 0.3, 1)`, used on every meaningful state change. The overshoot "pop" for picks, tags, and landings is `cubic-bezier(0.34, 1.56, 0.64, 1)`. When unsure, the signature ease is the heartbeat. Never linear, never harsh, never strobing. Intro plays once; only glows and breathes loop, slowly.

- **The color law.** Mint and azure mean good (mint = the brand / on track / up; azure `#5E9BFF` = data readings, used sparingly). Amber `#F59E0B` (in tile-art only, `#d98e3c`) = gentle caution / short / down. NEVER red for state. Meaning must also live on the word plus a dot plus a glyph, never on color alone (colorblind-safe). Any miss is warm, never shame. (Iris `#a78bfa` is Vee's voice accent; mint stays the win. The logger reserves red for genuinely destructive actions only, like deleting real data.)

- **No em dashes.** Anywhere: copy, headings, code comments the user can see. Use a period, a comma, or "and".

- **No emojis.** Anywhere in UI. An emoji is a bug. Use a line-art glyph from `icons.md` instead.

- **Reduced motion is mandatory.** Every tile honors `prefers-reduced-motion: reduce`: kill animations and transitions, but leave content fully visible and finished (no hidden first-frame). Gate JS-driven motion behind the media query too.

---

## The bar in one line

A great tile is not a form. It is a small living instrument: one action gets one felt response, every number is real history, the domain is already known, and the finish is an event. Calm over busy. Few elements, slow loops, breathing glows.

---

## Why this beats a plain build

For the side-by-side on what the MCP adds over generic Claude Code (design DNA, data libraries, a zero-setup hosted home, vetted API recipes, and the report contract), see `../MCP-VALUE.md`.

## Still to capture

Alex will feed in more highlights over time. Expect this pack to grow with more worked tile examples, more data libraries, design kits (`/kit` directions), and demo surfaces (preview HTML). When a new highlight arrives, distill it into a new file in the right folder and add a row to the table above. Keep each file compact: tokens, recipes, samples, and a few annotated snippets, never raw file dumps.
