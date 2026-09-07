import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import VitalsDashboard from '@/app/app/vitals/VitalsDashboard'
import ManualEntry from '@/app/app/vitals/ManualEntry'
import { loadReadings } from '@/lib/vitals/readings'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Vitals · Manual' }

/**
 * Manual on Vitals (the no-wearable band). One route, two faces:
 *   · No manual data yet, or ?log=1 → the check-in FORM (ManualEntry). This is
 *     the easy, no-account first option the connect screen routes to.
 *   · Manual data exists → the same VitalsDashboard every band renders, so the
 *     user lands on their real numbers after saving (no figure shown twice).
 *
 * The form POSTs to /api/wearables/manual, then navigates back here; the row now
 * exists so the dashboard renders (still hard-walled behind the setup quiz via
 * loadReadings, exactly like WHOOP/Oura).
 */
export default async function ManualPage({ searchParams }: { searchParams?: { log?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Has this user ever logged a manual check-in? (Cheap existence probe.)
  const { data: rows } = await supabase
    .from('wearable_data').select('provider')
    .eq('user_id', user.id).eq('provider', 'manual').limit(1)
  const hasData = (rows ?? []).length > 0
  const wantLog = searchParams?.log === '1'

  // First run (no data) or an explicit re-log → the check-in form.
  if (!hasData || wantLog) return <ManualEntry />

  // Otherwise the dashboard, through the shared loader (enforces the quiz gate).
  const r = await loadReadings(supabase, user.id, 'manual')
  if (r.kind === 'redirect') redirect(r.to)
  if (r.kind === 'awaiting') return <ManualEntry />

  return (
    <VitalsDashboard
      latest={r.latest} week={r.week} history={r.history} quiz={r.quiz} goal={r.goal}
      signal={r.signal} vitalsScore={r.vitalsScore} scoreSeries={r.scoreSeries} provider="manual"
    />
  )
}
