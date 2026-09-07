import 'server-only'

import type { ConnectorDef, SyncedMetric } from '../types'

/**
 * Stripe connector — API key (a RESTRICTED, read-only key: `rk_live_…`).
 *
 * The user creates the key in Stripe → Developers → API keys → "Create
 * restricted key" with read access to Balance, Charges, and Subscriptions, and
 * pastes it once. We never need the secret `sk_` key. All calls are server-side
 * (CLAUDE.md #4). No admin env needed — the credential is the user's own key.
 *
 * Pulls: available balance, gross revenue over the last 30 days, MRR (from
 * active subscriptions), and active-subscriber count.
 */

const API = 'https://api.stripe.com/v1'

async function stripeGet<T = any>(key: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store',
  })
  if (res.status === 401) throw new Error('Stripe rejected the key. Check it’s a valid live restricted key.')
  if (res.status === 403) throw new Error('That key lacks read permission for this data. Grant Balance + Charges + Subscriptions read.')
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Stripe ${path} → ${res.status}: ${body.slice(0, 160)}`)
  }
  return res.json() as Promise<T>
}

function currencyUnit(code: string | undefined): string {
  const c = (code ?? 'usd').toLowerCase()
  if (c === 'usd' || c === 'cad' || c === 'aud') return '$'
  if (c === 'gbp') return '£'
  if (c === 'eur') return '€'
  return code ? code.toUpperCase() : ''
}

/** Normalize a recurring price to a monthly figure (minor units). */
function toMonthly(unitAmount: number, interval: string, intervalCount: number, quantity: number): number {
  const perPeriod = unitAmount * Math.max(1, quantity)
  const n = Math.max(1, intervalCount)
  switch (interval) {
    case 'day': return (perPeriod / n) * (365 / 12)
    case 'week': return (perPeriod / n) * (52 / 12)
    case 'month': return perPeriod / n
    case 'year': return perPeriod / (n * 12)
    default: return perPeriod
  }
}

export const stripeConnector: ConnectorDef = {
  id: 'stripe',
  label: 'Stripe',
  blurb: 'Revenue, MRR, and active subscribers from your Stripe account.',
  authType: 'api_key',
  requiredEnv: [],

  apiKey: {
    fields: [
      { key: 'secretKey', label: 'Restricted key', placeholder: 'rk_live_…', secret: true },
    ],
    async verify(creds) {
      const key = (creds.secretKey ?? '').trim()
      if (!/^(rk|sk)_(live|test)_/.test(key)) {
        throw new Error('That doesn’t look like a Stripe key (expected rk_live_…).')
      }
      const account = await stripeGet<{ id: string; business_profile?: { name?: string }; settings?: { dashboard?: { display_name?: string } } }>(key, '/account')
      const label = account.settings?.dashboard?.display_name || account.business_profile?.name || account.id
      return { accountLabel: label }
    },
  },

  async sync({ credentials }) {
    const key = String(credentials.secretKey ?? '')
    if (!key) throw new Error('Stripe key missing')

    const metrics: SyncedMetric[] = []
    let accountLabel: string | undefined

    const account = await stripeGet<{ id: string; settings?: { dashboard?: { display_name?: string } } }>(key, '/account').catch(() => null)
    if (account) accountLabel = account.settings?.dashboard?.display_name || account.id

    // Available balance (sum across currencies; label by the first currency).
    const balance = await stripeGet<{ available?: Array<{ amount: number; currency: string }> }>(key, '/balance').catch(() => null)
    if (balance?.available?.length) {
      const cur = balance.available[0].currency
      const total = balance.available.reduce((a, b) => a + (b.amount ?? 0), 0)
      metrics.push({ metric: 'balance', label: 'Available balance', value: round2(total / 100), unit: currencyUnit(cur), period: 'snapshot' })
    }

    // Gross revenue over the last 30 days (first 100 charges — capped; noted).
    const since = Math.floor((Date.now() - 30 * 86_400_000) / 1000)
    const charges = await stripeGet<{ data?: Array<{ amount: number; currency: string; paid: boolean; refunded: boolean; amount_refunded: number }> }>(
      key,
      `/charges?limit=100&created[gte]=${since}`,
    ).catch(() => null)
    if (charges?.data) {
      let gross = 0
      let cur = 'usd'
      for (const c of charges.data) {
        if (c.paid && !c.refunded) {
          gross += (c.amount ?? 0) - (c.amount_refunded ?? 0)
          cur = c.currency || cur
        }
      }
      metrics.push({ metric: 'revenue_30d', label: 'Revenue (30d)', value: round2(gross / 100), unit: currencyUnit(cur), period: 'month' })
    }

    // MRR + active subscribers from active subscriptions (first 100).
    const subs = await stripeGet<{
      data?: Array<{ items?: { data?: Array<{ quantity?: number; price?: { unit_amount?: number; currency?: string; recurring?: { interval: string; interval_count?: number } } }> } }>
    }>(key, '/subscriptions?status=active&limit=100').catch(() => null)
    if (subs?.data) {
      let mrr = 0
      let cur = 'usd'
      for (const s of subs.data) {
        for (const it of s.items?.data ?? []) {
          const p = it.price
          if (!p?.unit_amount || !p.recurring) continue
          cur = p.currency || cur
          mrr += toMonthly(p.unit_amount, p.recurring.interval, p.recurring.interval_count ?? 1, it.quantity ?? 1)
        }
      }
      metrics.push({ metric: 'mrr', label: 'MRR', value: round2(mrr / 100), unit: currencyUnit(cur), period: 'month' })
      metrics.push({ metric: 'subscribers', label: 'Active subscribers', value: subs.data.length, unit: '', period: 'snapshot' })
    }

    return { accountLabel, metrics }
  },
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
