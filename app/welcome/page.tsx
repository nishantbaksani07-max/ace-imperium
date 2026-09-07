import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import WelcomeScreen from './WelcomeScreen'
import { getChecklistTasks } from '@/lib/checklistTasks'

/**
 * /welcome — first-time greeting from the Imperium gem character.
 *
 * Auto-routed once per account from completeOnboarding(). Greeting
 * gem + name + 3-beat copy lead into a checklist phase (after the
 * user clicks "take me in") that shows the recommended quizzes /
 * setup steps. Tasks navigate out to their respective pages; the
 * user can come back to /welcome any time to see remaining items.
 *
 * Auth-gated. Anonymous → /login. Onboarding-gated too: if the user
 * hasn't completed onboarding, send them there first (the gem needs
 * a name to greet, and we don't want to greet before the user has
 * actually committed to the product).
 */
export default async function WelcomeRoute() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarded')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.onboarded) redirect('/onboarding')

  const { data: userProfile } = await supabase
    .from('user_profile')
    .select('first_name')
    .eq('user_id', user.id)
    .maybeSingle()

  const firstName = (userProfile?.first_name ?? '').trim() || 'friend'
  const tasks = await getChecklistTasks(supabase, user.id)

  return <WelcomeScreen firstName={firstName} tasks={tasks} userId={user.id} />
}
