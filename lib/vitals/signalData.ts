/**
 * Server-side gather for the Vitals Signal. Reads every source the engine fuses
 * (WHOOP readings, training load, fuel, the goal, and what the user told Vee),
 * shapes them into a SignalInput, and runs the pure engine. Mirrors the existing
 * data-gather patterns: goalActions.gatherContextInputs (profile + readings +
 * HealthContext), contributors/train (hard days + weekly target), contributors/
 * fuel (4am day-key meals vs nutrition_goals), userFacts (constraint facts).
 *
 * Every read is RLS-scoped with an explicit `.eq('user_id', userId)` and each
 * source is individually try/caught so one failing query just drops that input
 * rather than breaking the page. The whole body is wrapped so it NEVER throws —
 * the caller gets a Signal or null, and the page degrades gracefully on null.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getVitalsQuiz } from '@/lib/preferences'
import { getLocalDateKey, getRecentDateKeys } from '@/lib/dates'
import { getLocalDayKey, getRecentDayKeys } from '@/lib/nutrition/dayKey'
import { computeHealthContext } from '@/lib/vitals/healthContext'
import { trainTargetPerWeek } from '@/lib/vitality/contributors/train'
import { evaluateGoalProgress } from '@/lib/vitals/goals'
import {
  coerceReading, profileRowToInput, latestWeightKg, rowToGoal,
  type ProfileRow, type VitalsGoalRow,
} from '@/lib/vitals/goalsRepo'
import { readFacts, selectRelevantFacts } from '@/lib/memory/userFacts'
import { goalCopy } from '@/lib/vitals/goalCopy'
import { computeSignal, type Signal } from '@/lib/vitals/signal'
import { getPrimaryProvider, WEARABLES, type WearableProviderId } from '@/lib/vitals/wearables'

const READINGS_FIELDS = 'date, recovery, hrv, rhr, sleep_perf, sleep_hours, strain'
/** paceFactor below this means we bias away from auto-pushing (older / flagged). */
const GENTLE_PACE_AT = 0.85
const SIGNAL_CONFIDENCE = new Set(['low', 'building', 'trusted'])

type RotationDay = { category?: string; type?: string }

/** Run one IO unit, swallowing any failure to a fallback (never throws). */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch {
    return fallback
  }
}

export async function gatherSignal(
  supabase: SupabaseClient,
  userId: string,
  today: string,
  opts?: { facts?: Awaited<ReturnType<typeof readFacts>>; provider?: WearableProviderId },
): Promise<Signal | null> {
  try {
    // Which band feeds the recovery/sleep inputs (defaults to the user's primary
    // connected band, falling back to WHOOP). Labels the wearable chips too.
    const provider = opts?.provider ?? (await getPrimaryProvider(supabase, userId)) ?? 'whoop'
    // Trailing windows. Midnight keys for the wearable + workouts; 4am keys for fuel.
    const dateKeys = getRecentDateKeys(today, 7)
    const todayDateKey = dateKeys[0] ?? getLocalDateKey()
    const dayKeyToday = getLocalDayKey()
    const fuelKeys = getRecentDayKeys(dayKeyToday, 7)

    const [readingRows, profileRow, weightRows, quiz, settings, workoutRows, fuelGoal, mealRows, facts, goalRow] =
      await Promise.all([
        safe(async () => {
          const { data } = await supabase.from('wearable_data').select(READINGS_FIELDS)
            .eq('user_id', userId).eq('provider', provider)
            .order('date', { ascending: false }).limit(30)
          return (data as Record<string, unknown>[]) ?? []
        }, [] as Record<string, unknown>[]),
        safe(async () => {
          const { data } = await supabase.from('user_profile')
            .select('birthday, sex, height_cm, starting_weight_kg')
            .eq('user_id', userId).maybeSingle()
          return (data as ProfileRow) ?? null
        }, null as ProfileRow | null),
        safe(async () => {
          const { data } = await supabase.from('weights').select('date, weight_kg')
            .eq('user_id', userId).order('date', { ascending: false }).limit(1)
          return (data as Array<{ date: string; weight_kg: string }>) ?? []
        }, [] as Array<{ date: string; weight_kg: string }>),
        safe(() => getVitalsQuiz(supabase, userId), null),
        safe(async () => {
          const { data } = await supabase.from('training_settings')
            .select('rotation_days, setup_complete')
            .eq('user_id', userId).maybeSingle()
          return data as { rotation_days?: RotationDay[]; setup_complete?: boolean } | null
        }, null as { rotation_days?: RotationDay[]; setup_complete?: boolean } | null),
        safe(async () => {
          const { data } = await supabase.from('workouts').select('date')
            .eq('user_id', userId).in('date', dateKeys)
            .not('submitted_at', 'is', null)
          return (data as Array<{ date: string }>) ?? []
        }, [] as Array<{ date: string }>),
        safe(async () => {
          const { data } = await supabase.from('nutrition_goals')
            .select('kcal_target, protein_target, onboarded')
            .eq('user_id', userId).maybeSingle()
          return data as { kcal_target?: number; protein_target?: number; onboarded?: boolean } | null
        }, null as { kcal_target?: number; protein_target?: number; onboarded?: boolean } | null),
        safe(async () => {
          const { data } = await supabase.from('nutrition_meals').select('day_key, totals')
            .eq('user_id', userId).eq('day_key', fuelKeys[0])
          return (data as Array<{ day_key: string; totals: { kcal?: number; protein?: number } | null }>) ?? []
        }, [] as Array<{ day_key: string; totals: { kcal?: number; protein?: number } | null }>),
        opts?.facts ? Promise.resolve(opts.facts) : safe(() => readFacts(supabase, userId), []),
        safe(async () => {
          const { data } = await supabase.from('vitals_goals').select('*')
            .eq('user_id', userId).eq('status', 'active').maybeSingle()
          return (data as VitalsGoalRow) ?? null
        }, null as VitalsGoalRow | null),
      ])

    // ── WHOOP readings → latest + HealthContext ─────────────────────────
    const readings = readingRows.map(coerceReading)
    const latest = readings.length ? readings[0] : null
    const weekHadData = readings.length > 0

    const profileInput = profileRowToInput(profileRow, latestWeightKg(weightRows))
    const ctx = computeHealthContext({
      profile: profileInput,
      readings,
      flags: quiz?.healthFlags ?? [],
      today: todayDateKey,
    })
    const confidence = SIGNAL_CONFIDENCE.has(ctx.confidence) ? ctx.confidence : 'unknown'

    // ── Train: weekly target + hard days in window + trained-today ──────
    const target = settings?.setup_complete === true
      ? trainTargetPerWeek((settings?.rotation_days as RotationDay[]) ?? [])
      : 0
    const windowSet = new Set(dateKeys)
    const hardDates = new Set((workoutRows ?? []).map(w => w.date).filter(d => windowSet.has(d)))
    const hardDays7 = hardDates.size
    const trainedToday = hardDates.has(todayDateKey)
    // days since the most recent hard (submitted) session, relative to today.
    let daysSinceHardTrain: number | null = null
    for (let i = 0; i < dateKeys.length; i++) {
      if (hardDates.has(dateKeys[i])) { daysSinceHardTrain = i; break }
    }

    // ── Fuel: today's kcal + protein vs nutrition_goals ─────────────────
    let fuel: { kcal: number; kcalTarget: number; protein: number; proteinTarget: number } | null = null
    const kcalTarget = Number(fuelGoal?.kcal_target ?? 0)
    if (fuelGoal?.onboarded === true && kcalTarget > 0) {
      let kcal = 0
      let protein = 0
      for (const m of mealRows ?? []) {
        kcal += Number(m.totals?.kcal ?? 0)
        protein += Number(m.totals?.protein ?? 0)
      }
      fuel = { kcal, kcalTarget, protein, proteinTarget: Number(fuelGoal?.protein_target ?? 0) }
    }

    // ── Vee: short injury / constraint facts the user told the mentor ───
    const constraints = selectRelevantFacts(facts, {
      now: new Date().toISOString(), kinds: ['constraint'], minSalience: 0.3, limit: 2,
    })
    const injuryFlags = constraints.map(f => f.body.trim()).filter(b => b.length > 0 && b.length <= 40)

    // ── Goal: active goal + progress + trend ────────────────────────────
    // Isolated: a goal-read error only drops the goal line, never the whole
    // signal (the rest of the fused read still returns).
    let goalLabel: string | null = null
    let goalPct: number | null = null
    let goalTrend: 'up' | 'flat' | 'down' | null = null
    try {
      if (goalRow) {
        const goal = rowToGoal(goalRow)
        if (!goal.isProvisional) {
          const progress = evaluateGoalProgress(goal, readings)
          goalLabel = goalCopy(goal).badgeLabel
          goalPct = progress.pct
          // True trend: where the 7-day average sits vs the personal baseline,
          // not a pct threshold (a low pct just means early, not declining).
          // 'hold' goals read flat; a small dead-zone avoids flicker. Warm
          // wording is applied downstream (down = 'easing').
          const base = goal.baselineValue
          const avg = progress.currentAvg
          if (goal.direction === 'hold' || base == null || avg == null) {
            goalTrend = 'flat'
          } else if (avg > base * 1.02) {
            goalTrend = 'up'
          } else if (avg < base * 0.98) {
            goalTrend = 'down'
          } else {
            goalTrend = 'flat'
          }
        }
      }
    } catch { /* goal line stays null; the rest of the signal still returns */ }

    return computeSignal({
      wearableSource: WEARABLES[provider].label as 'WHOOP' | 'Oura',
      recovery: latest?.recovery ?? null,
      sleepPerf: latest?.sleep_perf ?? null,
      hrv: latest?.hrv ?? null,
      strain: latest?.strain ?? null,
      weekHadData,
      hardDays7,
      trainTargetPerWeek: target,
      trainedToday,
      daysSinceHardTrain,
      fuel,
      injuryFlags,
      goalLabel,
      goalPct,
      goalTrend,
      confidence,
      gentlePace: ctx.paceFactor < GENTLE_PACE_AT,
    })
  } catch {
    return null
  }
}
