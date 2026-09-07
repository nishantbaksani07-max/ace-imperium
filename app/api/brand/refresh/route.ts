import { createClient } from '@/lib/supabase/server'

/**
 * /api/brand/refresh — fetch a current follower count for a single
 * (platform, handle) pair.
 *
 * Two backends, both selected purely off the platform string:
 *
 *   - youtube / youtube_long → YouTube Data API v3 (official, free
 *     within the ~10K daily quota). Needs `YOUTUBE_API_KEY` in env.
 *
 *   - tiktok → server-side fetch of the public profile page,
 *     parsing the follower count out of the embedded
 *     __UNIVERSAL_DATA_FOR_REHYDRATION__ JSON blob. No key, may
 *     break when TikTok shuffles their markup.
 *
 * Everything else is intentionally a 400 — instagram/x/linkedin etc.
 * don't have free, reliable ways to read follower counts without
 * OAuth or paid scrapers, so we tell the user to enter manually
 * rather than pretend.
 *
 * Auth required (so the YouTube quota isn't burnable by anyone on
 * the internet). RLS isn't relevant here since we don't read or
 * write Supabase rows — we just return the count and let the client
 * persist it to localStorage.
 */
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

  try {
    let result: { followers: number; avatarUrl?: string; lifetimeViews?: number; videoCount?: number }
    if (platform === 'youtube' || platform === 'youtube_long') {
      result = await fetchYouTube(handle)
    } else if (platform === 'tiktok') {
      result = await fetchTikTok(handle)
    } else {
      return Response.json({
        error: `${platform} doesn't support live refresh. Enter the count manually for now.`,
      }, { status: 400 })
    }
    return Response.json({
      followers: result.followers,
      avatarUrl: result.avatarUrl,
      lifetimeViews: result.lifetimeViews,
      videoCount: result.videoCount,
      fetchedAt: new Date().toISOString(),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error'
    // 502 communicates "upstream said no" — the user's input is fine,
    // the third-party (YouTube / TikTok) is the blocker.
    return Response.json({ error: message }, { status: 502 })
  }
}

// -----------------------------------------------------------------------------
// YouTube — official Data API v3.
//
// `forHandle` is the modern lookup path (added 2023). Accepts the handle
// with or without the leading "@". We normalize the input so users can
// paste a raw handle, a URL, or "@handle" and have it Just Work.
// -----------------------------------------------------------------------------

async function fetchYouTube(rawHandle: string): Promise<{
  followers: number
  avatarUrl?: string
  lifetimeViews?: number
  videoCount?: number
}> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) {
    throw new Error('YouTube isn’t configured yet. Admin needs to set YOUTUBE_API_KEY.')
  }

  const handle = normalizeYouTubeHandle(rawHandle)
  if (!handle) {
    throw new Error('Couldn’t parse a YouTube handle from that input')
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/channels')
  // `snippet` pulls thumbnails (profile picture), `statistics` pulls
  // subscriberCount + viewCount + videoCount in one call. The auto-KPI
  // rows on the brand detail page consume the last two.
  url.searchParams.set('part', 'snippet,statistics')
  url.searchParams.set('forHandle', `@${handle}`)
  url.searchParams.set('key', key)

  const res = await fetch(url.toString(), { cache: 'no-store' })

  if (res.status === 403) {
    throw new Error('YouTube daily quota exceeded. Try again tomorrow.')
  }
  if (!res.ok) {
    throw new Error(`YouTube returned ${res.status}. Check the handle.`)
  }

  const data = await res.json() as {
    items?: Array<{
      snippet?: { thumbnails?: { default?: { url?: string }; medium?: { url?: string }; high?: { url?: string } } }
      statistics?: {
        subscriberCount?: string
        hiddenSubscriberCount?: boolean
        viewCount?: string
        videoCount?: string
      }
    }>
  }
  if (!data.items?.length) {
    throw new Error('No YouTube channel matches that handle')
  }
  const item = data.items[0]
  const stats = item.statistics
  if (stats?.hiddenSubscriberCount) {
    throw new Error('This channel has subscriber count hidden')
  }
  const count = parseInt(stats?.subscriberCount ?? '', 10)
  if (!Number.isFinite(count)) {
    throw new Error('YouTube returned no subscriber number')
  }
  const thumbs = item.snippet?.thumbnails
  const avatarUrl = thumbs?.medium?.url ?? thumbs?.default?.url ?? thumbs?.high?.url

  // Lifetime totals — optional. Parse loosely; if either isn't a number
  // we just omit it (auto-KPI row hides instead of showing NaN).
  const lifetimeViewsNum = parseInt(stats?.viewCount ?? '', 10)
  const videoCountNum = parseInt(stats?.videoCount ?? '', 10)

  return {
    followers: count,
    avatarUrl,
    lifetimeViews: Number.isFinite(lifetimeViewsNum) ? lifetimeViewsNum : undefined,
    videoCount: Number.isFinite(videoCountNum) ? videoCountNum : undefined,
  }
}

function normalizeYouTubeHandle(raw: string): string {
  // Strip URL chrome if present, then any leading @.
  return raw
    .replace(/^https?:\/\/(www\.)?youtube\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
    .trim()
}

// -----------------------------------------------------------------------------
// TikTok — public profile page scrape.
//
// The page embeds its data in a script tag with id
// `__UNIVERSAL_DATA_FOR_REHYDRATION__` that contains the user's
// `followerCount` somewhere in the JSON. Pulling it via regex is
// brittle (TikTok periodically restructures), but adequate for a
// once-per-tap manual refresh.
//
// We use a realistic browser UA so we're not insta-blocked by their
// bot detection. Even with that, an occasional 403/429 is normal; the
// thrown error surfaces to the user with a "try again" hint.
// -----------------------------------------------------------------------------

async function fetchTikTok(rawHandle: string): Promise<{
  followers: number
  avatarUrl?: string
  lifetimeViews?: number
  videoCount?: number
}> {
  const handle = normalizeTikTokHandle(rawHandle)
  if (!handle) {
    throw new Error('Couldn’t parse a TikTok handle from that input')
  }

  const url = `https://www.tiktok.com/@${encodeURIComponent(handle)}`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    cache: 'no-store',
  })

  if (res.status === 404) {
    throw new Error('TikTok profile not found. Check the handle.')
  }
  if (res.status === 429) {
    throw new Error('TikTok is rate-limiting us. Try again in a minute.')
  }
  if (!res.ok) {
    throw new Error(`TikTok returned ${res.status}`)
  }

  const html = await res.text()
  // followerCount is embedded several ways; this regex is liberal enough
  // to catch the common shapes ({"followerCount":12345} or "followerCount":12345).
  const match = html.match(/"followerCount"\s*:\s*(\d+)/)
  if (!match) {
    throw new Error('Couldn’t read the follower count. TikTok may have changed their page.')
  }
  const count = parseInt(match[1], 10)
  if (!Number.isFinite(count)) {
    throw new Error('TikTok returned a non-number follower count')
  }

  // Best-effort avatar pull. TikTok embeds a few avatar URLs at
  // different sizes; we prefer "larger" → "Medium" → "Thumb". Each
  // is escaped JSON, so the regex captures up to the closing quote.
  // Failure is non-fatal — return just the count.
  let avatarUrl: string | undefined
  for (const key of ['avatarLarger', 'avatarMedium', 'avatarThumb']) {
    const re = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`)
    const m = html.match(re)
    if (m && m[1]) {
      // TikTok JSON-escapes slashes — unescape so the URL is usable.
      avatarUrl = m[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/')
      break
    }
  }

  // Lifetime totals — both come from the same SIGI_STATE blob. heartCount
  // = total likes across all videos (TikTok's headline "hearts"), videoCount
  // = uploaded video count. Same regex strategy as followerCount.
  const heartMatch = html.match(/"heartCount"\s*:\s*(\d+)/)
  const videoMatch = html.match(/"videoCount"\s*:\s*(\d+)/)
  const lifetimeViews = heartMatch ? parseInt(heartMatch[1], 10) : undefined
  const videoCount = videoMatch ? parseInt(videoMatch[1], 10) : undefined

  return {
    followers: count,
    avatarUrl,
    lifetimeViews: typeof lifetimeViews === 'number' && Number.isFinite(lifetimeViews) ? lifetimeViews : undefined,
    videoCount: typeof videoCount === 'number' && Number.isFinite(videoCount) ? videoCount : undefined,
  }
}

function normalizeTikTokHandle(raw: string): string {
  return raw
    .replace(/^https?:\/\/(www\.)?tiktok\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
    .trim()
}
