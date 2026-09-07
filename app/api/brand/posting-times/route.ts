import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
// No web tools — it reasons over the user's own pasted analytics, so it's a
// plain chat turn. Keep the ceiling modest.
export const maxDuration = 30

/*
 * Posting-times strategist — "what are my best times to post, and how many a day
 * for the best reach". Reads the user's saved Claude-Chrome data packs (Best
 * times / Audience / what's working) plus their numbers and returns a short,
 * actionable card. NO web tools: the answer lives in the user's own analytics.
 *
 * Mirrors /api/brand/niche: raw Anthropic REST call (no SDK), ANTHROPIC_API_KEY
 * server-side only, auth required, packReads passed up by the client.
 */

const REQUIRE_PRO = false

// No web tools here, so any current model works. Opus 4.8 for quality; swap to
// claude-sonnet-4-6 to cut cost.
const MODEL = 'claude-opus-4-8'

interface PostTimesIn {
  platform?: string
  handle?: string
  followers?: number | null
  reach?: number | null
  engagementRate?: number | null
  /** Current cadence labels, e.g. "Daily reel". */
  scheduleLabels?: string[]
  /** Saved data-pack reads (besttimes / audience / comments / whatsworking). */
  notes?: Record<string, string>
}

interface AnthropicBlock { type: string; text?: string }
interface AnthropicResponse { content?: AnthropicBlock[]; error?: { message?: string } }

const SYSTEM_PROMPT = `You are the posting-times strategist inside Vitality's Brand module. The user is a creator. You have their platform, their numbers, their current cadence, and any analytics they pasted in from the Claude browser extension (especially a "best times" pack with their audience's active hours, and an "audience" pack).

Your job: tell them WHEN to post and HOW MANY times a day for the best reach. Specific and actionable, tied to their data.

USING THEIR DATA
- If a "best times" or "audience" note is present, read the actual active-hour and timezone signal out of it and base your answer on that. Quote the real peak windows.
- If that data is missing, give sensible platform defaults (general best windows for their platform and format) and say clearly it is a starting point to refine once they pull their Best Times analytics. Never invent specific numbers you were not given.
- Factor their current cadence and reach into the "how many per day" call. Do not tell someone posting nothing to jump to five a day.

VOICE
- Warm, calm, plain. Short sentences. No emoji. Never use em dashes or en dashes; use periods or "and".

RESPONSE FORMAT (the UI renders this as a card, not an essay)
- Hard cap about 80 words.
- One short lead line: the single best posting window and daily count, in plain words.
- Then 2 to 4 bullets, each starting with "- ", each a single tight clause. Cover: the best day(s) and time(s) to post, how many posts per day, and one note on what to watch or test next.
- Bold exactly one load-bearing phrase per line with **double asterisks**: a time, a day, a count, or a verb to act on.
- Plain text, "- " bullets, and **bold** only. No headers, no tables, no code, no emoji.`

/** Strip em/en dashes (house rule). */
function noDashes(s: string): string {
  return s.replace(/\s*[—–]\s*/g, ', ')
}

function buildUserContent(p: PostTimesIn): string {
  const lines: string[] = []
  const where: string[] = []
  if (p.platform) where.push(p.platform)
  if (p.handle) where.push(p.handle)
  lines.push(`Platform: ${where.join(' · ') || 'unknown'}`)

  const labels = (p.scheduleLabels ?? []).map((l) => l.trim()).filter(Boolean).slice(0, 6)
  if (labels.length) lines.push(`Current cadence: ${labels.join(', ')}`)

  const nums: string[] = []
  if (typeof p.followers === 'number') nums.push(`${p.followers.toLocaleString()} followers`)
  if (typeof p.reach === 'number') nums.push(`${p.reach.toLocaleString()} reach`)
  if (typeof p.engagementRate === 'number') nums.push(`${p.engagementRate}% engagement`)
  if (nums.length) lines.push(`My numbers: ${nums.join(', ')}`)

  const notes = Object.entries(p.notes ?? {}).filter(([, v]) => v && v.trim()).slice(0, 4)
  if (notes.length) {
    lines.push('\nMy pasted analytics:')
    for (const [k, v] of notes) lines.push(`[${k}] ${v.trim().slice(0, 800)}`)
  } else {
    lines.push('\nNo Best Times analytics pasted yet, so give platform defaults and say so.')
  }

  lines.push('\nGive me my best posting times and daily count in the required format.')
  return lines.join('\n')
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Posting-times read is not configured on the server' }, { status: 500 })
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

  const payload = await request.json().catch(() => null) as { post?: PostTimesIn } | null
  const post = payload?.post
  if (!post || typeof post !== 'object') {
    return NextResponse.json({ error: 'missing_post' }, { status: 400 })
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
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserContent(post) }],
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
      console.error('[brand/posting-times] Anthropic error:', res.status, data?.error?.message)
      return NextResponse.json({ error: data?.error?.message || `Anthropic ${res.status}` }, { status: 502 })
    }

    const read = (data.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('\n')
      .trim()

    if (!read) return NextResponse.json({ error: 'No read came back. Try again.' }, { status: 502 })

    return NextResponse.json({ read: noDashes(read) })
  } catch (e) {
    console.error('[brand/posting-times] error:', e)
    return NextResponse.json({ error: 'Could not reach the posting-times strategist.' }, { status: 502 })
  }
}
