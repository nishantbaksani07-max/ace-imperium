import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('business_payments')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ payments: data })
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as any
  if (!body) return NextResponse.json({ error: 'missing_body' }, { status: 400 })

  const { order_id, amount, payment_date, cd_applied, cd_amount, notes } = body
  if (!order_id || !amount) return NextResponse.json({ error: 'order_id and amount required' }, { status: 400 })

  // Get order
  const { data: order } = await supabase
    .from('business_orders')
    .select('*')
    .eq('id', order_id)
    .eq('user_id', user.id)
    .single()

  if (!order) return NextResponse.json({ error: 'order not found' }, { status: 404 })

  const newAmountReceived = (order.amount_received || 0) + amount

  let newStatus = order.status
  if (newAmountReceived >= order.total_amount) {
    newStatus = 'paid'
  } else {
    newStatus = 'partial'
  }

  // Update order
  await supabase
    .from('business_orders')
    .update({ amount_received: newAmountReceived, status: newStatus })
    .eq('id', order_id)
    .eq('user_id', user.id)

  // Insert payment
  const { data: payment, error } = await supabase
    .from('business_payments')
    .insert({
      user_id: user.id,
      order_id,
      amount,
      payment_date: payment_date || new Date().toISOString().slice(0, 10),
      cd_applied: cd_applied || false,
      cd_amount: cd_amount || 0,
      notes: notes || '',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ payment, order: { ...order, amount_received: newAmountReceived, status: newStatus } })
}
