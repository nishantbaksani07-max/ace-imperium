import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Update all pending orders with overdue due dates
  const { data, error } = await supabase.rpc('refresh_overdue_statuses')
    .select()

  if (error) {
    // Fallback: direct update if rpc doesn't work
    const { data: fallback } = await supabase
      .from('business_orders')
      .update({ status: 'overdue', updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .lt('due_date', new Date().toISOString().slice(0, 10))
      .select()

    return NextResponse.json({ updated: fallback?.length ?? 0 })
  }

  return NextResponse.json({ updated: data?.length ?? 0 })
}
