/**
 * lib/home/presence.ts - pure presence + anticipation derivations for the
 * "Vitality, I'm home" ritual.
 *
 * THE LAW of the ritual:
 *   1. ZERO-INPUT - the ritual never asks for what the account can tell it.
 *   2. PRESENCE-DRIVEN - a beat exists only when its stream does; the ritual
 *      gracefully shortens for a one-tile user and lengthens for a power user.
 *   3. ANTICIPATE, NEVER ASK - missing today-data is inferred from history
 *      and spoken as an anticipation ("reads as", "you usually land around").
 *      An inference with no basis simply does not render.
 *
 * Everything here is a pure function of the HomePull - no fetch, no Date.now,
 * no storage - so each derivation is unit-testable with plain fixtures.
 */

import type { HomePull, PullWaterDay } from './pullTypes'
import { parseRotationDays, type SplitDay } from '@/app/app/fitness/log/splitData'

/** Rows this recent (days) count as a live habit, not an abandoned experiment. */
const MANUAL_HABIT_WINDOW_DAYS = 14

/** Fewer basis days than this and a "you usually" claim has no legs. */
const MIN_BASIS_DAYS = 3

export interface Presence {
  /** Any non-manual provider row in the pull window. */
  hasBand: boolean
  /** A manual vitals row inside the last 14 days - this user self-logs. */
  manualHabit: boolean
  /** The vitals beat exists: a band, a manual habit, or data today. */
  usesVitals: boolean
  usesWater: boolean
  usesFuel: boolean
  usesTrain: boolean
  usesPeak: boolean
  /** This user historically types RHR into the manual check-in. */
  manualRhrHabit: boolean
  /** This user historically types HRV into the manual check-in. */
  manualHrvHabit: boolean
}

/** Whole days between two local YYYY-MM-DD keys (today - then). */
export function daysBetween(today: string, then: string): number {
  const a = new Date(`${today}T00:00:00`).getTime()
  const b = new Date(`${then}T00:00:00`).getTime()
  return Math.round((a - b) / 86_400_000)
}

function peakHasHistory(peakState: unknown): boolean {
  if (!peakState || typeof peakState !== 'object') return false
  const subs = (peakState as { substances?: unknown }).substances
  return Array.isArray(subs) && subs.length > 0
}

export function derivePresence(pull: HomePull): Presence {
  const manualRows = pull.readings.filter((r) => {
    if (r.provider !== 'manual') return false
    const d = daysBetween(pull.today, r.date)
    return d >= 0 && d <= MANUAL_HABIT_WINDOW_DAYS
  })
  const hasBand = pull.readings.some((r) => r.provider !== 'manual')
  const manualHabit = manualRows.length > 0
  const anyReadingToday = pull.readings.some((r) => r.date === pull.today)

  const waterRecent = pull.waterRecent ?? []
  const usesWater = waterRecent.some((w) => (w.count ?? 0) > 0)

  const fuel = pull.fuel ?? null
  const usesFuel =
    fuel != null && (fuel.onboarded || fuel.todayKcal != null || fuel.recentDayKcals.length > 0)

  const usesTrain =
    pull.trainingDay != null ||
    parseRotationDays(pull.rotationDays) != null ||
    pull.recentWorkouts.length > 0

  return {
    hasBand,
    manualHabit,
    usesVitals: hasBand || manualHabit || anyReadingToday,
    usesWater,
    usesFuel,
    usesTrain,
    usesPeak: peakHasHistory(pull.peakState),
    manualRhrHabit: manualRows.some((r) => r.rhr != null),
    manualHrvHabit: manualRows.some((r) => r.hrv != null),
  }
}

/* ── Training-day anticipation ──────────────────────────────────────────── */

export interface TrainingAnticipation {
  name: string
  /** 'locked' = a training_day row exists; 'inferred' = rotation math;
   *  'done' = a workout dated TODAY is already logged (session in the books). */
  confidence: 'locked' | 'inferred' | 'done'
  isRest: boolean
  /** Mono meta under the day name - only claims the data supports. */
  meta: string
  /** Set when the inference chained off a workout logged yesterday. */
  yesterdayName: string | null
}

const norm = (s: string) => s.trim().toLowerCase()

const typeLabel = (t: SplitDay['type']) => t.charAt(0) + t.slice(1).toLowerCase()

const dayMeta = (d: SplitDay) =>
  `${typeLabel(d.type)} · ${d.exercises.length} exercise${d.exercises.length === 1 ? '' : 's'}`

/**
 * Where does today land in the split?
 *   locked training_day row -> 'locked', as the user set it.
 *   rotation math -> 'inferred': the rotation entry AFTER the most recent
 *     logged rotation day (post cycle-reset), rest days included, spoken as
 *     "Yesterday was Push. Today reads as Pull." by the gym beat.
 *   no rotation and nothing locked -> null. A hardcoded day-of-week guess has
 *   no basis in this account, so per THE LAW it does not render.
 */
export function inferTodayTrainingDay(opts: {
  rotationDays: unknown
  recentWorkouts: { date: string; day_name: string | null }[]
  today: string
  trainingDay?: string | null
  cycleStartedAt?: string | null
}): TrainingAnticipation | null {
  const { rotationDays, recentWorkouts, today, trainingDay, cycleStartedAt } = opts
  const rotation = parseRotationDays(rotationDays)

  // 1. A day locked for today wins outright; enrich it from the rotation.
  if (trainingDay) {
    const match = rotation?.find((d) => norm(d.name) === norm(trainingDay)) ?? null
    const isRest = match ? match.category === 'rest' : norm(trainingDay) === 'rest'
    return {
      name: trainingDay,
      confidence: 'locked',
      isRest,
      meta:
        match && match.exercises.length > 0
          ? dayMeta(match)
          : isRest
            ? 'Recovery day'
            : 'Locked for today',
      yesterdayName: null,
    }
  }

  // 2. Rotation math. Workouts completed before a "start a new week" reset do
  //    not advance the pointer (mirrors how the logger board clears).
  if (rotation && rotation.length > 0) {
    const cycleMs = cycleStartedAt ? new Date(cycleStartedAt).getTime() : null
    const last = recentWorkouts.find((w) => {
      if (!w.day_name) return false
      if (!rotation.some((d) => norm(d.name) === norm(w.day_name!))) return false
      // Only the day key is known - a workout counts as post-reset when its
      // local day ends after the marker.
      return cycleMs == null || new Date(`${w.date}T23:59:59`).getTime() > cycleMs
    })

    // A workout dated TODAY means the session is in the books - anticipating
    // the NEXT rotation day as "today" would propose a second session on top
    // of real data (verify HIGH-2). Say done instead.
    if (last?.day_name && daysBetween(today, last.date) === 0) {
      const match = rotation.find((d) => norm(d.name) === norm(last.day_name!)) ?? null
      return {
        name: last.day_name,
        confidence: 'done',
        isRest: match ? match.category === 'rest' : false,
        meta: 'Already in the books today',
        yesterdayName: null,
      }
    }

    let next: SplitDay | null = null
    if (last?.day_name) {
      const idx = rotation.findIndex((d) => norm(d.name) === norm(last.day_name!))
      // The immediate next rotation entry, rest days INCLUDED - a rest day in
      // the split is part of the pattern, not a gap to skip. Only step past
      // malformed non-rest days with zero exercises.
      for (let step = 1; step <= rotation.length; step++) {
        const cand = rotation[(idx + step) % rotation.length]
        if (cand.category === 'rest' || cand.exercises.length > 0) {
          next = cand
          break
        }
      }
    } else {
      // Never logged inside this rotation: it starts at the top.
      next = rotation.find((d) => d.category === 'rest' || d.exercises.length > 0) ?? null
    }
    if (!next) return null

    const isRest = next.category === 'rest'
    const yesterdayName =
      last?.day_name != null && daysBetween(today, last.date) === 1 ? last.day_name : null
    return {
      name: next.name,
      confidence: 'inferred',
      isRest,
      meta: isRest ? 'Recovery day' : dayMeta(next),
      yesterdayName,
    }
  }

  // 3. No locked day and no rotation: no basis, no guess.
  return null
}

/* ── Fuel + water anticipations ─────────────────────────────────────────── */

/**
 * "You usually land around N kcal" - mean of the last logged days, rounded to
 * 50. Needs at least 3 logged days or the claim has no basis and returns null.
 */
export function typicalKcal(recentDayKcals: number[]): number | null {
  const days = recentDayKcals.filter((v) => Number.isFinite(v) && v > 0)
  if (days.length < MIN_BASIS_DAYS) return null
  const mean = days.reduce((s, v) => s + v, 0) / days.length
  return Math.round(mean / 50) * 50
}

export interface WaterPace {
  /** Servings already down today (0 when no row). */
  todayCount: number
  /** Typical servings on an active day, or null with fewer than 3 active days. */
  typical: number | null
}

/** Water pace from the last active days: today's count + the usual landing. */
export function waterPace(waterRecent: PullWaterDay[], today: string): WaterPace {
  const rows = waterRecent ?? []
  const todayCount = rows.find((r) => r.date === today)?.count ?? 0
  const active = rows.filter((r) => r.date !== today && (r.count ?? 0) > 0)
  if (active.length < MIN_BASIS_DAYS) return { todayCount, typical: null }
  const mean = active.reduce((s, r) => s + r.count, 0) / active.length
  return { todayCount, typical: Math.max(1, Math.round(mean)) }
}
