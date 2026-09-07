/**
 * Pure helpers for the Studio video lookup route (app/api/studio/lookup).
 * Kept out of the route file because Next route modules may only export
 * handlers, and because these are the testable core of the URL flow.
 */

/** Extract the 11-char video id from any of the usual YouTube URL shapes. */
export function parseVideoId(raw: string): string | null {
  const url = raw.trim()
  if (!url || url.length > 500) return null
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
  )
  return m ? m[1] : null
}

/** ISO8601 duration (PT1H2M3S) -> "1:02:03" / "12:41". Null when unparseable. */
export function formatDuration(iso: string): string | null {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!m) return null
  const h = parseInt(m[1] || '0', 10)
  const min = parseInt(m[2] || '0', 10)
  const s = parseInt(m[3] || '0', 10)
  const two = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${two(min)}:${two(s)}` : `${min}:${two(s)}`
}

/** Minimal HTML entity decode for timedtext transcript text. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
}
