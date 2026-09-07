import { NextRequest, NextResponse } from 'next/server'

import { requireUser } from '@/lib/auth/require-tier'
import { usdaSearchBest, usdaSearchMany, UsdaError } from '@/lib/nutrition/usda'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/*
 * Nutrition · usda-search — the macro database lookup.
 *
 * Two modes:
 *   { hint }                          → single best match: { match: UsdaMatch|null }
 *   { query, many: true, max?, mode? } → ranked candidates: { results: UsdaCandidate[] }
 *
 * The meal pipeline (lib/nutrition/macros.lookupMacrosForMeal) calls the single
 * mode once per search hint; the manual-add picker uses `many`. The USDA key
 * (hard rule #4) lives only here. Pro-gated (hard rule #5).
 */

interface UsdaSearchBody {
  hint?: string
  query?: string
  many?: boolean
  max?: number
  mode?: 'basic' | 'advanced'
}

/*
 * Tiny in-memory result cache (per warm server instance). USDA data is public
 * and stable, every search hits a live API, and the key is capped at 1000
 * requests/hour SHARED across all users — so debounced live search would
 * otherwise blow the budget. Identical (query, mode) lookups reuse the result
 * for an hour. `null` is a valid cached value (a real "no match").
 */
type CacheEntry = { at: number; value: unknown }
const CACHE = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 60 * 60 * 1000
const CACHE_MAX = 300
function cacheGet(key: string): { hit: boolean; value?: unknown } {
  const e = CACHE.get(key)
  if (!e) return { hit: false }
  if (Date.now() - e.at > CACHE_TTL_MS) { CACHE.delete(key); return { hit: false } }
  CACHE.delete(key); CACHE.set(key, e) // refresh LRU recency
  return { hit: true, value: e.value }
}
function cacheSet(key: string, value: unknown) {
  CACHE.set(key, { at: Date.now(), value })
  if (CACHE.size > CACHE_MAX) {
    const oldest = CACHE.keys().next().value
    if (oldest !== undefined) CACHE.delete(oldest)
  }
}

function usdaErrorResponse(err: unknown): NextResponse {
  if (err instanceof UsdaError) {
    if (err.status === 429) {
      return NextResponse.json({ error: 'USDA rate-limit hit. Wait 30s and try again.' }, { status: 429 })
    }
    return NextResponse.json({ error: 'USDA server error. Try again in a moment.' }, { status: 502 })
  }
  console.error('[nutrition/usda-search] unexpected error:', err)
  return NextResponse.json({ error: 'USDA lookup failed.' }, { status: 502 })
}

export async function POST(request: NextRequest) {
  const gate = await requireUser()
  if (!gate.ok) return gate.response

  const apiKey = process.env.USDA_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Food database not configured. Admin needs to set USDA_API_KEY.' },
      { status: 500 }
    )
  }

  let body: UsdaSearchBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  if (body.many) {
    const query = (body.query || body.hint || '').trim()
    if (!query) return NextResponse.json({ results: [] })
    const mode = body.mode ?? 'basic'
    const max = body.max ?? 5
    const key = `many|${mode}|${max}|${query.toLowerCase()}`
    const cached = cacheGet(key)
    if (cached.hit) return NextResponse.json({ results: cached.value })
    try {
      const results = await usdaSearchMany(query, apiKey, max, mode)
      cacheSet(key, results)
      return NextResponse.json({ results })
    } catch (err) {
      return usdaErrorResponse(err)
    }
  }

  const hint = (body.hint || body.query || '').trim()
  if (!hint) return NextResponse.json({ match: null })
  const key = `best|${hint.toLowerCase()}`
  const cached = cacheGet(key)
  if (cached.hit) return NextResponse.json({ match: cached.value })
  try {
    const match = await usdaSearchBest(hint, apiKey)
    cacheSet(key, match)
    return NextResponse.json({ match })
  } catch (err) {
    return usdaErrorResponse(err)
  }
}
