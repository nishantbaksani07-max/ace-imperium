// The RENDER smoke test: the string-only lint proves a tile is sealed and on-brand,
// but it cannot prove the tile actually RUNS. A tile that lints green but throws on
// first render is worse than no tile (this is exactly how the `var history` global
// shadow shipped and broke all six templates). Here we mount each template in a real
// DOM (jsdom), act as the Vitality host (reply to load, capture report/save), and
// assert: no throw at mount or on interaction, the section renders, and the tile fires
// exactly one contract-valid report with a local date key.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { scaffoldTile } from '../scaffoldTile.js';
import { validateReport } from './reportContract.js';

const wait = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
async function settle(n = 6): Promise<void> {
  for (let i = 0; i < n; i++) await wait();
}

interface Mounted {
  win: any;
  reports: unknown[];
  saves: unknown[];
  errors: unknown[];
}

function mount(html: string): Mounted {
  const errors: unknown[] = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e)));
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const win: any = dom.window;
  win.addEventListener('error', (e: any) => errors.push(e.error || e.message));
  win.addEventListener('unhandledrejection', (e: any) => errors.push(e.reason || 'unhandledrejection'));
  const reports: unknown[] = [];
  const saves: unknown[] = [];
  // Act as the Vitality host: reply to the tile's load, capture report + save.
  win.addEventListener('message', (e: any) => {
    const m = e.data;
    if (!m || m.source !== 'vitality-tile') return;
    if (m.type === 'load') win.postMessage({ source: 'vitality-host', type: 'load:result', id: m.id, data: [] }, '*');
    else if (m.type === 'report') reports.push(m.stream);
    else if (m.type === 'save') saves.push(m.data);
  });
  return { win, reports, saves, errors };
}

interface Case {
  name: string;
  goal: string;
  act: (win: any) => void;
}

const CASES: Case[] = [
  { name: 'counter', goal: 'track my water', act: (w) => w.document.getElementById('plus').click() },
  { name: 'timer', goal: 'meditation minutes', act: (w) => w.document.querySelector('[data-a]').click() },
  // The hours-mode timer (sleep/naps/fasting): a decimal reading, not the +5 minute chips.
  { name: 'timer-hours', goal: 'hours of sleep', act: (w) => { const i = w.document.getElementById('in'); i.value = '7.5'; w.document.getElementById('save').click(); } },
  { name: 'scale', goal: 'rate my mood out of 10', act: (w) => w.document.querySelector('#scale .rdot').click() },
  { name: 'measure', goal: 'log my weight', act: (w) => { const i = w.document.getElementById('in'); i.value = '82.4'; w.document.getElementById('save').click(); } },
  { name: 'money', goal: 'track my daily spend', act: (w) => { const i = w.document.getElementById('in'); i.value = '20'; w.document.getElementById('save').click(); } },
  { name: 'toggle', goal: 'did I read today', act: (w) => w.document.getElementById('toggle').click() },
];

for (const c of CASES) {
  test(`render: ${c.name} tile mounts, renders, and reports without throwing`, async () => {
    const { html } = scaffoldTile({ goal: c.goal });
    const m = mount(html);
    await settle(); // load -> render round trip
    assert.equal(m.errors.length, 0, `${c.name} threw at render: ${m.errors.join(' | ')}`);
    assert.ok(m.win.document.getElementById('value'), `${c.name} has a hero value element`);
    assert.ok(
      m.win.document.getElementById('section').innerHTML.length > 0,
      `${c.name} rendered its section (a render throw would leave it empty)`,
    );

    // interact -> exactly one contract-valid report + a save
    c.act(m.win);
    await settle();
    assert.equal(m.errors.length, 0, `${c.name} threw on interaction: ${m.errors.join(' | ')}`);
    assert.ok(m.reports.length >= 1, `${c.name} reported at least one stream`);
    const v = validateReport(m.reports[m.reports.length - 1]);
    assert.ok(v.ok, `${c.name} reported a contract-valid stream (got: ${JSON.stringify(m.reports[m.reports.length - 1])})`);
    if (v.ok) assert.match(v.stream.date, /^\d{4}-\d{2}-\d{2}$/, `${c.name} used a local YYYY-MM-DD date key`);
    assert.ok(m.saves.length >= 1, `${c.name} persisted via the host bridge`);
  });
}

test('render: the day store never shadows the read-only window.history global', async () => {
  // Mounting executes the top-level script. The store must be named _days: a top-level
  // `var history=[]` throws in a browser (window.history is read-only) and broke every
  // tile at render. If it were still named history, this would surface an error.
  const { html } = scaffoldTile({ goal: 'track my water' });
  assert.equal(/var\s+history\s*=/.test(html), false, 'the store must not be named history');
  const m = mount(html);
  await settle();
  assert.equal(m.errors.length, 0, 'top-level script threw: ' + m.errors.join(' | '));
  assert.ok(Array.isArray(m.win._days), 'the day store (_days) initialized on the window');
});
