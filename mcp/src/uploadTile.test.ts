import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUploadTile, assertTileExportable } from './uploadTile.js';
import { scaffoldTile } from './scaffoldTile.js';
import { registerTools } from './tools.js';

test('buildUploadTile: scaffolds + packages into an envelope', () => {
  const { envelope, text } = buildUploadTile({ goal: 'beer tracker' });
  assert.equal(envelope.v, 1);
  assert.equal(envelope.category, 'health');
  assert.equal(envelope.stream.kind, 'intake');
  assert.ok(envelope.html.startsWith('<!doctype html>'));
  assert.match(text, /"v": 1/);
  assert.ok(text.includes(envelope.html.slice(0, 40)));
});

test('buildUploadTile: display + scaffold overrides flow through', () => {
  const { envelope } = buildUploadTile({ goal: 'beer tracker', kind: 'count', category: 'fitness', color: '#123456' });
  assert.equal(envelope.stream.kind, 'count');
  assert.equal(envelope.category, 'fitness');
  assert.equal(envelope.color, '#123456');
});

// ── the locked door: a tile with a real lint error cannot be exported ──────────

// A sealed, valid tile that trips NO hard-floor errors but still earns polish
// warnings (no mint accent, no ::selection). Warnings must never block export.
const WARN_ONLY = `<!doctype html><html><head><style>body{background:transparent;color:#cccccc}</style></head><body><div>x</div><script>var a=1;</script></body></html>`;

test('assertTileExportable: warnings never block (a warn-only tile exports)', () => {
  // sanity: this tile really does only warn, never error.
  assert.doesNotThrow(() => assertTileExportable(WARN_ONLY, 'warny'));
});

test('assertTileExportable: a clean scaffolded tile exports', () => {
  const full = scaffoldTile({ goal: 'track my water' }).text;
  const html = full.slice(full.indexOf('<!doctype'));
  assert.doesNotThrow(() => assertTileExportable(html, 'water'));
});

test('assertTileExportable: an em dash no longer refuses export (taste is advice)', () => {
  const dashy = WARN_ONLY.replace('<div>x</div>', '<div>add — now</div>');
  assert.doesNotThrow(() => assertTileExportable(dashy, 'dashy'));
});

test('assertTileExportable: an external script (unsealed) refuses export', () => {
  const bad = WARN_ONLY.replace('<script>', '<script src="https://cdn.example.com/x.js"></script><script>');
  assert.throws(() => assertTileExportable(bad), /sealed-external-script/);
});

test('buildUploadTile: every scaffold goal clears the door (no false refusals)', () => {
  const goals = ['track my water', 'meditation minutes', 'rate my mood out of 10', 'log my weight', 'track my daily spend', 'did I read today'];
  for (const goal of goals) {
    assert.doesNotThrow(() => buildUploadTile({ goal }), `scaffold "${goal}" must package without refusal`);
  }
});

// upload_tile is a WRITE by default since brick 3 (posts via addTile through getVdb);
// {package_only:true} is the pure lane that must never touch getVdb.
function fakeServer() {
  const tools: Record<string, { handler: (args: unknown) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }> }> = {};
  const server = {
    registerTool(name: string, _def: unknown, handler: (args: unknown) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>) {
      tools[name] = { handler };
    },
  };
  return { server: server as never, tools };
}

test('upload_tile POSTS through the Library upload socket by default (the brick-3 write path)', async () => {
  const { server, tools } = fakeServer();
  // the same minimal awaitable/chainable fake the addTile tests use: only the
  // tiles insert matters; every auxiliary read (units, currency, rate, audit)
  // is best-effort in addTile and degrades cleanly on this stub.
  let inserted: Record<string, unknown> | undefined;
  const db = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          if (table === 'tiles') inserted = row;
          const p: Promise<{ data: { id: string }; error: null }> & {
            select?: (c: string) => { single: () => Promise<{ data: { id: string }; error: null }> };
          } = Promise.resolve({ data: { id: 'tile-9' }, error: null });
          p.select = () => ({ single: () => Promise.resolve({ data: { id: 'tile-9' }, error: null }) });
          return p;
        },
      };
    },
  };
  let vdbAsked = false;
  registerTools(server, async () => {
    vdbAsked = true;
    return { db: db as never, userId: 'user-1', mode: 'user', scopes: ['mcp:read', 'mcp:write'] } as never;
  });
  assert.ok(tools['upload_tile'], 'tool registered');
  const res = await tools['upload_tile'].handler({ goal: 'track my daily spend' });
  assert.equal(vdbAsked, true, 'upload_tile is a write now: it must resolve the authed client');
  assert.notEqual(res.isError, true);
  assert.match(res.content[0].text, /Posted "/);
  assert.ok(inserted, 'a tiles row is inserted');
  assert.equal(inserted!.user_id, 'user-1', 'owner is server-stamped');
  assert.equal(inserted!.source, 'mcp');
  assert.ok(String(inserted!.html).startsWith('<!doctype html>'), 'stores the built sealed HTML');
});

test('upload_tile with package_only returns the envelope and never touches getVdb (the pure lane)', async () => {
  const { server, tools } = fakeServer();
  registerTools(server, async () => {
    throw new Error('getVdb must not be called');
  });
  const res = await tools['upload_tile'].handler({ goal: 'track my daily spend', package_only: true });
  const text = res.content[0].text;
  assert.match(text, /"v": 1/);
  assert.match(text, /"category": "finance"/);
  assert.match(text, /<!doctype html>/);
  assert.notEqual(res.isError, true);
});

test('vitality_add_tile is registered as a WRITE tool (the automatic build->dashboard path)', async () => {
  const { server, tools } = fakeServer();
  let vdbAsked = false;
  registerTools(server, async () => {
    vdbAsked = true; // a write tool MUST resolve the caller's RLS-scoped client
    throw new Error('no db in test');
  });
  assert.ok(tools['vitality_add_tile'], 'vitality_add_tile is registered');
  // This proves only that the handler resolves the authed client (unlike the pure
  // builder tools, which never call getVdb) and that errors are sanitized. The actual
  // gated-write behaviour (requireWrite, owner stamping, the inserted row) is covered
  // directly in addTile.test.ts.
  const res = await tools['vitality_add_tile'].handler({ goal: 'track my water' });
  assert.equal(vdbAsked, true, 'add_tile must resolve the authed client (it is a write)');
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /Vitality error/);
});
