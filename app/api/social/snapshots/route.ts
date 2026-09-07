import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ParsedSnapshot } from '@/lib/social/types'

export const dynamic = 'force-dynamic'

/**
 * Social Command Center snapshot store (BUILD51). RLS-scoped to the caller.
 *
 *   GET  /api/social/snapshots?brand=<ref>   → history (oldest first, for charts)
 *   POST /api/social/snapshots { brand, snapshot } → save one parsed paste
 */

const NUM_KEYS = [
  'followers', 'views', 'reach', 'pctNonFollowers', 'likes',
  'comments', 'saves', 'shares', 'follows', 'engagementRate',
] as const

const COL: Record<string, string> = {
  followers: 'followers', views: 'views', reach: 'reach', pctNonFollowers: 'pct_non_followers',
  likes: 'likes', comments: 'comments', saves: 'saves', shares: 'shares',
  follows: 'follows', engagementRate: 'engagement_rate',
}

export async function GET(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const brand = new URL(req.url).searchParams.get('brand') ?? ''
  const { data, error } = await supabase
    .from('social_snapshots')
    .select('*')
    .eq('user_id', user.id)
    .eq('brand_ref', brand)
    .order('captured_at', { ascending: true })
    .limit(500)
  // 42P01 = table not migrated yet → show an empty Command Center, not an error.
  if (error && error.code !== '42P01') return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ snapshots: data ?? [] })
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { brand?: string; snapshot?: ParsedSnapshot }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const snap = body.snapshot
  if (!snap || typeof snap !== 'object') return NextResponse.json({ error: 'missing snapshot' }, { status: 400 })

  // Require at least one real number so an empty/garbage paste isn't saved.
  const snapRec = snap as unknown as Record<string, unknown>
  const hasNumber = NUM_KEYS.some((k) => typeof snapRec[k] === 'number')
  if (!hasNumber) {
    return NextResponse.json({ error: 'No numbers found in that paste. Check the format and try again.' }, { status: 400 })
  }

  const row: Record<string, unknown> = {
    user_id: user.id,
    brand_ref: body.brand ?? '',
    platform: snap.platform ?? 'other',
    period: snap.period ?? '28d',
    top_comments: Array.isArray(snap.topComments) ? snap.topComments.slice(0, 20) : [],
    extra: snap.extra ?? {},
    raw: typeof snap.raw === 'string' ? snap.raw.slice(0, 10000) : null,
  }
  for (const k of NUM_KEYS) {
    const v = snapRec[k]
    if (typeof v === 'number' && Number.isFinite(v)) row[COL[k]] = v
  }

  const { data, error } = await supabase.from('social_snapshots').insert(row).select('id, captured_at').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data?.id, capturedAt: data?.captured_at })
}
