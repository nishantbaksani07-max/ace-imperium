/**
 * Peak seams — Phase 1 of the "Vitality noticed" engine. The first cross-domain
 * insights the general engine produces, built entirely on the shared primitives
 * (series -> align -> detectSeam), proving the path the sleep<->training seam
 * pioneered now generalizes. Output is a FusionNotice, so it drops straight into
 * the existing buildFeed fusion slot -> NoticeFeedCard with zero new render code.
 *
 * Pure + IO-free + unit-tested (see __tests__/peakSeams.test.ts). Copy is a
 * correlation read, never a causation claim; no em dashes; `key` is a verbatim
 * substring of `why` (the highlight + demo trigger), same invariants as fusion.ts.
 */

import { alignByBucket, type DatedPoint } from './align'
import { detectSeam, type SeamConfig } from './seam'
import type { FusionNotice, FusionCandidate } from './fusion'
import { relContrast } from './correlationEngine'

/** Caffeine on day N vs recovery on day N+1. Inverse (more caffeine, lower next
 *  morning), with felt floors of 40 mg between the day halves and 4 recovery
 *  points, over at least 10 paired mornings. Conservative so the first card is
 *  earned, never trigger-happy. */
const CAFFEINE_RECOVERY: SeamConfig = {
  minBuckets: 10, minR: 0.45, expectDir: 'neg', contrastA: 40, contrastB: 4,
}

/**
 * The caffeine -> next-morning recovery seam, scored for the selection engine. Aligns
 * the two daily series with a +1 day lag (today's caffeine, tomorrow's recovery), runs
 * the gated detector, and phrases the result as an honest correlation with real
 * mg/percent receipts. null (silent) unless the inverse link clears every gate.
 */
export function caffeineRecoveryCandidate(caffeine: DatedPoint[], recovery: DatedPoint[]): FusionCandidate | null {
  const pairs = alignByBucket(caffeine, recovery, { bucket: 'day', lag: 1, minPerBucket: 1 })
  const f = detectSeam(pairs, CAFFEINE_RECOVERY)
  if (!f) return null

  const hiMg = Math.round(f.aHi)
  const loMg = Math.round(f.aLo)
  const hiRec = Math.round(f.bHi) // recovery after the HIGH-caffeine days (the lower one)
  const loRec = Math.round(f.bLo) // recovery after the LIGHT days (the higher one)

  const key = 'lower the mornings after your heavier caffeine days'
  return {
    notice: {
      why: `Your recovery runs ${key}. After your higher-caffeine days (about ${hiMg} mg) your next-morning recovery averaged ${hiRec}%, after your lighter ones (about ${loMg} mg) it was ${loRec}%. Ease off the late, heavy hits and your mornings bounce back.`,
      key,
      receipts: [`${hiMg} mg days, ${hiRec}% recovery`, `${loMg} mg days, ${loRec}% recovery`],
    },
    watched: 'caffeine + recovery',
    score: { domains: ['caffeine', 'recovery'], r: f.r, n: f.n, contrast: relContrast(f.bHi, f.bLo) },
  }
}

/**
 * The caffeine -> next-morning recovery seam. Returns just the card notice (the scored
 * form for the selection engine is caffeineRecoveryCandidate). null when silent.
 */
export function caffeineRecoverySeam(caffeine: DatedPoint[], recovery: DatedPoint[]): FusionNotice | null {
  return caffeineRecoveryCandidate(caffeine, recovery)?.notice ?? null
}
