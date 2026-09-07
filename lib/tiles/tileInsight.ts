/**
 * Tile -> Vee bridge logic: turns a reported stream (the report contract) into
 * something the existing "Vitality noticed" engine already understands. This is
 * the piece that makes "the user thinks they built a beer tracker, but they
 * actually handed Vee a categorized life-stream" true, with zero per-tile code.
 *
 * `kind` is the whole trick. It decides:
 *   - how same-day datapoints collapse (intake/count/money/duration sum; rating
 *     means the felt score; measure keeps the last reading; done = did-it-at-all),
 *   - the lag against an outcome (an intake today shows up in TOMORROW's recovery),
 *   - and, with goalDirection, the sign Vee should expect (a "down" habit like
 *     alcohol should pull a higher-is-better outcome DOWN, so a positive link is
 *     refused, not phrased).
 *
 * It reuses the real engine primitives (toDailySeries, alignByBucket, detectSeam)
 * so a tile stream is gated for honesty exactly like every native domain. Pure +
 * IO-free + unit-tested (see __tests__/tileInsight.test.ts).
 */

import type { ReportKind, GoalDirection, TileReportRow } from './reportContract'
import { toDailySeries, type DomainSeries } from '@/lib/insights/series'
import { alignByBucket, type DatedPoint, type Agg } from '@/lib/insights/align'
import { detectSeam, type SeamConfig, type SeamDir, type SeamFinding } from '@/lib/insights/seam'
import { relContrast, type ScoredInsight } from '@/lib/insights/correlationEngine'

/** How each kind collapses multiple same-day logs into one daily value. */
const KIND_AGG: Record<ReportKind, Agg> = {
  intake: 'sum',
  count: 'sum',
  duration: 'sum',
  money: 'sum',
  rating: 'mean',
  measure: 'last',
  done: 'max',
}

/** Days an outcome trails the stream. An intake today lands in tomorrow's body;
 *  everything else is read same-day until we learn otherwise. */
const KIND_LAG: Record<ReportKind, number> = {
  intake: 1,
  count: 0,
  duration: 0,
  money: 0,
  rating: 0,
  measure: 0,
  done: 0,
}

/** Collapse a stream's raw datapoints into one clean daily series, the kind
 *  choosing the aggregation. Tiles are logged day to day, so density is 'daily'. */
export function reportsToSeries(rows: TileReportRow[], kind: ReportKind): DomainSeries {
  return toDailySeries(
    rows.map((r) => ({ date: r.date, value: r.value })),
    { density: 'daily', agg: KIND_AGG[kind] },
  )
}

/** The sign Vee should expect between a stream and a higher-is-better outcome
 *  (like recovery). A "down" habit hurting the outcome is a negative link. */
function expectedDir(goalDirection: GoalDirection | null | undefined): SeamDir {
  if (goalDirection === 'down') return 'neg'
  if (goalDirection === 'up') return 'pos'
  return 'any'
}

export interface StreamSeam extends ScoredInsight {
  finding: SeamFinding
  /** The stream's canonical family (e.g. 'alcohol') and the outcome it links to. */
  streamKey: string
  outcome: string
}

/**
 * Test one reported stream against an outcome series (e.g. recovery), returning a
 * gated insight ONLY when the link is real, or null (Vee stays quiet). `outcome`
 * is treated as higher-is-better, so goalDirection sets the expected sign.
 */
export function seamForStream(
  stream: {
    rows: TileReportRow[]
    kind: ReportKind
    goalDirection?: GoalDirection | null
    canonicalKey: string
  },
  outcome: { points: DatedPoint[]; name: string },
  opts?: { minBuckets?: number; minR?: number },
): StreamSeam | null {
  const series = reportsToSeries(stream.rows, stream.kind)
  const pairs = alignByBucket(series.points, outcome.points, {
    bucket: 'day',
    lag: KIND_LAG[stream.kind],
    minPerBucket: 1,
    aggA: 'mean',
    aggB: 'mean',
  })

  const cfg: SeamConfig = {
    minBuckets: opts?.minBuckets ?? 6,
    minR: opts?.minR ?? 0.5,
    expectDir: expectedDir(stream.goalDirection),
    // Strength + evidence + correct-direction half-split carry the honesty gate at
    // v1; absolute felt-contrast thresholds are per-kind tuning for later.
    contrastA: 0,
    contrastB: 0,
  }

  const finding = detectSeam(pairs, cfg)
  if (!finding) return null

  return {
    domains: [stream.canonicalKey, outcome.name],
    r: finding.r,
    n: finding.n,
    contrast: relContrast(finding.bHi, finding.bLo),
    finding,
    streamKey: stream.canonicalKey,
    outcome: outcome.name,
  }
}

/* --------------------------------------------------------------------------
 * Per-tile "what Vee noticed": the single deterministic line a tile shows on
 * its own, from its OWN report history (no outcome, no cross-domain seam). It
 * reads the same daily series every other read side reads (reportsToSeries), so
 * the number on a tile can never disagree with the number in the score or chat.
 *
 * It is intentionally honest and gentle: 0/1/2 logged days get a warm "just
 * getting started" line, never a fabricated trend, and it never divides by an
 * empty window. Every line is grounded in a real number the user can point at.
 *
 * Color LAW (a Vitality hard rule): tone is only ever 'good' (azure-mint),
 * 'caution' (amber), or 'neutral'. There is no red. A move in the wrong
 * direction is surfaced as a gentle caution, never an alarm, and a bad
 * direction is never dressed up as good.
 * ------------------------------------------------------------------------ */

/** Warm, never-red tone for a per-tile insight. */
export type InsightTone = 'good' | 'caution' | 'neutral'

/** One deterministic line a tile shows from its own report history. `tone`
 *  drives the accent (good -> azure-mint, caution -> amber, neutral -> muted);
 *  never red. `kind` labels which shape of read produced the line, for tests
 *  and for callers that want an icon. `stat` is the load-bearing number that
 *  earned the line (streak length, percent change, days logged). */
export interface TileInsight {
  text: string
  tone: InsightTone
  kind: 'streak' | 'trend' | 'consistency' | 'starting' | 'quiet'
  stat: number
}

/** A tile's own history: its report rows, how they collapse (kind), and what
 *  "good" looks like (goalDirection). Same shape the score contributor reads. */
export interface TileHistory {
  rows: TileReportRow[]
  kind: ReportKind
  goalDirection?: GoalDirection | null
}

const round = (x: number): number => Math.round(x)
const meanOf = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)

/** Standard deviation of a window; 0 for a window of 0 or 1 (no spread yet). */
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = meanOf(xs)
  const variance = xs.reduce((s, x) => s + (x - m) * (x - m), 0) / xs.length
  return Math.sqrt(variance)
}

/** Is a day's value "engaged" for this kind? A logged rating/measure counts as
 *  engaged at any value (you stepped on the scale); the summing kinds count
 *  when there is something to sum; a 'done' day counts when it was done. */
function isActive(kind: ReportKind, value: number): boolean {
  if (kind === 'rating' || kind === 'measure') return Number.isFinite(value)
  if (kind === 'done') return value >= 1
  return value > 0
}

/** Signed percent change old -> new, guarding an empty or zero baseline. Returns
 *  null when there is no honest baseline to compare against (avoids /0 and a
 *  meaningless "up infinity"). */
function pctChange(oldMean: number, newMean: number): number | null {
  if (!Number.isFinite(oldMean) || oldMean === 0) return null
  return ((newMean - oldMean) / Math.abs(oldMean)) * 100
}

/** Does a smaller number read as "better" for this stream? A 'down' goal (spend,
 *  screen time, alcohol) improves as it falls; 'up' improves as it rises; a
 *  rating/measure with no goal is neutral (a trend is reported, never judged). */
function lowerIsBetter(dir: GoalDirection | null | undefined): boolean | null {
  if (dir === 'down') return true
  if (dir === 'up') return false
  return null // neutral: report the move, do not call it good or bad
}

/**
 * The deterministic per-tile line. Reads the tile's OWN report history and
 * returns the single most worth-saying thing about it, or a gentle starting/
 * quiet line when there is not enough to say. Pure, never throws, never red.
 *
 * Priority (most specific, most motivating first):
 *   1. an active streak worth naming,
 *   2. a real trend over the logged window (good or caution),
 *   3. a steadiness read ("steadiest stretch yet"),
 *   4. else an honest "just getting started" / "one day in" line.
 */
export function tileInsight(history: TileHistory): TileInsight {
  const { kind, goalDirection } = history
  const series = reportsToSeries(history.rows, kind)
  const points = series.points // date-sorted, one per day, collapsed by kind
  const n = points.length

  // --- Sparse data: honest, gentle, never a fabricated trend. ---
  if (n === 0) {
    return { text: 'Nothing logged yet. Your first entry starts the story.', tone: 'neutral', kind: 'quiet', stat: 0 }
  }
  if (n === 1) {
    return { text: 'One day in. Log tomorrow and Vee starts spotting your pattern.', tone: 'good', kind: 'starting', stat: 1 }
  }
  if (n === 2) {
    return { text: 'Two days logged. A few more and the trend shows up here.', tone: 'good', kind: 'starting', stat: 2 }
  }

  const values = points.map((p) => p.value)
  const lowerBetter = lowerIsBetter(goalDirection)

  // --- Streak: consecutive most-recent days that "count", ending at the last
  // logged day. A streak is only the headline where it is genuinely motivating:
  //   - a 'down' goal, where a run of CLEAN (zero) days is the win, or
  //   - a 'done' habit, where each day is simply did-it-or-not.
  // For magnitude kinds (count/intake/duration/money/rating/measure) the trend
  // and steadiness reads below carry the story, so "you logged N days" never
  // pre-empts the more specific "up 12% this fortnight". ---
  const cleanStreakGoal = goalDirection === 'down'
  const streaksApply = cleanStreakGoal || kind === 'done'
  const dayCounts = (v: number): boolean => (cleanStreakGoal ? v === 0 : isActive(kind, v))

  let streak = 0
  if (streaksApply) {
    for (let i = points.length - 1; i >= 0; i--) {
      if (dayCounts(points[i].value)) streak++
      else break
    }
  }
  // Best streak anywhere in the history, so "your best run yet" is honest.
  let bestStreak = 0
  if (streaksApply) {
    let run = 0
    for (const p of points) {
      if (dayCounts(p.value)) {
        run++
        if (run > bestStreak) bestStreak = run
      } else {
        run = 0
      }
    }
  }

  if (streaksApply && streak >= 3) {
    const noun = cleanStreakGoal ? 'clean day' : 'day'
    const plural = streak === 1 ? noun : `${noun}s`
    const isBest = streak === bestStreak && streak > 3
    const tail = isBest ? ', your best run yet' : ''
    const text = cleanStreakGoal
      ? `${streak} ${plural} in a row${tail}. Nicely held.`
      : `${streak} ${plural} in a row${tail}. Keep it rolling.`
    return { text, tone: 'good', kind: 'streak', stat: streak }
  }

  // --- Trend: compare the recent half against the older half of the logged
  // window (by count, so gaps do not fake a slope). Needs a real baseline. ---
  const half = Math.floor(n / 2)
  const older = values.slice(0, half)
  const recent = values.slice(n - half)
  const oldMean = meanOf(older)
  const newMean = meanOf(recent)
  const pct = pctChange(oldMean, newMean)

  if (pct != null && Math.abs(pct) >= 10) {
    const rising = pct > 0
    const magnitude = round(Math.abs(pct))
    // Tone by goal: for neutral streams a move is reported, not judged (good is
    // reserved for a move that is actually good). Never red -> a wrong-way move
    // is a gentle caution.
    let tone: InsightTone
    if (lowerBetter === null) {
      tone = 'neutral'
    } else {
      const goodMove = lowerBetter ? !rising : rising
      tone = goodMove ? 'good' : 'caution'
    }
    const dirWord = rising ? 'up' : 'down'
    let text: string
    if (tone === 'good') {
      text = `Trending the right way, ${dirWord} ${magnitude}% across your last ${n} days.`
    } else if (tone === 'caution') {
      text = `Drifting ${dirWord} ${magnitude}% over your last ${n} days. Worth a look.`
    } else {
      text = `${rising ? 'Up' : 'Down'} ${magnitude}% across your last ${n} days.`
    }
    return { text, tone, kind: 'trend', stat: rising ? magnitude : -magnitude }
  }

  // --- Consistency: a steadiness read when the recent window is tight relative
  // to its level. "Steadiest stretch yet" when the recent half is calmer than
  // the older half. Coefficient of variation guards scale. ---
  const recentSpread = stdev(recent)
  const olderSpread = stdev(older)
  const level = meanOf(recent)
  const cv = level !== 0 ? recentSpread / Math.abs(level) : recentSpread
  if (cv <= 0.15 && recent.length >= 3) {
    const steadier = recentSpread < olderSpread
    const text = steadier
      ? 'Steadiest stretch yet, holding right around your usual.'
      : 'Holding steady, right around your usual.'
    return { text, tone: 'good', kind: 'consistency', stat: n }
  }

  // --- Enough data, but no headline pattern: a calm, true summary. ---
  return { text: `${n} days logged and holding. Keep it going and Vee will call the trend.`, tone: 'neutral', kind: 'quiet', stat: n }
}
