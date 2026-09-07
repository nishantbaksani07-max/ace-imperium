/**
 * Tiles contributor for the Vitality Score — the piece that makes every
 * user-built tile feed the ONE daily orb number, with zero per-tile code.
 *
 * A tile reports one numeric life-stream via Vitality.report() (the report
 * contract, lib/tiles/reportContract.ts). This contributor turns ALL of a
 * user's streams into ONE score slice ("Tiles"), so tiles together weigh
 * exactly as much as Train and exactly as much as Fuel — a user with fifteen
 * tiles can never drown the core routine. Inside the slice, streams average
 * equally.
 *
 * Two scoring modes, chosen from kind + goalDirection (modeOf):
 *   - magnitude: the day's value vs the user's OWN trailing-28 median (no
 *     user-set target needed). Direction 'up' rewards hitting your usual;
 *     direction 'down' (alcohol) rewards clean days and never turns your
 *     usual into a zero (BASELINE_SCORE keeps "same as always" neutral-ish).
 *   - cadence: showing up IS the win (done/measure/neutral streams). Scored
 *     as report days this week vs the stream's own implied weekly cadence,
 *     exactly the Train frequency precedent — rest days are never punished.
 *
 * Two eligibility gates keep the orb honest and kind:
 *   - established: >= ESTABLISHED_MIN_DAYS report days in the trailing 28. A
 *     day-one stream is silently excluded, so a brand-new tile never tanks
 *     the score on launch day.
 *   - engaged: >= 1 report in the trailing 7, else the stream is dormant and
 *     excluded. Going quiet is the DRIFT engine's job (lib/goals/drift.ts) —
 *     the score never punishes the same silence twice.
 *
 * Pure math + fixtures-testable (see __tests__/tileStreamsScore.test.ts);
 * the Supabase reads live only inside the Contributor at the bottom.
 */
import { getLocalDateKey, getRecentDateKeys } from '@/lib/dates'
import {
  weightedBlend,
  type Contributor,
  type ContributorResult,
  type ScoreContext,
} from '@/lib/vitality/score'
import {
  groupReportRows,
  type ReportKind,
  type GoalDirection,
  type TileStreamRow,
  type TileReportRow,
} from '@/lib/tiles/reportContract'
import { reportsToSeries } from '@/lib/tiles/tileInsight'

/** Report days in the trailing 28 a stream needs before it can be scored. */
export const ESTABLISHED_MIN_DAYS = 5

/** For a direction-'down' stream, the day score at exactly your usual amount.
 *  Your median day is never a zero (that would punish honesty), just a gentle
 *  "about usual"; a clean day is 1.0 and double your usual is 0. */
export const BASELINE_SCORE = 0.65

export type StreamMode = 'magnitude' | 'cadence'

/** One stream's window of daily values, already collapsed per day by its
 *  kind's aggregation (KIND_AGG via reportsToSeries). */
export interface StreamWindow {
  def: TileStreamRow
  byDay: Map<string, number>
}

/** One scored stream — the per-stream slice inside the Tiles contributor. */
export interface StreamScore {
  key: string
  canonicalKey: string
  label: string
  mode: StreamMode
  blended: number
  today: number
  last7Avg: number
  earliestDataKey: string | null
}

/**
 * Which scoring mode a stream earns from its kind + goalDirection.
 * 'done' and 'measure' are always cadence: a did-it flag has no magnitude,
 * and a body measurement is never judged good or bad — showing up to track
 * IS the win. Everything else needs a stated direction to be judged on
 * magnitude; without one we only score the habit of logging.
 */
export function modeOf(kind: ReportKind, dir: GoalDirection | null | undefined): StreamMode {
  if (kind === 'done' || kind === 'measure') return 'cadence'
  if (dir === 'up' || dir === 'down') return 'magnitude'
  return 'cadence'
}

/** Median of the values logged on the window's report days, plus the count.
 *  null when the window holds no reports at all. Median (not mean) so one
 *  wild day cannot move the user's own baseline. */
export function baselineOf(
  byDay: Map<string, number>,
  windowKeys: string[],
): { b: number; reportDays: number } | null {
  const vals: number[] = []
  for (const k of windowKeys) {
    const v = byDay.get(k)
    if (v != null && Number.isFinite(v)) vals.push(v)
  }
  if (vals.length === 0) return null
  const sorted = [...vals].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const b = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  return { b, reportDays: vals.length }
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))

/**
 * Score one magnitude day against the user's own baseline `b`.
 *   up:   hitting your usual = 1.0, more is capped (never gamified).
 *   down: clean day = 1.0, your usual = BASELINE_SCORE, double your usual = 0.
 * Edge b<=0: an 'up' day only scores when something was logged; a 'down' day
 * against a zero baseline scores any amount as a gentle miss, never a crater.
 */
export function scoreDay(v: number, b: number, dir: 'up' | 'down'): number {
  if (dir === 'up') {
    if (b <= 0) return v > 0 ? 1 : 0
    return clamp01(v / b)
  }
  // dir === 'down'
  if (v <= 0) return 1
  if (b <= 0) return 1 - BASELINE_SCORE // 0.35: worse than usual, never a crater
  if (v <= b) return 1 - (1 - BASELINE_SCORE) * (v / b)
  return clamp01(BASELINE_SCORE * (1 - (v - b) / b))
}

/**
 * Score one stream over the trailing window, or null when it is not scoreable
 * (not yet established, or dormant this week). `windowKeys` is index 0 = today,
 * at least 28 keys (callers pass 35 so the byDay map can carry spillover).
 */
export function scoreStream(win: StreamWindow, windowKeys: string[]): StreamScore | null {
  const keys7 = windowKeys.slice(0, 7)
  const keys28 = windowKeys.slice(0, 28)

  const base = baselineOf(win.byDay, keys28)
  if (!base || base.reportDays < ESTABLISHED_MIN_DAYS) return null // not established

  const reportDays7 = keys7.filter((k) => win.byDay.has(k)).length
  if (reportDays7 === 0) return null // dormant — drift's job, not the score's

  const inWindow = keys28.filter((k) => win.byDay.has(k))
  const earliestDataKey = inWindow.length
    ? inWindow.reduce((a, b2) => (a < b2 ? a : b2))
    : null

  const mode = modeOf(win.def.kind, win.def.goalDirection)

  if (mode === 'magnitude') {
    const dir = win.def.goalDirection as 'up' | 'down'
    // A missing day on a 'down' stream from an engaged logger is a genuinely
    // clean day (occurrence logs go silent when nothing happened); on an 'up'
    // stream a missing day is unknown, skipped by weightedBlend, never a zero.
    const dayScores: Array<number | null> = keys7.map((k) => {
      const v = win.byDay.get(k)
      if (v == null) return dir === 'down' ? 1 : null
      return scoreDay(v, base.b, dir)
    })
    const blended = weightedBlend(dayScores)
    const real = dayScores.filter((s): s is number => s != null)
    const last7Avg = real.length ? real.reduce((a, x) => a + x, 0) / real.length : 0
    return {
      key: win.def.key,
      canonicalKey: win.def.canonicalKey,
      label: win.def.label,
      mode,
      blended,
      today: dayScores[0] ?? 0,
      last7Avg,
      earliestDataKey,
    }
  }

  // cadence — the stream's own implied weekly rhythm, Train's precedent:
  // blended is the flat weekly rate and last7Avg mirrors it (flat trend).
  const expectedPerWeek = Math.max(1, Math.min(7, Math.round(base.reportDays / 4)))
  const rate = Math.min(1, reportDays7 / expectedPerWeek)
  return {
    key: win.def.key,
    canonicalKey: win.def.canonicalKey,
    label: win.def.label,
    mode,
    blended: rate,
    today: win.byDay.has(keys7[0]) ? 1 : 0,
    last7Avg: rate,
    earliestDataKey,
  }
}

/**
 * Combine all scoreable streams into the single Tiles contributor slice —
 * equal-weight mean inside the one slot. null when nothing is scoreable
 * (the contributor then reads as inactive, never as a zero).
 */
export function combineStreamScores(scores: StreamScore[]): ContributorResult | null {
  if (scores.length === 0) return null
  const mean = (f: (s: StreamScore) => number): number =>
    scores.reduce((a, s) => a + f(s), 0) / scores.length
  const earliestKeys = scores
    .map((s) => s.earliestDataKey)
    .filter((k): k is string => !!k)
  return {
    key: 'tiles',
    label: 'Tiles',
    blended: mean((s) => s.blended),
    today: mean((s) => s.today),
    last7Avg: mean((s) => s.last7Avg),
    earliestDataKey: earliestKeys.length
      ? earliestKeys.reduce((a, b) => (a < b ? a : b))
      : null,
  }
}

/** Group raw report rows into per-stream daily windows, each collapsed by its
 *  kind's aggregation. Joining lives in groupReportRows (PATCH21): a report
 *  follows its streamId, so two tiles sharing a key never merge or double-
 *  count. Rows with no stream definition are dropped. */
export function buildStreamWindows(
  streams: TileStreamRow[],
  reports: TileReportRow[],
): StreamWindow[] {
  return groupReportRows(streams, reports).map(({ def, rows }) => {
    const series = reportsToSeries(rows, def.kind)
    return { def, byDay: new Map(series.points.map((p) => [p.key, p.value])) }
  })
}

// ---------------------------------------------------------------------------
// The Contributor — the only IO in this file. Same double-fetch shape as the
// Train contributor: isActive proves there is something scoreable, evaluate
// refetches and scores. Both throw-safe via runContributors' safety net.
// ---------------------------------------------------------------------------

const WINDOW_DAYS = 35

async function fetchAndScore(ctx: ScoreContext): Promise<StreamScore[]> {
  const keys = getRecentDateKeys(getLocalDateKey(), WINDOW_DAYS)

  const { data: streamRows } = await ctx.supabase
    .from('tile_streams')
    .select('id, tile_id, key, canonical_key, label, kind, goal_direction')
    .eq('user_id', ctx.userId)
  if (!streamRows || streamRows.length === 0) return []

  const { data: reportRows } = await ctx.supabase
    .from('tile_reports')
    .select('stream_id, stream_key, value, date')
    .eq('user_id', ctx.userId)
    .gte('date', keys[keys.length - 1])

  const streams: TileStreamRow[] = streamRows.map((r) => ({
    id: String(r.id),
    tileId: (r.tile_id ?? '') as string,
    key: r.key as string,
    canonicalKey: r.canonical_key as string,
    label: r.label as string,
    kind: r.kind as ReportKind,
    goalDirection: (r.goal_direction ?? null) as GoalDirection | null,
  }))
  const reports: TileReportRow[] = (reportRows ?? []).map((r) => ({
    streamId: r.stream_id ? String(r.stream_id) : undefined,
    streamKey: r.stream_key as string,
    value: Number(r.value),
    date: String(r.date).slice(0, 10),
  }))

  return buildStreamWindows(streams, reports)
    .map((w) => scoreStream(w, keys))
    .filter((s): s is StreamScore => s != null)
}

export const tileStreamsContributor: Contributor = {
  key: 'tiles',
  label: 'Tiles',

  async isActive(ctx: ScoreContext): Promise<boolean> {
    return (await fetchAndScore(ctx)).length > 0
  },

  async evaluate(ctx: ScoreContext): Promise<ContributorResult> {
    const combined = combineStreamScores(await fetchAndScore(ctx))
    if (!combined) throw new Error('no scoreable tile streams')
    return combined
  },
}
