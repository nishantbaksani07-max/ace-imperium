import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  let query = supabase.from('business_lots').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lots: data })
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as any
  if (!body) return NextResponse.json({ error: 'missing_body' }, { status: 400 })

  const { item_name, design_no, design_photo_url, date_arrived, low_stock_threshold } = body
  if (!item_name || !design_no) {
    return NextResponse.json({ error: 'item_name and design_no required' }, { status: 400 })
  }

  const { data: lot, error } = await supabase
    .from('business_lots')
    .insert({
      user_id: user.id,
      item_name,
      design_no,
      design_photo_url: design_photo_url || null,
      date_arrived: date_arrived || new Date().toISOString().slice(0, 10),
      low_stock_threshold: low_stock_threshold || 100,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Create components
  const components = ['top', 'bottom', 'dupatta'] as const
  for (const comp of components) {
    await supabase.from('business_lot_components').insert({
      user_id: user.id,
      lot_id: lot.id,
      component: comp,
      opening_metres: 0,
      sold_metres: 0,
      cost_per_metre: null,
    })
  }

  return NextResponse.json({ lot })
}
