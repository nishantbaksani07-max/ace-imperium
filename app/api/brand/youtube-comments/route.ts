import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 45

/**
 * /api/brand/youtube-comments — AUTO-pull a YouTube channel's recent public
 * comments via the Data API (no Chrome paste, no OAuth), then run them through
 * Claude to return the tagged good/bad rundown the Comments panel expects
 * (MEANING + tagged bullet list). YouTube only; public top-level comments only
 * (replies and private metrics aren't available without OAuth).
 *
 * Reuses the channel→uploads→videos resolution from /api/brand/videos, then
 * commentThreads.list per recent video. Needs YOUTUBE_API_KEY + ANTHROPIC_API_KEY.
 */

const MODEL = 'claude-opus-4-8' // swap to claude-sonnet-4-6 to cut cost (no web tools)
const VIDEO_COUNT = 6
const PER_VIDEO = 25

interface RawComment { author: string; text: string; likes: number; video: string }
interface AnthropicBlock { type: string; text?: string }
interface AnthropicResponse { content?: AnthropicBlock[]; error?: { message?: string } }

function normalizeHandle(raw: string): string {
  return raw.trim()
    .replace(/^https?:\/\/(www\.)?youtube\.com\//i, '')
    .replace(/^@/, '')
    .replace(/^(c|channel|user)\//i, '')
    .split(/[/?#]/)[0]
    .trim()
}

async function gget(url: URL): Promise<Response> {
  return fetch(url.toString(), { cache: 'no-store' })
}

async function fetchComments(rawHandle: string): Promise<RawComment[]> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) throw new Error('YouTube isn’t configured yet. Admin needs to set YOUTUBE_API_KEY.')
  const handle = normalizeHandle(rawHandle)
  if (!handle) throw new Error('Couldn’t parse a YouTube handle from that input')

  // 1. channel → uploads playlist
  const chUrl = new URL('https://www.googleapis.com/youtube/v3/channels')
  chUrl.searchParams.set('part', 'contentDetails')
  chUrl.searchParams.set('forHandle', `@${handle}`)
  chUrl.searchParams.set('key', key)
  const chRes = await gget(chUrl)
  if (chRes.status === 403) throw new Error('YouTube daily quota exceeded. Try again tomorrow.')
  if (!chRes.ok) throw new Error(`YouTube returned ${chRes.status}. Check the handle.`)
  const chData = await chRes.json() as { items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }> }
  const uploads = chData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  if (!uploads) throw new Error('No YouTube channel matches that handle')

  // 2. uploads → recent video ids + titles
  const plUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems')
  plUrl.searchParams.set('part', 'snippet,contentDetails')
  plUrl.searchParams.set('playlistId', uploads)
  plUrl.searchParams.set('maxResults', String(VIDEO_COUNT))
  plUrl.searchParams.set('key', key)
  const plRes = await gget(plUrl)
  if (!plRes.ok) throw new Error(`YouTube returned ${plRes.status}`)
  const plData = await plRes.json() as {
    items?: Array<{ contentDetails?: { videoId?: string }; snippet?: { title?: string } }>
  }
  const vids = (plData.items ?? [])
    .map((it) => ({ id: it.contentDetails?.videoId, title: it.snippet?.title || 'video' }))
    .filter((v): v is { id: string; title: string } => !!v.id)
  if (!vids.length) return []

  // 3. each video → top-level comments (comments may be disabled → skip)
  const out: RawComment[] = []
  for (const v of vids) {
    const cUrl = new URL('https://www.googleapis.com/youtube/v3/commentThreads')
    cUrl.searchParams.set('part', 'snippet')
    cUrl.searchParams.set('videoId', v.id)
    cUrl.searchParams.set('order', 'relevance')
    cUrl.searchParams.set('maxResults', String(PER_VIDEO))
    cUrl.searchParams.set('textFormat', 'plainText')
    cUrl.searchParams.set('key', key)
    const cRes = await gget(cUrl)
    if (!cRes.ok) continue // disabled / not found — skip this video
    const cData = await cRes.json() as {
      items?: Array<{ snippet?: { topLevelComment?: { snippet?: { authorDisplayName?: string; textOriginal?: string; likeCount?: number } } } }>
    }
    for (const it of cData.items ?? []) {
      const s = it.snippet?.topLevelComment?.snippet
      const text = (s?.textOriginal || '').trim()
      if (!text) continue
      out.push({ author: s?.authorDisplayName || 'viewer', text, likes: s?.likeCount ?? 0, video: v.title })
    }
  }
  return out
}

const SYSTEM = `You analyze a creator's YouTube comments. Read ALL of them and run down EVERYTHING, the good and the bad — never soften it or skip the negatives.

Return EXACTLY this, nothing else:
MEANING: <2 to 3 sentences: the honest overall read, what is landing AND what is not>
COMMENTS:
- [+] <a real positive/praise comment, verbatim or near>
- [-] <a real criticism / complaint>
- [?] <a real question viewers asked>
- [>] <a real request or content idea>
(tag every line [+] positive, [-] negative, [?] question, [>] request; list as many real comments as the data supports, most useful first; keep the negatives.)`

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  let body: { handle?: string }
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const handle = String(body.handle || '').trim()
  if (!handle) return Response.json({ error: 'handle required' }, { status: 400 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return Response.json({ error: 'AI is not configured on the server' }, { status: 500 })

  let comments: RawComment[]
  try {
    comments = await fetchComments(handle)
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'YouTube fetch failed' }, { status: 502 })
  }
  if (!comments.length) {
    return Response.json({ error: 'No public comments found on recent videos (they may be disabled).' }, { status: 404 })
  }

  const list = comments
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 120)
    .map((c) => `(${c.likes}♥ on "${c.video.slice(0, 40)}") ${c.author}: ${c.text.replace(/\s+/g, ' ').slice(0, 300)}`)
    .join('\n')

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1600,
        system: SYSTEM,
        messages: [{ role: 'user', content: `Here are ${comments.length} real comments from my recent videos:\n\n${list}\n\nGive the rundown in the required format.` }],
      }),
    })
    const data = await res.json().catch(() => ({})) as AnthropicResponse
    if (!res.ok) return Response.json({ error: data?.error?.message || `Anthropic ${res.status}` }, { status: 502 })
    const read = (data.content ?? []).filter((b) => b.type === 'text' && b.text).map((b) => b.text as string).join('\n').trim()
    if (!read) return Response.json({ error: 'No read came back. Try again.' }, { status: 502 })
    return Response.json({ read, count: comments.length })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'AI request failed' }, { status: 502 })
  }
}
