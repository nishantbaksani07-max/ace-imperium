import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
// Conversational sibling of /api/brand/insight. Uses the server-side web_fetch
// tool so the mentor can read the user's public links mid-answer; that adds
// latency, so give it the same headroom as insight. Vercel clamps to the plan
// ceiling if this is higher than allowed.
export const maxDuration = 60

/*
 * Brand business mentor — ASK. Where /api/brand/insight returns a one-shot
 * formatted "read", this is a back-and-forth: the user asks a real question
 * ("should I raise my price?", "what's my best growth lever?", "is this listing
 * any good?") and gets a direct, conversational answer grounded in their tracked
 * numbers, cadence, and public links.
 *
 * Accepts the same compact BrandIn snapshot insight uses (the brand module lives
 * in localStorage, so the client sends it), plus the question and the running
 * chat history. Raw Anthropic REST, ANTHROPIC_API_KEY server-side only, auth
 * required.
 */

// Dogfood flag — mirror /api/brand/insight. Flip true to gate to pro (CLAUDE.md
// rule 5); a non-pro user then gets a 402 and the client shows the upsell.
const REQUIRE_PRO = false

// web_fetch needs a model that supports the _20260209 web tools (Opus 4.8 / 4.7
// / 4.6, Sonnet 4.6, Fable 5 — NOT Haiku). Opus 4.8 is the quality default;
// swap to claude-sonnet-4-6 to cut cost.
const MODEL = 'claude-opus-4-8'

// Bound the running thread we accept from the client so a long session can't
// blow the context. Keep the most recent turns.
const MAX_HISTORY_TURNS = 12

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
interface Turn { role: 'user' | 'assistant'; content: string }

interface AnthropicBlock { type: string; text?: string }
interface AnthropicResponse {
  content?: AnthropicBlock[]
  stop_reason?: string
  error?: { message?: string }
}

const SYSTEM_PROMPT = `You are the business mentor inside Vitality's Brand module. The user runs a small venture: a creator channel, a shop, a service, an indie product, or a local business. You can see their tracked metrics and goals, and you can read the public web pages they have linked.

Your job is to ANSWER their questions about the business: strategy, pricing, growth, what to focus on, whether a number is good, how to read a page they linked. Be a sharp, practical operator, never generic startup advice.

USING THE LINKS
- When a question is about something on one of their public pages (their site, storefront, listing, public profile), use the web_fetch tool to actually read it before answering. Pull at least one concrete observation from what you read.
- Never try to log in. If a link is an admin dashboard, a private sheet, or a login wall, skip it silently and say you cannot see private dashboards. Never invent what a page says.
- Only fetch when it helps answer THIS question. Many questions you can answer from their numbers and cadence alone. Be fast.

VOICE
- Warm, calm, plain. Direct. Talk like a smart friend who runs businesses, not a consultant.
- No emoji. Never use em dashes or en dashes; use periods or "and".
- Use their real numbers when you can. End with the single most useful next move when it fits.

LENGTH
- Answer in at most about 140 words. Short paragraphs or a few "- " bullets, whichever fits the question. No headers, no tables, no code blocks.`

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

/** Snapshot of the brand, appended to the system prompt so every turn has it. */
function buildBrandContext(brand: BrandIn): string {
  const lines: string[] = []
  lines.push(`Brand: ${brand.name || 'Untitled'} (${brand.archetype || 'other'})`)
  if (brand.blurb && brand.blurb.trim()) lines.push(brand.blurb.trim())

  const schedules = (brand.schedules ?? []).slice(0, 8)
  if (schedules.length > 0) {
    lines.push('\nGoals & cadence:')
    for (const s of schedules) lines.push(`- ${s.label}: target ${s.target} ${s.unit} per ${s.period}`)
  }

  const kpis = (brand.kpis ?? []).slice(0, 12)
  if (kpis.length > 0) {
    lines.push('\nTracked metrics:')
    for (const k of kpis) lines.push(`- ${fmtKpi(k)}`)
  }

  const links = (brand.links ?? []).filter(l => /^https?:\/\//i.test(l.url)).slice(0, 6)
  if (links.length > 0) {
    lines.push('\nPublic links you can read (skip dashboards and logins):')
    for (const l of links) lines.push(`- ${l.label || 'Link'}: ${l.url}`)
  } else {
    lines.push('\nNo public links provided, so reason from the metrics and cadence alone.')
  }
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
    const { data: profile } = await supabase.from('profiles').select('tier').eq('id', user.id).single()
    if (profile?.tier !== 'pro') return NextResponse.json({ error: 'requires_pro' }, { status: 402 })
  }

  const payload = await request.json().catch(() => null) as
    { brand?: BrandIn; question?: string; history?: Turn[] } | null
  const brand = payload?.brand
  const question = (payload?.question ?? '').trim()
  if (!brand || typeof brand !== 'object') {
    return NextResponse.json({ error: 'missing_brand' }, { status: 400 })
  }
  if (!question) return NextResponse.json({ error: 'missing_question' }, { status: 400 })

  // Sanitize the client-supplied history into clean alternating turns.
  const history: Turn[] = Array.isArray(payload?.history)
    ? payload!.history
        .filter((t): t is Turn =>
          !!t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && !!t.content.trim())
        .slice(-MAX_HISTORY_TURNS)
        .map(t => ({ role: t.role, content: t.content.trim().slice(0, 4000) }))
    : []

  const system = `${SYSTEM_PROMPT}\n\nThe user's business right now:\n${buildBrandContext(brand)}`

  try {
    // Conversation so far + the new question. The server-side web_fetch tool can
    // pause (stop_reason: "pause_turn") when its internal loop hits the cap;
    // re-send the assistant turn to resume (same pattern as insight).
    const messages: Array<{ role: string; content: unknown }> = [
      ...history.map(t => ({ role: t.role, content: t.content })),
      { role: 'user', content: question.slice(0, 4000) },
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
          system,
          tools: [{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 4 }],
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
        console.error('[brand/ask] Anthropic error:', res.status, data?.error?.message)
        return NextResponse.json({ error: data?.error?.message || `Anthropic ${res.status}` }, { status: 502 })
      }

      final = data
      if (data.stop_reason === 'pause_turn' && Array.isArray(data.content)) {
        messages.push({ role: 'assistant', content: data.content })
        continue
      }
      break
    }

    const answer = noDashes(
      (final?.content ?? [])
        .filter(b => b.type === 'text' && typeof b.text === 'string')
        .map(b => (b.text as string).trim())
        .filter(Boolean)
        .join('\n')
        .trim()
    )

    if (!answer) {
      return NextResponse.json({ error: 'The mentor could not answer that. Try again.' }, { status: 502 })
    }
    return NextResponse.json({ answer })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'ask_failed'
    console.error('[brand/ask]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
