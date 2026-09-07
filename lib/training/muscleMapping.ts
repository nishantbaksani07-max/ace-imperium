/**
 * Fine-grained muscle attribution per exercise.
 *
 * EX_TAGS in `app/app/fitness/setup/exerciseSelection.ts` uses a coarse
 * taxonomy (chest | back | shoulders | arms | legs | glutes | core)
 * that's adequate for restriction/equipment subs but too blunt for
 * volume audits. A bench press doesn't just hit "chest" — it also
 * loads front delts and triceps as meaningful secondary movers, and
 * those secondary contributions are real volume for those muscles
 * (just not full credit).
 *
 * Each exercise maps to one PRIMARY MuscleGroup (counts as 1.0 set
 * toward that muscle's weekly total) and zero or more SECONDARY
 * groups (each counts as 0.5 sets). The 0.5 weighting follows
 * Schoenfeld's convention in his weekly-volume analyses — direct work
 * counts as a full set, indirect/synergistic work counts as a half.
 */

import type { MuscleGroup } from './volumeLandmarks'

export interface MuscleAttribution {
  primary: MuscleGroup
  secondary?: MuscleGroup[]
}

/**
 * Map each EX id from `app/app/fitness/log/splitData.ts` to its
 * primary and secondary muscle groups. If an id is missing here,
 * `attributionFor()` falls back to undefined and the audit skips it.
 */
export const EXERCISE_MUSCLE_ATTRIBUTION: Record<string, MuscleAttribution> = {
  // ── Push (chest / shoulders / triceps) ──
  bench_bb:        { primary: 'chest',       secondary: ['front_delts', 'triceps'] },
  incl_bb_bench:   { primary: 'chest',       secondary: ['front_delts', 'triceps'] },
  flat_db_press:   { primary: 'chest',       secondary: ['front_delts', 'triceps'] },
  incl_db_press:   { primary: 'chest',       secondary: ['front_delts', 'triceps'] },
  machine_chest:   { primary: 'chest',       secondary: ['front_delts', 'triceps'] },
  dips_weighted:   { primary: 'chest',       secondary: ['triceps', 'front_delts'] },
  close_grip:      { primary: 'triceps',     secondary: ['chest', 'front_delts'] },
  cable_fly:       { primary: 'chest' },
  pec_deck:        { primary: 'chest' },
  standing_ohp:    { primary: 'front_delts', secondary: ['triceps', 'side_delts'] },
  seated_db_ohp:   { primary: 'front_delts', secondary: ['triceps', 'side_delts'] },
  machine_ohp:     { primary: 'front_delts', secondary: ['triceps', 'side_delts'] },
  push_press:      { primary: 'front_delts', secondary: ['triceps', 'quads'] },
  db_lat_raise:    { primary: 'side_delts' },
  cable_lat_raise: { primary: 'side_delts' },
  rear_delt_fly:   { primary: 'rear_delts' },
  reverse_pec:     { primary: 'rear_delts' },
  tri_pushdown:    { primary: 'triceps' },
  oh_tri_ext:      { primary: 'triceps' },
  skullcrushers:   { primary: 'triceps' },

  // ── Pull (back / biceps / rear delts) ──
  pullup_weighted:  { primary: 'lats',           secondary: ['biceps', 'mid_upper_back'] },
  pullup:           { primary: 'lats',           secondary: ['biceps', 'mid_upper_back'] },
  bb_row:           { primary: 'mid_upper_back', secondary: ['lats', 'biceps', 'rear_delts'] },
  pendlay_row:      { primary: 'mid_upper_back', secondary: ['lats', 'biceps', 'rear_delts'] },
  t_bar_row:        { primary: 'mid_upper_back', secondary: ['lats', 'biceps'] },
  seated_cable_row: { primary: 'mid_upper_back', secondary: ['lats', 'biceps'] },
  chest_supp_row:   { primary: 'mid_upper_back', secondary: ['lats', 'biceps', 'rear_delts'] },
  single_arm_row:   { primary: 'lats',           secondary: ['mid_upper_back', 'biceps'] },
  lat_pulldown:     { primary: 'lats',           secondary: ['biceps', 'mid_upper_back'] },
  face_pull:        { primary: 'rear_delts',     secondary: ['mid_upper_back'] },
  bb_curl:          { primary: 'biceps' },
  hammer_curl:      { primary: 'biceps' },
  cable_curl:       { primary: 'biceps' },
  incl_db_curl:     { primary: 'biceps' },
  preacher_curl:    { primary: 'biceps' },

  // ── Legs (quads / hamstrings / glutes / calves) ──
  back_squat:      { primary: 'quads',      secondary: ['glutes', 'hamstrings'] },
  front_squat:     { primary: 'quads',      secondary: ['glutes', 'core'] },
  hack_squat:      { primary: 'quads',      secondary: ['glutes'] },
  leg_press:       { primary: 'quads',      secondary: ['glutes'] },
  rdl:             { primary: 'hamstrings', secondary: ['glutes', 'mid_upper_back'] },
  conv_dl:         { primary: 'hamstrings', secondary: ['glutes', 'mid_upper_back', 'lats'] },
  bulgarian_ss:    { primary: 'quads',      secondary: ['glutes', 'hamstrings'] },
  db_split_squat:  { primary: 'quads',      secondary: ['glutes'] },
  walking_lunge:   { primary: 'quads',      secondary: ['glutes', 'hamstrings'] },
  leg_ext:         { primary: 'quads' },
  seated_leg_curl: { primary: 'hamstrings' },
  lying_leg_curl:  { primary: 'hamstrings' },
  hip_thrust:      { primary: 'glutes',     secondary: ['hamstrings'] },
  calf_raise:      { primary: 'calves' },

  // ── Core ──
  cable_crunch:    { primary: 'core' },
  hang_leg_raise:  { primary: 'core' },
  toes_to_bar:     { primary: 'core' },
  ab_wheel:        { primary: 'core' },
  weighted_situp:  { primary: 'core' },
  decline_situp:   { primary: 'core' },
  russian_twist:   { primary: 'core' },
  plank:           { primary: 'core' },
}

export function attributionFor(exerciseId: string): MuscleAttribution | undefined {
  return EXERCISE_MUSCLE_ATTRIBUTION[exerciseId]
}

/**
 * Backfill exercise per muscle group, used when the weekly volume
 * audit finds a muscle below MEV. Each entry is an isolation-style
 * accessory chosen for SFR (stimulus-to-fatigue ratio) per the
 * research findings §6 — picks favor cable/machine variants that
 * load the muscle in its stretched position with low CNS cost.
 *
 * Ordered by category fit so the backfill pass can also reason about
 * which day to attach the exercise to.
 */
export const MUSCLE_BACKFILL: Record<MuscleGroup, { id: string; category: 'push' | 'pull' | 'legs' | 'upper' | 'lower' | 'any' }> = {
  chest:          { id: 'cable_fly',       category: 'push' },
  lats:           { id: 'lat_pulldown',    category: 'pull' },
  mid_upper_back: { id: 'seated_cable_row',category: 'pull' },
  front_delts:    { id: 'seated_db_ohp',   category: 'push' },
  side_delts:     { id: 'cable_lat_raise', category: 'any' },
  rear_delts:     { id: 'face_pull',       category: 'pull' },
  biceps:         { id: 'cable_curl',      category: 'pull' },
  triceps:        { id: 'tri_pushdown',    category: 'push' },
  quads:          { id: 'leg_ext',         category: 'legs' },
  hamstrings:     { id: 'seated_leg_curl', category: 'legs' },
  glutes:         { id: 'hip_thrust',      category: 'legs' },
  calves:         { id: 'calf_raise',      category: 'any' },
  core:           { id: 'cable_crunch',    category: 'any' },
}

/**
 * Per-exercise volume credit for an audit. Returns a partial record
 * (only the muscles that actually receive credit), with primary at
 * 1.0× the working sets and secondary at 0.5×.
 */
export function setCredits(exerciseId: string, sets: number): Partial<Record<MuscleGroup, number>> {
  const att = EXERCISE_MUSCLE_ATTRIBUTION[exerciseId]
  if (!att) return {}
  const credits: Partial<Record<MuscleGroup, number>> = { [att.primary]: sets }
  for (const s of att.secondary ?? []) {
    credits[s] = (credits[s] ?? 0) + sets * 0.5
  }
  return credits
}
