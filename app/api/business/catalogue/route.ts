import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const itemName = searchParams.get('item')

  let query = supabase.from('business_catalogue').select('*').eq('user_id', user.id).order('item_name').order('design_no')
  if (itemName) query = query.ilike('item_name', `%${itemName}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ catalogue: data })
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as any
  if (!body) return NextResponse.json({ error: 'missing_body' }, { status: 400 })

  const { item_name, design_no, photo_url, lot_id } = body
  if (!item_name || !design_no || !photo_url) {
    return NextResponse.json({ error: 'item_name, design_no, and photo_url required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('business_catalogue')
    .insert({
      user_id: user.id,
      item_name,
      design_no,
      photo_url,
      lot_id: lot_id || null,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Item with this design already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ item: data })
}
