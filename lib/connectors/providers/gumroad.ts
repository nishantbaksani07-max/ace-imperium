import 'server-only'

import type { ConnectorDef, SyncedMetric } from '../types'

/**
 * Gumroad connector — API key (a personal access token).
 *
 * The creator makes a token in Gumroad → Settings → Advanced → Applications →
 * "Generate access token" and pastes it. Pulls product count plus 30-day sales
 * volume + count. Gumroad amounts are in cents.
 */

const API = 'https://api.gumroad.com/v2'

async function gumroadGet<T = any>(token: string, path: string): Promise<T> {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${API}${path}${sep}access_token=${encodeURIComponent(token)}`, { cache: 'no-store' })
  if (res.status === 401) throw new Error('Gumroad rejected the token.')
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gumroad ${path} → ${res.status}: ${body.slice(0, 160)}`)
  }
  const json = (await res.json()) as { success?: boolean } & T
  if (json.success === false) throw new Error('Gumroad returned success:false (check token scope).')
  return json
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export const gumroadConnector: ConnectorDef = {
  id: 'gumroad',
  label: 'Gumroad',
  blurb: 'Products and 30-day sales from your Gumroad account.',
  authType: 'api_key',
  requiredEnv: [],

  apiKey: {
    fields: [{ key: 'token', label: 'Access token', placeholder: 'gumroad access token', secret: true }],
    async verify(creds) {
      const token = (creds.token ?? '').trim()
      if (!token) throw new Error('Access token required')
      const data = await gumroadGet<{ user?: { name?: string; email?: string } }>(token, '/user')
      return { accountLabel: data.user?.name || data.user?.email || 'Gumroad' }
    },
  },

  async sync({ credentials }) {
    const token = String(credentials.token ?? '')
    if (!token) throw new Error('Gumroad token missing')
    const metrics: SyncedMetric[] = []
    let accountLabel: string | undefined

    const user = await gumroadGet<{ user?: { name?: string } }>(token, '/user').catch(() => null)
    if (user?.user?.name) accountLabel = user.user.name

    const products = await gumroadGet<{ products?: unknown[] }>(token, '/products').catch(() => null)
    if (products?.products) {
      metrics.push({ metric: 'products', label: 'Products', value: products.products.length, unit: '', period: 'snapshot' })
    }

    const after = ymd(new Date(Date.now() - 30 * 86_400_000))
    const sales = await gumroadGet<{ sales?: Array<{ price?: number }> }>(token, `/sales?after=${after}`).catch(() => null)
    if (sales?.sales) {
      const total = sales.sales.reduce((a, s) => a + (s.price ?? 0), 0)
      metrics.push({ metric: 'sales_30d', label: 'Sales (30d)', value: Math.round(total) / 100, unit: '$', period: 'month' })
      metrics.push({ metric: 'orders_30d', label: 'Orders (30d)', value: sales.sales.length, unit: '', period: 'month' })
    }

    return { accountLabel, metrics }
  },
}
