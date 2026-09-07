/**
 * Goal-aware rep prescription. Replaces the hardcoded sets/reps inside
 * preset day templates with values driven by the user's stated goal,
 * so a "strength" user actually sees 4×6 on a heavy day where a
 * "muscle" user sees 3×10 and a "health" user sees 3×13.
 *
 * Backed by established training-science rep zones:
 *   - Strength      : 1–6 reps,  >80% 1RM, longer rest, more sets
 *   - Hypertrophy   : 6–12 reps, 60–80% 1RM, moderate rest
 *   - Endurance/health: 12–20 reps, <60% 1RM, short rest
 *
 * Schoenfeld 2017 meta-analysis: hypertrophy is robust across the
 * 6–20 rep range when sets are taken near failure, but strength gains
 * favor heavier loads (<6 rep range), and endurance/work-capacity
 * favors higher rep ranges. We bias the dayType × tier baseline by the
 * user's goal so the program actually trains toward that goal.
 */

import type { Tier, DayType } from '@/app/app/fitness/log/splitData'
import type { Goal, FailureTolerance } from '@/app/app/fitness/setup/presets'

export interface RepRx {
  sets: number
  reps: number
  /** v2 — per-set "reps in reserve" target. The number of reps the user
   *  should still have at the end of the working set. RIR 0 = to failure;
   *  RIR 2 = stop with two clean reps left. Derived from the user's
   *  failureTolerance answer × the exercise's tier (the `split` answer
   *  pushes isolations harder than compounds). Consumers (SetPill in the
   *  logger) display this next to the prescribed reps. */
  targetRIR: number
}

// ─── Baseline prescription (tier × dayType, goal-agnostic) ────────────
//
// Mirrors splitData.ts's defaultSetsReps() but lives here so we can
// modulate per goal without touching splitData (which is shared with
// the Vitality standalone — see CLAUDE.md).

// Baseline sets/reps before RIR stamping. RIR is added in prescribeRepRx
// based on (tier, failureTolerance).
interface RepBase { sets: number; reps: number }

const HEAVY_BASE: Record<Tier, RepBase> = {
  heavy_compound: { sets: 4, reps: 5  },
  compound:       { sets: 3, reps: 8  },
  heavy_iso:      { sets: 4, reps: 7  },
  iso:            { sets: 3, reps: 12 },
  ab:             { sets: 4, reps: 12 },
}

const VOLUME_BASE: Record<Tier, RepBase> = {
  heavy_compound: { sets: 4, reps: 8  },
  compound:       { sets: 4, reps: 10 },
  heavy_iso:      { sets: 4, reps: 10 },
  iso:            { sets: 3, reps: 15 },
  ab:             { sets: 4, reps: 20 },
}

const RECOVERY_BASE: RepBase = { sets: 2, reps: 12 }

// ─── Goal scalers ─────────────────────────────────────────────────────
//
// Each scaler is applied on top of the baseline. Constraints:
// - `strength` adds load (lower reps) and more total sets — the
//   classic strength prescription (3–6 reps, multiple work sets).
// - `muscle` and `recomp` are the hypertrophy default (6–12) — the
//   baseline values already sit in that range, so no shift.
// - `fat_loss` raises reps and trims a set — volume management during
//   a caloric deficit, where recovery is the limiter.
// - `health` pushes everything into the moderate-to-high range, which
//   is joint-friendlier and easier to sustain.

interface GoalScaler {
  repShift: number   // added to base reps (negative = lower-rep, heavier)
  setShift: number   // added to base sets
}

const GOAL_SCALER: Record<Goal, GoalScaler> = {
  strength: { repShift: -3, setShift: +1 },
  muscle:   { repShift:  0, setShift:  0 },
  recomp:   { repShift:  0, setShift:  0 },
  fat_loss: { repShift: +2, setShift: -1 },
  health:   { repShift: +3, setShift: -1 },
}

// Bounds — never prescribe < 3 reps (not a hypertrophy-or-strength
// zone we can program safely), > 25 reps (just endurance training at
// that point), < 2 sets (no stimulus), or > 6 sets (junk volume).
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

/**
 * v2 — per-set RIR target derived from (tier, failureTolerance).
 *
 * Default (`one_two`, ~RIR 1-2) matches the research-default for
 * hypertrophy. The `split` answer (hard isolations, controlled
 * compounds) pushes isolations into the RIR 0-1 zone and pulls
 * compounds back to RIR 2-3 — exactly how locked-in lifters describe
 * their own fatigue management.
 *
 * Numbers are the midpoint of the range the factor card describes.
 */
function targetRIRFor(
  tier: Tier,
  failureTolerance: FailureTolerance | undefined,
): number {
  if (!failureTolerance) return 1  // pre-v2 default — RIR 1-2 mid
  const isIsolation = tier === 'iso' || tier === 'heavy_iso' || tier === 'ab'
  switch (failureTolerance) {
    case 'failure':    return 0  // RIR 0-1 across the board
    case 'one_two':    return 1  // RIR 1-2, research default
    case 'three_plus': return 2  // RIR 2-3, joint-friendly
    case 'split':      return isIsolation ? 0 : 2  // hard isos, controlled compounds
  }
}

/**
 * Return the sets/reps prescription for a given (tier, dayType, goal).
 * `goal === undefined` falls back to the baseline (no shift), matching
 * the behavior of splitData.ts's `defaultSetsReps`.
 *
 * v2 — `failureTolerance` stamps a per-set RIR target. Defaults to
 * RIR 1 (matches the pre-v2 implicit prescription).
 */
export function prescribeRepRx(
  tier: Tier,
  dayType: DayType,
  goal: Goal | undefined,
  failureTolerance?: FailureTolerance,
): RepRx {
  if (dayType === 'RECOVERY') return { ...RECOVERY_BASE, targetRIR: 2 }
  const base = dayType === 'HEAVY' ? HEAVY_BASE[tier] : VOLUME_BASE[tier]
  const scaler = goal ? GOAL_SCALER[goal] : { repShift: 0, setShift: 0 }
  return {
    sets: clamp(base.sets + scaler.setShift, 2, 6),
    reps: clamp(base.reps + scaler.repShift, 3, 25),
    targetRIR: targetRIRFor(tier, failureTolerance),
  }
}

/**
 * Short human-readable label for the rep zone, suitable for picker
 * pill copy. Returned phrase fits the sentence "Sized for your X goal."
 *   strength → "strength"   muscle → "muscle"   recomp → "recomp"
 *   fat_loss → "cut"        health → "longevity"   undef → null
 */
export function goalLabel(goal: Goal | undefined): string | null {
  if (!goal) return null
  switch (goal) {
    case 'strength': return 'strength'
    case 'muscle':   return 'muscle'
    case 'recomp':   return 'recomp'
    case 'fat_loss': return 'cut'
    case 'health':   return 'longevity'
  }
}
