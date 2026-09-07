/**
 * Peak Stack pharmacokinetic engine (BUILD70) — a Bateman one-compartment oral
 * model, ported verbatim from the `peak-stack.html` standalone so a user's curve
 * reads identically across the standalone and the app. Pure + no IO; this is the
 * shared core that both the /app/peak/stack page and Peak's energy curve build on.
 *
 * The Bateman function models a single oral dose: concentration rises with the
 * absorption rate `ka`, falls with the elimination rate `ke`. We solve `ka` from
 * the substance's observed `tmax` (time-to-peak), personalise the half-life by
 * the user's age/sex/smoking, then expose `rel(t)` — the effect at `t` hours
 * after the dose, normalised so the peak is 1.0.
 *
 * NOT medical advice — estimates only; PK varies person to person.
 */

import type { StackSubstance } from './stackLibrary'

export interface StackProfile {
  weightKg: number
  age: number
  sex: 'male' | 'female' | string
  /** Smoker — induces CYP1A2, clearing caffeine et al. ~38% faster. */
  smokes?: boolean
}

const LN2 = Math.LN2
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** Elimination rate constant from a half-life (hours). */
export const keOf = (t12: number): number => LN2 / t12

/**
 * Solve the absorption rate `ka` that puts the Bateman peak at `tmax`. The peak
 * time is ln(ka/ke)/(ka−ke); we bisect for the ka that matches. Mirrors the
 * standalone's solver (70 iterations) exactly.
 */
export function kaFromTmax(tmax: number, ke: number): number {
  if (tmax <= 0.01) return ke * 40
  let lo = ke * 1.0001
  let hi = ke * 400
  const f = (ka: number) => Math.log(ka / ke) / (ka - ke) - tmax
  for (let i = 0; i < 70; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) > 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Bateman concentration at `t` hours (un-normalised). */
export function bateman(t: number, ka: number, ke: number): number {
  if (t <= 0) return 0
  return (ka / (ka - ke)) * (Math.exp(-ke * t) - Math.exp(-ka * t))
}

/** Peak value of the Bateman curve, used to normalise `rel` to 1.0 at peak. */
export function batemanPeak(ka: number, ke: number): number {
  return bateman(Math.log(ka / ke) / (ka - ke), ka, ke)
}

/** Personalised elimination half-life (hours) for a substance + user. */
export function personalT12(
  sub: Pick<StackSubstance, 't12' | 'cyp1a2'>,
  p: StackProfile,
): number {
  let t12 = sub.t12
  if (p.age > 40) t12 *= 1 + (p.age - 40) * 0.012
  else if (p.age < 20) t12 *= 0.92
  if (p.sex === 'female') t12 *= 1.05
  if (sub.cyp1a2 && p.smokes) t12 *= 0.62
  return t12
}

/** Bodyweight scaling for felt intensity (lighter → stronger), clamped. */
export const intensity = (p: StackProfile): number =>
  clamp(70 / Math.max(40, p.weightKg), 0.6, 1.6)

export interface PkProfile {
  /** Personalised half-life (hours). */
  t12: number
  ke: number
  ka: number
  peakRel: number
  /** Effect rises past 16% of peak. */
  onset: number
  /** Time-to-peak (hours since dose). */
  peak: number
  /** Comedown begins (falls below 70% of peak). */
  comeStart: number
  /** Comedown ends (falls below 25% of peak). */
  comeEnd: number
  /** Effectively cleared (~5 half-lives past peak). */
  cleared: number
  /** Normalised effect (0..1 of peak) at `hoursSinceDose`. */
  rel: (hoursSinceDose: number) => number
}

/** Full timing profile for one substance + user — the curve markers + `rel(t)`. */
export function pkProfile(sub: StackSubstance, p: StackProfile): PkProfile {
  const t12 = personalT12(sub, p)
  const ke = keOf(t12)
  const ka = kaFromTmax(sub.tmax, ke)
  const peakRel = batemanPeak(ka, ke)
  const rel = (t: number) => bateman(t, ka, ke) / peakRel
  const riseCross = (frac: number) => {
    for (let t = 0; t < sub.tmax; t += 0.02) if (rel(t) >= frac) return t
    return sub.tmax
  }
  const fallCross = (frac: number) => {
    for (let t = sub.tmax; t < sub.tmax + 6 * t12; t += 0.04) if (rel(t) <= frac) return t
    return sub.tmax + 5 * t12
  }
  return {
    t12,
    ke,
    ka,
    peakRel,
    rel,
    onset: sub.onset != null ? sub.onset : riseCross(0.16),
    peak: sub.tmax,
    comeStart: fallCross(0.7),
    comeEnd: fallCross(0.25),
    cleared: sub.tmax + 5 * t12,
  }
}

/**
 * Felt effect (subjective "feel" points, ~0–100 scale) of a single dose at
 * `hoursSinceDose`, scaled by the substance's `peakFeel`, the user's bodyweight,
 * and a dose ratio (logged dose vs the catalog's representative `doseMg`).
 * Steady-state meds (peakFeel 0) contribute no acute lift — correct by design.
 */
export function feltEffect(
  sub: StackSubstance,
  p: StackProfile,
  hoursSinceDose: number,
  doseMg?: number,
): number {
  if (sub.peakFeel <= 0) return 0
  const pk = pkProfile(sub, p)
  const doseRatio = doseMg && sub.doseMg > 0 ? doseMg / sub.doseMg : 1
  return sub.peakFeel * pk.rel(hoursSinceDose) * intensity(p) * doseRatio
}
