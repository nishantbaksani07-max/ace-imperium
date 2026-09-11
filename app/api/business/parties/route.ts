import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('business_parties')
    .select('*')
    .eq('user_id', user.id)
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ parties: data })
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as any
  if (!body) return NextResponse.json({ error: 'missing_body' }, { status: 400 })

  const { name, area, city, phone, gstin, default_payment_days, default_cd_percent, default_gst_preference, credit_limit, notes } = body
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const { data, error } = await supabase
    .from('business_parties')
    .insert({
      user_id: user.id,
      name,
      area: area || null,
      city: city || null,
      phone: phone || null,
      gstin: gstin || null,
      default_payment_days: default_payment_days || 30,
      default_cd_percent: default_cd_percent || 0,
      default_gst_preference: default_gst_preference || 'non_gst',
      credit_limit: credit_limit || null,
      notes: notes || '',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ party: data })
}
