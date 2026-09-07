import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import VitalsDashboard from '@/app/app/vitals/VitalsDashboard'
import ConnectScreen from '@/app/app/vitals/ConnectScreen'
import { loadReadings, getConfiguredProviders } from '@/lib/vitals/readings'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Vitals · Oura' }

/**
 * Oura readings — the same metrics page as WHOOP, via the shared loader. Oura
 * has no strain, so that stat is simply absent (the dashboard hides any null
 * metric and the Vitals score rebalances). Everything else is identical.
 */
export default async function OuraReadingsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const r = await loadReadings(supabase, user.id, 'oura')
  if (r.kind === 'redirect') redirect(r.to)
  if (r.kind === 'awaiting') return <ConnectScreen states={{ oura: 'awaiting' }} available={getConfiguredProviders()} />

  return (
    <VitalsDashboard
      latest={r.latest} week={r.week} history={r.history} quiz={r.quiz} goal={r.goal}
      signal={r.signal} vitalsScore={r.vitalsScore} scoreSeries={r.scoreSeries} provider="oura"
    />
  )
}
