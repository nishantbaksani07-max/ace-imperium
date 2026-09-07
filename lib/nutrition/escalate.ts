// Two-tier vision escalation gate.
//
// The fast floor model (Sonnet) handles every photo. When it tells us it could
// not commit confidently to an identification, parse-meal re-runs the same
// photo on the stronger escalation model (Opus) and takes that answer. This is
// what makes "fast on easy plates, accurate on hard ones" work — the floor
// model's honesty about doubt is the routing signal.

import type { MealState } from './types'

// Escalate exactly when the floor model expressed doubt it could act on:
//   - 'uncertain' → a food has a plausible alternative that swings the meal
//   - 'can_tell'  → photo is clear but a food is genuinely unidentifiable
// Do NOT escalate:
//   - 'confident' → no doubt for a stronger model to resolve
//   - 'bad_photo' → the fix is a retake, not a better model
const ESCALATE_STATES: ReadonlySet<MealState> = new Set<MealState>(['uncertain', 'can_tell'])

export function shouldEscalate(parsed: { state?: MealState } | null | undefined): boolean {
  if (!parsed || !parsed.state) return false
  return ESCALATE_STATES.has(parsed.state)
}

// How long the escalation (Opus) call may run, given how much of the AI time
// budget the floor (Sonnet) call already used. Two sequential frontier vision
// calls can otherwise exceed the serverless function limit and 504 — so the
// escalation gets only the remaining budget, and is skipped entirely (0) when
// too little time is left to be worth a second call. Pure so it's unit-tested.
export function escalationTimeoutMs(
  elapsedMs: number,
  opts?: { budgetMs?: number; minMs?: number }
): number {
  const budgetMs = opts?.budgetMs ?? 50_000
  const minMs = opts?.minMs ?? 9_000
  const remaining = budgetMs - elapsedMs
  return remaining >= minMs ? remaining : 0
}
