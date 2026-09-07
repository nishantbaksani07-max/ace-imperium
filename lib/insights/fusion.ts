/**
 * Cross-domain fusion — the "how did it know" moat. Honest insights that link TWO
 * domains on aligned date keys. v1 ships ONE seam: sleep <-> training frequency,
 * because both halves are reliable + date-keyed server-side. Spending <-> weight
 * is deferred (net worth is a sparse weekly snapshot, no daily spend series yet).
 *
 * A false cross-domain claim is the worst possible failure, so the seam is gated
 * three ways and stays SILENT (null) unless all three clear together:
 *   1. enough paired weeks (>= 6 weeks, each with >= 3 real sleep nights),
 *   2. a real positive Pearson correlation (r >= 0.45, reusing the canonical
 *      `correlate` primitive — same one the MCP insight engine uses), and
 *   3. a felt contrast: the high-sleep weeks beat the low-sleep weeks by at least
 *      a full hour a night AND a full session a week.
 *
 * Pure + IO-free + unit-tested (see __tests__/fusion.test.ts). The copy is a
 * correlation read ("in the weeks you sleep more"), NEVER a causation claim. The
 * deep phrasing stays the "talk in Claude" golden-URL path; this is the short hook.
 */

import { correlate } from '@/mcp/src/insights'
import { relContrast, type ScoredInsight } from './correlationEngine'

/** One ISO week bucket: its mean sleep hours and its count of submitted workouts.
 *  The server joins by week (only weeks with >= 3 sleep nights logged). */
export interface SleepTrainWeek {
  wk: number
  sleepAvg: number
  sessions: number
}

export interface FusionNotice {
  why: string
  /** The phrase to highlight (verbatim substring of `why`). */
  key: string
  /** Real data chips for the §01 card (never invented). */
  receipts: string[]
}

/** A seam's full output: its card copy, an honest "watched" label, and the score the
 *  selection engine ranks on (and rarity reads). The shared contract every seam emits
 *  so a new domain pairing plugs into selectFusion with no extra wiring. */
export interface FusionCandidate {
  notice: FusionNotice
  watched: string
  score: ScoredInsight
}

const MIN_WEEKS = 6
const MIN_R = 0.45
const MIN_SLEEP_CONTRAST = 1.0 // hours a night
const MIN_SESSION_CONTRAST = 1.0 // sessions a week

const round1 = (x: number): string => `${Math.round(x * 10) / 10}`

/**
 * The sleep <-> training seam, scored for the selection engine. Returns a candidate
 * only when more sleep genuinely tracked with more training across enough weeks, with
 * a felt contrast. null otherwise (the §01 feed then falls back to its other sources).
 */
export function sleepWorkoutCandidate(weeks: SleepTrainWeek[]): FusionCandidate | null {
  const w = weeks.filter(
    (x) => Number.isFinite(x.sleepAvg) && x.sleepAvg > 0 && Number.isFinite(x.sessions) && x.sessions >= 0,
  )
  if (w.length < MIN_WEEKS) return null

  // 2) a real positive correlation (null if <3 pairs or either series is flat).
  const corr = correlate(w.map((x) => x.sleepAvg), w.map((x) => x.sessions))
  if (!corr || corr.r < MIN_R) return null

  // 3) a felt contrast: top-half sleep weeks vs bottom-half (an odd middle week
  //    sits out of both halves).
  const sorted = [...w].sort((a, b) => a.sleepAvg - b.sleepAvg)
  const half = Math.floor(sorted.length / 2)
  const low = sorted.slice(0, half)
  const high = sorted.slice(sorted.length - half)
  const mean = (arr: SleepTrainWeek[], f: (x: SleepTrainWeek) => number) =>
    arr.reduce((s, x) => s + f(x), 0) / arr.length
  const sleepHi = mean(high, (x) => x.sleepAvg)
  const sleepLo = mean(low, (x) => x.sleepAvg)
  const sessHi = mean(high, (x) => x.sessions)
  const sessLo = mean(low, (x) => x.sessions)
  if (sleepHi - sleepLo < MIN_SLEEP_CONTRAST) return null
  if (sessHi - sessLo < MIN_SESSION_CONTRAST) return null

  const hiH = round1(sleepHi)
  const loH = round1(sleepLo)
  const hiS = Math.round(sessHi)
  const loS = Math.round(sessLo)
  return {
    notice: {
      why: `You train more in the weeks you sleep more. Your better-sleep weeks (${hiH} h a night) averaged ${hiS} sessions, your short ones (${loH} h) only ${loS}. Protect your sleep and the gym follows.`,
      key: 'more in the weeks you sleep more',
      receipts: [`${hiH} h nights, ${hiS} sessions`, `${loH} h nights, ${loS} sessions`],
    },
    watched: 'sleep + training',
    score: { domains: ['sleep', 'training'], r: corr.r, n: corr.n, contrast: relContrast(sessHi, sessLo) },
  }
}

/**
 * The sleep <-> training seam. Returns just the card notice (the scored form for the
 * selection engine is sleepWorkoutCandidate). null when the link is not real.
 */
export function sleepWorkoutSeam(weeks: SleepTrainWeek[]): FusionNotice | null {
  return sleepWorkoutCandidate(weeks)?.notice ?? null
}

// ---------------------------------------------------------------------------
// Spending <-> sleep seam (finance x vitals). The second cross-domain seam,
// un-deferring finance now that a daily spend series exists (the Finance radar
// logs discretionary spend to finance_orders). The honest read: in the weeks a
// user sleeps LESS, they tend to spend MORE - a NEGATIVE correlation, phrased as
// association, never causation. Same three-gate discipline as sleep x training.
// ---------------------------------------------------------------------------

/** One ISO week bucket: its mean sleep hours and its total discretionary spend
 *  (canonical CHF outflows). The server joins by week, weeks with >= 3 sleep
 *  nights logged. */
export interface SleepSpendWeek {
  wk: number
  sleepAvg: number
  /** Total spend that week (CHF, outflows only). 0 is a real value (a no-spend week). */
  spend: number
}

const MIN_SPEND_CONTRAST = 0.2 // rested weeks must be >= 20% cheaper than short ones
const MIN_SPEND_WEEKS = 4 // enough weeks with real spend to claim a pattern

/**
 * The spending <-> sleep seam, scored for the selection engine. Fires only when
 * short-sleep weeks genuinely ran higher spend than rested weeks across enough
 * weeks, with a real negative correlation and a felt gap. null otherwise.
 */
export function spendSleepCandidate(weeks: SleepSpendWeek[]): FusionCandidate | null {
  const w = weeks.filter(
    (x) => Number.isFinite(x.sleepAvg) && x.sleepAvg > 0 && Number.isFinite(x.spend) && x.spend >= 0,
  )
  if (w.length < MIN_WEEKS) return null
  // Need enough weeks with actual spend, else the "pattern" is just empty weeks.
  if (w.filter((x) => x.spend > 0).length < MIN_SPEND_WEEKS) return null

  // A real NEGATIVE correlation: less sleep tracks with more spend.
  const corr = correlate(w.map((x) => x.sleepAvg), w.map((x) => x.spend))
  if (!corr || corr.r > -MIN_R) return null

  // Felt contrast: short-sleep half vs rested half (an odd middle week sits out).
  const sorted = [...w].sort((a, b) => a.sleepAvg - b.sleepAvg)
  const half = Math.floor(sorted.length / 2)
  const shortHalf = sorted.slice(0, half) // least sleep
  const restedHalf = sorted.slice(sorted.length - half) // most sleep
  const mean = (arr: SleepSpendWeek[], f: (x: SleepSpendWeek) => number) =>
    arr.reduce((s, x) => s + f(x), 0) / arr.length
  const sleepShort = mean(shortHalf, (x) => x.sleepAvg)
  const sleepRested = mean(restedHalf, (x) => x.sleepAvg)
  const spendShort = mean(shortHalf, (x) => x.spend)
  const spendRested = mean(restedHalf, (x) => x.spend)
  // A full hour of sleep separates the halves, and the rested weeks are cheaper.
  if (sleepRested - sleepShort < MIN_SLEEP_CONTRAST) return null
  if (spendRested <= 0) return null
  if (spendShort < spendRested * (1 + MIN_SPEND_CONTRAST)) return null

  const shortH = round1(sleepShort)
  const restedH = round1(sleepRested)
  const pctMore = Math.round((spendShort / spendRested - 1) * 100)
  return {
    notice: {
      why: `You spend more in the weeks you sleep less. Your short-sleep weeks (${shortH} h a night) ran about ${pctMore}% higher than your rested weeks (${restedH} h). Protect your sleep and the spending eases.`,
      key: 'more in the weeks you sleep less',
      receipts: [`${shortH} h nights, ${pctMore}% more spend`, `${restedH} h nights, the baseline`],
    },
    watched: 'sleep + spending',
    score: { domains: ['sleep', 'spending'], r: Math.abs(corr.r), n: corr.n, contrast: relContrast(spendShort, spendRested) },
  }
}

/** The spending <-> sleep seam card notice (scored form is spendSleepCandidate). */
export function spendSleepSeam(weeks: SleepSpendWeek[]): FusionNotice | null {
  return spendSleepCandidate(weeks)?.notice ?? null
}
