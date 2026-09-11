import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function StockPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: lots } = await supabase
    .from('business_lots').select('*').eq('user_id', user.id).order('created_at', { ascending: false })

  return (
    <main className="business-page">
      <h1 className="business-heading">Stock Register</h1>
      <p className="text-muted">Read-only. Auto-populated from orders.</p>
      <div className="stock-grid">
        {(lots ?? []).map((lot: any) => (
          <div key={lot.id} className="business-card lot-card">
            {lot.design_photo_url && <img src={lot.design_photo_url} alt="" className="lot-photo" />}
            <div className="lot-info">
              <span className="lot-item">{lot.item_name}</span>
              <span className="lot-dno">D.No: {lot.design_no}</span>
              <span className={`status-badge status-${lot.status}`}>{lot.status}</span>
            </div>
            <div className="stock-bars">
              <div className="stock-bar-row">
                <span>Top</span>
                <div className="progress-bar"><div className="progress-fill" style={{ width: '70%', background: 'var(--mint)' }} /></div>
              </div>
              <div className="stock-bar-row">
                <span>Bottom</span>
                <div className="progress-bar"><div className="progress-fill" style={{ width: '50%', background: 'var(--amber)' }} /></div>
              </div>
              <div className="stock-bar-row">
                <span>Dupatta</span>
                <div className="progress-bar"><div className="progress-fill" style={{ width: '30%', background: 'var(--mint)' }} /></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
