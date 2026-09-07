import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-tier'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/*
 * Studio auto-package - turns a pasted transcript / notes / idea into a
 * ready-to-upload YouTube package (titles, description, tags, hashtags,
 * chapters, thumbnail words + prompt). Server-only ANTHROPIC_API_KEY, called
 * with raw fetch (same pattern as app/api/mentor/chat/route.ts). The sealed
 * Studio tile never sees this key; it reaches this endpoint only through the
 * host's gated 'ai' message verb (see lib/tiles/useTileHost.ts), and this
 * route re-verifies the session itself so a spoofed message at worst lets a
 * signed-in user call their own rate-limited endpoint.
 *
 * Session-gated via requireUser(), not tier-gated. Swap to requirePro() to
 * Pro-gate this later.
 */

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const CLAUDE_API_VERSION = '2023-06-01'
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'
const DAILY_AI_CAP = 25
const MAX_INPUT_CHARS = 24000

const SYSTEM_PROMPT = `You are a YouTube growth strategist packaging a video for upload.
Given a creator's raw material (a transcript, rough notes, or a one-line idea), produce a complete, ready-to-paste upload package.
Rules:
- Titles: exactly 3, each under 70 characters, curiosity-driven but not clickbait, no ALL CAPS words, no emoji.
- Description: a compelling opening 2 lines, then a short body, then a "Chapters" section listing the timestamps, then a soft call to action. Plain text. Never use an em dash anywhere.
- Tags: 12 to 15 lowercase SEO keywords, no leading # symbol.
- Hashtags: 3 to 5, each starting with #, no spaces.
- Chapters: infer logical sections. First chapter t must be "0:00". Use "M:SS" (or "H:MM:SS" past an hour). Labels 2 to 5 words. If the input has no time signal, space chapters evenly and keep labels topical.
- thumbnailWords: 2 to 4 punchy words that would go on the thumbnail.
- thumbnailPrompt: one paste-ready prompt for an image generator describing a strong thumbnail (subject, mood, composition, colors), no text baked in.
Respond with ONLY a single JSON object, no markdown fences, matching exactly:
{"titles":[],"description":"","tags":[],"hashtags":[],"chapters":[{"t":"","label":""}],"thumbnailWords":"","thumbnailPrompt":""}`

interface AnthropicTextBlock { type: 'text'; text: string }
interface AnthropicResponse { content?: AnthropicTextBlock[]; error?: { message?: string } }

export async function POST(request: NextRequest) {
  const gate = await requireUser()
  if (!gate.ok) return gate.response

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Packaging is not configured on the server' }, { status: 500 })

  let body: { input?: unknown; kind?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const input = typeof body.input === 'string' ? body.input.trim() : ''
  const kind = body.kind === 'notes' || body.kind === 'idea' ? body.kind : 'transcript'
  if (!input) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  if (input.length > MAX_INPUT_CHARS) {
    return NextResponse.json({ error: 'input_too_large', limit: MAX_INPUT_CHARS }, { status: 400 })
  }

  // Daily cap: increment first (atomic), enforce on the returned count. This is
  // fail-closed / cost-protective: a DB error blocks the call rather than
  // silently allowing unlimited spend.
  const supabase = createClient()
  // Deliberate global UTC-day bucket for the cost cap (not user-facing local-date
  // logic, so getLocalDateKey intentionally does not apply here).
  const utcDay = new Date().toISOString().slice(0, 10)
  const { data: newCount, error: capErr } = await supabase.rpc('bump_ai_usage', { p_day: utcDay })
  if (capErr) {
    console.error('[studio/package] cap rpc error:', capErr.message)
    return NextResponse.json({ error: 'usage_check_failed' }, { status: 500 })
  }
  if ((newCount as number) > DAILY_AI_CAP) {
    return NextResponse.json({ error: 'daily_limit_reached', limit: DAILY_AI_CAP }, { status: 429 })
  }

  const userContent = `Material kind: ${kind}\n\n${input}`

  try {
    const res = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': CLAUDE_API_VERSION,
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || DEFAULT_MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      }),
    })
    const rawText = await res.text()
    let data: AnthropicResponse
    try {
      data = JSON.parse(rawText) as AnthropicResponse
    } catch {
      console.error('[studio/package] Anthropic returned non-JSON:', rawText.slice(0, 200))
      return NextResponse.json({ error: 'upstream_error' }, { status: 502 })
    }
    if (!res.ok) {
      console.error('[studio/package] Anthropic error:', res.status, data?.error?.message)
      return NextResponse.json({ error: 'upstream_error' }, { status: 502 })
    }
    const text = data?.content?.[0]?.text
    if (typeof text !== 'string') return NextResponse.json({ error: 'Empty response' }, { status: 502 })

    // Model told to return raw JSON; strip an accidental fence, then parse and shape-guard.
    const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    let pkg: Record<string, unknown>
    try {
      pkg = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({ error: 'Could not parse package from model' }, { status: 502 })
    }
    const result = {
      titles: Array.isArray(pkg.titles) ? pkg.titles.slice(0, 3).map(String) : [],
      description: typeof pkg.description === 'string' ? pkg.description : '',
      tags: Array.isArray(pkg.tags) ? pkg.tags.map(String) : [],
      hashtags: Array.isArray(pkg.hashtags) ? pkg.hashtags.map(String) : [],
      chapters: Array.isArray(pkg.chapters)
        ? pkg.chapters
            .filter((c: unknown): c is { t: string; label: string } =>
              !!c && typeof c === 'object' && typeof (c as { t?: unknown }).t === 'string' && typeof (c as { label?: unknown }).label === 'string')
            .map((c) => ({ t: c.t, label: c.label }))
        : [],
      thumbnailWords: typeof pkg.thumbnailWords === 'string' ? pkg.thumbnailWords : '',
      thumbnailPrompt: typeof pkg.thumbnailPrompt === 'string' ? pkg.thumbnailPrompt : '',
    }
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'package_failed'
    console.error('[studio/package]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
