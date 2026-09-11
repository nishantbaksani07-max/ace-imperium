import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const period = searchParams.get('period') || 'month'
  const reportType = searchParams.get('type') || 'per_day'
  const dateStr = searchParams.get('date') || new Date().toISOString().slice(0, 10)

  // Build date range based on period
  const dateRanges: Record<string, { from: string; to: string }> = {
    month: getMonthRange(dateStr),
    quarter: getQuarterRange(dateStr),
    halfyear: getHalfYearRange(dateStr),
    year: getYearRange(dateStr),
  }
  const range = dateRanges[period] || dateRanges.month

  const { data: orders } = await supabase
    .from('business_orders')
    .select('*')
    .eq('user_id', user.id)
    .gte('order_date', range.from)
    .lte('order_date', range.to)
    .order('order_date', { ascending: true })

  const allOrders = orders ?? []

  // Get parties for names
  const { data: parties } = await supabase
    .from('business_parties')
    .select('id, name')
    .eq('user_id', user.id)

  const partyMap = new Map((parties ?? []).map((p: any) => [p.id, p.name]))

  let result: any

  switch (reportType) {
    case 'per_day':
      result = await buildPerDayReport(allOrders, range)
      break
    case 'party':
      result = await buildPartyReport(allOrders, partyMap)
      break
    case 'item':
      result = await buildItemReport(supabase, user.id, range)
      break
    case 'deep':
      result = await buildDeepAnalysis(supabase, user.id, allOrders, range, period)
      break
    default:
      result = await buildPerDayReport(allOrders, range)
  }

  return NextResponse.json(result)
}

function getMonthRange(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return { from: formatDateISO(start), to: formatDateISO(end) }
}
function getQuarterRange(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  const q = Math.floor(d.getMonth() / 3)
  const start = new Date(d.getFullYear(), q * 3, 1)
  const end = new Date(d.getFullYear(), q * 3 + 3, 0)
  return { from: formatDateISO(start), to: formatDateISO(end) }
}
function getHalfYearRange(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  const h = d.getMonth() < 6 ? 0 : 6
  const start = new Date(d.getFullYear(), h, 1)
  const end = new Date(d.getFullYear(), h + 6, 0)
  return { from: formatDateISO(start), to: formatDateISO(end) }
}
function getYearRange(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return { from: `${d.getFullYear()}-01-01`, to: `${d.getFullYear()}-12-31` }
}
function formatDateISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function buildPerDayReport(orders: any[], range: any) {
  const dayMap = new Map<string, { orders: number; total_metres: number; total_amount: number }>()
  const days = getDateRange(range.from, range.to)
  for (const day of days) {
    dayMap.set(day, { orders: 0, total_metres: 0, total_amount: 0 })
  }
  for (const o of orders) {
    const d = o.order_date.slice(0, 10)
    const existing = dayMap.get(d) || { orders: 0, total_metres: 0, total_amount: 0 }
    existing.orders += 1
    existing.total_metres += o.top_metres + o.bottom_metres + o.dupatta_metres
    existing.total_amount += o.total_amount
    dayMap.set(d, existing)
  }
  const rows = Array.from(dayMap.entries()).map(([date, data]) => ({ date, ...data }))
  const totals = rows.reduce((acc, r) => ({ orders: acc.orders + r.orders, total_metres: acc.total_metres + r.total_metres, total_amount: acc.total_amount + r.total_amount }), { orders: 0, total_metres: 0, total_amount: 0 })
  return { type: 'per_day', rows, totals }
}

async function buildPartyReport(orders: any[], partyMap: Map<string, string>) {
  const partyTotals = new Map<string, { orders: number; total_metres: number; amount: number }>()
  for (const o of orders) {
    const pid = o.party_id
    const existing = partyTotals.get(pid) || { orders: 0, total_metres: 0, amount: 0 }
    existing.orders += 1
    existing.total_metres += o.top_metres + o.bottom_metres + o.dupatta_metres
    existing.amount += o.total_amount
    partyTotals.set(pid, existing)
  }
  const totalAmount = orders.reduce((s: number, o: any) => s + o.total_amount, 0)
  const sorted = Array.from(partyTotals.entries()).sort((a, b) => b[1].amount - a[1].amount)
  const rows = sorted.map(([partyId, data], i) => ({
    rank: i + 1,
    party: partyMap.get(partyId) || 'Unknown',
    ...data,
    percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
  }))
  return { type: 'party', rows, totalAmount }
}

async function buildItemReport(supabase: any, userId: string, range: any) {
  const { data: orders } = await supabase
    .from('business_orders')
    .select('item_name, top_metres, bottom_metres, dupatta_metres, total_amount')
    .eq('user_id', userId)
    .gte('order_date', range.from)
    .lte('order_date', range.to)
  const allOrders = orders ?? []

  const itemMap = new Map<string, { active_lots: number; metres_sold: number; amount: number; rates: number[] }>()
  for (const o of allOrders) {
    const existing = itemMap.get(o.item_name) || { active_lots: 0, metres_sold: 0, amount: 0, rates: [] }
    existing.metres_sold += o.top_metres + o.bottom_metres + o.dupatta_metres
    existing.amount += o.total_amount
    if (o.top_rate) existing.rates.push(o.top_rate)
    if (o.bottom_rate) existing.rates.push(o.bottom_rate)
    if (o.dupatta_rate) existing.rates.push(o.dupatta_rate)
    itemMap.set(o.item_name, existing)
  }

  // Get lot counts
  const { data: lots } = await supabase
    .from('business_lots')
    .select('item_name')
    .eq('user_id', userId)
  for (const l of lots ?? []) {
    const existing = itemMap.get(l.item_name) || { active_lots: 0, metres_sold: 0, amount: 0, rates: [] }
    existing.active_lots += 1
    itemMap.set(l.item_name, existing)
  }

  const totalAmount = orders.reduce((s: number, o: any) => s + o.total_amount, 0)
  const rows = Array.from(itemMap.entries()).map(([item_name, data]) => ({
    item_name,
    active_lots: data.active_lots,
    metres_sold: data.metres_sold,
    amount: data.amount,
    avg_rate: data.rates.length > 0 ? data.rates.reduce((a: number, b: number) => a + b, 0) / data.rates.length : 0,
    percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
  })).sort((a: any, b: any) => b.amount - a.amount)

  return { type: 'item', rows, totalAmount }
}

async function buildDeepAnalysis(supabase: any, userId: string, orders: any[], range: any, period: string) {
  const now = new Date()
  const workingDays = getWorkingDays(range.from, range.to)
  const daysWithOrders = new Set(orders.map((o: any) => o.order_date.slice(0, 10))).size

  // LOTS stats
  const { data: lots } = await supabase.from('business_lots').select('*').eq('user_id', userId)
  const allLots = lots ?? []
  const arrivedLots = allLots.filter((l: any) => l.status === 'arrived').length
  const contributedLots = allLots.filter((l: any) => ['active', 'low_stock', 'cleared'].includes(l.status)).length
  const deadStockLots = allLots.filter((l: any) => l.status === 'dead_stock').length
  const avgSalePerLot = orders.length > 0 ? orders.reduce((s: number, o: any) => s + o.total_amount, 0) / Math.max(contributedLots, 1) : 0

  // METRES stats
  const totalSold = orders.reduce((s: number, o: any) => s + o.top_metres + o.bottom_metres + o.dupatta_metres, 0)
  const avgRevPerMetre = totalSold > 0 ? orders.reduce((s: number, o: any) => s + o.total_amount, 0) / totalSold : 0

  // Find fastest/slowest clearing lot
  let fastestLot = ''
  let slowestLot = ''
  let fastestPct = Infinity
  let slowestPct = 0
  for (const l of allLots) {
    const comps = await supabase.from('business_lot_components').select('*').eq('lot_id', l.id).select('component, opening_metres, sold_metres')
    // Simplified: use orders data for speed
  }

  // PARTIES stats
  const { data: parties } = await supabase.from('business_parties').select('id, name').eq('user_id', userId)
  const activePartyIds = new Set(orders.map((o: any) => o.party_id))
  const inactiveParties = ((parties ?? []).filter((p: any) => !activePartyIds.has(p.id))).length
  const top3Parties = orders.reduce((acc: Map<string, number>, o: any) => {
    acc.set(o.party_id, (acc.get(o.party_id) || 0) + o.total_amount)
    return acc
  }, new Map())
  const sortedParties = Array.from(top3Parties.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3)

  // DAYS stats
  const avgDailySale = daysWithOrders > 0 ? orders.reduce((s: number, o: any) => s + o.total_amount, 0) / daysWithOrders : 0
  const bestDay = orders.length > 0 ? orders.reduce((best: any, o: any) => o.total_amount > best.total_amount ? o : best, orders[0]) : null

  // ORDERS stats
  const gstOrders = orders.filter((o: any) => o.gst_applied).length
  const nonGstOrders = orders.length - gstOrders

  // HIGHEST LEVERAGE MOVE
  const overdueOrders = orders.filter((o: any) => o.status === 'pending' && o.due_date < now.toISOString().slice(0, 10))
  const overdueAmount = overdueOrders.reduce((s: number, o: any) => s + o.total_amount, 0)

  // Dead stock value
  const deadStockValue = allLots.filter((l: any) => l.status === 'dead_stock').reduce((s: number, l: any) => {
    // Approximate with opening stock × avg rate
    return s + (l.low_stock_threshold * 100) // rough estimate
  }, 0)

  return {
    type: 'deep',
    period,
    lots: { arrived: arrivedLots, contributed: contributedLots, dead_stock: deadStockLots, avg_sale_per_lot: avgSalePerLot },
    metres: { total_sold, avg_revenue_per_metre: avgRevPerMetre, fastest_lot: fastestLot, slowest_lot: slowestLot },
    parties: { active_count: activePartyIds.size, top3: sortedParties.map(([id, amt]) => ({ party: (parties?.find((p: any) => p.id === id)?.name) || id, amount: amt })), inactive: inactiveParties, avg_order_value: orders.length > 0 ? orders.reduce((s: number, o: any) => s + o.total_amount, 0) / orders.length : 0 },
    days: { working_days: workingDays, days_with_orders: daysWithOrders, avg_daily_sale: avgDailySale, best_day: bestDay?.item_name || null, best_day_amount: bestDay?.total_amount || 0 },
    orders: { total: orders.length, avg_metres_per_order: orders.length > 0 ? totalSold / orders.length : 0, avg_order_value: orders.length > 0 ? orders.reduce((s: number, o: any) => s + o.total_amount, 0) / orders.length : 0, gst_orders, non_gst_orders },
    leverage: { overdue_amount, overdue_count: overdueOrders.length, dead_stock_value: deadStockValue },
  }
}

function getDateRange(from: string, to: string): string[] {
  const days: string[] = []
  const d = new Date(from + 'T00:00:00')
  const end = new Date(to + 'T00:00:00')
  while (d <= end) {
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
    d.setDate(d.getDate() + 1)
  }
  return days
}

function getWorkingDays(from: string, to: string): number {
  let count = 0
  const d = new Date(from + 'T00:00:00')
  const end = new Date(to + 'T00:00:00')
  while (d <= end) {
    if (d.getDay() !== 0 && d.getDay() !== 6) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}
