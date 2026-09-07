import type { VitalsPreferences, VitalsLimiter } from '@/lib/preferences'
import type { VitalsGoal } from '@/lib/vitals/goals'
import { evaluateGoalProgress } from '@/lib/vitals/goals'

/**
 * Vitals advice engine (rules, no LLM).
 *
 * Turns a person's WHOOP reading + their 7-day trend + their setup-quiz answers
 * into one warm, personal hero narrative plus a couple of targeted nudges. It is
 * a pure function so it's deterministic, instant, free, and unit-testable.
 *
 * Voice rules (see memory): warm, lowercase, no shame, never scold. A low day is
 * framed as the body asking for rest, not a failure. No em dashes in copy. Every
 * number shown is real (the caller passes through actual WHOOP fields). The
 * narrative leans on the user's stated `biggestLimiter` so it reads as "it knows
 * what i care about".
 */

export type RecoveryBand = 'high' | 'moderate' | 'low' | 'unknown'

/** The fields the engine reads. WHOOP rows (WearableRow) are assignable. */
export interface VitalsReading {
  date: string
  recovery: number | null
  hrv: number | null
  rhr: number | null
  sleep_perf: number | null
  sleep_hours: number | null
  strain: number | null
}

export interface VitalsAdvice {
  band: RecoveryBand
  /** short status word for the header pill */
  pill: string
  /** the one warm hero line */
  headline: string
  /** a single factual "why", anchored in a real number */
  sub: string
  /** 0 to 2 short, specific nudges */
  insights: string[]
}

const round = (n: number) => Math.round(n)
const one = (n: number) => (Math.round(n * 10) / 10).toString()

export function recoveryBand(recovery: number | null): RecoveryBand {
  if (recovery == null) return 'unknown'
  if (recovery >= 67) return 'high'
  if (recovery >= 34) return 'moderate'
  return 'low'
}

const PILL: Record<RecoveryBand, string> = {
  high: 'recovered',
  moderate: 'moderate',
  low: 'take it easy',
  unknown: 'synced',
}

// Hero line by band, specialised per limiter where it makes the line land harder.
function headlineFor(band: RecoveryBand, limiter: VitalsLimiter | null, r: VitalsReading): string {
  if (band === 'unknown') return 'your numbers are in.'
  const sleptWell = r.sleep_perf != null && r.sleep_perf >= 85
  const sleptPoorly = r.sleep_perf != null && r.sleep_perf < 80

  if (band === 'high') {
    switch (limiter) {
      case 'sleep': return sleptWell ? 'you slept well and your body’s ready. today you can push.' : 'your body’s recovered. today you can push.'
      case 'soreness': return 'you’ve bounced back. your body’s ready for real work today.'
      case 'energy': return 'your energy’s there today. go use it.'
      case 'stress': return 'you’re calm and recovered. a good day to train hard.'
      case 'optimize': return 'everything’s green today. a good day to push a little past comfortable.'
      default: return 'you’re recovered. today’s a day you can push.'
    }
  }
  if (band === 'moderate') {
    switch (limiter) {
      case 'sleep': return sleptPoorly ? 'sleep is your focus, and last night dipped a little. ease in and protect tonight.' : 'you’re partly recovered. ease in and protect your sleep tonight.'
      case 'stress': return 'your body’s carrying a little stress today. ease in and breathe through the warmup.'
      case 'soreness': return 'you’re partly back. warm up longer than usual and let soreness fade as you move.'
      case 'energy': return 'energy’s middling today. start easy, it often shows up once you’re moving.'
      default: return 'you’re partly recovered. let the first few sets tell you how much you’ve got.'
    }
  }
  // low
  switch (limiter) {
    case 'sleep': return 'you’re running low, and sleep is the lever. tonight matters more than today’s workout.'
    case 'stress': return 'your body’s under real stress today. keep it gentle and let your nervous system reset.'
    case 'soreness': return 'you’re still recovering from the last sessions. a lighter day now pays off later.'
    case 'energy': return 'you’re low on reserves today. a gentle day is the smart play.'
    default: return 'your body’s asking for a lighter day. lean into rest, tomorrow comes back.'
  }
}

// One factual sentence anchored in a real number, compared to the week when useful.
function subFor(band: RecoveryBand, r: VitalsReading, weekAvg: number | null): string {
  if (band === 'unknown' || r.recovery == null) {
    if (r.sleep_hours != null) return `you slept ${one(r.sleep_hours)}h last night.`
    return 'here’s how your body’s doing today.'
  }
  let cmp = '.'
  if (weekAvg != null) {
    const diff = r.recovery - weekAvg
    if (diff >= 8) cmp = `, higher than your 7-day average of ${round(weekAvg)}.`
    else if (diff <= -8) cmp = `, lower than your 7-day average of ${round(weekAvg)}.`
    else cmp = `, right in line with your week.`
  }
  return `recovery’s at ${round(r.recovery)}${cmp}`
}

// A few candidate nudges, ordered by emotional + practical priority. Top 2 fire.
function buildInsights(
  r: VitalsReading,
  prev: VitalsReading | null,
  quiz: VitalsPreferences | null,
  band: RecoveryBand,
  lowStreak: number,
): string[] {
  const out: string[] = []
  const limiter = quiz?.biggestLimiter ?? null

  // grace first: a run of low days is a rhythm, not a failure
  if (lowStreak >= 3) {
    out.push(`this is your ${lowStreak}th lighter day in a row. that’s a normal rhythm, not a setback.`)
  }

  // late caffeine, but only when sleep is plausibly paying for it
  if (quiz?.caffeineCutoff === 'late' && (band !== 'high' || (r.sleep_perf != null && r.sleep_perf < 85))) {
    out.push('late caffeine can quietly cost you deep sleep. wrapping up by early afternoon may help.')
  }

  // irregular timing drags recovery over a week
  if (quiz?.sleepConsistency === 'irregular') {
    out.push('your sleep timing moves around a lot. even a steadier wake time nudges recovery up over a week.')
  }

  // soreness focus + a big load yesterday
  if (limiter === 'soreness' && prev?.strain != null && prev.strain >= 14) {
    out.push(`yesterday’s strain hit ${one(prev.strain)}. the soreness now is your body adapting.`)
  }

  // health-flag softeners so the numbers never feel like a verdict
  if (quiz?.healthFlags?.includes('cycle')) {
    out.push('your cycle can move these numbers around. read them as a trend, not a verdict.')
  } else if (quiz?.healthFlags?.includes('condition') || quiz?.healthFlags?.includes('medication')) {
    out.push('a condition or meds can shift your hr and sleep readings. trust how you feel alongside the numbers.')
  }

  return out.slice(0, 2)
}

// A single warm, goal-tied insight. Provisional goals speak softly (we are not
// sure of the baseline yet). Trusted goals reference real progress. No shame.
function goalInsight(goal: VitalsGoal, week: VitalsReading[]): string | null {
  const noun: Record<VitalsGoal['metric'], string> = {
    recovery: 'recovery', sleep: 'sleep', hrv: 'hrv', strain: 'training load',
  }
  if (goal.isProvisional) {
    return `we are still getting to know your normal ${noun[goal.metric]}. give it a few days and your goal will sharpen.`
  }
  const p = evaluateGoalProgress(goal, week)
  if (p.pct >= 1) return `you have reached your ${noun[goal.metric]} goal. that is a real change, not a fluke.`
  const pctText = Math.round(p.pct * 100)
  return `you are ${pctText}% of the way to your ${noun[goal.metric]} goal. keep the rhythm going.`
}

export function buildVitalsAdvice(
  latest: VitalsReading,
  week: VitalsReading[],
  quiz: VitalsPreferences | null,
  goal: VitalsGoal | null = null,
): VitalsAdvice {
  const band = recoveryBand(latest.recovery)
  const limiter = quiz?.biggestLimiter ?? null

  // chronological, newest last
  const chrono = [...week].sort((a, b) => a.date.localeCompare(b.date))
  const prior = chrono.filter(d => d.date !== latest.date && d.recovery != null).map(d => d.recovery as number)
  const weekAvg = prior.length ? prior.reduce((s, n) => s + n, 0) / prior.length : null

  // consecutive most-recent low days (including today)
  let lowStreak = 0
  for (let i = chrono.length - 1; i >= 0; i--) {
    const rec = chrono[i].recovery
    if (rec != null && rec < 34) lowStreak++
    else break
  }

  // yesterday (the row just before latest, chronologically)
  const idx = chrono.findIndex(d => d.date === latest.date)
  const prev = idx > 0 ? chrono[idx - 1] : null

  const baseInsights = buildInsights(latest, prev, quiz, band, lowStreak)
  const lead = goal ? goalInsight(goal, week) : null
  const insights = (lead ? [lead, ...baseInsights] : baseInsights).slice(0, 2)

  return {
    band,
    pill: PILL[band],
    headline: headlineFor(band, limiter, latest),
    sub: subFor(band, latest, weekAvg),
    insights,
  }
}
