import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const partyId = searchParams.get('partyId')
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')

  let query = supabase.from('business_orders').select('*').eq('user_id', user.id).order('order_date', { ascending: false })
  if (status && status !== 'all') query = query.eq('status', status)
  if (partyId) query = query.eq('party_id', partyId)
  if (dateFrom) query = query.gte('order_date', dateFrom)
  if (dateTo) query = query.lte('order_date', dateTo)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ orders: data })
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as any
  if (!body) return NextResponse.json({ error: 'missing_body' }, { status: 400 })

  const {
    order_date, party_id, lot_id, item_name, design_no,
    top_metres, bottom_metres, dupatta_metres, colours,
    top_rate, bottom_rate, dupatta_rate,
    discount_percent, gst_applied, payment_days, notes
  } = body

  // Calculate invoice
  const topTotal = top_metres * colours
  const bottomTotal = bottom_metres * colours
  const dupattaTotal = dupatta_metres * colours
  const grandTotalMetres = topTotal + bottomTotal + dupattaTotal

  const subtotal = (topTotal * top_rate) + (bottomTotal * bottom_rate) + (dupattaTotal * dupatta_rate)
  const discountAmount = subtotal * (discount_percent / 100)
  const afterDiscount = subtotal - discountAmount
  const gstAmount = gst_applied ? afterDiscount * 0.05 : 0
  const totalAmount = afterDiscount + gstAmount

  // Due date
  const orderDate = new Date(order_date + 'T00:00:00')
  const dueDate = new Date(orderDate)
  dueDate.setDate(dueDate.getDate() + payment_days)
  const dueDateStr = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`

  // Check if rate card exists
  const { data: existingRateCard } = await supabase
    .from('business_rate_cards')
    .select('*')
    .eq('party_id', party_id)
    .eq('item_name', item_name)
    .eq('user_id', user.id)
    .single()

  const orderData: any = {
    user_id: user.id,
    order_date,
    party_id,
    lot_id,
    item_name,
    design_no,
    top_metres,
    bottom_metres,
    dupatta_metres,
    colours,
    top_rate,
    bottom_rate,
    dupatta_rate,
    discount_percent,
    gst_applied,
    payment_days,
    subtotal,
    discount_amount,
    gst_amount,
    total_amount,
    amount_received: 0,
    status: 'pending',
    due_date: dueDateStr,
    notes: notes || '',
  }

  const { data: order, error } = await supabase
    .from('business_orders')
    .insert(orderData)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Rate card logic: if new party+item, save rate card; if existing and rates differ, flag it
  if (!existingRateCard) {
    await supabase.from('business_rate_cards').insert({
      user_id: user.id,
      party_id,
      item_name,
      top_rate,
      bottom_rate,
      dupatta_rate,
      discount_percent,
      payment_days,
      gst_preference: gst_applied ? 'gst' : 'non_gst',
    })
  } else if (
    (existingRateCard.top_rate !== top_rate ||
     existingRateCard.bottom_rate !== bottom_rate ||
     existingRateCard.dupatta_rate !== dupatta_rate) &&
    existingRateCard.top_rate != null
  ) {
    // Rates differ — return flag for client to prompt user
    return NextResponse.json({
      order,
      rateCardUpdateNeeded: true,
      existingRateCard: {
        top_rate: existingRateCard.top_rate,
        bottom_rate: existingRateCard.bottom_rate,
        dupatta_rate: existingRateCard.dupatta_rate,
      },
    })
  }

  return NextResponse.json({ order, rateCardUpdateNeeded: false })
}
