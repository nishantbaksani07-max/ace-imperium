import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
// Uses Anthropic's server-side web_fetch tool (Anthropic fetches the page, not
// us — so no SSRF surface here). Fetching adds latency; give it room.
export const maxDuration = 60

/*
 * Brand business — auto-pull metrics from a public URL.
 *
 * Sibling to /api/brand/insight. Where insight returns a prose "read", this
 * returns STRUCTURED metrics to auto-fill the business cards: Claude reads the
 * PUBLIC page at the pasted URL via the server-side web_fetch tool and extracts
 * any numbers actually present (revenue, MRR, users, followers, products,
 * price, etc.). Anything behind a login (a Stripe/PostHog dashboard) cannot be
 * read and is returned empty — that's what API connectors are for.
 *
 * Raw Anthropic REST (no SDK), ANTHROPIC_API_KEY server-side only, auth required.
 */

const REQUIRE_PRO = false // mirror /api/brand/insight's dogfood stance
const MODEL = 'claude-opus-4-8' // web_fetch needs a 4.x/Fable model (not Haiku)

interface AnthropicBlock { type: string; text?: string }
interface AnthropicResponse {
  content?: AnthropicBlock[]
  stop_reason?: string
  error?: { message?: string }
}

export interface PulledMetric { label: string; value: number; unit?: string }

const SYSTEM_PROMPT = `You read a small business's PUBLIC web page and extract the hard numbers from it.

USING web_fetch
- Fetch the given URL with the web_fetch tool. Read what is actually on the page.
- Never try to log in. If the URL is an admin dashboard, a private sheet, or returns a login wall, do NOT guess its numbers. Return an empty metrics list and say so in the summary.
- Only the one URL given. Be fast.

WHAT TO EXTRACT
- Concrete business metrics that appear on the page: revenue, MRR/ARR, price, number of products/listings, customers/users, followers, reviews/ratings count, downloads, etc.
- Use the page's own currency/unit. Numbers must be real values you saw, not estimates. If a number is a range or "10k+", use the round number (10000).

OUTPUT — STRICT JSON, nothing else
Return ONLY a JSON object, no prose outside it, no markdown code fence:
{"summary": "<=20 words on what the page is and what you found", "metrics": [{"label": "Price", "value": 29, "unit": "USD"}, ...]}
- At most 8 metrics. label short (<=24 chars). value a plain number (no commas/symbols). unit short or omitted.
- If you found nothing usable (login wall, no numbers), return {"summary": "...", "metrics": []}.`

/** Tolerantly pull the JSON object out of the model's final text. */
function parseResult(text: string): { summary: string; metrics: PulledMetric[] } {
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start >= 0 && end > start) t = t.slice(start, end + 1)
  const obj = JSON.parse(t) as { summary?: unknown; metrics?: unknown }
  const metrics: PulledMetric[] = []
  if (Array.isArray(obj.metrics)) {
    for (const m of obj.metrics as unknown[]) {
      const r = (m ?? {}) as Record<string, unknown>
      const value = Number(r.value)
      const label = typeof r.label === 'string' ? r.label.trim().slice(0, 24) : ''
      if (!label || !Number.isFinite(value)) continue
      const metric: PulledMetric = { label, value }
      if (typeof r.unit === 'string' && r.unit.trim()) metric.unit = r.unit.trim().slice(0, 12)
      metrics.push(metric)
      if (metrics.length >= 8) break
    }
  }
  return { summary: typeof obj.summary === 'string' ? obj.summary.trim() : '', metrics }
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Metric pull is not configured on the server' }, { status: 500 })
  }

  if (REQUIRE_PRO) {
    const { data: profile } = await supabase.from('profiles').select('tier').eq('id', user.id).single()
    if (profile?.tier !== 'pro') return NextResponse.json({ error: 'requires_pro' }, { status: 402 })
  }

  const payload = (await request.json().catch(() => null)) as { url?: string } | null
  const rawUrl = (payload?.url ?? '').trim()
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : rawUrl ? `https://${rawUrl}` : ''
  if (!url) return NextResponse.json({ error: 'missing_url' }, { status: 400 })
  try {
    const host = new URL(url).hostname
    // Don't let it point at internal hosts even though web_fetch runs at
    // Anthropic; keep our intent explicit.
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/i.test(host)) {
      return NextResponse.json({ error: 'invalid_url' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'invalid_url' }, { status: 400 })
  }

  try {
    const messages: Array<{ role: string; content: unknown }> = [
      { role: 'user', content: `Read this page and extract its public business metrics as JSON:\n${url}` },
    ]
    let final: AnthropicResponse | null = null

    for (let i = 0; i < 4; i++) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1200,
          system: SYSTEM_PROMPT,
          tools: [{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3 }],
          messages,
        }),
      })
      const rawText = await res.text()
      let data: AnthropicResponse
      try {
        data = JSON.parse(rawText) as AnthropicResponse
      } catch {
        return NextResponse.json({ error: `Anthropic returned non-JSON: ${rawText.slice(0, 160)}` }, { status: 502 })
      }
      if (!res.ok) {
        console.error('[brand/pull-metrics] Anthropic error:', res.status, data?.error?.message)
        return NextResponse.json({ error: data?.error?.message || `Anthropic ${res.status}` }, { status: 502 })
      }
      final = data
      if (data.stop_reason === 'pause_turn' && Array.isArray(data.content)) {
        messages.push({ role: 'assistant', content: data.content })
        continue
      }
      break
    }

    const text = (final?.content ?? [])
      .filter(b => b.type === 'text' && typeof b.text === 'string')
      .map(b => (b.text as string))
      .join('\n')
      .trim()

    if (!text) return NextResponse.json({ error: 'Could not read that page. Try again.' }, { status: 502 })

    try {
      const result = parseResult(text)
      return NextResponse.json({ url, ...result })
    } catch {
      return NextResponse.json({ error: 'Could not parse metrics from that page.' }, { status: 502 })
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'pull_failed'
    console.error('[brand/pull-metrics]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
