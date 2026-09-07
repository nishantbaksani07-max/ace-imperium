import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { StockQuote } from '@/app/app/finance/types'

/**
 * GET /api/finance/quote?tickers=VTI,VOO,QQQ,MO
 *
 * Server-side proxy to Finnhub /quote for the user's holdings. Returns
 * { quotes: { VTI: StockQuote, VOO: StockQuote, ... }, missing: ['BAD'] }.
 *
 * Caching strategy (the shared-cache pattern documented in SKILL.md):
 *
 *   Each Finnhub fetch uses `next: { revalidate: 900, tags: ['quote:VTI'] }`.
 *   Next.js's data cache is shared per-deployment, so the first user who asks
 *   for VTI pays the round-trip; every other user (or the same user re-asking)
 *   for the next 15 minutes gets the cached response without hitting Finnhub.
 *
 *   This is what keeps us inside Finnhub's free-tier 60 req/min limit: the
 *   limit is per server (not per user), and a 15-min cache means a popular
 *   ticker is fetched at most 4 times per hour no matter how many users hold
 *   it. The budget effectively scales with unique tickers across the userbase,
 *   not user count.
 *
 *   Per-user RLS-style isolation isn't needed here — quote data is public
 *   market info, identical for everyone. We still require auth so we don't
 *   become an open Finnhub proxy.
 *
 * Currency note: Finnhub /quote returns USD for US tickers. International
 * tickers (e.g. "NESN.SW") would return native currency — out of scope for
 * v1. The client converts USD → display currency using the existing FX rates.
 */

export const dynamic = 'force-dynamic'

const TICKER_PATTERN = /^[A-Z][A-Z0-9.\-]{0,9}$/
const MAX_TICKERS_PER_REQUEST = 25

interface FinnhubQuote {
  c: number   // current price
  d: number   // day change
  dp: number  // day change %
  h: number   // day high
  l: number   // day low
  o: number   // day open
  pc: number  // previous close
  t: number   // unix seconds
}

/** Finite positive number or null — Finnhub sends 0 for fields it has no data on. */
function posNum(v: unknown): number | null {
  return typeof v === 'number' && isFinite(v) && v > 0 ? v : null
}

async function fetchQuote(ticker: string, apiKey: string): Promise<StockQuote | null> {
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${apiKey}`
  // Per-ticker tagged cache: Next.js dedups identical fetches across users
  // for `revalidate` seconds. 900s = 15 min — see route comment above.
  let res: Response
  try {
    res = await fetch(url, {
      next: { revalidate: 900, tags: [`quote:${ticker}`] },
      signal: AbortSignal.timeout(8000),
    })
  } catch (e) {
    // Timeout / network error — treat as missing, but log so a hung upstream is observable.
    console.error(`[finance/quote] ${ticker} fetch failed:`, e instanceof Error ? e.message : e)
    return null
  }
  if (!res.ok) {
    // 429 = Finnhub rate-limit breach; log so it's distinguishable from a bad ticker.
    console.error(`[finance/quote] ${ticker} non-OK from Finnhub:`, res.status)
    return null
  }
  const data = (await res.json()) as Partial<FinnhubQuote>
  // Finnhub returns { c: 0, pc: 0, ... } for unknown symbols rather than
  // a 4xx — treat zero-current-price as "no such ticker."
  if (!data || typeof data.c !== 'number' || data.c <= 0) return null
  return {
    ticker,
    priceUSD: data.c,
    changePct: typeof data.dp === 'number' && isFinite(data.dp) ? data.dp : null,
    fetchedAt: Date.now(),
    openUSD: posNum(data.o),
    highUSD: posNum(data.h),
    lowUSD: posNum(data.l),
    prevCloseUSD: posNum(data.pc),
    changeUSD: typeof data.d === 'number' && isFinite(data.d) ? data.d : null,
  }
}

export async function GET(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'quote_service_unconfigured', quotes: {}, missing: [] },
      { status: 503 },
    )
  }

  const url = new URL(request.url)
  const raw = url.searchParams.get('tickers') || ''
  const requested = raw
    .split(',')
    .map(t => t.trim().toUpperCase())
    .filter(t => TICKER_PATTERN.test(t))

  // De-dupe and cap.
  const tickers = Array.from(new Set(requested)).slice(0, MAX_TICKERS_PER_REQUEST)
  if (!tickers.length) {
    return NextResponse.json({ quotes: {}, missing: [] })
  }

  // Parallel — each fetch hits the shared Next.js cache, so this is cheap
  // when tickers are already warm.
  const settled = await Promise.allSettled(tickers.map(t => fetchQuote(t, apiKey)))
  const quotes: Record<string, StockQuote> = {}
  const missing: string[] = []
  settled.forEach((r, i) => {
    const ticker = tickers[i]
    if (r.status === 'fulfilled' && r.value) {
      quotes[ticker] = r.value
    } else {
      missing.push(ticker)
    }
  })

  return NextResponse.json({ quotes, missing })
}
