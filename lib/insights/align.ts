/**
 * Alignment — Stage 2 of the cross-domain "Vitality noticed" engine. The one
 * primitive that takes two date-keyed daily series and returns the aligned numeric
 * pairs `correlate()` needs. Every cross-domain seam (sleep x training, caffeine x
 * recovery, spend x training, ...) buckets through here, so the bucketing math
 * lives in exactly one tested place instead of inlined per seam.
 *
 * Pure + IO-free + unit-tested (see __tests__/align.test.ts). Day arithmetic is
 * done on whole UTC day-indexes derived from the date-only keys (the same approach
 * as lib/insights/goalGuide's dayIdx), so it is deterministic and never drifts.
 */

/** A daily series point: a local YYYY-MM-DD key and its numeric value. */
export interface DatedPoint {
  key: string
  value: number
}

export type Bucket = 'day' | 'week'
/** How multiple raw points landing in one bucket collapse to its value. */
export type Agg = 'mean' | 'sum' | 'count' | 'last' | 'max'

export interface AlignOpts {
  bucket: Bucket
  /** Days series B is shifted LATER than A before aligning. lag:1 pairs A's day N
   *  with B's day N+1 (a caffeine day with the NEXT morning's recovery). Default 0. */
  lag?: number
  /** Min raw points a bucket must hold to count (the ">=3 sleep nights a week"
   *  rule, generalized). A bucket with fewer is dropped from both sides. Default 1. */
  minPerBucket?: number
  /** How A's / B's raw points collapse within a bucket. Default 'mean'. */
  aggA?: Agg
  aggB?: Agg
}

const DAY_MS = 86_400_000

/** Whole UTC day index for a YYYY-MM-DD key (differences only). null on a bad key. */
function dayIndex(key: string): number | null {
  const t = Date.parse(`${key}T00:00:00Z`)
  return Number.isFinite(t) ? Math.round(t / DAY_MS) : null
}

/** The bucket id a day-index falls in: itself for 'day', its epoch-week for 'week'. */
function bucketId(dayIdx: number, bucket: Bucket): number {
  return bucket === 'week' ? Math.floor(dayIdx / 7) : dayIdx
}

function aggregate(values: number[], mode: Agg): number {
  switch (mode) {
    case 'sum': return values.reduce((s, v) => s + v, 0)
    case 'count': return values.length
    case 'last': return values[values.length - 1]
    case 'max': return Math.max(...values)
    case 'mean':
    default: return values.reduce((s, v) => s + v, 0) / values.length
  }
}

/**
 * Align two daily series into ordered numeric pairs, one per bucket the two share.
 * B is shifted earlier by `lag` days first (so a +1 lag joins B's next day onto A's
 * day), both series are bucketed + aggregated, buckets under `minPerBucket` raw
 * points are dropped, and only buckets present on BOTH sides survive. The result is
 * ready to hand straight to `correlate()`.
 */
export function alignByBucket(a: DatedPoint[], b: DatedPoint[], opts: AlignOpts): [number, number][] {
  const { bucket, lag = 0, minPerBucket = 1, aggA = 'mean', aggB = 'mean' } = opts

  const toBuckets = (pts: DatedPoint[], shiftDays: number, mode: Agg): Map<number, number> => {
    const groups = new Map<number, number[]>()
    for (const p of pts) {
      const di = dayIndex(p.key)
      if (di == null || !Number.isFinite(p.value)) continue
      const id = bucketId(di - shiftDays, bucket)
      const arr = groups.get(id)
      if (arr) arr.push(p.value)
      else groups.set(id, [p.value])
    }
    const out = new Map<number, number>()
    for (const [id, vals] of groups) {
      if (vals.length >= minPerBucket) out.set(id, aggregate(vals, mode))
    }
    return out
  }

  const aMap = toBuckets(a, 0, aggA)
  const bMap = toBuckets(b, lag, aggB)
  const pairs: [number, number][] = []
  for (const id of [...aMap.keys()].sort((x, y) => x - y)) {
    const bv = bMap.get(id)
    if (bv != null) pairs.push([aMap.get(id) as number, bv])
  }
  return pairs
}
