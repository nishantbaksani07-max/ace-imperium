'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getVitalsQuiz, type VitalsHealthFlag, type VitalsLimiter } from '@/lib/preferences'
import { saveVitalsQuiz } from '@/app/app/quiz/actions'
import { computeHealthContext } from '@/lib/vitals/healthContext'
import { deriveVitalsGoal, deriveVitalsGoalForMetric, recalibrateGoal, evaluateGoalProgress, type VitalsGoal } from '@/lib/vitals/goals'
import type { VitalsGoalMetric } from '@/lib/vitals/healthContext'
import {
  rowToGoal, goalToRow, profileRowToInput, latestWeightKg, coerceReading,
  type VitalsGoalRow, type ProfileRow,
} from '@/lib/vitals/goalsRepo'
import { getPrimaryProvider, type WearableProviderId } from '@/lib/vitals/wearables'

export type GoalActionResult = { ok: true } | { ok: false; error: string }

const READINGS_FIELDS = 'date, recovery, hrv, rhr, sleep_perf, sleep_hours, strain'

/** Pull everything the engine needs for a user, RLS-scoped. Shared by create + recalibrate. */
async function gatherContextInputs(supabase: SupabaseClient, userId: string, today: string, provider?: WearableProviderId) {
  // Read the user's connected band's rows (not a hardcoded WHOOP), so an Oura
  // user's goal calibrates off their own data.
  const prov = provider ?? (await getPrimaryProvider(supabase, userId)) ?? 'whoop'
  const [{ data: profile }, { data: weights }, { data: readings }, quiz] = await Promise.all([
    supabase.from('user_profile').select('birthday, sex, height_cm, starting_weight_kg').eq('user_id', userId).maybeSingle(),
    supabase.from('weights').select('date, weight_kg').eq('user_id', userId).order('date', { ascending: false }).limit(1),
    supabase.from('wearable_data').select(READINGS_FIELDS).eq('user_id', userId).eq('provider', prov).order('date', { ascending: false }).limit(30),
    getVitalsQuiz(supabase, userId),
  ])
  const profileInput = profileRowToInput((profile as ProfileRow) ?? null, latestWeightKg((weights as Array<{ date: string; weight_kg: string }>) ?? []))
  const ctx = computeHealthContext({
    profile: profileInput,
    readings: ((readings as Record<string, unknown>[]) ?? []).map(coerceReading),
    flags: quiz?.healthFlags ?? [],
    today,
  })
  return { ctx, quiz }
}

function localDateKey(): string {
  // local YYYY-MM-DD (see CLAUDE.md date handling); avoids UTC drift
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * Derive + persist the user's active vitals goal. If an active goal exists,
 * updates it in place (non-destructive upsert). Otherwise inserts fresh.
 * Called right after the vitals quiz is saved. Safe to re-take mid-goal.
 *
 * Achieved goals (status != 'active') are left in history — retaking the quiz
 * after achieving correctly INSERTs a fresh active goal.
 */
export async function createVitalsGoal(): Promise<GoalActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }

  const { ctx, quiz } = await gatherContextInputs(supabase, user.id, localDateKey())
  const goal = deriveVitalsGoal(quiz, ctx)

  const payload = goalToRow(goal, user.id, ctx)
  const existing = await getActiveGoal(supabase, user.id)
  const { error } = existing
    ? await supabase.from('vitals_goals')
        .update({ ...payload, recalibrated_at: new Date().toISOString() })
        .eq('user_id', user.id).eq('status', 'active')
    : await supabase.from('vitals_goals').insert(payload)
  if (error) return { ok: false, error: `Failed to save goal: ${error.message}` }

  revalidatePath('/app/vitals')
  revalidatePath('/app/vitals/whoop')
  revalidatePath('/app/vitals/oura')
  revalidatePath('/app/vitals/manual')
  return { ok: true }
}

/** Read the user's active goal (or null). RLS-scoped. For server pages. */
export async function getActiveGoal(supabase: SupabaseClient, userId: string): Promise<VitalsGoal | null> {
  const { data } = await supabase
    .from('vitals_goals')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  return data ? rowToGoal(data as VitalsGoalRow) : null
}

/**
 * Recompute the active goal's target from fresh data (provisional -> sharpen).
 * Ease-only on up targets (recalibrateGoal enforces this). Writes back only the
 * fields that change. Safe to call on every readings-page load.
 */
export async function recalibrateActiveGoal(supabase: SupabaseClient, userId: string, provider?: WearableProviderId): Promise<VitalsGoal | null> {
  const current = await getActiveGoal(supabase, userId)
  if (!current) return null
  const { ctx } = await gatherContextInputs(supabase, userId, localDateKey(), provider)
  const next = recalibrateGoal(current, ctx)
  if (
    next.targetValue !== current.targetValue ||
    next.confidence !== current.confidence ||
    next.isProvisional !== current.isProvisional ||
    next.baselineValue !== current.baselineValue
  ) {
    await supabase.from('vitals_goals').update({
      target_value: next.targetValue,
      baseline_value: next.baselineValue,
      confidence: next.confidence,
      is_provisional: next.isProvisional,
      window_days: next.windowDays,
      direction: next.direction,
      recalibrated_at: new Date().toISOString(),
      ...(next.confidence === 'trusted' && current.baselineValue == null ? { baseline_set_at: new Date().toISOString() } : {}),
    }).eq('user_id', userId).eq('status', 'active')
  }
  return next
}

/** Swap the active goal to a user-chosen metric (from the goal-set screen). */
export async function setActiveGoalMetric(metric: VitalsGoalMetric): Promise<GoalActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }

  const { ctx, quiz } = await gatherContextInputs(supabase, user.id, localDateKey())
  const goal = deriveVitalsGoalForMetric(metric, quiz, ctx)
  const payload = goalToRow(goal, user.id, ctx)
  const existing = await getActiveGoal(supabase, user.id)
  const { error } = existing
    ? await supabase.from('vitals_goals').update({ ...payload, recalibrated_at: new Date().toISOString() }).eq('user_id', user.id).eq('status', 'active')
    : await supabase.from('vitals_goals').insert(payload)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/app/vitals/quiz/goal')
  revalidatePath('/app/vitals/whoop')
  revalidatePath('/app/vitals/oura')
  revalidatePath('/app/vitals/manual')
  return { ok: true }
}

/**
 * Goal picker (replaces the vitals quiz). The user explicitly chose a goal, so
 * we (1) save a minimal preferences slice — this stamps `completed_at`, which is
 * what unlocks the hard-walled metrics page — carrying only the safety flags Vee
 * needs, then (2) derive + save the active goal for the chosen metric. The old
 * quiz-only fields get sensible defaults so existing readers keep type-checking;
 * the real goal comes from the explicit metric, not `biggestLimiter`.
 */
const METRIC_TO_LIMITER: Record<VitalsGoalMetric, VitalsLimiter> = {
  sleep: 'sleep', recovery: 'energy', hrv: 'stress', strain: 'plateau',
}

export async function pickVitalsGoal(
  metric: VitalsGoalMetric,
  healthFlags: VitalsHealthFlag[],
  healthFlagsOther?: string,
): Promise<GoalActionResult> {
  const other = (healthFlagsOther ?? '').trim()
  const flags = (healthFlags ?? []).filter(f => f !== 'other' || other.length > 0)
  await saveVitalsQuiz({
    v: 1,
    sleepConsistency: 'steady',
    caffeineCutoff: 'none',
    biggestLimiter: METRIC_TO_LIMITER[metric],
    healthFlags: flags,
    ...(other ? { healthFlagsOther: other } : {}),
  })
  return setActiveGoalMetric(metric)
}

/**
 * DEV ONLY — wipe this user's vitals setup (the prefs slice + their goals) so
 * the connect → goal-picker → celebrate flow can be re-walked without a fresh
 * account. RLS-scoped to the caller. The UI that calls this is guarded to
 * non-production (VERCEL_ENV !== 'production'); this action also no-ops in prod.
 */
export async function resetVitalsSetup(): Promise<GoalActionResult> {
  if (process.env.VERCEL_ENV === 'production') return { ok: false, error: 'disabled in production' }
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }

  // 1) drop the vitals prefs slice (this is the gate — clearing it shows the picker again)
  const { data: prof } = await supabase.from('user_profile').select('preferences').eq('user_id', user.id).maybeSingle()
  const raw = prof?.preferences
  const prefs = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {}
  delete prefs.vitals
  const upd = await supabase.from('user_profile').update({ preferences: prefs }).eq('user_id', user.id)
  if (upd.error) return { ok: false, error: `prefs: ${upd.error.message}` }

  // 2) delete every goal (active + history) and the cached insight lines
  const delGoals = await supabase.from('vitals_goals').delete().eq('user_id', user.id)
  if (delGoals.error) return { ok: false, error: `goals: ${delGoals.error.message}` }
  await supabase.from('vitals_insights').delete().eq('user_id', user.id)

  // Keeps the WHOOP connection + synced data so you skip the (separate, buggy)
  // connect step and land straight on the picker.
  revalidatePath('/app/vitals')
  revalidatePath('/app/vitals/quiz')
  revalidatePath('/app/vitals/whoop')
  revalidatePath('/app/vitals/oura')
  revalidatePath('/app/vitals/manual')
  return { ok: true }
}

/** Mark the active goal achieved (after evaluateGoalProgress confirms a held target). */
export async function markGoalAchieved(): Promise<GoalActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }

  const goal = await getActiveGoal(supabase, user.id)
  if (!goal) return { ok: false, error: 'No active goal.' }

  // server-side guard: only mark achieved if the engine agrees on fresh data
  const prov = (await getPrimaryProvider(supabase, user.id)) ?? 'whoop'
  const { data: readings } = await supabase
    .from('wearable_data').select(READINGS_FIELDS).eq('user_id', user.id).eq('provider', prov)
    .order('date', { ascending: false }).limit(7)
  const progress = evaluateGoalProgress(goal, ((readings as Record<string, unknown>[]) ?? []).map(coerceReading))
  if (!progress.achieved) return { ok: false, error: 'Goal not achieved yet.' }

  const { error } = await supabase.from('vitals_goals')
    .update({ status: 'achieved', achieved_at: new Date().toISOString() })
    .eq('user_id', user.id).eq('status', 'active')
  if (error) return { ok: false, error: error.message }

  revalidatePath('/app/vitals')
  revalidatePath('/app/vitals/whoop')
  revalidatePath('/app/vitals/oura')
  revalidatePath('/app/vitals/manual')
  return { ok: true }
}
