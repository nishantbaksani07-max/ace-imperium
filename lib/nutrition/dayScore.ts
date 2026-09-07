// Deterministic daily food rating (0–10) for the Fuel "Past week" strip, so
// every logged day shows a rating — not only the days the AI coach has read.
// Pure + no I/O: rewards hitting your protein target and landing near your
// calorie target for that day. Returns null when there's nothing to grade.

export interface DayTotalsLike {
  kcal: number
  protein: number
}

export interface DayTargetLike {
  kcal: number
  protein: number
}

/**
 * 0–10 score for one day's food.
 * - Protein: up to 5 points (the #1 lever) — full marks at/above target.
 * - Calories: up to 5 points — closeness to the day's calorie target (over OR under).
 * Returns null if nothing was logged, or there's no target to grade against.
 */
export function dailyFoodScore(totals: DayTotalsLike, target: DayTargetLike): number | null {
  if (!totals || totals.kcal <= 0) return null
  if (!target || target.kcal <= 0) return null

  const proteinPts = target.protein > 0 ? 5 * Math.min(totals.protein / target.protein, 1) : 2.5

  const off = Math.min(Math.abs(totals.kcal - target.kcal) / target.kcal, 1)
  const caloriePts = 5 * (1 - off)

  return Math.max(0, Math.min(10, Math.round(proteinPts + caloriePts)))
}

/** Tone for colour-coding the rating (mint good · neutral ok · amber low — never red). */
export function foodScoreTone(score: number): 'good' | 'ok' | 'low' {
  if (score >= 8) return 'good'
  if (score >= 5) return 'ok'
  return 'low'
}
