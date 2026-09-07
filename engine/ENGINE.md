# Vitality Tile Engine

You are building a **Vitality dashboard tile**. This folder is the whole engine: the
design DNA, the real shipped tiles, and a self-check. No app, no keys, no backend, no
build step. Everything a tile needs is here as ambient context — just ask for a tile
and build it to this standard.

> **The bar, in one line:** a tile is not a form. It is a small living instrument on
> black — one action gets one felt response, every number is real history, the domain
> is already known, and finishing feels like an event. Calm over busy.

---

## What a tile is (the contract)

A tile is **ONE self-contained, sealed HTML file**. It runs in a sandboxed iframe on
someone's dashboard. It cannot see the page, the account, or other tiles. It talks to
its host through exactly one bridge, injected at the top of the tile's `<script>`:

```js
var Vitality={_w:{},
  save:function(d){parent.postMessage({source:'vitality-tile',type:'save',data:d},'*')},
  load:function(){return new Promise(function(res){var id=Math.random().toString(36).slice(2);Vitality._w[id]=res;parent.postMessage({source:'vitality-tile',type:'load',id:id},'*')})},
  report:function(s){parent.postMessage({source:'vitality-tile',type:'report',stream:s},'*')}
};
window.addEventListener('message',function(e){var m=e.data;if(m&&m.source==='vitality-host'&&m.type==='load:result'&&Vitality._w[m.id]){Vitality._w[m.id](m.data);delete Vitality._w[m.id]}});
```

- `Vitality.save(data)` — persist the tile's state. Call it on **every discrete action**,
  never "save at the end". `data` is any JSON-able value.
- `Vitality.load()` — returns a Promise of the last saved `data` (or `null`/`undefined`
  on a fresh tile). Always sanitize what comes back; a tile must render before it resolves.
- `Vitality.report({ key, label, value, date, kind })` — OPTIONAL. If the tile has one
  meaningful number, end an action with a single `report()` so that number feeds the
  dashboard and the mentor. At most one `report()` per tile. `kind` ∈
  `intake | count | duration | rating | measure | money | done`. A tile that reports
  nothing is fine; nothing breaks.

When there is no host (opened as a plain file), `load()` simply never resolves — so
always paint a sensible default first, then hydrate.

---

## The floor (hard rules — a tile that trips one is not Vitality-grade)

Run `node lint.mjs yourtile.html` before you call a tile done. The floor:

1. **Sealed & self-contained.** One `<!doctype html>` file with inline `<style>` and
   `<script>`. No external `<script src>`, no `<link>` to CSS/assets, no `@import`, no
   `import`/`from` a URL, no framework (React/Vue/Angular), no injecting a `<script>` at
   runtime. The one allowed external load is a Google Fonts stylesheet link
   (Instrument Serif / Inter / JetBrains Mono). Fetching **data** with `fetch` is allowed
   (that's the bring-your-own-key capability — see `dna/../recipes` via the kit).
2. **60fps motion only.** `@keyframes` and `transition` animate **transform and opacity
   only** — never width/height/top/left/margin/padding/box-shadow/filter:blur/backdrop-filter
   (they relayout or repaint every frame). Width becomes `scaleX`, a move becomes
   `translate`, a glow becomes `opacity` on a pre-blurred layer.
3. **Local date keys.** Build `YYYY-MM-DD` from `getFullYear()/getMonth()/getDate()`,
   zero-padded. **Never** `toISOString().slice/split` — it's UTC and drifts a day.
4. **No emoji. No em/en dashes. No unicode check/cross glyphs.** Draw every glyph as
   inline SVG (see `dna/icons.md`). Punctuate with periods, commas, "and".
5. **Transparent body.** The host paints black; the tile's `body` is
   `background: transparent`. Don't double-paint.
6. **Mint accent + `::selection` + reduced motion.** Accent is mint `#6EE7B7`. Add a mint
   `::selection` rule. If the tile animates, add a `@media (prefers-reduced-motion: reduce)`
   block that kills animation/transition but leaves content fully visible.

`lint.mjs` reports **errors** (the floor above — must be zero) and **warnings** (quality
nudges). Aim for 0 errors; treat warnings as a to-fix list.

---

## The look (tokens)

Full detail in `dna/theme.md`. The essentials:

- **Background** pure black `#000` (via transparent body). **Mint** `#6EE7B7` = the brand /
  good / on track. **Azure** `#5E9BFF` = data readings, used sparingly. **Amber** `#F59E0B`
  (tile-art `#d98e3c`) = gentle caution / down. **Iris** `#a78bfa` = Vee's voice. Never red
  for state. Greys are always white at an opacity, never a solid grey hex.
- **Type.** Instrument Serif italic for emotive moments (titles, big numbers, status words);
  Inter for UI/body; JetBrains Mono tiny-uppercase wide-tracked for eyebrows and labels.
- **Motion.** Signature ease `cubic-bezier(0.16, 1, 0.3, 1)` on every meaningful change;
  overshoot pop `cubic-bezier(0.34, 1.56, 0.64, 1)` for picks and landings. Intro plays
  once; only glows and breathes loop, slowly. Card radius `18px`.
- **Voice.** Warm, never shames. Any miss is gentle. One phrase highlighted, not whole
  mint paragraphs. See `dna/voice.md`.

---

## How to build one (no commands — just ask)

1. **Read `dna/gotchas.md` first.** It's the MUST-READ "do X not Y (because Z)" rulebook —
   the bugs already fixed. Then skim `dna/theme.md` and `dna/motion.md` for the tokens.
2. **Open the closest real tile in `examples/`** and steal its shell. Match its density,
   its motion, its restraint. The five are: `water-daily` (intake ring), `habit-streak`
   (done + streak), `mood-check` (rating faces), `focus-timer` (duration ring),
   `one-line-journal` (count + list). They pass the floor at 0 errors.
3. **Pull the domain reference** for your tile's kind — see `dna/feature-*.md` (fuel,
   vitals, peak, goals-water, finance-brand, weight-supps, vee) and the worked examples
   `dna/example-workout-logger.md`. `dna/README.md` is the full index + build order.
4. **Build the sealed HTML.** Inline the bridge. Paint a default, then `Vitality.load()`
   and hydrate. `Vitality.save()` on every action. Add one `report()` if there's a number.
5. **Self-check:** `node lint.mjs yourtile.html` → fix every error. Then it's a real tile.

That's the engine. New tiles come out looking like Vitality because they're built from
Vitality's own DNA and its real tiles — but they're yours, not copies.

---

## Provenance

This folder is a **slice** of the Vitality app — the design DNA (`dna/`, from the app's
`mcp/dna/`) and the real shipped tiles (`examples/`, from the app's featured catalog). It
takes from Vitality and nothing else. Regenerate it from the canonical sources with
`node scripts/build-engine.mjs` (run inside the Vitality repo). `manifest.json` lists
exactly what's here and where it came from.

The **live connector** is the same engine as MCP resources (`vitality://engine`,
`vitality://dna/{name}`, `vitality://kit/{domain}`): connect the Vitality MCP and this
context loads with no folder to fork and always the newest DNA. This folder is the
offline, forkable form of that.
