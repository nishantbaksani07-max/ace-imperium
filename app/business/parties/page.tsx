import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function PartiesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: parties } = await supabase
    .from('business_parties').select('*').eq('user_id', user.id).order('name')

  const { data: orders } = await supabase
    .from('business_orders').select('party_id, total_amount, amount_received').eq('user_id', user.id)

  const partyTotals = new Map<string, { orders: number; invoiced: number; received: number; outstanding: number }>()
  for (const o of (orders ?? [])) {
    const existing = partyTotals.get(o.party_id) || { orders: 0, invoiced: 0, received: 0, outstanding: 0 }
    existing.orders += 1
    existing.invoiced += o.total_amount || 0
    existing.received += o.amount_received || 0
    existing.outstanding += Math.max(0, (o.total_amount || 0) - (o.amount_received || 0))
    partyTotals.set(o.party_id, existing)
  }

  return (
    <main className="business-page">
      <div className="business-header">
        <h1 className="business-heading">Parties</h1>
        <a href="/business/parties/new" className="btn btn-primary">Add New Party</a>
      </div>
      <div className="parties-list">
        {(parties ?? []).map((party: any) => {
          const totals = partyTotals.get(party.id)
          return (
            <div key={party.id} className="business-card party-card" onClick={() => window.location.href = `/business/parties/${party.id}`}>
              <div className="party-name">{party.name}</div>
              <div className="party-meta">
                {party.city && <span>{party.city}</span>}
                {party.area && <span>{party.area}</span>}
              </div>
              <div className="party-stats">
                <span>{totals?.orders ?? 0} orders</span>
                <span style={{ color: (totals?.outstanding ?? 0) > 0 ? 'var(--amber)' : 'var(--mint)' }}>
                  ₹{(totals?.outstanding ?? 0).toLocaleString('en-IN')} outstanding
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </main>
  )
}
