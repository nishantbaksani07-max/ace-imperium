import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeError } from './tools.js';

test('sanitizeError redacts a JWT-shaped token', () => {
  const out = sanitizeError('auth failed: eyJhbGciOi.JIUzI1NiIsInR5.cCI6IkpXVCJ9 rejected');
  assert.doesNotMatch(out, /eyJhbGci/);
  assert.match(out, /\[redacted-token\]/);
});

test('sanitizeError redacts a connection URL', () => {
  const out = sanitizeError('connect ECONNREFUSED postgres://user:pw@db.internal:5432/app');
  assert.doesNotMatch(out, /db\.internal/);
  assert.match(out, /\[redacted-url\]/);
});

test('sanitizeError leaves a friendly message intact', () => {
  const msg = 'This connection is read-only. Reconnect granting write access to log data.';
  assert.equal(sanitizeError(msg), msg);
});

test('sanitizeError does not strip a friendly https link or mangle "password:" prose', () => {
  const link = 'Add a card at https://vitality.app/billing to continue.';
  assert.equal(sanitizeError(link), link, 'a normal https page is not a secret');
  const prose = 'Your password: choose at least 8 characters.';
  assert.equal(sanitizeError(prose), prose, 'prose with a colon is not a credential assignment');
});

test('sanitizeError still redacts an explicit secret=value assignment', () => {
  const out = sanitizeError('failed with api_key=sk-live-abc123 in config');
  assert.match(out, /api_key=\[redacted\]/);
  assert.doesNotMatch(out, /sk-live-abc123/);
});

test('sanitizeError collapses whitespace and caps length', () => {
  const out = sanitizeError('x'.repeat(500));
  assert.ok(out.length <= 300, 'caps at 300 chars');
});
