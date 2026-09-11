import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function BusinessPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <main className="business-page">
      <h1 className="business-heading">Business</h1>
      <div className="business-kpi-grid">
        <div className="business-card kpi-card">
          <span className="kpi-title">This Month Sales</span>
          <span className="kpi-value">—</span>
          <span className="kpi-change">vs last month</span>
        </div>
        <div className="business-card kpi-card">
          <span className="kpi-title">Total Outstanding</span>
          <span className="kpi-value">—</span>
        </div>
        <div className="business-card kpi-card">
          <span className="kpi-title">Active Lots</span>
          <span className="kpi-value">—</span>
          <span className="kpi-sub">X low · X dead</span>
        </div>
        <div className="business-card kpi-card">
          <span className="kpi-title">Orders This Month</span>
          <span className="kpi-value">—</span>
        </div>
      </div>
      <div className="business-sections">
        <OverdueAlerts />
        <ActiveLotsStrip />
        <MorningBriefing />
      </div>
    </main>
  )
}

function OverdueAlerts() {
  return (
    <div className="business-card">
      <h2 className="section-title">Overdue Alerts</h2>
      <p className="text-muted">No overdue payments</p>
    </div>
  )
}

function ActiveLotsStrip() {
  return (
    <div className="business-card">
      <h2 className="section-title">Active Lots</h2>
      <p className="text-muted">No active lots yet</p>
    </div>
  )
}

function MorningBriefing() {
  return (
    <div className="business-card">
      <h2 className="section-title">Morning Briefing</h2>
      <button className="btn btn-primary">Generate Morning Briefing</button>
    </div>
  )
}
