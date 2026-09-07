import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/*
 * Brand niche classifier — names the niche in a few words and picks the best
 * Google Trends search term for it. NO essay, NO web tools: it classifies from
 * the signals the client sends (profile handle, recent post titles, saved data
 * reads, audience notes, cadence) and returns STRUCTURED JSON. The actual "how
 * is it doing" comes from the Google Trends graph (/api/brand/trends), keyed off
 * the `keyword` this returns.
 *
 * Mirrors /api/brand/insight: raw Anthropic REST call (no SDK), ANTHROPIC_API_KEY
 * server-side only, auth required.
 */

const REQUIRE_PRO = false
const MODEL = 'claude-opus-4-8'

interface NicheIn {
  name?: string
  archetype?: string
  blurb?: string
  platform?: string
  handle?: string
  profileUrl?: string
  recentTitles?: string[]
  scheduleLabels?: string[]
  notes?: Record<string, string>
}

interface AnthropicBlock { type: string; text?: string }
interface AnthropicResponse {
  content?: AnthropicBlock[]
  stop_reason?: string
  error?: { message?: string }
}

const SYSTEM_PROMPT = `You classify a creator's niche in a few words. You are given their handle, recent post titles, saved analytics notes, audience, and posting cadence. Infer the single best niche. NEVER ask a question, NEVER explain your reasoning, NEVER write an essay.

Return ONLY the JSON object. Rules:
- "label": the niche in plain words, MAXIMUM 4 words, ideally 1 to 3 (e.g. "Indie game devlogs", "Personal finance", "Cottagecore baking", "Claude Code"). Title case. No punctuation.
- "keyword": the single search term a normal person would type into Google Trends to track this niche's popularity. Short, real, and broad enough to have search volume (e.g. "indie games", "personal finance", "sourdough", "claude code"). Lowercase. One term, no quotes, no operators.
- "summary": ONE short sentence on what they make and who it is for. No more than 20 words.`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    label: { type: 'string' },
    keyword: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['label', 'keyword', 'summary'],
}

function buildUserContent(n: NicheIn): string {
  const lines: string[] = []
  lines.push(`Brand: ${n.name || 'Untitled'} (${n.archetype || 'other'})`)
  if (n.blurb && n.blurb.trim()) lines.push(`Blurb: ${n.blurb.trim()}`)

  const where: string[] = []
  if (n.platform) where.push(n.platform)
  if (n.handle) where.push(n.handle)
  if (where.length) lines.push(`Posts on: ${where.join(' · ')}`)
  if (n.profileUrl) lines.push(`Profile: ${n.profileUrl}`)

  const titles = (n.recentTitles ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 12)
  if (titles.length) {
    lines.push('Recent post titles:')
    for (const t of titles) lines.push(`- ${t}`)
  }

  const labels = (n.scheduleLabels ?? []).map((l) => l.trim()).filter(Boolean).slice(0, 6)
  if (labels.length) lines.push(`Cadence: ${labels.join(', ')}`)

  const notes = Object.entries(n.notes ?? {}).filter(([, v]) => v && v.trim()).slice(0, 4)
  if (notes.length) {
    lines.push('Saved analytics notes:')
    for (const [k, v] of notes) lines.push(`[${k}] ${v.trim().slice(0, 500)}`)
  }

  lines.push('\nClassify the niche. Return only the JSON.')
  return lines.join('\n')
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Niche classifier is not configured on the server' }, { status: 500 })
  }

  if (REQUIRE_PRO) {
    const { data: profile } = await supabase.from('profiles').select('tier').eq('id', user.id).single()
    if (profile?.tier !== 'pro') {
      return NextResponse.json({ error: 'requires_pro' }, { status: 402 })
    }
  }

  const payload = await request.json().catch(() => null) as { niche?: NicheIn } | null
  const niche = payload?.niche
  if (!niche || typeof niche !== 'object') {
    return NextResponse.json({ error: 'missing_niche' }, { status: 400 })
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{ role: 'user', content: buildUserContent(niche) }],
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
      console.error('[brand/niche] Anthropic error:', res.status, data?.error?.message)
      return NextResponse.json({ error: data?.error?.message || `Anthropic ${res.status}` }, { status: 502 })
    }

    const jsonText = (data.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('')
      .trim()

    let out: { label?: string; keyword?: string; summary?: string }
    try {
      out = JSON.parse(jsonText)
    } catch {
      return NextResponse.json({ error: 'Could not classify the niche. Try again.' }, { status: 502 })
    }

    const label = (out.label || '').trim()
    const keyword = (out.keyword || '').trim().toLowerCase()
    const summary = (out.summary || '').trim()
    if (!label || !keyword) {
      return NextResponse.json({ error: 'Could not classify the niche. Try again.' }, { status: 502 })
    }

    return NextResponse.json({ label, keyword, summary })
  } catch (e) {
    console.error('[brand/niche] error:', e)
    return NextResponse.json({ error: 'Could not reach the niche classifier.' }, { status: 502 })
  }
}
