import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/*
 * Inbox triage — takes the raw message dumps a user pulled from each source
 * (Gmail, YouTube, TikTok, Instagram, Patreon, Discord) and sorts everything
 * into Reply-now / Worth-a-reply / Skip so they know exactly who to answer.
 * Per-user, auth-scoped. Mirrors /api/brand/next-video (raw Anthropic REST,
 * ANTHROPIC_API_KEY server-side only).
 */

const REQUIRE_PRO = false
const MODEL = 'claude-opus-4-8'

interface SourceIn { source?: string; text?: string }
interface AnthropicBlock { type: string; text?: string }
interface AnthropicResponse { content?: AnthropicBlock[]; error?: { message?: string } }

/**
 * Pull a JSON object out of the model's reply, tolerant of stray prose or
 * code fences. Returns the canonical re-serialised triage object if it has the
 * expected shape, otherwise null so the caller can fall back to plain text.
 */
function extractTriageJson(raw: string): string | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>
  if (!Array.isArray(obj.replyNow) && !Array.isArray(obj.worth)) return null
  return JSON.stringify({
    replyNow: Array.isArray(obj.replyNow) ? obj.replyNow : [],
    worth: Array.isArray(obj.worth) ? obj.worth : [],
    skip: typeof obj.skip === 'string' ? obj.skip : '',
  })
}

const SYSTEM_PROMPT = `You triage a creator's incoming messages so they know exactly who to reply to. You're given raw dumps from several sources (Gmail, YouTube, TikTok, Instagram, Patreon, Discord). Read them and sort EVERY message.

Output ONLY a single JSON object (no markdown, no prose, no code fences) with EXACTLY this shape:

{
  "replyNow": [
    { "source": "Discord", "who": "stoyanovvv7", "meaning": "<why this matters, one short sentence>", "reply": "<one ready-to-send reply, the creator's voice>", "tag": "opportunity" }
  ],
  "worth": [
    { "source": "YouTube", "who": "@handle", "meaning": "<short reason it's worth a quick acknowledgement>", "tag": "fan" }
  ],
  "skip": "<one line summarising the junk: count + types (spam, bots, generic 🔥🔥, begging, scams, your own sent messages)>"
}

Field rules:
- "source" is one of: Gmail, YouTube, TikTok, Instagram, Patreon, Discord (use the section it came from).
- "who" is the sender's name/handle exactly as written.
- "meaning" is a short, plain-English read of what they want and why it matters.
- "reply" (replyNow only) is a single sentence the creator could send as-is — warm, specific, no placeholders.
- "tag" is one of: "opportunity" (collab/sponsor/paid/business/paying supporter), "urgent" (time-sensitive / awaiting a reply), "question" (genuine question), "complaint" (problem or criticism), "feedback" (constructive suggestion), "fan" (praise / positive).

Put business/collab/sponsor offers, paying supporters, genuine questions, and anything time-sensitive in "replyNow", most important first. Put real fans and thoughtful comments in "worth". Only use senders/messages actually present in the data — never invent. If "replyNow" or "worth" is empty, use []. If there's nothing to skip, set "skip" to "".`

function buildUserContent(sources: SourceIn[]): string {
  const parts: string[] = []
  for (const s of sources) {
    const text = (s.text ?? '').trim()
    if (!text) continue
    parts.push(`=== ${(s.source ?? 'source').toUpperCase()} ===\n${text.slice(0, 6000)}`)
  }
  parts.push('\nTriage everything above now. Plain text, the three sections only.')
  return parts.join('\n\n')
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Triage is not configured on the server' }, { status: 500 })

  if (REQUIRE_PRO) {
    const { data: profile } = await supabase.from('profiles').select('tier').eq('id', user.id).single()
    if (profile?.tier !== 'pro') return NextResponse.json({ error: 'requires_pro' }, { status: 402 })
  }

  const payload = await request.json().catch(() => null) as { sources?: SourceIn[] } | null
  const sources = Array.isArray(payload?.sources) ? payload!.sources : []
  if (!sources.some((s) => (s.text ?? '').trim())) {
    return NextResponse.json({ error: 'no_messages' }, { status: 400 })
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
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserContent(sources) }],
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
      console.error('[brand/triage] Anthropic error:', res.status, data?.error?.message)
      return NextResponse.json({ error: data?.error?.message || `Anthropic ${res.status}` }, { status: 502 })
    }

    const triage = (data.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('')
      .trim()

    if (!triage) return NextResponse.json({ error: 'Could not triage. Try again.' }, { status: 502 })
    // Prefer the structured JSON (rendered as cards); fall back to raw text.
    return NextResponse.json({ triage: extractTriageJson(triage) ?? triage })
  } catch (e) {
    console.error('[brand/triage] error:', e)
    return NextResponse.json({ error: 'Could not reach triage.' }, { status: 502 })
  }
}
