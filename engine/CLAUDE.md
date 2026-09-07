# Building in the Vitality Tile Engine

This folder is the Vitality Tile Engine. When asked to build, add, or design a tile,
**read [ENGINE.md](ENGINE.md) first** — it holds the sealed-tile contract, the hard floor,
the design tokens, and the build steps. Then:

- Steal the shell of the closest real tile in [examples/](examples/).
- Pull the domain reference from [dna/](dna/) (`dna/README.md` is the index + build order;
  `dna/gotchas.md` is the MUST-READ rulebook).
- Self-check every tile: `node lint.mjs yourtile.html` — zero errors is the floor.

A tile is ONE sealed, self-contained HTML file (no libraries, no build step) that talks to
its host only through `Vitality.save` / `Vitality.load` / `Vitality.report`. Build to the
Vitality standard: on black, mint accent, soft springy motion, real history behind a tap,
a warm voice, 60fps (animate transform/opacity only). Make new tiles that look like the
app — but are the user's own, never copies.
