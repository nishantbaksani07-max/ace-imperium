import { decodeEntities } from './lookup'

/*
 * Pure helpers for the keyless channel scan (/api/studio/channel).
 *
 * The whole feature rides YouTube's public RSS feed
 * (youtube.com/feeds/videos.xml?channel_id=UC...), which needs no key, no
 * OAuth, and no Google app verification. It returns a channel's latest ~15
 * videos with titles, view counts, and publish dates - exactly the material
 * the Studio tile needs for its voice-match + don't-repeat prompt. Deeper
 * history and private analytics stay behind the optional YouTube Connect.
 */

/**
 * Normalize whatever a user types into something we can resolve:
 *  - a bare UC... channel id            -> { id }
 *  - "@handle" / "youtube.com/@handle"  -> { handle }
 *  - "youtube.com/channel/UC..."        -> { id }
 * Anything else (or absurd length) -> null.
 */
export function normalizeChannelInput(
  raw: string,
): { id: string } | { handle: string } | null {
  if (typeof raw !== 'string') return null
  const input = raw.trim()
  if (!input || input.length > 200) return null

  const idMatch = input.match(/(UC[A-Za-z0-9_-]{22})/)
  if (idMatch) return { id: idMatch[1] }

  // "@handle" possibly inside a URL; YouTube handles are 3-30 word chars,
  // dots and hyphens included.
  const handleMatch = input.match(/@([A-Za-z0-9._-]{3,30})/)
  if (handleMatch) return { handle: handleMatch[1] }

  // A bare handle typed without the @ ("example"). Reject spaces and URLs.
  if (/^[A-Za-z0-9._-]{3,30}$/.test(input)) return { handle: input }

  return null
}

/** Pull the canonical UC... id out of a channel page's HTML. */
export function extractChannelId(html: string): string | null {
  const m =
    html.match(/"channelId":"(UC[A-Za-z0-9_-]{22})"/) ||
    html.match(/channel_id=(UC[A-Za-z0-9_-]{22})/)
  return m ? m[1] : null
}

export interface ChannelFeedVideo {
  videoId: string
  title: string
  published: string | null // ISO date from the feed
  views: number | null
}

export interface ChannelFeed {
  title: string | null
  videos: ChannelFeedVideo[]
}

/**
 * Parse the public RSS feed XML. Regex on a fixed, Google-generated format;
 * a malformed feed just yields fewer entries, never a throw.
 */
export function parseChannelFeed(xml: string): ChannelFeed {
  const channelTitle = xml.match(/<title>([\s\S]*?)<\/title>/)
  const videos: ChannelFeedVideo[] = []
  const entries = xml.split('<entry>').slice(1)
  for (const entry of entries) {
    const id = entry.match(/<yt:videoId>([A-Za-z0-9_-]{11})<\/yt:videoId>/)?.[1]
    const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]
    if (!id || !title) continue
    const published = entry.match(/<published>([^<]+)<\/published>/)?.[1] ?? null
    const viewsRaw = entry.match(/<media:statistics[^>]*views="(\d+)"/)?.[1]
    const views = viewsRaw != null ? Number(viewsRaw) : null
    videos.push({
      videoId: id,
      title: decodeEntities(title).trim(),
      published,
      views: Number.isFinite(views as number) ? views : null,
    })
  }
  return {
    title: channelTitle ? decodeEntities(channelTitle[1]).trim() || null : null,
    videos,
  }
}
