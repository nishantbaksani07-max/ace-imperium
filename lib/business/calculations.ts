// Business module calculations
// All monetary values in Indian format (₹X,XX,XXX — lakh notation)

export function formatIndianRupees(amount: number): string {
  const abs = Math.abs(Math.round(amount))
  if (abs >= 100000) {
    const lakh = (abs / 100000).toFixed(1).replace(/\.0$/, '')
    return `₹${lakh} lac`
  }
  return `₹${abs.toLocaleString('en-IN')}`
}

export function formatIndianRupeesFull(amount: number): string {
  const abs = Math.abs(Math.round(amount))
  return `₹${abs.toLocaleString('en-IN')}`
}

export function formatDateDMY(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

export function calculateInvoice(params: {
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
  order_date: string
}): {
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
} {
  const {
    top_metres, bottom_metres, dupatta_metres, colours,
    top_rate, bottom_rate, dupatta_rate,
    discount_percent, gst_applied, payment_days, order_date
  } = params

  const top_total_metres = top_metres * colours
  const bottom_total_metres = bottom_metres * colours
  const dupatta_total_metres = dupatta_metres * colours
  const grand_total_metres = top_total_metres + bottom_total_metres + dupatta_total_metres

  const top_amount = top_total_metres * top_rate
  const bottom_amount = bottom_total_metres * bottom_rate
  const dupatta_amount = dupatta_total_metres * dupatta_rate
  const subtotal = top_amount + bottom_amount + dupatta_amount

  const discount_amount = subtotal * (discount_percent / 100)
  const after_discount = subtotal - discount_amount

  let gst_amount = 0
  if (gst_applied) {
    gst_amount = after_discount * 0.05
  }

  const total_amount = after_discount + gst_amount

  // CD (cash discount) — 2% if paid within 10 days as example
  const cd_percent = 2
  const cd_amount = total_amount * (cd_percent / 100)
  const net_payable = total_amount - cd_amount

  const orderDate = new Date(order_date + 'T00:00:00')
  const dueDate = new Date(orderDate)
  dueDate.setDate(dueDate.getDate() + payment_days)
  const due_date = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`

  return {
    top_total_metres, bottom_total_metres, dupatta_total_metres,
    grand_total_metres, subtotal, discount_amount, after_discount,
    gst_amount, total_amount, cd_amount, net_payable, due_date
  }
}

export function calculateRemainingLotStock(components: Array<{
  component: string
  opening_metres: number
  sold_metres: number
}>): Array<{
  component: string
  opening: number
  sold: number
  remaining: number
  percentage: number
}> {
  return components.map(c => {
    const remaining = c.opening_metres - c.sold_metres
    const percentage = c.opening_metres > 0
      ? ((remaining / c.opening_metres) * 100)
      : 0
    return {
      component: c.component,
      opening: c.opening_metres,
      sold: c.sold_metres,
      remaining,
      percentage
    }
  })
}

export function getStockStatus(
  remaining: number,
  opening: number,
  threshold: number
): 'good' | 'warn' | 'critical' {
  if (opening <= 0) return 'good'
  const pct = (remaining / opening) * 100
  if (pct <= 5) return 'critical'
  if (remaining < threshold) return 'warn'
  return 'good'
}

export function getStockBarColor(remaining: number, opening: number, threshold: number): string {
  if (opening <= 0) return 'var(--mint)'
  const pct = (remaining / opening) * 100
  if (pct <= 10) return 'var(--red)'
  if (remaining < threshold) return 'var(--amber)'
  return 'var(--mint)'
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'paid': case 'active': case 'cleared': return 'var(--mint)'
    case 'pending': case 'low_stock': case 'partial': case 'arrived': return 'var(--amber)'
    case 'overdue': case 'dead_stock': case 'critical': return 'var(--red)'
    default: return 'var(--muted)'
  }
}

export function getUrgencyColor(daysUntil: number): string {
  if (daysUntil < 0) return 'var(--red)'
  if (daysUntil <= 2) return 'var(--red)'
  if (daysUntil <= 7) return 'var(--amber)'
  return 'var(--mint)'
}

export function calculateDailyTotals(orders: Array<{ date: string; total_amount: number; top_metres: number; bottom_metres: number; dupatta_metres: number }>) {
  const totals = orders.reduce((acc, o) => ({
    total_amount: acc.total_amount + o.total_amount,
    total_metres: acc.total_metres + o.top_metres + o.bottom_metres + o.dupatta_metres,
    count: acc.count + 1
  }), { total_amount: 0, total_metres: 0, count: 0 })
  return totals
}

export function getLastMonthTotals(orders: Array<{ date: string; total_amount: number }>): number {
  const now = new Date()
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  return orders
    .filter(o => {
      const d = new Date(o.date + 'T00:00:00')
      return d >= lastMonth && d < thisMonth
    })
    .reduce((sum, o) => sum + o.total_amount, 0)
}

export function getCurrentMonthTotals(orders: Array<{ date: string; total_amount: number }>): number {
  const now = new Date()
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  return orders
    .filter(o => {
      const d = new Date(o.date + 'T00:00:00')
      return d >= thisMonth
    })
    .reduce((sum, o) => sum + o.total_amount, 0)
}

export function getOutstandingBalance(orders: Array<{ total_amount: number; amount_received: number }>): number {
  return orders.reduce((sum, o) => {
    const balance = (o.total_amount || 0) - (o.amount_received || 0)
    return sum + Math.max(0, balance)
  }, 0)
}

export function formatMetres(m: number): string {
  return `${m.toFixed(2)}m`
}

export function getPercentageDisplay(amount: number, total: number): string {
  if (total === 0) return '0%'
  const pct = (amount / total) * 100
  return `${pct.toFixed(1)}%`
}

export function getDaysUntil(dateStr: string): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T00:00:00')
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

export function getLastNDays(n: number): string[] {
  const days: string[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }
  return days
}

export function getMonthLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getMonth()]} ${d.getFullYear()}`
}

export function getQuarterLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const q = Math.floor(d.getMonth() / 3) + 1
  return `Q${q} ${d.getFullYear()}`
}

export function getHalfYearLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const h = d.getMonth() < 6 ? 'H1' : 'H2'
  return `${h} ${d.getFullYear()}`
}

export function getYearLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getFullYear()}`
}
