import { test } from 'node:test';
import assert from 'node:assert/strict';
import { richnessOf } from './richness.js';
import { scaffoldTile } from '../scaffoldTile.js';
import { EVAL_PROMPTS } from './evalTiles.js';

test('richness: every scaffolded tile clears the full structural gate', () => {
  for (const goal of EVAL_PROMPTS) {
    const { html } = scaffoldTile({ goal });
    const r = richnessOf(html);
    assert.ok(r.ok, `"${goal}" is thin, missing: ${r.missing.join(', ')}`);
    assert.equal(r.score, r.max);
  }
});

test('richness: the gate is a real spread of marks, not a token check', () => {
  // A thin tile can copy one or two class names; a genuinely deep gate has many marks,
  // so a hollow tile still fails several. Guard the depth so a future edit cannot quietly
  // gut the gate back down to a couple of shallow presence checks.
  const { html } = scaffoldTile({ goal: 'track my water' });
  const r = richnessOf(html);
  assert.ok(r.max >= 12, `the gate should carry a deep set of marks, has ${r.max}`);
});

test('richness: a bare single-number tile is correctly flagged THIN', () => {
  // The kind of tile the old floor shipped: sealed, on-brand, but a lone counter.
  const bare = `<!doctype html><html><head><style>body{background:transparent}::selection{background:#6EE7B7}</style></head><body><div style="font-size:60px">0</div><button>+</button><script>var a=1;</script></body></html>`;
  const r = richnessOf(bare);
  assert.equal(r.ok, false);
  assert.ok(r.missing.length >= 4, 'a bare counter should miss most structural marks');
});

test('richness: the fonts mark specifically catches an unloaded serif (the Georgia bug)', () => {
  const { html } = scaffoldTile({ goal: 'track my water' });
  // Strip the Google Fonts link: the serif would silently fall back to Georgia.
  const noFonts = html.replace(/<link[^>]*fonts\.googleapis[^>]*>/g, '');
  assert.equal(richnessOf(noFonts).missing.includes('signature-fonts'), true);
});

// ---------------------------------------------------------------------------
// The tightened marks each close a "looks rich but is hollow" gap. A tile can
// copy the class NAMES of the shell and clear a shallow presence check while the
// pieces do nothing. These prove the gate now catches those hollow copies.
// ---------------------------------------------------------------------------

// A tile that games a shallow gate: it has the eyebrow, a `.bignum`, a `.pill good`,
// a `.bars` container, and the words "nothing yet". But every piece is hollow: the
// hero number renders in Georgia, the pill is a static label with one state, the
// section is an empty div, and the button is wired to nothing.
const GAMED = `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter&family=Instrument+Serif" rel="stylesheet">
<style>:root{--font-serif:'Instrument Serif',serif}.bignum{font-family:Georgia}.pill.good{}.eyebrow{}.section{}</style></head>
<body><div class="eyebrow"><span class="num">01</span></div>
<span class="bignum">0</span><span class="pill good"><span class="dot"></span>ok</span>
<section class="section"><div class="bars"></div><div id="section"></div></section>
<div>nothing yet</div>
<button id="b">+</button><script>var x=1;</script></body></html>`;

test('richness: a hollow tile that copies the shell class names is still flagged THIN', () => {
  const r = richnessOf(GAMED);
  assert.equal(r.ok, false, 'a tile with hollow copies of the shell classes must not pass rich');
  // It must be caught by the wiring marks, not just miss one cosmetic thing.
  assert.ok(r.missing.length >= 4, `a hollow tile should miss several marks, missed: ${r.missing.join(', ')}`);
});

test('richness: the serif-hero mark catches a bignum that is not actually serif', () => {
  // `.bignum` exists but renders in Georgia, not the loaded Instrument Serif.
  assert.ok(richnessOf(GAMED).missing.includes('serif-hero-number'));
  // The real template wires .bignum to var(--font-serif) and passes.
  const { html } = scaffoldTile({ goal: 'log my weight' });
  assert.ok(!richnessOf(html).missing.includes('serif-hero-number'));
});

test('richness: the pill-states mark catches a static one-state pill', () => {
  // GAMED defines only .pill.good, so it cannot honestly read idle or caution.
  assert.ok(richnessOf(GAMED).missing.includes('pill-states'));
  // A real template defines idle + good (+ caution) and drives them with pill().
  const { html } = scaffoldTile({ goal: 'beer tracker' });
  const r = richnessOf(html);
  assert.ok(!r.missing.includes('pill-states'));
  assert.ok(!r.missing.includes('pill-wired'));
});

test('richness: the section-rendered mark catches an empty placeholder section', () => {
  // GAMED has `<div id="section"></div>` that is never filled and no draw* call.
  assert.ok(richnessOf(GAMED).missing.includes('section-rendered'));
  // Real templates call drawBars/drawSpark/drawGrid/drawWeek to fill the section.
  const { html } = scaffoldTile({ goal: 'meditation minutes' });
  assert.ok(!richnessOf(html).missing.includes('section-rendered'));
});

test('richness: the persists mark catches a tile that never saves or loads', () => {
  // GAMED never touches the host bridge, so a log would not survive a reload.
  assert.ok(richnessOf(GAMED).missing.includes('persists'));
  // Every real template saves AND loads its own data through Vitality.
  const { html } = scaffoldTile({ goal: 'did I read today' });
  assert.ok(!richnessOf(html).missing.includes('persists'));
});

test('richness: the wired-action mark catches a hero with a dead button', () => {
  // GAMED's button has no handler; a real tile wires an onclick / click listener.
  assert.ok(richnessOf(GAMED).missing.includes('wired-action'));
  const { html } = scaffoldTile({ goal: 'took my vitamins' });
  assert.ok(!richnessOf(html).missing.includes('wired-action'));
});

test('richness: the gate stays graded (score/max/missing), never a hard binary', () => {
  // A partially-built tile should report a partial score, not just ok:false with no
  // signal, so a builder can see exactly what to add. GAMED clears some cosmetic marks.
  const r = richnessOf(GAMED);
  assert.ok(r.score > 0 && r.score < r.max, `expected a partial score, got ${r.score}/${r.max}`);
  assert.equal(r.score + r.missing.length, r.max, 'score and missing must account for every mark');
});
