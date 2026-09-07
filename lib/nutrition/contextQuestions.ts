// Fuel Coach — context questions (pure, deterministic, zero AI).
//
// A tiny, bounded set of one-tap questions the coach can ask when a meal plus
// the day's context lines up. They make the deterministic score feel as smart as
// a mentor without any model call. Hard rules, enforced here:
//
//   - NO auto-fire: this only RETURNS a question. A point never moves until the
//     user taps an answer. The score on open is always the real score.
//   - At most ONE question at a time, answerable once per day.
//   - Every answer with a negative delta also offers a grace answer (no change).
//   - Warm, never shame. Amber for caution, never red.
//   - The point lands on the Whole foods row in the UI, so it can never disturb
//     the protein/calorie outcome math and always has headroom.

import type { GoalMode } from './goalContext'
import type { Macros } from './types'

export type ContextQuestionId = 'preworkout_fuel_good' | 'heavy_preworkout_fat'

export interface ContextAnswer {
  label: string
  /** Points to apply (lands on the Whole foods row, clamped). 0 = no change. */
  delta: number
  /** A grace / no-change out. Required on any question that can deduct. */
  grace?: boolean
  /** Short warm confirmation shown after the tap. */
  resolve: string
}

export interface ContextQuestion {
  id: ContextQuestionId
  tone: 'good' | 'watch'
  question: string
  /** The phrase the UI highlights in the question. */
  highlight: string
  answers: ContextAnswer[]
}

function shares(t: Macros): { carbShare: number; fatShare: number } {
  const kcal = t.kcal > 0 ? t.kcal : 1
  return {
    carbShare: (Number(t.carbs) || 0) * 4 / kcal,
    fatShare: (Number(t.fat) || 0) * 9 / kcal,
  }
}

/**
 * Decide whether to surface a context question for the most-recent meal.
 * Returns null when nothing should be asked (the default). Pure: pass the
 * already-known context in.
 */
export function decideContextQuestion(input: {
  /** The most-recent logged meal (its totals). */
  meal: { totals: Macros } | null | undefined
  mode: GoalMode
  isTrainingDayToday: boolean
  /** ids already answered today (so a question never re-asks). */
  answeredIds: string[]
}): ContextQuestion | null {
  const { meal, isTrainingDayToday, answeredIds } = input
  if (!isTrainingDayToday) return null
  if (!meal?.totals || !(meal.totals.kcal > 0)) return null
  const answered = new Set(answeredIds || [])

  const t = meal.totals
  const { carbShare, fatShare } = shares(t)

  // Rule 2 first (the caution): a fat-heavy, carb-light plate before a workout.
  if (!answered.has('heavy_preworkout_fat') && fatShare >= 0.45 && carbShare < 0.3 && t.kcal >= 350) {
    return {
      id: 'heavy_preworkout_fat',
      tone: 'watch',
      question: 'Heading to the gym soon? This is heavy as preworkout fuel.',
      highlight: 'heavy as preworkout fuel',
      answers: [
        { label: 'Yes, pre-workout', delta: -1, resolve: 'Good to know. Lighter carbs will sit better before a lift.' },
        { label: 'Already trained', delta: 0, resolve: 'Already trained, no change.' },
        { label: 'give me grace', delta: 0, grace: true, resolve: 'Grace it is. Tomorrow is a fresh plate.' },
      ],
    }
  }

  // Rule 1 (the cheer): a carb-forward plate on a training day = great fuel.
  if (!answered.has('preworkout_fuel_good') && carbShare >= 0.45 && fatShare < 0.35 && t.kcal >= 250) {
    return {
      id: 'preworkout_fuel_good',
      tone: 'good',
      question: 'Working out today? This is great fuel for it.',
      highlight: 'great fuel',
      answers: [
        { label: 'Yes', delta: 1, resolve: 'Logged. Plus one for timing it right.' },
        { label: 'Not today', delta: 0, resolve: 'No worries, no change.' },
      ],
    }
  }

  return null
}
