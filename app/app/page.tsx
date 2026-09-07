import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import Dashboard from './Dashboard'
import SetupNudge from '@/components/SetupNudge'
import RemoteUpdateWatcher from '@/components/RemoteUpdateWatcher'
import type { Units } from '@/lib/units'
import { getChecklistTasks } from '@/lib/checklistTasks'
import { computeVitalityScore } from '@/lib/vitality/computeVitalityScore'
import type { VitalityScore } from '@/lib/vitality/score'
import { getDashboardTileStats, type DashboardTileStats } from '@/lib/vitality/dashboardStats'
import { getAvatarUrl } from '@/lib/profiles/avatar'
import { isFounderEmail } from '@/lib/founders'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Main Dashboard · Vitality',
}

export default async function DashboardPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Layout guards already redirect anon → /login, but the page can render
  // without that gate too (e.g. a future opt-out). Belt-and-suspenders.
  if (!user) redirect('/login')

  let firstName: string | null = null
  let units: Units = 'metric'
  try {
    const { data: userProfile } = await supabase
      .from('user_profile')
      .select('first_name, units')
      .eq('user_id', user.id)
      .maybeSingle()
    firstName = userProfile?.first_name ?? null
    units = (userProfile?.units === 'imperial' ? 'imperial' : 'metric') as Units
  } catch {
    // user_profile may not exist on a fresh schema — greet generically.
  }

  // The maker handle drives the top-bar profile avatar (Arts District v2). Null
  // when not claimed yet (avatar then routes to /account) or before the table
  // exists — guarded so neither breaks the dashboard.
  let creatorHandle: string | null = null
  try {
    const { data: creator } = await supabase
      .from('creator_profiles')
      .select('username')
      .eq('user_id', user.id)
      .maybeSingle()
    creatorHandle = creator?.username ?? null
  } catch {
    creatorHandle = null
  }

  // The uploaded maker photo (public URL) for the top-bar avatar. Guarded, so a
  // pre-migration DB just yields null and the avatar shows the initial.
  const avatarUrl = await getAvatarUrl(supabase, user.id)

  // Independent reads — fetch in parallel so the entry screen isn't serialized.
  // The score is wrapped so a Supabase/auth failure falls back to the gentle
  // "no routine" prompt instead of crashing the whole dashboard (the engine's
  // per-contributor safety nets already handle data-shaped failures internally).
  // The user's local "today" (LocalDateSync cookie) so the Fuel tile counts
  // meals against their timezone, not Vercel's UTC. See getDashboardTileStats.
  const localDayKey = cookies().get('vitality_local_date')?.value

  const [tasks, vitality, tileStats] = await Promise.all([
    getChecklistTasks(supabase, user.id),
    computeVitalityScore(user.id).catch((): VitalityScore => ({
      score: null,
      drivers: [],
      state: 'no-routine',
    })),
    getDashboardTileStats(supabase, user.id, localDayKey).catch(
      (): DashboardTileStats => ({ trainDay: null, fuelKcalToday: null }),
    ),
  ])

  return (
    <>
      {/* The "Finish setup · N left" pill lives only here, on the dashboard
          home — not in the app layout, so it never follows the user into a
          module. */}
      <SetupNudge tasks={tasks} userId={user.id} />
      {/* "Watch it change": only on the dashboard home — the side-by-side
          surface with Claude — so navigating into a module (which mirror-writes
          on mount) never trips a false "updated" pill. */}
      <RemoteUpdateWatcher />
      <Dashboard
        firstName={firstName}
        units={units}
        tasks={tasks}
        userId={user.id}
        creatorHandle={creatorHandle}
        avatarUrl={avatarUrl}
        score={vitality.score}
        scoreState={vitality.state}
        tileStats={tileStats}
        isFounder={isFounderEmail(user.email)}
      />
    </>
  )
}
