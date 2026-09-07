import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getVitalsQuiz } from '@/lib/preferences'
import { getPrimaryProvider } from '@/lib/vitals/wearables'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Vitals · paired' }

/**
 * Post-pairing hop — the stable OAuth-callback return target for ANY band.
 * There is only ONE celebration in vitals setup (the goal-set congrats after
 * the picker), so this just routes the freshly-paired user onward:
 *   - not connected        → the gallery (nothing to set up)
 *   - already set up        → the gallery (which dispatches to their readings)
 *   - paired, no goal yet   → the goal picker (which shows its own "paired ✓")
 */
export default async function VitalsPairedPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const provider = await getPrimaryProvider(supabase, user.id)
  if (!provider) redirect('/app/vitals')

  const quiz = await getVitalsQuiz(supabase, user.id)
  // Front door dispatches a set-up user to their band's readings.
  if (quiz) redirect('/app/vitals')

  redirect('/app/vitals/quiz')
}
