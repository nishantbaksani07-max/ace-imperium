import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function LotsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: lots } = await supabase
    .from('business_lots').select('*').eq('user_id', user.id).order('created_at', { ascending: false })

  return (
    <main className="business-page">
      <div className="business-header">
        <h1 className="business-heading">Lots</h1>
        <a href="/business/lots/new" className="btn btn-primary">Add New Lot</a>
      </div>
      <div className="lot-grid">
        {(lots ?? []).map((lot: any) => (
          <LotCard key={lot.id} lot={lot} />
        ))}
      </div>
    </main>
  )
}

function LotCard({ lot }: { lot: any }) {
  return (
    <div className="business-card lot-card">
      {lot.design_photo_url && (
        <img src={lot.design_photo_url} alt={lot.item_name} className="lot-photo" />
      )}
      <div className="lot-info">
        <span className="lot-item">{lot.item_name}</span>
        <span className="lot-dno">D.No: {lot.design_no}</span>
        <span className={`status-badge status-${lot.status}`}>{lot.status}</span>
      </div>
    </div>
  )
}
