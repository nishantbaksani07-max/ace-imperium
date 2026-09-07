import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { readPaywallConfig, appAccessAllowed } from '@/lib/auth/paywall'
import type { Tier } from '@/lib/supabase/types'
import LocalDateSync from '@/components/LocalDateSync'
import SyncAllModules from '@/components/SyncAllModules'
import ReportProblem from '@/components/ReportProblem'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarded, tier')
    .eq('id', user.id)
    .single()

  if (profile && !profile.onboarded) {
    redirect('/onboarding')
  }

  // Whole-app paywall (CLAUDE.md #5: server-side). OFF unless PAYWALL_ENABLED is
  // set, so this is dormant until deliberately switched on + the comp list set.
  // Free signup + onboarding stay open (above); using the app needs Pro.
  const paywall = readPaywallConfig(process.env)
  if (!appAccessAllowed({ config: paywall, tier: (profile?.tier as Tier) ?? 'free', email: user.email ?? null })) {
    redirect('/pricing?gate=app')
  }

  // The "Finish setup · N left" pill (SetupNudge) renders on the dashboard home
  // only (app/app/page.tsx), not in the layout — it shouldn't follow the user
  // into every module (the plan reveal, the logger, etc). Module-level quiz
  // gates still force the relevant quiz when you click into a section.
  return (
    <>
      <LocalDateSync />
      <SyncAllModules />
      <ReportProblem />
      {children}
    </>
  )
}
