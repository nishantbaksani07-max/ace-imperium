import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addTile } from './mutations.js';
import { scaffoldTile } from './scaffoldTile.js';
import { WRITE_SCOPE, type VitalityDb } from './supabase.js';

// Real coverage for the gated write path (the registration test only proves the
// handler reaches for the authed client). A fake VitalityDb lets us exercise
// requireWrite, the build/floor enforcement, and the exact row that gets inserted,
// without a live database.

interface Capture { table?: string; row?: Record<string, unknown>; }

function fakeDb(cap: Capture) {
  return {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          if (table === 'tiles') { cap.table = table; cap.row = row; }
          // Awaitable (for recordWrite's bare insert) AND chainable (.select().single()).
          const p: Promise<{ data: { id: string }; error: null }> & {
            select?: (c: string) => { single: () => Promise<{ data: { id: string }; error: null }> };
          } = Promise.resolve({ data: { id: 'tile-123' }, error: null });
          p.select = () => ({ single: () => Promise.resolve({ data: { id: 'tile-123' }, error: null }) });
          return p;
        },
      };
    },
  };
}

function makeV(scopes: string[], cap: Capture): VitalityDb {
  return { db: fakeDb(cap) as never, userId: 'user-1', mode: 'user', scopes };
}

test('addTile: a read-only connection is rejected BEFORE any build or DB write', async () => {
  const cap: Capture = {};
  await assert.rejects(
    () => addTile(makeV(['mcp:read'], cap), { goal: 'track my water' }),
    /read-only|grant write/i,
  );
  assert.equal(cap.row, undefined, 'no insert may be attempted on a read-only connection');
});

test('addTile: a write connection inserts a floor-clean tile owned by the caller', async () => {
  const cap: Capture = {};
  const out = await addTile(makeV(['mcp:read', WRITE_SCOPE], cap), { goal: 'track my water' });

  assert.equal(cap.table, 'tiles');
  const row = cap.row!;
  // owner is server-stamped, never caller-supplied; source is hardcoded
  assert.equal(row.user_id, 'user-1', 'the row is owned by v.userId, not anything the caller passed');
  assert.equal(row.source, 'mcp');
  // the stored tile is the sealed, floor-clean build output
  assert.ok(String(row.html).startsWith('<!doctype html>'), 'stores the built sealed HTML');
  assert.ok(typeof row.name === 'string' && (row.name as string).length > 0);
  assert.ok(['fitness', 'health', 'finance', 'mind', 'data'].includes(row.category as string));
  // the return shape
  assert.equal(out.id, 'tile-123');
  assert.equal(out.name, row.name);
});

test('addTile: a caller cannot smuggle a different owner (no id/user_id input)', async () => {
  const cap: Capture = {};
  // even if a rogue field is passed, it is not in the schema and never reaches the row
  await addTile(makeV(['mcp:read', WRITE_SCOPE], cap), { goal: 'track my water', userId: 'victim' } as never);
  assert.equal(cap.row!.user_id, 'user-1', 'owner stays the authenticated user');
});

test('addTile: a pre-built (rich) html tile is stored as-is, floor-checked, owner-stamped', async () => {
  const cap: Capture = {};
  const richHtml = scaffoldTile({ goal: 'track my water' }).html; // a real sealed, floor-clean tile
  const out = await addTile(makeV(['mcp:read', WRITE_SCOPE], cap), {
    html: richHtml,
    name: 'My rich tile',
    category: 'mind',
    color: '#a78bfa',
  });
  assert.equal(cap.row!.html, richHtml, 'stores the provided html verbatim');
  assert.equal(cap.row!.name, 'My rich tile');
  assert.equal(cap.row!.category, 'mind');
  assert.equal(cap.row!.color, '#a78bfa');
  assert.equal(cap.row!.user_id, 'user-1');
  assert.equal(cap.row!.source, 'mcp');
  assert.equal(out.name, 'My rich tile');
});

test('addTile: a measurable html tile that lacks Vitality.report() is refused loud, never landed dark', async () => {
  const cap: Capture = {};
  // A sealed tile that persists via save/load but emits no report(): the exact
  // "measurable tile that would feed Vee nothing" the floor guard exists to catch.
  const dark = scaffoldTile({ goal: 'track my pushups' }).html.replace(/Vitality\.report\(/g, 'VitalityReportDisabled(');
  await assert.rejects(
    () => addTile(makeV(['mcp:read', WRITE_SCOPE], cap), { html: dark, name: 'Pushups', kind: 'count' }),
    /report-missing/,
    'the tool-path `kind` must reach the report-missing floor guard',
  );
  assert.equal(cap.row, undefined, 'a dark measurable tile must not reach the database');
});

test('addTile: a measurable html tile lands with a LIVE stream read from its own report() call', async () => {
  const cap: Capture = {};
  const richHtml = scaffoldTile({ goal: 'track my pushups' }).html; // reports {key:"pushup",label:"Pushups",kind:'count'}
  await addTile(makeV(['mcp:read', WRITE_SCOPE], cap), {
    html: richHtml,
    name: 'Pushups',
    kind: 'count',
    goalDirection: 'up',
  });
  const stream = cap.row!.stream as { key: string; label: string; kind: string; goalDirection?: string } | null;
  assert.ok(stream, 'a measurable hand-built tile must carry its stream registration, never null');
  assert.equal(stream!.key, 'pushup', 'key matches what the tile actually reports at runtime');
  assert.equal(stream!.label, 'Pushups');
  assert.equal(stream!.kind, 'count');
  assert.equal(stream!.goalDirection, 'up', 'the tool goalDirection arg is stamped when the html declares none');
});

test('addTile: an html tile with no declared kind (note-style) still lands with stream null', async () => {
  const cap: Capture = {};
  const richHtml = scaffoldTile({ goal: 'track my pushups' }).html;
  await addTile(makeV(['mcp:read', WRITE_SCOPE], cap), { html: richHtml, name: 'Notes-ish' });
  assert.equal(cap.row!.stream, null, 'no declared kind means no invented stream identity');
});

test('addTile: a floor-failing html is refused and never inserted', async () => {
  const cap: Capture = {};
  const dirty = scaffoldTile({ goal: 'track my water' }).html.replace('<script>', '<script src="https://cdn.example.com/x.js"></script><script>'); // unsealed = hard error (taste only warns)
  await assert.rejects(
    () => addTile(makeV(['mcp:read', WRITE_SCOPE], cap), { html: dirty, name: 'bad' }),
    /hard floor|sealed-external-script/,
  );
  assert.equal(cap.row, undefined, 'a floor-failing tile must not reach the database');
});

test('addTile: neither goal nor html is a clear error', async () => {
  const cap: Capture = {};
  await assert.rejects(
    () => addTile(makeV(['mcp:read', WRITE_SCOPE], cap), {}),
    /provide either.*goal.*html/i,
  );
});
