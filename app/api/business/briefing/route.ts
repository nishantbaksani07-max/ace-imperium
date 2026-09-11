import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { BUSINESS_MENTOR_SYSTEM_PROMPT } from '@/lib/business/prompts'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Mentor is not configured' }, { status: 500 })
  }

  // Check if today's briefing already exists
  const today = new Date().toISOString().slice(0, 10)
  const { data: existing } = await supabase
    .from('business_morning_briefings')
    .select('*')
    .eq('user_id', user.id)
    .eq('briefing_date', today)
    .single()

  if (existing) {
    return NextResponse.json({ content: existing.content, cached: true })
  }

  // Build context
  const context = await buildBusinessContext(supabase, user.id)

  const systemPrompt = `${BUSINESS_MENTOR_SYSTEM_PROMPT}\n\nMODE: morning_briefing\nPriority Alert | Today's Focus (2-3 bullets) | One Watch-Out. Total under 120 words.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Generate a morning briefing for today. Context:\n\n${context}` }],
      }),
    })

    const rawText = await res.text()
    let data: any
    try {
      data = JSON.parse(rawText)
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 502 })
    }

    const content = data?.content?.[0]?.text?.trim()
    if (!content) {
      return NextResponse.json({ error: 'Empty response from AI' }, { status: 502 })
    }

    // Store the briefing
    await supabase
      .from('business_morning_briefings')
      .upsert({
        user_id: user.id,
        briefing_date: today,
        content,
      })

    return NextResponse.json({ content, cached: false })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'briefing_failed' }, { status: 500 })
  }
}

async function buildBusinessContext(supabase: any, userId: string): Promise<string> {
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const { data: todayOrders } = await supabase
    .from('business_orders').select('*').eq('user_id', userId).eq('order_date', today)
  const { data: thisMonthOrders } = await supabase
    .from('business_orders').select('total_amount').eq('user_id', userId).gte('order_date', monthStart)
  const { data: overdueOrders } = await supabase
    .from('business_orders').select('*').eq('user_id', userId).eq('status', 'overdue')
  const { data: lots } = await supabase
    .from('business_lots').select('*').eq('user_id', userId).in('status', ['low_stock', 'dead_stock'])

  const lines: string[] = []
  lines.push(`Today: ${today}`)
  lines.push(`Today's orders: ${todayOrders?.length ?? 0}`)
  lines.push(`This month sales: ₹${thisMonthOrders?.reduce((s: number, o: any) => s + (o.total_amount || 0), 0) ?? 0}`)
  lines.push(`Overdue payments: ${overdueOrders?.length ?? 0}`)
  lines.push(`Low stock / dead stock lots: ${lots?.length ?? 0}`)
  if (overdueOrders && overdueOrders.length > 0) {
    lines.push(`Overdue details: ${overdueOrders.map((o: any) => `${o.item_name} — ₹${o.total_amount} due ${o.due_date}`).join('; ')}`)
  }
  if (lots && lots.length > 0) {
    lines.push(`Low stock alerts: ${lots.map((l: any) => `${l.item_name} D.No ${l.design_no} — ${l.status}`).join('; ')}`)
  }

  return lines.join('\n')
}
