import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function NewLotPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <main className="business-page">
      <h1 className="business-heading">New Lot — 3-Step Wizard</h1>
      <form action="/api/business/lots" method="POST" className="business-card wizard-step">
        <h2>Step 1/3 — Design</h2>
        <div className="field"><label className="label">Item Name</label><input name="item_name" className="input" required /></div>
        <div className="field"><label className="label">Design No.</label><input name="design_no" className="input" required /></div>
        <div className="field"><label className="label">Date Arrived</label><input type="date" name="date_arrived" className="input" defaultValue={new Date().toISOString().slice(0,10)} /></div>

        <h2>Step 2/3 — Stock</h2>
        <div className="quantity-grid">
          <div className="field"><label className="label">Top Metres</label><input type="number" step="0.01" name="top_opening" className="input" /></div>
          <div className="field"><label className="label">Bottom Metres</label><input type="number" step="0.01" name="bottom_opening" className="input" /></div>
          <div className="field"><label className="label">Dupatta Metres</label><input type="number" step="0.01" name="dupatta_opening" className="input" /></div>
        </div>
        <div className="field"><label className="label">No. of Colours</label><input type="number" name="colours" className="input" defaultValue={1} min={1} /></div>

        <h2>Step 3/3 — Cost</h2>
        <div className="field"><label className="label">Low Stock Alert (m)</label><input type="number" name="low_stock_threshold" className="input" defaultValue={100} /></div>
        <div className="wizard-buttons">
          <a href="/business/lots" className="btn btn-ghost">Back</a>
          <button type="submit" className="btn btn-primary">Save Lot</button>
        </div>
      </form>
    </main>
  )
}
