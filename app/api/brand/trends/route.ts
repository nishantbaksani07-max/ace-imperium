import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

/*
 * Google Trends interest-over-time for one keyword.
 *
 * Google Trends has NO official API. This hits the same undocumented JSON
 * endpoints the public site uses (explore -> widgetdata/multiline), which
 * requires a token handshake and an NID cookie. It works, but Google
 * rate-limits datacenter IPs, so from Vercel it can return 429 / a consent
 * page. On any failure we return { status: 'unavailable' } (HTTP 200) and the
 * client falls back to an "Open in Google Trends" link. A paid source
 * (SerpApi / DataForSEO) is the bulletproof upgrade.
 *
 * Returns { status: 'ok', keyword, points: [{ label, value }] } where value is
 * Google's 0-100 relative interest index.
 */

const HL = 'en-US'
const TZ = '0'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** Google prefixes API JSON with ")]}'," — slice to the first brace/bracket. */
function stripPrefix(t: string): string {
  const b = t.indexOf('{')
  const a = t.indexOf('[')
  const candidates = [b, a].filter((n) => n >= 0)
  if (!candidates.length) return t
  return t.slice(Math.min(...candidates))
}

function gfetch(url: string, cookie?: string): Promise<Response> {
  return fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'application/json, text/plain, */*',
      ...(cookie ? { cookie } : {}),
    },
    // Trends is a public endpoint; never send our cookies.
    cache: 'no-store',
  })
}

const UNAVAILABLE = (keyword: string) =>
  NextResponse.json({ status: 'unavailable', keyword }, { status: 200 })

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as { keyword?: string; geo?: string; time?: string } | null
  const keyword = (body?.keyword || '').trim()
  const geo = (body?.geo || '').trim() // '' = worldwide
  const time = (body?.time || 'today 12-m').trim()
  if (!keyword) return NextResponse.json({ error: 'missing_keyword' }, { status: 400 })

  try {
    // 1) Grab an NID cookie — Trends 429s the API calls without one.
    let cookie: string | undefined
    try {
      const home = await gfetch('https://trends.google.com/?geo=US')
      const sc = home.headers.get('set-cookie')
      if (sc) cookie = sc.split(',').map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ')
    } catch { /* proceed without; may still work */ }

    // 2) explore -> the TIMESERIES widget's token + request
    const exploreReq = JSON.stringify({
      comparisonItem: [{ keyword, geo, time }],
      category: 0,
      property: '',
    })
    const exploreUrl =
      `https://trends.google.com/trends/api/explore?hl=${HL}&tz=${TZ}&req=${encodeURIComponent(exploreReq)}`
    const exRes = await gfetch(exploreUrl, cookie)
    if (!exRes.ok) return UNAVAILABLE(keyword)
    const exJson = JSON.parse(stripPrefix(await exRes.text())) as {
      widgets?: Array<{ id: string; token: string; request: unknown }>
    }
    const widget = (exJson.widgets ?? []).find((w) => w.id === 'TIMESERIES')
    if (!widget?.token || !widget?.request) return UNAVAILABLE(keyword)

    // 3) widgetdata/multiline -> the actual interest-over-time series
    const mlUrl =
      `https://trends.google.com/trends/api/widgetdata/multiline?hl=${HL}&tz=${TZ}` +
      `&req=${encodeURIComponent(JSON.stringify(widget.request))}&token=${encodeURIComponent(widget.token)}`
    const mlRes = await gfetch(mlUrl, cookie)
    if (!mlRes.ok) return UNAVAILABLE(keyword)
    const mlJson = JSON.parse(stripPrefix(await mlRes.text())) as {
      default?: { timelineData?: Array<{ formattedTime?: string; formattedAxisTime?: string; value?: number[] }> }
    }
    const timeline = mlJson?.default?.timelineData ?? []
    const points = timeline
      .filter((d) => Array.isArray(d.value) && typeof d.value[0] === 'number')
      .map((d) => ({ label: d.formattedTime || d.formattedAxisTime || '', value: d.value![0] }))
    if (points.length < 4) return UNAVAILABLE(keyword)

    return NextResponse.json({ status: 'ok', keyword, geo, points })
  } catch (e) {
    console.error('[brand/trends] error:', e)
    return UNAVAILABLE(keyword)
  }
}
