import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { useState } from 'react'

export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <ReportsView />
}

function ReportsView() {
  const [period, setPeriod] = useState('month')
  const [reportType, setReportType] = useState('per_day')
  const [reportData, setReportData] = useState<any>(null)

  async function loadReport() {
    try {
      const params = new URLSearchParams({ period, type: reportType })
      const res = await fetch(`/api/business/reports?${params}`)
      const data = await res.json()
      setReportData(data)
    } catch (e) {
      console.error('Failed to load report:', e)
    }
  }

  return (
    <main className="business-page">
      <h1 className="business-heading">Reports</h1>
      <div className="report-controls">
        <select className="input" value={period} onChange={e => setPeriod(e.target.value)}>
          <option value="month">Monthly</option>
          <option value="quarter">Quarterly</option>
          <option value="halfyear">Half-Yearly</option>
          <option value="year">Yearly</option>
        </select>
        <select className="input" value={reportType} onChange={e => setReportType(e.target.value)}>
          <option value="per_day">Per Day</option>
          <option value="party">Party-Wise</option>
          <option value="item">Item-Wise</option>
          <option value="deep">Deep Analysis</option>
        </select>
        <button className="btn btn-primary" onClick={loadReport}>Generate</button>
      </div>
      {reportData && (
        <div className="report-content">
          {reportType === 'per_day' && <PerDayReport data={reportData} />}
          {reportType === 'party' && <PartyReport data={reportData} />}
          {reportType === 'item' && <ItemReport data={reportData} />}
          {reportType === 'deep' && <DeepAnalysis data={reportData} />}
        </div>
      )}
    </main>
  )
}

function PerDayReport({ data }: { data: any }) {
  return (
    <div>
      <h2>Per Day Sale</h2>
      <table className="orders-table">
        <thead><tr><th>Date</th><th>Orders</th><th>Total Metres</th><th>Total Amount</th></tr></thead>
        <tbody>
          {data.rows?.map((r: any, i: number) => (
            <tr key={i}><td>{r.date}</td><td>{r.orders}</td><td>{r.total_metres?.toFixed(2)}</td><td>₹{r.total_amount?.toLocaleString('en-IN')}</td></tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={3}><strong>Totals</strong></td><td><strong>₹{data.totals?.total_amount?.toLocaleString('en-IN')}</strong></td></tr>
        </tfoot>
      </table>
    </div>
  )
}

function PartyReport({ data }: { data: any }) {
  return (
    <div>
      <h2>Party-Wise Breakdown</h2>
      <table className="orders-table">
        <thead><tr><th>Rank</th><th>Party</th><th>Orders</th><th>Total Metres</th><th>Amount</th><th>%</th></tr></thead>
        <tbody>
          {data.rows?.map((r: any, i: number) => (
            <tr key={i}><td>{r.rank}</td><td>{r.party}</td><td>{r.orders}</td><td>{r.total_metres?.toFixed(2)}</td><td>₹{r.amount?.toLocaleString('en-IN')}</td><td>{r.percentage?.toFixed(1)}%</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ItemReport({ data }: { data: any }) {
  return (
    <div>
      <h2>Item-Wise Breakdown</h2>
      <table className="orders-table">
        <thead><tr><th>Item</th><th>Active Lots</th><th>Metres Sold</th><th>Amount</th><th>Avg Rate</th><th>%</th></tr></thead>
        <tbody>
          {data.rows?.map((r: any, i: number) => (
            <tr key={i}><td>{r.item_name}</td><td>{r.active_lots}</td><td>{r.metres_sold?.toFixed(2)}</td><td>₹{r.amount?.toLocaleString('en-IN')}</td><td>₹{r.avg_rate}</td><td>{r.percentage?.toFixed(1)}%</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DeepAnalysis({ data }: { data: any }) {
  const d = data.lots ?? {}
  const m = data.metres ?? {}
  const p = data.parties ?? {}
  const dy = data.days ?? {}
  const o = data.orders ?? {}
  const lev = data.leverage ?? {}

  return (
    <div>
      <h2>Deep Analysis</h2>
      <div className="deep-grid">
        <div className="deep-section">
          <h3>What Produced ₹{data.period}</h3>
          <div className="stat-group">
            <h4>LOTS</h4>
            <p>Arrived: {d.arrived} | Contributed: {d.contributed} | Dead: {d.dead_stock} | Avg sale/lot: ₹{(d.avg_sale_per_lot || 0).toLocaleString('en-IN')}</p>
          </div>
          <div className="stat-group">
            <h4>METRES</h4>
            <p>Total sold: {m.total_sold?.toFixed(2)}m | Avg rev/m: ₹{(m.avg_revenue_per_metre || 0).toLocaleString('en-IN')}</p>
          </div>
          <div className="stat-group">
            <h4>PARTIES</h4>
            <p>Active: {p.active_count} | Top 3: {p.top3?.map((x: any) => `${x.party} (${x.amount?.toLocaleString('en-IN')})`).join(', ')} | Inactive: {p.inactive} | Avg order: ₹{(p.avg_order_value || 0).toLocaleString('en-IN')}</p>
          </div>
          <div className="stat-group">
            <h4>DAYS</h4>
            <p>Working: {dy.working_days} | With orders: {dy.days_with_orders} | Avg daily: ₹{(dy.avg_daily_sale || 0).toLocaleString('en-IN')} | Best: {dy.best_day}</p>
          </div>
          <div className="stat-group">
            <h4>ORDERS</h4>
            <p>Total: {o.total} | Avg m/order: {(o.avg_metres_per_order || 0).toFixed(2)} | Avg value: ₹{(o.avg_order_value || 0).toLocaleString('en-IN')} | GST: {o.gst_orders} / Non-GST: {o.non_gst_orders}</p>
          </div>
        </div>
        <div className="deep-section">
          <h3>To Hit This Number Next Period</h3>
          <div className="stat-group">
            <h4>Minimum Requirements</h4>
            <p>Lots needed: {Math.ceil((o.avg_order_value || 0) / 10000)} | Target metres: {(m.total_sold || 0).toFixed(0)}m | Active parties: {p.active_count} | Orders/day: {(o.total / (dy.working_days || 1)).toFixed(1)}</p>
          </div>
          <div className="stat-group">
            <h4>Insights</h4>
            {p.top3 && p.top3.length > 0 && (
              <p>Top 3 parties drove {((p.top3[0]?.amount || 0) / (p.top3.reduce((s: number, x: any) => s + (x.amount || 0), 0) || 1)) * 100}% of revenue. Getting 2 more to that level adds ₹{((p.top3[0]?.amount || 0) * 2)?.toLocaleString('en-IN')}.</p>
            )}
            {lev.overdue_count > 0 && (
              <p>Overdue amount = ₹{lev.overdue_amount?.toLocaleString('en-IN')}. That's {lev.overdue_count} invoices chasing.</p>
            )}
            <p>Dead stock value = ₹{(lev.dead_stock_value || 0)?.toLocaleString('en-IN')}.</p>
          </div>
          <div className="stat-group highlight">
            <h3>HIGHEST LEVERAGE MOVE</h3>
            <p>
              {lev.overdue_count > 0
                ? `Chase overdue payments — ₹{lev.overdue_amount?.toLocaleString('en-IN')} across ${lev.overdue_count} invoices.`
                : `Reactivate ${p.inactive} inactive parties to generate more sales.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
