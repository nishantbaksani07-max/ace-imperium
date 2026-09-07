import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTiles } from './queries.js';
import type { VitalityDb } from './supabase.js';

// getTiles joins the user's tile registry against board_layout.ordering so the
// vitality_my_tiles tool can mark each tile ON BOARD vs IN LIBRARY (removed) —
// Claude must never treat a removed tile as active. A fake db proves the join
// logic + the honest "board unknown" fallback without a live database.

type TileRow = { id: string; name: string; category: string | null; stream: unknown; source: string; created_at: string };

function fakeDb(tiles: TileRow[], board: { ordering: unknown } | null, boardError = false) {
  return {
    from(table: string) {
      if (table === 'tiles') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => Promise.resolve({ data: tiles, error: null }),
        };
        return chain;
      }
      // board_layout
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () =>
          Promise.resolve(boardError ? { data: null, error: { message: 'no table' } } : { data: board, error: null }),
      };
      return chain;
    },
  };
}

function makeV(db: unknown): VitalityDb {
  return { db: db as never, userId: 'user-1', mode: 'user', scopes: ['mcp:read'] };
}

const TILES: TileRow[] = [
  { id: 't-board', name: 'Water', category: 'health', stream: { key: 'water', kind: 'intake', goalDirection: 'up' }, source: 'mcp', created_at: '2026-07-01T00:00:00Z' },
  { id: 't-removed', name: 'Old Habit', category: 'mind', stream: { key: 'journal', kind: 'done' }, source: 'user', created_at: '2026-06-01T00:00:00Z' },
  { id: 't-deco', name: 'Poster', category: 'data', stream: null, source: 'user', created_at: '2026-05-01T00:00:00Z' },
];

test('getTiles: marks placed tiles ON BOARD and unplaced ones off (removed)', async () => {
  const v = makeV(fakeDb(TILES, { ordering: ['t-board', 'core-train'] }));
  const { tiles, boardKnown } = await getTiles(v);
  assert.equal(boardKnown, true);
  const byId = new Map(tiles.map((t) => [t.id, t]));
  assert.equal(byId.get('t-board')!.onBoard, true);
  assert.equal(byId.get('t-removed')!.onBoard, false, 'a removed tile must read as NOT on the board');
  assert.equal(byId.get('t-deco')!.onBoard, false);
});

test('getTiles: carries the stream identity (key/kind) for measurable tiles', async () => {
  const v = makeV(fakeDb(TILES, { ordering: ['t-board'] }));
  const { tiles } = await getTiles(v);
  const byId = new Map(tiles.map((t) => [t.id, t]));
  assert.equal(byId.get('t-board')!.streamKey, 'water');
  assert.equal(byId.get('t-board')!.streamKind, 'intake');
  assert.equal(byId.get('t-deco')!.streamKey, null, 'a decorative tile has no stream');
});

test('getTiles: an unknown board (no row / bad shape / error) is honest, never a guess', async () => {
  for (const board of [null, { ordering: 'not-an-array' }]) {
    const v = makeV(fakeDb(TILES, board as never));
    const { tiles, boardKnown } = await getTiles(v);
    assert.equal(boardKnown, false);
    for (const t of tiles) assert.equal(t.onBoard, null, 'placement must be unknown, not asserted');
  }
  const errored = makeV(fakeDb(TILES, null, true));
  const res = await getTiles(errored);
  assert.equal(res.boardKnown, false);
});
