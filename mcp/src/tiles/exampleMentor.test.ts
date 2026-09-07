import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintTile } from './lintTile.js';
import { readSection } from '../tileKit.js';

// The AI-mentor worked example is the ceiling for a keyed-AI tile. Like the markets
// example, it only earns that title if it clears the floor it preaches, AND it must
// render model output safely. Extract the tile from the recipe and prove both.

function extractTile(): string {
  const md = readSection('example-mentor-tile');
  assert.ok(md, 'example-mentor-tile recipe must be in the kit index');
  const blocks = [...md!.matchAll(/```html\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const full = blocks.filter((b) => /<!doctype\s+html/i.test(b));
  assert.equal(full.length, 1, `expected exactly one full HTML document, found ${full.length}`);
  return full[0];
}

test('mentor example: the recipe tile is Vitality-grade (0 errors, 0 warnings)', () => {
  const html = extractTile();
  const result = lintTile(html);
  if (!result.ok || result.warnings > 0) {
    console.log('\n' + result.findings.map((f) => `  [${f.severity}] ${f.rule}: ${f.message}`).join('\n') + '\n');
  }
  assert.equal(result.errors, 0, 'the gold-standard mentor tile must have zero floor errors');
  assert.equal(result.warnings, 0, 'the gold-standard mentor tile must have zero polish warnings');
});

test('mentor example: it is a real BYO-key Claude tile that renders output safely', () => {
  const html = extractTile();
  // browser-direct Claude call with the user's own key
  assert.match(html, /api\.anthropic\.com\/v1\/messages/, 'calls the Messages API');
  assert.match(html, /x-api-key/, 'sends the user key');
  assert.match(html, /anthropic-dangerous-direct-browser-access/, 'the browser-direct header');
  assert.doesNotMatch(html, /temperature|top_p|top_k/, 'must not send sampling params current models reject');
  // the safety move: model output is rendered via textContent, never innerHTML of a message
  assert.match(html, /\.textContent\s*=\s*contentText/, 'renders bubbles via textContent');
  // a settings gear holds the key, and the tile reports no stream (a mentor has none)
  assert.match(html, /id="key"[^>]*type="password"/, 'a key field in settings');
  assert.equal((html.match(/Vitality\.report\s*\(/g) || []).length, 0, 'a mentor reports no stream');
});
