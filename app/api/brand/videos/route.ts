import { createClient } from '@/lib/supabase/server'

/**
 * /api/brand/videos — fetch a channel's recent uploads (thumbnail, title,
 * views, likes, comments, duration) for a single (platform, handle) pair.
 *
 * YouTube only. Uses the official Data API v3 (free within the ~10K daily
 * quota), in three calls: channel → uploads playlist → recent video stats.
 * Needs `YOUTUBE_API_KEY` in env.
 *
 * Only PUBLIC metrics are available without OAuth: views, likes, comments,
 * published date, duration. CTR / average-view-duration / retention are
 * private — those come in via the master-prompt paste (Top/flop section),
 * never from this endpoint.
 *
 * Auth required (so the YouTube quota isn't burnable by anyone on the
 * internet). RLS isn't relevant — we read no Supabase rows, just proxy the
 * public Data API and let the client render the result.
 */

export interface BrandVideo {
  id: string
  title: string
  thumbnail: string
  url: string
  publishedAt: string
  views: number | null
  likes: number | null
  comments: number | null
  duration: string | null
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { platform?: string; handle?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const platform = String(body.platform || '').toLowerCase()
  const handle = String(body.handle || '').trim()
  if (!platform || !handle) {
    return Response.json({ error: 'platform and handle required' }, { status: 400 })
  }
  if (platform !== 'youtube' && platform !== 'youtube_long') {
    return Response.json({
      error: `Recent-video stats are only available for YouTube right now.`,
    }, { status: 400 })
  }

  try {
    const videos = await fetchYouTubeVideos(handle)
    return Response.json({ videos, fetchedAt: new Date().toISOString() })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error'
    return Response.json({ error: message }, { status: 502 })
  }
}

// -----------------------------------------------------------------------------
// YouTube — official Data API v3. Three hops:
//   1. channels.list(forHandle, part=contentDetails) → uploads playlist id
//   2. playlistItems.list(playlistId, part=contentDetails) → recent video ids
//   3. videos.list(id=…, part=snippet,statistics,contentDetails) → the cards
// -----------------------------------------------------------------------------

async function fetchYouTubeVideos(rawHandle: string): Promise<BrandVideo[]> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) {
    throw new Error('YouTube isn’t configured yet. Admin needs to set YOUTUBE_API_KEY.')
  }
  const handle = normalizeYouTubeHandle(rawHandle)
  if (!handle) {
    throw new Error('Couldn’t parse a YouTube handle from that input')
  }

  const chUrl = new URL('https://www.googleapis.com/youtube/v3/channels')
  chUrl.searchParams.set('part', 'contentDetails')
  chUrl.searchParams.set('forHandle', `@${handle}`)
  chUrl.searchParams.set('key', key)
  const chRes = await fetch(chUrl.toString(), { cache: 'no-store' })
  if (chRes.status === 403) throw new Error('YouTube daily quota exceeded. Try again tomorrow.')
  if (!chRes.ok) throw new Error(`YouTube returned ${chRes.status}. Check the handle.`)
  const chData = await chRes.json() as {
    items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }>
  }
  const uploads = chData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  if (!uploads) throw new Error('No YouTube channel matches that handle')

  const plUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems')
  plUrl.searchParams.set('part', 'contentDetails')
  plUrl.searchParams.set('playlistId', uploads)
  plUrl.searchParams.set('maxResults', '15')
  plUrl.searchParams.set('key', key)
  const plRes = await fetch(plUrl.toString(), { cache: 'no-store' })
  if (!plRes.ok) throw new Error(`YouTube returned ${plRes.status}`)
  const plData = await plRes.json() as {
    items?: Array<{ contentDetails?: { videoId?: string } }>
  }
  const ids = (plData.items ?? [])
    .map((it) => it.contentDetails?.videoId)
    .filter((v): v is string => !!v)
  if (!ids.length) return []

  const vUrl = new URL('https://www.googleapis.com/youtube/v3/videos')
  vUrl.searchParams.set('part', 'snippet,statistics,contentDetails')
  vUrl.searchParams.set('id', ids.join(','))
  vUrl.searchParams.set('key', key)
  const vRes = await fetch(vUrl.toString(), { cache: 'no-store' })
  if (!vRes.ok) throw new Error(`YouTube returned ${vRes.status}`)
  const vData = await vRes.json() as {
    items?: Array<{
      id?: string
      snippet?: { title?: string; publishedAt?: string; thumbnails?: { default?: { url?: string }; medium?: { url?: string }; high?: { url?: string } } }
      statistics?: { viewCount?: string; likeCount?: string; commentCount?: string }
      contentDetails?: { duration?: string }
    }>
  }

  return (vData.items ?? []).map((v): BrandVideo => {
    const t = v.snippet?.thumbnails
    return {
      id: v.id ?? '',
      title: v.snippet?.title ?? 'Untitled',
      thumbnail: t?.medium?.url ?? t?.high?.url ?? t?.default?.url ?? '',
      url: `https://www.youtube.com/watch?v=${v.id ?? ''}`,
      publishedAt: v.snippet?.publishedAt ?? '',
      views: numOrNull(v.statistics?.viewCount),
      likes: numOrNull(v.statistics?.likeCount),
      comments: numOrNull(v.statistics?.commentCount),
      duration: isoDurationToClock(v.contentDetails?.duration),
    }
  })
}

function numOrNull(raw?: string): number | null {
  const n = parseInt(raw ?? '', 10)
  return Number.isFinite(n) ? n : null
}

/** ISO-8601 duration (PT1M5S) → clock string ("1:05" / "1:02:03"). */
function isoDurationToClock(iso?: string): string | null {
  if (!iso) return null
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso)
  if (!m) return null
  const h = parseInt(m[1] ?? '0', 10)
  const min = parseInt(m[2] ?? '0', 10)
  const s = parseInt(m[3] ?? '0', 10)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(min)}:${pad(s)}` : `${min}:${pad(s)}`
}

function normalizeYouTubeHandle(raw: string): string {
  return raw
    .replace(/^https?:\/\/(www\.)?youtube\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
    .trim()
}
