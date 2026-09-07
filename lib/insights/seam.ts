/**
 * Seam detection — Stage 3 of the cross-domain "Vitality noticed" engine. The
 * generalized version of the shipping sleep<->training gate (lib/insights/fusion):
 * given aligned numeric pairs (from alignByBucket) and a config, it returns a
 * grounded finding ONLY when all three gates clear together, else null (silent).
 *
 * A false cross-domain claim is the worst possible failure, so a finding cannot
 * exist unless real buckets genuinely co-vary:
 *   1. enough paired buckets (cfg.minBuckets),
 *   2. a real Pearson correlation whose strength clears cfg.minR AND whose SIGN
 *      matches cfg.expectDir (so a wrong-direction link is refused, not phrased),
 *   3. a felt contrast: the high half of A really differs from the low half, and
 *      B moves with it by a meaningful amount in the correlation's direction.
 *
 * It reuses the canonical `correlate` primitive (never reimplements Pearson) and
 * returns only NUMBERS — phrasing + receipts live downstream so this stays pure
 * and testable. See __tests__/seam.test.ts.
 */

import { correlate } from '@/mcp/src/insights'

export type SeamDir = 'pos' | 'neg' | 'any'

export interface SeamConfig {
  /** Min paired buckets required to trust the link (default seam uses 6). */
  minBuckets: number
  /** Min absolute Pearson r. */
  minR: number
  /** Required sign of the link. 'any' accepts either and reports the sign found. */
  expectDir: SeamDir
  /** Min difference between the high and low halves of A (in A's unit). */
  contrastA: number
  /** Min difference B shows between those halves, in the correlation's direction
   *  (in B's unit). */
  contrastB: number
}

/** The grounded result: every number traces to the real aligned buckets, so the
 *  downstream copy + receipts can never claim something the data did not show. */
export interface SeamFinding {
  r: number
  n: number
  direction: 'pos' | 'neg'
  /** Mean of A over the high / low half (sorted by A). */
  aHi: number
  aLo: number
  /** Mean of B over those same halves. */
  bHi: number
  bLo: number
}

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length

export function detectSeam(pairs: [number, number][], cfg: SeamConfig): SeamFinding | null {
  // gate 1 — enough paired buckets.
  if (pairs.length < cfg.minBuckets) return null

  // gate 2 — a real correlation of the expected sign (correlate is null on <3
  // pairs or a flat series, so a degenerate set can never pass).
  const corr = correlate(pairs.map((p) => p[0]), pairs.map((p) => p[1]))
  if (!corr || Math.abs(corr.r) < cfg.minR) return null
  const direction: 'pos' | 'neg' = corr.r >= 0 ? 'pos' : 'neg'
  if (cfg.expectDir !== 'any' && cfg.expectDir !== direction) return null

  // gate 3 — a felt contrast: split the pairs (sorted by A) into a low and a high
  // half (an odd middle bucket sits out of both), and require both A's spread and
  // B's matching move to be big enough to feel.
  const sorted = [...pairs].sort((x, y) => x[0] - y[0])
  const half = Math.floor(sorted.length / 2)
  const low = sorted.slice(0, half)
  const high = sorted.slice(sorted.length - half)
  const aLo = mean(low.map((p) => p[0]))
  const aHi = mean(high.map((p) => p[0]))
  const bLo = mean(low.map((p) => p[1]))
  const bHi = mean(high.map((p) => p[1]))

  if (aHi - aLo < cfg.contrastA) return null
  const bMoveInDir = direction === 'pos' ? bHi - bLo : bLo - bHi
  if (bMoveInDir < cfg.contrastB) return null

  return { r: corr.r, n: corr.n, direction, aHi, aLo, bHi, bLo }
}
