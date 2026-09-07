import 'server-only'

import type { ConnectorDef, SyncedMetric } from '../types'

/**
 * Plausible Analytics connector — API key. Pairs with the Website connector to
 * add real traffic numbers (privacy-friendly analytics, no cookie banner).
 *
 * The user makes an API key in Plausible → Settings → API keys, and gives the
 * site domain. Self-hosted instances can override the host. Pulls last-30-day
 * visitors, pageviews, bounce rate, and visit duration.
 */

async function aggregate(host: string, siteId: string, token: string, metrics: string): Promise<Record<string, { value: number }>> {
  const url = `${host.replace(/\/$/, '')}/api/v1/stats/aggregate?site_id=${encodeURIComponent(siteId)}&period=30d&metrics=${metrics}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
  if (res.status === 401) throw new Error('Plausible rejected the API key.')
  if (res.status === 404) throw new Error('Plausible site not found. Check the site domain.')
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Plausible → ${res.status}: ${body.slice(0, 160)}`)
  }
  const json = (await res.json()) as { results?: Record<string, { value: number }> }
  return json.results ?? {}
}

function host(creds: Record<string, unknown>): string {
  return String(creds.host || process.env.PLAUSIBLE_HOST || 'https://plausible.io')
}

export const plausibleConnector: ConnectorDef = {
  id: 'plausible',
  label: 'Plausible',
  blurb: 'Visitors, pageviews, and bounce rate from Plausible Analytics.',
  authType: 'api_key',
  requiredEnv: [],

  apiKey: {
    fields: [
      { key: 'siteId', label: 'Site domain', placeholder: 'your-site.com' },
      { key: 'token', label: 'API key', placeholder: 'plausible API key', secret: true },
      { key: 'host', label: 'Host (self-hosted only)', placeholder: 'https://plausible.io', optional: true },
    ],
    async verify(creds) {
      const siteId = (creds.siteId ?? '').trim()
      const token = (creds.token ?? '').trim()
      if (!siteId || !token) throw new Error('Site domain + API key required')
      await aggregate(host(creds), siteId, token, 'visitors')
      return { accountLabel: siteId }
    },
  },

  async sync({ credentials }) {
    const siteId = String(credentials.siteId ?? '')
    const token = String(credentials.token ?? '')
    if (!siteId || !token) throw new Error('Plausible credentials missing')

    const r = await aggregate(host(credentials), siteId, token, 'visitors,pageviews,bounce_rate,visit_duration')
    const metrics: SyncedMetric[] = []
    if (r.visitors) metrics.push({ metric: 'visitors_30d', label: 'Visitors (30d)', value: r.visitors.value, unit: '', period: 'month' })
    if (r.pageviews) metrics.push({ metric: 'pageviews_30d', label: 'Pageviews (30d)', value: r.pageviews.value, unit: '', period: 'month' })
    if (r.bounce_rate) metrics.push({ metric: 'bounce_rate', label: 'Bounce rate', value: r.bounce_rate.value, unit: '%', period: 'month' })
    if (r.visit_duration) metrics.push({ metric: 'visit_duration', label: 'Avg visit', value: r.visit_duration.value, unit: 's', period: 'month' })

    return { accountLabel: siteId, metrics }
  },
}
