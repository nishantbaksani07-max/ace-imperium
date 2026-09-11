import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function CollectionsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: orders } = await supabase
    .from('business_orders').select('*').eq('user_id', user.id).order('due_date', { ascending: true })

  const { data: parties } = await supabase
    .from('business_parties').select('*').eq('user_id', user.id)

  const outstanding = orders?.filter(o => o.status === 'pending' || o.status === 'partial').reduce((s: number, o: any) => s + Math.max(0, o.total_amount - o.amount_received), 0) ?? 0
  const overdueOrders = orders?.filter(o => o.status === 'overdue') ?? []
  const dueThisWeek = orders?.filter(o => {
    const now = new Date()
    const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    return (o.status === 'pending' || o.status === 'partial') && o.due_date >= now.toISOString().slice(0, 10) && o.due_date <= weekEnd.toISOString().slice(0, 10)
  }) ?? []

  const allOutstanding = (orders ?? []).filter(o => o.status !== 'paid').map((o: any) => ({
    ...o,
    balance: Math.max(0, o.total_amount - o.amount_received),
  })).sort((a: any, b: any) => {
    if (a.status === 'overdue') return -1
    const daysA = Math.ceil((new Date(a.due_date).getTime() - Date.now()) / 86400000)
    const daysB = Math.ceil((new Date(b.due_date).getTime() - Date.now()) / 86400000)
    return daysA - daysB
  })

  return (
    <main className="business-page">
      <h1 className="business-heading">Collections</h1>
      <div className="collections-summary">
        <div className="kpi-card"><span className="kpi-title">Total Outstanding</span><span className="kpi-value">₹{outstanding.toLocaleString('en-IN')}</span></div>
        <div className="kpi-card"><span className="kpi-title">Overdue</span><span className="kpi-value" style={{ color: 'var(--red)' }}>{overdueOrders.length}</span></div>
        <div className="kpi-card"><span className="kpi-title">Due This Week</span><span className="kpi-value" style={{ color: 'var(--amber)' }}>{dueThisWeek.length}</span></div>
      </div>
      <div className="collections-list">
        {allOutstanding.map((order: any, i: number) => {
          const daysUntil = Math.ceil((new Date(order.due_date).getTime() - Date.now()) / 86400000)
          return (
            <div key={order.id} className="business-card collection-row" onClick={() => window.location.href = `/business/orders/${order.id}`}>
              <div className="collection-party">
                <span className="party-name">{order.item_name}</span>
                <span className={`status-pill status-${order.status}`}>{order.status}</span>
              </div>
              <div className="collection-details">
                <span>{order.design_no} · {order.order_date}</span>
                <span>Due: {order.due_date}</span>
              </div>
              <div className="collection-amount">
                <span className="amount">₹{order.total_amount?.toLocaleString('en-IN')}</span>
                <span className={`days-until ${daysUntil < 0 ? 'overdue' : daysUntil <= 2 ? 'critical' : daysUntil <= 7 ? 'warn' : 'good'}`}>
                  {daysUntil < 0 ? 'OVERDUE' : `${daysUntil}d`}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </main>
  )
}
