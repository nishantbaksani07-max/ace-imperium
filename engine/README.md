# Vitality Tile Engine

A forkable engine for building **Vitality-style dashboard tiles**. It's not the app and
it doesn't copy the app — it's the design DNA plus the real shipped tiles, packaged so
Claude Code builds new, on-brand tiles as **ambient context**. No commands, no keys, no
backend, no build step. Add it and build.

## What's in here

| Path | What it is |
|------|------------|
| `ENGINE.md` | The brain. The tile contract, the floor, the tokens, how to build one. **Start here.** |
| `dna/` | The full Vitality design DNA pack: theme, motion, voice, icons, components, the `gotchas` rulebook, per-feature recipes, and complete worked-example tiles. |
| `examples/` | The **real shipped tiles** (water, habit, mood, focus, one-line journal) as sealed HTML. Open one, steal its shell. |
| `lint.mjs` | The self-check. `node lint.mjs yourtile.html` — enforces the sealed-tile floor. |
| `manifest.json` | What's here and where it came from. |
| `CLAUDE.md` | Makes the engine ambient when Claude Code works in this folder. |

## Use it — two ways

**A. Fork / copy the folder.** Drop `engine/` into any project (or make it the repo).
Open it in Claude Code and say *"build me a habit-streak tile"* or *"make a tile that
tracks cold plunges, in the Vitality style."* Claude reads `ENGINE.md` + `dna/` +
`examples/` and builds a sealed HTML tile that looks native. Then `node engine/lint.mjs
mytile.html` to check it. To wire it as ambient context in a project that already has its
own `CLAUDE.md`, add one line to that file:

```
See engine/ENGINE.md for how to build Vitality-style tiles (design DNA + real tiles + self-check).
```

**B. The live connector (no fork).** The same engine is served by the Vitality MCP as
resources — connect it once and the context just loads, always the newest DNA:

- `vitality://engine` — the orientation brain
- `vitality://dna/{name}` — any DNA section (`theme`, `motion`, `voice`, `gotchas`, `feature-vitals`, …)
- `vitality://kit/{domain}` — a focused build bundle (`food`, `workout`, `vitals`, `finance`, `mentor`, `goals`, …)

Fork = offline and yours; connector = live and always current. They're the same engine.

## Keeping it fresh

This folder is generated from the Vitality repo's canonical sources (`mcp/dna/` and the
featured-tile catalog). Regenerate after either changes:

```
node scripts/build-engine.mjs
```

`ENGINE.md`, `README.md`, `CLAUDE.md`, and `lint.mjs` are hand-authored and never touched
by the sync; only `dna/`, `examples/`, and `manifest.json` are rewritten.
