// The NEW template variant the upgrade added: the HOURS-mode timer. Before the upgrade,
// "hours of sleep" landed in the minutes timer (hero "minutes today", +5/+10/+15 chips) so
// logging 8h meant ~48 taps and read "480 min". The upgrade gives the timer an hours mode
// (unit 'h'): a decimal entry (a 0.5-step input), an "hours today" hero, and an hours stat.
//
// It is not a new KIND (still the `duration` -> timer template), so it must clear every
// gate the other five templates do: lint 0 errors / 0 warnings, the richness gate as
// Fuel-grade rich, exactly one valid report — and behave correctly at runtime (the piece
// lint cannot see). This file locks the variant so a regression to the minutes-only timer
// turns red.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaffoldTile } from '../scaffoldTile.js';
import { lintTile } from './lintTile.js';
import { richnessOf } from './richness.js';
import { validateReport } from './reportContract.js';
import { mountReady, addDays } from './behaviorHarness.js';

const SLEEP = scaffoldTile({ goal: 'hours of sleep' });

test('sleep-hours variant: it infers an hours-mode duration timer', () => {
  assert.equal(SLEEP.meta.kind, 'duration', 'sleep is a duration');
  assert.equal(SLEEP.meta.template, 'timer', 'a duration renders the timer template');
  assert.equal(SLEEP.meta.unit, 'h', 'the unit is hours, not minutes');
});

test('sleep-hours variant: it is Vitality-grade (0 errors, 0 warnings)', () => {
  const r = lintTile(SLEEP.html);
  if (!r.ok || r.warnings > 0) {
    console.log('\n' + r.findings.map((f) => `  [${f.severity}] ${f.rule}: ${f.message}`).join('\n') + '\n');
  }
  assert.equal(r.errors, 0, 'the hours-mode timer must have zero floor errors');
  assert.equal(r.warnings, 0, 'the hours-mode timer must have zero polish warnings');
});

test('sleep-hours variant: it clears the richness gate as Fuel-grade rich', () => {
  const r = richnessOf(SLEEP.html);
  if (!r.ok) console.log('\n  missing richness marks: ' + r.missing.join(', ') + '\n');
  assert.equal(r.ok, true, 'the hours-mode timer must be Fuel-grade rich');
  assert.equal(r.score, r.max, 'every richness mark must be present');
});

test('sleep-hours variant: it renders the HOURS mode, not the minutes stepper', () => {
  assert.match(SLEEP.html, /hours today/, 'the hero/action reads in hours');
  assert.equal(/data-a="5"/.test(SLEEP.html), false, 'the +5/+10/+15 minute chips are NOT present in hours mode');
  assert.match(SLEEP.html, /id="in"/, 'hours mode uses a decimal reading input');
  // and the minutes mode is still reachable (a regression guard on the sibling mode)
  const nap = scaffoldTile({ goal: 'nap minutes' });
  assert.equal(nap.meta.unit, 'min', 'an explicit "minutes" goal stays in minutes mode');
  assert.match(nap.html, /data-a="5"/, 'minutes mode keeps its +5 chip');
});

test('sleep-hours variant: it reports exactly one valid duration stream', () => {
  const reports = SLEEP.html.match(/Vitality\.report\s*\(/g) || [];
  assert.equal(reports.length, 1, 'an hours timer reports exactly one stream');
  const v = validateReport({ key: 'sleep', label: 'Sleep', value: 7.5, date: '2026-07-02', kind: 'duration' });
  assert.equal(v.ok, true, 'a fractional-hours value validates against the contract');
});

test('sleep-hours variant behaves: a decimal entry logs the exact hours, reports it, '
  + 'persists, and resets the next day', async () => {
  const now = new Date('2026-07-03T10:00:00');
  const h = await mountReady(SLEEP.html, { now });
  assert.equal(h.errors.length, 0, `hours timer threw at mount: ${h.errors.join(' | ')}`);
  assert.equal(h.valueText(), '0', 'a fresh hours tile rests at 0');
  // enter 7.5 hours and save
  await h.type('#in', '7.5');
  await h.click('#save');
  assert.equal(h.value(), 7.5, 'the hero shows the exact decimal hours (not a minute count)');
  const last = h.reports[h.reports.length - 1];
  const v = validateReport(last);
  assert.ok(v.ok && v.stream.value === 7.5, 'it reports 7.5 hours, matching the hero');
  if (v.ok) assert.equal(v.stream.kind, 'duration', 'the reported kind is duration');
  // persists across a reopen, and does not re-report on a pure reopen
  const h2 = await h.rehydrate();
  assert.equal(h2.value(), 7.5, 'reopening keeps the logged hours');
  assert.equal(h2.reports.length, 0, 'a pure reopen does not re-report into Vee');
  // rolls over the next day
  h2.setNow(addDays(now, 1));
  const h3 = await h2.rehydrate();
  assert.equal(h3.valueText(), '0', 'the next day resets to 0');
  assert.equal(/NaN/.test(h3.section()), false, 'the week chart draws NaN-free after rollover');
  h.close();
  h2.close();
  h3.close();
});
