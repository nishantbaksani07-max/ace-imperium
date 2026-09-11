import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function OrdersPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: orders } = await supabase
    .from('business_orders').select('*').eq('user_id', user.id).order('order_date', { ascending: false })

  const { data: parties } = await supabase
    .from('business_parties').select('id, name').eq('user_id', user.id)
  const partyMap = new Map((parties ?? []).map((p: any) => [p.id, p.name]))

  return (
    <main className="business-page">
      <div className="business-header">
        <h1 className="business-heading">Orders</h1>
        <a href="/business/orders/new" className="btn btn-primary">Log New Order</a>
      </div>
      <div className="orders-table-wrapper">
        <table className="orders-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Party</th>
              <th>Item + D.No</th>
              <th>Total m</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(orders ?? []).map((order: any) => (
              <tr key={order.id} onClick={() => window.location.href = `/business/orders/${order.id}`}>
                <td>{order.order_date}</td>
                <td>{partyMap.get(order.party_id) || 'Unknown'}</td>
                <td>{order.item_name} — {order.design_no}</td>
                <td>{(order.top_metres + order.bottom_metres + order.dupatta_metres).toFixed(2)}</td>
                <td>₹{order.total_amount?.toLocaleString('en-IN')}</td>
                <td><span className={`status-pill status-${order.status}`}>{order.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
