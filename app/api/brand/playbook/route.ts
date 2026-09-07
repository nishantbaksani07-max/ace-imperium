import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/*
 * Playbook generator. The payoff of the Social Command Center loop: the user
 * pastes their Claude-Chrome reads (what's working, audience, locations, best
 * times, comments) into the packs, which saves them on the brand; this route
 * stitches those reads + the saved number snapshots into one personalized
 * 7-section content playbook, using the same formula for any creator and any
 * platform — only the "metric that matters" changes per platform.
 *
 * Server-side ANTHROPIC_API_KEY (never client). Mirrors brand/social-advisor.
 */

const REQUIRE_PRO = false
const MODEL = 'claude-opus-4-8' // swap to claude-sonnet-4-6 to cut cost

interface AnthropicBlock { type: string; text?: string }
interface AnthropicResponse { content?: AnthropicBlock[]; error?: { message?: string } }

interface SnapshotRow {
  platform: string
  captured_at: string
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

const PACK_LABELS: Record<string, string> = {
  numbers: 'Latest numbers read',
  whatsworking: "What's working (their own read)",
  audience: 'Audience',
  demographics: 'Age & gender',
  locations: 'Top locations',
  besttimes: 'Best posting times',
  comments: 'Comments themes',
  comment_feed: 'Comments (verbatim)',
  dm_feed: 'DMs',
  audience_feed: 'Audience',
  times_feed: 'Posting times',
}

const SYSTEM_PROMPT = `You are a world-class content strategist building one creator's personalized CONTENT PLAYBOOK from their real data. The data covers a single platform and may include: their account numbers over time, and the reads they pulled with their Claude browser extension (what's working, audience, age/gender, locations, best times, comment themes).

Output EXACTLY these 7 markdown sections, in this order, with these headings:
## 1. What's working
## 2. The metric that matters
## 3. The bottleneck
## 4. Hook formulas
## 5. Cadence and timing
## 6. Content backlog
## 7. Action plan

Section guidance:
1. Rank their content and name what the winners share (hook, format, audio, length) versus what the losers share.
2. Name the ONE lever that drives THEIR reach on this platform:
   - Instagram: percent non-follower reach, triggered by first-hour saves and shares. Hook is the first 2 seconds.
   - YouTube: impressions times CTR (Browse and Suggested) plus retention. Broad benefit titles beat episode numbers.
   - TikTok: completion rate plus shares plus rewatches. Hook is the first 1 second. Trending audio.
3. Where they leak: reach, conversion, or consistency. Pick the real one and say why.
4. Hook formulas extracted from their best-performing hooks (give 3 to 5 reusable templates).
5. Best posting window and cadence, read from their data.
6. Content backlog pulled from their comment themes: what people keep asking for.
7. Action plan: 5 specific post ideas, title and thumbnail concepts, 1 full ready-to-shoot script, and one weekly goal.

Rules:
1. Ground everything in THEIR data. Cite their real numbers and quote their real reads. If a section is thin, say what to capture next rather than inventing.
2. Be specific to this creator. No generic advice.
3. Plain language, short sentences, no emoji. Never use em dashes or en dashes; use periods or "and".
4. Markdown only: ## headings, - bullets, **bold** for the load-bearing lines. No JSON, no code fences around the whole thing.`

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
  return `  ${r.captured_at.slice(0, 10)} ${bits.join(' · ')}`
}

function buildUserContent(platform: string, rows: SnapshotRow[], reads: Record<string, string>): string {
  const lines: string[] = [`PLATFORM: ${platform}`]

  if (rows.length) {
    lines.push(`\nNUMBER SNAPSHOTS (${rows.length}, oldest to newest):`)
    for (const r of rows.slice(-10)) lines.push(fmtRow(r))
    const latest = rows[rows.length - 1]
    const comments = Array.isArray(latest?.top_comments) ? (latest.top_comments as unknown[]).slice(0, 8) : []
    if (comments.length) {
      lines.push('\nRECENT TOP COMMENTS:')
      for (const c of comments) lines.push(`  - ${String(c).slice(0, 200)}`)
    }
  }

  const readKeys = Object.keys(reads)
  if (readKeys.length) {
    lines.push('\nSAVED READS (pulled by their Claude extension):')
    for (const k of readKeys) {
      lines.push(`\n[${PACK_LABELS[k] ?? k}]`)
      lines.push(reads[k].slice(0, 4000))
    }
  }

  lines.push('\nWrite their full 7-section playbook now. Cite their real numbers and reads.')
  return lines.join('\n')
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Playbook is not configured on the server' }, { status: 500 })

  if (REQUIRE_PRO) {
    const { data: profile } = await supabase.from('profiles').select('tier').eq('id', user.id).single()
    if (profile?.tier !== 'pro') return NextResponse.json({ error: 'requires_pro' }, { status: 402 })
  }

  let brand = ''
  let platform = 'instagram'
  let reads: Record<string, string> = {}
  try {
    const body = (await req.json()) as { brand?: string; platform?: string; reads?: Record<string, string> }
    brand = body?.brand ?? ''
    if (typeof body?.platform === 'string') platform = body.platform
    if (body?.reads && typeof body.reads === 'object') {
      for (const [k, v] of Object.entries(body.reads)) {
        if (typeof v === 'string' && v.trim()) reads[k] = v
      }
    }
  } catch {
    /* body optional */
  }

  // Pull this brand+platform's saved number snapshots (RLS-scoped). Missing table
  // or no rows is fine when the user has qualitative reads to work from.
  let rows: SnapshotRow[] = []
  let q = supabase
    .from('social_snapshots')
    .select('platform, captured_at, followers, views, reach, pct_non_followers, likes, comments, saves, shares, follows, engagement_rate, top_comments')
    .eq('user_id', user.id)
    .eq('brand_ref', brand)
    .order('captured_at', { ascending: true })
    .limit(60)
  if (platform) q = q.eq('platform', platform)
  const { data, error } = await q
  if (error && error.code !== '42P01') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  rows = (data as SnapshotRow[] | null) ?? []

  if (!rows.length && !Object.keys(reads).length) {
    return NextResponse.json(
      { error: 'No data yet. Pull at least one pack (Update numbers or What’s working) and save it, then build your playbook.' },
      { status: 400 },
    )
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserContent(platform, rows, reads) }],
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
    if (!text) return NextResponse.json({ error: 'The playbook came back empty. Try again.' }, { status: 502 })

    return NextResponse.json({ playbook: noDashes(text) })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'playbook_failed'
    console.error('[brand/playbook]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
