// Pure, read-only: reads the user's recent Train workouts and judges today's
// session as strong / steady / lighter (or deload), to steer Peak's guidance.
// No writes, no LLM, no Date.now() (today is passed in). Peak feeds Vee, never
// edits it. Robust to a forgotten or partial log: it reads the real sets.
import { getLocalDateKey } from '@/lib/dates'

export type WorkoutVerdict = 'strong' | 'steady' | 'lighter' | 'deload'

export interface WorkoutReadSet {
  weight: number | null
  reps: number | null
  done: boolean
  failed: boolean
  loggedAt?: number | null
}
export interface WorkoutReadExercise {
  id: string
  name: string
  sets: WorkoutReadSet[]
}
export interface WorkoutReadRow {
  date: string // YYYY-MM-DD (local)
  day_name: string
  exercises: WorkoutReadExercise[]
  off_day?: 'little' | 'rough' | 'deload' | null
}

export interface WorkoutReadResult {
  hadSession: boolean
  verdict: WorkoutVerdict
  totalVolume: number
  comparedTo: number | null // prior same-type volume, or recent average
  mainLiftPR: boolean
  label: string // e.g. "Strong session"
  detail: string // the warm steer sentence
  note: string // label + detail, for convenience
  window: { startMs: number; endMs: number } | null
}

// Tunable: ratio of today's volume to the comparison.
const STRONG_RATIO = 1.08 // >= 8% more work than usual
const LIGHTER_RATIO = 0.88 // <= 12% less work than usual
const RECENT_AVG_N = 4 // fallback: average of the last N sessions

const NEUTRAL: WorkoutReadResult = {
  hadSession: false,
  verdict: 'steady',
  totalVolume: 0,
  comparedTo: null,
  mainLiftPR: false,
  label: '',
  detail: '',
  note: '',
  window: null,
}

function sessionVolume(r: WorkoutReadRow): number {
  let v = 0
  for (const exr of r.exercises ?? []) {
    for (const s of exr.sets ?? []) {
      const w = s.weight
      const reps = s.reps
      // Guard against null / NaN / negative bad data so totalVolume is always
      // a finite, sane number (a bodyweight set has weight 0 → contributes 0).
      if (
        s.done &&
        typeof w === 'number' && Number.isFinite(w) && w > 0 &&
        typeof reps === 'number' && Number.isFinite(reps) && reps > 0
      ) {
        v += w * reps
      }
    }
  }
  return v
}

function hasDoneSets(r: WorkoutReadRow): boolean {
  return (r.exercises ?? []).some(exr =>
    (exr.sets ?? []).some(s => s.done && s.reps != null),
  )
}

function sessionWindow(r: WorkoutReadRow): { startMs: number; endMs: number } | null {
  const stamps: number[] = []
  for (const exr of r.exercises ?? []) {
    for (const s of exr.sets ?? []) {
      if (s.done && typeof s.loggedAt === 'number' && s.loggedAt > 0) {
        // Only trust stamps that fall on the workout's own local date, so a
        // workout logged long after the fact never skews the time of day.
        if (getLocalDateKey(new Date(s.loggedAt)) === r.date) stamps.push(s.loggedAt)
      }
    }
  }
  if (stamps.length === 0) return null
  return { startMs: Math.min(...stamps), endMs: Math.max(...stamps) }
}

function timePhrase(window: { startMs: number; endMs: number } | null): string {
  if (!window) return ''
  const h = new Date(window.startMs).getHours()
  if (h < 12) return ' this morning'
  if (h < 17) return ' this afternoon'
  return ' this evening'
}

function copyFor(
  verdict: WorkoutVerdict,
  newGround: boolean,
  phrase: string,
): { label: string; detail: string } {
  switch (verdict) {
    case 'strong':
      return { label: 'Strong session', detail: `Good work${phrase}. You earned your recovery tonight.` }
    case 'lighter':
      return { label: "Lighter day, that's fine", detail: `Lighter than usual${phrase}, and that is fine. Peak will lean toward rest.` }
    case 'deload':
      return { label: 'Deload, on purpose', detail: `Easy week${phrase}, on purpose. Peak expects you to take it light.` }
    case 'steady':
    default:
      return {
        label: 'Solid session',
        detail: newGround ? `New ground${phrase}. Nicely done.` : `Right on your usual${phrase}. Steady wins.`,
      }
  }
}

interface TopSet {
  weight: number
  reps: number
}
function topSet(exr: WorkoutReadExercise): TopSet | null {
  let best: TopSet | null = null
  for (const s of exr.sets ?? []) {
    const w = s.weight
    const reps = s.reps
    if (
      !s.done ||
      typeof w !== 'number' || !Number.isFinite(w) || w <= 0 ||
      typeof reps !== 'number' || !Number.isFinite(reps) || reps <= 0
    ) continue
    if (!best || w > best.weight || (w === best.weight && reps > best.reps)) {
      best = { weight: w, reps }
    }
  }
  return best
}

// The day's first exercise is its main compound. A PR = more weight on the top
// set, or more reps at the same top weight, vs the last time that lift was done.
function detectMainLiftPR(
  today: WorkoutReadRow,
  rows: WorkoutReadRow[],
  todayKey: string,
): boolean {
  const main = (today.exercises ?? [])[0]
  if (!main) return false
  const todayTop = topSet(main)
  if (!todayTop) return false

  const priorEx = rows
    .filter(r => r.date < todayKey)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map(r => (r.exercises ?? []).find(e => e.id === main.id))
    .find(e => e != null && topSet(e) != null)
  const priorTop = priorEx ? topSet(priorEx) : null
  if (!priorTop) return false // first time = new ground, not a PR

  return (
    todayTop.weight > priorTop.weight ||
    (todayTop.weight === priorTop.weight && todayTop.reps > priorTop.reps)
  )
}

export function readWorkout(rows: WorkoutReadRow[], todayKey: string): WorkoutReadResult {
  try {
    const safeRows = Array.isArray(rows) ? rows : []
    const today = safeRows.find(r => r.date === todayKey && hasDoneSets(r))
    if (!today) return { ...NEUTRAL }

    const window = sessionWindow(today)
    const phrase = timePhrase(window)
    const totalVolume = sessionVolume(today)

    // Deload short-circuit: an intentional easy week is never a regression.
    if (today.off_day === 'deload') {
      const c = copyFor('deload', false, phrase)
      return {
        hadSession: true, verdict: 'deload', totalVolume, comparedTo: null,
        mainLiftPR: false, label: c.label, detail: c.detail,
        note: `${c.label}. ${c.detail}`, window,
      }
    }

    // Compare to the last comparable session of the same type (one with real
    // volume), else a recent average. A bodyweight-only prior (volume 0) is not
    // a usable yardstick, so it is skipped rather than read as "vs 0".
    const priorSameType = safeRows
      .filter(r => r.date < todayKey && r.day_name === today.day_name && sessionVolume(r) > 0)
      .sort((a, b) => b.date.localeCompare(a.date))[0]

    let comparedTo: number | null = null
    if (priorSameType) {
      comparedTo = sessionVolume(priorSameType)
    } else {
      const recent = safeRows
        .filter(r => r.date < todayKey && sessionVolume(r) > 0)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, RECENT_AVG_N)
        .map(sessionVolume)
      if (recent.length > 0) comparedTo = recent.reduce((a, b) => a + b, 0) / recent.length
    }

    const mainLiftPR = detectMainLiftPR(today, safeRows, todayKey)

    // A main-lift PR always reads strong (honors "a heavy short day is not
    // lighter"). With no usable comparison, or no measurable volume today, stay
    // neutral rather than guess.
    let verdict: WorkoutVerdict
    const newGround = comparedTo == null
    if (mainLiftPR) {
      verdict = 'strong'
    } else if (comparedTo == null || totalVolume <= 0) {
      verdict = 'steady'
    } else {
      const ratio = totalVolume / comparedTo
      if (ratio >= STRONG_RATIO) verdict = 'strong'
      else if (ratio <= LIGHTER_RATIO) verdict = 'lighter'
      else verdict = 'steady'
    }

    const c = copyFor(verdict, newGround, phrase)
    return {
      hadSession: true, verdict, totalVolume, comparedTo, mainLiftPR,
      label: c.label, detail: c.detail, note: `${c.label}. ${c.detail}`, window,
    }
  } catch {
    return { ...NEUTRAL }
  }
}
