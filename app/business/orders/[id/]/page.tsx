import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: order } = await supabase
    .from('business_orders').select('*').eq('id', params.id).eq('user_id', user.id).single()

  const { data: payments } = await supabase
    .from('business_payments').select('*').eq('order_id', params.id).eq('user_id', user.id)

  const balance = (order?.total_amount || 0) - (order?.amount_received || 0)

  return (
    <main className="business-page">
      <h1 className="business-heading">Order #{order?.id?.slice(0, 8)}</h1>
      <div className="business-card">
        <div className="detailRow"><span className="detailLabel">Date</span><span className="detailValue">{order?.order_date}</span></div>
        <div className="detailRow"><span className="detailLabel">Party</span><span className="detailValue">{order?.party_id?.slice(0, 8)}</span></div>
        <div className="detailRow"><span className="detailLabel">Item</span><span className="detailValue">{order?.item_name}</span></div>
        <div className="detailRow"><span className="detailLabel">Design No</span><span className="detailValue">{order?.design_no}</span></div>
        <div className="detailRow"><span className="detailLabel">Total</span><span className="detailValue">₹{order?.total_amount?.toLocaleString('en-IN')}</span></div>
        <div className="detailRow"><span className="detailLabel">Status</span><span className="detailValue"><span className={`status-pill status-${order?.status}`}>{order?.status}</span></span></div>
        <div className="detailRow"><span className="detailLabel">Due Date</span><span className="detailValue">{order?.due_date}</span></div>
        <div className="detailRow"><span className="detailLabel">Paid</span><span className="detailValue">₹{order?.amount_received?.toLocaleString('en-IN')}</span></div>
        <div className="detailRow"><span className="detailLabel">Balance</span><span className="detailValue" style={{ color: balance > 0 ? 'var(--amber)' : 'var(--mint)' }}>₹{balance.toLocaleString('en-IN')}</span></div>
      </div>
      <div className="lot-orders">
        <h3>Payments</h3>
        {(payments ?? []).map((p: any) => (
          <div key={p.id} className="business-card">
            ₹{p.amount?.toLocaleString('en-IN')} · {p.payment_date}
          </div>
        ))}
      </div>
    </main>
  )
}
