# Handoff to the dashboard window: the LIBRARY tile + the tile catch-spot

> From the MCP window (`worktree-mcp-tile-builder`) to the dashboard window
> (`vee-tile-fuse`). The MCP half of the simple-tile loop is DONE + tested. This is
> the other half: the LIBRARY tile and the spot that catches an uploaded tile. Build
> it against the locked envelope so the two halves click together. 2026-06-28.

## The loop (where each step lives)

1. Open Claude Code through Vitality (the MCP connector) — exists.
2. Build a tile with the MCP — **DONE** (`scaffold_tile`, this window).
3. Export into the Library — MCP packages it (**done**: `upload_tile` -> `TileUploadEnvelope`); the **catch-spot is yours**.
4. Add it to the dashboard — your customizer + "Add a tile" already do this.

## What the MCP hands you

`upload_tile` returns a `TileUploadEnvelope` (v1). Full spec:
`mcp/docs/tile-upload-contract.md`. Shape:

```ts
interface TileUploadEnvelope {
  v: 1
  html: string                  // sealed, self-contained tile (renders in your existing iframe host)
  stream: { key: string; label: string; kind: ReportKind; goalDirection?: GoalDirection }
  name: string                  // Library display name
  category: 'fitness' | 'health' | 'finance' | 'mind' | 'data'
  color: string                 // hex accent, default #6EE7B7
  design?: string               // optional hint; resolve to your design catalog, else default by category
}
```

The MCP-side definition is `mcp/src/tiles/uploadEnvelope.ts`. Mirror that shape (or
import it once the packages merge). `ReportKind`/`GoalDirection` come from the
source-of-truth `lib/tiles/reportContract.ts` (you own it).

## 1. The LIBRARY tile (UI)

- A locked, pre-installed core tile on every dashboard (cannot be removed, like Vee is locked center).
- Opening it shows a **clean, professional file list** of the user's tiles: name, date added, category. User-friendly and visually appealing, not a wall of cards.
- Actions: re-add a removed core tile, add a user-built tile, remove, re-add.
- An **Upload** button (the entry point for a freshly built tile).

## 2. The catch-spot (how a built tile enters the Library)

Two phases, same envelope:

- **Phase A (now, zero new infra):** the Upload button accepts a **pasted envelope JSON** (the user copies what `upload_tile` printed). Parse -> validate -> store. This makes the loop run end to end with no server work.
- **Phase B (later):** a `POST /api/tiles/upload` route (auth = the user's session, RLS-scoped) that the MCP calls directly with the same envelope. Only the delivery changes.

On receipt (both phases):
- `validateReport(envelope.stream)` (reject if invalid; the stream identity is what wires the tile into Vee later).
- Stamp `createdAt = server now` (NOT in the envelope, so the displayed date is trustworthy).
- Store per-user (RLS).
- Resolve `design` hint -> your catalog, falling back to a category default.
- Persist `html`, `name`, `category`, `color`, `stream`.

## 3. Storage

Extend the existing per-user registry (`lib/tiles/tileStore`) or a `tiles` table with:
`id, name, category, color, design, createdAt, html, stream{key,label,kind,goalDirection}`.
Placing a Library tile on the grid reuses your sealed iframe host exactly as `/app/create` does today.

## 4. Reuse what already exists (you built it)

- The sealed iframe host + bridge (save/load/report) from BUILD71/73 render + run any
  tile HTML the MCP produces, identically to the `/app/create` preview.
- `validateReport` from `lib/tiles/reportContract.ts`.

## Note on AI tiles (not now)

Decided 2026-06-28: rich/AI tiles (e.g. photo -> calories) are deferred. For now it is
bring-your-own-key (cost on the user); the host-provided AI verb is post-launch. Nothing
to build here for that yet. See memory `project_ai_tiles_host_capability`.
