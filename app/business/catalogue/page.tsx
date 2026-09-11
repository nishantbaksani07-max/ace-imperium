import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function CataloguePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: items } = await supabase
    .from('business_catalogue').select('*').eq('user_id', user.id).order('item_name').order('design_no')

  return (
    <main className="business-page">
      <h1 className="business-heading">Catalogue</h1>
      <div className="catalogue-grid">
        {(items ?? []).map((item: any) => (
          <div key={item.id} className="business-card catalogue-card">
            {item.photo_url && <img src={item.photo_url} alt={item.item_name} className="catalogue-photo" />}
            <div className="catalogue-info">
              <span className="catalogue-item">{item.item_name}</span>
              <span className="catalogue-dno">D.No: {item.design_no}</span>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
