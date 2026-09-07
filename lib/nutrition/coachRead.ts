// Food Coach — deterministic, pace-aware daily read (score + warm reason).
//
// The day's macros were already analysed by AI at log time (the food-photo
// flow), so grading the day on top of that is pure arithmetic. No model call,
// no API key, instant, can't be abused, and it never goes dark when the
// Anthropic balance does.
//
// PACE-AWARE: the score grades you against how much of the eating day has
// elapsed, not the full day's target. Logging 520 kcal at noon is "on pace",
// the same 520 at midnight is a genuinely light day. This stops a low-but-early
// total from reading as a discouraging 2/10 while you simply haven't eaten yet.
// At end of day the expected fraction is 1, so it collapses to a strict
// whole-day grade. Open-ended coaching lives in the "talk deeper in Claude"
// doorway (the user's own Claude), not here.

export interface CoachTotals {
  kcal: number
  protein: number
}

export interface CoachTarget {
  kcal: number
  protein: number
}

export interface CoachRead {
  score: number
  reason: string
}

// The eating window inside one food day (which rolls at 4am, see dayKey.ts).
// Most people eat between ~8am and ~9pm; before 8am nothing is "expected yet",
// after 9pm the day is effectively done.
const EAT_START_H = 8
const EAT_END_H = 21

/**
 * Fraction of the eating day elapsed, 0..1, from the local clock.
 * - 4am–8am (fresh food day, pre-breakfast): 0 — nothing expected yet.
 * - 8am–9pm: ramps linearly 0→1.
 * - 9pm–4am (late night / small hours of the same food day): 1 — day is done.
 * Pure: pass the current Date in.
 */
export function eatingDayFraction(now: Date): number {
  const h = now.getHours() + now.getMinutes() / 60
  // Small hours (after midnight, before the 4am rollover) belong to the tail of
  // the prior food day — treat as fully elapsed.
  if (h < EAT_START_H) return h < 4 ? 1 : 0
  if (h >= EAT_END_H) return 1
  return (h - EAT_START_H) / (EAT_END_H - EAT_START_H)
}

/** Round to the nearest 5 for friendly, spoken-aloud numbers. */
function round5(n: number): number {
  return Math.round(n / 5) * 5
}

/** 0–5 points for how close `actual` tracks `expected`, floored so tiny early
 *  expectations don't make small absolute gaps explode. */
function paceClosenessPts(actual: number, expected: number, fullTarget: number): number {
  const denom = Math.max(expected, fullTarget * 0.25)
  if (denom <= 0) return 2.5
  const off = Math.min(Math.abs(actual - expected) / denom, 1)
  return 5 * (1 - off)
}

/**
 * The day's read: a 0-10 pace-aware score and a warm one-liner explaining it.
 * Returns null when there's nothing to grade (no food, or no target).
 *
 * @param fractionElapsed how much of the eating day has passed (0..1). Defaults
 *   to 1 (strict whole-day grade) — pass eatingDayFraction(new Date()) for the
 *   live, time-of-day-aware score.
 */
export function coachRead(
  totals: CoachTotals,
  target: CoachTarget,
  fractionElapsed = 1,
): CoachRead | null {
  if (!totals || totals.kcal <= 0) return null
  if (!target || target.kcal <= 0) return null

  const f = Math.max(0, Math.min(1, fractionElapsed))
  const expectedKcal = target.kcal * f
  const expectedProtein = target.protein * f

  const proteinPts = target.protein > 0 ? paceClosenessPts(totals.protein, expectedProtein, target.protein) : 2.5
  const caloriePts = paceClosenessPts(totals.kcal, expectedKcal, target.kcal)
  const score = Math.max(0, Math.min(10, Math.round(proteinPts + caloriePts)))

  // Pace ratios drive the wording: are we tracking, behind, or ahead for now?
  const proteinRatio = expectedProtein > 0 ? totals.protein / expectedProtein : 1
  const kcalRatio = expectedKcal > 0 ? totals.kcal / expectedKcal : 1
  const late = f >= 0.9
  const proteinGapFull = Math.max(0, round5(target.protein - totals.protein))
  const kcalDiffFull = totals.kcal - target.kcal
  const kcalGapFull = round5(Math.abs(kcalDiffFull))

  let reason: string

  if (late) {
    // Day is essentially done — grade the whole day, honestly but warm.
    if (score >= 9) {
      reason = 'Dialed in. Protein landed and calories hit your target. This is the day to repeat.'
    } else if (totals.protein >= target.protein * 0.95) {
      reason = kcalDiffFull > 0
        ? `Good day. Protein came through; calories ran about ${kcalGapFull} over, easy to ease back tomorrow.`
        : `Good day. Protein came through and you have about ${kcalGapFull} calories of room left.`
    } else if (kcalDiffFull > 0) {
      reason = 'Calories ran high today and protein stayed light. Tomorrow, lead with protein and it balances out.'
    } else {
      reason = `Light day, and that is fine. You finished about ${proteinGapFull}g under on protein, so tomorrow go protein-first from breakfast.`
    }
  } else {
    // Mid-day — grade against pace, never punish simply not having eaten yet.
    const proteinOnPace = proteinRatio >= 0.9
    const kcalBehind = kcalRatio < 0.8
    const kcalAhead = kcalRatio > 1.25

    if (score >= 8) {
      reason = 'On pace. Protein is tracking and your calories are right where they should be by now. Keep it rolling.'
    } else if (proteinOnPace && kcalBehind) {
      reason = 'Protein is on pace, calories are a touch behind for this time of day. Good moment for a solid meal.'
    } else if (kcalAhead && !proteinOnPace) {
      reason = 'Ahead on calories, protein is lagging a little. Steer the next bite protein-first.'
    } else if (!proteinOnPace) {
      reason = `A little behind on protein for now. About ${proteinGapFull}g would put you on track — a shake, eggs, or chicken does it.`
    } else {
      reason = 'Tracking nicely so far. Keep the protein climbing and you are set.'
    }
  }

  return { score, reason }
}
