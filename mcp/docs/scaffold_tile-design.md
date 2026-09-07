# scaffold_tile design (Vitality MCP, brick 2)

> Brainstormed + locked with Alex 2026-06-28. North star: `docs/ideas/AIKIDO-VITALITY.md`
> (we build the game, users build the app). The Vitality MCP is the BUILDER pillar.
> `scaffold_tile` is its heart: one sentence in, one finished Vitality tile out.
> Superpowers: yes.

## What it is

A PURE, deterministic MCP tool. The user's own Claude Code calls it with a plain-English
goal; it returns one self-contained, themed, dashboard-ready sealed-HTML tile, pre-wired to
the Vitality bridge and carrying one optional `Vitality.report(...)` line. No per-tile LLM,
no API key, no DB access. The deep intelligence is the caller's Claude Code, which can further
edit the returned HTML. The tool guarantees the result is correct Vitality every time.

## Tool signature

- name: `scaffold_tile`
- registered in `mcp/src/tools.ts` like the others, but it does NOT use `getVdb` (pure).
- returns `{ content: [{ type: 'text', text }] }` where `text` = a short header + the HTML.

Input (zod):
- `goal: string` (required) — the plain-English description ("beer tracker", "track my cold plunges").
- `kind?: 'intake'|'count'|'duration'|'rating'|'measure'|'money'|'done'` — override the inferred kind.
- `name?: string` — override the tile title/label.
- `unit?: string` — optional unit for the copy ("min", "kg", "glasses"); improves wording only.
- `goalDirection?: 'up'|'down'|'neutral'` — override the inferred direction.

Output text shape:
```
Vitality tile ready: "Cold plunges"
  key: coldplunge | label: Cold plunges | kind: count | goalDirection: up | template: counter
Paste the HTML below into /app/create (Run tile), or upload it to your dashboard.
It is just HTML. Edit it freely.

<!doctype html> ... the tile ...
```

## Inference (deterministic, pure, overridable)

From `goal` (each step skipped if the matching param is supplied):

1. **kind** by keyword tables, checked in priority order, `count` as the final fallback:
   - money: `$, money, spend, spent, budget, cost, save(s/ings), dollars, paid, income, earn, revenue`
   - duration: `minute(s), min, hour(s), time, duration, meditat, read(ing), how long, session, screen time`
   - rating: `rate, rating, score, mood, energy, /10, /5, out of 10, out of 5, quality, satisfaction`
   - measure: `weight, kg, lb(s), pounds, cm, measure, body fat, blood pressure, distance, km, miles`
   - done: `did i, yes/no, habit, complete, stick to, took my, no-fap, abstain, quit, streak`
   - intake: `beer(s), alcohol, drink(s), water, glass(es), coffee, caffeine, calorie(s), cigarette(s), sugar, soda, supplement(s), pill(s)`
   - count: everything else (`track/count X`, reps, pages, sessions, tasks).
2. **key**: slugify the salient noun. Strip stopwords + tracker words (`track, tracker, log, counter, my, a, the, daily`), take the first 1-2 remaining words, lowercase. ("beer tracker" -> `beer`; "track my cold plunges" -> `coldplunge`). If `name` is given, derive the key from it. The tile emits this NATURAL key; Vitality normalizes server-side (beer -> alcohol).
3. **label**: `name` if given, else Title Case of the noun ("Beers", "Cold plunges").
4. **goalDirection** by keyword, else a per-kind default, else omitted:
   - down: `alcohol/beer, sugar, soda, cigarette, caffeine, spend/cost, screen time, cut, reduce, less, quit, no-fap`
   - up: `water, workout, rep, step, read, meditat, save/savings, protein, streak, more, increase`
   - neutral: weight, generic measure, mood/rating when unclear.
5. **unit** (copy only, not in the contract): from `unit` param, else inferred ("min" for duration, "$" for money, else the pluralized noun or "times").

## Templates (6 archetypes -> 7 kinds)

Each ~40-60 lines + the shared bridge boilerplate. Each is a function `(fields) => htmlString`
filling: KEY, LABEL, KIND, GOALDIR, UNIT, TITLE, and kind-specific bits.

1. **counter** -> `intake` + `count`. Big tabular number, +/- buttons, 7-day mini bar chart
   (the canonical beer tile). value = today's running count.
2. **timer** -> `duration`. Today's total minutes + quick +5/+10/+15 buttons and a clear.
   Deterministic (a stepper, not a live stopwatch, so reporting is clean). value = minutes today.
3. **scale** -> `rating`. A 1..N tap scale (default 1..5; 1..10 if the goal says /10). value = today's last rating.
4. **measure** -> `measure`. One numeric input + unit label, last value + a tiny sparkline. value = today's measurement.
5. **money** -> `money`. Numeric amount input, today's total. value = amount today.
6. **toggle** -> `done`. One big yes/no done button. value = 1 if done today else 0.

Every template:
- Theme: `body{background:transparent}`, color #fff, mint `#6EE7B7`, `accent-color:#6EE7B7`,
  Inter body + Instrument-Serif-italic title, rounded inputs/cards, spring `cubic-bezier(.16,1,.3,1)`,
  no external libs, no emojis.
- Bridge: `Vitality.save(history)` / `Vitality.load()` + the `load:result` listener.
- Stores its own history as `[{date, value}]` via save; hydrates via load on boot.
- On every commit: `Vitality.report({ key, label, value, date: today(), kind, goalDirection })`.
- `today()` returns a LOCAL `YYYY-MM-DD`.
- `<\/script>` escaped inside the generated string.

## Contract source of truth

The locked contract is `lib/tiles/reportContract.ts` on `origin/vee-tile-fuse` (owned by the
dashboard window). The mcp/ package cannot import across the package boundary, so we vendor a
VERBATIM mirror at `mcp/src/tiles/reportContract.ts` with a header: "MIRROR of
lib/tiles/reportContract.ts, source of truth there, do not edit, keep in sync." The generator
uses its `REPORT_KINDS`; the test uses its `validateReport`. We match the contract, we never
redefine it.

## Testing (TDD, no new deps)

`mcp/` has no test runner. Node v25 + tsx (already a devDep) -> add
`"test": "node --import tsx --test 'src/**/*.test.ts'"`. Zero new dependencies.

`mcp/src/scaffoldTile.test.ts` asserts, for each of the 7 kinds (and a batch of real prompts):
- the generated tile's report stream (`{...meta, value, date}` for a sample value + a valid date)
  passes the contract's `validateReport` -> proves every template emits a valid stream.
- the HTML contains a `Vitality.report(` call whose `key`/`kind` literals match meta.
- the bridge is present (`save`, `load`, `report`, the `load:result` listener).
- no unescaped `</script>`; no emoji; theme token `#6EE7B7` present.
- inference: a table of prompts -> expected kind/key/goalDirection (beer->intake/down,
  water->intake/up, "track my cold plunges"->count, "meditation minutes"->duration,
  "rate my mood"->rating, "log my weight"->measure, "daily spend"->money/down,
  "did I read today"->done), and that explicit `kind`/`name`/`goalDirection` overrides win.

## File layout (all under mcp/)

- `mcp/src/tiles/reportContract.ts` — vendored contract mirror.
- `mcp/src/tiles/templates.ts` — the 6 template functions + shared bridge boilerplate.
- `mcp/src/scaffoldTile.ts` — pure `scaffoldTile(input) -> { html, meta, header }` + inference helpers.
- `mcp/src/scaffoldTile.test.ts` — the tests.
- `mcp/src/tools.ts` — register `scaffold_tile` wiring the pure function.
- `mcp/package.json` — add the `test` script.

## Boundaries / not in scope

- Work ONLY in `mcp/`. The contract is LOCKED (mirror, never change). Do not touch
  `lib/tiles/*`, `app/app/*`, or the dashboard customizer (other window).
- Commit on `worktree-mcp-tile-builder`. Do NOT push to prod.

## Brick 3 (next): the upload tool (envelope defined here, endpoint owned by the dashboard window)

A second MCP tool (e.g. `upload_tile`) packages and POSTs, over the user's authenticated
connection, this envelope to a Vitality endpoint:
```
{ html, key, label, kind, goalDirection,
  name, category, design, color }   // category/design/color auto-picked, user can confirm
```
Auto-first: the tool pre-selects category (from the inferred kind), a design from the tile
design library, and a color, so the user confirms instead of filling a form. The RECEIVING
endpoint (app/api/*) + dashboard registry storage is built by the dashboard window. We define
this envelope now so the two halves do not guess at each other; we do not build the endpoint here.
