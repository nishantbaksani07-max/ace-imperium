import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRolloverDateKey, getNutritionDayKey, getSupplementDayKey, localDayStartISO, daysBetweenKeys } from './util.js';

// Pin the timezone so the rollover math is deterministic regardless of the host.
// (node:test runs each file in its own process, so this does not leak.)
process.env.VITALITY_TIMEZONE = 'UTC';

test('rollover: an entry before the cutoff hour counts as the previous day', () => {
  // 02:00 UTC with a 4am rollover -> shift back 4h -> 22:00 the day before.
  assert.equal(getRolloverDateKey(4, new Date('2026-06-15T02:00:00Z')), '2026-06-14');
  // 05:00 UTC with a 4am rollover -> 01:00 same day.
  assert.equal(getRolloverDateKey(4, new Date('2026-06-15T05:00:00Z')), '2026-06-15');
  // Exactly at the cutoff counts as the new day.
  assert.equal(getRolloverDateKey(4, new Date('2026-06-15T04:00:00Z')), '2026-06-15');
});

test('nutrition uses a 4am rollover, supplements a 6am rollover', () => {
  const at3 = new Date('2026-06-15T03:30:00Z');
  const at5 = new Date('2026-06-15T05:00:00Z');
  assert.equal(getNutritionDayKey(at3), '2026-06-14'); // before 4am
  assert.equal(getNutritionDayKey(at5), '2026-06-15'); // after 4am
  assert.equal(getSupplementDayKey(at5), '2026-06-14'); // before 6am
  assert.equal(getSupplementDayKey(new Date('2026-06-15T07:00:00Z')), '2026-06-15'); // after 6am
});

test('localDayStartISO returns the instant of LOCAL midnight, days back', () => {
  const today = new Date(localDayStartISO(0));
  assert.equal(today.getHours(), 0, 'local midnight, not UTC midnight');
  assert.equal(today.getMinutes(), 0);
  assert.ok(today.getTime() <= Date.now(), 'today-start is not in the future');
  // 7 days back is exactly 7 local days earlier.
  const key = (iso: string) => iso.slice(0, 10);
  assert.equal(daysBetweenKeys(key(localDayStartISO(7)), key(localDayStartISO(0))), 7);
});
