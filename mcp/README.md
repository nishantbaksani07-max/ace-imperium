# Vitality MCP

A Model Context Protocol server that lets Claude (Claude Code in VSCode, or Claude
Desktop) read your Vitality data and reason over it — "should I train hard today?",
"when should I go to bed?", "which subscriptions should I review?" — plus a
**daily-briefing nudge engine** a scheduled agent can deliver each morning/evening,
plus a **tile builder** that turns a plain-English goal into a finished dashboard tile.

**Reads are the default.** There are also **7 write tools** (`vitality_add_note`,
`vitality_log_weight`, `vitality_log_meal`, `vitality_log_water`,
`vitality_log_workout`, `vitality_mark_supplement_taken`,
`vitality_log_business_metric`), each **gated behind the `mcp:write` scope**, so a read-only
connection (an unattended cron, say) can see your data but cannot change it. Every
query, read or write, runs under your own row-level security.

```
Claude (VSCode / Desktop)  ──stdio──▶  vitality-mcp  ──RLS──▶  Supabase (your data)
                                            │
                                            ├─ nudge engine → daily briefing
                                            └─ tile builder → sealed-HTML tiles
```

## What it can see (and what it can't)

Server-readable today (lives in Supabase):

| Tool | Data |
|------|------|
| `vitality_whoami` | profile, goal, focus areas, plan tier |
| `vitality_daily_briefing` | **the headline** — prioritized nudges across all domains |
| `vitality_start_my_day` | the shaped morning greeting (one insight + optional one-tap offer) |
| `vitality_sleep_status` | Whoop/Oura/Fitbit sleep + recovery → recommended bedtime |
| `vitality_training_readiness` | recovery tier (Peak/Solid/Tired/Low/Drained) + weekly volume |
| `vitality_nutrition_today` | calories + protein vs target (Fuel) |
| `vitality_weight_trend` | weigh-ins + trend |
| `vitality_hydration` | water servings vs target, recent average, caffeine |
| `vitality_supplements` | stack + how many taken today, running-low flags |
| `vitality_goals` | big goals + Duolingo-style streak + this-week habit goals |
| `vitality_subscriptions` | recurring cost, trials ending, price hikes, renewals |
| `vitality_finance_overview` | net worth, accounts, upcoming orders |
| `vitality_recent_workouts` | logged sessions |
| `vitality_brand` / `vitality_business_overview` | creator/brand audience + KPIs |
| `vitality_notes` | mentor notes / reminders |
| `vitality_user_facts` | the durable mentor-memory layer |
| `vitality_peak_today` / `vitality_peak_stimulants` | today's Peak schedule + stimulants/energy |
| `vitality_weekly_recap` | retrospective week-in-review across all domains |

**Write tools** (all gated behind the `mcp:write` scope — a read-only connection
gets a clear "reconnect granting write" error, never a silent no-op, and RLS still
confines every write to your own rows): `vitality_add_note`, `vitality_log_weight`,
`vitality_log_meal`, `vitality_log_water`, `vitality_log_workout`,
`vitality_mark_supplement_taken`, `vitality_log_business_metric`.

**Builder tools** (pure, no DB, no keys): `scaffold_tile` (plain-English goal → one
sealed tile), `check_tile` (lint a tile against the hard floor), `vitality_tile_kit`
(serve the design-DNA reference pack), `upload_tile` (package a tile for the Library).
See the tile-builder section below.

> **"Cancel a sub I don't use":** Vitality stores no *usage* signal, so the MCP
> can't auto-detect an unused subscription. It surfaces the actionable proxies
> instead — trials ending, price hikes, renewals, and your priciest subs to
> review — and is explicit that you make the keep/cancel call.

## Build a tile: `scaffold_tile`

The MCP isn't only read tools. `scaffold_tile` is the **builder**: give it a
plain-English goal and it returns one finished, on-brand Vitality tile, sealed
self-contained HTML, themed, pre-wired to the tile bridge (`save`/`load`) plus one
optional `report()` line, so it drops onto your dashboard with **zero setup** (no
Supabase, no Vercel, no keys). It is **deterministic**: no per-tile LLM, no API
key. The intelligence is the caller's own Claude Code; this tool guarantees the
output is correct Vitality every time, and the caller can edit the HTML further.

- **Input:** `goal` (required), plus optional overrides `kind`
  (`intake|count|duration|rating|measure|money|done`), `name`, `unit`,
  `goalDirection` (`up|down|neutral`). Everything else is inferred from `goal`.
- **Output:** a short header naming the inferred fields, then the HTML. Paste it
  into `/app/create` (Run tile) or upload it to your dashboard.
- **Templates:** six themed looks cover the seven kinds — counter (intake/count),
  timer (duration), scale (rating), measure, money, and a done toggle.

Every generated tile is proven valid against the locked report contract by
`src/scaffoldTile.test.ts` (`npm test`).

> The tile-to-Vee report contract is owned by the dashboard repo
> (`lib/tiles/reportContract.ts`); `src/tiles/reportContract.ts` is a verbatim
> mirror. On merge into the dashboard repo, add a `SKILL.md` entry for this tool
> (root `SKILL.md` is outside this package's boundary).

## Setup

```bash
cd mcp
npm install
cp .env.example .env      # then fill it in (see below)
npm run build             # compile to dist/
npm run briefing          # smoke test: prints today's briefing
```

### Auth (`.env`)

Two modes — the server picks **user** mode unless you explicitly set the
service-role pair.

- **User mode (recommended, RLS-respecting).** `VITALITY_USER_EMAIL` +
  `VITALITY_USER_PASSWORD`. The server signs in as you with the public anon key;
  every query runs under your own row-level security, exactly like the website.
  Structurally it can only ever see your data.
- **Service-role mode (opt-in, local only).**
  `VITALITY_SUPABASE_SERVICE_ROLE_KEY` + `VITALITY_USER_ID`. This key **bypasses
  RLS** — we scope every query to your user id by hand, but the key could read
  anyone, so it must never reach a client or shared host. (CLAUDE.md hard rule
  #3 — flagged for Alex.) Leave blank unless you have a reason.

## Connect to Claude

Build first (`npm run build`), then add the server from `.mcp.json.example` to
your Claude Code `.mcp.json` (project root) or Claude Desktop config. Restart the
client; the `vitality_*` tools appear. Ask: *"Run my Vitality daily briefing."*

For the morning/evening scheduled report, see [`agents/daily-briefing.md`](agents/daily-briefing.md).

## Dev

```bash
npm run dev         # run from source via tsx (no build)
npm run typecheck   # tsc --noEmit
npm test            # node's built-in test runner (via tsx)
npm run briefing -- --json   # machine-readable briefing
```

## Layout

```
src/
  env.ts        env loading + auth-mode resolution (tiny built-in .env parser)
  supabase.ts   authenticated client (user session | service role), cached
  util.ts       local date keys, decimal-hour formatting, coercions
  queries.ts    read layer — one function per domain, mirrors lib/coach/collectors
  mutations.ts  write layer — the gated log_* / add_note operations
  insights.ts   pure analytics (weight rate, trends, load, recovery correlation)
  nudges.ts     the nudge engine + briefing renderer
  startMyDay.ts the shaped morning greeting
  tools.ts      every MCP tool, registered once (transport-agnostic)
  scaffoldTile.ts  the builder — one plain-English goal → one finished tile (pure)
  checkTile.ts  the check_tile receipt (PASS/FAIL against the floor)
  uploadTile.ts package a tile into the Library upload envelope
  tileKit.ts    serve the design-DNA reference pack (dna/data/recipes/lessons)
  tiles/        builder internals: infer, templates, lintTile (the floor),
                reportContract (locked mirror), uploadEnvelope, evalTiles
  index.ts      MCP server — wires tools.ts to stdio (single-user session)
  cli.ts        one-shot briefing printer (for cron / testing)
dna/ data/ recipes/ lessons/   the reference pack vitality_tile_kit serves
agents/
  daily-briefing.md   prompt + wiring for the scheduled report agent
```
