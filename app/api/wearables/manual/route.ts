import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getLocalDateKey } from '@/lib/dates'

export const dynamic = 'force-dynamic'

/*
 * Save a manually-imported wearable reading.
 *
 * The companion to /api/wearables/import: after the user confirms (or edits)
 * the numbers Claude pulled from their screenshot, the client POSTs them here
 * and we upsert one row into wearable_data with provider 'manual'. Peak's
 * load.ts reads 'manual' alongside the real bands (PROVIDER_PRIORITY), so the
 * reading feeds the Vitality score + dashboard like any other source.
 *
 * RLS scopes the write to the signed-in user; unique(user_id, date, provider)
 * means re-importing the same day overwrites rather than duplicates.
 */

const MANUAL_PROVIDER = 'manual'

const intInRange = (v: unknown, lo: number, hi: number): number | null => {
  if (v == null) return null
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null
}
const numInRange = (v: unknown, lo: number, hi: number): number | null => {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 100) / 100 : null
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  // Default to today (local) when no date was read from the screenshot.
  const rawDate = body.date
  const date = typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ? rawDate
    : getLocalDateKey()

  const row = {
    user_id: user.id,
    provider: MANUAL_PROVIDER,
    date,
    recovery: intInRange(body.recovery, 0, 100),
    hrv: numInRange(body.hrv, 1, 400),
    rhr: intInRange(body.rhr, 20, 120),
    sleep_perf: numInRange(body.sleep_perf, 0, 100),
    sleep_hours: numInRange(body.sleep_hours, 0, 24),
    strain: numInRange(body.strain, 0, 21),
    raw: { source: 'manual-import', saved_at: new Date().toISOString() },
  }

  const anyValue = row.recovery != null || row.hrv != null || row.rhr != null ||
    row.sleep_perf != null || row.sleep_hours != null || row.strain != null
  if (!anyValue) {
    return NextResponse.json({ error: 'Enter at least one metric.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('wearable_data')
    .upsert(row, { onConflict: 'user_id,date,provider' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ saved: true, date })
}
