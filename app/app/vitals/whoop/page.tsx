import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import VitalsDashboard from '@/app/app/vitals/VitalsDashboard'
import ConnectScreen from '@/app/app/vitals/ConnectScreen'
import { loadReadings, getConfiguredProviders } from '@/lib/vitals/readings'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Vitals · WHOOP' }

/**
 * WHOOP readings — the metrics page. Thin wrapper over the shared, provider-
 * agnostic loader (lib/vitals/readings.ts); Oura uses the identical path at
 * /app/vitals/oura. Gates (connect-first, quiz-walled, awaiting-first-sync) all
 * live in the loader so every band behaves the same.
 */
export default async function WhoopReadingsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const r = await loadReadings(supabase, user.id, 'whoop')
  if (r.kind === 'redirect') redirect(r.to)
  if (r.kind === 'awaiting') return <ConnectScreen states={{ whoop: 'awaiting' }} available={getConfiguredProviders()} />

  return (
    <VitalsDashboard
      latest={r.latest} week={r.week} history={r.history} quiz={r.quiz} goal={r.goal}
      signal={r.signal} vitalsScore={r.vitalsScore} scoreSeries={r.scoreSeries} provider="whoop"
    />
  )
}
