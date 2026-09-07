import 'server-only'

import type { ConnectorDef, OAuthTokens, SyncedMetric } from '../types'

/**
 * Amazon Selling Partner connector — OAuth via Login with Amazon (LWA).
 *
 * The seller authorizes the app from Seller Central; we exchange the returned
 * `spapi_oauth_code` for an LWA refresh token, then mint short-lived access
 * tokens for SP-API calls. Since late 2023 SP-API no longer requires AWS SigV4
 * signing — the LWA access token in the `x-amz-access-token` header is enough —
 * so a plain fetch works.
 *
 * Admin sets up an SP-API app (developer registration) and configures:
 *   AMAZON_LWA_CLIENT_ID, AMAZON_LWA_CLIENT_SECRET, AMAZON_APP_ID,
 *   and optionally AMAZON_SPAPI_HOST (default NA) + AMAZON_MARKETPLACE_ID (default US).
 * Redirect URI: <app>/api/connectors/amazon/callback.
 *
 * NOTE: SP-API access is gated behind Amazon's developer-app approval. The flow
 * here is correct against the documented endpoints, but is unverifiable without
 * an approved app + a seller account — treat as needs-real-credentials.
 */

const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token'
const CONSENT_URL = 'https://sellercentral.amazon.com/apps/authorize/consent'

function spapiHost(): string {
  return process.env.AMAZON_SPAPI_HOST || 'https://sellingpartnerapi-na.amazon.com'
}
function marketplaceId(): string {
  return process.env.AMAZON_MARKETPLACE_ID || 'ATVPDKIKX0DER' // US
}

async function lwaTokenRequest(extra: Record<string, string>): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    client_id: process.env.AMAZON_LWA_CLIENT_ID!,
    client_secret: process.env.AMAZON_LWA_CLIENT_SECRET!,
    ...extra,
  })
  const res = await fetch(LWA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Amazon LWA token request failed (${res.status}): ${text.slice(0, 200)}`)
  }
  const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number }
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresInSeconds: json.expires_in }
}

export const amazonConnector: ConnectorDef = {
  id: 'amazon',
  label: 'Amazon',
  blurb: 'Orders and sales from your Amazon Selling Partner (SP-API) account.',
  authType: 'oauth',
  requiredEnv: ['AMAZON_LWA_CLIENT_ID', 'AMAZON_LWA_CLIENT_SECRET', 'AMAZON_APP_ID'],

  oauth: {
    scopes: '',
    buildAuthUrl(state, redirectUri) {
      const params = new URLSearchParams({
        application_id: process.env.AMAZON_APP_ID!,
        state,
        redirect_uri: redirectUri,
        version: 'beta',
      })
      return `${CONSENT_URL}?${params.toString()}`
    },
    exchangeCode(code, redirectUri) {
      return lwaTokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
    },
    refresh(refreshToken) {
      return lwaTokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken })
    },
  },

  async sync({ credentials }) {
    const token = String(credentials.accessToken ?? '')
    if (!token) throw new Error('Amazon token missing')

    const metrics: SyncedMetric[] = []
    const createdAfter = new Date(Date.now() - 30 * 86_400_000).toISOString()
    const url = new URL(`${spapiHost()}/orders/v0/orders`)
    url.searchParams.set('MarketplaceIds', marketplaceId())
    url.searchParams.set('CreatedAfter', createdAfter)

    const res = await fetch(url.toString(), {
      headers: { 'x-amz-access-token': token, Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Amazon SP-API orders → ${res.status}: ${text.slice(0, 160)}`)
    }
    const data = (await res.json()) as {
      payload?: { Orders?: Array<{ OrderTotal?: { Amount?: string; CurrencyCode?: string } }> }
    }
    const orders = data.payload?.Orders ?? []
    let sales = 0
    let cur = 'USD'
    for (const o of orders) {
      const amt = parseFloat(o.OrderTotal?.Amount ?? '0')
      if (Number.isFinite(amt)) sales += amt
      if (o.OrderTotal?.CurrencyCode) cur = o.OrderTotal.CurrencyCode
    }
    const unit = cur === 'USD' || cur === 'CAD' ? '$' : cur === 'GBP' ? '£' : cur === 'EUR' ? '€' : cur
    metrics.push({ metric: 'orders_30d', label: 'Orders (30d)', value: orders.length, unit: '', period: 'month' })
    metrics.push({ metric: 'sales_30d', label: 'Sales (30d)', value: Math.round(sales * 100) / 100, unit, period: 'month' })

    return { metrics }
  },
}
