import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
// Higher than the mentor's 30s: this call uses the server-side web_fetch tool,
// so Anthropic fetches the user's public links before answering, which adds
// latency. Vercel clamps to the plan ceiling if this is higher than allowed.
export const maxDuration = 60

/*
 * Brand business mentor — the AI read on a single venture.
 *
 * Accepts a compact BrandIn payload (the brand module stores state in
 * localStorage, so the server can't read it; the client sends it). Calls
 * Claude with the server-side `web_fetch` tool so it can READ the public pages
 * the user has linked (marketing site, storefront, public listing/profile),
 * reasons over the tracked KPIs + cadence, and returns one short business read.
 *
 * Mirrors the mentor proxy (app/api/mentor/chat): raw Anthropic REST call (no
 * SDK dependency), ANTHROPIC_API_KEY server-side only, auth required.
 */

// Dogfood flag. Flip true to gate to pro (CLAUDE.md rule 5). The mentor (Vee)
// ships ungated today so the team can dogfood AI before enforcing tier; this
// sibling feature follows the same stance. When enabled, a non-pro user gets a
// 402 and the client shows the upsell.
const REQUIRE_PRO = false

// web_fetch + dynamic filtering needs a model that supports the _20260209 web
// tools (Opus 4.8 / 4.7 / 4.6, Sonnet 4.6, Fable 5 — NOT Haiku, which the chat
// mentor uses). Opus 4.8 is the quality default for this on-demand pro read;
// swap to claude-sonnet-4-6 here to cut cost.
const MODEL = 'claude-opus-4-8'

interface KpiIn { label: string; value: number; unit?: string; target?: number; delta7?: number | null }
interface LinkIn { label: string; url: string }
interface ScheduleIn { label: string; target: number; unit: string; period: string }
interface BrandIn {
  name?: string
  archetype?: string
  blurb?: string
  kpis?: KpiIn[]
  links?: LinkIn[]
  schedules?: ScheduleIn[]
}

interface AnthropicBlock { type: string; text?: string }
interface AnthropicResponse {
  content?: AnthropicBlock[]
  stop_reason?: string
  error?: { message?: string }
}

const SYSTEM_PROMPT = `You are the business mentor inside Vitality's Brand module. The user runs a small venture: a creator channel, a shop, a service, an indie product, or a local business. You have their tracked metrics and goals, and you can read the public web pages they have linked.

Your job: give one sharp, useful read of how the business is doing and the single best next move. Practical and specific, never generic startup advice.

USING THE LINKS
- Use the web_fetch tool to read the PUBLIC pages they linked: a marketing site, a storefront, a public listing, a public social profile. Pull at least one concrete observation from what you actually read.
- Never try to log in. If a link is an admin dashboard, a private sheet, or returns a login wall, skip it silently. Never invent what a page says.
- Fetch only the few most useful links. Be fast.

VOICE
- Warm, calm, plain. Short sentences. No emoji. Never use em dashes or en dashes; use periods or "and".
- Never flatter, never shame. Name the smallest next move.

RESPONSE FORMAT (the UI renders this as a card, not an essay)
- Hard cap about 80 words.
- One short lead line: the single most important takeaway.
- Then 2 to 4 bullets, each starting with "- ", each a single tight clause.
- Bold exactly one load-bearing phrase per line with **double asterisks**: a number, a metric, or a verb to act on. Use their real numbers when you can.
- Plain text, "- " bullets, and **bold** only. No headers, no tables, no code, no emoji.`

/** Strip em/en dashes (the "reads like ChatGPT" tell — house rule). */
function noDashes(s: string): string {
  return s.replace(/\s*[—–]\s*/g, ', ')
}

function fmtKpi(k: KpiIn): string {
  const unit = (k.unit ?? '').trim()
  const n = Number.isFinite(k.value) ? k.value.toLocaleString() : '—'
  let main: string
  if (!unit) main = n
  else if (/^[$£€¥]/.test(unit)) main = `${unit}${n}`
  else if (unit === '%') main = `${n}%`
  else if (unit.startsWith('/')) main = `${n}${unit}`
  else main = `${n} ${unit}`
  const bits = [main]
  if (typeof k.target === 'number') bits.push(`goal ${k.target.toLocaleString()}`)
  if (typeof k.delta7 === 'number' && k.delta7 !== 0) {
    bits.push(`${k.delta7 > 0 ? '+' : ''}${k.delta7.toLocaleString()} over 7d`)
  }
  return `${k.label}: ${bits.join(', ')}`
}

function buildUserContent(brand: BrandIn): string {
  const lines: string[] = []
  lines.push(`Brand: ${brand.name || 'Untitled'} (${brand.archetype || 'other'})`)
  if (brand.blurb && brand.blurb.trim()) lines.push(brand.blurb.trim())

  const schedules = (brand.schedules ?? []).slice(0, 8)
  if (schedules.length > 0) {
    lines.push('\nGoals & cadence:')
    for (const s of schedules) {
      lines.push(`- ${s.label}: target ${s.target} ${s.unit} per ${s.period}`)
    }
  }

  const kpis = (brand.kpis ?? []).slice(0, 12)
  if (kpis.length > 0) {
    lines.push('\nTracked metrics:')
    for (const k of kpis) lines.push(`- ${fmtKpi(k)}`)
  }

  const links = (brand.links ?? []).filter(l => /^https?:\/\//i.test(l.url)).slice(0, 5)
  if (links.length > 0) {
    lines.push('\nLinks to consider (fetch the public ones, skip dashboards and logins):')
    for (const l of links) lines.push(`- ${l.label || 'Link'}: ${l.url}`)
  } else {
    lines.push('\nNo public links provided, so reason from the metrics and cadence alone.')
  }

  lines.push('\nRead the public links, then give your business read in the required format.')
  return lines.join('\n')
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Business mentor is not configured on the server' }, { status: 500 })
  }

  if (REQUIRE_PRO) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('tier')
      .eq('id', user.id)
      .single()
    if (profile?.tier !== 'pro') {
      return NextResponse.json({ error: 'requires_pro' }, { status: 402 })
    }
  }

  const payload = await request.json().catch(() => null) as { brand?: BrandIn } | null
  const brand = payload?.brand
  if (!brand || typeof brand !== 'object') {
    return NextResponse.json({ error: 'missing_brand' }, { status: 400 })
  }

  const userContent = buildUserContent(brand)

  try {
    // Single agentic turn with the server-side web_fetch tool. Server-side
    // tools can pause (stop_reason: "pause_turn") when the internal loop hits
    // its iteration cap; re-send the assistant turn to resume (no extra user
    // message — the API resumes off the trailing tool block).
    const messages: Array<{ role: string; content: unknown }> = [
      { role: 'user', content: userContent },
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
          max_tokens: 1500,
          system: SYSTEM_PROMPT,
          tools: [{ type: 'web_fetch_20260209', name: 'web_fetch' }],
          messages,
        }),
      })

      const rawText = await res.text()
      let data: AnthropicResponse
      try {
        data = JSON.parse(rawText) as AnthropicResponse
      } catch {
        return NextResponse.json({ error: `Anthropic returned non-JSON: ${rawText.slice(0, 200)}` }, { status: 502 })
      }
      if (!res.ok) {
        console.error('[brand/insight] Anthropic error:', res.status, data?.error?.message)
        return NextResponse.json({ error: data?.error?.message || `Anthropic ${res.status}` }, { status: 502 })
      }

      final = data
      if (data.stop_reason === 'pause_turn' && Array.isArray(data.content)) {
        messages.push({ role: 'assistant', content: data.content })
        continue
      }
      break
    }

    const read = noDashes(
      (final?.content ?? [])
        .filter(b => b.type === 'text' && typeof b.text === 'string')
        .map(b => (b.text as string).trim())
        .filter(Boolean)
        .join('\n')
        .trim()
    )

    if (!read) {
      return NextResponse.json({ error: 'The mentor could not complete a read. Try again.' }, { status: 502 })
    }
    return NextResponse.json({ read })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'insight_failed'
    console.error('[brand/insight]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
