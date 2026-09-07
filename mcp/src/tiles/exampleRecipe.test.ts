import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintTile } from './lintTile.js';
import { readSection } from '../tileKit.js';

// The worked-example recipe is the kit's CEILING: a full, multi-section, BYO-key
// tile presented as the gold pattern. It only earns that title if it actually
// clears the floor it preaches. Extract the complete tile from the recipe and lint
// it. If a future edit drifts it below 0/0, this test fails loudly.

function extractTile(): string {
  const md = readSection('example-markets-tile');
  assert.ok(md, 'example-markets-tile recipe must be in the kit index');
  const blocks = [...md!.matchAll(/```html\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const full = blocks.filter((b) => /<!doctype\s+html/i.test(b));
  assert.equal(full.length, 1, `expected exactly one full HTML document in the recipe, found ${full.length}`);
  return full[0];
}

test('worked example: the recipe tile is Vitality-grade (0 errors, 0 warnings)', () => {
  const html = extractTile();
  const result = lintTile(html);
  // Surface every finding so a regression is readable, not just a count mismatch.
  if (!result.ok || result.warnings > 0) {
    console.log('\n' + result.findings.map((f) => `  [${f.severity}] ${f.rule}: ${f.message}`).join('\n') + '\n');
  }
  assert.equal(result.errors, 0, 'the gold-standard tile must have zero floor errors');
  assert.equal(result.warnings, 0, 'the gold-standard tile must have zero polish warnings');
});

test('worked example: it actually demonstrates the things it claims', () => {
  const html = extractTile();
  // bring-your-own-key capability
  assert.match(html, /api-key|x-api-key|token=|apiKey/i, 'should show a real keyed API call');
  assert.match(html, /fetch\s*\(/, 'should call out to a live API');
  // multi-section richness, not a bare counter
  assert.match(html, /class="hero"/, 'has a hero section');
  assert.match(html, /class="settings"/, 'has a settings drawer');
  assert.match(html, /class="add"/, 'has an add form');
  // reports exactly one stream, shaped right
  const reports = html.match(/Vitality\.report\s*\(/g) || [];
  assert.equal(reports.length, 1, 'reports exactly one stream');
  assert.match(html, /kind:\s*'money'/, 'reports a money stream');
});
