'use client'

import { useState } from 'react'

export default function ReportsForm() {
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
    <>
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
    </>
  )
}

function PerDayReport({ data }: { data: any }) {
  return (
    <div>
      <h2>Per Day Sale</h2>
      <table className="table">
        <thead><tr><th>Date</th><th>Orders</th><th>Total Metres</th><th>Total Amount</th></tr></thead>
        <tbody>
          {data.rows?.map((r: any, i: number) => (
            <tr key={i}><td>{r.date}</td><td>{r.orders}</td><td>{r.total_metres?.toFixed(2)}</td><td>₹{r.total_amount?.toLocaleString('en-IN')}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PartyReport({ data }: { data: any }) {
  return (
    <div>
      <h2>Party-Wise Breakdown</h2>
      <table className="table"><thead><tr><th>Rank</th><th>Party</th><th>Orders</th><th>Amount</th><th>%</th></tr></thead><tbody>
        {data.rows?.map((r: any, i: number) => <tr key={i}><td>{r.rank}</td><td>{r.party}</td><td>{r.orders}</td><td>₹{r.amount?.toLocaleString('en-IN')}</td><td>{r.percentage?.toFixed(1)}%</td></tr>)}
      </tbody></table>
    </div>
  )
}

function ItemReport({ data }: { data: any }) {
  return (
    <div>
      <h2>Item-Wise Breakdown</h2>
      <table className="table"><thead><tr><th>Item</th><th>Active Lots</th><th>Metres Sold</th><th>Amount</th></tr></thead><tbody>
        {data.rows?.map((r: any, i: number) => <tr key={i}><td>{r.item_name}</td><td>{r.active_lots}</td><td>{r.metres_sold?.toFixed(2)}</td><td>₹{r.amount?.toLocaleString('en-IN')}</td></tr>)}
      </tbody></table>
    </div>
  )
}

function DeepAnalysis({ data }: { data: any }) {
  const d = data.lots ?? {}
  return (
    <div>
      <h2>Deep Analysis — {data.period}</h2>
      <div className="deep-grid">
        <div>
          <h3>LOTS</h3>
          <p>Arrived: {d.arrived} | Contributed: {d.contributed} | Dead: {d.dead_stock}</p>
          <h3>ORDERS</h3>
          <p>Total: {data.orders?.total} | Avg value: ₹{(data.orders?.avg_order_value || 0).toLocaleString('en-IN')}</p>
        </div>
        <div>
          <h3>HIGHEST LEVERAGE MOVE</h3>
          <p>Overdue: ₹{(data.leverage?.overdue_amount || 0)?.toLocaleString('en-IN')} ({data.leverage?.overdue_count || 0} invoices)</p>
        </div>
      </div>
    </div>
  )
}
