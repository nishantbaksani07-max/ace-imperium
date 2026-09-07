# Contributing to Vitality

Thanks for wanting to make Vitality better. The bar for merging is simple:
does it make the dashboard calmer, faster, or more honest about your data?

## Branching

- Never push directly to `main` — feature branch + PR.
- Branch naming: `<your-handle>/<short-description>`, e.g. `sam/finance-currency-fix`.

```bash
git checkout main && git pull
git checkout -b <your-handle>/<short-description>
```

## While you work

- **Vanilla CSS only.** No Tailwind, no CSS-in-JS. Tokens live in `app/globals.css`;
  modules use per-component `*.module.css`.
- **Multi-user always.** Every Supabase query is scoped to the signed-in user via RLS.
  If something seems to need to bypass RLS, stop and open an issue instead.
- **Server-side keys only.** Third-party calls (Anthropic, Stripe, wearables) go through
  route handlers in `app/api/` — never from the client.
- Add or update tests for logic changes: `pnpm test`.

## Commits

Conventional-ish format: `type(scope): description` — `feat`, `fix`, `docs`,
`refactor`, `chore`, `style`, `test`.

Examples: `feat(finance): currency formatting for EUR accounts`,
`fix(splitlog): stats row meaningful at any session count`.

## PRs

- Keep them focused — one concern per PR.
- Include before/after screenshots for anything visual.
- `pnpm lint && pnpm test` must pass.
