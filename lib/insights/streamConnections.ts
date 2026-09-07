/**
 * Stream connections — "Vee connects": the generic pairwise scan that links a
 * USER-BUILT tile stream (the report contract) to a core life outcome the user
 * never thought to compare it with. The user thinks they built a beer tracker;
 * Vee quietly finds "your heavier beer days show up in the next morning's
 * recovery" — with real receipts, or it says nothing at all.
 *
 * Built entirely on the shared, tested primitives (reportsToSeries ->
 * alignByBucket -> detectSeam -> rankInsights), so a tile stream is gated for
 * honesty exactly like every native seam. Because this is a pairwise SCAN
 * (many stream x outcome pairs, not one hand-built hypothesis), the gates are
 * raised above the single-seam defaults: more paired days, a stronger r, and
 * a real felt contrast — a scan must earn a claim harder than a hypothesis.
 *
 * Deterministic, zero LLM calls. Output is ranked; each stream keeps only its
 * single best outcome (never a wall of stats). connectionToCandidate adapts
 * the winner into the existing fusion slot (selectFusion -> NoticeFeedCard ->
 * noticed_ledger cooldowns), so surfacing costs zero new UI.
 *
 * Pure + IO-free + unit-tested (see __tests__/streamConnections.test.ts).
 * Copy is a correlation read, never a causation claim; no em dashes; `key` is
 * a verbatim substring of `why`, same invariants as fusion.ts / peakSeams.ts.
 */

import type { ReportKind, TileStreamRow, TileReportRow } from '@/lib/tiles/reportContract'
import { reportsToSeries } from '@/lib/tiles/tileInsight'
import { alignByBucket, type DatedPoint } from './align'
import { detectSeam, type SeamDir, type SeamFinding } from './seam'
import { rankInsights, relContrast, type ScoredInsight } from './correlationEngine'
import { patternKeyOf } from './noticedLedger'
import type { FusionCandidate } from './fusion'

/** One higher-is-better outcome series (recovery, sleep hours, mood, ...). */
export interface OutcomeDef {
  /** Ledger/domain name, e.g. 'recovery' (feeds patternKeyOf). */
  name: string
  /** Human label for copy, e.g. 'recovery'. */
  label: string
  points: DatedPoint[]
}

/** One stream's identity + raw report rows, straight off the tile tables. */
export interface StreamSeriesInput {
  def: TileStreamRow
  rows: TileReportRow[]
}

export interface StreamConnection {
  /** Order-independent ledger key, e.g. 'alcohol+recovery'. */
  patternKey: string
  canonicalKey: string
  streamLabel: string
  outcome: string
  lag: 0 | 1
  finding: SeamFinding
  score: ScoredInsight
  /** The warm, receipt-carrying one-liner (also the card's `why`). */
  line: string
  /** The verbatim substring of `line` the card highlights. */
  highlight: string
}

/** Scan gates — deliberately stricter than a hand-built seam's (6 / 0.45 / 0)
 *  because a pairwise scan gets many shots at being wrong. */
const SCAN_MIN_BUCKETS = 8
const SCAN_MIN_R = 0.5
const SCAN_MIN_CONTRAST = 0.15

/** The lag each kind tries FIRST (mirrors tileInsight's KIND_LAG): an intake
 *  today lands in tomorrow's body; everything else reads same-day first. */
const DEFAULT_LAG: Record<ReportKind, 0 | 1> = {
  intake: 1,
  count: 0,
  duration: 0,
  money: 0,
  rating: 0,
  measure: 0,
  done: 0,
}

/** The sign to expect vs a higher-is-better outcome: a 'down' habit should
 *  pull it down (neg), an 'up' habit should lift it (pos), unstated = any. */
function expectedDir(def: TileStreamRow): SeamDir {
  if (def.goalDirection === 'down') return 'neg'
  if (def.goalDirection === 'up') return 'pos'
  return 'any'
}

const strength = (s: ScoredInsight): number => Math.abs(s.r) * s.n * s.contrast
const round1 = (x: number): string => `${Math.round(x * 10) / 10}`

/** Phrase one confirmed link, warm and honest, receipts baked in. The numbers
 *  come straight from the half-split means, so the copy can never claim more
 *  than the data showed. */
function phrase(
  streamLabel: string,
  outcomeLabel: string,
  lag: 0 | 1,
  f: SeamFinding,
): { line: string; highlight: string } {
  const sl = streamLabel.toLowerCase()
  const hi = round1(f.bHi)
  const lo = round1(f.bLo)
  if (f.direction === 'neg') {
    const highlight =
      lag === 1 ? 'tend to show up the next morning' : 'tend to run lower on those same days'
    const line =
      lag === 1
        ? `Your heavier ${sl} days ${highlight}. Your ${outcomeLabel} averaged ${hi} after your bigger days and ${lo} after your lighter ones.`
        : `Your ${outcomeLabel} ${highlight}. On your bigger ${sl} days it averaged ${hi}, on your lighter ones ${lo}.`
    return { line, highlight }
  }
  const highlight = lag === 1 ? 'seems to pay off the next day' : 'rise together on the same days'
  const line =
    lag === 1
      ? `Your ${sl} ${highlight}. Your ${outcomeLabel} averaged ${hi} after your bigger days and ${lo} after your lighter ones.`
      : `Your ${sl} and your ${outcomeLabel} ${highlight}. It averaged ${hi} on your bigger days and ${lo} on your lighter ones.`
  return { line, highlight }
}

/** Try one stream x outcome at one lag; null unless every scan gate clears. */
function tryLag(
  stream: StreamSeriesInput,
  outcome: OutcomeDef,
  lag: 0 | 1,
  gates: { minBuckets: number; minR: number; minContrast: number },
): StreamConnection | null {
  const series = reportsToSeries(stream.rows, stream.def.kind)
  const pairs = alignByBucket(series.points, outcome.points, {
    bucket: 'day',
    lag,
    minPerBucket: 1,
  })
  const finding = detectSeam(pairs, {
    minBuckets: gates.minBuckets,
    minR: gates.minR,
    expectDir: expectedDir(stream.def),
    contrastA: 0,
    contrastB: 0,
  })
  if (!finding) return null

  const contrast = relContrast(finding.bHi, finding.bLo)
  if (contrast < gates.minContrast) return null

  const { line, highlight } = phrase(stream.def.label, outcome.label, lag, finding)
  return {
    patternKey: patternKeyOf([stream.def.canonicalKey, outcome.name]),
    canonicalKey: stream.def.canonicalKey,
    streamLabel: stream.def.label,
    outcome: outcome.name,
    lag,
    finding,
    score: {
      domains: [stream.def.canonicalKey, outcome.name],
      r: finding.r,
      n: finding.n,
      contrast,
    },
    line,
    highlight,
  }
}

/**
 * Scan every stream against every outcome and return the confirmed connections,
 * deepest-and-strongest first, at most ONE per stream (its best outcome). Each
 * pair is tried at the kind's default lag first, then the other lag; the
 * stronger passing read wins. Silent ([]) when nothing true is found.
 */
export function findStreamConnections(
  streams: StreamSeriesInput[],
  outcomes: OutcomeDef[],
  opts?: { minBuckets?: number; minR?: number; minContrast?: number },
): StreamConnection[] {
  const gates = {
    minBuckets: opts?.minBuckets ?? SCAN_MIN_BUCKETS,
    minR: opts?.minR ?? SCAN_MIN_R,
    minContrast: opts?.minContrast ?? SCAN_MIN_CONTRAST,
  }

  const bestByStream = new Map<string, StreamConnection>()
  for (const stream of streams) {
    for (const outcome of outcomes) {
      const first = DEFAULT_LAG[stream.def.kind]
      const other = first === 1 ? 0 : 1
      const a = tryLag(stream, outcome, first, gates)
      const b = tryLag(stream, outcome, other, gates)
      const winner =
        a && b ? (strength(a.score) >= strength(b.score) ? a : b) : (a ?? b)
      if (!winner) continue
      const cur = bestByStream.get(stream.def.canonicalKey)
      if (!cur || strength(winner.score) > strength(cur.score)) {
        bestByStream.set(stream.def.canonicalKey, winner)
      }
    }
  }
  return rankInsights([...bestByStream.values()].map((c) => ({ ...c.score, c }))).map(
    (r) => r.c,
  )
}

/** Adapt a connection into the existing fusion slot: selectFusion ranks it
 *  against the native seams and NoticeFeedCard renders it with zero new UI. */
export function connectionToCandidate(c: StreamConnection): FusionCandidate {
  return {
    notice: {
      why: c.line,
      key: c.highlight,
      receipts: [
        `bigger days: ${c.outcome} ${round1(c.finding.bHi)}`,
        `lighter days: ${c.outcome} ${round1(c.finding.bLo)}`,
      ],
    },
    watched: `${c.streamLabel.toLowerCase()} + ${c.outcome}`,
    score: c.score,
  }
}

/**
 * Compact chat-context lines (max 2 by default) so Vee can cite a verified
 * connection instead of inventing one. Evidence rides along so the model can
 * hedge honestly ("across 12 paired days").
 */
export function connectionContextLines(cs: StreamConnection[], max = 2): string[] {
  return cs
    .slice(0, Math.max(0, max))
    .map((c) => `${c.line} (${c.finding.n} paired days)`)
}
