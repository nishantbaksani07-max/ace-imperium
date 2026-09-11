import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function SalesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: orders } = await supabase
    .from('business_orders').select('*').eq('user_id', user.id).order('order_date', { ascending: false })

  const { data: parties } = await supabase
    .from('business_parties').select('id, name').eq('user_id', user.id)
  const partyMap = new Map((parties ?? []).map((p: any) => [p.id, p.name]))

  const totalOrders = orders?.length ?? 0
  const totalMetres = orders?.reduce((s: number, o: any) => s + o.top_metres + o.bottom_metres + o.dupatta_metres, 0) ?? 0
  const totalAmount = orders?.reduce((s: number, o: any) => s + o.total_amount, 0) ?? 0

  return (
    <main className="business-page">
      <h1 className="business-heading">Sales Register</h1>
      <p className="text-muted">Auto-populated. Read-only.</p>
      <div className="sales-summary">
        <div className="kpi-card"><span className="kpi-title">Orders</span><span className="kpi-value">{totalOrders}</span></div>
        <div className="kpi-card"><span className="kpi-title">Total Metres</span><span className="kpi-value">{totalMetres.toFixed(2)}m</span></div>
        <div className="kpi-card"><span className="kpi-title">Total Amount</span><span className="kpi-value">₹{totalAmount.toLocaleString('en-IN')}</span></div>
      </div>
      <div className="orders-table-wrapper">
        <table className="orders-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Party</th>
              <th>Item</th>
              <th>D.No</th>
              <th>Top m</th>
              <th>Bot m</th>
              <th>Dup m</th>
              <th>Total m</th>
              <th>Amount</th>
              <th>GST</th>
              <th>Net</th>
              <th>Days</th>
              <th>Due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(orders ?? []).map((order: any) => (
              <tr key={order.id} onClick={() => window.location.href = `/business/orders/${order.id}`}>
                <td>{order.order_date}</td>
                <td>{partyMap.get(order.party_id) || '—'}</td>
                <td>{order.item_name}</td>
                <td>{order.design_no}</td>
                <td>{order.top_metres}</td>
                <td>{order.bottom_metres}</td>
                <td>{order.dupatta_metres}</td>
                <td>{(order.top_metres + order.bottom_metres + order.dupatta_metres).toFixed(2)}</td>
                <td>₹{order.total_amount?.toLocaleString('en-IN')}</td>
                <td>{order.gst_applied ? 'Yes' : 'No'}</td>
                <td>₹{(order.total_amount).toLocaleString('en-IN')}</td>
                <td>{order.payment_days}d</td>
                <td>{order.due_date}</td>
                <td><span className={`status-pill status-${order.status}`}>{order.status}</span></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="totals-row">
              <td colSpan={7}><strong>Totals</strong></td>
              <td><strong>{totalMetres.toFixed(2)}m</strong></td>
              <td><strong>₹{totalAmount.toLocaleString('en-IN')}</strong></td>
              <td colSpan={6}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </main>
  )
}
