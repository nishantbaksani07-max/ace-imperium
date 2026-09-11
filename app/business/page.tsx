import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBusinessKPIs, getOverdueOrders } from '@/lib/business/queries'
import { formatIndianRupees, getStatusColor, getStockStatus } from '@/lib/business/calculations'

export const dynamic = 'force-dynamic'

export default async function BusinessOverviewPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: lotsData } = await supabase.from('business_lots').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5)
  const { data: overdueData } = await supabase.from('business_orders').select('*').eq('user_id', user.id).eq('status', 'pending').lt('due_date', new Date().toISOString().slice(0,10))
  const { data: briefData } = await supabase.from('business_morning_briefings').select('*').eq('user_id', user.id).eq('briefing_date', new Date().toISOString().slice(0,10)).single()
  const kpis = null; const overdueOrdersResult = overdueData ?? []; const lotsRes = { data: lotsData ?? [] }; const briefingRes = { data: briefData }

  const overdueOrders = overdueOrdersResult ?? []
  const lots = lotsRes.data ?? []
  const briefing = briefingRes.data ?? null

  const thisMonthSales = kpis?.thisMonthSales ?? 0
  const lastMonthSales = kpis?.lastMonthSales ?? 0
  const monthChangePct = lastMonthSales > 0 ? ((thisMonthSales - lastMonthSales) / lastMonthSales * 100) : 0
  const totalOutstanding = kpis?.totalOutstanding ?? 0
  const activeLots = kpis?.activeLots ?? 0
  const lowStockLots = kpis?.lowStockLots ?? 0
  const deadStockLots = kpis?.deadStockLots ?? 0
  const ordersThisMonth = kpis?.ordersThisMonth ?? 0

  return (
    <main className="business-page">
      <div className="business-header">
        <h1 className="business-heading">Business</h1>
        <a href="/business/lots/new" className="btn btn-primary">Add New Lot</a>
      </div>

      {/* KPI Grid — 2x2 */}
      <div className="business-kpi-grid">
        <KPICard label="This Month Sales" value={`₹${thisMonthSales.toLocaleString('en-IN')}`} sub={`${monthChangePct >= 0 ? '+' : ''}${monthChangePct.toFixed(1)}% vs last month`} change={monthChangePct >= 0 ? 'up' : 'down'} />
        <KPICard label="Total Outstanding" value={`₹${totalOutstanding.toLocaleString('en-IN')}`} sub={totalOutstanding > 0 ? 'Pending / Partial' : 'All settled'} />
        <KPICard label="Active Lots" value={String(activeLots)} sub={`${lowStockLots} low · ${deadStockLots} dead`} />
        <KPICard label="Orders This Month" value={String(ordersThisMonth)} sub="New orders" />
      </div>

      {/* Overdue Alerts */}
      <section className="business-sections" aria-label="Overdue alerts">
        <div className="business-card overdue-section">
          <h2 className="section-title">Overdue Alerts</h2>
          {overdueOrders.length === 0 ? (
            <p className="text-muted">No overdue payments</p>
          ) : (
            <div className="overdue-list">
              {overdueOrders.map((o: any) => {
                const partyName = o.party_id ? 'Party' : 'Unknown'
                const daysOverdue = Math.ceil((new Date().getTime() - new Date(o.due_date + 'T00:00:00').getTime()) / (1000*60*60*24))
                return (
                  <div key={o.id} className="overdue-row">
                    <span className="overdue-party">{partyName}</span>
                    <span className="overdue-item">{o.item_name} + {o.design_no}</span>
                    <span className="overdue-amount">₹{o.total_amount?.toLocaleString('en-IN')}</span>
                    <span className="overdue-days red">{daysOverdue}d overdue</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* Active Lots Strip */}
      <section className="business-sections" aria-label="Active lots">
        <div className="business-card">
          <h2 className="section-title">Active Lots</h2>
          <div className="lot-strip">
            {(lots ?? []).map((lot: any) => (
              <a key={lot.id} href={`/business/lots/${lot.id}`} className="lot-strip-card">
                {lot.design_photo_url ? (
                  <img src={lot.design_photo_url} alt={lot.item_name} className="lot-strip-img" />
                ) : (
                  <div className="lot-strip-placeholder">No photo</div>
                )}
                <div className="lot-strip-info">
                  <span className="lot-strip-name">{lot.item_name}</span>
                  <span className="lot-strip-dno">D.No {lot.design_no}</span>
                  <span className={`status-badge status-${lot.status}`}>{lot.status}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Morning Briefing */}
      <section className="business-sections" aria-label="Morning briefing">
        <div className="business-card">
          <h2 className="section-title">Morning Briefing</h2>
          {briefing ? (
            <div className="briefing-content">
              <p className="briefing-text">{briefing.content}</p>
              <span className="briefing-date">{briefing.briefing_date}</span>
            </div>
          ) : (
            <div className="briefing-empty">
              <p className="text-muted">No briefing for today.</p>
              <form action="/api/business/briefing" method="POST">
                <button type="submit" className="btn btn-primary">Generate Morning Briefing</button>
              </form>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

function KPICard({ label, value, sub, change }: { label: string; value: string; sub?: string; change?: 'up' | 'down' }) {
  return (
    <div className="business-card kpi-card">
      <span className="kpi-title">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className={`kpi-sub ${change === 'up' ? 'mint' : change === 'down' ? 'amber' : ''}`}>{sub}</span>}
    </div>
  )
}
