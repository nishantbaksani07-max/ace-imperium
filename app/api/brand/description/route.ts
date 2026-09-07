import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/*
 * Base-description writer — drafts a creator's EVERGREEN video description (the
 * boilerplate reused on every upload) from the brand data we already hold in
 * Supabase: the blurb, niche read, audience/what's-working notes, and Post-links.
 * Returns plain text (no per-video specifics, no timestamps) saved to the
 * description builder's base field. Mirrors /api/brand/niche: raw Anthropic REST
 * call, ANTHROPIC_API_KEY server-side only, auth required.
 */

const REQUIRE_PRO = false
const MODEL = 'claude-opus-4-8'

interface DescIn {
  name?: string
  archetype?: string
  blurb?: string
  platform?: string
  handle?: string
  links?: Array<{ label?: string; url?: string }>
  notes?: Record<string, string>
}

interface AnthropicBlock { type: string; text?: string }
interface AnthropicResponse {
  content?: AnthropicBlock[]
  error?: { message?: string }
}

const SYSTEM_PROMPT = `You write a creator's EVERGREEN base video description — the boilerplate they paste on EVERY upload, not a one-off.

You are given their brand, niche, audience, and the links they use. Write the reusable base only.

Rules:
- Output ONLY the description text. No preamble, no markdown headings, no quotes, no "Here is".
- 2 to 5 short paragraphs / lines: a one-line on who they are + what the channel is, an optional value/CTA line (subscribe, follow), and a "Links" block listing the provided links as "Label: url" (one per line). If a sponsor/affiliate idea fits the blurb, add a single neutral placeholder line they can edit.
- NEVER invent links or URLs that weren't provided. NEVER add per-video specifics, timestamps, or hashtags.
- Plain, warm, human. Keep it tight.`

function buildUserContent(d: DescIn): string {
  const lines: string[] = []
  lines.push(`Brand: ${d.name || 'Untitled'} (${d.archetype || 'other'})`)
  if (d.blurb?.trim()) lines.push(`Blurb: ${d.blurb.trim()}`)
  const where: string[] = []
  if (d.platform) where.push(d.platform)
  if (d.handle) where.push(d.handle)
  if (where.length) lines.push(`Posts on: ${where.join(' · ')}`)

  const links = (d.links ?? []).filter((l) => l.url && l.url.trim()).slice(0, 12)
  if (links.length) {
    lines.push('Links to include (use these EXACTLY):')
    for (const l of links) lines.push(`- ${l.label?.trim() || 'Link'}: ${l.url!.trim()}`)
  } else {
    lines.push('No links provided — do not invent any.')
  }

  const notes = Object.entries(d.notes ?? {}).filter(([, v]) => v && v.trim()).slice(0, 4)
  if (notes.length) {
    lines.push('Context from saved analytics reads:')
    for (const [k, v] of notes) lines.push(`[${k}] ${v.trim().slice(0, 600)}`)
  }

  lines.push('\nWrite the evergreen base description now. Output only the description text.')
  return lines.join('\n')
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Description writer is not configured on the server' }, { status: 500 })
  }

  if (REQUIRE_PRO) {
    const { data: profile } = await supabase.from('profiles').select('tier').eq('id', user.id).single()
    if (profile?.tier !== 'pro') {
      return NextResponse.json({ error: 'requires_pro' }, { status: 402 })
    }
  }

  const payload = await request.json().catch(() => null) as { description?: DescIn } | null
  const desc = payload?.description
  if (!desc || typeof desc !== 'object') {
    return NextResponse.json({ error: 'missing_description' }, { status: 400 })
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
        max_tokens: 700,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserContent(desc) }],
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
      console.error('[brand/description] Anthropic error:', res.status, data?.error?.message)
      return NextResponse.json({ error: data?.error?.message || `Anthropic ${res.status}` }, { status: 502 })
    }

    const base = (data.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('')
      .trim()

    if (!base) return NextResponse.json({ error: 'Could not draft a description. Try again.' }, { status: 502 })
    return NextResponse.json({ base })
  } catch (e) {
    console.error('[brand/description] error:', e)
    return NextResponse.json({ error: 'Could not reach the description writer.' }, { status: 502 })
  }
}
