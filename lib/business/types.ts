// Business module TypeScript types

export interface BusinessLot {
  id: string
  user_id: string
  item_name: string
  design_no: string
  design_photo_url: string | null
  date_arrived: string
  status: 'arrived' | 'active' | 'low_stock' | 'cleared' | 'dead_stock'
  low_stock_threshold: number
  created_at: string
  updated_at: string
}

export interface BusinessLotComponent {
  id: string
  user_id: string
  lot_id: string
  component: 'top' | 'bottom' | 'dupatta'
  opening_metres: number
  sold_metres: number
  cost_per_metre: number | null
}

export interface BusinessParty {
  id: string
  user_id: string
  name: string
  area: string | null
  city: string | null
  phone: string | null
  gstin: string | null
  default_payment_days: number
  default_cd_percent: number
  default_gst_preference: 'non_gst' | 'gst'
  credit_limit: number | null
  notes: string
  created_at: string
}

export interface BusinessRateCard {
  id: string
  user_id: string
  party_id: string
  item_name: string
  top_rate: number | null
  bottom_rate: number | null
  dupatta_rate: number | null
  discount_percent: number
  payment_days: number
  gst_preference: 'non_gst' | 'gst'
}

export interface BusinessOrder {
  id: string
  user_id: string
  order_date: string
  party_id: string
  lot_id: string
  item_name: string
  design_no: string
  top_metres: number
  bottom_metres: number
  dupatta_metres: number
  colours: number
  top_rate: number
  bottom_rate: number
  dupatta_rate: number
  discount_percent: number
  gst_applied: boolean
  payment_days: number
  subtotal: number
  discount_amount: number
  gst_amount: number
  total_amount: number
  amount_received: number
  status: 'pending' | 'paid' | 'partial' | 'overdue'
  due_date: string
  notes: string
  created_at: string
  updated_at: string
}

export interface BusinessPayment {
  id: string
  user_id: string
  order_id: string
  amount: number
  payment_date: string
  cd_applied: boolean
  cd_amount: number
  notes: string
  created_at: string
}

export interface BusinessCatalogueItem {
  id: string
  user_id: string
  item_name: string
  design_no: string
  photo_url: string
  lot_id: string | null
  uploaded_at: string
}

export interface BusinessMorningBriefing {
  id: string
  user_id: string
  briefing_date: string
  content: string
  created_at: string
}

export interface LotStock {
  component: string
  opening: number
  sold: number
  remaining: number
  percentage: number
}

export interface InvoiceCalculation {
  top_total_metres: number
  bottom_total_metres: number
  dupatta_total_metres: number
  grand_total_metres: number
  subtotal: number
  discount_amount: number
  after_discount: number
  gst_amount: number
  total_amount: number
  cd_amount: number
  net_payable: number
  due_date: string
}

export interface ReportPeriodData {
  total_orders: number
  total_metres: number
  total_amount: number
  avg_order_value: number
  avg_metres_per_order: number
}

export interface PerDayReportRow {
  date: string
  orders: number
  total_metres: number
  total_amount: number
}

export interface PartyWiseReportRow {
  rank: number
  party: string
  orders: number
  total_metres: number
  amount: number
  percentage: number
}

export interface ItemWiseReportRow {
  item_name: string
  active_lots: number
  metres_sold: number
  amount: number
  avg_rate: number
  percentage: number
}

export type BusinessFilterType = 'all' | 'today' | 'week' | 'month'
export type LotFilterType = 'all' | 'arrived' | 'active' | 'low_stock' | 'cleared' | 'dead_stock'
export type CollectionFilterType = 'all' | 'overdue' | 'due_this_week' | 'pending' | 'paid'
