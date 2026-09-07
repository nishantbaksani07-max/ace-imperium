import 'server-only'

import type { ConnectorDef, SyncedMetric } from '../types'

/**
 * Shopify connector — API key (a custom-app Admin API access token).
 *
 * The merchant creates a custom app in their Shopify admin (Settings → Apps and
 * sales channels → Develop apps), grants read_orders + read_products, installs
 * it, and pastes the Admin API access token (`shpat_…`) plus their shop domain.
 * This avoids the public-app OAuth + app-review path entirely while still being
 * fully scoped + revocable from the merchant's side.
 *
 * Pulls: total orders, sales over the last 30 days, and product count.
 */

const API_VERSION = '2024-10'

function shopHost(raw: string): string {
  const s = (raw ?? '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!s) throw new Error('Shop domain required (e.g. my-store.myshopify.com)')
  return s.includes('.') ? s : `${s}.myshopify.com`
}

async function shopifyGet<T = any>(shop: string, token: string, path: string): Promise<T> {
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}${path}`, {
    headers: { 'X-Shopify-Access-Token': token, Accept: 'application/json' },
    cache: 'no-store',
  })
  if (res.status === 401 || res.status === 403) throw new Error('Shopify rejected the token. Re-check the Admin API access token + scopes.')
  if (res.status === 404) throw new Error('Shop not found. Check the store domain.')
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Shopify ${path} → ${res.status}: ${body.slice(0, 160)}`)
  }
  return res.json() as Promise<T>
}

export const shopifyConnector: ConnectorDef = {
  id: 'shopify',
  label: 'Shopify',
  blurb: 'Orders, sales, and product count from your Shopify store.',
  authType: 'api_key',
  requiredEnv: [],

  apiKey: {
    fields: [
      { key: 'shop', label: 'Store domain', placeholder: 'my-store.myshopify.com' },
      { key: 'token', label: 'Admin API token', placeholder: 'shpat_…', secret: true },
    ],
    async verify(creds) {
      const shop = shopHost(creds.shop)
      const token = (creds.token ?? '').trim()
      if (!token) throw new Error('Admin API access token required')
      const data = await shopifyGet<{ shop?: { name?: string; myshopify_domain?: string } }>(shop, token, '/shop.json')
      return { accountLabel: data.shop?.name || data.shop?.myshopify_domain || shop }
    },
  },

  async sync({ credentials }) {
    const shop = shopHost(String(credentials.shop ?? ''))
    const token = String(credentials.token ?? '')
    if (!token) throw new Error('Shopify token missing')

    const metrics: SyncedMetric[] = []
    let accountLabel: string | undefined

    const shopInfo = await shopifyGet<{ shop?: { name?: string; currency?: string } }>(shop, token, '/shop.json').catch(() => null)
    const currency = shopInfo?.shop?.currency
    if (shopInfo?.shop?.name) accountLabel = shopInfo.shop.name
    const unit = currency === 'USD' || currency === 'CAD' || currency === 'AUD' ? '$' : currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : currency ?? ''

    const orderCount = await shopifyGet<{ count?: number }>(shop, token, '/orders/count.json?status=any').catch(() => null)
    if (orderCount?.count != null) {
      metrics.push({ metric: 'orders', label: 'Total orders', value: orderCount.count, unit: '', period: 'lifetime' })
    }

    const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
    const recent = await shopifyGet<{ orders?: Array<{ total_price?: string }> }>(
      shop,
      token,
      `/orders.json?status=any&created_at_min=${encodeURIComponent(since)}&fields=total_price&limit=250`,
    ).catch(() => null)
    if (recent?.orders) {
      const sales = recent.orders.reduce((a, o) => a + (parseFloat(o.total_price ?? '0') || 0), 0)
      metrics.push({ metric: 'sales_30d', label: 'Sales (30d)', value: round2(sales), unit, period: 'month' })
      metrics.push({ metric: 'orders_30d', label: 'Orders (30d)', value: recent.orders.length, unit: '', period: 'month' })
    }

    const productCount = await shopifyGet<{ count?: number }>(shop, token, '/products/count.json').catch(() => null)
    if (productCount?.count != null) {
      metrics.push({ metric: 'products', label: 'Products', value: productCount.count, unit: '', period: 'snapshot' })
    }

    return { accountLabel, metrics }
  },
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
