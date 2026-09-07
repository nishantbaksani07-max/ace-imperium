import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-tier'
import { parseVideoId, formatDuration, decodeEntities } from '@/lib/studio/lookup'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

/*
 * Studio video lookup - turns a pasted YouTube URL into the material the tile
 * needs: title, author, duration, and (best effort) the spoken transcript, so
 * the auto-package flow can run on a real video with zero manual export.
 *
 * Resolution ladder, most to least rich, degrading gracefully:
 *   1. YouTube Data API v3 (needs server env YOUTUBE_API_KEY): snippet +
 *      contentDetails + statistics -> title, author, description, duration,
 *      views, publish date.
 *   2. oEmbed (no key, no auth): title + author only.
 *   3. Captions via the public timedtext endpoint (no key): only videos with
 *      public non-auto captions expose these; failure is normal and the tile
 *      falls back to "paste your script" copy.
 *
 * Only public data is fetched; the session gate exists so this stays a
 * first-party convenience, not an open proxy. Reached through the host's
 * trusted 'studio:lookup' verb (see lib/tiles/useTileHost.ts), and like every
 * studio route it re-checks the session itself.
 */

const MAX_CAPTION_CHARS = 24000 // matches /api/studio/package MAX_INPUT_CHARS

interface LookupVideo {
  videoId: string
  title: string
  author: string | null
  description: string | null
  duration: string | null // "M:SS" or "H:MM:SS"
  publishedAt: string | null // ISO from YouTube; display only
  stats: { views: number | null }
  captions: string | null
  source: 'api' | 'oembed'
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function fetchText(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

/** Best-effort public captions. Returns null quietly on any miss. */
async function fetchCaptions(videoId: string): Promise<string | null> {
  const list = await fetchText(
    `https://video.google.com/timedtext?type=list&v=${encodeURIComponent(videoId)}`,
    4000,
  )
  if (!list) return null
  // <track ... lang_code="en" name=".." kind=".." />
  const tracks = Array.from(list.matchAll(/<track\s+([^>]*?)\/?>(?:<\/track>)?/g)).map((m) => {
    const attrs = m[1]
    const get = (k: string) => attrs.match(new RegExp(`${k}="([^"]*)"`))?.[1] ?? ''
    return { lang: get('lang_code'), name: get('name'), kind: get('kind') }
  })
  if (tracks.length === 0) return null
  const pick =
    tracks.find((t) => t.lang.startsWith('en') && t.kind !== 'asr') ||
    tracks.find((t) => t.lang.startsWith('en')) ||
    tracks[0]
  const qs = new URLSearchParams({ v: videoId, lang: pick.lang })
  if (pick.name) qs.set('name', pick.name)
  if (pick.kind) qs.set('kind', pick.kind)
  const xml = await fetchText(`https://video.google.com/timedtext?${qs.toString()}`, 5000)
  if (!xml) return null
  const parts = Array.from(xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)).map((m) =>
    decodeEntities(m[1]).replace(/\s+/g, ' ').trim(),
  )
  const joined = parts.filter(Boolean).join(' ').trim()
  if (!joined) return null
  return joined.length > MAX_CAPTION_CHARS ? joined.slice(0, MAX_CAPTION_CHARS) : joined
}

interface YtApiItem {
  snippet?: {
    title?: string
    channelTitle?: string
    description?: string
    publishedAt?: string
  }
  contentDetails?: { duration?: string }
  statistics?: { viewCount?: string }
}

export async function POST(request: NextRequest) {
  const gate = await requireUser()
  if (!gate.ok) return gate.response

  let body: { url?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const url = typeof body.url === 'string' ? body.url : ''
  const videoId = parseVideoId(url)
  if (!videoId) return NextResponse.json({ error: 'invalid_url' }, { status: 400 })

  const video: LookupVideo = {
    videoId,
    title: '',
    author: null,
    description: null,
    duration: null,
    publishedAt: null,
    stats: { views: null },
    captions: null,
    source: 'oembed',
  }

  // Rung 1: Data API when the server has a key. A failure here falls through
  // rather than erroring: the ladder exists so the tile works with zero setup.
  const apiKey = process.env.YOUTUBE_API_KEY
  if (apiKey) {
    const data = (await fetchJson(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`,
      6000,
    )) as { items?: YtApiItem[] } | null
    const item = data?.items?.[0]
    if (item?.snippet?.title) {
      video.source = 'api'
      video.title = item.snippet.title
      video.author = item.snippet.channelTitle ?? null
      video.description = item.snippet.description?.slice(0, MAX_CAPTION_CHARS) ?? null
      video.publishedAt = item.snippet.publishedAt ?? null
      video.duration = item.contentDetails?.duration
        ? formatDuration(item.contentDetails.duration)
        : null
      const views = Number(item.statistics?.viewCount)
      video.stats.views = Number.isFinite(views) ? views : null
    }
  }

  // Rung 2: oEmbed needs no key and covers title + author.
  if (!video.title) {
    const data = (await fetchJson(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
      5000,
    )) as { title?: string; author_name?: string } | null
    if (data?.title) {
      video.title = data.title
      video.author = data.author_name ?? null
    }
  }

  if (!video.title) {
    // Neither rung resolved it: private, deleted, or upstream trouble.
    return NextResponse.json({ error: 'video_not_found' }, { status: 404 })
  }

  // Rung 3: captions, best effort, never fatal.
  video.captions = await fetchCaptions(videoId)

  return NextResponse.json({ video })
}
