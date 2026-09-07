import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { EXTRACTION_PROMPT, runExtraction, hasAnyMetric } from '@/lib/wearables/extract'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/*
 * Universal wearable importer — "I have something else."
 *
 * For users whose band we don't integrate (Garmin, Samsung, Apple, Polar, …):
 * they screenshot their wearable app's daily summary (or paste/upload a small
 * text/CSV export), and Claude reads it into our normalized metric shape. This
 * route ONLY extracts + returns — the client shows an editable confirm step and
 * then POSTs to /api/wearables/manual to actually save. Same image→Claude→JSON
 * pattern as finance/import-receipt.
 *
 * The model call + sanitiser live in lib/wearables/extract.ts so the email-forward
 * ingest (/api/wearables/email) reuses the exact same extraction; this route just
 * builds the image-or-text content block from the multipart form.
 *
 * Accepts multipart/form-data with EITHER `file` (an image) OR `text` (pasted
 * analytics text / small CSV).
 */

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const formData = await request.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'invalid_form_data' }, { status: 400 })

  const file = formData.get('file') as File | null
  const text = formData.get('text')
  const pastedText = typeof text === 'string' ? text.trim() : ''

  // Build the user content block: an image, or pasted text. Image takes priority.
  let userContent: Array<Record<string, unknown>>
  if (file) {
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image too large (5MB max)' }, { status: 400 })
    }
    const mediaType = file.type || 'image/jpeg'
    if (!/^image\/(jpeg|png|webp|gif)$/.test(mediaType)) {
      return NextResponse.json({ error: 'Use a PNG, JPEG, WebP, or GIF image' }, { status: 400 })
    }
    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
    userContent = [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
      { type: 'text', text: EXTRACTION_PROMPT },
    ]
  } else if (pastedText) {
    if (pastedText.length > 20_000) {
      return NextResponse.json({ error: 'Text too long' }, { status: 400 })
    }
    userContent = [
      { type: 'text', text: `${EXTRACTION_PROMPT}\n\n--- PASTED WEARABLE DATA ---\n${pastedText}` },
    ]
  } else {
    return NextResponse.json({ error: 'missing_input' }, { status: 400 })
  }

  const result = await runExtraction(userContent)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  const reading = result.reading
  // If literally nothing came back, tell the user rather than save an empty row.
  if (!hasAnyMetric(reading)) {
    return NextResponse.json({ error: 'no_metrics_found', reading }, { status: 422 })
  }
  return NextResponse.json({ reading })
}
