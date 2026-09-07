// Server-only (NOT a 'use server' action file): a plain async helper called from
// the Fuel server component. It takes a SupabaseClient, which is non-serializable
// and so must not live in a 'use server' module (every export there becomes a
// client-callable action with serializable params). The client-facing decision
// action lives in checkinActions.ts.

import type { SupabaseClient } from '@supabase/supabase-js'

import { evaluateCheckin, type Checkin } from '@/lib/nutrition/adaptive'
import type { NutritionGoals } from '@/lib/nutrition/types'
import { weekStartKey } from '@/lib/nutrition/week'
import type { CheckinDecision } from './serialize'

/**
 * Compute the current week's check-in and ensure a `pending` audit row exists
 * (idempotent via the (user_id, week_start) unique key). MIGRATION-SAFE: any DB
 * error (e.g. the nutrition_checkins table not applied yet) is swallowed and the
 * freshly-computed check-in is returned with decision 'pending', so Fuel still
 * loads. Does not persist a row while `calibrating` (no suggestion to record) or
 * when adaptive is disabled. Never overwrites an existing decided row.
 */
export async function loadOrCreateWeeklyCheckin(
  supabase: SupabaseClient,
  userId: string,
  goals: NutritionGoals,
  weighIns: { date: string; weightKg: number }[],
  dailyKcal: { dayKey: string; kcal: number }[],
): Promise<{ checkin: Checkin; weekStart: string; decision: CheckinDecision }> {
  const weekStart = weekStartKey()
  const checkin = evaluateCheckin({
    weighIns,
    dailyKcal,
    band: goals.goalBand,
    currentTargetKcal: goals.kcalTarget, // kcal_target is the weekly-average base
  })

  if (!goals.adaptiveEnabled) return { checkin, weekStart, decision: 'pending' }

  try {
    const { data: existing } = await supabase
      .from('nutrition_checkins')
      .select('decision')
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .maybeSingle()
    if (existing) return { checkin, weekStart, decision: (existing.decision || 'pending') as CheckinDecision }

    if (checkin.status !== 'calibrating') {
      await supabase.from('nutrition_checkins').insert({
        user_id: userId,
        week_start: weekStart,
        status: checkin.status,
        trend_rate_kg_wk: checkin.trendRateKgPerWeek,
        maintenance_kcal: checkin.maintenanceKcal,
        avg_kcal: checkin.avgKcal,
        prev_kcal: goals.kcalTarget,
        suggested_kcal: checkin.suggestedKcal,
        decision: 'pending',
      })
    }
  } catch {
    // table not present yet (pre-migration) — return the computed check-in only
  }
  return { checkin, weekStart, decision: 'pending' }
}
