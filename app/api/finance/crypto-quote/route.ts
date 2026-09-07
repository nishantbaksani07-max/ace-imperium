import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { CryptoQuote } from '@/app/app/finance/types'

/**
 * GET /api/finance/crypto-quote?ids=bitcoin,ethereum,solana
 *
 * Server-side proxy to CoinGecko's free `simple/price` endpoint for the user's
 * crypto holdings. Returns { quotes: { bitcoin: CryptoQuote, ... }, missing: [] }.
 *
 * Mirrors /api/finance/quote (the Finnhub stock route):
 *  - CoinGecko's free public API needs NO key (unlike Finnhub), and returns the
 *    price directly in the requested vs_currency — we ask for CHF, the app's
 *    canonical currency, so there's no FX step client-side.
 *  - ONE cached fetch per 15 min for the whole coin set (revalidate: 900). The
 *    Next.js data cache is shared per-deployment, so every user holding BTC
 *    shares a single CoinGecko call — keeping us well inside the free rate
 *    limit, which scales with unique coins across the userbase, not user count.
 *  - Auth required so we don't become an open proxy. Price data is public, so
 *    no per-user RLS is needed (same reasoning as the stock route).
 */

export const dynamic = 'force-dynamic'

// CoinGecko ids: lowercase letters, digits, hyphens (e.g. "avalanche-2").
const COIN_ID_PATTERN = /^[a-z0-9-]{1,40}$/
const MAX_IDS_PER_REQUEST = 50

interface CoinGeckoPrice {
  chf?: number
  chf_24h_change?: number
}

export async function GET(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const raw = url.searchParams.get('ids') || ''
  const requested = raw
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(s => COIN_ID_PATTERN.test(s))

  const ids = Array.from(new Set(requested)).slice(0, MAX_IDS_PER_REQUEST)
  if (!ids.length) {
    return NextResponse.json({ quotes: {}, missing: [] })
  }

  const endpoint =
    `https://api.coingecko.com/api/v3/simple/price` +
    `?ids=${encodeURIComponent(ids.join(','))}` +
    `&vs_currencies=chf&include_24hr_change=true`

  let res: Response
  try {
    res = await fetch(endpoint, {
      // Optional pro key support without a redeploy; the public endpoint works keyless.
      headers: process.env.COINGECKO_API_KEY
        ? { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY }
        : undefined,
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(8000),
    })
  } catch (e) {
    console.error('[finance/crypto-quote] fetch failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'crypto_quote_failed', quotes: {}, missing: ids }, { status: 502 })
  }

  if (!res.ok) {
    // 429 = CoinGecko rate-limit breach; log so it's distinguishable.
    console.error('[finance/crypto-quote] non-OK from CoinGecko:', res.status)
    return NextResponse.json({ error: 'crypto_quote_failed', quotes: {}, missing: ids }, { status: 502 })
  }

  const data = (await res.json()) as Record<string, CoinGeckoPrice>
  const fetchedAt = Date.now()
  const quotes: Record<string, CryptoQuote> = {}
  const missing: string[] = []
  for (const id of ids) {
    const row = data[id]
    if (row && typeof row.chf === 'number' && row.chf > 0) {
      quotes[id] = {
        coinId: id,
        priceCHF: row.chf,
        changePct: typeof row.chf_24h_change === 'number' && isFinite(row.chf_24h_change) ? row.chf_24h_change : null,
        fetchedAt,
      }
    } else {
      missing.push(id)
    }
  }

  return NextResponse.json({ quotes, missing })
}
