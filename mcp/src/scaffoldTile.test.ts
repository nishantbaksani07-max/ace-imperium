import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaffoldTile } from './scaffoldTile.js';
import { validateReport, REPORT_KINDS, type ReportKind } from './tiles/reportContract.js';

// One representative goal per kind, so every template is generated and proven.
const byKind: Record<ReportKind, string> = {
  intake: 'beer tracker',
  count: 'track my cold plunges',
  duration: 'meditation minutes',
  rating: 'rate my mood out of 10',
  measure: 'log my weight',
  money: 'track my daily spend',
  done: 'did I read today',
};

for (const kind of REPORT_KINDS) {
  test(`scaffold: ${kind} tile emits a contract-valid stream`, () => {
    const { html, meta } = scaffoldTile({ goal: byKind[kind], kind });
    assert.equal(meta.kind, kind);
    // the embedded report payload, with a sample runtime value + a valid date, must validate
    const r = validateReport({
      key: meta.key,
      label: meta.label,
      value: 3,
      date: '2026-06-28',
      kind: meta.kind,
      ...(meta.goalDirection ? { goalDirection: meta.goalDirection } : {}),
    });
    assert.equal(r.ok, true, r.ok ? '' : r.error);
    // the HTML must actually wire that report with the right key + kind. key/label
    // are emitted as JSON.stringify'd (double-quoted, injection-safe) literals; kind
    // is a fixed-enum value still written single-quoted. Accept either quote on key.
    assert.match(html, new RegExp(`Vitality\\.report\\([^)]*key:["']${meta.key}["']`));
    assert.match(html, new RegExp(`kind:'${meta.kind}'`));
    // bridge present
    assert.match(html, /type:'save'/);
    assert.match(html, /type:'load'/);
    assert.match(html, /type:'report'/);
    assert.match(html, /load:result/);
    // a complete sealed document, themed, no emoji
    assert.ok(html.startsWith('<!doctype html>'));
    assert.match(html, /<\/html>$/);
    assert.match(html, /#6EE7B7/);
    assert.equal(/\p{Extended_Pictographic}/u.test(html), false, 'no emoji');
  });
}

test('scaffold: result carries a header naming the inferred fields', () => {
  const { header, text, html } = scaffoldTile({ goal: 'beer tracker' });
  assert.match(header, /kind: intake/);
  assert.match(header, /key: beer/);
  assert.ok(text.includes(html));
});

test('scaffold: overrides flow through to the tile', () => {
  const { html, meta } = scaffoldTile({ goal: 'beer tracker', kind: 'count', name: 'Brews', goalDirection: 'up' });
  assert.equal(meta.kind, 'count');
  assert.equal(meta.label, 'Brews');
  assert.match(html, /kind:'count'/);
  assert.match(html, /goalDirection:'up'/);
  assert.match(html, /Brews/);
});
