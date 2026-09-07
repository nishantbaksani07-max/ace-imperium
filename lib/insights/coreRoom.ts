/**
 * THE CORE ROOM - every graphable series the core tiles have ever recorded,
 * built from the user's REAL rows into one browsable library (Alex,
 * 2026-07-11: "a user can access every data session graph ever recorded on
 * any core tile"). Train / Fuel / Body / Vitals only - Peak, Finance, and
 * Brand are deliberately out (de-cored at launch), and custom tiles feed
 * Vitality Noticed, not this room.
 *
 * PURE + IO-free: the page loader hands in raw rows, these builders hand back
 * plotted series. Nothing here writes anything anywhere - the room is a
 * window, not a lever, which is what makes it impossible to break.
 *
 * Two families of graphs:
 *  - FIXED catalog entries (vitals, fuel, body): always listed, honest empty
 *    state when the user has not logged that thing yet.
 *  - DYNAMIC entries (train): one graph per lift the user has actually
 *    logged - top-set weight and session volume per exercise - so a lifter
 *    with 25 movements sees ~50 lift graphs, and a runner sees none.
 */

import { dailyFoodScore } from '@/lib/nutrition/dayScore'

export interface CorePoint {
  /** Local YYYY-MM-DD day key. */
  date: string
  value: number
}

export type CoreGroup = 'train' | 'fuel' | 'body' | 'vitals'

export interface CoreGraph {
  id: string
  group: CoreGroup
  label: string
  unit: string
  /** Which way a HEALTHY line moves ('neutral' = the goal decides / no lean). */
  dir: 'up' | 'down' | 'neutral'
  /** Ascending by date. Empty = the honest "log it to light this up" card. */
  points: CorePoint[]
  /** Small mono spec line under the label (e.g. "top set · per session"). */
  sub: string
  /** True for catalog entries whose DATA does not exist yet (e.g. sugar per
   *  day before Fuel records it): rendered dim as "needs new data", never
   *  selectable. Honesty over padding. */
  soon?: boolean
}

/** Cap per series so a year of data stays a light page (newest kept). */
const MAX_POINTS = 120

/* ---------------------------------------------------------------- inputs */

export interface RoomSet {
  weight: number | null
  reps: number | null
  done: boolean
  failed: boolean
}
export interface RoomExercise {
  id: string
  name: string
  sets: RoomSet[]
}
export interface RoomWorkout {
  date: string
  exercises: RoomExercise[]
  off_day?: string | null
}
export interface RoomMealDay {
  day_key: string
  totals: unknown
}
export interface RoomWater {
  date: string
  amount_ml: number | null
}
export interface RoomWeight {
  date: string
  weight_kg: number | null
}
export interface RoomWearable {
  date: string
  recovery: number | null
  strain: number | null
  sleep_hours: number | null
  sleep_perf: number | null
  hrv: number | null
  rhr: number | null
}

/* ---------------------------------------------------------------- helpers */

const isLogged = (s: RoomSet) => !!s.done && !s.failed && (s.weight ?? 0) > 0 && (s.reps ?? 0) > 0

function clip(points: CorePoint[]): CorePoint[] {
  const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return sorted.length > MAX_POINTS ? sorted.slice(sorted.length - MAX_POINTS) : sorted
}

const round1 = (n: number) => Math.round(n * 10) / 10

/* ---------------------------------------------------------------- train */

/** One graph per lift x {top set, volume}, plus the session-wide series.
 *  Off-day sessions are skipped so they never dent a line. */
export function buildTrainGraphs(workouts: RoomWorkout[]): CoreGraph[] {
  const topByLift = new Map<string, { name: string; points: CorePoint[] }>()
  const volByLift = new Map<string, { name: string; points: CorePoint[] }>()
  const sessionVol: CorePoint[] = []
  const sessionSets: CorePoint[] = []

  for (const w of workouts) {
    if (w.off_day) continue
    let dayVol = 0
    let daySets = 0
    for (const ex of w.exercises ?? []) {
      const logged = (ex.sets ?? []).filter(isLogged)
      if (logged.length === 0) continue
      const top = Math.max(...logged.map((s) => s.weight as number))
      const vol = logged.reduce((sum, s) => sum + (s.weight as number) * (s.reps as number), 0)
      dayVol += vol
      daySets += logged.length
      const t = topByLift.get(ex.id) ?? { name: ex.name, points: [] }
      t.points.push({ date: w.date, value: top })
      topByLift.set(ex.id, t)
      const v = volByLift.get(ex.id) ?? { name: ex.name, points: [] }
      v.points.push({ date: w.date, value: Math.round(vol) })
      volByLift.set(ex.id, v)
    }
    if (daySets > 0) {
      sessionVol.push({ date: w.date, value: Math.round(dayVol) })
      sessionSets.push({ date: w.date, value: daySets })
    }
  }

  const graphs: CoreGraph[] = []
  // The heaviest-trafficked lifts first, so the room opens on the lifts that
  // matter to this user (most logged sessions), not alphabet luck.
  const lifts = [...topByLift.entries()].sort((a, b) => b[1].points.length - a[1].points.length)
  for (const [id, t] of lifts) {
    graphs.push({
      id: `lift_top_${id}`,
      group: 'train',
      label: t.name,
      unit: 'kg',
      dir: 'up',
      points: clip(t.points),
      sub: 'top set · per session',
    })
    const v = volByLift.get(id)!
    graphs.push({
      id: `lift_vol_${id}`,
      group: 'train',
      label: `${t.name} volume`,
      unit: 'kg',
      dir: 'up',
      points: clip(v.points),
      sub: 'weight x reps · per session',
    })
  }
  graphs.push({
    id: 'session_volume',
    group: 'train',
    label: 'Session volume',
    unit: 'kg',
    dir: 'up',
    points: clip(sessionVol),
    sub: 'whole workout · weight x reps',
  })
  graphs.push({
    id: 'session_sets',
    group: 'train',
    label: 'Sets logged',
    unit: 'sets',
    dir: 'up',
    points: clip(sessionSets),
    sub: 'per session',
  })
  return graphs
}

/* ---------------------------------------------------------------- fuel */

/** The user's daily fuel target, for the food-score line (kcal + protein). */
export interface FuelTarget {
  kcal: number
  protein: number
}

export function buildFuelGraphs(meals: RoomMealDay[], water: RoomWater[], target?: FuelTarget): CoreGraph[] {
  const byDay = new Map<string, { kcal: number; protein: number; carbs: number; fat: number; meals: number }>()
  for (const m of meals) {
    const t = (m.totals && typeof m.totals === 'object' ? m.totals : {}) as Record<string, unknown>
    const d = byDay.get(m.day_key) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0, meals: 0 }
    d.kcal += typeof t.kcal === 'number' ? t.kcal : 0
    d.protein += typeof t.protein === 'number' ? t.protein : 0
    d.carbs += typeof t.carbs === 'number' ? t.carbs : 0
    d.fat += typeof t.fat === 'number' ? t.fat : 0
    d.meals += 1
    byDay.set(m.day_key, d)
  }
  const series = (pick: (d: { kcal: number; protein: number; carbs: number; fat: number; meals: number }) => number) =>
    clip([...byDay.entries()].map(([date, d]) => ({ date, value: Math.round(pick(d)) })))

  const waterByDay = new Map<string, number>()
  for (const w of water) {
    if (typeof w.amount_ml === 'number') waterByDay.set(w.date, (waterByDay.get(w.date) ?? 0) + w.amount_ml)
  }

  // Food score (Alex, 2026-07-12): the SAME 0-10 daily rating the Macros page
  // shows, drawn as a trend. Real when a fuel target exists; dim otherwise.
  const hasTarget = !!target && target.kcal > 0
  const foodScorePts: CorePoint[] = hasTarget
    ? clip(
        [...byDay.entries()].flatMap(([date, d]) => {
          const s = dailyFoodScore({ kcal: d.kcal, protein: d.protein }, { kcal: target!.kcal, protein: target!.protein })
          return s == null ? [] : [{ date, value: s }]
        }),
      )
    : []

  return [
    { id: 'kcal', group: 'fuel', label: 'Calories', unit: 'kcal', dir: 'neutral', points: series((d) => d.kcal), sub: 'per day' },
    { id: 'protein', group: 'fuel', label: 'Protein', unit: 'g', dir: 'up', points: series((d) => d.protein), sub: 'per day' },
    { id: 'carbs', group: 'fuel', label: 'Carbs', unit: 'g', dir: 'neutral', points: series((d) => d.carbs), sub: 'per day' },
    { id: 'fat', group: 'fuel', label: 'Fat', unit: 'g', dir: 'neutral', points: series((d) => d.fat), sub: 'per day' },
    { id: 'meals_logged', group: 'fuel', label: 'Meals logged', unit: 'meals', dir: 'up', points: series((d) => d.meals), sub: 'per day' },
    // Food score is REAL (the daily 0-10 rating vs your target); dim only when
    // no fuel target is set yet, so it can never draw a meaningless line.
    hasTarget
      ? { id: 'food_score', group: 'fuel', label: 'Food score', unit: '/10', dir: 'up', points: foodScorePts, sub: 'daily quality vs your target' }
      : { id: 'food_score', group: 'fuel', label: 'Food score', unit: '/10', dir: 'up', points: [], sub: 'set a fuel target to grade', soon: true },
    // The needs-new-data shelf tail: Fuel does not record these yet (totals
    // carry kcal/protein/carbs/fat only). Dim until Fuel starts logging them.
    { id: 'sugar', group: 'fuel', label: 'Sugar', unit: 'g', dir: 'down', points: [], sub: 'needs new data', soon: true },
    { id: 'fiber', group: 'fuel', label: 'Fiber', unit: 'g', dir: 'up', points: [], sub: 'needs new data', soon: true },
    { id: 'sodium', group: 'fuel', label: 'Sodium', unit: 'mg', dir: 'down', points: [], sub: 'needs new data', soon: true },
    {
      id: 'water',
      group: 'fuel',
      label: 'Water',
      unit: 'ml',
      dir: 'up',
      points: clip([...waterByDay.entries()].map(([date, value]) => ({ date, value }))),
      sub: 'per day',
    },
  ]
}

/* ---------------------------------------------------------------- body */

export function buildBodyGraphs(weights: RoomWeight[]): CoreGraph[] {
  const raw: CorePoint[] = []
  for (const w of weights) {
    if (typeof w.weight_kg === 'number') raw.push({ date: w.date, value: round1(w.weight_kg) })
  }
  const sorted = clip(raw)
  // The 7-day story: each point is the average of the last 7 raw readings up
  // to that day - the line coaches actually read (daily scale noise ironed out).
  const avg: CorePoint[] = sorted.map((p, i) => {
    const win = sorted.slice(Math.max(0, i - 6), i + 1)
    return { date: p.date, value: round1(win.reduce((s, x) => s + x.value, 0) / win.length) }
  })
  return [
    { id: 'weight', group: 'body', label: 'Body weight', unit: 'kg', dir: 'neutral', points: sorted, sub: 'every weigh-in' },
    { id: 'weight_avg', group: 'body', label: 'Weight, 7-day story', unit: 'kg', dir: 'neutral', points: avg, sub: 'rolling average' },
  ]
}

/* ---------------------------------------------------------------- vitals */

export function buildVitalsGraphs(rows: RoomWearable[]): CoreGraph[] {
  const pick = (field: keyof RoomWearable): CorePoint[] =>
    clip(
      rows
        .filter((r) => typeof r[field] === 'number')
        .map((r) => ({ date: r.date, value: round1(r[field] as number) })),
    )
  return [
    { id: 'recovery', group: 'vitals', label: 'Recovery', unit: 'score', dir: 'up', points: pick('recovery'), sub: '0-100 · per night' },
    { id: 'sleep_hours', group: 'vitals', label: 'Sleep', unit: 'h', dir: 'up', points: pick('sleep_hours'), sub: 'per night' },
    { id: 'sleep_perf', group: 'vitals', label: 'Sleep performance', unit: '%', dir: 'up', points: pick('sleep_perf'), sub: 'per night' },
    { id: 'hrv', group: 'vitals', label: 'HRV', unit: 'ms', dir: 'up', points: pick('hrv'), sub: 'per night' },
    { id: 'rhr', group: 'vitals', label: 'Resting heart rate', unit: 'bpm', dir: 'down', points: pick('rhr'), sub: 'per night' },
    { id: 'strain', group: 'vitals', label: 'Strain', unit: '0-21', dir: 'neutral', points: pick('strain'), sub: 'per day' },
  ]
}

/** The whole room, grouped and ready to render. */
export function buildCoreRoom(input: {
  workouts: RoomWorkout[]
  meals: RoomMealDay[]
  water: RoomWater[]
  weights: RoomWeight[]
  wearables: RoomWearable[]
  fuelTarget?: FuelTarget
}): CoreGraph[] {
  return [
    ...buildTrainGraphs(input.workouts),
    ...buildFuelGraphs(input.meals, input.water, input.fuelTarget),
    ...buildBodyGraphs(input.weights),
    ...buildVitalsGraphs(input.wearables),
  ]
}
