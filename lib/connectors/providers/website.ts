import 'server-only'

import type { ConnectorDef, SyncedMetric } from '../types'

/**
 * Website connector — no auth. The user pastes a public URL (their store,
 * portfolio, landing page). On sync we do a server-side health check: is it up,
 * and how fast does it respond. Lightweight by design — richer site analytics
 * (Plausible / GA / Fathom API) is a later add behind their own keys.
 *
 * This also gives the AI business mentor a canonical URL to read (it already
 * uses web_fetch on the brand's links), so "website" doubles as the place to
 * register the brand's homepage.
 */

function normalizeUrl(raw: string): string {
  const s = (raw ?? '').trim()
  if (!s) throw new Error('URL required')
  return /^https?:\/\//i.test(s) ? s : `https://${s}`
}

async function probe(url: string): Promise<{ ok: boolean; status: number; ms: number; title?: string }> {
  const startedAt = Date.now()
  const res = await fetch(url, {
    headers: { 'User-Agent': 'VitalityBot/1.0 (+https://vitality.app)' },
    redirect: 'follow',
    cache: 'no-store',
  })
  const ms = Date.now() - startedAt
  let title: string | undefined
  try {
    const html = await res.text()
    title = html.match(/<title[^>]*>([^<]{1,120})<\/title>/i)?.[1]?.trim()
  } catch {
    /* body read is best-effort */
  }
  return { ok: res.ok, status: res.status, ms, title }
}

export const websiteConnector: ConnectorDef = {
  id: 'website',
  label: 'Website',
  blurb: 'Register your site for uptime + response checks (and AI reads it).',
  authType: 'api_key',
  requiredEnv: [],

  apiKey: {
    fields: [{ key: 'url', label: 'Website URL', placeholder: 'https://your-site.com' }],
    async verify(creds) {
      const url = normalizeUrl(creds.url)
      const r = await probe(url)
      if (!r.ok && r.status >= 400) throw new Error(`Site returned ${r.status}. Check the URL.`)
      return { accountLabel: r.title || new URL(url).hostname }
    },
  },

  async sync({ credentials }) {
    const url = normalizeUrl(String(credentials.url ?? ''))
    const r = await probe(url)
    const metrics: SyncedMetric[] = [
      { metric: 'status_ok', label: 'Up', value: r.ok ? 1 : 0, unit: '', period: 'snapshot' },
      { metric: 'response_ms', label: 'Response time', value: r.ms, unit: 'ms', period: 'snapshot' },
    ]
    return { accountLabel: r.title || new URL(url).hostname, metrics }
  },
}
