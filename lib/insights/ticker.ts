/**
 * Pure goal-ticker derivation for the "Vitality noticed" surface.
 *
 * Turns a user's goals + real module data into honest per-goal trend rows. The
 * locked rule: a measured number ONLY when a real metric backs it (weight rate
 * from weigh-ins, training cadence from logged workouts). When nothing backs a
 * goal, we return a warm "log X" hint and NO number — the card promises "this is
 * not a magic sentence", so we never invent one.
 *
 * IO-free + unit-tested (see __tests__/veeNoticedTicker.test.ts).
 */

import { matchGoalToLift } from '@/lib/oracle/goalMatch'
import { inferBodyDirection } from '@/lib/goals/direction'

/** One trained lift's top-set progression, mirroring mcp `getLiftProgression`. */
export interface TickerLift {
  id: string
  name: string
  /** Top-set weight per session; any order (we sort by date). */
  sessions: { date: string; topWeight: number }[]
}

/** One user-built tile stream's drawable series, for override-bound goals. */
export interface TickerStream {
  canonicalKey: string
  label: string
  /** What "good" looks like for this stream ('down' = less is better). */
  goalDirection: 'up' | 'down' | 'neutral' | null
  /** Real logged points, any order (we sort by date). */
  points: { date: string; value: number }[]
}

export interface TickerInput {
  goals: {
    id: string; title: string; cleanTitle: string | null; category: string | null
    /** "What steers this" (TRAIN 4): the user's own pick wins over auto-binding.
     *  A guide module name or 'stream:<canonical_key>'; null/absent = Vee decides. */
    bindingOverride?: string | null
  }[]
  /** A window of weigh-ins, any order. */
  weighIns: { date: string; kg: number }[]
  /** The user's body-composition direction from their profile, if any. */
  goalDirection: 'lose' | 'gain' | 'maintain' | null
  /** Submitted workout dates within the last 21 days. */
  workoutDatesLast21: string[]
  /** The lifts the user actually trains, for the specific-lift headline graph. */
  lifts: TickerLift[]
  /** The user's own tile streams, so an override can bind a goal to one. */
  streams?: TickerStream[]
}

export type TrendState = 'on-track' | 'holding' | 'drifting' | 'unknown'

export interface TickerRow {
  id: string
  title: string
  state: TrendState
  /** The honest measured value (e.g. "-1.0%/wk", "1.7x/wk"). null when no metric backs it. */
  detail: string | null
  /** A small series for the sparkline (oldest to newest). Empty when there's nothing to draw. */
  spark: number[]
  /** The real YYYY-MM-DD date of each spark point (parallel to `spark`), when the
   *  series has per-point dates (weight / lift / stream). Absent for the training
   *  cadence buckets, whose points are whole weeks, not days. Feeds the fullscreen
   *  graph's date axis: real labels only, never invented. */
  sparkDates?: string[]
  /** A warm "log X" nudge, set ONLY when there's no metric (so the UI never shows a fake number). */
  hint: string | null
  metric: 'weight' | 'training' | 'lift' | 'stream' | null
}

// Word-bound alternations only: "Close more deals" must never bind weigh-ins via
// the 'lose' inside 'Close', and "Launch my brunch cafe" must never read as
// training via a bare 'run' (mirrors lib/goals/categories.ts, which deliberately
// uses running|marathon instead of bare 'run' so "run a business" isn't fitness).
// Two-tier, mirroring goalGuide: STRONG words name the body unambiguously and
// bind for any body-eligible category; LOOSE everyday verbs (lose / cut / gain)
// bind ONLY when the category itself is body-shaped (fitness / health), so a
// 'general' or not-yet-triaged "gain confidence" never earns the bathroom scale.
const WEIGHT_STRONG_RE = /\b(lean(er)?|weight|fat|bulk(ing)?|lighter|shred(ded|ding)?|body ?comp(osition)?|body ?weight)\b/i
const WEIGHT_LOOSE_RE = /\b(lose|losing|lost|cut(ting)?|gain(ing|s)?)\b/i
const WEIGHT_LOOSE_CATS = new Set(['fitness', 'health'])
const FITNESS_RE = /\b(train(ing|s|ed)?|gym|lift(ing|s)?|workouts?|running|jog(ging)?|marathon|5 ?k|fitness|strong(er)?|muscles?|cardio)\b/i

/** Categories whose goals may NEVER be bound to body-weight or training data.
 *  A money / career / craft / people / audience / mind goal gets no weigh-in
 *  sparkline and no lift trend, full stop — a "Gain 1,000 subscribers" goal must
 *  never be marked drifting by the bathroom scale. fitness / health / general /
 *  uncategorized goals stay eligible, and still need a strong word-bound body
 *  signal (or the fitness category) to actually bind. */
const NON_BODY_CATS = new Set(['money', 'career', 'craft', 'people', 'audience', 'mind'])

/** Whole-day index for a 'YYYY-MM-DD' key (days since epoch, UTC) — used only for differences. */
function dayIndex(dateKey: string): number | null {
  const t = Date.parse(`${dateKey}T00:00:00Z`)
  return Number.isFinite(t) ? Math.round(t / 86_400_000) : null
}

/**
 * Least-squares slope of weight over time, expressed as kg/week — far steadier
 * than (latest − oldest). Returns null unless there are >= 2 weigh-ins spanning
 * >= 2 distinct days. Order-independent. (Ported from the MCP insight engine.)
 */
export function weeklyWeightRate(
  entries: { date: string; kg: number }[],
): { kgPerWeek: number; n: number } | null {
  const pts = entries
    .map((e) => ({ x: dayIndex(e.date), y: e.kg }))
    .filter((p): p is { x: number; y: number } => p.x != null && Number.isFinite(p.y))
  if (pts.length < 2) return null

  const xs = pts.map((p) => p.x)
  const span = Math.max(...xs) - Math.min(...xs)
  if (span === 0) return null // all on one day — no slope

  const n = pts.length
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = pts.reduce((a, p) => a + p.y, 0) / n
  let num = 0
  let den = 0
  for (const p of pts) {
    num += (p.x - meanX) * (p.y - meanY)
    den += (p.x - meanX) ** 2
  }
  if (den === 0) return null
  return { kgPerWeek: Math.round((num / den) * 7 * 100) / 100, n }
}

function weightPoints(weighIns: { date: string; kg: number }[]): { date: string; kg: number }[] {
  return [...weighIns]
    .filter((w) => Number.isFinite(w.kg))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function weightSpark(weighIns: { date: string; kg: number }[]): number[] {
  return weightPoints(weighIns).map((w) => w.kg)
}

function trainingSpark(dates: string[], today: number): number[] {
  const weeks = [0, 0, 0] // [oldest, mid, newest]
  for (const d of dates) {
    const di = dayIndex(d)
    if (di == null) continue
    const ago = today - di
    if (ago < 0 || ago > 20) continue
    const bucket = ago <= 6 ? 2 : ago <= 13 ? 1 : 0
    weeks[bucket]++
  }
  return weeks
}

/** Trim a stream value for the detail read ("92.5", "12"). */
function fmtVal(n: number): string {
  return String(Math.round(n * 100) / 100)
}

/** A goal bound (by override) to one of the user's own tile streams: draw that
 *  stream's real points. Honest fallback when the stream is missing or thin. */
function streamRow(
  id: string, title: string, key: string, streams: TickerStream[],
): TickerRow {
  const stream = streams.find((s) => s.canonicalKey === key) ?? null
  const pts = stream
    ? [...stream.points]
        .filter((p) => Number.isFinite(p.value))
        .sort((a, b) => a.date.localeCompare(b.date))
    : []
  const series = pts.map((p) => p.value)
  if (!stream || series.length < 2) {
    return {
      id, title, state: 'unknown', detail: null, spark: [],
      hint: stream ? `log to your ${stream.label} tile to see your trend` : 'log to your tile to see your trend',
      metric: null,
    }
  }
  const first = series[0]
  const latest = series[series.length - 1]
  const delta = Math.round((latest - first) * 100) / 100
  const dir = stream.goalDirection
  // 'neutral' (or unknown) direction never judges: the trend draws, state holds.
  const toward = dir === 'down' ? delta < 0 : dir === 'up' ? delta > 0 : false
  const away = dir === 'down' ? delta > 0 : dir === 'up' ? delta < 0 : false
  const state: TrendState = toward ? 'on-track' : away ? 'drifting' : 'holding'
  const detail = delta === 0 ? fmtVal(latest) : `${fmtVal(first)} → ${fmtVal(latest)}`
  return { id, title, state, detail, spark: series, sparkDates: pts.map((p) => p.date), hint: null, metric: 'stream' }
}

export function buildTicker(input: TickerInput): TickerRow[] {
  const todayIdx = input.weighIns.length || input.workoutDatesLast21.length
    ? Math.max(
        ...[...input.weighIns.map((w) => dayIndex(w.date)), ...input.workoutDatesLast21.map(dayIndex)]
          .filter((n): n is number => n != null),
      )
    : 0

  return input.goals.map((g) => {
    const title = g.cleanTitle || g.title

    // 1) Body composition: a real % per week from weigh-ins.
    const weightRow = (): TickerRow => {
      const rate = weeklyWeightRate(input.weighIns)
      const latest = weightSpark(input.weighIns).slice(-1)[0]
      if (rate && latest) {
        // THE shared inferrer (lib/goals/direction.ts): the same call goalGuide's
        // weightBrain makes, so this badge and that sentence can never disagree.
        const dir = inferBodyDirection(title, input.goalDirection) ?? 'maintain'
        const pct = (rate.kgPerWeek / latest) * 100
        const toward =
          (dir === 'lose' && rate.kgPerWeek < -0.05) || (dir === 'gain' && rate.kgPerWeek > 0.05)
        const away =
          (dir === 'lose' && rate.kgPerWeek > 0.05) || (dir === 'gain' && rate.kgPerWeek < -0.05)
        const state: TrendState = toward ? 'on-track' : away ? 'drifting' : 'holding'
        const sign = pct >= 0 ? '+' : ''
        const pts = weightPoints(input.weighIns)
        return {
          id: g.id, title, state,
          detail: `${sign}${pct.toFixed(1)}%/wk`,
          spark: pts.map((p) => p.kg),
          sparkDates: pts.map((p) => p.date),
          hint: null, metric: 'weight',
        }
      }
      return {
        id: g.id, title, state: 'unknown', detail: null, spark: [],
        hint: 'log a weigh-in to see your trend', metric: null,
      }
    }

    // 2) A specific lift: the most direct, honest measure of a strength goal:
    //    that lift's real top-set weight over time. Beats the training-cadence
    //    proxy, so it runs first. matchGoalToLift never matches a lift the user
    //    doesn't train, so we never invent a trend on someone else's bar.
    const liftRow = (): TickerRow | null => {
      if (input.lifts.length === 0) return null
      const match = matchGoalToLift(title, input.lifts.map((l) => ({ id: l.id, name: l.name })))
      const lift = match ? input.lifts.find((l) => l.id === match.liftId) : null
      if (!lift) return null
      const sessions = [...lift.sessions]
        .filter((s) => Number.isFinite(s.topWeight) && s.topWeight > 0)
        .sort((a, b) => a.date.localeCompare(b.date))
      const series = sessions.map((s) => s.topWeight)
      // Need >= 2 sessions to honestly draw a trend over time.
      if (series.length < 2) return null
      const first = series[0]
      const latest = series[series.length - 1]
      const delta = Math.round((latest - first) * 100) / 100
      const state: TrendState = delta > 0 ? 'on-track' : delta < 0 ? 'drifting' : 'holding'
      // Reads inside microcopy ("holding steady at …", "moving the right way, …"),
      // so flat is just the number; movement shows the journey first → latest.
      const detail = delta === 0 ? `${latest}` : `${first} → ${latest}`
      return { id: g.id, title, state, detail, spark: series, sparkDates: sessions.map((s) => s.date), hint: null, metric: 'lift' }
    }

    // 3) Training cadence: real sessions from logged workouts. Shown as a plain
    //    count over the window ("5 in 3 wks"), not a fractional rate ("1.7x/wk").
    const trainingRow = (): TickerRow | null => {
      if (input.workoutDatesLast21.length === 0) return null
      const count = input.workoutDatesLast21.length
      const perWk = count / 3
      const state: TrendState = perWk >= 3 ? 'on-track' : perWk >= 1 ? 'holding' : 'drifting'
      return {
        id: g.id, title, state,
        detail: `${count} in 3 wks`,
        spark: trainingSpark(input.workoutDatesLast21, todayIdx),
        hint: null, metric: 'training',
      }
    }

    // 0) "What steers this": the user's own pick wins over every auto-binding
    //    rule (TRAIN 4). Deterministic: an override names EXACTLY what draws
    //    (weight, training, or one of their tile streams); a module the ticker
    //    cannot draw yet stays an honest unknown, never a guessed graph.
    const ov = g.bindingOverride ?? null
    if (ov) {
      if (ov.startsWith('stream:')) {
        return streamRow(g.id, title, ov.slice('stream:'.length), input.streams ?? [])
      }
      if (ov === 'weight') return weightRow()
      if (ov === 'train') {
        return liftRow() ?? trainingRow() ?? {
          id: g.id, title, state: 'unknown', detail: null, spark: [],
          hint: 'log a workout to see your trend', metric: null,
        }
      }
      // A module the ticker cannot draw (notes / macros / water / ...): the
      // override still BLOCKS auto-binding: the user said what steers this,
      // so the bathroom scale never sneaks back in.
      return {
        id: g.id, title, state: 'unknown', detail: null, spark: [],
        hint: 'log a little and a trend appears here', metric: null,
      }
    }

    // The category veto runs before any title regex: body data only ever binds to
    // fitness / health / general / uncategorized goals.
    const cat = (g.category ?? '').toLowerCase()
    const bodyEligible = !NON_BODY_CATS.has(cat)
    const isWeight = bodyEligible
      && (WEIGHT_STRONG_RE.test(title) || (WEIGHT_LOOSE_CATS.has(cat) && WEIGHT_LOOSE_RE.test(title)))
    const isFitness = bodyEligible && (g.category === 'fitness' || FITNESS_RE.test(title))

    if (isWeight) return weightRow()

    if (bodyEligible) {
      // Gated by the same category veto: an "impress my boss" career goal can
      // never be handed the overhead-press bar.
      const lift = liftRow()
      if (lift) return lift
    }

    if (isFitness) {
      const training = trainingRow()
      if (training) return training
    }

    // 4) No metric backs this goal yet: a warm hint, no invented number.
    return {
      id: g.id, title, state: 'unknown', detail: null, spark: [],
      hint: isFitness ? 'log a workout to see your trend' : 'log a little and a trend appears here',
      metric: null,
    }
  })
}
