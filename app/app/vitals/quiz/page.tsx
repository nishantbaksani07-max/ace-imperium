import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getVitalsQuiz } from '@/lib/preferences'
import { getPrimaryProvider } from '@/lib/vitals/wearables'
import GoalPicker from './GoalPicker'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Vitals · pick your goal' }

/**
 * Vitals setup route — the goal picker (replaces the old quiz). Connect-first:
 * it comes after pairing, so it requires a connected device. Gates:
 *   - already set up    → the gallery (don't re-ask)
 *   - not connected yet → the gallery (connect a device first)
 */
export default async function VitalsQuizPage({ searchParams }: { searchParams?: { redo?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const existing = await getVitalsQuiz(supabase, user.id)
  // ?redo=1 lets an already-set-up user re-pick from settings. pickVitalsGoal
  // upserts the active goal in place, so re-taking is safe.
  if (existing && searchParams?.redo !== '1') redirect('/app/vitals')

  // Connect-first: the picker requires a connected band (any band).
  const provider = await getPrimaryProvider(supabase, user.id)
  if (!provider) redirect('/app/vitals')

  return <GoalPicker />
}
