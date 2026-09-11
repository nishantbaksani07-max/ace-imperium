import { createClient } from '@/lib/supabase/server'
import type {
  BusinessLot,
  BusinessLotComponent,
  BusinessParty,
  BusinessRateCard,
  BusinessOrder,
  BusinessPayment,
  BusinessCatalogueItem,
  BusinessMorningBriefing,
} from './types'

const supabase = createClient()

export async function getUserLots(userId: string): Promise<BusinessLot[]> {
  const { data, error } = await supabase
    .from('business_lots')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) return []
  return (data ?? []) as BusinessLot[]
}

export async function getLotComponents(lotId: string, userId: string): Promise<BusinessLotComponent[]> {
  const { data, error } = await supabase
    .from('business_lot_components')
    .select('*')
    .eq('lot_id', lotId)
    .eq('user_id', userId)
    .order('component')
  if (error) return []
  return (data ?? []) as BusinessLotComponent[]
}

export async function getActiveLots(userId: string): Promise<BusinessLot[]> {
  const { data, error } = await supabase
    .from('business_lots')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['arrived', 'active', 'low_stock'])
    .order('created_at', { ascending: false })
  if (error) return []
  return (data ?? []) as BusinessLot[]
}

export async function getItemNames(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('business_lots')
    .select('item_name')
    .eq('user_id', userId)
    .order('item_name')
  if (error) return []
  const names = new Set<string>()
  for (const row of (data ?? [])) {
    if (row.item_name) names.add(row.item_name)
  }
  // Also check catalogue
  const { data: catData } = await supabase
    .from('business_catalogue')
    .select('item_name')
    .eq('user_id', userId)
    .order('item_name')
  if (!error && catData) {
    for (const row of catData) {
      if (row.item_name) names.add(row.item_name)
    }
  }
  return Array.from(names)
}

export async function getParties(userId: string): Promise<BusinessParty[]> {
  const { data, error } = await supabase
    .from('business_parties')
    .select('*')
    .eq('user_id', userId)
    .order('name')
  if (error) return []
  return (data ?? []) as BusinessParty[]
}

export async function getPartyById(partyId: string, userId: string): Promise<BusinessParty | null> {
  const { data, error } = await supabase
    .from('business_parties')
    .select('*')
    .eq('id', partyId)
    .eq('user_id', userId)
    .single()
  if (error) return null
  return data as BusinessParty
}

export async function getRateCards(userId: string): Promise<BusinessRateCard[]> {
  const { data, error } = await supabase
    .from('business_rate_cards')
    .select('*')
    .eq('user_id', userId)
    .order('item_name')
  if (error) return []
  return (data ?? []) as BusinessRateCard[]
}

export async function getRateCard(partyId: string, itemName: string, userId: string): Promise<BusinessRateCard | null> {
  const { data, error } = await supabase
    .from('business_rate_cards')
    .select('*')
    .eq('party_id', partyId)
    .eq('item_name', itemName)
    .eq('user_id', userId)
    .single()
  if (error) return null
  return data as BusinessRateCard
}

export async function getOrders(userId: string, filters?: {
  status?: string
  dateFrom?: string
  dateTo?: string
  partyId?: string
}): Promise<BusinessOrder[]> {
  let query = supabase
    .from('business_orders')
    .select('*')
    .eq('user_id', userId)
    .order('order_date', { ascending: false })

  if (filters?.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }
  if (filters?.partyId) {
    query = query.eq('party_id', filters.partyId)
  }
  if (filters?.dateFrom) {
    query = query.gte('order_date', filters.dateFrom)
  }
  if (filters?.dateTo) {
    query = query.lte('order_date', filters.dateTo)
  }

  const { data, error } = await query
  if (error) return []
  return (data ?? []) as BusinessOrder[]
}

export async function getOrderById(orderId: string, userId: string): Promise<BusinessOrder | null> {
  const { data, error } = await supabase
    .from('business_orders')
    .select('*')
    .eq('id', orderId)
    .eq('user_id', userId)
    .single()
  if (error) return null
  return data as BusinessOrder
}

export async function getPayments(userId: string): Promise<BusinessPayment[]> {
  const { data, error } = await supabase
    .from('business_payments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) return []
  return (data ?? []) as BusinessPayment[]
}

export async function getCatalogueItems(userId: string): Promise<BusinessCatalogueItem[]> {
  const { data, error } = await supabase
    .from('business_catalogue')
    .select('*')
    .eq('user_id', userId)
    .order('item_name')
    .order('design_no')
  if (error) return []
  return (data ?? []) as BusinessCatalogueItem[]
}

export async function getMorningBriefing(userId: string, date: string): Promise<BusinessMorningBriefing | null> {
  const { data, error } = await supabase
    .from('business_morning_briefings')
    .select('*')
    .eq('user_id', userId)
    .eq('briefing_date', date)
    .single()
  if (error) return null
  return data as BusinessMorningBriefing
}

export async function getBusinessKPIs(userId: string) {
  const now = new Date()
  const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const lastMonthStart = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}-01`
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const [thisMonthOrders, lastMonthOrders, allOrders, lots, overdueOrders] = await Promise.all([
    getOrders(userId, { dateFrom: thisMonthStart }),
    getOrders(userId, { dateFrom: lastMonthStart, dateTo: thisMonthStart }),
    getOrders(userId),
    getUserLots(userId),
    getOrders(userId, { status: 'overdue' }),
  ])

  const thisMonthSales = thisMonthOrders.reduce((s, o) => s + o.total_amount, 0)
  const lastMonthSales = lastMonthOrders.reduce((s, o) => s + o.total_amount, 0)
  const monthChange = lastMonthSales > 0 ? ((thisMonthSales - lastMonthSales) / lastMonthSales) * 100 : 0

  const outstanding = allOrders
    .filter(o => o.status === 'pending' || o.status === 'partial')
    .reduce((s, o) => s + (o.total_amount - o.amount_received), 0)

  const activeLots = lots.filter(l => l.status === 'active' || l.status === 'low_stock').length
  const lowStockLots = lots.filter(l => l.status === 'low_stock').length
  const deadStockLots = lots.filter(l => l.status === 'dead_stock').length

  const ordersThisMonth = thisMonthOrders.length

  return {
    thisMonthSales,
    lastMonthSales,
    monthChange,
    totalOutstanding: outstanding,
    activeLots,
    lowStockLots,
    deadStockLots,
    ordersThisMonth,
    overdueCount: overdueOrders.length,
    overdueOrders,
    totalOrders: allOrders.length,
    totalSales: allOrders.reduce((s, o) => s + o.total_amount, 0),
  }
}

export async function getOverdueOrders(userId: string): Promise<BusinessOrder[]> {
  const { data, error } = await supabase
    .from('business_orders')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .lt('due_date', new Date().toISOString().slice(0, 10))
    .order('due_date', { ascending: true })
  if (error) return []
  return (data ?? []) as BusinessOrder[]
}

export async function getPaymentsDueThisWeek(userId: string): Promise<BusinessOrder[]> {
  const now = new Date()
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const weekEndStr = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, '0')}-${String(weekEnd.getDate()).padStart(2, '0')}`
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const { data, error } = await supabase
    .from('business_orders')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['pending', 'partial'])
    .gte('due_date', todayStr)
    .lte('due_date', weekEndStr)
    .order('due_date', { ascending: true })
  if (error) return []
  return (data ?? []) as BusinessOrder[]
}

export async function getPartiesWithoutRecentOrders(userId: string, days: number = 14): Promise<BusinessParty[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`

  const { data: activeOrders } = await supabase
    .from('business_orders')
    .select('party_id')
    .eq('user_id', userId)
    .gte('order_date', cutoffStr)
    .select('party_id')
  const activeOrdersResult = await activeOrders
  const activeOrdersData = activeOrdersResult ? (activeOrdersResult as any).data ?? activeOrdersResult : null
  const activePartyIds = new Set((activeOrdersData ?? []).map((r: any) => r.party_id))

  const { data, error } = await supabase
    .from('business_parties')
    .select('*')
    .eq('user_id', userId)
    .order('name')
  if (error) return []
  return (data ?? []).filter((p: BusinessParty) => !activePartyIds.has(p.id)) as BusinessParty[]
}

export async function getTopPartiesThisMonth(userId: string, limit: number = 3): Promise<Array<{ party: string; amount: number }>> {
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const { data, error } = await supabase
    .from('business_orders')
    .select('party_id, total_amount')
    .eq('user_id', userId)
    .gte('order_date', monthStart)
    .order('total_amount', { ascending: false })
  if (error) return []

  const partyTotals = new Map<string, number>()
  for (const row of (data ?? [])) {
    const current = partyTotals.get(row.party_id) || 0
    partyTotals.set(row.party_id, current + row.total_amount)
  }

  const sorted = Array.from(partyTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)

  const { data: parties } = await supabase
    .from('business_parties')
    .select('id, name')
    .eq('user_id', userId)
    .in('id', sorted.map(s => s[0]))

  const partyNames = new Map((parties ?? []).map((p: any) => [p.id, p.name]))
  return sorted.map(([id, amount]) => ({
    party: partyNames.get(id) || 'Unknown',
    amount,
  }))
}
