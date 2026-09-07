// FILE D (tests) — the token-budget receipt + the guardrails that keep the beacon cheap.
//
// Two things this locks:
//   1. A CEILING on the deterministic path: the worst scaffold tile must stay under
//      SCAFFOLD_TOKEN_CEILING. This is the tripwire that catches a future template upgrade
//      quietly bloating the cheap path back toward the expensive generative one.
//   2. The ORDER-OF-MAGNITUDE gap: the full kit pack (the maximal generative read) is
//      >=10x the average scaffold tile, and even one focused domain bundle dwarfs it. This
//      is the number that justifies the deterministic path existing at all.
// The receipt is printed via console.log so the before/after numbers surface in the run.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estTokens,
  scaffoldCosts,
  computeTokenReport,
  formatReceipt,
  domainBundleRange,
  SCAFFOLD_TOKEN_CEILING,
  REP_TILES,
} from './tokenCost.js';

test('token meter: estTokens is the ~4-bytes/token heuristic, rounded up', () => {
  assert.equal(estTokens(0), 0);
  assert.equal(estTokens(4), 1);
  assert.equal(estTokens(5), 2); // rounds up
  assert.equal(estTokens(4000), 1000);
});

test('token meter: prints the before/after receipt (numbers surface in the run)', () => {
  const report = computeTokenReport();
  // eslint-disable-next-line no-console
  console.log('\n' + formatReceipt(report) + '\n');
  assert.ok(report.scaffolds.length === REP_TILES.length, 'every representative tile is measured');
});

test('CEILING: the worst scaffold tile stays under the token ceiling (stops a future '
  + 'upgrade dragging the cheap path back to the expensive one)', () => {
  const report = computeTokenReport();
  assert.ok(
    report.worstScaffold.tokens < SCAFFOLD_TOKEN_CEILING,
    `worst scaffold (${report.worstScaffold.name}) is ${report.worstScaffold.tokens} tok, `
      + `must stay under the ${SCAFFOLD_TOKEN_CEILING} ceiling`,
  );
  // Every individual scaffold, not just the max, respects the ceiling.
  for (const s of scaffoldCosts()) {
    assert.ok(s.tokens < SCAFFOLD_TOKEN_CEILING, `${s.name} is ${s.tokens} tok, over the ceiling`);
  }
});

test('GAP: the full kit pack is >=10x the average scaffold tile (the generative path the '
  + 'deterministic path replaces)', () => {
  const report = computeTokenReport();
  assert.ok(
    report.fullPackTokens >= report.avgScaffoldTokens * 10,
    `full pack is ${report.fullPackTokens} tok but avg scaffold is ${report.avgScaffoldTokens} tok `
      + `(${report.fullPackVsAvg}x); expected >=10x`,
  );
});

test('GAP: even one focused domain bundle dwarfs a scaffold tile (>=3x avg), so the '
  + 'deterministic path is dramatically cheaper on EVERY generative read', () => {
  const report = computeTokenReport();
  assert.ok(
    report.domainBundleTokens >= report.avgScaffoldTokens * 3,
    `domain bundle is ${report.domainBundleTokens} tok vs ${report.avgScaffoldTokens} avg scaffold `
      + `(${report.domainVsAvg}x); expected >=3x`,
  );
  // The LEANEST domain bundle across all domains is still well over a scaffold tile.
  const range = domainBundleRange();
  assert.ok(
    range.minTokens > report.avgScaffoldTokens,
    `even the leanest domain bundle (${range.minTokens} tok) exceeds an avg scaffold (${report.avgScaffoldTokens} tok)`,
  );
});

test('token meter: every representative template kind is covered (all 6 + both timer modes)', () => {
  const names = REP_TILES.map((t) => t.name).join(' ');
  for (const kind of ['counter', 'timer', 'scale', 'measure', 'money', 'toggle']) {
    assert.ok(names.includes(kind), `the receipt covers the ${kind} template`);
  }
  assert.ok(names.includes('hours'), 'the receipt covers the sleep-hours timer variant');
});
