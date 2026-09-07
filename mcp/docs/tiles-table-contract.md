# The `tiles` table contract (the build -> dashboard loop keystone)

Status: PROPOSED. This is the handshake between the two active windows:
- **MCP window** (this repo's `mcp/`): builds tiles and needs to WRITE a built tile to the user's registry.
- **Dashboard window** (`integrate-start-my-day`): owns `lib/tiles/tileStore.ts` (today localStorage v1) and the Library UI that READS the registry; also has the community `published_tiles` work pending a prod SQL.

The loop is blocked by ONE thing: the personal tile registry is browser-local (localStorage), so the MCP (which runs in Claude Code with a Supabase client) cannot put a built tile onto a dashboard. tileStore.ts already names the fix: "swap this one module to Supabase." This doc is that shared target so both windows build to the same shape and a single prod migration covers it.

This complements `docs/tile-upload-contract.md` (the upload ENVELOPE the MCP already produces) and `src/tiles/reportContract.ts` (the locked Vee report stream). The envelope is what gets written; this table is where it lands.

---

## The table (proposed schema)

Mirrors the dashboard's `Tile` type (`lib/tiles/types.ts`: `{id, name, html, createdAt, updatedAt}`) and carries the MCP envelope's identity (`stream`, `category`, `color`). Runtime data stays in a separate row so a growing `Vitality.save()` payload never rewrites the html, exactly as tileStore splits it today.

```sql
-- Personal tile registry: each user's built tiles, server-side. Replaces the
-- localStorage v1 in lib/tiles/tileStore.ts. RLS-scoped: a user only ever sees their own.
create table if not exists public.tiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  html        text not null,                 -- the sealed tile source (iframe srcDoc)
  stream      jsonb,                          -- {key,label,kind,goalDirection} or null (reports nothing)
  category    text,                           -- fitness|health|finance|mind|data
  color       text,                           -- hex accent (#RGB or #RRGGBB)
  source      text not null default 'mcp',    -- 'mcp' | 'paste' | 'hub'
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.tiles enable row level security;
create policy "tiles owner rw" on public.tiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists tiles_user_idx on public.tiles(user_id, updated_at desc);

-- Runtime data a tile persists via Vitality.save(), kept separate from the html.
create table if not exists public.tile_data (
  user_id    uuid not null references auth.users(id) on delete cascade,
  tile_id    uuid not null references public.tiles(id) on delete cascade,
  data       jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, tile_id)
);
alter table public.tile_data enable row level security;
create policy "tile_data owner rw" on public.tile_data
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

RLS via `auth.uid()` works for the MCP's user-session mode (the normal case) and the dashboard. For the MCP's service-role mode, the existing pattern stamps `user_id = v.userId` by hand (RLS is bypassed there), so writes still scope correctly.

**Security note for the dashboard reader.** `html` is the sealed tile and is floor-checked by the writer (so it is safe to mount as an iframe `srcdoc`). But `name` and `category` are stored as RAW user text (so the name shows verbatim). The dashboard MUST escape `name`/`category` on render and never `innerHTML`/`srcdoc`-interpolate them, the same way `color` is validated to a hex before it becomes a CSS accent. The MCP never renders these; the reader owns that escaping.

---

## Who builds what

1. **Dashboard window** (owns the table + the reader):
   - Apply the migration above to prod, ideally bundled with the pending `published_tiles` SQL in ONE pass (this repo has migration-timestamp drift, so one careful apply avoids twins).
   - Swap `lib/tiles/tileStore.ts` from localStorage to read/write `tiles` + `tile_data` (the module is already designed for this swap; the Library and create page read through it unchanged).
   - Keep the localStorage `importTile` paste path working as a fallback / for `source:'paste'`.

2. **MCP window** (this repo, owns the writer):
   - Add a gated write tool `vitality_add_tile` (name TBD) that takes a built tile (the `upload_tile` envelope: `html`, `name`, `stream`, `category`, `color`) and inserts a row into `tiles` for the calling user (gated on `mcp:write`, RLS-scoped, exactly like `vitality_log_meal`). Returns the new tile id.
   - `upload_tile` keeps returning the envelope for the manual paste path; `vitality_add_tile` is the automatic path that lands it straight on the dashboard.

3. **Alex** greenlights the one irreversible step: applying the `tiles` (+ `published_tiles`) tables to the live DB.

---

## The closed loop, end to end

`scaffold_tile` / `upload_tile` build a sealed, floor-clean tile -> `vitality_add_tile` inserts it into `tiles` -> the dashboard Library (reading `tiles`) shows it on the next load, on any device -> the user can then hit Publish to share it to the community shop (`published_tiles`, the dashboard's separate flow). Build in Claude Code, watch it appear on your dashboard. That is the platform.
