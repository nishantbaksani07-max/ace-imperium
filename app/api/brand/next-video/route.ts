import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/*
 * Next-video recommender — turns the brand data we already hold in Supabase
 * (niche, what's-working, audience, best-times reads + cadence) into a short,
 * concrete recommendation for the creator's NEXT upload. Plain text, saved to
 * packReads['next_video'] on the client. Mirrors /api/brand/description.
 */

const REQUIRE_PRO = false
const MODEL = 'claude-opus-4-8'

interface PlanIn {
  name?: string
  archetype?: string
  blurb?: string
  platform?: string
  handle?: string
  cadence?: string
  notes?: Record<string, string>
}

interface AnthropicBlock { type: string; text?: string }
interface AnthropicResponse { content?: AnthropicBlock[]; error?: { message?: string } }

const SYSTEM_PROMPT = `You recommend a creator's NEXT video from their own data (niche, what's-working, audience, best posting times). Be concrete and specific — no fluff, no questions, no preamble.

Output PLAIN TEXT in exactly this shape (keep each line short):
Title: <a working title for the next video>
Hook: <the first line / first 3 seconds>
Format: <length + format, e.g. "60s short" or "8-min long-form">
Post: <best day + time to publish, from the data>
Why: <one line on why this will land with their audience>

Use ONLY what the data supports; if something isn't known, make the smartest inference from the niche. Never invent specific numbers.`

function buildUserContent(p: PlanIn): string {
  const lines: string[] = []
  lines.push(`Brand: ${p.name || 'Untitled'} (${p.archetype || 'other'})`)
  if (p.blurb?.trim()) lines.push(`Blurb: ${p.blurb.trim()}`)
  const where: string[] = []
  if (p.platform) where.push(p.platform)
  if (p.handle) where.push(p.handle)
  if (where.length) lines.push(`Posts on: ${where.join(' · ')}`)
  if (p.cadence?.trim()) lines.push(`Cadence: ${p.cadence.trim()}`)

  const notes = Object.entries(p.notes ?? {}).filter(([, v]) => v && v.trim()).slice(0, 6)
  if (notes.length) {
    lines.push('Saved analytics reads:')
    for (const [k, v] of notes) lines.push(`[${k}] ${v.trim().slice(0, 600)}`)
  } else {
    lines.push('No saved analytics yet — infer from the niche.')
  }

  lines.push('\nRecommend the next video now. Plain text only, in the required shape.')
  return lines.join('\n')
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Recommender is not configured on the server' }, { status: 500 })
  }

  if (REQUIRE_PRO) {
    const { data: profile } = await supabase.from('profiles').select('tier').eq('id', user.id).single()
    if (profile?.tier !== 'pro') {
      return NextResponse.json({ error: 'requires_pro' }, { status: 402 })
    }
  }

  const payload = await request.json().catch(() => null) as { plan?: PlanIn } | null
  const plan = payload?.plan
  if (!plan || typeof plan !== 'object') {
    return NextResponse.json({ error: 'missing_plan' }, { status: 400 })
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
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserContent(plan) }],
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
      console.error('[brand/next-video] Anthropic error:', res.status, data?.error?.message)
      return NextResponse.json({ error: data?.error?.message || `Anthropic ${res.status}` }, { status: 502 })
    }

    const recommendation = (data.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('')
      .trim()

    if (!recommendation) return NextResponse.json({ error: 'Could not draft a recommendation. Try again.' }, { status: 502 })
    return NextResponse.json({ recommendation })
  } catch (e) {
    console.error('[brand/next-video] error:', e)
    return NextResponse.json({ error: 'Could not reach the recommender.' }, { status: 502 })
  }
}
