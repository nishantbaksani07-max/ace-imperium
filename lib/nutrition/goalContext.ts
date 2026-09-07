// Fuel Coach — goal context (pure, deterministic, zero AI).
//
// Turns the user's stored goal into a "mode" that tunes how the day is graded
// and how the coach talks. Three modes only, on purpose (a tired person reads
// the grade in 5 seconds):
//
//   lose     — losing weight / cutting. Calories become the heaviest lever.
//   build    — getting leaner and stronger, recomp, or bulking. Protein leads.
//   balanced — maintaining / general health / nothing set (the safe default).
//
// The signal is data we already load on the Fuel page: nutrition_goals
// `goal_outcome` (CUT / CUT_HP / LEAN_BULK / FAST_BULK / RECOMP / RECOMP_MAINTAIN
// / MAINTAIN), with the signed goal-rate band (kg/week) as a fallback. No extra
// query, no model call.

export type GoalMode = 'lose' | 'build' | 'balanced'

/** Per-row point maximums (the four coach rows). Always sums to 10. The mode
 *  redistributes the maximums so the row that matters most for the goal carries
 *  the most points. */
export interface RowWeights {
  protein: number
  calories: number
  wholefoods: number
  micros: number
}

/** The user's top goal as set in the goals tab / Vee (lib/goals BigGoal). The
 *  coach grades by the SAME goal, so "lose weight" or "get leaner and stronger"
 *  in Vee drives the Fuel grade. Loose shape so Fuel never imports Vee's types. */
export interface BigGoalSignal {
  title?: string | null
  cleanTitle?: string | null
  identityTag?: string | null
  category?: string | null
}

const BUILD_WORDS = ['stronger', 'strength', 'muscle', 'build muscle', 'bulk', 'gain', 'lifter', 'jacked', 'swole', 'bigger', 'put on size', 'recomp', 'lean and strong', 'leaner and stronger']
const LOSE_WORDS = ['lose weight', 'weight loss', 'lose fat', 'fat loss', 'cut', 'lean out', 'slim', 'shred', 'drop weight', 'get lean', 'leaner']

/** Read a mode from the Vee goal's words. Build is checked first so "leaner AND
 *  stronger" reads as build (protein focus), per Alex. Category alone is too
 *  coarse to flip a grade, so we only match on title/identity words. */
function modeFromBigGoal(g?: BigGoalSignal | null): GoalMode | null {
  if (!g) return null
  const text = `${g.title || ''} ${g.cleanTitle || ''} ${g.identityTag || ''}`.toLowerCase()
  if (!text.trim()) return null
  if (BUILD_WORDS.some((w) => text.includes(w))) return 'build'
  if (LOSE_WORDS.some((w) => text.includes(w))) return 'lose'
  return null
}

/**
 * Map the user's goals to a coach mode. Pure, first match wins, never throws.
 * Precedence: an explicit nutrition outcome wins; otherwise the user's top Vee
 * goal (the goals tab) is honored; otherwise the signed rate band; else balanced.
 * `goalOutcome` is nutrition_goals.goal_outcome (surfaced as goals.approach).
 * `bandMidKgPerWeek` is (goalBand.low + goalBand.high) / 2 (negative = losing).
 * `bigGoal` is the user's top active goal from Vee (so the two stay in sync).
 */
export function deriveGoalMode(input: {
  goalOutcome?: string | null
  bandMidKgPerWeek?: number | null
  bigGoal?: BigGoalSignal | null
}): GoalMode {
  const o = (input.goalOutcome || '').toUpperCase().trim()
  // An explicit nutrition choice (set in the macro quiz) always wins.
  if (o === 'CUT' || o === 'CUT_HP') return 'lose'
  if (o === 'LEAN_BULK' || o === 'FAST_BULK' || o === 'RECOMP' || o === 'RECOMP_MAINTAIN') return 'build'

  // Otherwise honor the goal the user set in Vee (so the coach and Vee agree).
  const fromGoal = modeFromBigGoal(input.bigGoal)
  if (fromGoal) return fromGoal

  if (o === 'MAINTAIN') return 'balanced'

  const mid = input.bandMidKgPerWeek
  if (typeof mid === 'number' && Number.isFinite(mid)) {
    if (mid <= -0.05) return 'lose'
    if (mid >= 0.05) return 'build'
  }
  return 'balanced'
}

/**
 * The row maximums for a mode. Each vector sums to exactly 10.
 * - lose: Calories (4) outweighs Protein (3) — the deficit is the point.
 * - build / balanced: Protein (4) leads; build expresses its focus through
 *   stricter protein wording + the carb-timing question, not a bigger cap.
 */
export function weightsForMode(mode: GoalMode): RowWeights {
  switch (mode) {
    case 'lose':
      return { protein: 3, calories: 4, wholefoods: 2, micros: 1 }
    case 'build':
      return { protein: 4, calories: 3, wholefoods: 2, micros: 1 }
    case 'balanced':
    default:
      return { protein: 4, calories: 3, wholefoods: 2, micros: 1 }
  }
}

/** Short human phrase for the "tuned for" cue + reason copy. Never shown when
 *  no goal is set (the caller hides the cue for that case). */
export function goalLabel(mode: GoalMode): string {
  switch (mode) {
    case 'lose':
      return 'lose weight'
    case 'build':
      return 'get stronger'
    case 'balanced':
    default:
      return 'stay steady'
  }
}
