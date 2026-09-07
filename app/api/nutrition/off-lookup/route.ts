import { NextRequest, NextResponse } from 'next/server'

import { requireUser } from '@/lib/auth/require-tier'
import { fetchOffProduct } from '@/lib/nutrition/off'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/*
 * Nutrition · off-lookup — barcode → product macros.
 *
 * Open Food Facts is free + keyless, but we proxy it (rather than call from the
 * browser) for consistency with the other two nutrition routes and to leave
 * room for server-side caching later. Pro-gated (hard rule #5).
 *
 * Returns { match: OffMatch | null } — null when the barcode isn't in OFF.
 */

interface OffLookupBody {
  barcode?: string
}

export async function POST(request: NextRequest) {
  const gate = await requireUser()
  if (!gate.ok) return gate.response

  let body: OffLookupBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const barcode = (body.barcode || '').replace(/[^0-9]/g, '')
  if (!barcode) {
    return NextResponse.json({ error: 'a numeric barcode is required' }, { status: 400 })
  }

  try {
    const match = await fetchOffProduct(barcode)
    return NextResponse.json({ match })
  } catch (err) {
    console.error('[nutrition/off-lookup] error:', err)
    return NextResponse.json({ error: 'Barcode lookup failed. Try again in a moment.' }, { status: 502 })
  }
}
