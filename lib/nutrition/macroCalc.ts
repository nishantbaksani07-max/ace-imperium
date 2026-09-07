// Macro calculator + goal guide. Built to the Fuel build-ready spec (Part B);
// evidence in docs/ideas/macro-quiz-research.md + macro-quiz-macrofactor-research.md.
//
//  - estimateMaintenance(): Mifflin-St Jeor (or Katch-McArdle only when a MEASURED
//    body-fat % is entered) x a deflated, honest-biased activity multiplier. A
//    STARTING estimate; the adaptive layer (Part C) later overrides it from logged
//    data, so computeMacros() accepts a maintenanceOverride seam.
//  - recommendApproach(): the decision table — goal x follow-up x lift x body-fat
//    band -> one of 7 approaches, with overrides (resistance training gates every
//    muscle-positive approach), and a warm plain-language reason.
//  - computeMacros(): approach + target rate -> goal calories (with safety floors),
//    FFM-keyed protein, a fat floor, carbs as remainder, and the optional
//    training/rest carb cycle (weekly average preserved).
//
// Pure + deterministic so it is unit-tested.

export type Sex = 'M' | 'F'
/** Non-gym lifestyle activity (job, walking, sports). Training is counted separately. */
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high'
export type Intensity = 'easy' | 'moderate' | 'hard' | 'brutal'
export type Experience = 'beginner' | 'returning' | 'experienced'
export type Goal = 'lose' | 'maintain' | 'gain'

// Plain follow-up answers (Q2), per goal branch.
export type FollowUp =
  | 'lose_muscle_high' | 'lose_muscle_some' | 'lose_scale_only'
  | 'gain_lean' | 'gain_faster'
  | 'maintain_build' | 'maintain_hold'

// Internal approach names — never shown to the user.
export type Approach = 'CUT' | 'CUT_HP' | 'RECOMP' | 'LEAN_BULK' | 'FAST_BULK' | 'MAINTAIN' | 'RECOMP_MAINTAIN'

export interface MacroTarget {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export interface MacroPlan {
  maintenance: number // estimated maintenance kcal (the anchor)
  base: MacroTarget // weekly-average target for the approach
  training: MacroTarget
  rest: MacroTarget
  trainingDaysPerWeek: number
}

const KCAL_PER_KG = 7700
const r = (x: number) => Math.round(x)
const round5 = (x: number) => Math.round(x / 5) * 5
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

// Non-gym lifestyle base (deflated, since training is added separately, so we never
// double-count the gym — spec B3b).
export const LIFESTYLE_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.35,
  moderate: 1.45,
  high: 1.6,
}
// Added to the factor per weekly training day, scaled by how hard the sessions are.
const INTENSITY_BUMP: Record<Intensity, number> = {
  easy: 0.015,
  moderate: 0.02,
  hard: 0.025,
  brutal: 0.03,
}

/** Combined activity factor: non-gym lifestyle + a bump per weekly training day. */
export function effectiveActivityFactor(lifestyle: ActivityLevel, trainingDaysPerWeek: number, intensity: Intensity): number {
  const days = clamp(trainingDaysPerWeek, 0, 7)
  return clamp(LIFESTYLE_FACTORS[lifestyle] + days * INTENSITY_BUMP[intensity], 1.2, 1.95)
}

// ── maintenance estimate ─────────────────────────────────────────────────────

/** Mifflin-St Jeor BMR; Katch-McArdle only when a measured body-fat % is given. */
export function bmr(
  sex: Sex,
  age: number,
  heightCm: number,
  weightKg: number,
  opts: { bodyFatPct?: number | null; bfMeasured?: boolean } = {},
): number {
  if (opts.bfMeasured && opts.bodyFatPct != null && opts.bodyFatPct > 0) {
    const lbm = weightKg * (1 - opts.bodyFatPct / 100)
    return r(370 + 21.6 * lbm)
  }
  return r(10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'M' ? 5 : -161))
}

/** Starting maintenance estimate (BMR x combined lifestyle + training factor). */
export function estimateMaintenance(
  sex: Sex,
  age: number,
  heightCm: number,
  weightKg: number,
  lifestyle: ActivityLevel,
  trainingDaysPerWeek: number,
  intensity: Intensity,
  opts: { bodyFatPct?: number | null; bfMeasured?: boolean } = {},
): number {
  return r(bmr(sex, age, heightCm, weightKg, opts) * effectiveActivityFactor(lifestyle, trainingDaysPerWeek, intensity))
}

// ── goal guide (the decision table) ──────────────────────────────────────────

type BfBand = 'lean' | 'mid' | 'high'

/** Body-fat band by sex. Soft guide, not a hard cut-point. */
export function bodyFatBand(sex: Sex, bodyFatPct: number | null | undefined): BfBand | null {
  if (bodyFatPct == null) return null
  if (sex === 'M') return bodyFatPct <= 15 ? 'lean' : bodyFatPct <= 20 ? 'mid' : 'high'
  return bodyFatPct <= 23 ? 'lean' : bodyFatPct <= 28 ? 'mid' : 'high'
}

const veryHigh = (sex: Sex, bf: number | null | undefined) => bf != null && bf > (sex === 'M' ? 30 : 38)

export interface ApproachInput {
  sex: Sex
  goal: Goal
  followUp: FollowUp
  /** Resistance trains at least sometimes. Gates every muscle-positive approach. */
  lifts: boolean
  bodyFatPct: number | null
  experience: Experience
}

export interface ApproachRecommendation {
  approach: Approach
  reason: string
  /** True when the user wants muscle but does not lift — UI shows a lifting invite. */
  liftInvite: boolean
}

const REASONS: Record<Approach, string> = {
  CUT: 'Eat a bit less than you burn to lose fat steadily, with protein high so what you lose is fat, not muscle.',
  CUT_HP: 'A steady fat-loss phase with protein high, so you hold your muscle while the fat comes down.',
  RECOMP: 'Eat about what you burn, keep protein high, and train. You can build a little muscle and lose a little fat at once.',
  LEAN_BULK: 'Eat a little more than you burn to gain mostly muscle with minimal fat. Going slow is the point.',
  FAST_BULK: 'A bigger surplus so you gain quicker. You will add some fat, and we ease off if it comes too fast.',
  MAINTAIN: 'Eat around maintenance to hold steady, with protein high so your body keeps improving.',
  RECOMP_MAINTAIN: 'Eat around maintenance with protein high to slowly recompose. Add training to unlock real muscle gain.',
}

/** Steer to an approach from plain answers + body fat + training status. */
export function recommendApproach(input: ApproachInput): ApproachRecommendation {
  const { sex, goal, followUp, lifts, bodyFatPct, experience } = input
  const band = bodyFatBand(sex, bodyFatPct)
  const novice = experience === 'beginner' || experience === 'returning'
  let approach: Approach
  let liftInvite = false

  if (goal === 'lose') {
    if (followUp === 'lose_muscle_high') {
      if (lifts) approach = novice || band === 'high' ? 'RECOMP' : 'CUT_HP'
      else { approach = 'CUT_HP'; liftInvite = true }
    } else if (followUp === 'lose_muscle_some') {
      approach = lifts ? 'CUT_HP' : 'CUT'
    } else {
      approach = 'CUT'
    }
  } else if (goal === 'gain') {
    if (followUp === 'gain_lean') {
      if (lifts) approach = band === 'high' ? 'RECOMP' : 'LEAN_BULK'
      else { approach = 'RECOMP_MAINTAIN'; liftInvite = true }
    } else {
      if (lifts) approach = band === 'high' ? 'LEAN_BULK' : 'FAST_BULK'
      else { approach = 'MAINTAIN'; liftInvite = true }
    }
  } else {
    if (followUp === 'maintain_build') {
      if (lifts) approach = 'RECOMP'
      else { approach = 'MAINTAIN'; liftInvite = true }
    } else {
      approach = 'MAINTAIN'
    }
  }

  // Body-fat override: never prescribe a surplus to a very-high-bf user.
  if (goal === 'gain' && veryHigh(sex, bodyFatPct) && (approach === 'LEAN_BULK' || approach === 'FAST_BULK')) {
    approach = 'RECOMP'
  }

  let reason = REASONS[approach]
  if (liftInvite) {
    reason += ' One thing: building or keeping muscle really does need resistance training. Want to set up a simple lifting routine?'
  }
  return { approach, reason, liftInvite }
}

// ── targets ──────────────────────────────────────────────────────────────────

// Protein is set deliberately generous — high protein is safe, protective, and
// satiating, and overshooting is a feature here, not a bug. Cuts go highest
// (muscle retention in a deficit); every muscle-positive phase sits at a high
// ~2.5 g/kg (roughly 1.1 g/lb). This also pulls carbs down off high-calorie
// plans so the split reads like a real physique plan, not a carb dump.
const PROTEIN_PER_KG_BW: Record<Approach, number> = {
  CUT: 2.6,
  CUT_HP: 2.6, // fallback when no bf%; FFM path (2.6 g/kg FFM) used when bf% known
  RECOMP: 2.5,
  RECOMP_MAINTAIN: 2.5,
  LEAN_BULK: 2.5,
  FAST_BULK: 2.5,
  MAINTAIN: 2.0, // non-lifter drops to 1.8 below
}

const isSurplus = (a: Approach) => a === 'LEAN_BULK' || a === 'FAST_BULK'
const isDeficit = (a: Approach) => a === 'CUT' || a === 'CUT_HP'

function target(protein: number, carbs: number, fat: number): MacroTarget {
  const c = Math.max(0, r(carbs))
  const p = round5(protein)
  const f = r(fat)
  return { protein: p, carbs: c, fat: f, kcal: p * 4 + c * 4 + f * 9 }
}

export interface MacroInput {
  sex: Sex
  age: number
  heightCm: number
  weightKg: number
  /** Non-gym lifestyle activity. */
  lifestyle: ActivityLevel
  /** Training days per week (count, not weekdays). Drives the activity bump + the cycle. */
  trainingDaysPerWeek: number
  intensity: Intensity
  approach: Approach
  /** Target bodyweight change rate, fraction/week (positive). Ignored for non-rate approaches. */
  rate: number
  bodyFatPct?: number | null
  bfMeasured?: boolean
  /** Adaptive layer can pass a maintenance learned from logged data; overrides the formula. */
  maintenanceOverride?: number
}

export function computeMacros(input: MacroInput): MacroPlan {
  const { sex, age, heightCm, weightKg, lifestyle, intensity, approach, rate } = input
  // daysRaw can be fractional (e.g. 4.5 for a rotating split) — used for the
  // maintenance estimate; the carb cycle uses the rounded count t.
  const daysRaw = clamp(input.trainingDaysPerWeek, 0, 7)
  const t = Math.round(daysRaw)
  const lifts = daysRaw > 0
  const bf = input.bodyFatPct ?? null

  const bmrVal = bmr(sex, age, heightCm, weightKg, { bodyFatPct: bf, bfMeasured: input.bfMeasured })
  const maintenance = input.maintenanceOverride ?? r(bmrVal * effectiveActivityFactor(lifestyle, daysRaw, intensity))

  // Goal calories: maintenance shifted by a rate-based offset, with caps + floors.
  const dailyFromRate = (rate * weightKg * KCAL_PER_KG) / 7
  let goalKcal: number
  if (isDeficit(approach)) {
    goalKcal = maintenance - dailyFromRate
    const floor = Math.max(r(bmrVal * 1.1), sex === 'M' ? 1500 : 1200)
    goalKcal = Math.max(goalKcal, floor)
  } else if (approach === 'LEAN_BULK') {
    goalKcal = maintenance + Math.min(dailyFromRate, 0.15 * maintenance, 350)
  } else if (approach === 'FAST_BULK') {
    goalKcal = maintenance + Math.min(dailyFromRate, 0.2 * maintenance, 500)
  } else {
    goalKcal = maintenance // RECOMP, RECOMP_MAINTAIN, MAINTAIN
  }
  goalKcal = r(goalKcal)

  // Protein. CUT_HP keys to FFM when a bf% exists; MAINTAIN drops for non-lifters.
  let proteinG: number
  if (approach === 'CUT_HP' && bf != null) {
    proteinG = 2.6 * (weightKg * (1 - bf / 100))
  } else if (approach === 'MAINTAIN' && !lifts) {
    proteinG = 1.8 * weightKg
  } else {
    proteinG = PROTEIN_PER_KG_BW[approach] * weightKg
  }
  // Ceiling at 3.0 g/kg so the generous targets are never clipped (still a safe,
  // evidence-supported upper bound, ~1.4 g/lb).
  proteinG = clamp(round5(proteinG), round5(1.2 * weightKg), round5(3.0 * weightKg))

  // Fat: a health/adherence floor, otherwise ~28% of calories. Slightly higher
  // than a bare minimum so carbs aren't the only remainder — keeps the carb
  // number sane on big training days instead of ballooning.
  const fatG = r(Math.max(0.6 * weightKg, (0.28 * goalKcal) / 9))

  // Carbs absorb the remainder.
  const carbG = Math.max(0, r((goalKcal - proteinG * 4 - fatG * 9) / 4))
  const base = target(proteinG, carbG, fatG)

  // Optional training/rest carb cycle — weekly carb total + daily protein held
  // constant, fat constant. Adherence + performance, not a fat-loss mechanism.
  const restDays = 7 - t
  if (!lifts || t === 0 || restDays === 0) {
    return { maintenance, base, training: { ...base }, rest: { ...base }, trainingDaysPerWeek: t }
  }
  const carbFloor = Math.max(2 * weightKg, 80)
  let shift = 0.12
  let trainingCarb = carbG * (1 + shift)
  let restCarb = (carbG * 7 - t * trainingCarb) / restDays
  while (restCarb < carbFloor && shift > 0.02) {
    shift -= 0.02
    trainingCarb = carbG * (1 + shift)
    restCarb = (carbG * 7 - t * trainingCarb) / restDays
  }
  const training = target(proteinG, trainingCarb, fatG)
  const rest = target(proteinG, Math.max(0, restCarb), fatG)
  return { maintenance, base, training, rest, trainingDaysPerWeek: t }
}

/** Default target rate (fraction bodyweight/week) per approach + pace. */
export type Pace = 'gentle' | 'standard' | 'aggressive'
export function defaultRate(approach: Approach, pace: Pace): number {
  if (isDeficit(approach)) return { gentle: 0.005, standard: 0.007, aggressive: 0.01 }[pace]
  if (approach === 'LEAN_BULK') return { gentle: 0.0015, standard: 0.0025, aggressive: 0.004 }[pace]
  if (approach === 'FAST_BULK') return { gentle: 0.004, standard: 0.005, aggressive: 0.006 }[pace]
  return 0
}

/** Is the given weekday a training day for this plan? */
export function isTrainingDay(trainingDays: number[], weekday: number): boolean {
  return trainingDays.includes(weekday)
}
