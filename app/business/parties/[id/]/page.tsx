import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function PartyDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: party } = await supabase
    .from('business_parties').select('*').eq('id', params.id).eq('user_id', user.id).single()

  const { data: orders } = await supabase
    .from('business_orders').select('*').eq('party_id', params.id).eq('user_id', user.id).order('order_date', { ascending: false })

  const totalInvoiced = orders?.reduce((s: number, o: any) => s + (o.total_amount || 0), 0) ?? 0
  const totalReceived = orders?.reduce((s: number, o: any) => s + (o.amount_received || 0), 0) ?? 0
  const outstanding = totalInvoiced - totalReceived

  return (
    <main className="business-page">
      <h1 className="business-heading">{party?.name}</h1>
      <div className="business-card party-detail">
        <div className="detailRow"><span className="detailLabel">Area</span><span className="detailValue">{party?.area}</span></div>
        <div className="detailRow"><span className="detailLabel">City</span><span className="detailValue">{party?.city}</span></div>
        <div className="detailRow"><span className="detailLabel">Phone</span><span className="detailValue">{party?.phone}</span></div>
        <div className="detailRow"><span className="detailLabel">GSTIN</span><span className="detailValue">{party?.gstin}</span></div>
        <div className="detailRow"><span className="detailLabel">Default Days</span><span className="detailValue">{party?.default_payment_days}</span></div>
        <div className="detailRow"><span className="detailLabel">Credit Limit</span><span className="detailValue">₹{(party?.credit_limit || 0)?.toLocaleString('en-IN')}</span></div>
        <div className="detailRow"><span className="detailLabel">Notes</span><span className="detailValue">{party?.notes}</span></div>
      </div>
      <div className="business-card" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="detailRow"><span className="detailLabel">Total Invoiced</span><span className="detailValue">₹{totalInvoiced?.toLocaleString('en-IN')}</span></div>
        <div className="detailRow"><span className="detailLabel">Received</span><span className="detailValue">₹{totalReceived?.toLocaleString('en-IN')}</span></div>
        <div className="detailRow"><span className="detailLabel">Outstanding</span><span className="detailValue" style={{ color: outstanding > 0 ? 'var(--amber)' : 'var(--mint)' }}>₹{outstanding?.toLocaleString('en-IN')}</span></div>
      </div>
      <div className="lot-orders">
        <h3>Order History</h3>
        {(orders ?? []).map((o: any) => (
          <div key={o.id} className="business-card" onClick={() => window.location.href = `/business/orders/${o.id}`}>
            {o.item_name} — {o.design_no} · {o.order_date} · ₹{o.total_amount?.toLocaleString('en-IN')} · <span className={`status-pill status-${o.status}`}>{o.status}</span>
          </div>
        ))}
      </div>
    </main>
  )
}
