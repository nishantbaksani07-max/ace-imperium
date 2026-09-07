/**
 * Health Watch — real-data load & vitals monitor for Peak.
 *
 * Ported from peak-stack.html's buildHealth(), but every number here comes from
 * the user's ACTUAL logged data — today's substance logs (caffeine mg, alcohol,
 * tolerance, log times) fused with the live WHOOP/manual vitals signal — not the
 * standalone's demo state. No fabricated values: a signal only fires when the
 * data that triggers it is really present.
 *
 * Scope note: Vitality currently logs `caffeine`, `depressant` (alcohol),
 * `hydration`, `supplement` and `workout`. The standalone additionally tracked
 * ADHD meds, nicotine and antidepressants — those signals are intentionally
 * absent here until those categories become loggable, rather than faked.
 */

import type { ManualVitals, SubstanceLog, WhoopSignal } from './types'
import { SUBSTANCES } from './substances'

/** 0 = healthy range · 1 = caution · 2 = alert. */
export type HealthSeverity = 0 | 1 | 2

export interface HealthSignal {
  level: 1 | 2
  text: string
}

export interface HealthWatchResult {
  severity: HealthSeverity
  signals: HealthSignal[]
  /** Total caffeine logged today, mg. */
  caffMg: number
  /** General safe daily ceiling (FDA ~400 mg). */
  caffCeiling: number
  /** Distinct caffeine sources stacked today. */
  caffeineSources: number
  /** Estimated mg of caffeine still active at bedtime. */
  caffAtBedtime: number
  /** Vitals for the hook line — null when we genuinely don't have them. */
  restingHR: number | null
  rhrBaseline: number | null
  sleepH: number | null
  sleepDebtH: number | null
  recovery: number | null
  shortEffects: string[]
  longEffects: string[]
}

export const CAFF_CEILING = 400
/** Caffeine elimination half-life, hours (matches the curve model). */
const CAFF_HALF_LIFE = 5
/** Assumed bedtime when the user hasn't given one — used to judge late doses. */
const BEDTIME_HOUR = 23
/** A caffeine log counts as "late" past this hour. */
const LATE_HOUR = 14
/** Cached tolerance (1–10) at/above which a substance is "high tolerance". */
const HIGH_TOL = 8

function hourOf(ms: number): number {
  const d = new Date(ms)
  return d.getHours() + d.getMinutes() / 60
}

/** mg of caffeine still circulating at `atHour`, summed across today's doses. */
export function caffeineActiveAt(caffLogs: SubstanceLog[], atHour: number): number {
  let mg = 0
  for (const l of caffLogs) {
    const taken = hourOf(l.takenAt)
    if (taken > atHour) continue
    mg += (l.dose || 0) * Math.pow(0.5, (atHour - taken) / CAFF_HALF_LIFE)
  }
  return mg
}

interface Inputs {
  logs: SubstanceLog[]
  whoop: WhoopSignal
  manual: ManualVitals | null
}

export function buildHealthWatch({ logs, whoop, manual }: Inputs): HealthWatchResult {
  const caffLogs = logs.filter((l) => SUBSTANCES[l.key]?.category === 'caffeine')
  const alcoholLogs = logs.filter((l) => SUBSTANCES[l.key]?.category === 'depressant')

  const caffMg = Math.round(caffLogs.reduce((s, l) => s + (l.dose || 0), 0))
  const caffeineSources = new Set(caffLogs.map((l) => l.key)).size
  const lateCaff = caffLogs.filter((l) => hourOf(l.takenAt) >= LATE_HOUR)
  const caffAtBedtime = Math.round(caffeineActiveAt(caffLogs, BEDTIME_HOUR))
  const highTolCaff = caffLogs.some((l) => l.tolerance >= HIGH_TOL)

  // Vitals — prefer the wearable signal, fall back to today's manual check-in.
  const restingHR = manual?.rhr ?? null
  const rhrBaseline = whoop.rhrBaseline ?? null
  const sleepH = whoop.sleepHours ?? manual?.sleepHours ?? null
  const sleepDebtH =
    whoop.sleepDebtHours ?? (sleepH != null ? Math.max(0, 8 - sleepH) : null)
  const recovery = whoop.recovery ?? null

  const signals: HealthSignal[] = []
  let severity: HealthSeverity = 0
  const add = (level: 1 | 2, text: string) => {
    signals.push({ level, text })
    severity = Math.max(severity, level) as HealthSeverity
  }

  // ── Caffeine load ──
  if (caffMg > 600) {
    add(2, `${caffMg} mg caffeine today — well past the ~400 mg ceiling. Jitter, GI upset and a hard crash get likely.`)
  } else if (caffMg > CAFF_CEILING) {
    add(1, `${caffMg} mg caffeine today — over the ~400 mg/day general safe ceiling.`)
  }
  if (caffeineSources >= 3) {
    add(1, `You stacked ${caffeineSources} different caffeine sources today — the load on heart rate and sleep adds up faster than one drink.`)
  }

  // ── Caffeine × vitals ──
  if (caffMg > 200 && restingHR != null && rhrBaseline != null && restingHR > rhrBaseline * 1.1) {
    add(1, `Resting HR ${Math.round(restingHR)} bpm is up vs your ${Math.round(rhrBaseline)} bpm baseline while caffeine-loaded — give your heart a breather.`)
  }
  if (caffMg > 150 && sleepDebtH != null && sleepDebtH > 1.5) {
    add(1, `You're masking ${sleepDebtH.toFixed(1)}h of sleep debt with caffeine — borrowed energy you'll repay.`)
  }
  if (recovery != null && recovery < 40 && caffMg > 200) {
    add(1, `Recovery is ${Math.round(recovery)}% and you're caffeine-loaded — pushing today borrows from tomorrow.`)
  }

  // ── Sleep-bleed from late caffeine ──
  if (caffAtBedtime > 50) {
    add(1, `~${caffAtBedtime} mg of caffeine is still active around bedtime — tonight's sleep architecture will suffer.`)
  } else if (lateCaff.length) {
    add(1, `Caffeine after 2 PM (×${lateCaff.length}) — its ~5h half-life can bleed into tonight's sleep.`)
  }

  // ── Alcohol ──
  if (alcoholLogs.length) {
    add(1, `Alcohol logged — it suppresses HRV and recovery, so expect a lower ceiling tomorrow.`)
  }

  // ── Tolerance ──
  if (highTolCaff) {
    add(1, `High caffeine tolerance cached on a dose today — less lift for the same load.`)
  }

  // ── Short- & long-term effects (deduped) ──
  const shortEffects = new Set<string>()
  const longEffects = new Set<string>()

  if (caffMg > CAFF_CEILING || caffeineSources >= 3) {
    shortEffects.add('Jitters, anxiety & racing thoughts')
    shortEffects.add('Raised heart rate & blood pressure')
  }
  if (caffAtBedtime > 50 || lateCaff.length) shortEffects.add('Trouble falling asleep tonight')
  if (caffMg > CAFF_CEILING || caffeineSources >= 3) shortEffects.add('An afternoon/evening crash & rebound fatigue')
  if (alcoholLogs.length) shortEffects.add('Fragmented, low-REM sleep tonight')

  if (highTolCaff) longEffects.add('Tolerance & dependence — needing more for the same effect')
  if ((sleepDebtH ?? 0) > 1 || caffAtBedtime > 50) longEffects.add('Chronic sleep debt & disrupted sleep architecture')
  if (caffMg > 500 || caffeineSources >= 3) longEffects.add('Cardiovascular strain from sustained caffeine load')
  if (alcoholLogs.length) longEffects.add('Suppressed recovery & elevated resting heart rate')

  return {
    severity,
    signals,
    caffMg,
    caffCeiling: CAFF_CEILING,
    caffeineSources,
    caffAtBedtime,
    restingHR,
    rhrBaseline,
    sleepH,
    sleepDebtH,
    recovery,
    shortEffects: [...shortEffects],
    longEffects: [...longEffects],
  }
}
