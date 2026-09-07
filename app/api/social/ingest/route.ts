import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseSnapshot } from '@/lib/social/parse'
import type { ParsedSnapshot, SocialPlatform } from '@/lib/social/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/*
 * Social paste INGEST (BUILD52) — "paste anything, it figures out the numbers".
 *
 * The old flow needed a rigid KEY: value block and a client-side regex; a normal
 * Claude-extension reply (prose, a markdown table, a screenshot's text) parsed
 * to nothing. This sends the raw paste to Claude, which returns structured JSON,
 * then saves it. Falls back to the regex parser when no ANTHROPIC_API_KEY (or if
 * the model misbehaves), so it always does *something* with a well-formed paste.
 */

const MODEL = 'claude-haiku-4-5-20251001' // cheap structured extraction, no web tools

const NUM_KEYS = [
  'followers', 'views', 'reach', 'pctNonFollowers', 'likes',
  'comments', 'saves', 'shares', 'follows', 'engagementRate',
] as const
const COL: Record<string, string> = {
  followers: 'followers', views: 'views', reach: 'reach', pctNonFollowers: 'pct_non_followers',
  likes: 'likes', comments: 'comments', saves: 'saves', shares: 'shares',
  follows: 'follows', engagementRate: 'engagement_rate',
}

const SYSTEM = `You extract social-media analytics numbers from pasted text (any format: prose, a table, a dump). Return ONLY a JSON object, no prose, with these keys (omit any you can't find, never guess):
{"followers":n,"views":n,"reach":n,"pctNonFollowers":n,"likes":n,"comments":n,"saves":n,"shares":n,"follows":n,"engagementRate":n,"topComments":["..."]}
Expand shorthand (12.3K -> 12300, 1.2M -> 1200000). Percentages as plain numbers (62 not "62%"). topComments: up to 6 short verbatim comment strings if present, else [].`

async function aiParse(apiKey: string, text: string): Promise<Partial<ParsedSnapshot> | null> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system: SYSTEM,
      messages: [{ role: 'user', content: text.slice(0, 8000) }],
    }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> }
  const raw = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0]) as Partial<ParsedSnapshot>
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { brand?: string; platform?: SocialPlatform; text?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const text = (body.text ?? '').trim()
  const platform = body.platform ?? 'other'
  if (!text) return NextResponse.json({ error: 'Paste something first.' }, { status: 400 })

  // AI first, regex fallback — so a clean KEY: value block still works offline.
  const apiKey = process.env.ANTHROPIC_API_KEY
  const ai = apiKey ? await aiParse(apiKey, text) : null
  const parsed: ParsedSnapshot = ai
    ? { ...parseSnapshot(text, platform), ...ai, platform, raw: text, topComments: Array.isArray(ai.topComments) ? ai.topComments : parseSnapshot(text, platform).topComments }
    : parseSnapshot(text, platform)

  const rec = parsed as unknown as Record<string, unknown>
  const hasNumber = NUM_KEYS.some((k) => typeof rec[k] === 'number' && Number.isFinite(rec[k] as number))
  if (!hasNumber) {
    return NextResponse.json({ error: 'Could not find any numbers in that. Paste the stats from your analytics page.' }, { status: 400 })
  }

  const row: Record<string, unknown> = {
    user_id: user.id,
    brand_ref: body.brand ?? '',
    platform,
    period: parsed.period ?? '28d',
    top_comments: Array.isArray(parsed.topComments) ? parsed.topComments.slice(0, 20) : [],
    extra: parsed.extra ?? {},
    raw: text.slice(0, 10000),
  }
  for (const k of NUM_KEYS) {
    const v = rec[k]
    if (typeof v === 'number' && Number.isFinite(v)) row[COL[k]] = v
  }

  const { data, error } = await supabase.from('social_snapshots').insert(row).select('id').single()
  if (error) {
    if (error.code === '42P01') return NextResponse.json({ error: 'Social tracking is not set up on the server yet (migration pending).' }, { status: 400 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id: data?.id, saved: row })
}
