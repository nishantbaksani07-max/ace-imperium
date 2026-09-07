/**
 * THE ONE body-composition direction inferrer.
 *
 * Both readers of a goal's body direction import THIS function:
 *   - lib/insights/ticker.ts  (the badge: on-track / drifting on the weight row)
 *   - lib/insights/goalGuide.ts (the sentence: weightBrain's cut/gain/recomp read)
 * They used to carry two private copies with OPPOSITE precedence (the ticker let the
 * profile override the goal's own words; the guide let the words win), so the same
 * goal card could call a cut "drifting" in the badge while the sentence praised it.
 * One exported function makes that disagreement impossible by construction
 * (__tests__/bodyDirection.test.ts proves it).
 *
 * Rules (the guide's documented semantics, now canonical):
 *   1. The goal's OWN words win over the profile fallback.
 *   2. Gain words are checked first, so "lean bulk" reads as a gain, not a cut.
 *   3. Word-bound matches only: "fat" never fires inside "fatigue" - but each word
 *      carries its common inflections ("leaning", "cuts", "shreds", "loss"), which
 *      the old substring copies matched and word bounds alone would drop.
 */

export type BodyDirection = 'lose' | 'gain' | 'maintain'

const GAIN_RE = /\b(bulk(ing|ed|s)?|gain(ing|s|ed)?|mass|bigger|build(ing|s)?|muscles?)\b/i
const LOSE_RE = /\b(lean(er|ing)?|los(e|s|ing|t)|cut(s|ting)?|fat|shred(s|ded|ding)?|lighter)\b/i

/**
 * Infer the body-comp direction for THIS goal: its own words first (gain before
 * lose), else the caller's fallback (usually the profile's stated direction).
 * Returns null only when the title says nothing and there is no fallback, so a
 * caller that must judge can default (`?? 'maintain'`) explicitly.
 */
export function inferBodyDirection(
  title: string,
  fallback: BodyDirection | null,
): BodyDirection | null {
  const t = title || ''
  if (GAIN_RE.test(t)) return 'gain'
  if (LOSE_RE.test(t)) return 'lose'
  return fallback
}
