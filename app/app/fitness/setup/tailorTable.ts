/**
 * Tailor table — bodyweight-multiplier-based starting weight estimates.
 *
 * Ported from v1 standalone's TAILOR_TABLE. Numbers target a ~5–8 RM working
 * set. The output is a server-side computed map { exerciseId: weight_kg }
 * stored in training_settings.recommended_weights and used as the initial
 * placeholder in the logger.
 *
 * Multiplier types:
 *   'bw'      → multiplier × bodyweight (full body load — squats, bench, etc.)
 *   'bwHalf'  → multiplier × bodyweight, per dumbbell (already halved for
 *               two-DB exercises; the logged value is per-dumbbell)
 *   'add'     → fixed added load on top of bodyweight (weighted pull-ups,
 *               weighted dips — logged value is the *added* weight)
 *   'fixed'   → fixed kg for that lift (cable / machine isolations / small DBs)
 *
 * Round 2.5 for ≥ 5 kg, 0.5 below. Bodyweight comes from user_profile.starting_weight_kg.
 */

type MultType = 'bw' | 'bwHalf' | 'add' | 'fixed'

interface TailorRow {
  type: MultType
  m: { beg: number; int: number; adv: number } // multipliers for male
  f: { beg: number; int: number; adv: number } // multipliers for female
}

export const TAILOR_TABLE: Record<string, TailorRow> = {
  // Barbell compounds
  bench_bb:      { type: 'bw', m: { beg: 0.50, int: 0.85, adv: 1.20 }, f: { beg: 0.30, int: 0.55, adv: 0.75 } },
  incl_bb_bench: { type: 'bw', m: { beg: 0.40, int: 0.70, adv: 1.00 }, f: { beg: 0.24, int: 0.45, adv: 0.65 } },
  back_squat:    { type: 'bw', m: { beg: 0.70, int: 1.20, adv: 1.65 }, f: { beg: 0.50, int: 0.85, adv: 1.20 } },
  front_squat:   { type: 'bw', m: { beg: 0.60, int: 1.00, adv: 1.40 }, f: { beg: 0.40, int: 0.70, adv: 1.00 } },
  rdl:           { type: 'bw', m: { beg: 0.65, int: 1.05, adv: 1.50 }, f: { beg: 0.45, int: 0.75, adv: 1.10 } },
  conv_dl:       { type: 'bw', m: { beg: 1.00, int: 1.55, adv: 2.10 }, f: { beg: 0.65, int: 1.05, adv: 1.55 } },
  standing_ohp:  { type: 'bw', m: { beg: 0.30, int: 0.55, adv: 0.80 }, f: { beg: 0.18, int: 0.35, adv: 0.50 } },
  bb_row:        { type: 'bw', m: { beg: 0.45, int: 0.80, adv: 1.10 }, f: { beg: 0.28, int: 0.50, adv: 0.70 } },
  pendlay_row:   { type: 'bw', m: { beg: 0.45, int: 0.80, adv: 1.10 }, f: { beg: 0.28, int: 0.50, adv: 0.70 } },
  t_bar_row:     { type: 'bw', m: { beg: 0.45, int: 0.80, adv: 1.10 }, f: { beg: 0.28, int: 0.50, adv: 0.70 } },
  bb_curl:       { type: 'bw', m: { beg: 0.20, int: 0.40, adv: 0.55 }, f: { beg: 0.12, int: 0.22, adv: 0.32 } },
  push_press:    { type: 'bw', m: { beg: 0.40, int: 0.70, adv: 1.00 }, f: { beg: 0.25, int: 0.45, adv: 0.65 } },
  close_grip:    { type: 'bw', m: { beg: 0.40, int: 0.70, adv: 1.00 }, f: { beg: 0.24, int: 0.45, adv: 0.65 } },

  // Weighted bodyweight (logged as ADDED weight)
  pullup_weighted: { type: 'add', m: { beg: 0, int: 10, adv: 25 }, f: { beg: 0, int: 5,  adv: 15 } },
  dips_weighted:   { type: 'add', m: { beg: 0, int: 15, adv: 35 }, f: { beg: 0, int: 7,  adv: 20 } },
  pullup:          { type: 'fixed', m: { beg: 0, int: 0, adv: 0 }, f: { beg: 0, int: 0, adv: 0 } },

  // Dumbbell compounds (per dumbbell)
  flat_db_press:   { type: 'bwHalf', m: { beg: 0.20, int: 0.35, adv: 0.50 }, f: { beg: 0.12, int: 0.22, adv: 0.32 } },
  incl_db_press:   { type: 'bwHalf', m: { beg: 0.16, int: 0.30, adv: 0.45 }, f: { beg: 0.10, int: 0.18, adv: 0.28 } },
  seated_db_ohp:   { type: 'bwHalf', m: { beg: 0.12, int: 0.22, adv: 0.32 }, f: { beg: 0.07, int: 0.14, adv: 0.20 } },
  chest_supp_row:  { type: 'bwHalf', m: { beg: 0.18, int: 0.32, adv: 0.45 }, f: { beg: 0.11, int: 0.20, adv: 0.30 } },
  single_arm_row:  { type: 'bwHalf', m: { beg: 0.18, int: 0.32, adv: 0.45 }, f: { beg: 0.11, int: 0.20, adv: 0.30 } },
  hammer_curl:     { type: 'bwHalf', m: { beg: 0.10, int: 0.18, adv: 0.25 }, f: { beg: 0.06, int: 0.12, adv: 0.17 } },
  incl_db_curl:    { type: 'bwHalf', m: { beg: 0.09, int: 0.16, adv: 0.22 }, f: { beg: 0.05, int: 0.10, adv: 0.15 } },
  preacher_curl:   { type: 'bwHalf', m: { beg: 0.10, int: 0.18, adv: 0.25 }, f: { beg: 0.06, int: 0.12, adv: 0.17 } },
  db_split_squat:  { type: 'bwHalf', m: { beg: 0.15, int: 0.28, adv: 0.42 }, f: { beg: 0.10, int: 0.18, adv: 0.28 } },
  bulgarian_ss:    { type: 'bwHalf', m: { beg: 0.15, int: 0.28, adv: 0.42 }, f: { beg: 0.10, int: 0.18, adv: 0.28 } },
  walking_lunge:   { type: 'bwHalf', m: { beg: 0.12, int: 0.22, adv: 0.32 }, f: { beg: 0.08, int: 0.15, adv: 0.22 } },

  // Cable / machine fixed weights
  machine_chest:   { type: 'fixed', m: { beg: 30, int: 50, adv: 70 },  f: { beg: 18, int: 30, adv: 45 } },
  machine_ohp:     { type: 'fixed', m: { beg: 25, int: 40, adv: 55 },  f: { beg: 15, int: 25, adv: 35 } },
  cable_fly:       { type: 'fixed', m: { beg: 12, int: 18, adv: 25 },  f: { beg: 7,  int: 12, adv: 18 } },
  pec_deck:        { type: 'fixed', m: { beg: 25, int: 40, adv: 55 },  f: { beg: 15, int: 25, adv: 35 } },
  cable_lat_raise: { type: 'fixed', m: { beg: 5,  int: 10, adv: 14 },  f: { beg: 3,  int: 6,  adv: 9  } },
  db_lat_raise:    { type: 'fixed', m: { beg: 6,  int: 10, adv: 14 },  f: { beg: 3,  int: 6,  adv: 9  } },
  rear_delt_fly:   { type: 'fixed', m: { beg: 6,  int: 10, adv: 14 },  f: { beg: 3,  int: 6,  adv: 9  } },
  reverse_pec:     { type: 'fixed', m: { beg: 20, int: 30, adv: 40 },  f: { beg: 12, int: 18, adv: 25 } },
  face_pull:       { type: 'fixed', m: { beg: 15, int: 25, adv: 35 },  f: { beg: 9,  int: 15, adv: 22 } },
  cable_curl:      { type: 'fixed', m: { beg: 15, int: 25, adv: 35 },  f: { beg: 9,  int: 15, adv: 22 } },
  tri_pushdown:    { type: 'fixed', m: { beg: 20, int: 35, adv: 50 },  f: { beg: 12, int: 22, adv: 32 } },
  oh_tri_ext:      { type: 'fixed', m: { beg: 18, int: 30, adv: 40 },  f: { beg: 11, int: 18, adv: 25 } },
  skullcrushers:   { type: 'fixed', m: { beg: 15, int: 25, adv: 35 },  f: { beg: 9,  int: 15, adv: 22 } },
  lat_pulldown:    { type: 'fixed', m: { beg: 35, int: 55, adv: 75 },  f: { beg: 22, int: 35, adv: 48 } },
  seated_cable_row:{ type: 'fixed', m: { beg: 40, int: 60, adv: 80 },  f: { beg: 25, int: 38, adv: 52 } },
  hack_squat:      { type: 'fixed', m: { beg: 50, int: 90, adv: 130 }, f: { beg: 30, int: 55, adv: 80 } },
  leg_press:       { type: 'fixed', m: { beg: 80, int: 140, adv: 200},f: { beg: 50, int: 90, adv: 130 } },
  leg_ext:         { type: 'fixed', m: { beg: 25, int: 45, adv: 65 },  f: { beg: 15, int: 28, adv: 40 } },
  seated_leg_curl: { type: 'fixed', m: { beg: 30, int: 45, adv: 60 },  f: { beg: 18, int: 28, adv: 40 } },
  lying_leg_curl:  { type: 'fixed', m: { beg: 30, int: 45, adv: 60 },  f: { beg: 18, int: 28, adv: 40 } },
  hip_thrust:      { type: 'fixed', m: { beg: 60, int: 100, adv: 140},f: { beg: 40, int: 70, adv: 100 } },
  calf_raise:      { type: 'fixed', m: { beg: 60, int: 100, adv: 140},f: { beg: 40, int: 70, adv: 100 } },

  // Ab work — usually unweighted or a fixed plate
  cable_crunch:    { type: 'fixed', m: { beg: 15, int: 25, adv: 40 }, f: { beg: 10, int: 18, adv: 30 } },
  hang_leg_raise:  { type: 'fixed', m: { beg: 0,  int: 0,  adv: 0  }, f: { beg: 0,  int: 0,  adv: 0  } },
  ab_wheel:        { type: 'fixed', m: { beg: 0,  int: 0,  adv: 0  }, f: { beg: 0,  int: 0,  adv: 0  } },
  weighted_situp:  { type: 'fixed', m: { beg: 5,  int: 10, adv: 20 }, f: { beg: 2.5,int: 7,  adv: 12 } },
  decline_situp:   { type: 'fixed', m: { beg: 0,  int: 5,  adv: 12 }, f: { beg: 0,  int: 2.5,adv: 7  } },
  russian_twist:   { type: 'fixed', m: { beg: 5,  int: 10, adv: 15 }, f: { beg: 2.5,int: 5,  adv: 10 } },
  toes_to_bar:     { type: 'fixed', m: { beg: 0,  int: 0,  adv: 0  }, f: { beg: 0,  int: 0,  adv: 0  } },
  plank:           { type: 'fixed', m: { beg: 0,  int: 0,  adv: 0  }, f: { beg: 0,  int: 0,  adv: 0  } },
}

type Sex = 'M' | 'F'
type GymLevel = 'beginner' | 'intermediate' | 'advanced'

/** Round to the nearest 2.5kg if weight ≥ 5kg, else nearest 0.5kg. */
function gymRound(kg: number): number {
  if (kg <= 0) return 0
  if (kg < 5) return Math.round(kg * 2) / 2
  return Math.round(kg / 2.5) * 2.5
}

/**
 * Compute starting weight (kg) for a single exercise given the user's
 * profile + gym level. Returns 0 for bodyweight-only exercises.
 */
export function computeStartingWeight(
  exerciseId: string,
  bodyweightKg: number,
  sex: Sex,
  level: GymLevel
): number {
  const row = TAILOR_TABLE[exerciseId]
  if (!row) return 0
  const levelKey = level === 'beginner' ? 'beg' : level === 'intermediate' ? 'int' : 'adv'
  const mult = (sex === 'M' ? row.m : row.f)[levelKey]
  let raw: number
  switch (row.type) {
    case 'bw':     raw = bodyweightKg * mult; break
    case 'bwHalf': raw = bodyweightKg * mult; break
    case 'add':    raw = mult; break
    case 'fixed':  raw = mult; break
  }
  return gymRound(raw)
}

/**
 * Compute the full { exerciseId: weight_kg } map for the given exercise IDs.
 * Use this server-side when saving training setup — store result in
 * training_settings.recommended_weights.
 */
export function computeRecommendedWeights(
  exerciseIds: string[],
  bodyweightKg: number,
  sex: Sex,
  level: GymLevel
): Record<string, number> {
  const map: Record<string, number> = {}
  for (const id of exerciseIds) {
    map[id] = computeStartingWeight(id, bodyweightKg, sex, level)
  }
  return map
}
