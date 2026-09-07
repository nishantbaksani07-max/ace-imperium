/**
 * Vitals Signal engine (pure, no IO). The daily fused, personal read.
 *
 * WHOOP knows your recovery. Only Vitality also knows your training load, your
 * fuel, your goal, and what you told Vee. This engine fuses those into ONE call
 * for the day: push, steady, or recover. It is a total function — any input maps
 * to a valid Signal (or null when there is genuinely nothing to read), and it
 * never throws.
 *
 * Voice rules (see memory): warm, plain, no shame. A recover day is the body
 * asking for less, not a failure. No em dashes in any copy. Colorblind-safe: a
 * chip's meaning rides on its source + qualifier word + direction word, never on
 * hue alone.
 */
import { recoveryBand, type RecoveryBand } from '@/lib/vitals/advice'

export type SignalLean = 'push' | 'steady' | 'recover'

export interface SignalChip {
  source: 'WHOOP' | 'Oura' | 'Train' | 'Fuel' | 'Vee'
  label: string
  qualifier: string
  dir: 'up' | 'flat' | 'down' | 'good' | 'warn'
}

export interface Signal {
  lean: SignalLean
  badge: string // e.g. 'Ready to push' / 'Steady day' / 'Active recovery'
  tone: 'accent' | 'amber' // accent=push/steady, amber=recover/caution
  verdict: string // one serif-italic line, plain language, NO em dashes
  why: string // 1-2 sentence explanation, NO em dashes
  chips: SignalChip[] // one per AVAILABLE source; omit a source if no data
  goalLine: string | null
  confidence: 'low' | 'building' | 'trusted' | 'unknown'
}

export interface SignalInput {
  /** Which band the recovery/sleep readings came from. Drives the chip source
   *  label so an Oura user's chips read "Oura", not "WHOOP". Defaults to WHOOP. */
  wearableSource?: 'WHOOP' | 'Oura'
  recovery: number | null
  sleepPerf: number | null
  hrv: number | null
  strain: number | null
  weekHadData: boolean
  hardDays7: number
  trainTargetPerWeek: number
  trainedToday: boolean
  daysSinceHardTrain: number | null
  fuel: { kcal: number; kcalTarget: number; protein: number; proteinTarget: number } | null
  injuryFlags: string[] // short bodies of constraint/injury facts
  goalLabel: string | null
  goalPct: number | null
  goalTrend: 'up' | 'flat' | 'down' | null
  confidence: 'low' | 'building' | 'trusted' | 'unknown'
  gentlePace: boolean // healthContext.paceFactor < ~0.85 (older/flagged) -> bias away from push
}

const LEAN_RANK: Record<SignalLean, number> = { push: 2, steady: 1, recover: 0 }

const bandToLean = (band: RecoveryBand): SignalLean =>
  band === 'high' ? 'push' : band === 'low' ? 'recover' : 'steady'

/** Cap a lean at most at `cap` (never higher), never below recover. */
function capAt(lean: SignalLean, cap: SignalLean): SignalLean {
  return LEAN_RANK[lean] > LEAN_RANK[cap] ? cap : lean
}

/** Nudge one step toward recovery (push -> steady -> recover), never past it. */
function stepDown(lean: SignalLean): SignalLean {
  return lean === 'push' ? 'steady' : 'recover'
}

const round = (n: number) => Math.round(n)
const bandWord: Record<RecoveryBand, string> = {
  high: 'high', moderate: 'moderate', low: 'low', unknown: 'syncing',
}

const TREND_WORD: Record<'up' | 'flat' | 'down', string> = {
  up: 'climbing', flat: 'holding', down: 'easing',
}

export function computeSignal(input: SignalInput): Signal | null {
  // No data, no signal. We do not guess a day out of thin air.
  if (input.recovery == null && !input.weekHadData) return null

  const band = recoveryBand(input.recovery)
  const hasInjury = input.injuryFlags.length > 0
  const heavyLoad =
    input.trainTargetPerWeek > 0 &&
    input.hardDays7 >= input.trainTargetPerWeek &&
    (input.trainedToday || input.daysSinceHardTrain === 0) &&
    band !== 'high'
  const fuelUnder =
    input.fuel != null && input.fuel.kcalTarget > 0 && input.fuel.kcal < 0.8 * input.fuel.kcalTarget

  // Base lean from recovery, then adjust by the other signals.
  let lean = bandToLean(band)
  // injury never pushes; cap at steady so we still keep them moving.
  if (hasInjury) lean = capAt(lean, 'steady')
  // gentle pace (older / flagged) should not auto-jump to push; cap at steady.
  if (input.gentlePace) lean = capAt(lean, 'steady')
  // recent heavy load nudges one full step toward recovery.
  if (heavyLoad) lean = stepDown(lean)
  // under-fuelled today: pull one step back toward recovery, not ask for more.
  if (fuelUnder) lean = stepDown(lean)

  // identify the single driver that shaped the verdict copy (priority order).
  const driver: 'injury' | 'fuel' | 'load' | 'recovery' =
    hasInjury ? 'injury' : fuelUnder ? 'fuel' : heavyLoad ? 'load' : 'recovery'

  const { badge, tone, verdict } = copyFor(lean, driver, input)
  const why = buildWhy(lean, driver, band, input, { heavyLoad, fuelUnder, hasInjury })
  const chips = buildChips(band, input, { heavyLoad, fuelUnder })
  const goalLine = buildGoalLine(input)

  return { lean, badge, tone, verdict, why, chips, goalLine, confidence: input.confidence }
}

/** Badge + tone + the one serif verdict line, varied by what is driving the day. */
function copyFor(
  lean: SignalLean,
  driver: 'injury' | 'fuel' | 'load' | 'recovery',
  input: SignalInput,
): { badge: string; tone: 'accent' | 'amber'; verdict: string } {
  if (lean === 'push') {
    return { badge: 'Ready to push', tone: 'accent', verdict: 'Green light. Your body is primed, go after it today.' }
  }
  if (lean === 'steady') {
    if (driver === 'injury') {
      const flag = input.injuryFlags[0]
      return { badge: 'Steady day', tone: 'accent', verdict: `Work the day, just keep the ${flag} out of it.` }
    }
    return { badge: 'Steady day', tone: 'accent', verdict: 'Solid, not spectacular. Train smart and keep the streak going.' }
  }
  // recover
  if (driver === 'injury') {
    const flag = input.injuryFlags[0]
    return { badge: 'Active recovery', tone: 'amber', verdict: `Protect the ${flag} today. Keep it to easy movement.` }
  }
  if (driver === 'fuel') {
    return { badge: 'Active recovery', tone: 'amber', verdict: 'You are running a little under on fuel. Move easy and eat first.' }
  }
  return { badge: 'Active recovery', tone: 'amber', verdict: 'Today leans recovery. Move, but keep it light.' }
}

/** Assemble the 1-2 sentence "why" from the 2-3 driving factors, in plain words. */
function buildWhy(
  lean: SignalLean,
  driver: 'injury' | 'fuel' | 'load' | 'recovery',
  band: RecoveryBand,
  input: SignalInput,
  flags: { heavyLoad: boolean; fuelUnder: boolean; hasInjury: boolean },
): string {
  const parts: string[] = []

  // recovery, anchored in the real number when we have it.
  if (input.recovery != null) {
    if (band === 'high') parts.push(`Recovery is strong at ${round(input.recovery)}`)
    else if (band === 'moderate') parts.push(`Recovery is middling at ${round(input.recovery)}`)
    else parts.push(`Recovery is low at ${round(input.recovery)}`)
  } else if (input.sleepPerf != null) {
    parts.push(`Sleep came in at ${round(input.sleepPerf)}%`)
  }

  // recent load.
  if (flags.heavyLoad) {
    parts.push(`you have logged ${input.hardDays7} hard days lately, so more volume digs a hole`)
  }

  // sleep as a secondary note when it is the soft spot and recovery is the anchor.
  if (input.recovery != null && input.sleepPerf != null && input.sleepPerf < 80 && !flags.heavyLoad) {
    parts.push(`last night's sleep dipped to ${round(input.sleepPerf)}%`)
  }

  // injury.
  if (flags.hasInjury) {
    parts.push(`your ${input.injuryFlags[0]} is still flagged`)
  }

  // fuel.
  if (flags.fuelUnder && input.fuel) {
    parts.push(`you are under your fuel target today`)
  }

  // close with a warm, actionable line that matches the lean.
  const close =
    lean === 'push'
      ? 'Go use it.'
      : lean === 'steady'
        ? 'A normal session keeps the rhythm going.'
        : 'An easy day now pays off later.'

  if (parts.length === 0) return close
  const lead = parts.join(', ')
  return `${lead.charAt(0).toUpperCase()}${lead.slice(1)}. ${close}`
}

/** One chip per AVAILABLE source. Meaning rides on source + word + direction. */
function buildChips(
  band: RecoveryBand,
  input: SignalInput,
  flags: { heavyLoad: boolean; fuelUnder: boolean },
): SignalChip[] {
  const chips: SignalChip[] = []
  const wearable = input.wearableSource ?? 'WHOOP'

  // Wearable recovery.
  if (input.recovery != null) {
    chips.push({
      source: wearable,
      label: `Recovery ${round(input.recovery)}`,
      qualifier: bandWord[band],
      dir: band === 'high' ? 'up' : band === 'low' ? 'down' : 'flat',
    })
  }

  // Wearable sleep.
  if (input.sleepPerf != null) {
    const solid = input.sleepPerf >= 80
    chips.push({
      source: wearable,
      label: `Sleep ${round(input.sleepPerf)}%`,
      qualifier: solid ? 'solid' : 'light',
      dir: solid ? 'up' : 'flat',
    })
  }

  // Train load.
  if (input.trainTargetPerWeek > 0) {
    const n = input.hardDays7
    chips.push({
      source: 'Train',
      label: `${n} hard ${n === 1 ? 'day' : 'days'}`,
      qualifier: flags.heavyLoad ? 'high' : 'on track',
      dir: flags.heavyLoad ? 'down' : 'flat',
    })
  }

  // Fuel.
  if (input.fuel != null && input.fuel.kcalTarget > 0) {
    chips.push({
      source: 'Fuel',
      label: flags.fuelUnder ? 'Fuel under target' : 'Fuel on track',
      qualifier: flags.fuelUnder ? 'low' : 'adequate',
      dir: flags.fuelUnder ? 'warn' : 'good',
    })
  }

  // Vee (an injury or constraint the user told the mentor about).
  if (input.injuryFlags.length > 0) {
    chips.push({
      source: 'Vee',
      label: input.injuryFlags[0],
      qualifier: 'flagged',
      dir: 'warn',
    })
  }

  return chips
}

/** "68% to Recover better, climbing" style momentum line, or null. */
function buildGoalLine(input: SignalInput): string | null {
  if (!input.goalLabel || input.goalPct == null) return null
  const pct = Math.round(Math.min(1, Math.max(0, input.goalPct)) * 100)
  const trend = input.goalTrend ? `, ${TREND_WORD[input.goalTrend]}` : ''
  return `${pct}% to ${input.goalLabel}${trend}`
}
