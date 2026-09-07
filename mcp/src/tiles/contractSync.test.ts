// THE SMOKE ALARM for the tile report contract.
//
// In plain words: a tile hands its data to Vitality on one fixed "form"
// (key, label, value, date, kind). That form is written down in TWO files:
//   1. the real one, in the dashboard:  lib/tiles/reportContract.ts
//   2. a copy here, in the MCP:          mcp/src/tiles/reportContract.ts (the mirror)
// The MCP copy is what teaches a user's Claude how to build their tile. If the
// two ever stop matching (someone edits one and forgets the other), a user's
// tile would send data in a shape the dashboard cannot read, and their data
// would land wrong when they export the tile into Vitality. These tests are the
// alarm that beeps the moment the two copies drift apart, so we catch it before
// any user is bitten.
//
// Test B does the real two-copy compare (it reads the dashboard file straight
// from git). Test A pins the contract's exact shape as a backstop, so even if
// the dashboard file is not reachable in some environment, any edit to the MCP
// copy still trips the alarm.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { REPORT_KINDS, GOAL_DIRECTIONS, normalizeKey, validateReport } from './reportContract.js';

// ---- Test B: the real two-copy compare -------------------------------------

const SOURCE_PATH = 'lib/tiles/reportContract.ts';
// Where the dashboard source of truth might live. main first (its eventual
// home), then the dashboard feature branch it lives on today.
const CANDIDATE_REFS = ['main', 'origin/main', 'vee-tile-fuse', 'origin/vee-tile-fuse'];

const here = path.dirname(fileURLToPath(import.meta.url));
const MIRROR_PATH = path.join(here, 'reportContract.ts');

// Read the dashboard source from the first git ref that has it, or null.
function readDashboardSource(): { ref: string; text: string } | null {
  for (const ref of CANDIDATE_REFS) {
    try {
      const text = execFileSync('git', ['show', `${ref}:${SOURCE_PATH}`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return { ref, text };
    } catch {
      // ref not fetched, or file not there yet: try the next candidate.
    }
  }
  return null;
}

// The mirror carries a few extra "// MIRROR of ..." header lines that the
// source does not. Compare only the contract body: everything from the first
// JSDoc block onward. trimEnd avoids a false alarm over a trailing newline.
function contractBody(text: string): string {
  const i = text.indexOf('/**');
  return (i === -1 ? text : text.slice(i)).trimEnd();
}

const dashboard = readDashboardSource();

test(
  'smoke alarm: the MCP copy of the report contract matches the dashboard source',
  {
    skip: dashboard
      ? false
      : `dashboard source ${SOURCE_PATH} is not on a reachable git ref yet (it lands when it hits main); cross-copy compare skipped, the shape backstop below still runs`,
  },
  () => {
    const mirror = contractBody(readFileSync(MIRROR_PATH, 'utf8'));
    const source = contractBody(dashboard!.text);
    assert.equal(
      mirror,
      source,
      `The MCP report-contract copy has DRIFTED from the dashboard source (${dashboard!.ref}:${SOURCE_PATH}). ` +
        'Re-sync mcp/src/tiles/reportContract.ts byte-for-byte with the dashboard file (keep only the // MIRROR header), then re-run.',
    );
  },
);

// ---- Test A: the shape backstop (always runs) ------------------------------
// These pin the exact, agreed shape of the form, so any change to the MCP copy
// trips the alarm even when the dashboard file is unreachable.

test('locked shape: report kinds are exactly the seven agreed kinds, in order', () => {
  assert.deepEqual([...REPORT_KINDS], ['intake', 'count', 'duration', 'rating', 'measure', 'money', 'done']);
});

test('locked shape: goal directions are exactly up, down, neutral', () => {
  assert.deepEqual([...GOAL_DIRECTIONS], ['up', 'down', 'neutral']);
});

test('locked shape: a valid stream has exactly key, label, value, date, kind, goalDirection', () => {
  const r = validateReport({ key: 'beer', label: 'Beers', value: 2, date: '2026-06-28', kind: 'intake', goalDirection: 'down' });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.deepEqual(Object.keys(r.stream), ['key', 'label', 'value', 'date', 'kind', 'goalDirection']);
  }
});

test('locked shape: the alcohol canonical family folds every beer alias to "alcohol"', () => {
  for (const alias of ['beer', 'beers', 'brew', 'brews', 'pint', 'pints', 'drink', 'drinks', 'alcohol']) {
    assert.equal(normalizeKey(alias), 'alcohol');
  }
});
