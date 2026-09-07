/**
 * Safety + presentation for the maker's external links (the "one link" + IG).
 *
 * Links are user-provided and rendered as <a href> on a PUBLIC page, so they
 * must be sanitized: only http(s), never javascript:/data:/etc. Normalized on
 * save AND defensively re-checked on render.
 */

/**
 * Coerce raw user input into a safe absolute http(s) URL, or null if it can't
 * be one. Prepends https:// when the scheme is missing (people type
 * "youtube.com/@me"). Rejects any non-http(s) scheme.
 */
export function normalizeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!url.hostname.includes('.')) return null // reject bare hosts like "https://foo"

  return url.toString()
}

/** Bare hostname for display, e.g. "youtube.com" from a full URL. */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** A friendly label for the primary link button. */
export function primaryLinkLabel(url: string): string {
  const host = linkHost(url)
  if (host.includes('youtube.com') || host.includes('youtu.be')) return 'Watch on YouTube'
  if (host.includes('tiktok.com')) return 'Watch on TikTok'
  if (host.includes('twitch.tv')) return 'Watch on Twitch'
  if (host.includes('patreon.com')) return 'Support on Patreon'
  if (host.includes('substack.com')) return 'Read the newsletter'
  return host
}

/** True if a URL looks like an Instagram profile (lenient). */
export function isInstagramUrl(url: string): boolean {
  return linkHost(url).includes('instagram.com')
}
