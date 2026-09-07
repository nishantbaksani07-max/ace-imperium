import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evalPrompts, evalCases, EVAL_PROMPTS, EVAL_CASES } from './evalTiles.js';

test('eval: every diverse prompt builds a Vitality-grade tile (0 errors, 0 warnings) and exports', () => {
  const report = evalPrompts();
  // Print the receipt so the proof is visible in the test output, not just asserted.
  console.log('\n' + report.receipt + '\n');
  assert.ok(report.total >= 20, `expected >=20 prompts, got ${report.total}`);
  const dirty = report.rows.filter((r) => r.errors > 0 || r.warnings > 0 || !r.exportable);
  assert.equal(dirty.length, 0, 'these prompts did not come out Vitality-grade: ' + JSON.stringify(dirty, null, 2));
  assert.equal(report.allClean, true);
  assert.equal(report.clean, report.total);
  // Beyond the lint floor: every tile must also clear the structural richness gate,
  // so a thin single-number tile can never grade PASS again.
  const thin = report.rows.filter((r) => !r.rich);
  assert.equal(thin.length, 0, 'these tiles are not Fuel-grade rich: ' + JSON.stringify(thin.map((r) => r.goal)));
  assert.equal(report.allRich, true);
});

test('eval: the prompt spread exercises every template', () => {
  const report = evalPrompts();
  const templates = new Set(report.rows.map((r) => r.template));
  for (const t of ['counter', 'timer', 'scale', 'measure', 'money', 'toggle']) {
    assert.ok(templates.has(t), `eval prompts must exercise the ${t} template`);
  }
});

test('eval: the prompt list is a real spread (~two dozen)', () => {
  assert.ok(EVAL_PROMPTS.length >= 20, `expected >=20 prompts, got ${EVAL_PROMPTS.length}`);
});

// ── Inference lock: every case maps to exactly its expected fields ──
// One aggregate check first so a failure prints the full diff of every drifting
// goal at once, then a per-case test so the failing goal is named in the runner.

test('eval: the inference lock is a real spread (25+ realistic goals)', () => {
  assert.ok(EVAL_CASES.length >= 25, `expected >=25 locked cases, got ${EVAL_CASES.length}`);
});

test('eval: every locked goal still infers exactly its expected {kind, template, unit, goalDirection, scaleMax}', () => {
  const { rows, total, locked, allLocked } = evalCases();
  const drift = rows.filter((r) => !r.ok);
  assert.equal(
    drift.length,
    0,
    'these goals drifted from their locked inference:\n' +
      drift.map((r) => `  "${r.goal}"${r.unitSystem ? ` [${r.unitSystem}]` : ''} -> ${r.mismatches.join('; ')}`).join('\n'),
  );
  assert.equal(locked, total);
  assert.equal(allLocked, true);
});

for (const c of EVAL_CASES) {
  const label = `${c.goal}${c.unitSystem ? ` [${c.unitSystem}]` : ''}`;
  test(`eval-lock: "${label}"`, () => {
    const { rows } = evalCases([c]);
    const row = rows[0];
    assert.equal(row.ok, true, row.mismatches.join('; '));
  });
}

// The lock table exercises the same builder as the floor, so every locked goal must
// ALSO come out clean, Fuel-grade rich, and exportable, not merely infer correctly.
test('eval: every locked goal also builds a clean, rich, exportable tile', () => {
  const report = evalPrompts(EVAL_CASES.map((c) => c.goal));
  const dirty = report.rows.filter((r) => r.errors > 0 || r.warnings > 0 || !r.exportable || !r.rich);
  assert.equal(
    dirty.length,
    0,
    'these locked goals did not build Vitality-grade:\n' + JSON.stringify(dirty, null, 2),
  );
});
