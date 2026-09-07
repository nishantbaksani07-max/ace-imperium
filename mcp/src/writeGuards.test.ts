import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addTile, requireWrite } from './mutations.js';
import { WRITE_SCOPE, WRITE_PAUSED_SCOPE, type VitalityDb } from './supabase.js';

// The two write-path safety valves added in the Fable fortify pass:
//   1. a size cap on hand-built tile HTML (before it can hit the row);
//   2. a per-user rate limit built on mcp_write_log, fail-OPEN so an unreadable
//      audit table never blocks a legitimate write.
// A fake VitalityDb serves a configurable mcp_write_log history and captures the
// tiles insert, so we can drive both guards without a live database.

interface Capture { table?: string; row?: Record<string, unknown>; }

function fakeDb(opts: { stamps?: string[]; selectError?: boolean; cap?: Capture }) {
  return {
    from(table: string) {
      if (table === 'mcp_write_log') {
        const result = opts.selectError
          ? { data: null, error: { message: 'boom' } }
          : { data: (opts.stamps ?? []).map((created_at) => ({ created_at })), error: null };
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.gte = () => chain;
        chain.order = () => chain;
        chain.limit = () => Promise.resolve(result);
        chain.insert = () => Promise.resolve({ data: null, error: null }); // recordWrite
        return chain;
      }
      // tiles (captured) + any other table (profiles/finance_prefs → select throws,
      // which resolveUnitSystem/resolveCurrency swallow to their defaults).
      return {
        insert(row: Record<string, unknown>) {
          if (table === 'tiles' && opts.cap) { opts.cap.table = table; opts.cap.row = row; }
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

function makeV(db: unknown): VitalityDb {
  return { db: db as never, userId: 'user-1', mode: 'user', scopes: ['mcp:read', WRITE_SCOPE] };
}

const isoAgo = (ms: number) => new Date(Date.now() - ms).toISOString();

// requireWrite tells the two read-only causes apart: the server-side kill-switch
// (the auth layer swaps mcp:write for the paused marker) must say "paused, try
// later" and never send the user into a disconnect/re-Allow loop that cannot fix
// it; a credential that truly never granted write keeps the reconnect steps.

test('requireWrite: kill-switch paused marker gets the honest paused message, not reconnect advice', () => {
  const v: VitalityDb = { db: null as never, userId: 'user-1', mode: 'user', scopes: ['mcp:read', WRITE_PAUSED_SCOPE] };
  assert.throws(() => requireWrite(v), /temporarily paused by the Vitality team/);
  assert.throws(() => requireWrite(v), (err: unknown) => !/disconnect|Allow it again/i.test((err as Error).message));
});

test('requireWrite: a genuinely read-only credential keeps the reconnect guidance', () => {
  const v: VitalityDb = { db: null as never, userId: 'user-1', mode: 'user', scopes: ['mcp:read'] };
  assert.throws(() => requireWrite(v), /disconnect the Vitality connector.*Allow it again/);
});

test('requireWrite: a write-granted credential passes', () => {
  const v: VitalityDb = { db: null as never, userId: 'user-1', mode: 'user', scopes: ['mcp:read', WRITE_SCOPE] };
  assert.doesNotThrow(() => requireWrite(v));
});

test('size cap: an oversized hand-built tile is refused before it can reach the row', async () => {
  const cap: Capture = {};
  const huge = '<!doctype html><html>' + 'x'.repeat(200_001) + '</html>';
  await assert.rejects(
    () => addTile(makeV(fakeDb({ stamps: [], cap })), { html: huge, name: 'huge' }),
    /too large/i,
  );
  assert.equal(cap.row, undefined, 'an oversized tile must never be inserted');
});

test('rate limit: crossing the per-hour ceiling refuses the write, nothing is inserted', async () => {
  const cap: Capture = {};
  const stamps = Array.from({ length: 200 }, () => isoAgo(30 * 60_000)); // 200 in the last hour
  await assert.rejects(
    () => addTile(makeV(fakeDb({ stamps, cap })), { goal: 'track my water' }),
    /last hour/i,
  );
  assert.equal(cap.row, undefined, 'a rate-limited write must not build or insert a tile');
});

test('rate limit: a burst in the last minute refuses the write', async () => {
  const cap: Capture = {};
  const stamps = Array.from({ length: 25 }, () => isoAgo(10_000)); // 25 in the last 10s, < hour cap
  await assert.rejects(
    () => addTile(makeV(fakeDb({ stamps, cap })), { goal: 'track my water' }),
    /a minute/i,
  );
  assert.equal(cap.row, undefined);
});

test('rate limit: fails OPEN — an unreadable audit table never blocks a real write', async () => {
  const cap: Capture = {};
  const out = await addTile(makeV(fakeDb({ selectError: true, cap })), { goal: 'track my water' });
  assert.equal(cap.table, 'tiles', 'the write still lands when the rate-limit query errors');
  assert.equal(out.id, 'tile-123');
});

test('rate limit: comfortably under the ceiling passes through', async () => {
  const cap: Capture = {};
  const stamps = Array.from({ length: 5 }, () => isoAgo(10_000));
  const out = await addTile(makeV(fakeDb({ stamps, cap })), { goal: 'track my water' });
  assert.equal(cap.table, 'tiles');
  assert.equal(out.id, 'tile-123');
});
