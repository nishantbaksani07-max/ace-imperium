import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { useState } from 'react'

export const dynamic = 'force-dynamic'

export default async function NewLotPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <NewLotWizard />
}

function NewLotWizard() {
  const [step, setStep] = useState(1)
  const [itemName, setItemName] = useState('')
  const [designNo, setDesignNo] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [dateArrived, setDateArrived] = useState(new Date().toISOString().slice(0, 10))
  const [openingTop, setOpeningTop] = useState('')
  const [openingBottom, setOpeningBottom] = useState('')
  const [openingDupatta, setOpeningDupatta] = useState('')
  const [colours, setColours] = useState('1')
  const [threshold, setThreshold] = useState('100')
  const [costTop, setCostTop] = useState('')
  const [costBottom, setCostBottom] = useState('')
  const [costDupatta, setCostDupatta] = useState('')

  const totalMetres = (parseFloat(openingTop) || 0) + (parseFloat(openingBottom) || 0) + (parseFloat(openingDupatta) || 0)

  async function handlePhotoUpload() {
    // Upload to Supabase storage
    const supabase = createClient()
    // Placeholder for upload logic
  }

  async function handleSave() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Create lot
    const { data: lot } = await supabase
      .from('business_lots')
      .insert({
        user_id: user!.id,
        item_name: itemName,
        design_no: designNo,
        design_photo_url: photoUrl || null,
        date_arrived: dateArrived,
        low_stock_threshold: parseInt(threshold),
      })
      .select()
      .single()

    if (!lot) return

    // Create components
    const components = [
      { component: 'top', opening: parseFloat(openingTop) || 0 },
      { component: 'bottom', opening: parseFloat(openingBottom) || 0 },
      { component: 'dupatta', opening: parseFloat(openingDupatta) || 0 },
    ]

    for (const comp of components) {
      await supabase.from('business_lot_components').insert({
        user_id: user!.id,
        lot_id: lot.id,
        component: comp.component,
        opening_metres: comp.opening,
        sold_metres: 0,
        cost_per_metre: comp.component === 'top' ? (parseFloat(costTop) || null)
          : comp.component === 'bottom' ? (parseFloat(costBottom) || null)
          : (parseFloat(costDupatta) || null),
      })
    }

    // Redirect to lot detail
    window.location.href = `/business/lots/${lot.id}`
  }

  return (
    <main className="business-page">
      <h1 className="business-heading">New Lot — Step {step}/3</h1>

      {step === 1 && (
        <div className="business-card wizard-step">
          <h2>Design Photo and Number</h2>
          <div className="field">
            <label className="label">Design Photo</label>
            <input type="file" accept="image/*" onChange={handlePhotoUpload} className="input" />
          </div>
          <div className="field">
            <label className="label">Design No.</label>
            <input className="input" value={designNo} onChange={e => setDesignNo(e.target.value)} placeholder="Enter design number" />
          </div>
          <div className="field">
            <label className="label">Item Name</label>
            <input className="input" value={itemName} onChange={e => setItemName(e.target.value)} placeholder="Enter item name" />
          </div>
          <div className="field">
            <label className="label">Date Arrived</label>
            <input type="date" className="input" value={dateArrived} onChange={e => setDateArrived(e.target.value)} />
          </div>
          <div className="wizard-buttons">
            <button className="btn btn-ghost" onClick={() => window.history.back()}>Back</button>
            <button className="btn btn-primary" onClick={() => setStep(2)} disabled={!itemName || !designNo}>Next</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="business-card wizard-step">
          <h2>Stock Entry</h2>
          <div className="field">
            <label className="label">Top Metres</label>
            <input type="number" className="input" value={openingTop} onChange={e => setOpeningTop(e.target.value)} placeholder="0" />
          </div>
          <div className="field">
            <label className="label">Bottom Metres</label>
            <input type="number" className="input" value={openingBottom} onChange={e => setOpeningBottom(e.target.value)} placeholder="0" />
          </div>
          <div className="field">
            <label className="label">Dupatta Metres</label>
            <input type="number" className="input" value={openingDupatta} onChange={e => setOpeningDupatta(e.target.value)} placeholder="0" />
          </div>
          <div className="field">
            <label className="label">No. of Colours</label>
            <input type="number" className="input" value={colours} onChange={e => setColours(e.target.value)} min="1" />
          </div>
          <div className="total-display">
            Total Lot Quantity: {totalMetres.toFixed(2)}m × {colours} colours = {(totalMetres * parseInt(colours || '1')).toFixed(2)}mtrs
          </div>
          <div className="wizard-buttons">
            <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
            <button className="btn btn-primary" onClick={() => setStep(3)}>Next</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="business-card wizard-step">
          <h2>Cost and Alerts</h2>
          <div className="field">
            <label className="label">Cost per metre — Top (₹)</label>
            <input type="number" className="input" value={costTop} onChange={e => setCostTop(e.target.value)} placeholder="Optional" />
          </div>
          <div className="field">
            <label className="label">Cost per metre — Bottom (₹)</label>
            <input type="number" className="input" value={costBottom} onChange={e => setCostBottom(e.target.value)} placeholder="Optional" />
          </div>
          <div className="field">
            <label className="label">Cost per metre — Dupatta (₹)</label>
            <input type="number" className="input" value={costDupatta} onChange={e => setCostDupatta(e.target.value)} placeholder="Optional" />
          </div>
          <div className="field">
            <label className="label">Low Stock Alert Threshold (m)</label>
            <input type="number" className="input" value={threshold} onChange={e => setThreshold(e.target.value)} />
          </div>
          <div className="wizard-buttons">
            <button className="btn btn-ghost" onClick={() => setStep(2)}>Back</button>
            <button className="btn btn-primary" onClick={handleSave}>Save Lot</button>
          </div>
        </div>
      )}
    </main>
  )
}
