import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listSections, readSection, buildKit, BASE, DOMAIN } from './tileKit.js';
import { registerTools } from './tools.js';

test('listSections finds the pack across dna/data/recipes/lessons + MCP-VALUE', () => {
  const names = listSections().map((s) => s.name);
  for (const n of ['gotchas', 'theme', 'voice', 'motion', 'food-library', 'exercise-library', 'supplement-library', 'feature-vee', 'feature-vitals', 'api-plugins', 'MCP-VALUE']) {
    assert.ok(names.includes(n), `missing ${n}`);
  }
});

test('readSection returns content for a known file, null otherwise, and blocks traversal', () => {
  const g = readSection('gotchas');
  assert.ok(g && g.length > 100);
  assert.equal(readSection('does-not-exist'), null);
  assert.equal(readSection('../../../etc/passwd'), null);
});

test('buildKit default gives orientation: value + rules + a section manifest', () => {
  const k = buildKit({});
  assert.match(k, /non-negotiable|gotcha/i);
  assert.match(k, /food-library/); // manifest lists sections
  assert.match(k, /domain:/); // tells the caller how to go deeper
});

test('buildKit section returns that single file', () => {
  assert.match(buildKit({ section: 'theme' }), /#6EE7B7/);
});

test('buildKit domain bundles the base look + domain files', () => {
  const k = buildKit({ domain: 'food' });
  assert.match(k, /#6EE7B7/); // theme is in the base
  assert.match(k, /food/i); // food-library extra
  assert.ok((k.match(/^## /gm) || []).length >= 3, 'should concatenate several sections');
});

test('kit integrity: every BASE and DOMAIN section resolves to a real file (no silent skips)', () => {
  // concat() quietly drops a name that does not exist on disk, so a renamed or deleted
  // reference would hand a builder a weaker pack with no error. Guard it here.
  const known = new Set(listSections().map((s) => s.name));
  for (const name of BASE) {
    assert.ok(known.has(name) && readSection(name), `BASE references a missing section: ${name}`);
  }
  for (const [domain, names] of Object.entries(DOMAIN)) {
    for (const name of names) {
      assert.ok(known.has(name) && readSection(name), `DOMAIN "${domain}" references a missing section: ${name}`);
    }
  }
});

test('kit integrity: every domain bundle adds real content beyond the base', () => {
  const baseLen = buildKit({ domain: '__none__' }).length; // unknown domain -> BASE only
  for (const domain of Object.keys(DOMAIN)) {
    assert.ok(buildKit({ domain }).length > baseLen, `domain "${domain}" must add content beyond BASE`);
  }
});

test('vitality_tile_kit tool is registered and returns the kit (pure, no getVdb)', async () => {
  const tools: Record<string, { handler: (a: unknown) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }> }> = {};
  const server = {
    registerTool(name: string, _d: unknown, handler: (a: unknown) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>) {
      tools[name] = { handler };
    },
  };
  registerTools(server as never, async () => {
    throw new Error('getVdb must not be called');
  });
  assert.ok(tools['vitality_tile_kit'], 'tool registered');
  const res = await tools['vitality_tile_kit'].handler({ domain: 'food' });
  assert.match(res.content[0].text, /#6EE7B7/);
  assert.notEqual(res.isError, true);
});
