/**
 * Recovery + outside-training + cardio modifiers applied to weekly
 * volume targets.
 *
 * Each modifier returns a multiplier (and optionally a leg-specific
 * multiplier for cardio-induced lower-body interference). They compose
 * multiplicatively. Apply order, from the research findings:
 *
 *   goal target → recovery → outside training → cardio → priorities
 *
 * Sources cited inline above each function.
 */

import type { Recovery, IntakeAnswers } from '@/app/app/fitness/setup/presets'

export interface VolumeModifier {
  /** Multiplier applied to weekly target sets for every muscle. */
  global: number
  /** Additional multiplier applied to leg muscles only (quads,
   *  hamstrings, glutes, calves). Used by the cardio modifier to
   *  account for running-mode interference. */
  legs: number
}

const IDENTITY: VolumeModifier = { global: 1, legs: 1 }

/**
 * Subjective recovery → volume scaler.
 *
 * Source: Helms (M&S Pyramid v3 "Recovery"); Irwin et al. 2022 Sports
 * Med 52(11):2669–2690 meta of 69 studies — sleep loss reduced
 * exercise performance by a mean of 7.56% (95% CI −11.9 to −3.13).
 * When recovery is poor, drop VOLUME before dropping intensity (the
 * strength signal protects gains; the volume signal stresses what's
 * already stressed).
 */
export function recoveryModifier(recovery: Recovery): VolumeModifier {
  switch (recovery) {
    case 'great':    return { global: 1.10, legs: 1.10 }
    case 'okay':     return { global: 1.00, legs: 1.00 }
    case 'stressed': return { global: 0.90, legs: 0.90 }
    case 'rough':    return { global: 0.80, legs: 0.80 }
  }
}

/**
 * Cardio + outside-training → volume scaler. Merged in v2 (2026-05-29)
 * from the old `outsideTrainingModifier` + `cardioModifier` because the
 * two questions overlapped heavily and modality (running vs cycling)
 * was invisible to the engine.
 *
 *   desk          → identity (0% reduction)
 *   walks         → identity (0% reduction)
 *   sport         → 0.85 global, 0.75 legs (sport practice = moderate
 *                   concurrent training)
 *   running       → 0.90 global, 0.80 legs (Schumann et al. 2022 Sports
 *                   Med: running-mode interference > cycling-mode;
 *                   knee-friendly cardio escapes the bigger hit)
 *   cycling       → 0.95 global, 0.90 legs (low-impact, low overlap)
 *   cardio_first  → 0.75 global, 0.70 legs (Wilson et al. 2012 JSCR
 *                   meta — heavy cardio dose interferes with hypertrophy
 *                   and strength both)
 */
export function cardioAndOutsideModifier(co: IntakeAnswers['cardioAndOutside']): VolumeModifier {
  switch (co) {
    case 'desk':         return IDENTITY
    case 'walks':        return IDENTITY
    case 'sport':        return { global: 0.85, legs: 0.75 }
    case 'running':      return { global: 0.90, legs: 0.80 }
    case 'cycling':      return { global: 0.95, legs: 0.90 }
    case 'cardio_first': return { global: 0.75, legs: 0.70 }
  }
}

/** Compose modifiers multiplicatively. */
export function composeModifiers(...mods: VolumeModifier[]): VolumeModifier {
  return mods.reduce(
    (acc, m) => ({ global: acc.global * m.global, legs: acc.legs * m.legs }),
    IDENTITY,
  )
}

import type { MuscleGroup } from './volumeLandmarks'

/** Apply a modifier to a per-muscle target, with leg muscles getting
 *  the additional legs-only multiplier. */
export function applyModifier(
  muscle: MuscleGroup,
  baseTarget: number,
  mod: VolumeModifier,
): number {
  const isLeg = muscle === 'quads' || muscle === 'hamstrings' || muscle === 'glutes' || muscle === 'calves'
  const scaled = isLeg ? baseTarget * mod.global * mod.legs : baseTarget * mod.global
  return Math.round(scaled)
}
