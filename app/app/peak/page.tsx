import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getLocalDateKey } from '@/lib/dates'
import { loadWhoopSignal } from './load'
import { loadPeakSchedule } from '../peak-tracker/loadSchedule'
import { loadDayInputs } from './loadDayInputs'
import { loadPeakState } from './loadPeakState'
import { loadRecentWorkouts } from './loadRecentWorkouts'
import { readWorkout } from './workoutRead'
import PeakModule from './PeakModule'

export const dynamic = 'force-dynamic'

/**
 * Peak module — server entry (unified "Your Day" dashboard).
 *
 * Pulls the user's most recent `wearable_data` (provider='whoop') via
 * `loadWhoopSignal` to drive the curve, AND the day's schedule (events +
 * tasks) via `loadPeakSchedule` — the same Supabase store the old
 * /app/peak-tracker used, now surfaced here. Substance logs + subjective taps
 * still live client-side in localStorage for v1.
 */
export default async function PeakPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const date = getLocalDateKey()
  const [whoop, schedule, dayInputs, peakState, recentWorkouts] = await Promise.all([
    loadWhoopSignal(supabase, user.id),
    loadPeakSchedule(supabase, user.id, date),
    loadDayInputs(supabase, user.id, date),
    // Durable substance logs + taps + stimulant profile + pinned stack, so the
    // Peak module persists across devices/sessions instead of one browser's
    // localStorage. RLS-scoped to this user.
    loadPeakState(supabase, user.id),
    // Read-only: the user's recent Train workouts, for Peak's auto-read verdict
    // and to place today's session on the curve at the real training time.
    loadRecentWorkouts(supabase, user.id, date),
  ])

  // Pure, deterministic verdict from the real sets (no writes, never throws).
  const workout = readWorkout(recentWorkouts, date)

  return (
    <PeakModule
      initialWhoop={whoop}
      initialSchedule={schedule}
      initialDayInputs={dayInputs}
      initialPeakState={peakState}
      initialWorkout={workout}
    />
  )
}
