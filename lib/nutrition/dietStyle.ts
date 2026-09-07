// Diet style — the single "what do you want food to do for you?" answer that
// opens Fuel to everyone, not just macro counters. Set on the macro setup quiz
// (app/app/fuel/macros/MacroSetup.tsx), stored on nutrition_goals.diet_style,
// and read by the deterministic food coach so it talks to each person in their
// own terms (a sugar-cutter hears about sugar; a macro counter hears macros).
//
// Pure + framework-free so both the client quiz and the server coach can import
// it. No AI here — this is a fixed, bounded vocabulary.

export type DietStyle =
  | 'macros'        // count protein + calories (the original power path)
  | 'lose_fat'      // eat for a leaner body, no gram-weighing
  | 'cut_sugar'     // less sugar, wants the hidden stuff surfaced
  | 'quit_fastfood' // cleaner eating, fewer drive-thrus + ultra-processed
  | 'hydrate'       // water + habit first
  | 'eat_better'    // gentle "help me notice", no targets

export const DIET_STYLES: DietStyle[] = [
  'macros', 'lose_fat', 'cut_sugar', 'quit_fastfood', 'hydrate', 'eat_better',
]

/** Diet styles that get real, computed macro targets (the full goal + body
 *  path). Every other style gets a gentle maintenance floor + a coach tuned to
 *  its focus rather than a macro grade. */
export function wantsMacroTargets(s: DietStyle | null | undefined): boolean {
  return s === 'macros' || s === 'lose_fat'
}

/** A short, warm label for the chosen style (Targets panel, coach copy). */
export const DIET_STYLE_LABEL: Record<DietStyle, string> = {
  macros: 'Counting macros',
  lose_fat: 'Losing fat',
  cut_sugar: 'Cutting sugar',
  quit_fastfood: 'Quitting fast food',
  hydrate: 'Drinking more water',
  eat_better: 'Eating better',
}

/** What the coach actively WATCHES for a given style. Drives which deterministic
 *  food-quality signal the coach leads with, and how it phrases a nudge. Used by
 *  lib/nutrition/foodQuality.ts + the CoachSection copy. */
export interface DietStyleWatch {
  /** The food-quality signal the coach leads with. */
  lead: 'protein' | 'sugar' | 'fastfood' | 'wholefoods' | 'hydration'
  /** A warm one-liner the coach can open with when the day is on-track. */
  onTrack: string
}

/** Recommended micronutrient goals derived from the plan, so the questionnaire
 *  hands the user a sensible starting point (fiber, an added-sugar cap, a sodium
 *  cap) they can then edit. Standard public-health heuristics, tuned a little by
 *  dietStyle (a sugar-cutter gets a tighter sugar cap). Pure. */
export function recommendMicroGoals(input: {
  kcal: number
  sex: 'M' | 'F'
  dietStyle?: DietStyle | null
}): { fiberTarget: number; sugarLimitG: number; sodiumLimitMg: number } {
  const kcal = Math.max(1200, Math.min(5000, Math.round(input.kcal) || 2000))
  // Fiber: ~14 g per 1000 kcal (Dietary Guidelines).
  const fiberTarget = Math.round((kcal / 1000) * 14)
  // Added-sugar cap: AHA ~36 g (men) / 25 g (women); a sugar-cutter gets tighter.
  const base = input.sex === 'M' ? 36 : 25
  const sugarLimitG = input.dietStyle === 'cut_sugar' ? Math.round(base * 0.6) : base
  // Sodium: the standard 2300 mg/day ceiling.
  const sodiumLimitMg = 2300
  return { fiberTarget, sugarLimitG, sodiumLimitMg }
}

export const DIET_STYLE_WATCH: Record<DietStyle, DietStyleWatch> = {
  macros: { lead: 'protein', onTrack: 'Protein and calories are tracking. This is the work.' },
  lose_fat: { lead: 'protein', onTrack: 'A steady deficit with your protein held. That is how fat goes and muscle stays.' },
  cut_sugar: { lead: 'sugar', onTrack: 'Low on the sweet stuff today. Your sugar radar is paying off.' },
  quit_fastfood: { lead: 'fastfood', onTrack: 'No fast food in sight. Real meals, real difference.' },
  hydrate: { lead: 'hydration', onTrack: 'Water is flowing. Small habit, big payoff over weeks.' },
  eat_better: { lead: 'wholefoods', onTrack: 'More whole foods than not. Quietly better, day by day.' },
}
