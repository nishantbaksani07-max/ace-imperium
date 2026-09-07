/**
 * Off-day / readiness math — the single source of truth for how a low-readiness
 * day is eased. Shared by OffDayFlow (the picker UI) and SplitLog (which applies
 * the plan to the live session). No JSX here so both can import it freely.
 *
 * Grounded in current sports-science (see docs research brief): on a bad day you
 * cut VOLUME first (sets), protect the bar where you can, and stop further from
 * failure. So:
 *   - "A little off"  → keep the weight, drop ~1 set, leave 2-3 reps in reserve.
 *   - "Pretty rough"  → ~half the sets, lighten (compound -20% / iso -10%),
 *                       leave 4-5 in reserve. Heavy compounds back off more than
 *                       isolation (whole-body cost, not "CNS").
 */

// 'little' / 'rough' = a single low-readiness session (the off-day sheet).
// 'deload' = a planned light week applied across one pass through the split:
// volume-led (cut sets ~half), a modest ~10% load back-off, stop well short of
// failure. The highest-consensus deload method; framed as recovery, not growth.
export type OffDayLevel = 'little' | 'rough' | 'deload'

/** Load multipliers per readiness level. `c` = compound, `i` = isolation.
 *  A self-reported off day is an autoregulation cue: when readiness drops, easing
 *  the bar (not just volume) is the standard RPE-based move, and it protects form
 *  + joints when you're run-down. Compounds back off more (whole-body cost). */
const OFF_LOAD: Record<OffDayLevel, { c: number; i: number }> = {
  // A little off — a real ~10% back-off so the day is genuinely easier.
  little: { c: 0.9, i: 0.95 },
  // Pretty rough — ~20% off the big lifts, ~10% off isolation.
  rough: { c: 0.8, i: 0.9 },
  // Deload — a uniform ~10% back-off. The cut is volume-led (see easeSets), so
  // load only comes down a touch to keep the movement pattern sharp.
  deload: { c: 0.9, i: 0.9 },
}

/** Set multipliers — how much of the day's volume to keep. */
const OFF_SETS: Record<OffDayLevel, { c: number; i: number }> = {
  little: { c: 1, i: 1 }, // little uses a flat −1 set instead (see easeSets)
  rough: { c: 0.5, i: 0.7 },
  deload: { c: 0.5, i: 0.5 }, // ~half the volume across the board (see easeSets)
}

const round2_5 = (x: number) => Math.round(x / 2.5) * 2.5

/** Eased working weight (kg) for one lift at a readiness level. */
export function easeWeightKg(level: OffDayLevel, compound: boolean, baseKg: number): number {
  if (baseKg <= 0) return baseKg
  return round2_5(baseKg * OFF_LOAD[level][compound ? 'c' : 'i'])
}

/** Eased set count for one lift. `little` drops a single set; `rough` cuts to
 *  roughly half (compound) / two-thirds (isolation). Never below 1. */
export function easeSets(level: OffDayLevel, compound: boolean, baseSets: number): number {
  if (baseSets <= 1) return baseSets
  if (level === 'little') return Math.max(1, baseSets - 1)
  // Deload cuts volume ~half, but a compound keeps a floor of 2 working sets so
  // it stays an effective (if light) dose; isolation can drop to 1.
  if (level === 'deload') return Math.max(compound ? 2 : 1, Math.round(baseSets * OFF_SETS.deload[compound ? 'c' : 'i']))
  return Math.max(1, Math.round(baseSets * OFF_SETS.rough[compound ? 'c' : 'i']))
}

/** One lift's inputs for building its eased target. */
export interface OffDayLift {
  id: string
  name: string
  compound: boolean
  sets: number
  reps: number
  baseKg: number
}

/** The eased prescription for one lift (what the logger seeds + shows today). */
export interface OffDayTarget {
  sets: number
  reps: number // reps target is unchanged — you stop short via RIR, not fewer reps
  kg: number
}

/** Default eased plan for a whole day, keyed by exercise id. The flow lets the
 *  user nudge any value before confirming; SplitLog falls back to this on a
 *  reload where the (unpersisted) edited plan is gone. */
export function buildOffDayPlan(level: OffDayLevel, lifts: OffDayLift[]): Record<string, OffDayTarget> {
  // Fallback base for a lift with no history yet: borrow from the user's other
  // lifts so we still seed an honest number instead of 0. Prefer same-tier peers
  // (a compound looks to compounds), else any lift with a weight.
  const withWeight = lifts.filter(l => l.baseKg > 0)
  const peerBase = (compound: boolean): number => {
    const sameTier = withWeight.filter(l => l.compound === compound)
    const pool = sameTier.length ? sameTier : withWeight
    if (!pool.length) return 0
    return round2_5(pool.reduce((s, l) => s + l.baseKg, 0) / pool.length)
  }

  const plan: Record<string, OffDayTarget> = {}
  for (const l of lifts) {
    const base = l.baseKg > 0 ? l.baseKg : peerBase(l.compound)
    plan[l.id] = {
      sets: easeSets(level, l.compound, l.sets),
      reps: l.reps,
      kg: easeWeightKg(level, l.compound, base),
    }
  }
  return plan
}

/** Reps-in-reserve coaching line per level. */
export const RIR_COPY: Record<OffDayLevel, string> = {
  little: 'Leave 2 to 3 reps in the tank. Smooth reps, no grinding today.',
  rough: 'Leave 4 to 5 reps in the tank. Keep the groove, then stop early.',
  deload: 'Leave 3 to 4 reps in the tank. This is the easy part of the plan.',
}

/** Short headline summarising the eased day per level. */
export const OFF_HEADNOTE: Record<OffDayLevel, string> = {
  little: '~10% lighter · a set off',
  rough: '~20% lighter · half the sets',
  deload: '~10% lighter · half the sets',
}

/** Rough "how much off" badge per level, shown on the eased card. */
export const OFF_BADGE: Record<OffDayLevel, string> = {
  little: '10% off',
  rough: '20% off',
  deload: 'deload',
}
