// Fuel Coach — transparent, goal-aware, deterministic scoring (pure, zero AI).
//
// Builds on the pace-aware idea from coachRead (which it reuses for the eating
// fraction) and turns the bare 1-10 into four rows that always SUM to the score,
// so "why is it a 7" is answerable to the point. The mode (lib/nutrition/
// goalContext) redistributes the row maximums and reshapes the copy, so the
// same logged day scores differently for "lose weight" vs "get stronger".
//
// No model call, no API key, instant, can't be abused, never goes dark. Open
// ended coaching still lives in the "talk deeper in Claude" doorway.

import { eatingDayFraction } from './coachRead'
import { dayFoodQuality, type FoodQuality } from './foodQuality'
import { weightsForMode, goalLabel, type GoalMode } from './goalContext'
import type { Macros, MealFood } from './types'

export { eatingDayFraction }

export type RowKey = 'protein' | 'calories' | 'wholefoods' | 'micros'
export type Tone = 'good' | 'watch' // mint | amber — never red

export interface ScoreRow {
  key: RowKey
  label: string
  earned: number // integer points earned (0..max)
  max: number // this row's weight for the active mode
  tone: Tone
  reason: string // short, goal-aware, never shame
}

export interface DayScore {
  score: number // 0..10 = sum of the rows' earned
  headline: string // warm, goal-aware overall read
  headlineHighlight: string // the phrase the UI mint-highlights
  rows: ScoreRow[]
  mode: GoalMode
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

function round5(n: number): number {
  return Math.round(n / 5) * 5
}

function toneFor(earned: number, max: number): Tone {
  return earned >= max ? 'good' : 'watch'
}

// Where the user is in their eating day. Derived only from the pace fraction
// (which itself comes from the user's own device clock), so it is pure, total,
// and clamped: every possible hour, and even a broken clock, maps to a valid
// phase. This is what lets the coach "know what time it is" without ever being
// able to misfire.
export type DayPhase = 'morning' | 'midday' | 'evening'
export function dayPhase(fractionElapsed: number): DayPhase {
  const f = Number.isFinite(fractionElapsed) ? clamp01(fractionElapsed) : 0.5
  if (f < 0.34) return 'morning'
  if (f < 0.7) return 'midday'
  return 'evening'
}

function rowPoints(max: number, closeness: number): number {
  return Math.max(0, Math.min(max, Math.round(max * closeness)))
}

function proteinReason(mode: GoalMode, phase: DayPhase, full: boolean, gap: number): string {
  if (full) {
    if (mode === 'lose') return 'Protein is on point, which protects your muscle while you lean out.'
    if (mode === 'build') return 'Protein is the star for getting stronger, and you are right on pace.'
    return 'Protein is right where it should be by now.'
  }
  // Early in the day, low protein is not a problem, it is just early.
  if (phase !== 'evening') return 'Good protein start. Plenty of day left to top it up.'
  const add = gap > 0 ? `About ${gap}g more` : 'A bit more'
  if (mode === 'build') return `${add} protein keeps the muscle building. A shake, eggs, or chicken does it.`
  if (mode === 'lose') return `${add} protein keeps you full and protects muscle on a cut.`
  return `${add} protein would round out your day. A shake, eggs, or chicken does it.`
}

function caloriesReason(mode: GoalMode, phase: DayPhase, full: boolean, over: boolean, gap: number): string {
  if (over) {
    if (mode === 'lose') return `Calories ran about ${gap} over your day. For losing weight this is the row to watch, easy to ease back tomorrow.`
    return `Calories are about ${gap} over for the day. Nothing a lighter tomorrow will not balance.`
  }
  if (full) {
    if (mode === 'lose') return 'Calories are sitting right in your cut. This is the lever that matters most for losing weight.'
    return 'Calories are right where they should be by now.'
  }
  // Under target, but early = expected, so never framed as behind until evening.
  if (phase !== 'evening') return 'Calories are right on pace for this time of day. Plenty of room left.'
  if (mode === 'build') return `About ${gap} calories short for a build day. A solid meal earns these back.`
  return `About ${gap} calories short for the day. Room for a real meal.`
}

function wholeReason(full: boolean, top: string[]): string {
  if (full) return top.length ? `Clean plate today, mostly ${top.slice(0, 3).join(', ')}.` : 'Clean, whole foods today.'
  return 'Some processed picks today. One more whole-food plate swings it back.'
}

function microsReason(full: boolean): string {
  return full ? 'Good fiber from your fruit and veg today.' : 'Light on fruit and veg so far. A handful of greens covers it.'
}

/**
 * The day's transparent read. Returns null when there is nothing to grade.
 * `fractionElapsed` is the pace (eatingDayFraction(now)); injected so the engine
 * stays pure and re-runnable.
 */
export function scoreDay(input: {
  totals: { kcal: number; protein: number; carbs?: number; fat?: number }
  target: { kcal: number; protein: number }
  fractionElapsed: number
  quality: FoodQuality
  mode: GoalMode
}): DayScore | null {
  const { totals, target, quality, mode } = input
  if (!totals || totals.kcal <= 0) return null
  if (!target || target.kcal <= 0) return null

  const w = weightsForMode(mode)
  // Robust pace: finite + clamped. An invalid clock falls back to a neutral
  // midday, never a NaN or an out-of-range score.
  const f = Number.isFinite(input.fractionElapsed) ? clamp01(input.fractionElapsed) : 0.5
  const phase = dayPhase(f)

  // Being UNDER target is only a real deduction as the day runs out. The
  // under-penalty is tiny in the morning (0.12) and full by night (1.0), so a
  // healthy breakfast never reads as "behind". Bounded + smooth, so it can never
  // misfire.
  const underMult = 0.12 + 0.88 * f
  const expProtein = target.protein * f
  const expKcal = target.kcal * f

  // Protein: only a shortfall vs the pace matters, scaled by time. Over is free.
  const pShort = Math.max(0, expProtein - totals.protein)
  const pDenom = Math.max(target.protein * 0.25, 1)
  const pClose = target.protein > 0 ? 1 - clamp01((pShort / pDenom) * underMult) : 0.6
  const proteinEarned = rowPoints(w.protein, pClose)

  // Calories: a shortfall vs pace is scaled by time (+ mode); going OVER only
  // ever counts against the FULL day budget, never the tiny early pace, so
  // breakfast is never punished for being "over pace".
  const kDenom = Math.max(target.kcal * 0.25, 1)
  const underPenC = (mode === 'build' ? 1.2 : mode === 'lose' ? 0.6 : 1) * underMult
  const overPenC = mode === 'lose' ? 1.35 : mode === 'build' ? 0.7 : 1
  const cShort = Math.max(0, expKcal - totals.kcal)
  const cOver = Math.max(0, totals.kcal - target.kcal)
  const cUnderClose = 1 - clamp01((cShort / kDenom) * underPenC)
  const cOverClose = 1 - clamp01((cOver / kDenom) * overPenC)
  const cClose = Math.min(cUnderClose, cOverClose)
  const caloriesEarned = rowPoints(w.calories, cClose)

  const wholeEarned = rowPoints(w.wholefoods, quality.wholeRatio)
  const microsEarned = rowPoints(w.micros, quality.microsScore)

  const proteinGap = Math.max(0, round5(target.protein - totals.protein))
  const kcalOver = cOver > 0
  const kcalGap = kcalOver ? round5(cOver) : round5(Math.max(0, target.kcal - totals.kcal))

  const rows: ScoreRow[] = [
    {
      key: 'protein',
      label: 'Protein',
      earned: proteinEarned,
      max: w.protein,
      tone: toneFor(proteinEarned, w.protein),
      reason: proteinReason(mode, phase, proteinEarned >= w.protein, proteinGap),
    },
    {
      key: 'calories',
      label: 'Calories',
      earned: caloriesEarned,
      max: w.calories,
      tone: toneFor(caloriesEarned, w.calories),
      reason: caloriesReason(mode, phase, caloriesEarned >= w.calories, kcalOver, kcalGap),
    },
    {
      key: 'wholefoods',
      label: 'Whole foods',
      earned: wholeEarned,
      max: w.wholefoods,
      tone: toneFor(wholeEarned, w.wholefoods),
      reason: wholeReason(wholeEarned >= w.wholefoods, quality.topWholeFoods),
    },
    {
      key: 'micros',
      label: 'Micros',
      earned: microsEarned,
      max: w.micros,
      tone: toneFor(microsEarned, w.micros),
      reason: microsReason(microsEarned >= w.micros),
    },
  ]

  const score = Math.max(0, Math.min(10, rows.reduce((s, r) => s + r.earned, 0)))
  const label = goalLabel(mode)
  // "Gaps" only exist once the day is winding down. Earlier, a low row is just
  // "not yet", never a gap to nag about, so the headline stays encouraging.
  const gaps = phase === 'evening' ? rows.filter((r) => r.earned < r.max).map((r) => r.label.toLowerCase()) : []
  const headline = buildHeadline(mode, label, score, gaps, phase)

  return { score, headline, headlineHighlight: label, rows, mode }
}

function buildHeadline(mode: GoalMode, label: string, score: number, gaps: string[], phase: DayPhase): string {
  // Morning + midday: warm, never a list of gaps, and never "day to repeat" -
  // the day is not over yet.
  if (phase === 'morning') return `Good start toward ${label}. You are on pace, plenty of day left.`
  if (phase === 'midday') return `Building your ${label} day nicely. Keep it rolling.`
  // Evening: the day is done, so a great day earns the "repeat it" line, and a
  // short day shows the real, gentle gaps with a "tomorrow" out.
  if (score >= 9) return `Dialed in for ${label}. This is the day to repeat.`
  const gapPhrase =
    gaps.length === 0
      ? 'Nothing left on the table.'
      : gaps.length === 1
        ? `The one thing left is ${gaps[0]}.`
        : `What is left is ${gaps.slice(0, 2).join(' and ')}.`
  if (score >= 7) return `On pace for ${label}. ${gapPhrase}`
  if (mode === 'lose') return `Close on ${label} today. ${gapPhrase} Nothing tomorrow will not fix.`
  if (mode === 'build') return `Building toward ${label}. ${gapPhrase} Easy wins from here.`
  return `Tracking ${label}. ${gapPhrase}`
}

/**
 * A simple per-meal score (0-10) for the "this meal" reading. Deterministic:
 * protein density + whole-food quality + fat moderation, lightly mode-tuned.
 * Returns null when the meal has no calories.
 */
export function scoreMeal(
  meal: { totals: Macros; foods?: MealFood[] } | null | undefined,
  opts: { mode: GoalMode },
): { score: number; reason: string } | null {
  const t = meal?.totals
  if (!t || !(t.kcal > 0)) return null
  const kcal = t.kcal
  const proteinShare = clamp01((t.protein * 4) / kcal)
  const fatShare = clamp01((t.fat * 9) / kcal)
  const q = dayFoodQuality(meal?.foods || [])

  const proteinPts = 4 * clamp01(proteinShare / 0.35) // 35% of kcal from protein = full
  const wholePts = 3 * q.wholeRatio
  const fatFloor = opts.mode === 'lose' ? 0.35 : 0.45
  const fatPenalty = clamp01((fatShare - fatFloor) / 0.35)
  const fatPts = 3 * (1 - fatPenalty)

  const score = Math.max(0, Math.min(10, Math.round(proteinPts + wholePts + fatPts)))

  let reason: string
  if (score >= 8) reason = q.topWholeFoods.length ? `Lean and clean, ${q.topWholeFoods.slice(0, 2).join(' and ')}.` : 'Lean and clean.'
  else if (proteinShare < 0.18) reason = 'Light on protein for the calories. A protein source rounds it out.'
  else if (fatPenalty > 0.4) reason = opts.mode === 'lose' ? 'Tasty, but oil-heavy for a cut.' : 'A bit fat-heavy, easy to balance.'
  else reason = 'Solid plate. A little more protein or veg lifts it.'

  return { score, reason }
}
