'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import { acceptedGoalPatch } from '@/lib/nutrition/applyCheckin'
import { rowToGoals, type GoalsRow } from './serialize'

type Result = { ok: true } | { ok: false; error: string }

/**
 * Apply the user's decision to this week's check-in. `accepted` moves the plan's
 * targets (cycle-aware) to the suggested number; `dismissed` leaves targets;
 * `grace` excludes the week from steering. RLS-scoped; the target stays editable.
 */
export async function decideCheckin(
  weekStart: string,
  decision: 'accepted' | 'dismissed' | 'grace',
): Promise<Result> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  const { data: row, error: rowErr } = await supabase
    .from('nutrition_checkins')
    .select('suggested_kcal, decision')
    .eq('user_id', user.id)
    .eq('week_start', weekStart)
    .maybeSingle()
  if (rowErr) return { ok: false, error: rowErr.message }
  if (!row) return { ok: false, error: 'no_checkin' }

  const decidedAt = new Date().toISOString()

  if (decision === 'accepted' && row.suggested_kcal != null) {
    const { data: goalsRow } = await supabase
      .from('nutrition_goals')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
    const goals = rowToGoals((goalsRow ?? null) as GoalsRow | null)
    const patch = acceptedGoalPatch(goals, Number(row.suggested_kcal))
    const { error: goalErr } = await supabase
      .from('nutrition_goals')
      .update({ ...patch, updated_at: decidedAt })
      .eq('user_id', user.id)
    if (goalErr) return { ok: false, error: goalErr.message }
  }

  const { error: markErr } = await supabase
    .from('nutrition_checkins')
    .update({ decision, decided_at: decidedAt })
    .eq('user_id', user.id)
    .eq('week_start', weekStart)
  if (markErr) return { ok: false, error: markErr.message }

  revalidatePath('/app/fuel')
  revalidatePath('/app/fuel/macros')
  return { ok: true }
}

/**
 * Flip the Maintenance master toggle. Also the consent action for the
 * numbers-off (`feel_first`) gate: tapping "turn on macro counting" sets this
 * true. Migration-safe: swallows the error if the column is not applied yet.
 */
export async function setAdaptiveEnabled(enabled: boolean): Promise<Result> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  const { error } = await supabase
    .from('nutrition_goals')
    .update({ adaptive_enabled: enabled })
    .eq('user_id', user.id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/app/fuel')
  return { ok: true }
}
