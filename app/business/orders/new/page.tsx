'use client'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { useState } from 'react'

export const dynamic = 'force-dynamic'

export default async function NewOrderPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <NewOrderForm />
}

function NewOrderForm() {
  const [step, setStep] = useState(1)
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10))
  const [itemName, setItemName] = useState('')
  const [lotId, setLotId] = useState('')
  const [partyId, setPartyId] = useState('')
  const [topMetres, setTopMetres] = useState('')
  const [bottomMetres, setBottomMetres] = useState('')
  const [dupattaMetres, setDupattaMetres] = useState('')
  const [colours, setColours] = useState('1')
  const [topRate, setTopRate] = useState('')
  const [bottomRate, setBottomRate] = useState('')
  const [dupattaRate, setDupattaRate] = useState('')
  const [discountPercent, setDiscountPercent] = useState('0')
  const [gstApplied, setGstApplied] = useState(false)
  const [paymentDays, setPaymentDays] = useState('30')
  const [notes, setNotes] = useState('')

  const topTotal = (parseFloat(topMetres) || 0) * parseInt(colours || '1')
  const bottomTotal = (parseFloat(bottomMetres) || 0) * parseInt(colours || '1')
  const dupattaTotal = (parseFloat(dupattaMetres) || 0) * parseInt(colours || '1')
  const grandTotal = topTotal + bottomTotal + dupattaTotal

  const subtotal = (topTotal * parseFloat(topRate || '0')) + (bottomTotal * parseFloat(bottomRate || '0')) + (dupattaTotal * parseFloat(dupattaRate || '0'))
  const discountAmount = subtotal * (parseFloat(discountPercent) / 100)
  const afterDiscount = subtotal - discountAmount
  const gstAmount = gstApplied ? afterDiscount * 0.05 : 0
  const totalAmount = afterDiscount + gstAmount

  async function handleSave() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const orderDateObj = new Date(orderDate + 'T00:00:00')
    const dueDate = new Date(orderDateObj)
    dueDate.setDate(dueDate.getDate() + parseInt(paymentDays))

    const orderData = {
      user_id: user!.id,
      order_date: orderDate,
      party_id: partyId,
      lot_id: lotId,
      item_name: itemName,
      design_no: '',
      top_metres: parseFloat(topMetres) || 0,
      bottom_metres: parseFloat(bottomMetres) || 0,
      dupatta_metres: parseFloat(dupattaMetres) || 0,
      colours: parseInt(colours),
      top_rate: parseFloat(topRate) || 0,
      bottom_rate: parseFloat(bottomRate) || 0,
      dupatta_rate: parseFloat(dupattaRate) || 0,
      discount_percent: parseFloat(discountPercent),
      gst_applied: gstApplied,
      payment_days: parseInt(paymentDays),
      subtotal,
      discount_amount: discountAmount,
      gst_amount: gstAmount,
      total_amount,
      amount_received: 0,
      status: 'pending',
      due_date: `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`,
      notes,
    }

    const { data } = await supabase.from('business_orders').insert(orderData).select().single()
    if (data) {
      window.location.href = `/business/orders/${data.id}`
    }
  }

  return (
    <main className="business-page">
      <h1 className="business-heading">New Order — Step {step}/3</h1>

      {step === 1 && (
        <div className="business-card wizard-step">
          <h2>Date, Item and Design No.</h2>
          <div className="field">
            <label className="label">Order Date</label>
            <input type="date" className="input" value={orderDate} onChange={e => setOrderDate(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Item Name</label>
            <input className="input" value={itemName} onChange={e => setItemName(e.target.value)} placeholder="Search items..." />
          </div>
          <div className="field">
            <label className="label">Lot / D.No</label>
            <select className="input" value={lotId} onChange={e => setLotId(e.target.value)}>
              <option value="">Select a lot...</option>
            </select>
          </div>
          <div className="wizard-buttons">
            <button className="btn btn-ghost" onClick={() => window.history.back()}>Back</button>
            <button className="btn btn-primary" onClick={() => setStep(2)} disabled={!itemName}>Next</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="business-card wizard-step">
          <h2>Party and Quantities</h2>
          <div className="field">
            <label className="label">Party</label>
            <select className="input" value={partyId} onChange={e => setPartyId(e.target.value)}>
              <option value="">Select a party...</option>
            </select>
          </div>
          <div className="quantity-grid">
            <div className="field">
              <label className="label">Top m/colour</label>
              <input type="number" className="input" value={topMetres} onChange={e => setTopMetres(e.target.value)} />
            </div>
            <div className="field">
              <label className="label">Bottom m/colour</label>
              <input type="number" className="input" value={bottomMetres} onChange={e => setBottomMetres(e.target.value)} />
            </div>
            <div className="field">
              <label className="label">Dupatta m/colour</label>
              <input type="number" className="input" value={dupattaMetres} onChange={e => setDupattaMetres(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label className="label">No. of Colours</label>
            <input type="number" className="input" value={colours} onChange={e => setColours(e.target.value)} min="1" />
          </div>
          <div className="live-totals">
            <div>Top: {topTotal.toFixed(2)}m</div>
            <div>Bottom: {bottomTotal.toFixed(2)}m</div>
            <div>Dupatta: {dupattaTotal.toFixed(2)}m</div>
            <div><strong>Grand Total: {grandTotal.toFixed(2)}m</strong></div>
          </div>
          <div className="wizard-buttons">
            <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
            <button className="btn btn-primary" onClick={() => setStep(3)}>Next</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="business-card wizard-step">
          <h2>Rates and Total Amount</h2>
          <div className="invoice-preview">
            <h3>Invoice Preview</h3>
            <div className="invoice-line">
              Top: {topTotal.toFixed(2)}m × ₹{(parseFloat(topRate) || 0).toLocaleString('en-IN')} = ₹{(topTotal * parseFloat(topRate || '0')).toLocaleString('en-IN')}
            </div>
            <div className="invoice-line">
              Bottom: {bottomTotal.toFixed(2)}m × ₹{(parseFloat(bottomRate) || 0).toLocaleString('en-IN')} = ₹{(bottomTotal * parseFloat(bottomRate || '0')).toLocaleString('en-IN')}
            </div>
            <div className="invoice-line">
              Dupatta: {dupattaTotal.toFixed(2)}m × ₹{(parseFloat(dupattaRate) || 0).toLocaleString('en-IN')} = ₹{(dupattaTotal * parseFloat(dupattaRate || '0')).toLocaleString('en-IN')}
            </div>
            <div className="invoice-line invoice-subtotal">
              Subtotal: ₹{subtotal.toLocaleString('en-IN')}
            </div>
            <div className="invoice-line">
              Discount {discountPercent}%: -₹{discountAmount.toLocaleString('en-IN')}
            </div>
            <div className="invoice-line">
              After discount: ₹{afterDiscount.toLocaleString('en-IN')}
            </div>
            {gstApplied && (
              <div className="invoice-line">
                GST 5%: +₹{gstAmount.toLocaleString('en-IN')}
              </div>
            )}
            <div className="invoice-line invoice-total">
              TOTAL: ₹{totalAmount.toLocaleString('en-IN')}
            </div>
            <div className="invoice-line">
              Due date: {new Date(orderDate + 'T00:00:00').setDate(new Date(orderDate).getDate() + parseInt(paymentDays)) > 0 ? 'TBD' : ''}
            </div>
          </div>
          <div className="field">
            <label className="label">Top Rate (₹/m)</label>
            <input type="number" className="input" value={topRate} onChange={e => setTopRate(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Bottom Rate (₹/m)</label>
            <input type="number" className="input" value={bottomRate} onChange={e => setBottomRate(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Dupatta Rate (₹/m)</label>
            <input type="number" className="input" value={dupattaRate} onChange={e => setDupattaRate(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Discount %</label>
            <input type="number" className="input" value={discountPercent} onChange={e => setDiscountPercent(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Payment Days</label>
            <input type="number" className="input" value={paymentDays} onChange={e => setPaymentDays(e.target.value)} />
          </div>
          <div className="field">
            <label className="checkbox-label">
              <input type="checkbox" checked={gstApplied} onChange={e => setGstApplied(e.target.checked)} />
              GST Applied (+5%)
            </label>
          </div>
          <div className="field">
            <label className="label">Notes</label>
            <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
          </div>
          <div className="wizard-buttons">
            <button className="btn btn-ghost" onClick={() => setStep(2)}>Back</button>
            <button className="btn btn-primary" onClick={handleSave}>Log Order</button>
          </div>
        </div>
      )}
    </main>
  )
}
