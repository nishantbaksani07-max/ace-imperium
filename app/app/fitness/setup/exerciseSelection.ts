/**
 * Per-exercise recommendation engine.
 *
 * `recommendIntake()` picks the *split shape* (Full Body / U/L / PPL / etc.).
 * This file then takes the chosen preset's hardcoded day templates and
 * personalizes the actual exercise list using the same IntakeAnswers:
 *
 *   1. Restrictions → substitute the lift the user can't do for a safe
 *      alternative that hits the same muscle (e.g. heavy_squat → leg_press).
 *   2. Equipment → swap or drop lifts that need gear the user doesn't have
 *      (e.g. bodyweight-only drops back_squat → bulgarian_ss).
 *   3. Priorities → bias the day's accessory work toward the user's chosen
 *      body parts (chest priority + push day → add an extra chest isolation).
 *   4. Sets/reps → leave the preset's defaults intact; tier+dayType already
 *      drives that via defaultSetsReps() in splitData.ts.
 *
 * Output: a new PresetDay[] with personalized exercises, ready to slot into
 * SetupWizard's `days` state. The user can still tweak in Step 3.
 *
 * Also exports `recommendedAddsForPicker()` which surfaces a small bias list
 * in the ExercisePicker's "Recommended for you" section, so a user who
 * customizes a day still sees the suggestions that match their answers.
 */

import {
  EX,
  type DayExercise,
  type Category,
} from '../log/splitData'
import type { Preset, PresetDay, ActiveRest, ActiveRestActivity } from './presets'
import type {
  IntakeAnswers,
  Restriction,
  Priority,
  Equipment,
} from './presets'
import type { GoalPreferences } from '@/lib/preferences'
import { prescribeRepRx, goalLabel } from '@/lib/training/repZones'
import { auditWeeklyVolume } from '@/lib/training/volumeAudit'
import { setCredits, attributionFor, MUSCLE_BACKFILL } from '@/lib/training/muscleMapping'
import type { MuscleGroup } from '@/lib/training/volumeLandmarks'

// Human label for a granular MuscleGroup. Used in the per-exercise
// reason copy so users see "chest" instead of "front_delts" etc.
function muscleHuman(m: MuscleGroup): string {
  switch (m) {
    case 'chest':          return 'chest'
    case 'lats':           return 'lats'
    case 'mid_upper_back': return 'mid + upper back'
    case 'front_delts':    return 'front delts'
    case 'side_delts':     return 'side delts'
    case 'rear_delts':     return 'rear delts'
    case 'biceps':         return 'biceps'
    case 'triceps':        return 'triceps'
    case 'quads':          return 'quads'
    case 'hamstrings':     return 'hamstrings'
    case 'glutes':         return 'glutes'
    case 'calves':         return 'calves'
    case 'core':           return 'core'
  }
}

// Roll up a granular MuscleGroup into the broader Priority bucket the
// user actually answered for — so an exercise that primarily trains
// 'lats' can still be matched against the user's "back" priority.
function priorityBucketFor(m: MuscleGroup): Exclude<Priority, 'balanced'> | null {
  switch (m) {
    case 'chest':          return 'chest'
    case 'lats':
    case 'mid_upper_back': return 'back'
    case 'front_delts':
    case 'side_delts':
    case 'rear_delts':     return 'shoulders'
    case 'biceps':
    case 'triceps':        return 'arms'
    case 'quads':
    case 'hamstrings':
    case 'glutes':
    case 'calves':         return 'legs'
    case 'core':           return null
  }
}

/**
 * Per-exercise baseline reason — what shows in the "Why we recommend"
 * popover when no earlier engine pass (restriction sub, equipment swap,
 * priority extra) already emitted a more specific reason.
 *
 * Varies on:
 *   - the exercise's primary muscle (from attributionFor)
 *   - its tier / role (heavy_compound vs compound vs iso vs ab)
 *   - whether the primary muscle's bucket is in the user's priorities
 *   - recovery state (when 'great' or 'rough' it shows up in copy)
 *   - goal (when strength/muscle/fat_loss/recomp drives the bias)
 *
 * Reads the sets×reps off the (already-prescribed) exercise object so
 * the popover surfaces the actual prescription the user is going to run.
 */
function baselineReason(ex: DayExercise, answers: IntakeAnswers): RecommendationReason {
  const def = EX[ex.id]
  const att = attributionFor(ex.id)
  // Defensive — if we can't look up muscle/tier, fall back to a short
  // generic so the popover still has something useful instead of "".
  if (!def || !att) {
    return {
      kind: 'foundation',
      sentence: 'Part of your tailored plan.',
      sourceLabel: 'your split',
    }
  }
  const muscle = att.primary
  const muscleName = muscleHuman(muscle)
  const priorityBucket = priorityBucketFor(muscle)
  const isPriority = !!priorityBucket
    && !!answers.priorities
    && answers.priorities.includes(priorityBucket)
    && !answers.priorities.includes('balanced')

  const rep = `${ex.sets}×${ex.reps}`
  const tier = def.tier

  // Style guide for this whole function: copy should always read as
  // "you told us X, so we did Y." Never assert facts about the user;
  // always quote the intake answer back. Their recovery varies day to
  // day — the engine is going off what they ANSWERED, not their state
  // right now. So "you said recovery feels solid" beats "recovery is
  // solid."

  // Heavy compound — the anchor lift of the day.
  if (tier === 'heavy_compound') {
    if (isPriority && priorityBucket) {
      return {
        kind: 'foundation',
        sentence: `Heavy ${muscleName} anchor at ${rep}. You picked ${priorityBucket} as a focus, so it leads the day.`,
        sourceLabel: 'priorities',
      }
    }
    if (answers.recovery === 'rough') {
      return {
        kind: 'foundation',
        sentence: `${capitalize(muscleName)} anchor at ${rep}. You said recovery's been rough, so we kept this manageable.`,
        sourceLabel: 'recovery',
      }
    }
    if (answers.goal === 'strength') {
      return {
        kind: 'foundation',
        sentence: `Strength anchor: ${muscleName} at ${rep}. You picked strength, so the heavy compound leads.`,
        sourceLabel: 'goal',
      }
    }
    return {
      kind: 'foundation',
      sentence: `Heavy ${muscleName} compound at ${rep}. The lift that drives the rest of the session.`,
      sourceLabel: 'your split',
    }
  }

  // Compound — second-tier multi-joint work.
  if (tier === 'compound') {
    if (isPriority && priorityBucket) {
      return {
        kind: 'foundation',
        sentence: `Second ${muscleName} compound at ${rep}. You said ${priorityBucket} is a focus, so we double up.`,
        sourceLabel: 'priorities',
      }
    }
    if (answers.recovery === 'great') {
      return {
        kind: 'foundation',
        sentence: `${capitalize(muscleName)} compound at ${rep}. You told us recovery's been solid lately, so volume stays up.`,
        sourceLabel: 'recovery',
      }
    }
    if (answers.goal === 'muscle' || answers.goal === 'recomp') {
      return {
        kind: 'foundation',
        sentence: `${capitalize(muscleName)} compound at ${rep}. You picked muscle, so reps land in the hypertrophy zone.`,
        sourceLabel: 'goal',
      }
    }
    return {
      kind: 'foundation',
      sentence: `${capitalize(muscleName)} compound at ${rep}. Moderate intensity, builds the day's volume.`,
      sourceLabel: 'your split',
    }
  }

  // Core/abs — short note, distinct from limb isolation.
  if (tier === 'ab') {
    return {
      kind: 'accessory',
      sentence: `Core work at ${rep}. Caps the session and protects the spine on heavy days.`,
      sourceLabel: 'your split',
    }
  }

  // Heavy iso + iso — accessory pump work.
  if (isPriority && priorityBucket) {
    return {
      kind: 'accessory',
      sentence: `Extra ${muscleName} isolation at ${rep}. You said ${priorityBucket} is a priority for you.`,
      sourceLabel: 'priorities',
    }
  }
  if (answers.goal === 'fat_loss') {
    return {
      kind: 'accessory',
      sentence: `${capitalize(muscleName)} isolation at ${rep}. You said you're cutting, so volume's light but sharp.`,
      sourceLabel: 'goal',
    }
  }
  if (answers.goal === 'health') {
    return {
      kind: 'accessory',
      sentence: `${capitalize(muscleName)} accessory at ${rep}. You picked health, so this stays light and sustainable.`,
      sourceLabel: 'goal',
    }
  }
  return {
    kind: 'accessory',
    sentence: `${capitalize(muscleName)} isolation at ${rep}. Tail-end pump after the day's compounds.`,
    sourceLabel: 'your split',
  }
}

function capitalize(s: string): string {
  return s[0].toUpperCase() + s.slice(1)
}

// ─── Exercise metadata ────────────────────────────────────────────────
//
// Every entry in EX has a known primary muscle and equipment requirement.
// We declare this explicitly here (rather than adding fields to EX) so
// the existing splitData.ts stays untouched and the log standalone keeps
// working. The IDs MUST match EX. If you add an exercise to EX, add it
// here too — the type guard at the bottom of the file flags any miss.

export type Muscle =
  | 'chest' | 'back' | 'shoulders' | 'arms'
  | 'legs'  | 'glutes' | 'core'

export type Equip =
  | 'barbell' | 'dumbbell' | 'cable' | 'machine'
  | 'bodyweight' | 'bands'

interface ExerciseTag {
  /** What this lift trains as its dominant target. Used for the
   *  priority-bias pass and for restriction substitutions (we swap a
   *  banned lift for another lift that hits the SAME primary muscle). */
  primary: Muscle
  /** What you need to do it. Drives equipment filtering. */
  equip: Equip
}

export const EX_TAGS: Record<string, ExerciseTag> = {
  // ── Push (chest / shoulders / triceps) ──
  bench_bb:        { primary: 'chest',     equip: 'barbell' },
  incl_bb_bench:   { primary: 'chest',     equip: 'barbell' },
  flat_db_press:   { primary: 'chest',     equip: 'dumbbell' },
  incl_db_press:   { primary: 'chest',     equip: 'dumbbell' },
  machine_chest:   { primary: 'chest',     equip: 'machine' },
  dips_weighted:   { primary: 'chest',     equip: 'bodyweight' },
  close_grip:      { primary: 'arms',      equip: 'barbell' },
  cable_fly:       { primary: 'chest',     equip: 'cable' },
  pec_deck:        { primary: 'chest',     equip: 'machine' },
  standing_ohp:    { primary: 'shoulders', equip: 'barbell' },
  seated_db_ohp:   { primary: 'shoulders', equip: 'dumbbell' },
  machine_ohp:     { primary: 'shoulders', equip: 'machine' },
  push_press:      { primary: 'shoulders', equip: 'barbell' },
  db_lat_raise:    { primary: 'shoulders', equip: 'dumbbell' },
  cable_lat_raise: { primary: 'shoulders', equip: 'cable' },
  rear_delt_fly:   { primary: 'shoulders', equip: 'cable' },
  reverse_pec:     { primary: 'shoulders', equip: 'machine' },
  tri_pushdown:    { primary: 'arms',      equip: 'cable' },
  oh_tri_ext:      { primary: 'arms',      equip: 'cable' },
  skullcrushers:   { primary: 'arms',      equip: 'barbell' },

  // ── Pull (back / biceps) ──
  pullup_weighted:  { primary: 'back', equip: 'bodyweight' },
  pullup:           { primary: 'back', equip: 'bodyweight' },
  bb_row:           { primary: 'back', equip: 'barbell' },
  pendlay_row:      { primary: 'back', equip: 'barbell' },
  t_bar_row:        { primary: 'back', equip: 'machine' },
  seated_cable_row: { primary: 'back', equip: 'cable' },
  chest_supp_row:   { primary: 'back', equip: 'dumbbell' },
  single_arm_row:   { primary: 'back', equip: 'dumbbell' },
  lat_pulldown:     { primary: 'back', equip: 'cable' },
  face_pull:        { primary: 'shoulders', equip: 'cable' },
  bb_curl:          { primary: 'arms', equip: 'barbell' },
  hammer_curl:      { primary: 'arms', equip: 'dumbbell' },
  cable_curl:       { primary: 'arms', equip: 'cable' },
  incl_db_curl:     { primary: 'arms', equip: 'dumbbell' },
  preacher_curl:    { primary: 'arms', equip: 'machine' },

  // ── Legs ──
  back_squat:      { primary: 'legs',   equip: 'barbell' },
  front_squat:     { primary: 'legs',   equip: 'barbell' },
  hack_squat:      { primary: 'legs',   equip: 'machine' },
  leg_press:       { primary: 'legs',   equip: 'machine' },
  rdl:             { primary: 'legs',   equip: 'barbell' },
  conv_dl:         { primary: 'back',   equip: 'barbell' },
  bulgarian_ss:    { primary: 'legs',   equip: 'dumbbell' },
  db_split_squat:  { primary: 'legs',   equip: 'dumbbell' },
  walking_lunge:   { primary: 'legs',   equip: 'bodyweight' },
  leg_ext:         { primary: 'legs',   equip: 'machine' },
  seated_leg_curl: { primary: 'legs',   equip: 'machine' },
  lying_leg_curl:  { primary: 'legs',   equip: 'machine' },
  hip_thrust:      { primary: 'glutes', equip: 'barbell' },
  calf_raise:      { primary: 'legs',   equip: 'machine' },

  // ── Core ──
  cable_crunch:    { primary: 'core', equip: 'cable' },
  hang_leg_raise:  { primary: 'core', equip: 'bodyweight' },
  toes_to_bar:     { primary: 'core', equip: 'bodyweight' },
  ab_wheel:        { primary: 'core', equip: 'bodyweight' },
  weighted_situp:  { primary: 'core', equip: 'dumbbell' },
  decline_situp:   { primary: 'core', equip: 'bodyweight' },
  russian_twist:   { primary: 'core', equip: 'dumbbell' },
  plank:           { primary: 'core', equip: 'bodyweight' },
}

// ─── Restriction → substitution rules ─────────────────────────────────
//
// Each rule lists exercise IDs we'd remove (because the user said they
// can't / shouldn't do them) and the IDs to insert in their place.
// Substitutions hit the SAME primary muscle so the day's coverage
// doesn't gain a hole.

interface SubRule {
  remove: string[]
  add: string[]
}

const RESTRICTION_SUBS: Record<Restriction, SubRule> = {
  heavy_squat: {
    remove: ['back_squat', 'front_squat'],
    // leg_press hits quads without spinal load; walking_lunge for unilateral.
    add: ['leg_press', 'walking_lunge'],
  },
  heavy_dl: {
    // Opting out of deadlifting means ALL barbell deadlift variants go, not
    // just the conventional pull — a user who says "no deadlifting" shouldn't
    // then see an RDL. Hip thrust (glutes) + lying leg curl (hamstrings) cover
    // the same posterior chain with zero floor-pull / axial-hinge demand.
    remove: ['conv_dl', 'rdl'],
    add: ['hip_thrust', 'lying_leg_curl'],
  },
  ohp: {
    // "No overhead pressing" means NO overhead press — not a swap from one
    // overhead variant to a lighter one. Every vertical press goes (barbell,
    // DB, machine, push press). Side + rear delt raises keep the shoulder
    // volume with zero overhead loading; the front delt is already covered by
    // the horizontal / incline pressing elsewhere in the program.
    remove: ['standing_ohp', 'push_press', 'seated_db_ohp', 'machine_ohp'],
    add: ['db_lat_raise', 'rear_delt_fly'],
  },
  heavy_pull: {
    remove: ['pullup_weighted', 'bb_row', 'pendlay_row'],
    add: ['lat_pulldown', 'chest_supp_row'],
  },
  explosive: {
    // No real explosive lifts in our library — only push_press qualifies.
    remove: ['push_press'],
    add: ['seated_db_ohp'],
  },
  bench: {
    remove: ['bench_bb', 'incl_bb_bench', 'close_grip'],
    add: ['flat_db_press', 'incl_db_press'],
  },
  lower_back: {
    // Anything that demands a braced lumbar under heavy load. Trap-bar
    // would be ideal but we don't carry it — so we remove + substitute.
    remove: ['back_squat', 'front_squat', 'conv_dl', 'rdl', 'bb_row', 'pendlay_row'],
    // Hip thrust drives the glutes with a neutral spine and no axial load, so
    // the posterior chain isn't left with only a leg curl once the hinges go.
    add: ['leg_press', 'hip_thrust', 'lying_leg_curl', 'chest_supp_row', 'lat_pulldown'],
  },
}

// ─── Equipment availability ───────────────────────────────────────────

const EQUIPMENT_AVAILABILITY: Record<Equipment, Equip[]> = {
  commercial: ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'bands'],
  home_full:  ['barbell', 'dumbbell', 'bodyweight'],
  dumbbells:  ['dumbbell', 'bodyweight'],
  bodyweight: ['bodyweight', 'bands'],
  mix:        ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'bands'],
}

function isAvailable(id: string, equipment: Equipment): boolean {
  const tag = EX_TAGS[id]
  if (!tag) return true // unknown id → don't filter, let the picker handle it
  return EQUIPMENT_AVAILABILITY[equipment].includes(tag.equip)
}

// Fallback bodyweight/DB substitutes by primary muscle, used when an
// exercise gets filtered out for equipment and the restriction-subs
// table didn't already supply a replacement.
const EQUIPMENT_FALLBACK: Record<Muscle, Record<Equipment, string | null>> = {
  chest:     { commercial: null, home_full: null, dumbbells: 'flat_db_press', bodyweight: 'dips_weighted', mix: null },
  back:      { commercial: null, home_full: null, dumbbells: 'chest_supp_row', bodyweight: 'pullup', mix: null },
  shoulders: { commercial: null, home_full: null, dumbbells: 'seated_db_ohp', bodyweight: 'pullup', mix: null },
  arms:      { commercial: null, home_full: null, dumbbells: 'hammer_curl', bodyweight: 'dips_weighted', mix: null },
  legs:      { commercial: null, home_full: null, dumbbells: 'bulgarian_ss', bodyweight: 'walking_lunge', mix: null },
  glutes:    { commercial: null, home_full: null, dumbbells: 'bulgarian_ss', bodyweight: 'walking_lunge', mix: null },
  core:      { commercial: null, home_full: null, dumbbells: 'plank', bodyweight: 'plank', mix: null },
}

// ─── Priority-bias exercises by category × priority ───────────────────
//
// When the user picks a body part to bias toward, we surface an extra
// accessory option from this list in the picker AND auto-add one to the
// matching day in the engine output. The chosen ID should be different
// from anything the base preset already includes.

const PRIORITY_EXTRAS: Record<Exclude<Priority, 'balanced'>, Record<Category, string | null>> = {
  // upper = combined push+pull day; lower = legs-style day. We let the
  // upper-body priority extras attach to the upper category and the leg
  // extra attach to lower, so an upper/lower split still picks up bias.
  chest:     { push: 'cable_fly',     pull: null,           legs: null,        rest: null, upper: 'cable_fly',     lower: null },
  back:      { push: null,            pull: 'lat_pulldown', legs: null,        rest: null, upper: 'lat_pulldown',  lower: null },
  shoulders: { push: 'db_lat_raise',  pull: 'face_pull',    legs: null,        rest: null, upper: 'db_lat_raise',  lower: null },
  arms:      { push: 'tri_pushdown',  pull: 'cable_curl',   legs: null,        rest: null, upper: 'tri_pushdown',  lower: null },
  legs:      { push: null,            pull: null,           legs: 'leg_press', rest: null, upper: null,            lower: 'leg_press' },
}

// ─── Recommendation reasons ──────────────────────────────────────────
//
// Each engine pass attaches a one-sentence "why we picked this for you"
// reason to every exercise it touches. The picker UI surfaces these via
// the "recommended" pill. Reasons are intake-derived (or goal-derived) —
// if we can't quote something the user actually told us, we don't emit
// a reason, and the picker shows no pill on that exercise.
//
// Reasons live in memory only. We never persist them — they re-derive
// any time intake answers change.

export type ReasonKind =
  | 'restriction-sub'        // swapped because of an intake Restriction the user opted out of
  | 'equipment-fit'          // substituted to match the user's Equipment answer
  | 'priority-add'           // added because user picked this body part as a Priority
  | 'goal-longevity'         // swapped to dumbbell/machine variant because goal.outcome === 'longevity'
  | 'form-confidence-swap'   // v2 — swapped because formConfidence = skip_them or still_learning
  | 'movement-preference'    // v2 — swapped because movementPreference biased toward a family
  | 'foundation'             // baseline preset compound — anchor lift for this day pattern
  | 'accessory'              // baseline preset accessory — supports the day's primary work
  | 'volume-floor'           // engine added this because a muscle was below MEV for the user's goal

export interface RecommendationReason {
  kind: ReasonKind
  /** ≤ 14 words, second person, references the user's actual answer or
   *  the split their answers matched into. */
  sentence: string
  /** Which questionnaire field the reason traces back to. */
  sourceLabel: 'restrictions' | 'equipment' | 'priorities' | 'goal' | 'recovery' | 'your split' | 'weekly volume' | 'form confidence' | 'movement preference'
  /** Optional one-liner showing the exercise's volume credit for its
   *  primary muscle ("Hits 3 of your 12 weekly chest sets."). Rendered
   *  as a separate line in the modal so it doesn't clutter the main
   *  sentence. */
  volumeContext?: string
}

/** Key shape for the reasons map: `${dayIdx}:${exerciseId}`. */
function reasonKey(dayIdx: number, exId: string): string {
  return `${dayIdx}:${exId}`
}

// User-facing labels for each Restriction value — must match the chip
// labels rendered in IntakeQuiz.tsx so the reason copy quotes exactly
// what the user clicked.
const RESTRICTION_LABEL: Record<Restriction, string> = {
  heavy_squat: 'heavy squatting',
  heavy_dl:    'heavy deadlifting',
  ohp:         'overhead pressing',
  heavy_pull:  'heavy pulling',
  explosive:   'jumping and explosive work',
  bench:       'bench pressing',
  lower_back:  'lower-back loading',
}

// User-facing fragment for each Equipment value — used in the
// equipment-fit reason sentence.
const EQUIPMENT_PHRASE: Record<Equipment, string> = {
  commercial: 'a commercial gym',
  home_full:  'a full home gym',
  dumbbells:  'dumbbells at home',
  bodyweight: 'bodyweight only',
  mix:        'a mixed setup',
}

// User-facing labels for each Priority value — used in the priority-add
// reason sentence.
const PRIORITY_LABEL: Record<Exclude<Priority, 'balanced'>, string> = {
  chest:     'chest',
  back:      'back',
  shoulders: 'shoulders',
  arms:      'arms',
  legs:      'legs',
}

// ─── Public API ──────────────────────────────────────────────────────

export interface RecommendationResult {
  days: PresetDay[]
  /** Keyed by `${dayIdx}:${exerciseId}`. Engine-touched and baseline
   *  exercises both get a reason now (the baseline pass attaches a
   *  foundation/accessory reason to anything else still uncovered). */
  reasons: Record<string, RecommendationReason>
  /** Per-muscle weekly volume audit — sets credited, goal target after
   *  modifiers, and a status flag (under_mv / under_mev / in_range /
   *  at_mrv_ceiling). Surfaces in the picker UI as the "your program
   *  hits N of X weekly sets" line. */
  audit: ReturnType<typeof import('@/lib/training/volumeAudit').auditWeeklyVolume>
}

/**
 * Personalize a preset's exercise list using the user's intake answers.
 * Returns a new PresetDay[] — never mutates the input.
 *
 * Application order matters: restrictions first (hard "do not"), then
 * equipment (hard "cannot"), then priorities (additive bias).
 *
 * `goal` (Vitality Goal preferences) is optional and acts as a
 * strategic overlay: if the user said injury is the thing in the way
 * (but didn't pin a specific lift in intake.restrictions), we apply a
 * "general caution" swap-set. If outcome is longevity, we prefer
 * dumbbell/machine variants. If outcome is cut, we suppress the
 * priority bias (volume management during a deficit). If bulk, we
 * boost it. Goal never overrides hard intake-stated restrictions.
 *
 * Returns both the personalized days AND a reasons map keyed by
 * `${dayIdx}:${exerciseId}` so the picker can show "why we picked
 * this" on each engine-touched exercise.
 */
export function recommendExercises(
  preset: Preset,
  answers: IntakeAnswers,
  goal?: GoalPreferences | null,
): RecommendationResult {
  // If Goal says injury is the constraint but the user didn't pin any
  // specific restrictions in the intake, synthesize a general-caution
  // set so we don't ship them barbell back squats + heavy deadlifts
  // when they told us injury is the thing most likely to derail them.
  // Specific intake restrictions always still apply on top.
  const effectiveRestrictions = (() => {
    if (!goal || goal.constraint !== 'injury') return answers.restrictions
    if (answers.restrictions.length > 0) return answers.restrictions
    return ['heavy_squat', 'heavy_dl', 'bench'] as Restriction[]
  })()

  // ─── Goal behavior projection ─────────────────────────────────────
  //
  // The separate Goal quiz (GoalPreferences) used to be the only signal
  // that drove volume decisions. But the intake also asks "what's your
  // goal?" and the answer there should program just as hard. So derive
  // a behavior signal from EITHER source — Goal quiz wins when present,
  // intake.goal acts as the fallback.

  type BehaviorSignal = 'cut' | 'bulk' | 'maintain' | 'longevity' | null

  const behavior: BehaviorSignal = (() => {
    if (goal) {
      // Goal quiz takes precedence — outcome values map directly.
      if (goal.outcome === 'cut') return 'cut'
      if (goal.outcome === 'bulk') return 'bulk'
      if (goal.outcome === 'longevity') return 'longevity'
      return 'maintain'  // recomp + maintain both sit at baseline
    }
    // Fall back to intake.goal so a user who hasn't taken the Goal quiz
    // still gets goal-driven volume programming.
    switch (answers.goal) {
      case 'fat_loss': return 'cut'
      case 'muscle':   return 'bulk'
      case 'strength': return 'bulk'   // strength also benefits from higher work-set count
      case 'health':   return 'longevity'
      case 'recomp':   return 'maintain'
      default:         return null
    }
  })()

  // Outcome bias for the priority pass. Cut suppresses extra accessory
  // additions (managing volume during a deficit); bulk doubles them
  // (frequency × volume is what grows muscle); maintain/longevity stay
  // default. Beginners/returners are never doubled — technique
  // acquisition + recovery beats peak volume.
  const beginnerOrReturning = answers.experience === 'new' || answers.experience === 'back_long'
  const priorityMultiplier: number = (() => {
    if (behavior === 'cut') return 0
    if (behavior === 'bulk' && !beginnerOrReturning) return 2
    return 1
  })()

  // Accumulator the apply* helpers write into. First-writer wins so a
  // restriction reason isn't overwritten by a later priority pass on
  // the same exercise id.
  const reasons: Record<string, RecommendationReason> = {}
  const setReason = (dayIdx: number, exId: string, reason: RecommendationReason) => {
    const key = reasonKey(dayIdx, exId)
    if (!(key in reasons)) reasons[key] = reason
  }

  // First pass — personalize each day's exercises (rest days untouched).
  const tailored = preset.days.map((day, dayIdx) => {
    if (day.category === 'rest') return { ...day }
    let exs = day.exercises.map(e => ({ ...e }))

    exs = applyRestrictionSubs(exs, effectiveRestrictions, day.category, dayIdx, setReason)
    // v2 form-confidence + movement-preference passes. Order: form
    // confidence first (capacity floor — "I can't / won't do BB squats"),
    // movement preference second (expressed lean within what's left).
    // Both run BEFORE equipment filter so the equipment fallback can
    // re-substitute if the user's preferred family isn't available
    // (e.g. machine swap on a dumbbell-only home gym → DB fallback).
    exs = applyFormConfidenceSwaps(exs, answers.formConfidence, dayIdx, setReason)
    exs = applyMovementPreferenceSwaps(exs, answers.movementPreference, dayIdx, setReason)
    exs = applyEquipmentFilter(exs, answers.equipment, dayIdx, setReason)
    if (behavior === 'longevity') {
      // Joint preservation > peak loading. Swap any remaining barbell
      // main lifts for the dumbbell/machine variant where one exists.
      // Runs after equipment filter so we only touch lifts the user
      // could still load up heavily. Triggers from EITHER the Goal quiz
      // outcome === 'longevity' OR the intake goal === 'health'.
      exs = applyLongevitySwaps(exs, dayIdx, setReason, !!goal)
    }
    exs = applyPriorityBias(
      exs,
      answers.priorities,
      day.category,
      day.type === 'HEAVY' ? 4 : 3,
      priorityMultiplier,
      dayIdx,
      setReason,
    )

    return { ...day, exercises: exs }
  })

  // Second pass — upgrade rest days to active rest where it would help.
  // Done after exercise tailoring so we can see the full schedule and
  // make decisions (e.g. don't pack 3 cardio sessions next to leg day).
  const days = applyActiveRest(tailored, answers)

  // Third pass — goal-driven rep prescription. Override every exercise's
  // preset-hardcoded sets/reps with the rep zone backed by the user's
  // goal answer (strength → 4×6, muscle → 3×10, health → 3×13 for a
  // tier-2 lift on a heavy day, for example). This is the difference
  // between "the system has a vague idea what you said" and "the system
  // actually programs for your goal." See lib/training/repZones.ts for
  // the science behind each zone.
  const tunedDays = days.map(day => {
    if (day.category === 'rest') return day
    return {
      ...day,
      exercises: day.exercises.map(ex => {
        const tier = EX[ex.id]?.tier
        if (!tier) return ex
        const rx = prescribeRepRx(tier, day.type, answers.goal, answers.failureTolerance)
        return { ...ex, sets: rx.sets, reps: rx.reps, targetRIR: rx.targetRIR }
      }),
    }
  })

  // Fourth pass — weekly volume audit. Count working sets per muscle
  // across all days, compare to the goal-conditioned target after the
  // recovery/cardio/outside-training modifiers. This is the math that
  // says "your week as designed hits 11 chest sets, target is 12."
  // We use it to enrich reason copy and to flag muscles under MEV.
  let auditedDays = tunedDays
  let audit = auditWeeklyVolume(auditedDays, answers)

  // Fifth pass — volume backfill. For each muscle that landed under
  // MEV after the engine's earlier passes, add an isolation accessory
  // (chosen for SFR per MUSCLE_BACKFILL). Find a day that already
  // trains that muscle area, append the lift, then recompute the audit
  // so subsequent reason copy uses the updated counts. Skip core (we
  // don't add core unless the user asked for it) and skip muscles
  // already at MV but below MEV by a sliver (avoid noise additions).
  const underMev = Object.values(audit).filter(a => a.status === 'under_mev')
  for (const a of underMev) {
    if (a.muscle === 'core') continue
    const backfill = MUSCLE_BACKFILL[a.muscle]
    if (!backfill) continue
    // Respect equipment availability — never add a cable lift to a
    // dumbbells-only user, etc.
    if (!isAvailable(backfill.id, answers.equipment)) continue
    // Find a non-rest day in the matching category. 'any' fits anywhere.
    const targetDayIdx = auditedDays.findIndex(d => {
      if (d.category === 'rest') return false
      if (d.exercises.some(e => e.id === backfill.id)) return false
      if (backfill.category === 'any') return true
      // Match by day category — be lenient (upper/lower presets need
      // backfill accessories on any non-rest day).
      if (backfill.category === d.category) return true
      if (backfill.category === 'push' && (d.category === 'push' || d.category === 'upper')) return true
      if (backfill.category === 'pull' && (d.category === 'pull' || d.category === 'upper')) return true
      if (backfill.category === 'legs' && (d.category === 'legs' || d.category === 'lower')) return true
      return false
    })
    if (targetDayIdx === -1) continue
    const day = auditedDays[targetDayIdx]
    const tier = EX[backfill.id]?.tier ?? 'iso'
    const rx = prescribeRepRx(tier, day.type, answers.goal, answers.failureTolerance)
    const newEx: DayExercise = { id: backfill.id, sets: rx.sets, reps: rx.reps, targetRIR: rx.targetRIR }
    auditedDays = auditedDays.map((d, i) =>
      i === targetDayIdx ? { ...d, exercises: [...d.exercises, newEx] } : d,
    )
    reasons[reasonKey(targetDayIdx, backfill.id)] = {
      kind: 'volume-floor',
      sentence: `Added to bring ${muscleHuman(a.muscle)} up to your minimum weekly volume.`,
      sourceLabel: 'weekly volume',
    }
  }
  // Re-audit after backfill so per-exercise volumeContext reflects the
  // updated counts.
  audit = auditWeeklyVolume(auditedDays, answers)

  // Sixth pass — baseline reasons + volume context. Every exercise on a
  // non-rest day that didn't already pick up a reason from an earlier
  // engine pass gets a per-exercise baseline reason. Then every reason
  // (including the ones from earlier passes) gets an optional
  // volumeContext one-liner showing how many sets it contributes
  // toward the user's weekly target for its primary muscle.
  auditedDays.forEach((day, dayIdx) => {
    if (day.category === 'rest') return
    day.exercises.forEach(ex => {
      const key = reasonKey(dayIdx, ex.id)
      if (!(key in reasons)) {
        reasons[key] = baselineReason(ex, answers)
      }
      // Attach volume context if we can attribute the exercise to a
      // muscle and have audit data. Computes the exercise's own credit
      // toward that muscle ("3 of your 12 weekly chest sets").
      const att = attributionFor(ex.id)
      if (att) {
        const muscleAudit = audit[att.primary]
        if (muscleAudit && muscleAudit.target > 0) {
          reasons[key] = {
            ...reasons[key],
            volumeContext: `Hits ${ex.sets} of your ${muscleAudit.target} weekly ${muscleHuman(att.primary)} sets.`,
          }
        }
      }
    })
  })

  // Final guarantee — the last thing the pipeline does. No earlier pass (the
  // weekly-volume backfill especially, but also equipment fallback / priority
  // adds) may re-introduce a lift the user opted out of. We strip the union of
  // every banned id here so an opted-out movement can NEVER reach the logger,
  // whatever tried to add it back. This is what makes "no overhead pressing"
  // actually mean zero overhead presses across all seven days.
  if (answers.restrictions.length > 0) {
    const banned = new Set(answers.restrictions.flatMap(r => RESTRICTION_SUBS[r]?.remove ?? []))
    if (banned.size > 0) {
      auditedDays = auditedDays.map(d => ({
        ...d,
        exercises: d.exercises.filter(e => !banned.has(e.id)),
      }))
    }
  }

  return { days: auditedDays, reasons, audit }
}

/**
 * No-op by design. Rest days always default to plain "Rest" with the
 * "+ add activity" chip; users opt into active rest manually via the
 * activity picker sheet. Earlier the rec engine pre-filled rest days
 * (Zone 2 for cardio-leaning intake, mobility for stressed recovery,
 * etc.), but the pre-filled "Intervals · 25 min" chip read as a random
 * button the user hadn't asked for. Decision: let users drive.
 *
 * Function kept so the call site (recommendExercises) stays stable —
 * easy to revive specific opt-in suggestions later without touching the
 * caller. Git history has the full prior rule set.
 */
function applyActiveRest(days: PresetDay[], _answers: IntakeAnswers): PresetDay[] {
  return days
}

function applyRestrictionSubs(
  exs: DayExercise[],
  restrictions: Restriction[],
  category: Category,
  dayIdx: number,
  setReason: (dayIdx: number, exId: string, reason: RecommendationReason) => void,
): DayExercise[] {
  if (restrictions.length === 0) return exs
  let out = exs
  const haveIds = new Set(out.map(e => e.id))

  for (const r of restrictions) {
    const rule = RESTRICTION_SUBS[r]
    const toRemove = new Set(rule.remove)
    // Remove banned IDs and remember which we removed so we can insert
    // the substitute at roughly the same slot (preserves day order).
    const removedSlots: number[] = []
    out = out.filter((e, i) => {
      if (toRemove.has(e.id)) { removedSlots.push(i); return false }
      return true
    })
    // For each substitute, insert if (a) the muscle category fits this
    // day (so we don't drop a chest sub into a leg day) and (b) not
    // already present. Take only as many as we removed.
    const insertable = rule.add.filter(id => {
      if (haveIds.has(id)) return false
      const tag = EX_TAGS[id]
      if (!tag) return false
      return matchesDayCategory(tag.primary, category)
    })
    const subs = insertable.slice(0, Math.max(1, removedSlots.length))
    if (subs.length > 0 && removedSlots.length > 0) {
      const insertAt = removedSlots[0]
      const before = out.slice(0, insertAt)
      const after = out.slice(insertAt)
      const newEntries = subs.map(id => withDefaultSetsReps(id))
      out = [...before, ...newEntries, ...after]
      subs.forEach(id => {
        haveIds.add(id)
        setReason(dayIdx, id, {
          kind: 'restriction-sub',
          sentence: `Picked because you said you avoid ${RESTRICTION_LABEL[r]}.`,
          sourceLabel: 'restrictions',
        })
      })
    }
  }

  // Final safety net: no substitution from one restriction may re-introduce a
  // lift another restriction banned (e.g. the "explosive" sub can't add back a
  // press the "ohp" opt-out removed). Strip the full union of banned ids last,
  // so a lift the user opted out of can NEVER survive to the logger.
  const bannedAll = new Set(restrictions.flatMap(r => RESTRICTION_SUBS[r].remove))
  out = out.filter(e => !bannedAll.has(e.id))

  return out
}

function applyEquipmentFilter(
  exs: DayExercise[],
  equipment: Equipment,
  dayIdx: number,
  setReason: (dayIdx: number, exId: string, reason: RecommendationReason) => void,
): DayExercise[] {
  if (equipment === 'commercial' || equipment === 'mix') return exs
  return exs.flatMap(e => {
    if (isAvailable(e.id, equipment)) return [e]
    const tag = EX_TAGS[e.id]
    if (!tag) return [e]
    const fallback = EQUIPMENT_FALLBACK[tag.primary][equipment]
    if (!fallback || fallback === e.id) return []
    setReason(dayIdx, fallback, {
      kind: 'equipment-fit',
      sentence: `Fits your setup. You said you train with ${EQUIPMENT_PHRASE[equipment]}.`,
      sourceLabel: 'equipment',
    })
    return [{ ...e, id: fallback }]
  })
}

function applyPriorityBias(
  exs: DayExercise[],
  priorities: Priority[],
  category: Category,
  defaultSets: number,
  multiplier: number = 1,
  dayIdx: number = 0,
  setReason: (dayIdx: number, exId: string, reason: RecommendationReason) => void = () => {},
): DayExercise[] {
  if (multiplier === 0) return exs                 // cut: skip accessory bonus
  if (!priorities || priorities.length === 0) return exs
  if (priorities.includes('balanced')) return exs
  const have = new Set(exs.map(e => e.id))
  const extras: DayExercise[] = []
  for (const p of priorities) {
    if (p === 'balanced') continue
    const extraId = PRIORITY_EXTRAS[p]?.[category]
    if (!extraId || have.has(extraId)) continue
    // Doubled multiplier (Goal.outcome=bulk) adds an extra set, not an
    // extra exercise — total tonnage goes up, total fatigue stays sane.
    const baseSets = Math.max(2, defaultSets - 1)
    const sets = multiplier > 1 ? baseSets + 1 : baseSets
    extras.push({ id: extraId, sets, reps: 12 })
    have.add(extraId)
    setReason(dayIdx, extraId, {
      kind: 'priority-add',
      sentence: `Extra ${PRIORITY_LABEL[p]} work. You picked it as a priority.`,
      sourceLabel: 'priorities',
    })
  }
  // Bias goes at the END of the day (after compounds) — accessory slot.
  return [...exs, ...extras]
}

// ─── Longevity swap map ───────────────────────────────────────────────
//
// When Goal.outcome === 'longevity', we swap heavy-loaded barbell main
// lifts for the dumbbell/machine variant. Joint stress matters more than
// peak loading when the user's training horizon is decades. We only swap
// when a clean equivalent exists in the EX library; otherwise leave the
// barbell version (the priority bias / equipment filter may still tune
// it further).

const LONGEVITY_SWAP: Record<string, string> = {
  bench_bb:      'flat_db_press',
  incl_bb_bench: 'incl_db_press',
  back_squat:    'hack_squat',
  front_squat:   'leg_press',
  standing_ohp:  'seated_db_ohp',
  push_press:    'seated_db_ohp',
  conv_dl:       'rdl',
  bb_row:        'chest_supp_row',
  pendlay_row:   'chest_supp_row',
  bb_curl:       'hammer_curl',
  skullcrushers: 'tri_pushdown',
}

function applyLongevitySwaps(
  exs: DayExercise[],
  dayIdx: number,
  setReason: (dayIdx: number, exId: string, reason: RecommendationReason) => void,
  fromGoalQuiz: boolean,
): DayExercise[] {
  const have = new Set(exs.map(e => e.id))
  // Reason copy references which signal triggered the swap so the user
  // sees their actual answer reflected back.
  const sentence = fromGoalQuiz
    ? 'Joint-friendly variant. You picked longevity as your outcome.'
    : 'Joint-friendly variant. You picked health as your goal.'
  return exs.flatMap(e => {
    const swap = LONGEVITY_SWAP[e.id]
    if (!swap) return [e]
    // Don't insert a duplicate — if the day already has the swap target
    // (rare but possible), drop the barbell version entirely.
    if (have.has(swap)) return []
    have.add(swap)
    have.delete(e.id)
    setReason(dayIdx, swap, {
      kind: 'goal-longevity',
      sentence,
      sourceLabel: 'goal',
    })
    return [{ ...e, id: swap }]
  })
}

// ─── Form-confidence swap maps (v2) ───────────────────────────────────
//
// formConfidence = 'skip_them' → strip barbell from primary slots
// formConfidence = 'still_learning' → swap the highest-form-risk lifts
//   (BB squat, BB bench, conv DL, push press) to safer variants but
//   keep the rest of the BB menu since BB rows / RDLs / curls are
//   lower-risk skill builds.
// formConfidence = 'rock_solid' or 'getting_there' → no swaps.

const FORM_CONFIDENCE_SKIP_SWAP: Record<string, string> = {
  bench_bb:      'machine_chest',
  incl_bb_bench: 'machine_chest',
  back_squat:    'leg_press',
  front_squat:   'leg_press',
  conv_dl:       'leg_press',
  standing_ohp:  'machine_ohp',
  push_press:    'machine_ohp',
  bb_row:        't_bar_row',
  pendlay_row:   't_bar_row',
  bb_curl:       'cable_curl',
  close_grip:    'tri_pushdown',
  skullcrushers: 'tri_pushdown',
}

const FORM_CONFIDENCE_LEARNING_SWAP: Record<string, string> = {
  bench_bb:    'flat_db_press',
  back_squat:  'leg_press',
  conv_dl:     'rdl',
  push_press:  'standing_ohp',
}

function applyFormConfidenceSwaps(
  exs: DayExercise[],
  formConfidence: IntakeAnswers['formConfidence'],
  dayIdx: number,
  setReason: (dayIdx: number, exId: string, reason: RecommendationReason) => void,
): DayExercise[] {
  if (formConfidence === 'rock_solid' || formConfidence === 'getting_there') return exs
  const map = formConfidence === 'skip_them'
    ? FORM_CONFIDENCE_SKIP_SWAP
    : FORM_CONFIDENCE_LEARNING_SWAP
  const sentence = formConfidence === 'skip_them'
    ? "You picked machines and dumbbells over barbell lifts."
    : "You said you're still learning the barbell lifts."
  const have = new Set(exs.map(e => e.id))
  return exs.flatMap(e => {
    const swap = map[e.id]
    if (!swap) return [e]
    if (have.has(swap)) return []
    have.add(swap)
    have.delete(e.id)
    setReason(dayIdx, swap, {
      kind: 'form-confidence-swap',
      sentence,
      sourceLabel: 'form confidence',
    })
    return [{ ...e, id: swap }]
  })
}

// ─── Movement-preference swap maps (v2) ───────────────────────────────
//
// Bias exercise choice toward the user's preferred implement family.
// `mix` + `barbell` are noops (BB is the engine default). The other
// three each have a per-family swap map.

const MOVEMENT_PREFERENCE_DUMBBELL: Record<string, string> = {
  bench_bb:      'flat_db_press',
  incl_bb_bench: 'incl_db_press',
  back_squat:    'db_split_squat',
  standing_ohp:  'seated_db_ohp',
  push_press:    'seated_db_ohp',
  bb_row:        'chest_supp_row',
  pendlay_row:   'single_arm_row',
  conv_dl:       'bulgarian_ss',
  bb_curl:       'incl_db_curl',
  rdl:           'bulgarian_ss',
}

const MOVEMENT_PREFERENCE_MACHINE: Record<string, string> = {
  bench_bb:      'machine_chest',
  incl_bb_bench: 'machine_chest',
  back_squat:    'leg_press',
  front_squat:   'leg_press',
  conv_dl:       'leg_press',
  standing_ohp:  'machine_ohp',
  push_press:    'machine_ohp',
  bb_row:        't_bar_row',
  pendlay_row:   't_bar_row',
  flat_db_press: 'machine_chest',
  seated_db_ohp: 'machine_ohp',
  chest_supp_row: 't_bar_row',
  single_arm_row: 't_bar_row',
  bb_curl:       'preacher_curl',
  hammer_curl:   'preacher_curl',
  skullcrushers: 'tri_pushdown',
}

const MOVEMENT_PREFERENCE_CABLE: Record<string, string> = {
  bench_bb:        'cable_fly',
  incl_bb_bench:   'cable_fly',
  bb_row:          'seated_cable_row',
  pendlay_row:     'seated_cable_row',
  chest_supp_row:  'seated_cable_row',
  single_arm_row:  'seated_cable_row',
  t_bar_row:       'seated_cable_row',
  db_lat_raise:    'cable_lat_raise',
  bb_curl:         'cable_curl',
  hammer_curl:     'cable_curl',
  incl_db_curl:    'cable_curl',
  skullcrushers:   'tri_pushdown',
}

function movementPreferenceMap(pref: IntakeAnswers['movementPreference']): Record<string, string> | null {
  switch (pref) {
    case 'dumbbell': return MOVEMENT_PREFERENCE_DUMBBELL
    case 'machine':  return MOVEMENT_PREFERENCE_MACHINE
    case 'cable':    return MOVEMENT_PREFERENCE_CABLE
    case 'barbell':
    case 'mix':
    default:         return null
  }
}

function movementPreferenceLabel(pref: IntakeAnswers['movementPreference']): string {
  switch (pref) {
    case 'dumbbell': return 'dumbbells'
    case 'machine':  return 'machines'
    case 'cable':    return 'cables'
    case 'barbell':  return 'barbell work'
    case 'mix':      return 'a mix of everything'
  }
}

function applyMovementPreferenceSwaps(
  exs: DayExercise[],
  movementPreference: IntakeAnswers['movementPreference'],
  dayIdx: number,
  setReason: (dayIdx: number, exId: string, reason: RecommendationReason) => void,
): DayExercise[] {
  const map = movementPreferenceMap(movementPreference)
  if (!map) return exs
  const sentence = `You said ${movementPreferenceLabel(movementPreference)} feel best.`
  const have = new Set(exs.map(e => e.id))
  return exs.flatMap(e => {
    const swap = map[e.id]
    if (!swap) return [e]
    if (have.has(swap)) return []
    have.add(swap)
    have.delete(e.id)
    setReason(dayIdx, swap, {
      kind: 'movement-preference',
      sentence,
      sourceLabel: 'movement preference',
    })
    return [{ ...e, id: swap }]
  })
}

function matchesDayCategory(muscle: Muscle, category: Category): boolean {
  // What primary muscles "belong" on each day category. Loose match —
  // we just want to avoid dropping a leg sub onto a chest day.
  switch (category) {
    case 'push': return muscle === 'chest' || muscle === 'shoulders' || muscle === 'arms'
    case 'pull': return muscle === 'back' || muscle === 'arms' || muscle === 'shoulders'
    case 'legs': return muscle === 'legs' || muscle === 'glutes' || muscle === 'back' // RDL/hip thrust
    case 'upper': return muscle === 'chest' || muscle === 'back' || muscle === 'shoulders' || muscle === 'arms'
    case 'lower': return muscle === 'legs' || muscle === 'glutes' || muscle === 'back' // RDL/hip thrust same as legs
    case 'rest': return false
  }
}

function withDefaultSetsReps(id: string): DayExercise {
  // We can't call defaultSetsReps here without knowing the dayType — but
  // restriction subs always land in a day where we already know context.
  // Use sensible mid-range defaults; the user can tweak in step 3.
  const tag = EX_TAGS[id]
  const tier = EX[id]?.tier
  if (tier === 'heavy_compound') return { id, sets: 3, reps: 6 }
  if (tier === 'compound')       return { id, sets: 3, reps: 10 }
  if (tag?.primary === 'core')   return { id, sets: 3, reps: 12 }
  return { id, sets: 3, reps: 12 }
}

/**
 * Picker-side helper: given a category + intake answers, return the
 * exercise IDs we'd suggest for the "Recommended for you" section.
 * These are the priority extras + restriction substitutes that the user
 * may want to add manually if they're tweaking a day off-script.
 */
export function recommendedAddsForPicker(category: Category, answers: IntakeAnswers): string[] {
  if (category === 'rest') return []
  const out: string[] = []

  // Priority extras (chest, back, etc. accessories)
  if (answers.priorities && !answers.priorities.includes('balanced')) {
    for (const p of answers.priorities) {
      if (p === 'balanced') continue
      const id = PRIORITY_EXTRAS[p]?.[category]
      if (id && !out.includes(id)) out.push(id)
    }
  }

  // Restriction substitutes that fit this day's category
  for (const r of answers.restrictions) {
    const rule = RESTRICTION_SUBS[r]
    for (const id of rule.add) {
      if (out.includes(id)) continue
      const tag = EX_TAGS[id]
      if (!tag || !matchesDayCategory(tag.primary, category)) continue
      out.push(id)
    }
  }

  return out
}

// ─── Compile-time sanity check ────────────────────────────────────────
// Flags any EX entry without a matching EX_TAGS entry. Runs at module
// load in dev; in prod it's tree-shaken away.
if (process.env.NODE_ENV !== 'production') {
  for (const id of Object.keys(EX)) {
    if (!EX_TAGS[id]) {
      // eslint-disable-next-line no-console
      console.warn(`[exerciseSelection] EX has "${id}" but EX_TAGS is missing it — recommendations will skip this lift.`)
    }
  }
}
