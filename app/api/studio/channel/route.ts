import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-tier'
import {
  normalizeChannelInput,
  extractChannelId,
  parseChannelFeed,
} from '@/lib/studio/channel'

export const dynamic = 'force-dynamic'
export const maxDuration = 15

/*
 * Studio channel scan - the zero-key path that makes the tile channel-aware.
 *
 * Give it a handle ("@example"), a channel URL, or a raw UC id, and it
 * returns the channel's latest ~15 videos (titles, views, publish dates) from
 * YouTube's public RSS feed. No API key, no OAuth, no Google verification
 * gate, nothing that can expire: this is the unbreakable floor under the
 * tile's voice-match and don't-repeat features. The optional YouTube Connect
 * adds full history + private analytics on top; it never replaces this.
 *
 * Session-gated like every studio route (a convenience, not an open proxy),
 * reached through the host's trusted 'studio:channel' verb.
 */

async function fetchText(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'accept-language': 'en' },
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireUser()
  if (!gate.ok) return gate.response

  let body: { channel?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = normalizeChannelInput(typeof body.channel === 'string' ? body.channel : '')
  if (!parsed) return NextResponse.json({ error: 'invalid_channel' }, { status: 400 })

  // Resolve a handle to the canonical UC id via the public channel page.
  let channelId = 'id' in parsed ? parsed.id : null
  let handle = 'handle' in parsed ? parsed.handle : null
  if (!channelId && handle) {
    const page = await fetchText(
      `https://www.youtube.com/@${encodeURIComponent(handle)}`,
      6000,
    )
    channelId = page ? extractChannelId(page) : null
  }
  if (!channelId) return NextResponse.json({ error: 'channel_not_found' }, { status: 404 })

  const xml = await fetchText(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`,
    6000,
  )
  if (!xml) return NextResponse.json({ error: 'channel_not_found' }, { status: 404 })

  const feed = parseChannelFeed(xml)
  if (feed.videos.length === 0 && !feed.title) {
    return NextResponse.json({ error: 'channel_not_found' }, { status: 404 })
  }

  return NextResponse.json({
    channel: {
      id: channelId,
      handle: handle ? `@${handle}` : null,
      title: feed.title,
      videos: feed.videos,
    },
  })
}
