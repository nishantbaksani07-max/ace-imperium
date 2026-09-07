/**
 * Per-exercise alternatives — the two closest substitutes in the EX library
 * for every lift, paired with a weight-conversion coefficient.
 *
 * UX intent: "I'm at a different gym today and they don't have a flat
 * barbell bench — give me the closest match plus the equivalent weight."
 *
 * Coefficient semantics:
 *   new_weight ≈ source_weight × coef
 *
 * For example: bench_bb (80 kg) → flat_db_press has coef 0.35, so the
 * suggested DB weight is 80 × 0.35 = 28 kg per dumbbell. Coefficients are
 * biomechanically reasonable starting points (working set, similar rep
 * range, comparable trained user); hand-tune in this file as real-world
 * feedback comes in.
 *
 * Bodyweight-only exercises (pullup, plank, ab_wheel, etc.) keep coef = 1
 * for parity — converting bodyweight load between bodyweight movements
 * doesn't have a meaningful multiplier.
 */

export interface ExerciseAlternative {
  /** EX dictionary key of the alternative lift. */
  id: string
  /** Multiplier to apply to the source exercise's prescribed weight to get
   *  the equivalent on this alternative. See file-level comment. */
  coef: number
}

export const EXERCISE_ALTERNATIVES: Record<string, ExerciseAlternative[]> = {
  // ── Chest ───────────────────────────────────────────────────────
  bench_bb:       [{ id: 'flat_db_press',  coef: 0.35 }, { id: 'machine_chest',  coef: 0.85 }],
  incl_bb_bench:  [{ id: 'incl_db_press',  coef: 0.35 }, { id: 'machine_chest',  coef: 0.80 }],
  flat_db_press:  [{ id: 'bench_bb',       coef: 2.85 }, { id: 'incl_db_press',  coef: 0.85 }],
  incl_db_press:  [{ id: 'incl_bb_bench',  coef: 2.85 }, { id: 'flat_db_press',  coef: 1.15 }],
  machine_chest:  [{ id: 'bench_bb',       coef: 1.20 }, { id: 'flat_db_press',  coef: 0.42 }],
  dips_weighted:  [{ id: 'close_grip',     coef: 3.00 }, { id: 'bench_bb',       coef: 3.50 }],
  close_grip:     [{ id: 'bench_bb',       coef: 1.15 }, { id: 'skullcrushers',  coef: 0.50 }],
  cable_fly:      [{ id: 'pec_deck',       coef: 3.20 }, { id: 'flat_db_press',  coef: 1.30 }],
  pec_deck:       [{ id: 'cable_fly',      coef: 0.30 }, { id: 'flat_db_press',  coef: 0.45 }],

  // ── Shoulders ───────────────────────────────────────────────────
  standing_ohp:   [{ id: 'seated_db_ohp',  coef: 0.35 }, { id: 'push_press',     coef: 1.25 }],
  seated_db_ohp:  [{ id: 'standing_ohp',   coef: 2.70 }, { id: 'machine_ohp',    coef: 2.50 }],
  machine_ohp:    [{ id: 'standing_ohp',   coef: 1.00 }, { id: 'seated_db_ohp',  coef: 0.40 }],
  push_press:     [{ id: 'standing_ohp',   coef: 0.80 }, { id: 'machine_ohp',    coef: 0.85 }],
  db_lat_raise:   [{ id: 'cable_lat_raise', coef: 0.75 }, { id: 'rear_delt_fly', coef: 1.20 }],
  cable_lat_raise:[{ id: 'db_lat_raise',   coef: 1.35 }, { id: 'rear_delt_fly',  coef: 1.50 }],
  rear_delt_fly:  [{ id: 'reverse_pec',    coef: 1.25 }, { id: 'face_pull',      coef: 1.60 }],
  reverse_pec:    [{ id: 'rear_delt_fly',  coef: 0.80 }, { id: 'face_pull',      coef: 1.30 }],

  // ── Triceps ─────────────────────────────────────────────────────
  tri_pushdown:   [{ id: 'oh_tri_ext',     coef: 0.85 }, { id: 'skullcrushers',  coef: 0.75 }],
  oh_tri_ext:     [{ id: 'tri_pushdown',   coef: 1.20 }, { id: 'skullcrushers',  coef: 0.85 }],
  skullcrushers:  [{ id: 'tri_pushdown',   coef: 1.40 }, { id: 'close_grip',     coef: 2.20 }],

  // ── Back ────────────────────────────────────────────────────────
  pullup_weighted:[{ id: 'pullup',         coef: 0.00 }, { id: 'lat_pulldown',   coef: 5.00 }],
  pullup:         [{ id: 'pullup_weighted', coef: 0.00 }, { id: 'lat_pulldown',  coef: 1.00 }],
  bb_row:         [{ id: 'pendlay_row',    coef: 0.95 }, { id: 't_bar_row',      coef: 0.90 }],
  pendlay_row:    [{ id: 'bb_row',         coef: 1.05 }, { id: 't_bar_row',      coef: 0.95 }],
  t_bar_row:      [{ id: 'bb_row',         coef: 1.10 }, { id: 'seated_cable_row', coef: 1.05 }],
  seated_cable_row:[{ id: 't_bar_row',     coef: 0.95 }, { id: 'lat_pulldown',   coef: 1.00 }],
  chest_supp_row: [{ id: 'single_arm_row', coef: 1.20 }, { id: 'seated_cable_row', coef: 2.80 }],
  single_arm_row: [{ id: 'chest_supp_row', coef: 0.85 }, { id: 'seated_cable_row', coef: 2.50 }],
  lat_pulldown:   [{ id: 'seated_cable_row', coef: 1.05 }, { id: 'pullup',       coef: 0.00 }],
  face_pull:      [{ id: 'rear_delt_fly',  coef: 0.60 }, { id: 'reverse_pec',    coef: 0.75 }],

  // ── Biceps ──────────────────────────────────────────────────────
  bb_curl:        [{ id: 'cable_curl',     coef: 0.90 }, { id: 'preacher_curl',  coef: 0.75 }],
  hammer_curl:    [{ id: 'cable_curl',     coef: 2.30 }, { id: 'incl_db_curl',   coef: 0.80 }],
  cable_curl:     [{ id: 'bb_curl',        coef: 1.10 }, { id: 'incl_db_curl',   coef: 0.35 }],
  incl_db_curl:   [{ id: 'hammer_curl',    coef: 1.25 }, { id: 'preacher_curl',  coef: 2.00 }],
  preacher_curl:  [{ id: 'bb_curl',        coef: 1.35 }, { id: 'incl_db_curl',   coef: 0.50 }],

  // ── Legs ────────────────────────────────────────────────────────
  back_squat:     [{ id: 'front_squat',    coef: 0.75 }, { id: 'hack_squat',     coef: 1.30 }],
  front_squat:    [{ id: 'back_squat',     coef: 1.35 }, { id: 'hack_squat',     coef: 1.50 }],
  hack_squat:     [{ id: 'back_squat',     coef: 0.77 }, { id: 'leg_press',      coef: 1.40 }],
  leg_press:      [{ id: 'hack_squat',     coef: 0.70 }, { id: 'back_squat',     coef: 0.55 }],
  rdl:            [{ id: 'conv_dl',        coef: 1.20 }, { id: 'hip_thrust',     coef: 1.15 }],
  conv_dl:        [{ id: 'rdl',            coef: 0.85 }, { id: 'hip_thrust',     coef: 0.95 }],
  bulgarian_ss:   [{ id: 'db_split_squat', coef: 1.00 }, { id: 'walking_lunge',  coef: 0.65 }],
  db_split_squat: [{ id: 'bulgarian_ss',   coef: 1.00 }, { id: 'walking_lunge',  coef: 0.65 }],
  walking_lunge:  [{ id: 'bulgarian_ss',   coef: 1.55 }, { id: 'db_split_squat', coef: 1.55 }],
  hip_thrust:     [{ id: 'rdl',            coef: 0.85 }, { id: 'conv_dl',        coef: 1.10 }],
  leg_ext:        [{ id: 'hack_squat',     coef: 2.20 }, { id: 'leg_press',      coef: 3.00 }],
  seated_leg_curl:[{ id: 'lying_leg_curl', coef: 1.00 }, { id: 'rdl',            coef: 1.60 }],
  lying_leg_curl: [{ id: 'seated_leg_curl', coef: 1.00 }, { id: 'rdl',           coef: 1.60 }],
  calf_raise:     [{ id: 'leg_press',      coef: 3.00 }, { id: 'hack_squat',     coef: 2.20 }],

  // ── Abs ─────────────────────────────────────────────────────────
  cable_crunch:   [{ id: 'weighted_situp', coef: 0.40 }, { id: 'decline_situp',  coef: 0.40 }],
  hang_leg_raise: [{ id: 'toes_to_bar',    coef: 1.00 }, { id: 'ab_wheel',       coef: 1.00 }],
  toes_to_bar:    [{ id: 'hang_leg_raise', coef: 1.00 }, { id: 'ab_wheel',       coef: 1.00 }],
  ab_wheel:       [{ id: 'hang_leg_raise', coef: 1.00 }, { id: 'plank',          coef: 1.00 }],
  weighted_situp: [{ id: 'cable_crunch',   coef: 2.50 }, { id: 'decline_situp',  coef: 1.00 }],
  decline_situp:  [{ id: 'weighted_situp', coef: 1.00 }, { id: 'cable_crunch',   coef: 2.50 }],
  russian_twist:  [{ id: 'cable_crunch',   coef: 3.50 }, { id: 'weighted_situp', coef: 1.20 }],
  plank:          [{ id: 'ab_wheel',       coef: 1.00 }, { id: 'hang_leg_raise', coef: 1.00 }],
}

/**
 * Convenience lookup. Returns the 2 alternatives for an exercise, or an
 * empty array if no alternatives are defined.
 */
export function getAlternatives(exerciseId: string): ExerciseAlternative[] {
  return EXERCISE_ALTERNATIVES[exerciseId] ?? []
}
