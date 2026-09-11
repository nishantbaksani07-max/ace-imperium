import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ReportsForm from '@/components/business/ReportsForm'

export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return (
    <main className="business-page">
      <h1 className="business-heading">Reports</h1>
      <ReportsForm />
    </main>
  )
}
