import type { ParsedSnapshot, SocialPlatform } from './types'

/**
 * Parse the stats the user pastes back from their Claude Chrome extension.
 *
 * Tolerant by design: the generated prompt asks for a strict KEY: value block,
 * but real pastes carry stray prose, commas, and "12.3K"-style shorthand. We
 * read every `KEY: value` line, normalise the key, coerce the value to a number
 * (expanding K/M/B), and map known keys to columns; unknown numeric keys go to
 * `extra`. Lines after TOP_COMMENTS that look like bullets become topComments.
 */

const KEY_MAP: Record<string, keyof ParsedSnapshot> = {
  followers: 'followers',
  subscribers: 'followers',
  follower_count: 'followers',
  views: 'views',
  impressions: 'views',
  reach: 'reach',
  accounts_reached: 'reach',
  non_follower_pct: 'pctNonFollowers',
  non_followers: 'pctNonFollowers',
  pct_non_followers: 'pctNonFollowers',
  likes: 'likes',
  comments: 'comments',
  saves: 'saves',
  bookmarks: 'saves',
  shares: 'shares',
  follows: 'follows',
  new_followers: 'follows',
  engagement_rate: 'engagementRate',
  engagement: 'engagementRate',
}

/** "12.3K" → 12300, "1.2M" → 1200000, "1,234" → 1234, "n/a" → null. */
export function coerceNumber(raw: string): number | null {
  const s = raw.trim().toLowerCase()
  if (!s || s === 'n/a' || s === 'na' || s === '-' || s === '—') return null
  const m = s.replace(/,/g, '').match(/(-?\d+(?:\.\d+)?)\s*([kmb])?/)
  if (!m) return null
  let n = parseFloat(m[1])
  if (!Number.isFinite(n)) return null
  const suffix = m[2]
  if (suffix === 'k') n *= 1_000
  else if (suffix === 'm') n *= 1_000_000
  else if (suffix === 'b') n *= 1_000_000_000
  return Math.round(n * 100) / 100
}

function normalizeKey(k: string): string {
  return k.trim().toLowerCase().replace(/[%()]/g, '').replace(/[\s/-]+/g, '_').replace(/_+$/g, '')
}

export function parseSnapshot(text: string, platformHint?: SocialPlatform): ParsedSnapshot {
  const lines = text.split('\n')
  const out: ParsedSnapshot = {
    platform: platformHint ?? 'other',
    period: '28d',
    topComments: [],
    extra: {},
    raw: text,
  }

  let inComments = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Once inside TOP_COMMENTS, bullet/quote lines are comments until the next KEY:.
    if (inComments) {
      const bullet = trimmed.replace(/^[-*•]\s*/, '').replace(/^["“]|["”]$/g, '').trim()
      if (/^[A-Za-z_ ]+:/.test(trimmed) && !/^top_comments/i.test(trimmed)) {
        inComments = false // a new KEY: started — fall through to key handling
      } else {
        if (bullet) out.topComments.push(bullet.slice(0, 280))
        continue
      }
    }

    const colon = trimmed.indexOf(':')
    if (colon === -1) continue
    const key = normalizeKey(trimmed.slice(0, colon))
    const value = trimmed.slice(colon + 1).trim()

    if (key === 'top_comments') {
      inComments = true
      const inline = value.replace(/^["“]|["”]$/g, '').trim()
      if (inline) out.topComments.push(inline.slice(0, 280))
      continue
    }
    if (key === 'platform') {
      const p = value.toLowerCase()
      if (p === 'youtube' || p === 'instagram' || p === 'tiktok') out.platform = p
      continue
    }
    if (key === 'period') {
      if (value) out.period = value.slice(0, 40)
      continue
    }

    const num = coerceNumber(value)
    if (num == null) continue
    const mapped = KEY_MAP[key]
    if (mapped) {
      ;(out[mapped] as number) = num
    } else {
      out.extra[key] = num
    }
  }

  return out
}
