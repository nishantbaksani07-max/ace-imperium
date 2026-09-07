import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReport, REPORT_KINDS, normalizeKey } from './reportContract.js';

test('mirror: a well-formed stream validates', () => {
  const r = validateReport({ key: 'beer', label: 'Beers', value: 2, date: '2026-06-28', kind: 'intake', goalDirection: 'down' });
  assert.equal(r.ok, true);
});

test('mirror: a bad kind is rejected', () => {
  const r = validateReport({ key: 'x', label: 'X', value: 1, date: '2026-06-28', kind: 'nope' });
  assert.equal(r.ok, false);
});

test('mirror: taxonomy + normalize intact', () => {
  assert.deepEqual([...REPORT_KINDS].sort(), ['count', 'done', 'duration', 'intake', 'measure', 'money', 'rating']);
  assert.equal(normalizeKey('Pints'), 'alcohol');
});
