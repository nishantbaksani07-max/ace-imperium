// checkTile: run a finished tile through the linter and render a human-readable
// "Vitality-grade" receipt. This is what the check_tile MCP tool returns, so the
// caller's Claude can see exactly what to fix and iterate to green before shipping.
//
// A PASSING receipt also carries a Proof line: a keyed digest of the exact html
// that just passed. vitality_add_tile accepts it as `check` and skips the
// identical re-lint (the token/latency diet for the prove-then-ship ritual). Any
// edit to the html invalidates the proof, and add_tile falls back to the full
// lint whenever the proof is absent or stale - so nothing unproven ever lands.
// This is a lint CACHE, not a security boundary: the sealed sandbox (and the
// kind-aware report gate, which always runs) is what protects the dashboard.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { lintTile, LINT_RULESET_VERSION, type LintFinding } from './tiles/lintTile.js';

// Stable per-server key. FAIL CLOSED without one: a committed fallback constant
// would let anyone reading this public code mint a valid Proof offline and skip
// the lint on a deployment that forgot both env vars. Keyless runs simply emit
// no Proof line, and every add_tile falls back to the full lint - correct, just
// without the re-lint diet.
function proofKey(): string | null {
  return process.env.MCP_CHECK_PROOF_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

/**
 * The proof value a passing check_tile receipt carries for this exact html,
 * or null when no server secret is configured (fail closed: no proof, full lint).
 * The lint ruleset version is folded into the digest, so bumping
 * LINT_RULESET_VERSION invalidates every outstanding proof - an old proof can
 * never skip a rule added after it was minted.
 */
export function checkProofFor(html: string): string | null {
  const key = proofKey();
  if (!key) return null;
  return createHmac('sha256', key).update(`${LINT_RULESET_VERSION}\n${html.trim()}`).digest('hex').slice(0, 32);
}

/** True when `proof` is the proof of this exact html (whitespace-trimmed). */
export function verifyCheckProof(html: string, proof: string | null | undefined): boolean {
  if (!proof || typeof proof !== 'string') return false;
  const mine = checkProofFor(html);
  if (!mine) return false; // no secret configured: never trust a proof
  const expected = Buffer.from(mine);
  const given = Buffer.from(proof.trim().toLowerCase());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function line(f: LintFinding): string {
  return `  - ${f.rule}: ${f.message}${f.hint ? ` -> ${f.hint}` : ''}`;
}

/**
 * A one-line Vitality-grade receipt for stamping onto a build (e.g. the
 * scaffold_tile header), so every tile the MCP hands back self-certifies without
 * a separate check_tile round-trip. The full multi-line receipt is checkTile().
 */
export function gradeStamp(html: string): string {
  const r = lintTile(html);
  if (r.ok && r.warnings === 0) {
    return 'Vitality-grade: PASS. Sealed, local date keys, buttery 60fps motion (transform/opacity only), on-brand, 0 warnings.';
  }
  if (r.ok) {
    return `Vitality-grade: PASS with ${r.warnings} polish warning(s). Run check_tile for the list.`;
  }
  return `Vitality-grade: FAIL, ${r.errors} error(s) must be fixed. Run check_tile for the list.`;
}

export function checkTile(html: string): { text: string; ok: boolean } {
  const r = lintTile(html);
  const errors = r.findings.filter((f) => f.severity === 'error');
  const warns = r.findings.filter((f) => f.severity === 'warn');
  const out: string[] = [];

  if (r.ok) {
    out.push('VITALITY-GRADE: PASS');
    out.push('Passes the hard floor: sealed (no external libs), a complete document, local date keys, transform/opacity motion, honest report wiring.');
    const proof = checkProofFor(html);
    if (proof) {
      out.push(`Proof: ${proof}`);
      out.push('Pass this Proof value to vitality_add_tile as `check` with the IDENTICAL html and it skips the re-lint (any edit invalidates it).');
    }
  } else {
    out.push(`VITALITY-GRADE: FAIL (${errors.length} error${errors.length === 1 ? '' : 's'} must be fixed before this tile ships)`);
    out.push('Errors:');
    out.push(...errors.map(line));
  }

  if (warns.length) {
    out.push('', `${warns.length} quality nudge${warns.length === 1 ? '' : 's'} to polish:`);
    out.push(...warns.map(line));
  }

  if (!r.ok) {
    out.push('', 'Fix the errors and call check_tile again until it passes.');
  }

  return { text: out.join('\n'), ok: r.ok };
}
