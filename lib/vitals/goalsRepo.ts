/**
 * Pure mappers between the vitals_goals DB shape and the VitalsGoal domain type,
 * plus profile/weight assembly for the health-context engine. No IO — kept pure
 * so it is unit-testable; the Supabase reads/writes live in goalActions.ts.
 */
import type { VitalsGoal } from '@/lib/vitals/goals'
import type { VitalsGoalMetric, GoalConfidence, ProfileInput } from '@/lib/vitals/healthContext'
import type { VitalsLimiter } from '@/lib/preferences'
import type { VitalsReading } from '@/lib/vitals/advice'

/** Shape of a row read from public.vitals_goals (numerics arrive as strings). */
export interface VitalsGoalRow {
  id: string
  user_id: string
  metric: string
  direction: string
  baseline_value: string | number | null
  target_value: string | number
  window_days: number
  confidence: string
  is_provisional: boolean
  status: string
  source_limiter: string | null
  context_snapshot: unknown
  created_at: string
  baseline_set_at: string | null
  recalibrated_at: string | null
  achieved_at: string | null
}

const num = (v: string | number | null | undefined): number | null =>
  v == null ? null : typeof v === 'number' ? v : Number.isFinite(Number(v)) ? Number(v) : null

export function rowToGoal(row: VitalsGoalRow): VitalsGoal {
  return {
    metric: row.metric as VitalsGoalMetric,
    direction: row.direction === 'hold' ? 'hold' : 'up',
    baselineValue: num(row.baseline_value),
    targetValue: num(row.target_value) ?? 0,
    windowDays: row.window_days,
    confidence: row.confidence as GoalConfidence,
    isProvisional: !!row.is_provisional,
    sourceLimiter: (row.source_limiter as VitalsLimiter | null) ?? null,
  }
}

/** Insert/update payload for a freshly derived goal. */
export function goalToRow(goal: VitalsGoal, userId: string, snapshot: unknown) {
  return {
    user_id: userId,
    metric: goal.metric,
    direction: goal.direction,
    baseline_value: goal.baselineValue,
    target_value: goal.targetValue,
    window_days: goal.windowDays,
    confidence: goal.confidence,
    is_provisional: goal.isProvisional,
    context_snapshot: snapshot as Record<string, unknown> | null,
    status: 'active' as const,
    source_limiter: goal.sourceLimiter,
  }
}

/** Shape of the user_profile columns the engine reads. */
export interface ProfileRow {
  birthday: string | null
  sex: string | null
  height_cm: string | number | null
  starting_weight_kg: string | number | null
}

export function profileRowToInput(row: ProfileRow | null, latestWeight: number | null): ProfileInput {
  if (!row) return { birthday: null, sex: null, heightCm: null, weightKg: null }
  const sex = row.sex === 'M' || row.sex === 'F' ? row.sex : null
  return {
    birthday: row.birthday ?? null,
    sex,
    heightCm: num(row.height_cm),
    weightKg: latestWeight ?? num(row.starting_weight_kg),
  }
}

/** Coerce a raw wearable_data row (numerics arrive as strings) into a numeric VitalsReading. */
export function coerceReading(row: Record<string, unknown>): VitalsReading {
  const n = (v: unknown) => num(v as string | number | null)
  return {
    date: String(row.date),
    recovery: n(row.recovery),
    hrv: n(row.hrv),
    rhr: n(row.rhr),
    sleep_perf: n(row.sleep_perf),
    sleep_hours: n(row.sleep_hours),
    strain: n(row.strain),
  }
}

/** Most recent weigh-in (by date string) from a list of {date, weight_kg} rows. */
export function latestWeightKg(rows: Array<{ date: string; weight_kg: string | number }>): number | null {
  if (!rows.length) return null
  const latest = [...rows].sort((a, b) => a.date.localeCompare(b.date)).at(-1)
  return latest ? num(latest.weight_kg) : null
}
