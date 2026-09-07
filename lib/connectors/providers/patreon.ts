import 'server-only'

import type { ConnectorDef, OAuthTokens, SyncedMetric } from '../types'

/**
 * Patreon connector — OAuth. Pulls the creator's campaign: patron count + total
 * monthly pledge sum (cents). Admin sets PATREON_CLIENT_ID + PATREON_CLIENT_SECRET
 * (Patreon → My account → API/clients). Redirect: <app>/api/connectors/patreon/callback.
 */

const SCOPES = 'identity campaigns'
const AUTH_URL = 'https://www.patreon.com/oauth2/authorize'
const TOKEN_URL = 'https://www.patreon.com/api/oauth2/token'

async function tokenRequest(extra: Record<string, string>): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    client_id: process.env.PATREON_CLIENT_ID!,
    client_secret: process.env.PATREON_CLIENT_SECRET!,
    ...extra,
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Patreon token request failed (${res.status}): ${text.slice(0, 200)}`)
  }
  const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string }
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresInSeconds: json.expires_in, scope: json.scope }
}

export const patreonConnector: ConnectorDef = {
  id: 'patreon',
  label: 'Patreon',
  blurb: 'Patron count and monthly pledge total from your Patreon campaign.',
  authType: 'oauth',
  requiredEnv: ['PATREON_CLIENT_ID', 'PATREON_CLIENT_SECRET'],

  oauth: {
    scopes: SCOPES,
    buildAuthUrl(state, redirectUri) {
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: process.env.PATREON_CLIENT_ID!,
        redirect_uri: redirectUri,
        scope: SCOPES,
        state,
      })
      return `${AUTH_URL}?${params.toString()}`
    },
    exchangeCode(code, redirectUri) {
      return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
    },
    refresh(refreshToken) {
      return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken })
    },
  },

  async sync({ credentials }) {
    const token = String(credentials.accessToken ?? '')
    if (!token) throw new Error('Patreon token missing')

    // Campaign + its tiers in one call. The campaign id is returned as
    // `externalId` so the webhook route can map inbound events to this connection.
    // Campaign + its tiers in one call. NOTE: Patreon v2 dropped the campaign
    // `pledge_sum` field, so we compute monthly revenue from the tiers instead
    // (Σ tier.amount_cents × tier.patron_count). The campaign id is returned as
    // `externalId` so the webhook route can map inbound events to this connection.
    const url =
      'https://www.patreon.com/api/oauth2/v2/campaigns' +
      '?include=tiers' +
      '&fields%5Bcampaign%5D=patron_count,creation_name' +
      '&fields%5Btier%5D=title,amount_cents,patron_count,published'
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Patreon campaigns → ${res.status}: ${text.slice(0, 160)}`)
    }
    const data = (await res.json()) as {
      data?: Array<{ id?: string; attributes?: { patron_count?: number; creation_name?: string } }>
      included?: Array<{ id?: string; type?: string; attributes?: { title?: string; amount_cents?: number; patron_count?: number; published?: boolean } }>
    }

    const campaign = data.data?.[0]
    const attr = campaign?.attributes ?? {}
    const metrics: SyncedMetric[] = []

    const tiers = (data.included ?? [])
      .filter((i) => i.type === 'tier')
      .map((i) => ({
        id: i.id ?? '',
        title: i.attributes?.title ?? 'Tier',
        amountCents: i.attributes?.amount_cents ?? 0,
        patrons: i.attributes?.patron_count ?? 0,
        published: !!i.attributes?.published,
      }))

    const patrons = attr.patron_count
    const pledgeCents = tiers.reduce((s, t) => s + t.amountCents * t.patrons, 0)
    const paidPatrons = tiers.reduce((s, t) => s + (t.amountCents > 0 ? t.patrons : 0), 0)
    const pledge = pledgeCents / 100

    if (typeof patrons === 'number') metrics.push({ metric: 'patrons', label: 'Patrons', value: patrons, unit: '', period: 'snapshot' })
    if (paidPatrons > 0) metrics.push({ metric: 'paid_patrons', label: 'Paying patrons', value: paidPatrons, unit: '', period: 'snapshot' })
    // Gross pledged (tier price × patrons). Patreon's API no longer exposes net
    // earnings, which run ~15-30% lower after platform + processing fees — so we
    // label this "gross" to avoid it reading as take-home.
    if (pledgeCents > 0) metrics.push({ metric: 'pledge_sum', label: 'Pledged / mo (gross)', value: Math.round(pledge * 100) / 100, unit: '$', period: 'month' })
    if (paidPatrons > 0 && pledgeCents > 0) {
      metrics.push({ metric: 'avg_pledge', label: 'Avg / paying patron', value: Math.round((pledgeCents / paidPatrons)) / 100, unit: '$', period: 'month' })
    }

    // Per-tier patron breakdown for published tiers (largest 6 so many tiers
    // can't bloat brand_metrics).
    const shown = tiers.filter((t) => t.published).sort((a, b) => b.patrons - a.patrons)
    if (shown.length) {
      metrics.push({ metric: 'tier_count', label: 'Active tiers', value: shown.length, unit: '', period: 'snapshot' })
      for (const t of shown.slice(0, 6)) {
        metrics.push({ metric: `tier:${t.id}`, label: `Tier · ${t.title}`, value: t.patrons, unit: '', period: 'snapshot' })
      }
    }

    return {
      metrics,
      ...(campaign?.id ? { externalId: campaign.id } : {}),
      ...(attr.creation_name ? { accountLabel: attr.creation_name } : {}),
    }
  },
}
