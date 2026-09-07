import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { parseRotationDays } from '../splitData'
import { getLocalDateKey } from '@/lib/dates'
import PastWorkoutForm from '../PastWorkoutForm'

/**
 * "Log a past workout" — back-dated session entry, reached from the logger's
 * Settings sheet. Lets a user add a workout they did away from their phone (or
 * forgot to log) straight into their history + graphs. It never touches today's
 * board: the row is dated to the day they trained.
 *
 * Same gating + loaders as the board page so the day chips + exercise prefill
 * come from the user's real split.
 */
export default async function PastWorkoutPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: settings, error } = await supabase
    .from('training_settings')
    .select('rotation_days, setup_complete')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error || !settings || !settings.setup_complete) {
    redirect('/app/fitness/setup')
  }

  const split = parseRotationDays(settings.rotation_days)
  if (!split) redirect('/app/fitness/setup')

  const { data: profile } = await supabase
    .from('user_profile')
    .select('units')
    .eq('user_id', user.id)
    .maybeSingle()
  const units = (profile?.units === 'imperial' ? 'imperial' : 'metric') as 'metric' | 'imperial'

  return (
    <PastWorkoutForm
      split={split}
      units={units}
      userId={user.id}
      todayKey={getLocalDateKey()}
    />
  )
}
