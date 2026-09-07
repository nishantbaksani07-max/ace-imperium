# Tile upload contract (the lego between the MCP and the dashboard Library)

> Locked shape both windows build to. The MCP (builder pillar) FILLS this envelope;
> the dashboard LIBRARY tile (dashboard pillar) RECEIVES it, stores it per-user, and
> lists/places it. Agreeing on this one shape is what lets the two halves click
> together with zero glue. Brainstormed with Alex 2026-06-28. Superpowers: yes.
>
> **Status (BUILD83): the socket is LIVE.** `upload_tile` now posts the built tile
> straight into the `tiles` registry by default (same write path as
> `vitality_add_tile`); the envelope below is returned only with `package_only:true`
> and remains the shape the Library's manual upload box consumes.

## The envelope: `TileUploadEnvelope` (v1)

```ts
interface TileUploadEnvelope {
  v: 1                       // contract version (bump only by joint decision)
  html: string               // the sealed, self-contained tile (output of scaffold_tile)
  stream: {                  // the report identity — matches lib/tiles/reportContract.ts
    key: string
    label: string
    kind: 'intake' | 'count' | 'duration' | 'rating' | 'measure' | 'money' | 'done'
    goalDirection?: 'up' | 'down' | 'neutral'
  }
  name: string               // display name in the Library (default = stream.label)
  category: 'fitness' | 'health' | 'finance' | 'mind' | 'data'
  color: string              // hex accent, default '#6EE7B7'
  design?: string            // OPTIONAL design hint; the Library maps it to its own
                             // design catalog, or picks a default for the category
}
```

## Who fills what

**MCP side (this window) — fills the envelope:**
- `html`, `stream`: produced by `scaffold_tile`.
- `name`, `category`, `color`: auto-filled (category from `stream.kind`, color = mint),
  user/caller can override.
- `design`: optional hint only. The MCP does NOT invent dashboard design IDs (it cannot
  see the dashboard's catalog); it passes a category and lets the Library resolve the look.

**Dashboard side (vee-tile-fuse window) — consumes the envelope:**
- Validates `stream` with `validateReport` (the source-of-truth contract).
- Stamps the upload time itself on receipt (server time) — `createdAt` is NOT in the
  envelope, so the displayed "date uploaded" is trustworthy.
- Stores per-user (RLS), resolves `design` (hint -> its catalog, else a category default),
  shows it in the Library file list (name, date, category), and lets the user place it on
  the dashboard, remove it, and re-add it.

## Category from kind (the MCP's default; user-overridable)

| kind | default category |
|------|------------------|
| money | finance |
| measure | health |
| intake | health |
| duration | mind |
| rating | mind |
| done | mind |
| count | fitness |

## Transport (later, brick 3)

For now the MCP's `upload_tile` tool RETURNS the filled envelope as JSON (the "ready to
upload" package). When the dashboard ships the receiving endpoint (e.g. `POST
/api/tiles/upload`, auth = the user's connected session, RLS-scoped), `upload_tile` flips
to POSTing this exact envelope. The shape does not change; only the delivery does. That is
the lego: build to the envelope now, snap the transport on later.
