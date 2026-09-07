/**
 * Peak score curve math.
 *
 * Ported from peak-tracker.html. The model:
 *   1. Start from a 25-hour circadian baseline curve (one point per hour).
 *   2. Add per-substance contributions using onset → peak → exponential-decay
 *      pharmacokinetics.
 *   3. Multiply by a per-hour WHOOP modifier when sleep / recovery data exists.
 *   4. Clamp to 0–100.
 *
 * The output is a 25-element array (hours 0–24) of predicted score values
 * the chart renders as a smoothed area. `currentScore(state, whoop)` reads
 * the value at the wall-clock hour for live status.
 */

import type {
  ManualVitals,
  PeakState,
  PeakWindow,
  ScoreTier,
  SubstanceDef,
  SubstanceLog,
  WhoopSignal,
} from './types'
import { SUBSTANCES } from './substances'

const HOURS = 25

/**
 * Circadian baseline — score values 0–100 by hour. Same curve as
 * peak-tracker.html so the two stay calibrated. Dips early afternoon
 * (post-lunch siesta), rises late morning, evening secondary peak.
 */
export const BASELINE: number[] = [
  18, 12, 10, 14, 16, 22, 30, 42, 55, 68, 75, 70, 62, 50, 44, 48, 56, 64, 72, 84,
  92, 88, 64, 38, 18,
]

/**
 * Effective amplitude for a substance at a given dose + tolerance + bodyweight.
 * `tolerance` is 1–10, where 5 is neutral. Heavier user → smaller per-mg effect.
 */
function effectiveAmplitude(
  log: SubstanceLog,
  weightKg: number,
): number {
  const def = SUBSTANCES[log.key]
  if (!def) return 0
  const doseRatio = log.dose / def.defaultDose
  const weightFactor = 75 / Math.max(40, weightKg)
  const toleranceFactor = (11 - log.tolerance) / 6
  return def.amplitude * doseRatio * weightFactor * toleranceFactor
}

/**
 * Per-substance contribution at decimal hour `h`. Returns 0 before onset,
 * linear ramp to peak, then exponential decay by half-life.
 */
export function contributionAt(
  hourOfDay: number,
  log: SubstanceLog,
  weightKg: number,
): number {
  const def = SUBSTANCES[log.key]
  if (!def) return 0
  const takenDate = new Date(log.takenAt)
  const takenHour = takenDate.getHours() + takenDate.getMinutes() / 60
  const dt = hourOfDay - takenHour
  if (dt < def.onsetHours) return 0
  const amp = effectiveAmplitude(log, weightKg)
  if (dt < def.peakHours) {
    return (amp * (dt - def.onsetHours)) / (def.peakHours - def.onsetHours)
  }
  return amp * Math.pow(0.5, (dt - def.peakHours) / def.halfLifeHours)
}

/**
 * Relative effect (0–1, peak = 1) of a substance `t` hours after dosing,
 * normalized from the same onset→peak→exp-decay shape `contributionAt` uses.
 * Used by the PK detail modal to draw the onset/peak/comedown mini-curve.
 */
export function relAt(def: SubstanceDef, t: number): number {
  if (t < def.onsetHours) return 0
  if (t < def.peakHours) {
    const span = def.peakHours - def.onsetHours
    return span > 0 ? (t - def.onsetHours) / span : 1
  }
  return Math.pow(0.5, (t - def.peakHours) / def.halfLifeHours)
}

/** Phase boundaries (hours since dose) for a substance's PK curve. */
export interface PkPhases {
  /** Hours until it kicks in. */
  onset: number
  /** Hours until peak effect. */
  peak: number
  /** Comedown begins — effect has fallen to ~70% of peak. */
  comeStart: number
  /** Comedown ends — effect down to ~25% of peak. */
  comeEnd: number
  /** Effectively cleared — 5 half-lives past peak. */
  cleared: number
}

/**
 * Onset / peak / comedown / cleared boundaries for the detail modal, derived
 * from the def's PK fields. The comedown thresholds (70% → 25% of peak) and the
 * 5-half-life clearance mirror peak-stack.html's pkProfile().
 */
export function pkPhases(def: SubstanceDef): PkPhases {
  const t12 = def.halfLifeHours
  // hours past peak where 0.5^(x/t12) === f  →  x = t12 · log2(1/f)
  const fall = (f: number) => def.peakHours + t12 * (Math.log(1 / f) / Math.LN2)
  return {
    onset: def.onsetHours,
    peak: def.peakHours,
    comeStart: fall(0.7),
    comeEnd: fall(0.25),
    cleared: def.peakHours + 5 * t12,
  }
}

/**
 * Returns a per-hour WHOOP multiplier (length 25) — or null when no signals
 * have moved the dial. Mirrors peak-tracker.html's pt_whoopMultiplier().
 */
export function whoopMultiplier(w: WhoopSignal): number[] | null {
  const m = new Array<number>(HOURS).fill(1.0)
  let touched = false
  const wake = w.wakeHour != null ? Math.floor(w.wakeHour) : 7

  if (typeof w.recovery === 'number') {
    const r = Math.max(0, Math.min(100, w.recovery))
    const recMult = 0.55 + (r / 100) * 0.65
    for (let h = 0; h < HOURS; h++) m[h] *= recMult
    touched = true
  }
  if (typeof w.sleepScore === 'number' && w.sleepScore < 70) {
    const cap = 0.65 + (Math.max(0, w.sleepScore) / 70) * 0.35
    for (let h = 0; h < HOURS; h++) m[h] = Math.min(m[h], cap)
    touched = true
  }
  if (typeof w.sleepDebtHours === 'number' && w.sleepDebtHours > 0.5) {
    const debt = Math.min(1, w.sleepDebtHours / 4)
    for (let i = 0; i < 6; i++) {
      const h = (wake + i) % 24
      const damp = 0.12 * debt * (1 - i / 6)
      m[h] *= 1 - damp
    }
    touched = true
  }
  if (typeof w.strain === 'number' && w.strain > 14) {
    const penalty = Math.min(0.2, (w.strain - 14) / 35)
    for (let i = 0; i < 4; i++) {
      const h = (wake + i) % 24
      m[h] *= 1 - penalty * (1 - i / 4)
    }
    touched = true
  }
  // HRV: personalized against the user's own baseline once we have ≥3 valid
  // days. Below baseline by >15% dampens the curve; non-physiological
  // readings (>150ms / <15ms) are skipped entirely so a noisy WHOOP
  // measurement can't poison the score.
  const HRV_VALID_HI = 150
  const HRV_VALID_LO = 15
  if (typeof w.hrv === 'number' && w.hrv >= HRV_VALID_LO && w.hrv <= HRV_VALID_HI) {
    if (typeof w.hrvBaseline === 'number' && w.hrvBaseline >= HRV_VALID_LO) {
      // Personalized: 1.0 when at baseline, 0.85 when 15% below, 1.05 when 5% above
      const ratio = w.hrv / w.hrvBaseline
      const hrvMult = Math.max(0.75, Math.min(1.05, 0.7 + ratio * 0.35))
      for (let h = 0; h < HOURS; h++) m[h] *= hrvMult
      touched = true
    } else if (w.hrv < 80) {
      // Fallback to a universal threshold while we collect days for a
      // personal baseline.
      const hrvMult = 0.85 + (Math.max(0, w.hrv) / 80) * 0.15
      for (let h = 0; h < HOURS; h++) m[h] *= hrvMult
      touched = true
    }
  }

  // RHR: same pattern. Lower than baseline = recovered (mild lift). Above
  // baseline by >10% = systemic stress signal, mild dampen.
  if (typeof w.rhrBaseline === 'number' && w.rhrBaseline > 0) {
    // The WhoopSignal type doesn't yet carry an `rhr` field separately —
    // RHR lives in the same wearable_data row and is available via the
    // baseline. When we wire today's RHR through the signal in BUILD16,
    // this branch will multiply by ratio. For now no-op — baseline is
    // available but the daily reading isn't surfaced.
  }
  return touched ? m : null
}

/**
 * Full 25-point curve for today: baseline + substance stack × WHOOP modifier.
 */
export function computeCurve(state: PeakState, whoop: WhoopSignal): number[] {
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const tomorrowStart = todayStart + 86_400_000

  // Only today's substances count toward today's curve.
  const todayLogs = state.substances.filter(s => s.takenAt >= todayStart && s.takenAt < tomorrowStart)

  const base = BASELINE.map((v, i) => {
    let total = v
    todayLogs.forEach(log => {
      total += contributionAt(i, log, state.profile.weightKg)
    })
    return Math.max(0, Math.min(100, total))
  })

  const wm = whoopMultiplier(whoop)
  if (!wm) return base
  return base.map((v, i) => Math.max(0, Math.min(100, v * wm[i])))
}

/** One segment of a per-hour score, surfaced in the breakdown popover. */
export interface ScoreSegment {
  /** 'baseline' or substance key. */
  source: string
  /** Display label (e.g. "Coffee", "Baseline"). */
  label: string
  /** Signed contribution in score points before the WHOOP multiplier. */
  value: number
  /** Optional category-color used in stacked bar mode. */
  color?: string
}

export interface DetailedHour {
  hour: number
  score: number
  segments: ScoreSegment[]
  mult: number
}

/**
 * Same math as computeCurve, but returns per-hour segments + the WHOOP
 * multiplier so the breakdown popover can show "baseline +84, coffee +6,
 * WHOOP ×1.05" instead of just a number.
 */
export function computeCurveDetailed(state: PeakState, whoop: WhoopSignal): DetailedHour[] {
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const tomorrowStart = todayStart + 86_400_000
  const todayLogs = state.substances.filter(s => s.takenAt >= todayStart && s.takenAt < tomorrowStart)
  const wm = whoopMultiplier(whoop)

  return BASELINE.map((b, h) => {
    const segments: ScoreSegment[] = [{ source: 'baseline', label: 'Baseline', value: b }]
    let pre = b
    for (const log of todayLogs) {
      const def = SUBSTANCES[log.key]
      if (!def) continue
      const c = contributionAt(h, log, state.profile.weightKg)
      if (Math.abs(c) > 0.1) {
        pre += c
        segments.push({
          source: log.key,
          label: def.name,
          value: c,
          color: c < 0 ? 'var(--red)' : 'var(--mint)',
        })
      }
    }
    const mult = wm ? wm[h] : 1
    const score = Math.max(0, Math.min(100, pre * mult))
    return { hour: h, score, segments, mult }
  })
}

/**
 * Interpolated score at the current wall-clock decimal hour.
 */
export function scoreNow(curve: number[]): number {
  const now = new Date()
  const h = now.getHours() + now.getMinutes() / 60
  const i = Math.floor(h)
  const f = h - i
  const v0 = curve[i] ?? 0
  const v1 = curve[Math.min(curve.length - 1, i + 1)] ?? v0
  return Math.round(v0 + (v1 - v0) * f)
}

export function tierFor(score: number): ScoreTier {
  if (score >= 80) return 'Peak'
  if (score >= 65) return 'Solid'
  if (score >= 50) return 'Tired'
  if (score >= 35) return 'Low'
  return 'Drained'
}

export function tierHint(tier: ScoreTier): string {
  switch (tier) {
    case 'Peak':    return 'Push hard. Use this window for your hardest task.'
    case 'Solid':   return 'Train normal. Knock out the meaningful work.'
    case 'Tired':   return 'Moderate. Light cognitive load, easy admin tasks.'
    case 'Low':     return 'Recover. Walk, hydrate, no important decisions.'
    case 'Drained': return 'Rest. Anything you push now is borrowed against tomorrow.'
  }
}

/**
 * Identify peak windows in the rest of the day. A "window" is a contiguous
 * span (≥ 60 min) where the curve sits above `threshold`. Returns up to 3,
 * sorted by avg score descending — these are the "schedule your hard work
 * here" callouts.
 */
export function findPeakWindows(
  curve: number[],
  fromHour: number = new Date().getHours(),
  threshold = 70,
): PeakWindow[] {
  const windows: PeakWindow[] = []
  let start: number | null = null
  let sum = 0
  let count = 0
  let peakVal = 0
  let peakHour = 0

  for (let h = fromHour; h < curve.length; h++) {
    const v = curve[h]
    if (v >= threshold) {
      if (start === null) {
        start = h
        sum = 0
        count = 0
        peakVal = -Infinity
      }
      sum += v
      count += 1
      if (v > peakVal) {
        peakVal = v
        peakHour = h
      }
    } else if (start !== null) {
      if (h - start >= 1) {
        windows.push({ start, end: h, avgScore: sum / count, peakHour })
      }
      start = null
    }
  }
  if (start !== null && curve.length - start >= 1) {
    windows.push({
      start,
      end: curve.length - 1,
      avgScore: sum / count,
      peakHour,
    })
  }

  return windows.sort((a, b) => b.avgScore - a.avgScore).slice(0, 3)
}

/**
 * Find the single best hour to schedule a hard task. Falls back to the
 * highest-scoring hour in the day even if no formal "peak window" passed
 * the threshold (so the schedule callout always has something to say).
 */
export function bestHourToday(curve: number[], fromHour = new Date().getHours()): number {
  let bestH = fromHour
  let bestV = -Infinity
  for (let h = fromHour; h < curve.length; h++) {
    if (curve[h] > bestV) {
      bestV = curve[h]
      bestH = h
    }
  }
  return bestH
}

// ─────────────────────────────────────────────────────────────────────────
// Redesign helpers (ported from the standalone "Peak Interactive" prototype).
//
// The prototype drove these from 4 preset demo scenarios; the production
// versions below are DATA-DRIVEN — they read the user's real WHOOP signal +
// today's substance logs. Three distinct score readings coexist on the page,
// intentionally:
//   · scoreNow(curve)           → instantaneous wall-clock score ("now" dot)
//   · scoreAtHour(curve, h)     → score at any fractional hour (hover scrub)
//   · scoreDrivers(...).total   → whole-DAY overall score (the ring + drivers)
// ─────────────────────────────────────────────────────────────────────────

const CAFFEINE_KEYS = new Set(['coffee', 'espresso', 'energy_drink', 'matcha'])

function logHour(log: SubstanceLog): number {
  const d = new Date(log.takenAt)
  return d.getHours() + d.getMinutes() / 60
}

function fmtHour(h: number): string {
  const r = Math.round(h)
  if (r === 0 || r === 24) return '12 AM'
  if (r === 12) return '12 PM'
  return r < 12 ? `${r} AM` : `${r - 12} PM`
}

/**
 * Continuous colour along red → amber → mint for a 0–100 score. Used by the
 * live cursor readout + hover gauge so the number's colour tracks how good
 * that hour is. Port of peak-math.js `scoreColorFor`.
 */
export function scoreColorFor(score: number): string {
  const t = Math.max(0, Math.min(100, score)) / 100
  const hue = 6 + t * 142 // 6 (red) → 148 (green)
  const sat = 70 - t * 6
  const light = 56 + t * 8 // brighter when higher
  return `hsl(${hue.toFixed(0)}, ${sat.toFixed(0)}%, ${light.toFixed(0)}%)`
}

/** Score at an arbitrary fractional hour (linear interpolation). */
export function scoreAtHour(curve: number[], h: number): number {
  if (h <= 0) return curve[0] ?? 0
  if (h >= curve.length - 1) return curve[curve.length - 1] ?? 0
  const i = Math.floor(h)
  const f = h - i
  const v0 = curve[i] ?? 0
  const v1 = curve[i + 1] ?? v0
  return v0 * (1 - f) + v1 * f
}

export interface BestWindow {
  start: number
  end: number
  peakHour: number
  peakScore: number
  avg: number
  tier: ScoreTier
}

/**
 * Every contiguous run ≥ `threshold`, each with its peak hour/score, average,
 * and tier. Unlike findPeakWindows (which trims to the rest of the day and
 * returns the top 3), this surfaces ALL of today's strong windows so the
 * "Best hours" list can show e.g. 9 AM–1 PM *and* 3–11 PM.
 */
export function bestWindows(curve: number[], threshold = 75): BestWindow[] {
  const runs: Array<{ start: number; end: number }> = []
  let start: number | null = null
  for (let i = 0; i < curve.length; i++) {
    if (curve[i] >= threshold) {
      if (start == null) start = i
    } else if (start != null) {
      if (i - start >= 1) runs.push({ start, end: i })
      start = null
    }
  }
  if (start != null && curve.length - 1 - start >= 1) {
    runs.push({ start, end: curve.length - 1 })
  }
  return runs
    .map(r => {
      let peakHour = r.start
      let peakScore = 0
      let sum = 0
      let n = 0
      for (let h = r.start; h <= r.end; h++) {
        sum += curve[h]
        n++
        if (curve[h] > peakScore) {
          peakScore = curve[h]
          peakHour = h
        }
      }
      return { ...r, peakHour, peakScore, avg: sum / n, tier: tierFor(peakScore) }
    })
    .sort((a, b) => b.peakScore - a.peakScore)
}

export type DriverTone = 'base' | 'good' | 'bad' | 'warn' | 'idle'

export interface ScoreDriver {
  key: string
  label: string
  /** Signed point contribution; all drivers sum to the day total. */
  value: number
  tone: DriverTone
  detail: string
  stat?: string
  action?: string
  /** Locked = structural (circadian) — not a lever the user controls. */
  locked?: boolean
}

export interface DriverResult {
  drivers: ScoreDriver[]
  total: number
}

/**
 * Real data pulled from the rest of the app (BUILD62) — training, nutrition,
 * supplements, goals, mood. Every field optional; the score uses whatever is
 * present. This is how "everything feeds the peak score": each module surfaces
 * its day-value here and becomes a visible driver.
 */
export interface ScoreInputs {
  /** Real training today (from the workout logger). Overrides the tapped flag. */
  trainedToday?: boolean
  /** Logged working sets today — for detail copy. */
  workoutSets?: number
  /** Whether any meals were logged today (gates the nutrition drivers). */
  ateToday?: boolean
  /** Today's protein as a fraction of target (1 = hit). */
  proteinPct?: number
  /** Today's calories as a fraction of target (1 = on target). */
  caloriesPct?: number
  /** Supplements taken today / scheduled total. */
  supTaken?: number
  supTotal?: number
  /** Current goals streak (days). */
  streak?: number
  /** Today's goals required / completed. */
  goalsRequired?: number
  goalsCompleted?: number
  /** Today's average mood tap, −100..100. */
  moodAvg?: number
}

/**
 * Attribute the whole-day overall score to its drivers, so the "Why your
 * score is N" panel is honest: every point on screen is accounted for. Reads
 * the real WHOOP signal + today's substance logs + manual check-in + every
 * other module's day-value (inputs) — no preset scenarios.
 */
export function scoreDrivers(
  whoop: WhoopSignal,
  logs: SubstanceLog[],
  waterCount: number,
  manual?: ManualVitals | null,
  inputs?: ScoreInputs,
): DriverResult {
  const drivers: ScoreDriver[] = []

  // Circadian floor — always present, the biological baseline.
  drivers.push({
    key: 'circadian',
    label: 'Circadian rhythm',
    value: 50,
    tone: 'base',
    detail: 'Your built-in 24-hour energy shape. Peaks late morning and early evening.',
    locked: true,
  })

  const hasWhoop =
    whoop.recovery != null ||
    whoop.hrv != null ||
    whoop.sleepScore != null ||
    whoop.sleepHours != null ||
    whoop.sleepDebtHours != null

  if (whoop.recovery != null) {
    // Recovery: the biggest lever. 50% recovery = neutral.
    const recVal = Math.round((whoop.recovery - 50) * 0.5)
    drivers.push({
      key: 'recovery',
      label: 'Recovery',
      value: recVal,
      tone: recVal >= 0 ? 'good' : 'bad',
      detail: `WHOOP recovery ${Math.round(whoop.recovery)}%. ${
        recVal >= 0 ? 'Your body is primed to push.' : 'Your body is asking for a lighter day.'
      }`,
      stat: `${Math.round(whoop.recovery)}%`,
    })
  }

  if (whoop.sleepDebtHours != null && whoop.sleepDebtHours > 0.5) {
    const debtVal = -Math.round(whoop.sleepDebtHours * 5)
    drivers.push({
      key: 'sleepDebt',
      label: 'Sleep debt',
      value: debtVal,
      tone: 'bad',
      detail: `${whoop.sleepDebtHours.toFixed(1)}h of debt is dragging your ceiling down.${
        whoop.sleepHours != null ? ` Slept ${whoop.sleepHours.toFixed(1)}h.` : ''
      }`,
      stat: `${whoop.sleepDebtHours.toFixed(1)}h`,
      action: 'Bank 8h tonight to clear it',
    })
  } else if (whoop.sleepHours != null) {
    drivers.push({
      key: 'sleep',
      label: 'Sleep',
      value: 4,
      tone: 'good',
      detail: `${whoop.sleepHours.toFixed(1)}h slept — well rested, little debt carried in.`,
      stat: `${whoop.sleepHours.toFixed(1)}h`,
    })
  }

  // Manual self-report — the universal fallback when no wearable is connected,
  // plus the only source for a subjective signal (stress) a wearable can't see.
  // Recovery-type signals (energy, soreness) defer to WHOOP when it's present so
  // we never double-count; sleep defers to WHOOP sleep; stress always applies.
  const ENERGY_WORDS = ['', 'drained', 'low', 'okay', 'good', 'peak']
  if (manual) {
    if (manual.sleepHours != null && whoop.sleepHours == null && whoop.sleepDebtHours == null) {
      const debt = Math.max(0, 8 - manual.sleepHours)
      if (debt > 0.5) {
        drivers.push({
          key: 'sleepManual',
          label: 'Sleep',
          value: -Math.min(20, Math.round(debt * 5)),
          tone: 'bad',
          detail: `You logged ${manual.sleepHours.toFixed(1)}h — ${debt.toFixed(1)}h under 8h drags your ceiling down.`,
          stat: `${manual.sleepHours.toFixed(1)}h`,
          action: 'Bank 8h tonight to clear it',
        })
      } else {
        drivers.push({
          key: 'sleepManual',
          label: 'Sleep',
          value: 4,
          tone: 'good',
          detail: `You logged ${manual.sleepHours.toFixed(1)}h — well rested, little debt carried in.`,
          stat: `${manual.sleepHours.toFixed(1)}h`,
        })
      }
    }
    // "Feel" (BUILD68) is the merged subjective read that replaced energy/stress/
    // soreness. Like energy, it defers to WHOOP recovery when present (a saved
    // manual day surfaces as recovery via wearable_data, so this only drives the
    // live, pre-save case).
    const FEEL_WORDS = ['', 'wrecked', 'rough', 'okay', 'good', 'amazing']
    if (manual.feel != null && whoop.recovery == null) {
      const v = Math.round((manual.feel - 3) * 6) // 1 → −12 … 5 → +12
      drivers.push({
        key: 'feelManual',
        label: 'Feel',
        value: v,
        tone: v > 0 ? 'good' : v < 0 ? 'bad' : 'idle',
        detail: `You felt ${FEEL_WORDS[manual.feel] ?? 'okay'} today.`,
        stat: `${manual.feel}/5`,
      })
    }
    if (manual.energy != null && whoop.recovery == null) {
      const v = Math.round((manual.energy - 3) * 6) // 1 → −12 … 5 → +12
      drivers.push({
        key: 'energyManual',
        label: 'Energy',
        value: v,
        tone: v > 0 ? 'good' : v < 0 ? 'bad' : 'idle',
        detail: `You felt ${ENERGY_WORDS[manual.energy] ?? 'okay'} today.`,
        stat: `${manual.energy}/5`,
      })
    }
    if (manual.soreness != null && whoop.recovery == null) {
      const v = Math.round((2 - manual.soreness) * 2) // 1 → +2 fresh … 5 → −6 wrecked
      if (v !== 0) {
        drivers.push({
          key: 'sorenessManual',
          label: 'Soreness',
          value: v,
          tone: v >= 0 ? 'good' : 'warn',
          detail: v >= 0 ? 'Fresh — your body is recovered and ready.' : 'Sore — favour a lighter load today.',
          stat: `${manual.soreness}/5`,
        })
      }
    }
    if (manual.stress != null) {
      const v = Math.max(-9, Math.min(3, Math.round((2 - manual.stress) * 3))) // 1 → +3 … 5 → −9
      if (v !== 0) {
        drivers.push({
          key: 'stressManual',
          label: 'Stress',
          value: v,
          tone: v >= 0 ? 'good' : 'bad',
          detail: v >= 0 ? 'Calm headspace — clear and focused.' : 'High stress is taxing your ceiling.',
          stat: `${manual.stress}/5`,
        })
      }
    }
    // Resting HR — a low morning RHR tracks recovery; elevated flags fatigue or
    // illness. Defers to WHOOP recovery when present (WHOOP measures this better).
    if (manual.rhr != null && whoop.recovery == null) {
      const r = manual.rhr
      let v = 0
      let tone: DriverTone = 'idle'
      let detail = ''
      if (r < 55) {
        v = 3; tone = 'good'; detail = `Resting HR ${r} — low and well-recovered.`
      } else if (r <= 65) {
        v = 1; tone = 'good'; detail = `Resting HR ${r} — a solid baseline.`
      } else if (r <= 75) {
        v = 0; tone = 'idle'; detail = `Resting HR ${r} — middling.`
      } else {
        v = -2; tone = 'warn'; detail = `Resting HR ${r} — elevated; could be fatigue or illness.`
      }
      if (v !== 0) {
        drivers.push({ key: 'rhrManual', label: 'Resting HR', value: v, tone, detail, stat: `${r} bpm` })
      }
    }
  }

  // Hydration — today's count comes from the one water tracker (Fuel), passed
  // in by the caller. Peak no longer logs water itself.
  const hydroVal = Math.min(8, waterCount * 2)
  drivers.push({
    key: 'hydration',
    label: 'Hydration',
    value: hydroVal,
    tone: hydroVal > 0 ? 'good' : 'idle',
    detail:
      hydroVal > 0
        ? `${waterCount} logged in Fuel today. Cheap, reliable points.`
        : 'No water logged yet. Log it in Fuel for an easy boost.',
    stat: waterCount > 0 ? `${waterCount}` : undefined,
    action: hydroVal < 8 ? 'Log water in Fuel' : undefined,
  })

  // Alcohol penalty.
  const hasAlcohol = logs.some(l => SUBSTANCES[l.key]?.category === 'depressant')
  if (hasAlcohol) {
    drivers.push({
      key: 'alcohol',
      label: 'Alcohol',
      value: -5,
      tone: 'bad',
      detail: 'Alcohol is still suppressing HRV and your ceiling.',
      stat: '−5',
    })
  }

  // Caffeine timing.
  const caffeineLogs = logs.filter(l => CAFFEINE_KEYS.has(l.key))
  if (caffeineLogs.length > 0) {
    const hasLate = caffeineLogs.some(l => logHour(l) >= 14)
    const fuelVal = hasLate ? -2 : 4
    drivers.push({
      key: 'fuel',
      label: 'Caffeine timing',
      value: fuelVal,
      tone: fuelVal >= 0 ? 'good' : 'warn',
      detail: hasLate
        ? 'Afternoon caffeine may cost you sleep tonight.'
        : 'Morning dose, well-timed — no sleep cost.',
      stat: hasLate ? 'late' : 'on time',
    })
  }

  // Training — prefer the real logged workout; fall back to the tapped flag.
  const trainedFlag = logs.some(l => SUBSTANCES[l.key]?.category === 'workout')
  const trained = inputs?.trainedToday != null ? inputs.trainedToday : trainedFlag
  if (trained) {
    const sets = inputs?.workoutSets
    drivers.push({
      key: 'training',
      label: 'Training',
      value: 7,
      tone: 'good',
      detail: sets
        ? `${sets} working sets logged — your evening peak pegs ~90 min later via BDNF + dopamine.`
        : 'A logged session pegs your evening peak ~90 min later via BDNF + dopamine.',
      stat: sets ? `${sets} sets` : 'logged',
    })
  }

  // Nutrition — protein props up recovery + focus; calories keep the tank fuelled.
  // Only scored once meals are logged today, so a blank morning isn't penalised.
  if (inputs?.ateToday) {
    if (inputs.proteinPct != null) {
      const p = inputs.proteinPct
      const v = p >= 1 ? 4 : p >= 0.8 ? 2 : 0
      drivers.push({
        key: 'protein',
        label: 'Protein',
        value: v,
        tone: v > 0 ? 'good' : 'idle',
        detail:
          p >= 1
            ? 'Hit your protein target — muscle protein synthesis covered.'
            : p >= 0.8
              ? 'Close on protein — a little more locks it in.'
              : 'Protein is low today — it props up recovery and focus.',
        stat: `${Math.round(p * 100)}%`,
      })
    }
    if (inputs.caloriesPct != null) {
      const c = inputs.caloriesPct
      let v = 0
      let detail = ''
      let tone: DriverTone = 'idle'
      if (c >= 0.9 && c <= 1.1) {
        v = 2; tone = 'good'; detail = 'Calories on target — fuelled, not stuffed.'
      } else if (c > 1.2) {
        v = -2; tone = 'warn'; detail = 'Well over on calories — can blunt the afternoon.'
      } else if (c < 0.7) {
        v = -1; tone = 'warn'; detail = 'Under-fuelled today — energy may dip.'
      }
      if (v !== 0) {
        drivers.push({ key: 'calories', label: 'Calories', value: v, tone, detail, stat: `${Math.round(c * 100)}%` })
      }
    }
  }

  // Supplements — your protocol, taken or not.
  if (inputs?.supTotal != null && inputs.supTotal > 0) {
    const taken = inputs.supTaken ?? 0
    const pct = taken / inputs.supTotal
    const v = pct >= 1 ? 3 : pct >= 0.5 ? 1 : 0
    drivers.push({
      key: 'supplements',
      label: 'Supplements',
      value: v,
      tone: v > 0 ? 'good' : 'idle',
      detail:
        pct >= 1
          ? 'Full stack taken — your protocol is working for you.'
          : taken > 0
            ? `${taken} of ${inputs.supTotal} taken — finish the stack.`
            : 'Stack not taken yet today.',
      stat: `${taken}/${inputs.supTotal}`,
    })
  }

  // Goals — momentum compounds; an active streak is real signal.
  if (inputs?.goalsRequired != null && inputs.goalsRequired > 0) {
    const done = inputs.goalsCompleted ?? 0
    const allDone = done >= inputs.goalsRequired
    const v = allDone ? 3 : done > 0 ? 1 : 0
    const streak = inputs.streak ?? 0
    drivers.push({
      key: 'goals',
      label: 'Goals',
      value: v,
      tone: v > 0 ? 'good' : 'idle',
      detail: allDone
        ? 'All of today’s goals done — momentum compounds.'
        : done > 0
          ? `${done} of ${inputs.goalsRequired} goals done.`
          : 'Today’s goals are still open.',
      stat: streak > 0 ? `🔥 ${streak}` : `${done}/${inputs.goalsRequired}`,
    })
  }

  // Mood — what you actually reported feeling, nudged small.
  if (inputs?.moodAvg != null) {
    const v = Math.max(-3, Math.min(3, Math.round(inputs.moodAvg / 25)))
    if (v !== 0) {
      drivers.push({
        key: 'mood',
        label: 'Mood',
        value: v,
        tone: v > 0 ? 'good' : 'warn',
        detail: v > 0 ? 'You logged feeling good — it tracks with a higher ceiling.' : 'You logged feeling low — the model leans cautious.',
        stat: v > 0 ? 'good' : 'low',
      })
    }
  }

  // No WHOOP AND no manual report → flag the missing lever (no value, idle).
  const hasManual =
    !!manual &&
    (manual.sleepHours != null ||
      manual.sleepQuality != null ||
      manual.feel != null ||
      manual.exertion != null ||
      manual.hrv != null ||
      manual.rhr != null ||
      manual.energy != null ||
      manual.stress != null ||
      manual.soreness != null)
  if (!hasWhoop && !hasManual) {
    drivers.push({
      key: 'whoop',
      label: 'Recovery signals',
      value: 0,
      tone: 'idle',
      detail: 'No wearable or check-in yet — recovery and sleep are your biggest levers.',
      stat: 'off',
      action: 'Check in above or connect a wearable',
    })
  }

  const total = Math.max(0, Math.min(100, drivers.reduce((a, d) => a + d.value, 0)))
  return { drivers, total }
}

export type SignalDir = 'up' | 'down' | 'flat'
export type SignalTone = 'good' | 'bad' | 'warn' | 'idle'

export interface MarketSignal {
  label: string
  value: string
  /** Day-over-day / vs-baseline delta. Omitted when we genuinely lack it. */
  delta?: number
  dir: SignalDir
  tone: SignalTone
}

/**
 * NASDAQ-style ticker signals. Honest about what we have: deltas only appear
 * where there's a baseline to compare against (HRV vs hrvBaseline). When no
 * wearable is connected, the strip says so rather than inventing numbers.
 */
export function marketSignals(whoop: WhoopSignal, waterCount: number): MarketSignal[] {
  const hasWhoop =
    whoop.recovery != null || whoop.hrv != null || whoop.sleepScore != null || whoop.sleepDebtHours != null

  if (!hasWhoop) {
    return [
      { label: 'BASELINE', value: 'circadian only', dir: 'flat', tone: 'idle' },
      { label: 'WHOOP', value: 'not connected', dir: 'flat', tone: 'idle' },
      {
        label: 'HYDRATION',
        value: `${waterCount}`,
        dir: waterCount > 0 ? 'up' : 'flat',
        tone: waterCount > 0 ? 'good' : 'idle',
      },
    ]
  }

  const out: MarketSignal[] = []
  if (whoop.recovery != null) {
    out.push({
      label: 'RECOVERY',
      value: `${Math.round(whoop.recovery)}%`,
      dir: 'flat',
      tone: whoop.recovery >= 60 ? 'good' : whoop.recovery >= 40 ? 'warn' : 'bad',
    })
  }
  if (whoop.sleepDebtHours != null) {
    out.push({
      label: 'SLEEP DEBT',
      value: `${whoop.sleepDebtHours.toFixed(1)}h`,
      dir: whoop.sleepDebtHours > 0.5 ? 'up' : 'flat',
      // Rising debt is BAD (red) even though the arrow points up.
      tone: whoop.sleepDebtHours > 0.5 ? 'bad' : 'good',
    })
  }
  if (whoop.hrv != null) {
    if (whoop.hrvAnomalous) {
      out.push({ label: 'HRV', value: 'noisy', dir: 'flat', tone: 'warn' })
    } else if (whoop.hrvBaseline != null) {
      const delta = Math.round(whoop.hrv - whoop.hrvBaseline)
      out.push({
        label: 'HRV',
        value: `${Math.round(whoop.hrv)}ms`,
        delta,
        dir: delta >= 0 ? 'up' : 'down',
        tone: delta >= 0 ? 'good' : 'bad',
      })
    } else {
      out.push({ label: 'HRV', value: `${Math.round(whoop.hrv)}ms`, dir: 'flat', tone: 'idle' })
    }
  }
  if (whoop.rhrBaseline != null) {
    out.push({ label: 'RESTING HR', value: `${Math.round(whoop.rhrBaseline)}bpm`, dir: 'flat', tone: 'idle' })
  }
  out.push({
    label: 'HYDRATION',
    value: `${waterCount}`,
    dir: waterCount >= 4 ? 'up' : 'flat',
    tone: waterCount >= 4 ? 'good' : 'warn',
  })
  return out
}

export interface ImprovementTip {
  icon: string
  label: string
  gain: string
  stream: string
  detail: string
}

/** Concrete "how to raise it" actions, ranked by upside, capped at 4. */
export function improvementTips(whoop: WhoopSignal, logs: SubstanceLog[], waterCount: number): ImprovementTip[] {
  const tips: ImprovementTip[] = []

  if (waterCount < 4) {
    tips.push({
      icon: '💧',
      label: 'Drink water',
      gain: `+${Math.min(8, (4 - waterCount) * 2)}`,
      stream: 'Hydration',
      detail: `${waterCount} logged. Log it in Fuel, the cheapest points on the board.`,
    })
  }
  if (whoop.sleepDebtHours != null && whoop.sleepDebtHours > 0.5) {
    tips.push({
      icon: '🌙',
      label: 'Clear sleep debt',
      gain: `+${Math.round(whoop.sleepDebtHours * 5)}`,
      stream: 'Sleep',
      detail: `${whoop.sleepDebtHours.toFixed(1)}h behind. Bank a full 8h tonight to lift tomorrow's ceiling.`,
    })
  }
  if (logs.some(l => CAFFEINE_KEYS.has(l.key) && logHour(l) >= 14)) {
    tips.push({
      icon: '☕',
      label: 'Cut afternoon caffeine',
      gain: '+6 tmrw',
      stream: 'Stimulants',
      detail: 'Late caffeine taxes tonight’s sleep — which caps tomorrow.',
    })
  }
  if (logs.some(l => SUBSTANCES[l.key]?.category === 'depressant')) {
    tips.push({
      icon: '🍷',
      label: 'Skip the nightcap',
      gain: '+5',
      stream: 'Stimulants',
      detail: 'Alcohol suppresses HRV and recovery — your whole ceiling drops.',
    })
  }
  const hasWorkout = logs.some(l => SUBSTANCES[l.key]?.category === 'workout')
  if (!hasWorkout && whoop.recovery != null && whoop.recovery >= 55) {
    tips.push({
      icon: '🏋',
      label: 'Train in a peak window',
      gain: '+7',
      stream: 'Training',
      detail: 'A session pegs your evening peak ~90 min later via BDNF + dopamine.',
    })
  }
  if (whoop.recovery != null && whoop.recovery < 45) {
    tips.push({
      icon: '🛌',
      label: 'Take a recovery day',
      gain: 'tmrw',
      stream: 'Recovery',
      detail: 'Recovery is low. Easy movement + an early night beats forcing it today.',
    })
  }
  if (whoop.recovery == null && whoop.hrv == null && whoop.sleepScore == null) {
    tips.push({
      icon: '⌚',
      label: 'Connect a wearable',
      gain: 'unlock',
      stream: 'Recovery',
      detail: 'Recovery and sleep are your biggest levers — connect to factor them in.',
    })
  }
  return tips.slice(0, 4)
}

/** Hour-format helper shared by the redesign surfaces (e.g. "7 PM"). */
export { fmtHour as fmtHourLabel }
