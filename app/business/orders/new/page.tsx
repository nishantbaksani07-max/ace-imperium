import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function NewOrderPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: lots } = await supabase.from('business_lots').select('id, item_name, design_no').eq('user_id', user.id).in('status', ['arrived','active','low_stock'])
  const { data: parties } = await supabase.from('business_parties').select('id, name').eq('user_id', user.id)

  return (
    <main className="business-page">
      <h1 className="business-heading">New Order — 6 Sections</h1>
      <form action="/api/business/orders" method="POST" className="business-card wizard-step">
        <h2>Step 1/3 — Date and Item</h2>
        <div className="field"><label>Order Date</label><input type="date" name="order_date" defaultValue={new Date().toISOString().slice(0,10)} className="input" required /></div>
        <div className="field"><label>Item Name</label><input name="item_name" className="input" required /></div>
        <div className="field"><label>Lot / D.No</label>
          <select name="lot_id" className="input" required>
            <option value="">Select lot...</option>
            {(lots ?? []).map((l: any) => <option key={l.id} value={l.id}>{l.item_name} — {l.design_no}</option>)}
          </select>
        </div>

        <h2>Step 2/3 — Party & Quantities</h2>
        <div className="field"><label>Party</label>
          <select name="party_id" className="input" required>
            <option value="">Select party...</option>
            {(parties ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="quantity-grid">
          <div className="field"><label>Top m/colour</label><input type="number" step="0.01" name="top_metres" className="input" /></div>
          <div className="field"><label>Bottom m/colour</label><input type="number" step="0.01" name="bottom_metres" className="input" /></div>
          <div className="field"><label>Dupatta m/colour</label><input type="number" step="0.01" name="dupatta_metres" className="input" /></div>
        </div>
        <div className="field"><label>No. of Colours</label><input type="number" name="colours" className="input" defaultValue={1} min={1} /></div>

        <h2>Step 3/3 — Rates & Total</h2>
        <div className="field"><label>Top Rate (₹/m)</label><input type="number" step="0.01" name="top_rate" className="input" /></div>
        <div className="field"><label>Bottom Rate (₹/m)</label><input type="number" step="0.01" name="bottom_rate" className="input" /></div>
        <div className="field"><label>Dupatta Rate (₹/m)</label><input type="number" step="0.01" name="dupatta_rate" className="input" /></div>
        <div className="field"><label>Discount %</label><input type="number" step="0.01" name="discount_percent" className="input" defaultValue={0} /></div>
        <div className="field"><label>Payment Days</label><input type="number" name="payment_days" className="input" defaultValue={30} /></div>
        <div className="field"><label><input type="checkbox" name="gst_applied" value="true" /> GST Applied (+5%)</label></div>
        <div className="wizard-buttons">
          <a href="/business/orders" className="btn btn-ghost">Back</a>
          <button type="submit" className="btn btn-primary">Log Order</button>
        </div>
      </form>
    </main>
  )
}
