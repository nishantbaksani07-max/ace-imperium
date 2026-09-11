import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function LotDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: lot } = await supabase
    .from('business_lots').select('*').eq('id', params.id).eq('user_id', user.id).single()

  const { data: components } = await supabase
    .from('business_lot_components').select('*').eq('lot_id', params.id).eq('user_id', user.id)

  const { data: orders } = await supabase
    .from('business_orders').select('*').eq('lot_id', params.id).eq('user_id', user.id)

  return (
    <main className="business-page">
      {lot?.design_photo_url && <img src={lot.design_photo_url} alt="" className="lot-detail-photo" />}
      <h1 className="business-heading">{lot?.item_name} — {lot?.design_no}</h1>
      <span className={`status-pill status-${lot?.status}`}>{lot?.status}</span>
      <div className="stock-table">
        <h3>Stock</h3>
        <table className="table">
          <thead><tr><th>Component</th><th>Opening</th><th>Sold</th><th>Remaining</th><th>%</th></tr></thead>
          <tbody>
            {(components ?? []).map((c: any) => {
              const remaining = c.opening_metres - c.sold_metres
              const pct = c.opening_metres > 0 ? ((remaining / c.opening_metres) * 100).toFixed(1) : '0'
              return (
                <tr key={c.component}>
                  <td>{c.component}</td>
                  <td>{c.opening_metres}</td>
                  <td>{c.sold_metres}</td>
                  <td>{remaining.toFixed(2)}</td>
                  <td>{pct}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="lot-orders">
        <h3>Orders</h3>
        {(orders ?? []).map((o: any) => (
          <div key={o.id} className="business-card" onClick={() => window.location.href = `/business/orders/${o.id}`}>
            {o.item_name} — {o.design_no} · {o.order_date} · ₹{o.total_amount?.toLocaleString('en-IN')}
          </div>
        ))}
      </div>
    </main>
  )
}
