import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveGoal } from '@/app/app/vitals/goalActions'
import GoalSetCelebration from '@/app/app/vitals/quiz/GoalSetCelebration'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Vitals · your goal' }

export default async function GoalSetPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const goal = await getActiveGoal(supabase, user.id)
  if (!goal) redirect('/app/vitals/quiz') // no goal yet → take the quiz
  return <GoalSetCelebration goal={goal} />
}
