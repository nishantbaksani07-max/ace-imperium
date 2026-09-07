import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUploadEnvelope, CATEGORIES, categoryForKind, assertTileExportable, kindMustReport, reportKindFromHtml } from './uploadEnvelope.js';
import { validateReport } from './reportContract.js';
import { scaffoldTile } from '../scaffoldTile.js';
import type { TileMeta } from './infer.js';

const beerMeta: TileMeta = { key: 'beer', label: 'Beers', kind: 'intake', goalDirection: 'down', unit: 'beers', template: 'counter' };
// The envelope now lints its html at the boundary, so the shape tests carry a real,
// floor-passing sealed tile (the stream is still driven by beerMeta).
const GOOD = scaffoldTile({ goal: 'beer tracker' }).html;

test('envelope: defaults are auto-filled from the tile', () => {
  const e = buildUploadEnvelope({ html: GOOD, meta: beerMeta });
  assert.equal(e.v, 1);
  assert.equal(e.name, 'Beers'); // defaults to label
  assert.equal(e.category, 'health'); // intake -> health
  assert.equal(e.color, '#6EE7B7'); // mint default
  assert.equal(e.stream.key, 'beer');
  assert.equal(e.stream.kind, 'intake');
  assert.equal(e.stream.goalDirection, 'down');
  assert.ok(e.html.startsWith('<!doctype html>'));
});

test('envelope: the carried stream is contract-valid', () => {
  const e = buildUploadEnvelope({ html: GOOD, meta: beerMeta });
  const r = validateReport({ ...e.stream, value: 2, date: '2026-06-28' });
  assert.equal(r.ok, true, r.ok ? '' : r.error);
});

test('envelope: explicit display options win', () => {
  const e = buildUploadEnvelope(
    { html: GOOD, meta: beerMeta },
    { name: 'Friday Pints', category: 'mind', color: '#ffcc00', design: 'waves' },
  );
  assert.equal(e.name, 'Friday Pints');
  assert.equal(e.category, 'mind');
  assert.equal(e.color, '#ffcc00');
  assert.equal(e.design, 'waves');
});

test('envelope: an arbitrary (non-hex) color is rejected, falling back to mint', () => {
  const e = buildUploadEnvelope({ html: GOOD, meta: beerMeta }, { color: 'red;} body{display:none' });
  assert.equal(e.color, '#6EE7B7');
});

test('envelope: a floor-failing html is refused at the boundary', () => {
  // The seal is the floor; taste (em dashes, emoji) only warns since 2026-07-11.
  const bad = GOOD.replace('<script>', '<script src="https://cdn.example.com/x.js"></script><script>');
  assert.throws(() => buildUploadEnvelope({ html: bad, meta: beerMeta }), /hard floor|sealed-external-script/);
});

test('envelope: an em dash no longer blocks the boundary (taste is advice)', () => {
  const dashy = GOOD.replace('<body>', '<body><!-- note — dashy -->');
  assert.doesNotThrow(() => buildUploadEnvelope({ html: dashy, meta: beerMeta }));
});

test('envelope: category map covers every kind and lands in the fixed set', () => {
  for (const kind of ['intake', 'count', 'duration', 'rating', 'measure', 'money', 'done'] as const) {
    assert.ok((CATEGORIES as readonly string[]).includes(categoryForKind(kind)), `${kind} -> valid category`);
  }
  assert.equal(categoryForKind('money'), 'finance');
  assert.equal(categoryForKind('count'), 'fitness');
});

test('envelope: no createdAt (the Library stamps receipt time)', () => {
  const e = buildUploadEnvelope({ html: GOOD, meta: beerMeta });
  assert.equal('createdAt' in e, false);
});

// ── the report-is-default floor: a measurable tile must actually emit its stream ──

test('kindMustReport: every measurable kind (plus done) must report; nothing else', () => {
  for (const k of ['intake', 'count', 'duration', 'rating', 'measure', 'money', 'done'] as const) {
    assert.equal(kindMustReport(k), true, `${k} must report`);
  }
  assert.equal(kindMustReport(undefined), false, 'a note tile with no kind reports nothing');
});

test('envelope: a MEASURABLE tile that emits no Vitality.report() is refused (report is default)', () => {
  // Strip the template's report() call: a measurable tile that feeds Vee nothing.
  const noReport = GOOD.replace(/Vitality\.report\(\{[^}]*\}\);?/g, '');
  assert.equal(/Vitality\.report/.test(noReport), false, 'the report() call was actually removed');
  assert.throws(
    () => buildUploadEnvelope({ html: noReport, meta: beerMeta }),
    /report-missing/,
    'a measurable tile with no report must not export',
  );
});

test('assertTileExportable: kind-aware floor blocks a measurable tile with no report, allows a note tile', () => {
  const noReport = GOOD.replace(/Vitality\.report\(\{[^}]*\}\);?/g, '');
  // measurable kind provided -> refused
  assert.throws(() => assertTileExportable(noReport, 'beers', 'intake'), /report-missing/);
  // no kind (a note/mentor tile) -> the missing report is not held against it
  assert.doesNotThrow(() => assertTileExportable(noReport, 'note'));
});

test('assertTileExportable: a measurable tile that DOES report exports cleanly', () => {
  assert.doesNotThrow(() => assertTileExportable(GOOD, 'beers', 'intake'));
});

// ---- lintProven (the verified check_tile Proof skips ONLY the lint) ---------

test('assertTileExportable: lintProven skips the re-lint (the check just ran it)', () => {
  // A tile the lint would refuse: with a verified proof the lint is trusted-skipped.
  const lintBroken = '<div>not a real tile</div>';
  assert.throws(() => assertTileExportable(lintBroken, 'broken'), /hard floor/);
  assert.doesNotThrow(() => assertTileExportable(lintBroken, 'broken', undefined, { lintProven: true }));
});

test('assertTileExportable: the kind-aware report gate ALWAYS runs, proof or not', () => {
  // check_tile never knew the kind, so a proven measurable tile with no report
  // is still refused - the proof is a lint cache, never a bypass of the report gate.
  const noReport = GOOD.replace(/Vitality\.report\(\{[^}]*\}\);?/g, '');
  assert.throws(
    () => assertTileExportable(noReport, 'beers', 'intake', { lintProven: true }),
    /report-missing/,
  );
});

test('reportKindFromHtml: reads the declared kind literal', () => {
  const html = `<script>Vitality.report({ key: 'shots', label: 'Shots', value: 40, date: d, kind: 'count' })</script>`;
  assert.equal(reportKindFromHtml(html), 'count');
});

test('reportKindFromHtml: null when no report call exists', () => {
  assert.equal(reportKindFromHtml('<html><body>hi</body></html>'), null);
});

test('reportKindFromHtml: null for a kind outside the locked 7', () => {
  const html = `<script>Vitality.report({ key: 'x', value: 1, date: d, kind: 'banana' })</script>`;
  assert.equal(reportKindFromHtml(html), null);
});

test('reportKindFromHtml: reads the kind from a real scaffold tile', () => {
  assert.equal(reportKindFromHtml(GOOD), 'intake');
});

test('assertTileExportable: refuses a reporting tile with an unreadable kind (no-maybes floor)', () => {
  const sneaky = GOOD.replace(/(Vitality\.report\s*\([\s\S]{0,200}?)kind:\s*['"]intake['"]/, '$1kind: myKind');
  assert.throws(() => assertTileExportable(sneaky, 'sneaky', undefined, { lintProven: true }), /report-unclassified/);
});

test('assertTileExportable: a declared kind still satisfies the no-maybes floor', () => {
  // The caller vouches for the kind (the MCP add_tile path passes it explicitly),
  // so the unclassified refusal must not fire.
  assert.doesNotThrow(() => assertTileExportable(GOOD, 'beers', 'intake', { lintProven: true }));
});
