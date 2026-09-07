// FILE B — the BEHAVIOR MATRIX for the 6 deterministic scaffold templates (+ the
// sleep-hours timer variant). render.dom.test.ts proves a tile does not THROW; this
// proves it is CORRECT. For each template it asserts, per the hardening plan:
//   1. RENDERS       — resting hero value + a non-empty section (chart or empty state)
//   2. NUMBER UPDATES — the primary interaction moves #value to the EXACT math (S1 fix:
//                       assert the value, not merely that a report fired)
//   3. REPORT VALUE  — the last report's value == the on-screen number, validateReport ok,
//                       with a local YYYY-MM-DD date
//   4. PERSISTS      — rehydrate() (close+reopen against the REAL store) keeps the number
//                       and does NOT re-report on a pure reopen (S2 + INV-2)
//   5. DAY ROLLOVER  — setNow(tomorrow)+rehydrate resets today (or keeps a running series
//                       for measure) and slides yesterday into the chart (S3)
//   6. CHART DRAWS   — the section draws with no 'NaN' in an svg d= or a scaleY (S5)
//   7. EMPTY STATE   — a fresh (empty-store) mount renders without throwing (S4)
// Plus the cross-cutting invariants INV-1..INV-4.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaffoldTile } from '../scaffoldTile.js';
import { validateReport } from './reportContract.js';
import { mountReady, addDays } from './behaviorHarness.js';

// A fixed, mid-morning local time so a mount never straddles a real midnight and the
// "tomorrow" of a rollover test is deterministic.
const NOW = new Date('2026-07-03T10:00:00');
const TODAY_KEY = '2026-07-03';

interface Case {
  name: string;
  goal: string;
  /** initial resting hero text before any interaction. */
  rest: string;
  /** perform the primary interaction(s). */
  act: (h: any) => Promise<void>;
  /** the exact number #value must show (and the report must carry) after `act`. */
  expect: number;
  /** the hero text the day AFTER a rollover: '0' / '-' for a daily reset, or the same
   *  number for a running series (measure). */
  day2Rest: string;
  /** the reported `kind` (locks the taxonomy member). */
  kind: string;
  /** a phrase the FRESH empty section must contain (empty-state proof). */
  emptyMark: RegExp;
}

const CASES: Case[] = [
  {
    name: 'counter',
    goal: 'count my pushups', // no target -> honest bignum + plain 7-day bars
    rest: '0',
    act: async (h) => {
      await h.click('#plus');
    },
    expect: 1,
    day2Rest: '0',
    kind: 'count',
    emptyMark: /no days logged yet|best/,
  },
  {
    name: 'timer-minutes',
    goal: 'meditation minutes',
    rest: '0',
    act: async (h) => {
      await h.click('[data-a="5"]');
      await h.click('[data-a="10"]');
    },
    expect: 15,
    day2Rest: '0',
    kind: 'duration',
    emptyMark: /of 7 days|no days logged yet/,
  },
  {
    name: 'timer-hours(sleep)',
    goal: 'hours of sleep', // the sleep variant: unit 'h', decimal entry, +hours mode
    rest: '0',
    act: async (h) => {
      await h.type('#in', '7.5');
      await h.click('#save');
    },
    expect: 7.5,
    day2Rest: '0',
    kind: 'duration',
    emptyMark: /of 7 days|no days logged yet/,
  },
  {
    name: 'scale',
    goal: 'rate my mood out of 10',
    rest: '-',
    act: async (h) => {
      // click the 4th rating dot -> value 4
      const dots = h.win.document.querySelectorAll('#scale .rdot');
      dots[3].click();
      await h.settle();
    },
    expect: 4,
    day2Rest: '-',
    kind: 'rating',
    emptyMark: /no check-ins yet/,
  },
  {
    name: 'measure',
    goal: 'log my weight',
    rest: '-',
    act: async (h) => {
      await h.type('#in', '82.4');
      await h.click('#save');
    },
    expect: 82.4,
    day2Rest: '82.4', // a running series: measure keeps the latest reading across a day, never resets
    kind: 'measure',
    emptyMark: /your line starts here/,
  },
  {
    name: 'money',
    goal: 'track my daily spend',
    rest: '$0',
    act: async (h) => {
      await h.type('#in', '20');
      await h.click('#save');
      await h.type('#in', '30');
      await h.click('#save');
    },
    expect: 50, // same-day adds accumulate (20 + 30)
    day2Rest: '$0',
    kind: 'money',
    emptyMark: /no days logged yet|this week/,
  },
  {
    name: 'toggle',
    goal: 'did I read today',
    rest: '0',
    act: async (h) => {
      await h.click('#toggle');
    },
    expect: 1, // one day marked -> streak 1
    day2Rest: '1', // yesterday marked + today unmarked still reads a 1-day streak
    kind: 'done',
    emptyMark: /no days marked yet/,
  },
];

for (const c of CASES) {
  test(`behavior[${c.name}]: renders, updates to exact math, reports that value, persists, rolls over`, async () => {
    const { html } = scaffoldTile({ goal: c.goal });

    // 1. RENDERS — resting hero + a non-empty section.
    const h = await mountReady(html, { now: NOW });
    assert.equal(h.errors.length, 0, `${c.name} threw at mount: ${h.errors.join(' | ')}`);
    assert.equal(h.valueText(), c.rest, `${c.name} resting hero value`);
    assert.ok(h.section().length > 0, `${c.name} rendered a section`);

    // 2. NUMBER UPDATES to the exact expected math (the S1 fix).
    await c.act(h);
    assert.equal(h.errors.length, 0, `${c.name} threw on interaction: ${h.errors.join(' | ')}`);
    assert.equal(h.value(), c.expect, `${c.name} hero shows the exact expected number`);

    // 3. REPORT VALUE matches the on-screen number and validates.
    assert.ok(h.reports.length >= 1, `${c.name} reported a stream`);
    const last = h.reports[h.reports.length - 1];
    const v = validateReport(last);
    assert.ok(v.ok, `${c.name} report is contract-valid (got ${JSON.stringify(last)})`);
    if (v.ok) {
      assert.equal(v.stream.value, c.expect, `${c.name} report value == on-screen number`);
      assert.equal(v.stream.kind, c.kind, `${c.name} report kind`);
      assert.equal(v.stream.date, TODAY_KEY, `${c.name} report carries the local date key`);
    }
    const reportsAfterAct = h.reports.length;

    // 6. CHART DRAWS — no NaN in the drawn section (svg d= / scaleY).
    assert.equal(/NaN/.test(h.section()), false, `${c.name} section drew without NaN`);

    // 4. PERSISTS + REHYDRATES (S2) — reopen keeps the number; a pure reopen does NOT
    //    re-report (INV-2: a reopen must not double-count into Vee).
    const h2 = await h.rehydrate();
    assert.equal(h2.errors.length, 0, `${c.name} threw on rehydrate: ${h2.errors.join(' | ')}`);
    assert.equal(h2.value(), c.expect, `${c.name} reopened tile shows the persisted number`);
    assert.equal(h2.reports.length, 0, `${c.name} did NOT re-report on a pure reopen`);
    void reportsAfterAct;

    // 5. DAY ROLLOVER (S3) — advance a day, reopen; today resets (or a running series
    //    keeps its latest reading), and the section still draws NaN-free.
    h2.setNow(addDays(NOW, 1));
    const h3 = await h2.rehydrate();
    assert.equal(h3.errors.length, 0, `${c.name} threw after rollover: ${h3.errors.join(' | ')}`);
    assert.equal(h3.valueText(), c.day2Rest, `${c.name} day-2 hero (reset or running series)`);
    assert.equal(/NaN/.test(h3.section()), false, `${c.name} day-2 section drew without NaN`);

    h.close();
    h2.close();
    h3.close();
  });

  test(`behavior[${c.name}]: a FRESH tile renders its empty/idle state without throwing (S4)`, async () => {
    const { html } = scaffoldTile({ goal: c.goal });
    const h = await mountReady(html, { now: NOW });
    assert.equal(h.errors.length, 0, `${c.name} empty tile threw: ${h.errors.join(' | ')}`);
    assert.match(h.section(), c.emptyMark, `${c.name} shows an honest empty state`);
    h.close();
  });
}

// ── Template-specific truths the generic matrix cannot express ──────────────────────

test('behavior[measure]: the 7-day spark draws a real, NaN-free path (S5)', async () => {
  const { html } = scaffoldTile({ goal: 'log my weight' });
  let h = await mountReady(html, { now: NOW });
  await h.type('#in', '82.4');
  await h.click('#save');
  // a second, distinct reading on the next day -> the spark path materializes
  h.setNow(addDays(NOW, 1));
  const h2 = await h.rehydrate();
  await h2.type('#in', '81.9');
  await h2.click('#save');
  const sec = h2.section();
  assert.match(sec, /class="spark"/, 'the spark chart rendered');
  const d = sec.match(/class="sline"[^>]*\sd="([^"]+)"/);
  assert.ok(d, 'the trend line has a d= path');
  assert.equal(/NaN/.test(d![1]), false, `the spark path is NaN-free (got ${d![1]})`);
  h.close();
  h2.close();
});

test('behavior[measure]: all-equal readings (mx==mn) still draw a flat, NaN-free line', async () => {
  // The divide-by-zero trap: with every value equal, (mx-mn) is 0. The template guards it
  // with (mx-mn)*0.25||1, so the line must be flat and finite, never NaN.
  const { html } = scaffoldTile({ goal: 'log my weight' });
  let h = await mountReady(html, { now: NOW });
  await h.type('#in', '80');
  await h.click('#save');
  h.setNow(addDays(NOW, 1));
  const h2 = await h.rehydrate();
  await h2.type('#in', '80');
  await h2.click('#save');
  const d = h2.section().match(/class="sline"[^>]*\sd="([^"]+)"/);
  assert.ok(d, 'a flat line still has a path');
  assert.equal(/NaN/.test(d![1]), false, `equal-value spark is NaN-free (got ${d![1]})`);
  h.close();
  h2.close();
});

test('behavior[toggle]: two consecutive marked days reads a streak of 2; a gap resets it', async () => {
  const { html } = scaffoldTile({ goal: 'did I read today' });
  // day 1: mark
  let h = await mountReady(html, { now: NOW });
  await h.click('#toggle');
  assert.equal(h.value(), 1, 'day 1 marked -> streak 1');
  // day 2: mark -> streak 2
  h.setNow(addDays(NOW, 1));
  const h2 = await h.rehydrate();
  await h2.click('#toggle');
  assert.equal(h2.value(), 2, 'two consecutive marked days -> streak 2');
  // a streak never exceeds the days actually marked (2 marks -> at most 2)
  assert.ok(h2.value() <= 2, 'streak never exceeds days marked');
  // day 4 (a gap on day 3): opening shows streak 0 (the chain is broken)
  h2.setNow(addDays(NOW, 3));
  const h4 = await h2.rehydrate();
  assert.equal(h4.value(), 0, 'a gap day breaks the streak back to 0');
  h.close();
  h2.close();
  h4.close();
});

test('behavior[money]: same-day adds accumulate and the hero prints the currency symbol', async () => {
  const { html } = scaffoldTile({ goal: 'track my daily spend' });
  const h = await mountReady(html, { now: NOW });
  await h.type('#in', '20');
  await h.click('#save');
  await h.type('#in', '30');
  await h.click('#save');
  assert.equal(h.value(), 50, 'two same-day adds accumulate to 50');
  assert.match(h.valueText(), /^\$/, 'the money hero prints its currency symbol prefix');
  h.close();
});

test('behavior[scale]: the rating never scales past its max (scaleY ratio in [0,1])', async () => {
  const { html } = scaffoldTile({ goal: 'rate my mood out of 10' });
  const h = await mountReady(html, { now: NOW });
  const dots = h.win.document.querySelectorAll('#scale .rdot');
  dots[dots.length - 1].click(); // max rating
  await h.settle();
  assert.equal(h.value(), 10, 'clicking the top dot on a /10 dial gives 10');
  const ratios = [...h.section().matchAll(/scaleY\(([\d.]+)\)/g)].map((m) => parseFloat(m[1]));
  assert.ok(ratios.length > 0, 'the week chart drew bars');
  for (const r of ratios) assert.ok(r >= 0 && r <= 1, `a bar ratio stays within [0,1] (got ${r})`);
  h.close();
});

// ── Cross-cutting invariants over ALL templates ─────────────────────────────────────

test('INV-1 + INV-3: after any interaction, report.value == parsed #value, and the full '
  + 'mount+act+rollover+rehydrate lifecycle throws zero errors for every template', async () => {
  for (const c of CASES) {
    const { html } = scaffoldTile({ goal: c.goal });
    const h = await mountReady(html, { now: NOW });
    await c.act(h);
    // INV-1: the number the tile SHOWS is the number it REPORTS.
    const last = h.reports[h.reports.length - 1] as any;
    assert.ok(last, `${c.name} reported`);
    assert.equal(last.value, h.value(), `INV-1 ${c.name}: report.value == on-screen value`);
    // INV-3: no throw across the whole lifecycle (act -> next day -> reopen).
    h.setNow(addDays(NOW, 1));
    const h2 = await h.rehydrate();
    assert.equal(h.errors.length, 0, `INV-3 ${c.name}: no error through act`);
    assert.equal(h2.errors.length, 0, `INV-3 ${c.name}: no error through rollover+reopen`);
    h.close();
    h2.close();
  }
});

test('INV-4: the saved shape survives the round-trip — what save() hands out is exactly '
  + 'what load() returns, and the tile reads it back with no NaN/undefined on screen', async () => {
  for (const c of CASES) {
    const { html } = scaffoldTile({ goal: c.goal });
    const h = await mountReady(html, { now: NOW });
    await c.act(h);
    const saved = h.saves[h.saves.length - 1];
    // the host stored exactly what the tile saved. Compare via JSON (the real persistence
    // boundary serializes to a string), which is also realm-agnostic across the jsdom
    // window and the test's Node realm.
    assert.equal(
      JSON.stringify(h.store.data),
      JSON.stringify(saved),
      `INV-4 ${c.name}: store holds the saved shape`,
    );
    // the saved shape is the templates' array-of-{date,value} — not a stray object shape
    // that a load path might misread (locks finding #4 for the deterministic templates).
    assert.ok(Array.isArray(saved), `INV-4 ${c.name}: tiles persist the _days array shape`);
    // reopening reads it back cleanly (no NaN / undefined leaking to the hero).
    const h2 = await h.rehydrate();
    const txt = h2.valueText();
    assert.equal(/NaN|undefined/.test(txt), false, `INV-4 ${c.name}: reopened hero is clean (got "${txt}")`);
    assert.equal(h2.section().includes('undefined'), false, `INV-4 ${c.name}: reopened section has no undefined`);
    h.close();
    h2.close();
  }
});

test('robustness: a tile whose save is REJECTED (over the host cap) does not throw and '
  + 'the host records the rejection (save:error path, finding #7)', async () => {
  const { html } = scaffoldTile({ goal: 'track my water' });
  const h = await mountReady(html, { now: NOW, saveCap: 5 }); // 5 bytes: any real save exceeds it
  await h.click('#plus');
  assert.equal(h.errors.length, 0, 'the tile survives a rejected save without throwing');
  assert.ok(h.saveErrors.length >= 1, 'the host replied save:error to the over-cap write');
  h.close();
});

test('honesty: a REJECTED save surfaces a calm amber note inside the tile (the msg '
  + 'line goes .warn), never a silent smile over lost data', async () => {
  const { html } = scaffoldTile({ goal: 'track my water' });
  const h = await mountReady(html, { now: NOW, saveCap: 5 });
  await h.click('#plus');
  await h.settle();
  const msg = h.win.document.getElementById('msg');
  assert.ok(msg, 'the shared msg line exists');
  assert.match(msg.textContent || '', /did not stick/, 'the note says the save did not stick');
  assert.ok((msg.className || '').includes('warn'), 'the note is the amber .warn state, not a success');
  h.close();
});

test('honesty: a report:error reply from the host surfaces the same calm amber note', async () => {
  const { html } = scaffoldTile({ goal: 'track my water' });
  const h = await mountReady(html, { now: NOW });
  // The host answered the report with a failure (the server write never landed).
  h.win.postMessage({ source: 'vitality-host', type: 'report:error', reason: 'failed' }, '*');
  await h.settle();
  const msg = h.win.document.getElementById('msg');
  assert.ok(msg, 'the shared msg line exists');
  assert.match(msg.textContent || '', /did not land/, 'the note says the log did not land');
  assert.ok((msg.className || '').includes('warn'), 'the note is the amber .warn state');
  h.close();
});

test('honesty: a DROPPED load reply can never leave a tile permanently blank - the '
  + 'bridge re-asks at 3s, falls back to null at ~6s, and the tile boots its honest '
  + 'empty state', async () => {
  const { html } = scaffoldTile({ goal: 'track my water' });
  const h = await mountReady(html, { now: NOW, dropLoads: true });
  // Before the fallback fires the tile has not rendered its section yet.
  await new Promise((r) => setTimeout(r, 6600)); // > the bridge's ~6s fallback
  await h.settle();
  assert.equal(h.errors.length, 0, 'the tile survives the dropped reply without throwing');
  assert.ok(h.loads.length >= 2, 'the bridge re-asked the host once before giving up');
  assert.notEqual(h.valueText(), '', 'the hero rendered (not a blank tile)');
  assert.notEqual(h.section().trim(), '', 'the section rendered (chart or empty state)');
  h.close();
});

test('honesty: a LATE load reply carrying saved data reloads the tile (before any save), '
  + 'so an empty boot can never silently overwrite stored history', async () => {
  const { html } = scaffoldTile({ goal: 'track my water' });
  const h = await mountReady(html, { now: NOW, dropLoads: true });
  await new Promise((r) => setTimeout(r, 6600)); // past the fallback: tile booted empty
  await h.settle();
  const before = h.errors.length;
  // The real reply finally lands (a stalled main thread), carrying weeks of history.
  const id = h.loads[h.loads.length - 1];
  h.win.postMessage(
    { source: 'vitality-host', type: 'load:result', id, data: [{ date: '2026-06-01', value: 3 }] },
    '*',
  );
  await h.settle();
  // jsdom cannot navigate, so location.reload() surfaces as its "not implemented"
  // notice - which is exactly the proof the bridge chose to re-boot from the real
  // history instead of letting the next save overwrite it.
  assert.ok(
    h.errors.slice(before).some((e) => /navigation|reload/i.test(String(e))),
    'the bridge called location.reload() to boot from the recovered history',
  );
  h.close();
});

test('honesty: a LATE load reply never stomps fresh input - once the user has saved, '
  + 'the fallback waiter does NOT reload', async () => {
  const { html } = scaffoldTile({ goal: 'track my water' });
  const h = await mountReady(html, { now: NOW, dropLoads: true });
  await new Promise((r) => setTimeout(r, 6600)); // past the fallback: tile booted empty
  await h.settle();
  await h.click('#plus'); // the user logs something: Vitality._sv is set
  const before = h.errors.length;
  const id = h.loads[h.loads.length - 1];
  h.win.postMessage(
    { source: 'vitality-host', type: 'load:result', id, data: [{ date: '2026-06-01', value: 3 }] },
    '*',
  );
  await h.settle();
  assert.equal(
    h.errors.slice(before).some((e) => /navigation|reload/i.test(String(e))),
    false,
    'no reload after a save: the late reply must not stomp the fresh input',
  );
  h.close();
});
