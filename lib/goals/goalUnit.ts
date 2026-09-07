/**
 * Goal unit fidelity — the foundation that keeps every Vee insight TRUE.
 *
 * Alex's rule: "measure a goal in ONE thing only, never switch." A "225-Pound
 * Bench Press" goal is measured in pounds for its whole life, even on a kg
 * account. So we detect the goal's own unit ONCE (at the auto-clean step) and
 * store it, and every brain reads THAT unit instead of re-sniffing text or
 * defaulting to the account's unit.
 *
 * Pure + IO-free + unit-tested (see __tests__/goalUnit.test.ts). Detection is
 * deterministic (no AI) so it can never hallucinate a unit a goal never stated.
 */

/** The canonical unit a goal measures in. null elsewhere means "no stated unit",
 *  which lets a caller fall back to the account's display unit. */
export type GoalUnit = 'lb' | 'kg' | 'cm' | 'in' | 'reps' | 'sec'

/**
 * Each canonical unit and the pattern that proves it. The boundaries are
 * letter-only — a unit may sit against a DIGIT ("140kg", "225lb") but never
 * inside another word ("albums" is not lb, "compound" is not pound). Order is
 * priority: weight first (the goal that actually needs unit fidelity), then
 * length, reps, time. The first match wins.
 */
const UNIT_PATTERNS: { unit: GoalUnit; re: RegExp }[] = [
  { unit: 'lb', re: /(?<![a-z])(?:lbs?|pounds?)(?![a-z])/i },
  { unit: 'kg', re: /(?<![a-z])(?:kgs?|kilo(?:gram)?s?)(?![a-z])/i },
  { unit: 'cm', re: /(?<![a-z])(?:cms?|centimet(?:er|re)s?)(?![a-z])/i },
  { unit: 'in', re: /(?<![a-z])inch(?:es)?(?![a-z])/i },
  { unit: 'reps', re: /(?<![a-z])reps?(?![a-z])/i },
  { unit: 'sec', re: /(?<![a-z])(?:secs?|seconds?)(?![a-z])/i },
]

/**
 * The goal's own unit, detected from any of the texts it is described by (the raw
 * title plus the AI-cleaned title — the unit word often lives only in the clean
 * one). Returns the first canonical unit found, scanning in priority order across
 * all texts; null when no unit word is stated (the caller then uses the account
 * unit). null/undefined texts are ignored.
 */
export function detectGoalUnit(...texts: (string | null | undefined)[]): GoalUnit | null {
  const hay = texts.filter((t): t is string => typeof t === 'string' && t.length > 0)
  if (hay.length === 0) return null
  for (const { unit, re } of UNIT_PATTERNS) {
    if (hay.some((t) => re.test(t))) return unit
  }
  return null
}

/**
 * Map a stored free-text unit (the goal's progress_unit, which the user may have
 * typed as "lbs", "pounds", "kilograms", "subscribers", ...) to a canonical unit.
 * null when it is not a measurement unit we reason about, so a "subscribers" or
 * "books" progress unit never gets mistaken for a weight/length.
 */
export function normalizeGoalUnit(raw: string | null | undefined): GoalUnit | null {
  if (!raw) return null
  return detectGoalUnit(raw.trim())
}

/**
 * The unit to persist onto a goal's progress_unit at the auto-clean step, or null
 * to leave it as-is. Fill-when-empty only: a unit the user already set is the
 * truth and is never overwritten; an empty progress_unit is backfilled from the
 * detected unit so the goal carries its own unit going forward. null when there is
 * nothing to write (already set, or nothing detected) — the caller then omits the
 * column from its update entirely.
 */
export function unitToBackfill(current: string | null | undefined, detected: GoalUnit | null): GoalUnit | null {
  if (current && current.trim()) return null
  return detected
}
