import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 45

/*
 * Social Command Center advisor (BUILD51 → structured).
 *
 * Reads the user's saved social_snapshots (RLS-scoped, server-side) and asks
 * Claude what's working and what to make next. No web tools — it reasons over
 * the numbers the user pasted back, including the trend across snapshots and
 * the top comments.
 *
 * Returns STRUCTURED sections (not a bullet blob) so the UI can render the
 * "what's working" panel as minimal dropdowns: a verdict, an optional
 * success-rate read, what worked / what didn't, video ideas, ready-to-shoot
 * scripts, and a posting cadence tied to their schedule. Every field is
 * coerced to a safe shape so a malformed model response can't crash the UI.
 */

const REQUIRE_PRO = false
const MODEL = 'claude-opus-4-8' // swap to claude-sonnet-4-6 to cut cost (no web tools needed)

interface AnthropicBlock { type: string; text?: string }
interface AnthropicResponse { content?: AnthropicBlock[]; error?: { message?: string } }

interface SnapshotRow {
  platform: string
  captured_at: string
  period: string | null
  followers: number | null
  views: number | null
  reach: number | null
  pct_non_followers: number | null
  likes: number | null
  comments: number | null
  saves: number | null
  shares: number | null
  follows: number | null
  engagement_rate: number | null
  top_comments: unknown
}

const SYSTEM_PROMPT = `You are the content strategist inside Vitality's Social Command Center. The user is a creator who pastes in their Instagram / TikTok / YouTube analytics over time. You see the latest numbers, how they have moved across snapshots, and recent top comments.

Your job: read what is working and turn it into specific things to make next. Talk about content, not vanity metrics. Reason from saves / shares / reach / non-follower % (distribution signals) over raw likes. Mine the top comments for what the audience is literally asking for.

Return a single JSON object with EXACTLY this shape (no extra keys):

{
  "verdict": "<one tight line: the single most important takeaway right now>",
  "successRate": { "label": "<the repeatable thing, e.g. 'Shorts under 30s' or 'How-to hooks'>", "pct": <integer 0-100>, "basis": "<the number that backs it, e.g. '3 of 4 beat your median reach'>" } ,
  "worked": [ { "title": "<the winning format / hook / topic, named>", "metric": "<the number that proves it, e.g. '48k views, 9% non-follower reach'>", "why": "<one line on why it worked>" } ],
  "didnt": [ { "title": "<what underperformed, named>", "why": "<one line on why, and what to change>" } ],
  "ideas": [ "<a specific next video, one line, extending what works or answering a comment>" ],
  "scripts": [ { "title": "<the idea this script is for>", "body": "<a ready-to-shoot script: HOOK, then beats, then CTA. Short. Multi-line is fine.>" } ],
  "cadence": { "recommendation": "<e.g. '1 short per day + 1 long video per week'>", "rationale": "<one line tying it to their data>" }
}

Rules:
1. Ground every claim in the pasted numbers. Quote the actual figures. Never invent metrics. If the data does not support a section, return an empty array (and null for successRate or cadence) rather than making something up.
2. "worked" / "didnt" / "ideas" are the payoff. Be concrete and specific to THIS creator, never generic advice.
3. Write 1 to 3 full scripts for the highest-potential ideas. A creator should be able to film straight from one.
4. successRate.pct is your honest read of how often the "worked" pattern beats their own median, as a percentage. Set successRate to null if you cannot support a number.
5. cadence should be realistic and tied to what is performing (e.g. shorts are carrying reach so lean daily shorts). null if unclear.
6. Voice: warm, calm, plain. Short sentences. No emoji. Never use em dashes or en dashes; use periods or "and".
7. Return ONLY the JSON object. No prose, no markdown fences.`

function noDashes(s: string): string {
  return s.replace(/\s*[—–]\s*/g, ', ')
}

function fmtRow(r: SnapshotRow): string {
  const bits: string[] = []
  const push = (label: string, v: number | null, unit = '') => {
    if (v != null) bits.push(`${label} ${v.toLocaleString()}${unit}`)
  }
  push('followers', r.followers)
  push('views', r.views)
  push('reach', r.reach)
  push('non-follower', r.pct_non_followers, '%')
  push('likes', r.likes)
  push('comments', r.comments)
  push('saves', r.saves)
  push('shares', r.shares)
  push('follows', r.follows)
  push('eng', r.engagement_rate, '%')
  return `  ${r.captured_at.slice(0, 10)} [${r.platform}] ${bits.join(' · ')}`
}

function buildUserContent(rows: SnapshotRow[]): string {
  const lines: string[] = []
  const byPlatform = new Map<string, SnapshotRow[]>()
  for (const r of rows) {
    if (!byPlatform.has(r.platform)) byPlatform.set(r.platform, [])
    byPlatform.get(r.platform)!.push(r)
  }
  for (const [platform, list] of Array.from(byPlatform.entries())) {
    lines.push(`\n${platform.toUpperCase()} (${list.length} snapshot(s), oldest → newest):`)
    for (const r of list.slice(-6)) lines.push(fmtRow(r))
    const latest = list[list.length - 1]
    const comments = Array.isArray(latest?.top_comments) ? (latest.top_comments as string[]).slice(0, 6) : []
    if (comments.length) {
      lines.push('  recent top comments:')
      for (const c of comments) lines.push(`    - ${String(c).slice(0, 200)}`)
    }
  }
  lines.push('\nReturn the structured JSON read for this creator.')
  return lines.join('\n')
}

// --- Coerce the model's JSON to the exact shape, with safe defaults ---

function str(v: unknown, max = 600): string {
  return typeof v === 'string' ? noDashes(v.trim()).slice(0, max) : ''
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

function sanitize(parsed: unknown) {
  const o = obj(parsed)

  const sr = obj(o.successRate)
  const srPct = Number(sr.pct)
  const successRate = (typeof sr.label === 'string' && Number.isFinite(srPct))
    ? { label: str(sr.label, 80), pct: Math.max(0, Math.min(100, Math.round(srPct))), basis: str(sr.basis, 160) }
    : null

  const cad = obj(o.cadence)
  const cadence = typeof cad.recommendation === 'string' && cad.recommendation.trim()
    ? { recommendation: str(cad.recommendation, 160), rationale: str(cad.rationale, 240) }
    : null

  return {
    verdict: str(o.verdict, 240),
    successRate,
    worked: arr(o.worked).slice(0, 8).map((w) => {
      const x = obj(w)
      return { title: str(x.title, 160), metric: str(x.metric, 120), why: str(x.why, 240) }
    }).filter((w) => w.title),
    didnt: arr(o.didnt).slice(0, 8).map((d) => {
      const x = obj(d)
      return { title: str(x.title, 160), why: str(x.why, 240) }
    }).filter((d) => d.title),
    ideas: arr(o.ideas).slice(0, 12).map((i) => str(i, 240)).filter(Boolean),
    scripts: arr(o.scripts).slice(0, 4).map((s) => {
      const x = obj(s)
      return { title: str(x.title, 160), body: str(x.body, 4000) }
    }).filter((s) => s.body),
    cadence,
  }
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Advisor is not configured on the server' }, { status: 500 })

  if (REQUIRE_PRO) {
    const { data: profile } = await supabase.from('profiles').select('tier').eq('id', user.id).single()
    if (profile?.tier !== 'pro') return NextResponse.json({ error: 'requires_pro' }, { status: 402 })
  }

  let brand = ''
  try {
    const body = (await req.json()) as { brand?: string }
    brand = body?.brand ?? ''
  } catch {
    /* body optional */
  }

  const { data, error } = await supabase
    .from('social_snapshots')
    .select('platform, captured_at, period, followers, views, reach, pct_non_followers, likes, comments, saves, shares, follows, engagement_rate, top_comments')
    .eq('user_id', user.id)
    .eq('brand_ref', brand)
    .order('captured_at', { ascending: true })
    .limit(60)
  if (error && error.code === '42P01') {
    return NextResponse.json({ error: 'Social tracking is not set up on the server yet (migration pending).' }, { status: 400 })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data as SnapshotRow[] | null) ?? []
  if (!rows.length) {
    return NextResponse.json({ error: 'No social stats saved yet. Generate a prompt, run it, and paste the numbers back first.' }, { status: 400 })
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserContent(rows) }],
      }),
    })
    const rawText = await res.text()
    let resp: AnthropicResponse
    try {
      resp = JSON.parse(rawText) as AnthropicResponse
    } catch {
      return NextResponse.json({ error: `Anthropic returned non-JSON: ${rawText.slice(0, 200)}` }, { status: 502 })
    }
    if (!res.ok) return NextResponse.json({ error: resp?.error?.message || `Anthropic ${res.status}` }, { status: 502 })

    const text = (resp.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => (b.text as string).trim())
      .filter(Boolean)
      .join('\n')
      .trim()
    if (!text) return NextResponse.json({ error: 'The advisor could not complete a read. Try again.' }, { status: 502 })

    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    let parsed: unknown
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      console.error('[brand/social-advisor] JSON parse failed for:', cleaned.slice(0, 200))
      return NextResponse.json({ error: 'Could not read the advice, please try again' }, { status: 502 })
    }

    return NextResponse.json({ advice: sanitize(parsed) })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'advisor_failed'
    console.error('[brand/social-advisor]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
