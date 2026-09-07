/**
 * Connect a freeform strength goal ("bench 225", "squat 140kg") to the lift it
 * is about, among the lifts the user actually trains. Pure + forgiving on
 * phrasing, but never a false match: a goal about a lift they don't log returns
 * null, so the oracle never claims a stall on a lift that isn't theirs.
 *
 * Goals are freeform today (vitality_goals has no lift_id), so this token-overlap
 * match is the bridge that makes a "bench vs 225 goal" notice possible.
 */

export interface LiftRef {
  id: string
  name: string
}

export interface GoalLiftMatch {
  liftId: string
  liftName: string
  /** The number in the goal title (the target weight), or null if none stated. */
  targetWeight: number | null
}

const tokenize = (s: string): string[] => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

/**
 * Best lift match for a goal title, or null. Scores each lift by how many of its
 * own meaningful tokens (name + id, length >= 3 so "bb" is ignored) appear in the
 * goal title; the highest score wins, ties break to the first listed lift.
 */
export function matchGoalToLift(goalTitle: string, lifts: LiftRef[]): GoalLiftMatch | null {
  const titleTokens = new Set(tokenize(goalTitle))
  if (titleTokens.size === 0) return null

  let best: LiftRef | null = null
  let bestScore = 0
  for (const lift of lifts) {
    const liftTokens = tokenize(`${lift.name} ${lift.id}`).filter((t) => t.length >= 3)
    const score = liftTokens.reduce((n, t) => (titleTokens.has(t) ? n + 1 : n), 0)
    if (score > bestScore) {
      best = lift
      bestScore = score
    }
  }
  if (!best) return null

  const numMatch = goalTitle.match(/\d+/)
  return {
    liftId: best.id,
    liftName: best.name,
    targetWeight: numMatch ? Number(numMatch[0]) : null,
  }
}
