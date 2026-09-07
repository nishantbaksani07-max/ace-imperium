import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { SavedExercise, SavedWorkout } from '@/lib/workouts/queries'
import ProgressModule from './ProgressModule'
import { computeCompositionSignal, computeLiftSignals } from './signals'
import type { Units, WeightEntry } from './types'

/**
 * Server entry for the Progress module. Pulls last 180 days of weight
 * entries + last 90 days of workouts so the client gets pre-computed
 * lift signals + composition signal on first paint (no spinners).
 *
 * Auth + onboarded gating is enforced by app/app/layout.tsx upstream.
 */

function mapUnits(u: string | null | undefined): Units {
  return u === 'imperial' ? 'lb' : 'kg'
}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default async function ProgressPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sinceWeights = isoDaysAgo(180)
  const sinceWorkouts = isoDaysAgo(90)

  // Parallel fetches — both queries are independent and RLS-scoped.
  const [profileRes, weightsRes, workoutsRes] = await Promise.all([
    supabase.from('user_profile').select('units').eq('user_id', user.id).maybeSingle(),
    supabase.from('weights').select('date, weight_kg').eq('user_id', user.id).gte('date', sinceWeights).order('date', { ascending: true }),
    supabase.from('workouts').select('date, day_name, exercises, submitted_at, off_day').eq('user_id', user.id).gte('date', sinceWorkouts).order('date', { ascending: true }),
  ])

  const entries: WeightEntry[] = (weightsRes.data ?? []).map(r => ({
    dateKey: r.date as string,
    weightKg: Number(r.weight_kg),
  }))

  const workouts: SavedWorkout[] = (workoutsRes.data ?? []).map(r => ({
    date: r.date as string,
    day_name: r.day_name as string,
    exercises: (r.exercises ?? []) as SavedExercise[],
    submitted_at: (r.submitted_at as string | null) ?? null,
    // Carry the readiness flag so the signal engine can exclude eased sessions
    // (a light deload / sick day must never dent the PR ticker or volume trend).
    off_day: (r.off_day as SavedWorkout['off_day']) ?? null,
  }))

  const liftSignals = computeLiftSignals(workouts, 8)
  const composition = computeCompositionSignal(entries, workouts)

  return (
    <ProgressModule
      initialEntries={entries}
      initialUnits={mapUnits(profileRes.data?.units)}
      liftSignals={liftSignals}
      composition={composition}
    />
  )
}
