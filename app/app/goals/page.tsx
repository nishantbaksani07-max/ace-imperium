import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBigGoals, getHabitGoals, getStreak } from '@/lib/goals/repo'
import type { SuggestionEvidence } from '@/lib/vee/loadNoticed'
import { EMPTY_STREAK, type VeeGoalsState } from './veeTypes'
import VeeGoals from './VeeGoals'

export const dynamic = 'force-dynamic'

/** Local YYYY-MM-DD key for n days ago (mirrors loadNoticed's daysAgoKey). */
function daysAgoKey(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * /app/goals — the real, auth'd Vee Goals surface (BUILD42 Phase 1).
 *
 * Auth gate (mirrors app/app/mind/page.tsx) then reads the user's goals from
 * Supabase and hands a typed snapshot to the client. The repo reads THROW on a
 * DB error (so Vee's degraded flag can see them); the try/catch below is what
 * keeps a not-yet-migrated environment on the calm blank-slate instead of a
 * 500 - saving simply switches on once the migration is applied.
 *
 * Auto-track suggestions are evidence-gated with the SAME recency bars as the
 * Vee page (loadNoticed): "from your workouts" needs a session in 21 days,
 * "from Fuel" a meal in 21 days, "from your band" a sleep reading in 56 days.
 * Any failed read defaults to false — no evidence, no pitch.
 */
export default async function GoalsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let initial: VeeGoalsState = { bigGoals: [], habitGoals: [], streak: EMPTY_STREAK }
  let suggestionEvidence: SuggestionEvidence = { train: false, protein: false, sleep: false }
  try {
    const [bigGoals, habitGoals, streak, trainRes, mealsRes, sleepRes] = await Promise.all([
      getBigGoals(supabase, user.id),
      getHabitGoals(supabase, user.id),
      getStreak(supabase, user.id),
      supabase.from('workouts').select('id').eq('user_id', user.id).not('submitted_at', 'is', null).gte('date', daysAgoKey(21)).limit(1),
      supabase.from('nutrition_meals').select('id').eq('user_id', user.id).gte('day_key', daysAgoKey(21)).limit(1),
      supabase.from('wearable_data').select('date').eq('user_id', user.id).not('sleep_hours', 'is', null).gte('date', daysAgoKey(56)).limit(1),
    ])
    initial = { bigGoals, habitGoals, streak }
    suggestionEvidence = {
      train: (trainRes.data ?? []).length > 0,
      protein: (mealsRes.data ?? []).length > 0,
      sleep: (sleepRes.data ?? []).length > 0,
    }
  } catch {
    // not migrated yet / transient — fall back to the blank slate
  }

  return <VeeGoals initial={initial} suggestionEvidence={suggestionEvidence} />
}
