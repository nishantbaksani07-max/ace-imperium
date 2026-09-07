# CLAUDE.md

This is **Vitality**, an open-source multi-user life dashboard: Next.js 14 (App Router),
Supabase (Postgres + RLS + Auth), vanilla CSS, optional Stripe tiers, Claude-powered AI
features, and a hosted MCP server. Modules: vitals (wearable score), fitness, fuel
(nutrition), goals (Vee), peak (schedule), finance, brand (creator stats), and a
user-built tile system (Forge / Studio / Arts District).

## Hard rules

1. **No Tailwind. Vanilla CSS only.** Tokens live in `app/globals.css`. Match the
   aesthetic: pure black background, mint accents, Inter font.
2. **Multi-user from the ground up.** Every Supabase query is scoped to the current user
   via RLS. Never read/write another user's data. Needing to bypass RLS = stop and surface it.
3. **Server-side API keys only.** Anthropic, Fitbit, Oura, WHOOP, Stripe — never on the
   client. All third-party calls go through Next.js route handlers in `app/api/`.
4. **Tier gating is server-side.** Never trust a client tier check. Every paid feature
   checks `profiles.tier` via a server query before responding.
5. **Commit format:** `type(scope): description` — feat, fix, docs, refactor, chore, style.
6. **When in doubt, ask.** Don't make architecture calls in a vacuum. Surface tradeoffs.

## Layout

- `app/` — pages + API routes; the signed-in product lives under `app/app/`.
- `lib/` — domain logic (scoring, insights, nutrition, training, tiles, auth helpers).
- `components/` — shared React components.
- `engine/` + `mcp/` — the single-file HTML tile system: DNA docs, linter, MCP toolkit.
- `supabase/migrations/` — the whole schema, RLS policies included. New tables need RLS.
- `__tests__/` — Jest. Run `pnpm test` before pushing logic changes.

## Dev loop

```bash
pnpm dev        # http://localhost:3000
pnpm test       # jest
pnpm lint       # next lint
```

`.env.example` documents every variable; only Supabase is required to boot.
