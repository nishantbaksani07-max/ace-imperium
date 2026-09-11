import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Mentor is not configured on the server' }, { status: 500 })
  }

  const payload = await request.json().catch(() => null) as { messages?: any[]; mode?: string } | null
  if (!payload || !Array.isArray(payload.messages)) {
    return NextResponse.json({ error: 'missing_messages' }, { status: 400 })
  }

  const mode = payload.mode || 'chat'
  const messages = payload.messages.slice(-20)

  // Fetch business context
  const context = await buildBusinessContext(supabase, user.id)

  const systemPrompt = getSystemPrompt(mode)
  const systemContent = `${systemPrompt}\n\n--- USER BUSINESS CONTEXT ---\n${context}\n--- END CONTEXT ---`

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
        max_tokens: 1024,
        system: systemContent,
        messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
      }),
    })

    const rawText = await res.text()
    let data: any
    try {
      data = JSON.parse(rawText)
    } catch {
      return NextResponse.json({ error: `Anthropic returned non-JSON: ${rawText.slice(0, 200)}` }, { status: 502 })
    }

    if (!res.ok) {
      return NextResponse.json({ error: data?.error?.message || `Anthropic ${res.status}` }, { status: 502 })
    }

    const text = data?.content?.[0]?.text
    if (typeof text !== 'string') {
      return NextResponse.json({ error: 'Empty response from Imperium' }, { status: 502 })
    }

    return NextResponse.json({ reply: text })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'chat_failed' }, { status: 500 })
  }
}

function getSystemPrompt(mode: string): string {
  const base = `You are Imperium, the business mentor inside this wholesale dress material management app. You have full access to the user's actual business data: their lots, stock levels, orders, party balances, collections, and sales trends. This is an Indian wholesale business dealing in fabric dress material sets (Top, Bottom, Dupatta).

Your job is to be a sharp, practical business advisor. Not chatty. Not generic. You read their actual numbers and give them specific, actionable advice.

VOICE
Direct, warm, professional. Short sentences. Plain language.
No emoji. No em dashes. Use periods or 'and' instead.
Never give generic business advice. Always tie your answer to
their actual data.
If a number isn't in the context block, say so — never invent data.
Never shame. If something is off, name it plainly and suggest the
smallest next action.

RESPONSE FORMAT
Hard cap: 100 words for regular answers.
Lead line: one sentence naming the core insight.
Then 2-4 bullet points, each one tight clause.
Bold the one most important number or action per response
using double asterisks.
Never write in paragraphs unless the user specifically asks for detail.`

  if (mode === 'morning_briefing') {
    return `${base}\n\nMODE: morning_briefing\nFormat: Priority Alert | Today's Focus (2-3 bullets) | One Watch-Out. Total under 120 words.`
  }
  if (mode === 'pre_visit') {
    return `${base}\n\nMODE: pre_visit\nFormat: Party name heading | Outstanding balance | Buying pattern | Suggested opening | Watch-out. Under 100 words.`
  }
  if (mode === 'post_day') {
    return `${base}\n\nMODE: post_day\nFormat: Today vs month average | Working well | To improve. Under 80 words.`
  }
  return base
}

async function buildBusinessContext(supabase: any, userId: string): Promise<string> {
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const thirtyAgo = `${thirtyDaysAgo.getFullYear()}-${String(thirtyDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(thirtyDaysAgo.getDate()).padStart(2, '0')}`

  // This month orders
  const { data: thisMonthOrders } = await supabase
    .from('business_orders').select('*').eq('user_id', userId).gte('order_date', monthStart)
  const thisMonthOrdersData = thisMonthOrders ?? []

  // Last month orders
  const { data: lastMonthOrders } = await supabase
    .from('business_orders').select('total_amount').eq('user_id', userId).gte('order_date', thirtyAgo).lt('order_date', monthStart)
  const lastMonthTotal = (lastMonthOrders ?? []).reduce((s: number, o: any) => s + (o.total_amount || 0), 0)
  const thisMonthTotal = thisMonthOrdersData.reduce((s: number, o: any) => s + (o.total_amount || 0), 0)
  const monthChange = lastMonthTotal > 0 ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal * 100).toFixed(1) : '0'

  // Outstanding
  const { data: allOrders } = await supabase
    .from('business_orders').select('*').eq('user_id', userId)
  const allOrdersData = allOrders ?? []
  const outstanding = allOrdersData
    .filter((o: any) => o.status === 'pending' || o.status === 'partial')
    .reduce((s: number, o: any) => s + Math.max(0, o.total_amount - o.amount_received), 0)

  // Overdue
  const overdue = allOrdersData.filter((o: any) => o.status === 'pending' && o.due_date < today).length

  // Active lots
  const { data: lots } = await supabase
    .from('business_lots').select('*').eq('user_id', userId)
  const lotsData = lots ?? []
  const activeLots = lotsData.filter((l: any) => ['active', 'low_stock'].includes(l.status)).length

  // Top 3 parties
  const { data: topParties } = await supabase.rpc('get_top_parties_this_month', { p_user_id: userId })
    .catch(() => null)

  // Parties with no order in 14+ days
  const { data: parties } = await supabase
    .from('business_parties').select('id, name').eq('user_id', userId)
  const partyIds = new Set((parties ?? []).map((p: any) => p.id))
  const activePartyIds = new Set(allOrdersData.map((o: any) => o.party_id))
  const inactiveParties = ((parties ?? []).filter((p: any) => !activePartyIds.has(p.id))).slice(0, 5)

  // Payments due next 7 days
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const weekEndStr = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, '0')}-${String(weekEnd.getDate()).padStart(2, '0')}`
  const { data: dueSoon } = await supabase
    .from('business_orders').select('party_id, total_amount, due_date')
    .eq('user_id', userId).in('status', ['pending', 'partial'])
    .gte('due_date', today).lte('due_date', weekEndStr)

  // Last 30 days stats
  const last30Orders = allOrdersData.filter((o: any) => o.order_date >= thirtyAgo)
  const avgOrderValue = last30Orders.length > 0 ? last30Orders.reduce((s: number, o: any) => s + o.total_amount, 0) / last30Orders.length : 0
  const orderCount30 = last30Orders.length

  const lines: string[] = []
  lines.push(`Today: ${today}`)
  lines.push(`This month: ${thisMonthOrdersData.length} orders, ₹${thisMonthTotal.toLocaleString('en-IN')}`)
  lines.push(`Month change vs last month: ${monthChange}%`)
  lines.push(`Total outstanding: ₹${outstanding.toLocaleString('en-IN')}`)
  lines.push(`Overdue payments: ${overdue}`)
  lines.push(`Active lots: ${activeLots}`)
  if (topParties && (topParties as any).data) {
    const tp = (topParties as any).data.slice(0, 3)
    lines.push(`Top 3 parties this month: ${tp.map((p: any) => p.name || 'Unknown').join(', ')}`)
  }
  if (inactiveParties.length > 0) {
    lines.push(`Parties with no order in 14+ days: ${inactiveParties.map((p: any) => p.name).join(', ')}`)
  }
  if (dueSoon && (dueSoon as any).length > 0) {
    lines.push(`Payments due in 7 days: ${(dueSoon as any).map((o: any) => `₹${o.total_amount} by ${o.due_date}`).join('; ')}`)
  }
  lines.push(`Last 30 days: ${orderCount30} orders, avg order value ₹${avgOrderValue.toLocaleString('en-IN')}`)

  return lines.join('\n')
}

