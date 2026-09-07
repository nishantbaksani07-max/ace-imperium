/**
 * Exercise library (EX) + types + the SPLIT seed for the workout logger.
 * Mirrors the canonical IDs from the v1 standalone
 * (~/Desktop/Vitality/split-standalone/index.html) but lives independently; v1
 * stays untouched. EX is the real exercise dictionary used everywhere; SPLIT is
 * the seed/default — user-customized rotations load from `training_settings`.
 */

export type DayType = 'HEAVY' | 'VOLUME' | 'RECOVERY'
export type Category = 'push' | 'pull' | 'legs' | 'rest' | 'upper' | 'lower'
export type Tier = 'heavy_compound' | 'compound' | 'heavy_iso' | 'iso' | 'ab'

export interface DayExercise {
  id: string
  sets: number
  reps: number
  /** v2 — per-set "reps in reserve" target derived from the user's
   *  failureTolerance intake answer. Optional so older saved splits
   *  still type-check; the logger falls back to RIR 1 (research default)
   *  when missing. */
  targetRIR?: number
  /** True for a lift the user added mid-session (today only, until they tap
   *  "keep"). Drives the "added today" tag + keep affordance. Never written
   *  to rotation_days — only lives on the in-session list + the workouts row. */
  added?: boolean
  /** Setup builder: the user's tuned base weight (kg) for this lift on this
   *  day. Fanned out to recommended_weights[`${id}__${dayType}`] on save.
   *  Absent until the user tunes the lift. */
  weightKg?: number
  /** Setup builder: the user's tuned rest (seconds). Fanned out to
   *  rest_overrides[`${id}__${dayType}`] on save. Absent until tuned. */
  restSec?: number
  /** Setup builder: true once the user has saved the tune sheet for this
   *  lift. Drives the row's tuned/untuned button + the "all tuned" glow. */
  tuned?: boolean
}

export interface SplitDay {
  day: number
  name: string
  type: DayType
  category: Category
  exercises: DayExercise[]
}

export interface ExerciseDef {
  name: string
  tier: Tier
  tip?: string
  /** Marks exercises where the logged weight is per-hand / per-side rather
   *  than total load (e.g., dumbbell press, single-arm row, walking lunge
   *  with DBs). Drives the small "/ea" indicator on the pill so a user
   *  swapping from a barbell lift doesn't read "28 kg" as the total. */
  perHand?: boolean
}

// All 8 days of the Vitality split (from standalone DEMO_SPLIT).
export const SPLIT: SplitDay[] = [
  {
    day: 1, name: 'Push heavy', type: 'HEAVY', category: 'push',
    exercises: [
      { id: 'bench_bb',         sets: 4, reps: 5  },
      { id: 'standing_ohp',     sets: 4, reps: 5  },
      { id: 'incl_db_press',    sets: 3, reps: 8  },
      { id: 'dips_weighted',    sets: 3, reps: 8  },
      { id: 'cable_lat_raise',  sets: 4, reps: 12 },
      { id: 'oh_tri_ext',       sets: 3, reps: 12 },
      { id: 'rear_delt_fly',    sets: 2, reps: 15 },
    ],
  },
  {
    day: 2, name: 'Pull heavy + abs', type: 'HEAVY', category: 'pull',
    exercises: [
      { id: 'pullup_weighted',  sets: 4, reps: 6  },
      { id: 'bb_row',           sets: 4, reps: 6  },
      { id: 'chest_supp_row',   sets: 3, reps: 8  },
      { id: 'lat_pulldown',     sets: 3, reps: 10 },
      { id: 'bb_curl',          sets: 4, reps: 7  },
      { id: 'hammer_curl',      sets: 3, reps: 10 },
      { id: 'reverse_pec',      sets: 3, reps: 15 },
      { id: 'cable_crunch',     sets: 4, reps: 12 },
      { id: 'hang_leg_raise',   sets: 3, reps: 12 },
    ],
  },
  {
    day: 3, name: 'Legs heavy', type: 'HEAVY', category: 'legs',
    exercises: [
      { id: 'back_squat',       sets: 5, reps: 5  },
      { id: 'rdl',              sets: 4, reps: 8  },
      { id: 'leg_press',        sets: 3, reps: 10 },
      { id: 'db_split_squat',   sets: 3, reps: 10 },
      { id: 'seated_leg_curl',  sets: 4, reps: 12 },
    ],
  },
  {
    day: 4, name: 'Push volume', type: 'VOLUME', category: 'push',
    exercises: [
      { id: 'incl_bb_bench',    sets: 4, reps: 8  },
      { id: 'seated_db_ohp',    sets: 4, reps: 10 },
      { id: 'flat_db_press',    sets: 3, reps: 10 },
      { id: 'cable_fly',        sets: 3, reps: 15 },
      { id: 'db_lat_raise',     sets: 5, reps: 13 },
      { id: 'tri_pushdown',     sets: 3, reps: 12 },
      { id: 'oh_tri_ext',       sets: 3, reps: 15 },
    ],
  },
  {
    day: 5, name: 'Pull volume + abs', type: 'VOLUME', category: 'pull',
    exercises: [
      { id: 'lat_pulldown',     sets: 4, reps: 10 },
      { id: 'seated_cable_row', sets: 4, reps: 10 },
      { id: 'chest_supp_row',   sets: 3, reps: 10 },
      { id: 'face_pull',        sets: 4, reps: 15 },
      { id: 'bb_curl',          sets: 4, reps: 10 },
      { id: 'cable_curl',       sets: 3, reps: 12 },
      { id: 'cable_crunch',     sets: 4, reps: 20 },
      { id: 'hang_leg_raise',   sets: 3, reps: 12 },
    ],
  },
  {
    day: 6, name: 'Legs volume', type: 'VOLUME', category: 'legs',
    exercises: [
      { id: 'leg_press',        sets: 4, reps: 10 },
      { id: 'bulgarian_ss',     sets: 3, reps: 10 },
      { id: 'rdl',              sets: 3, reps: 10 },
      { id: 'seated_leg_curl',  sets: 4, reps: 12 },
      { id: 'leg_ext',          sets: 4, reps: 15 },
    ],
  },
  {
    day: 7, name: 'Active recovery', type: 'RECOVERY', category: 'rest',
    exercises: [],
  },
  {
    day: 8, name: 'Full rest', type: 'RECOVERY', category: 'rest',
    exercises: [],
  },
]

// Exercise canonical names + tier classification (from standalone EX_TIER).
// Form tips are conversational coaching lifted from the standalone TIPS dict.
export const EX: Record<string, ExerciseDef> = {
  bench_bb:         { name: 'Barbell bench',          tier: 'heavy_compound', tip: 'Wrists stacked over elbows. Tuck the elbows slightly, drive into the bar, hold the arch.' },
  incl_bb_bench:    { name: 'Incline barbell bench',  tier: 'heavy_compound', tip: '30° incline max. Any higher and it becomes shoulder press. Touch upper chest.' },
  flat_db_press:    { name: 'Flat DB press',          tier: 'compound',       tip: 'Wrists stacked over elbows. Lower until DBs at chest line. Press in slight arc.', perHand: true },
  incl_db_press:    { name: 'Incline DB press',       tier: 'compound',       tip: '30° incline. Lower DBs to upper chest. Squeeze pecs at top.', perHand: true },
  machine_chest:    { name: 'Machine chest press',    tier: 'compound' },
  dips_weighted:    { name: 'Weighted dips',          tier: 'heavy_compound', tip: 'Lean forward 15° for chest bias. Lower until shoulders below elbows. Strict, no kipping.' },
  close_grip:       { name: 'Close-grip bench',       tier: 'compound',       tip: 'Hands shoulder-width. Elbows tucked. All triceps, no flare.' },
  cable_fly:        { name: 'Cable chest fly',        tier: 'iso',            tip: 'Slight bend in elbows, lock that angle. Hands meet in front of chest, squeeze.' },
  pec_deck:         { name: 'Pec deck',               tier: 'iso' },
  standing_ohp:     { name: 'Standing barbell OHP',   tier: 'heavy_compound', tip: 'Bar over mid-foot. Squeeze glutes, brace abs. Press straight, head through at lockout.' },
  seated_db_ohp:    { name: 'Seated DB shoulder press', tier: 'compound',     tip: 'Back flat against pad. DBs at ear level start. Press up and slightly in.', perHand: true },
  machine_ohp:      { name: 'Machine shoulder press', tier: 'compound' },
  push_press:       { name: 'Push press',             tier: 'heavy_compound', tip: 'Quarter-dip with the legs, drive through the floor, finish with the arms.' },
  db_lat_raise:     { name: 'DB lateral raise',       tier: 'iso',            tip: 'Lead with elbows, slight pinkie tilt at top. Stop at shoulder height.', perHand: true },
  cable_lat_raise:  { name: 'Cable lateral raise',    tier: 'iso',            tip: 'Cable from far side, behind body. Sweep across body and up.' },
  rear_delt_fly:    { name: 'Rear delt cable fly',    tier: 'iso' },
  reverse_pec:      { name: 'Reverse pec deck',       tier: 'iso' },
  tri_pushdown:     { name: 'Tricep rope pushdown',   tier: 'iso' },
  oh_tri_ext:       { name: 'Overhead cable tri ext', tier: 'iso' },
  skullcrushers:    { name: 'Skullcrushers',          tier: 'iso',            tip: 'Lower behind the head, not at the forehead. Keeps tension on the long head.' },
  pullup_weighted:  { name: 'Weighted pull-ups',      tier: 'heavy_compound', tip: 'Dead hang start. Drive elbows down and back. Chin clears the bar, full lockout below.' },
  pullup:           { name: 'Pull-ups',               tier: 'heavy_compound', tip: 'Dead hang. Strict. AMRAP, but leave one in the tank.' },
  bb_row:           { name: 'Barbell row',            tier: 'heavy_compound', tip: 'Hinge to 45°, neutral spine. Pull to lower chest, squeeze the upper back.' },
  pendlay_row:      { name: 'Pendlay row',            tier: 'heavy_compound', tip: 'Bar resets on the floor every rep. Explosive pull to the sternum.' },
  t_bar_row:        { name: 'T-bar row',              tier: 'heavy_compound' },
  seated_cable_row: { name: 'Seated cable row',       tier: 'compound' },
  chest_supp_row:   { name: 'Chest-supported DB row', tier: 'compound',       tip: 'Bench at 30°, lay flat. Drive elbows up + back. Squeeze, no bounce.', perHand: true },
  single_arm_row:   { name: 'Single-arm DB row',      tier: 'compound',       tip: 'Brace the working side with the opposite hand. Pull to the hip, not the chest.', perHand: true },
  lat_pulldown:     { name: 'Lat pulldown',           tier: 'compound',       tip: 'Slight lean back, drive elbows down and back. Stop at upper chest.' },
  face_pull:        { name: 'Cable face pull',        tier: 'iso',            tip: 'Rope high, pull to ears. External rotation at end. High reps, light weight.' },
  bb_curl:          { name: 'Barbell curl',           tier: 'heavy_iso',      tip: 'Elbows at sides. No swinging. Squeeze biceps hard at top.' },
  hammer_curl:      { name: 'Hammer curl',            tier: 'iso',            tip: 'Neutral grip throughout. Hits brachialis. Don’t swing.', perHand: true },
  cable_curl:       { name: 'Cable curl',             tier: 'iso' },
  incl_db_curl:     { name: 'Incline DB curl',        tier: 'iso',            tip: 'Bench at 45°, let arms hang straight. Full stretch on the long head.', perHand: true },
  preacher_curl:    { name: 'Preacher curl',          tier: 'iso',            tip: 'Pads in the armpits, elbows fixed. Slow eccentric, no relaxing at the bottom.' },
  back_squat:       { name: 'Barbell back squat',     tier: 'heavy_compound', tip: 'Bar on traps or rear delts. Knees track over toes. Hip + knee bend together.' },
  front_squat:      { name: 'Front squat',            tier: 'heavy_compound', tip: 'Elbows up, chest up. Bar racked on shoulders. Knees track over toes.' },
  hack_squat:       { name: 'Hack squat',             tier: 'compound' },
  leg_press:        { name: 'Leg press',              tier: 'compound',       tip: 'Feet shoulder-width. Don’t lock knees at top. Full ROM, no lower back lift.' },
  rdl:              { name: 'Romanian deadlift',      tier: 'heavy_compound', tip: 'Hinge at hips, soft knees. Bar against legs. Stretch hamstrings, drive hips through.' },
  conv_dl:          { name: 'Conventional deadlift',  tier: 'heavy_compound', tip: 'Bar over mid-foot. Hips back, chest proud. Drive the floor away, lock out with hips.' },
  bulgarian_ss:     { name: 'Bulgarian split squat',  tier: 'compound',       perHand: true },
  db_split_squat:   { name: 'DB split squat',         tier: 'compound',       perHand: true },
  walking_lunge:    { name: 'Walking lunge',          tier: 'compound',       tip: 'Long stride. Drive through the front heel. Chest stays tall.', perHand: true },
  leg_ext:          { name: 'Leg extension',          tier: 'iso' },
  seated_leg_curl:  { name: 'Seated leg curl',        tier: 'iso' },
  lying_leg_curl:   { name: 'Lying leg curl',         tier: 'iso',            tip: 'Hips pinned to the pad. Squeeze the hamstrings at the top.' },
  hip_thrust:       { name: 'Barbell hip thrust',     tier: 'compound',       tip: 'Bench at upper back. Drive heels through floor. Squeeze glutes at the top, ribs down.' },
  calf_raise:       { name: 'Calf raise',             tier: 'iso',            tip: 'Full stretch at the bottom, full contraction at the top. Slow.' },
  cable_crunch:     { name: 'Cable crunch',           tier: 'ab' },
  hang_leg_raise:   { name: 'Hanging leg raise',      tier: 'ab',             tip: 'Strict, no swing. Curl the pelvis up, not just the legs.' },
  toes_to_bar:      { name: 'Toes-to-bar',            tier: 'ab' },
  ab_wheel:         { name: 'Ab wheel rollout',       tier: 'ab',             tip: 'Brace hard, ribs down. Roll out as far as you can keep tension.' },
  weighted_situp:   { name: 'Weighted sit-up',        tier: 'ab' },
  decline_situp:    { name: 'Decline sit-up',         tier: 'ab' },
  russian_twist:    { name: 'Russian twist',          tier: 'ab' },
  plank:            { name: 'Plank',                  tier: 'ab',             tip: 'Glutes squeezed, ribs down, elbows under shoulders. Time-based.' },
}

// Suggested compounds + isolation per day category. Drives the exercise
// picker in the setup wizard so a "push" day shows push exercises front and
// center, etc. Ported from CATEGORY_GROUPS in the splitlog standalone.
export const CATEGORY_GROUPS: Record<Category, { compounds: string[]; isolation: string[] }> = {
  push: {
    compounds: ['bench_bb', 'incl_bb_bench', 'flat_db_press', 'incl_db_press', 'machine_chest', 'dips_weighted', 'close_grip', 'standing_ohp', 'seated_db_ohp', 'machine_ohp', 'push_press'],
    isolation: ['cable_fly', 'pec_deck', 'db_lat_raise', 'cable_lat_raise', 'rear_delt_fly', 'tri_pushdown', 'oh_tri_ext', 'skullcrushers'],
  },
  pull: {
    compounds: ['pullup_weighted', 'pullup', 'bb_row', 'pendlay_row', 't_bar_row', 'seated_cable_row', 'chest_supp_row', 'single_arm_row', 'lat_pulldown'],
    isolation: ['face_pull', 'reverse_pec', 'bb_curl', 'hammer_curl', 'cable_curl', 'incl_db_curl', 'preacher_curl'],
  },
  legs: {
    compounds: ['back_squat', 'front_squat', 'hack_squat', 'leg_press', 'rdl', 'conv_dl', 'bulgarian_ss', 'db_split_squat', 'walking_lunge', 'hip_thrust'],
    isolation: ['leg_ext', 'seated_leg_curl', 'lying_leg_curl', 'calf_raise'],
  },
  rest: {
    compounds: [],
    isolation: [],
  },
  upper: {
    compounds: ['bench_bb', 'incl_bb_bench', 'standing_ohp', 'seated_db_ohp', 'pullup_weighted', 'pullup', 'bb_row', 'pendlay_row', 'lat_pulldown', 'dips_weighted'],
    isolation: ['cable_fly', 'db_lat_raise', 'cable_lat_raise', 'rear_delt_fly', 'tri_pushdown', 'oh_tri_ext', 'face_pull', 'bb_curl', 'hammer_curl'],
  },
  lower: {
    compounds: ['back_squat', 'front_squat', 'leg_press', 'rdl', 'conv_dl', 'bulgarian_ss', 'walking_lunge', 'hip_thrust'],
    isolation: ['leg_ext', 'seated_leg_curl', 'lying_leg_curl', 'calf_raise'],
  },
}

// Abs / Core exercises — surfaced as a third group on every non-rest day
// in the exercise picker so any split can stack core work without renaming
// the day to "Pull + Abs".
export const ABS_EXERCISES = ['cable_crunch', 'hang_leg_raise', 'toes_to_bar', 'ab_wheel', 'weighted_situp', 'decline_situp', 'russian_twist', 'plank']

// Default sets/reps for a freshly-added exercise. Derived from tier × day
// type so adding a heavy-compound to a HEAVY day gives 4×5, while adding
// the same lift to a VOLUME day gives 4×8.
export function defaultSetsReps(tier: Tier, dayType: DayType): { sets: number; reps: number } {
  if (dayType === 'RECOVERY') return { sets: 2, reps: 12 }
  if (dayType === 'HEAVY') {
    switch (tier) {
      case 'heavy_compound': return { sets: 4, reps: 5 }
      case 'compound':       return { sets: 3, reps: 8 }
      case 'heavy_iso':      return { sets: 4, reps: 7 }
      case 'iso':            return { sets: 3, reps: 12 }
      case 'ab':             return { sets: 4, reps: 12 }
    }
  }
  switch (tier) {
    case 'heavy_compound': return { sets: 4, reps: 8 }
    case 'compound':       return { sets: 4, reps: 10 }
    case 'heavy_iso':      return { sets: 4, reps: 10 }
    case 'iso':            return { sets: 3, reps: 15 }
    case 'ab':             return { sets: 4, reps: 20 }
  }
  // Defensive fallback — every current Tier value is handled above, but a
  // future tier addition without an arm here would silently return
  // undefined and crash callers. Keep this safe.
  return { sets: 3, reps: 10 }
}

// Rest periods (seconds) by tier × day type. From REST_BY_TIER in standalone.
export const REST_SEC: Record<Tier, Record<DayType, number>> = {
  heavy_compound: { HEAVY: 210, VOLUME: 150, RECOVERY: 90 },
  compound:       { HEAVY: 150, VOLUME: 120, RECOVERY: 90 },
  heavy_iso:      { HEAVY: 105, VOLUME: 75,  RECOVERY: 60 },
  iso:            { HEAVY: 75,  VOLUME: 60,  RECOVERY: 45 },
  ab:             { HEAVY: 60,  VOLUME: 45,  RECOVERY: 45 },
}

export const TIER_LABEL: Record<Tier, string> = {
  heavy_compound: 'tier 1',
  compound:       'tier 2',
  heavy_iso:      'tier 2',
  iso:            'tier 3',
  ab:             'abs',
}

// Mini-history per exercise: top working-set weight from the last 6 sessions
// (oldest → newest). Populated from the `workouts` table once that's wired.
// Empty for now — the logger's HistoryDots component handles the no-history
// state by simply not rendering the trail.
export const HISTORY: Record<string, number[]> = {}

/**
 * Validate and parse `training_settings.rotation_days` jsonb into SplitDay[].
 * Returns null if the shape is malformed — caller should treat as "setup
 * not complete" and bounce the user to the wizard.
 *
 * We're defensive here because rotation_days is a jsonb column with no
 * Postgres-side schema enforcement: a half-finished setup, a botched
 * migration, or a manual DB edit can leave it in any shape, and the
 * SplitLog UI assumes the typed shape downstream (`day.exercises.length`,
 * `.map`, etc.). Without this guard a malformed row crashes the page.
 */
const VALID_DAY_TYPES = new Set<DayType>(['HEAVY', 'VOLUME', 'RECOVERY'])
const VALID_CATEGORIES = new Set<Category>(['push', 'pull', 'legs', 'rest', 'upper', 'lower'])

export function parseRotationDays(raw: unknown): SplitDay[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: SplitDay[] = []
  for (let i = 0; i < raw.length; i++) {
    const d = raw[i]
    if (!d || typeof d !== 'object') return null
    const obj = d as Record<string, unknown>
    if (typeof obj.name !== 'string') return null
    if (typeof obj.type !== 'string' || !VALID_DAY_TYPES.has(obj.type as DayType)) return null
    if (typeof obj.category !== 'string' || !VALID_CATEGORIES.has(obj.category as Category)) return null
    if (!Array.isArray(obj.exercises)) return null
    const exercises: DayExercise[] = []
    for (const e of obj.exercises) {
      if (!e || typeof e !== 'object') return null
      const ex = e as Record<string, unknown>
      if (typeof ex.id !== 'string') return null
      if (typeof ex.sets !== 'number' || !Number.isFinite(ex.sets) || ex.sets < 0) return null
      if (typeof ex.reps !== 'number' || !Number.isFinite(ex.reps) || ex.reps < 0) return null
      exercises.push({ id: ex.id, sets: ex.sets, reps: ex.reps })
    }
    out.push({
      day: i + 1,
      name: obj.name,
      type: obj.type as DayType,
      category: obj.category as Category,
      exercises,
    })
  }
  return out
}
