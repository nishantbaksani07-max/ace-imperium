import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLocalDateKey } from '@/lib/dates'
import { EXTRACTION_PROMPT, runExtraction, hasAnyMetric } from '@/lib/wearables/extract'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/*
 * Inbound email → wearable reading  (BUILD71)
 *
 * A user sets a one-time auto-forward rule in their inbox so their wearable's
 * daily summary (WHOOP / Oura recap email) lands at u-<handle>@in.<domain>. A
 * Cloudflare Email Worker receives it, parses the MIME, and POSTs the parts here.
 * There's no Supabase session on this path, so we:
 *   1. check a shared secret only the Worker holds (EMAIL_INGEST_SECRET),
 *   2. pull the per-user handle out of the To address,
 *   3. map it to a user via email_ingest_addresses with the service-role client,
 *   4. run the SAME Claude extractor the screenshot importer uses, on the text,
 *   5. upsert wearable_data (provider 'manual') so it feeds Peak + the Vitals
 *      "Manual" band like any other source.
 *
 * Body (JSON, from the Worker): { to: string|string[], from?, subject?, text?, html? }
 */

const PROVIDER = 'manual'

/** Pull the handle out of any recipient shaped u-<handle>@... (case-insensitive).
 *  Tolerant of a single string, an array, or "Name <addr>" display form. */
function handleFromRecipients(to: unknown): string | null {
  const list = Array.isArray(to) ? to : typeof to === 'string' ? [to] : []
  for (const entry of list) {
    if (typeof entry !== 'string') continue
    const m = entry.toLowerCase().match(/u-([a-z0-9]+)@/)
    if (m) return m[1]
  }
  return null
}

/** Minimal HTML→text fallback for emails that ship no text/plain part. The
 *  extractor only needs the visible numbers, not structure. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function POST(req: NextRequest) {
  // ── shared-secret gate: only the Cloudflare Worker knows this, so the route
  // can't be POSTed directly even by someone who guesses a handle. ──
  const secret = process.env.EMAIL_INGEST_SECRET
  if (!secret) {
    console.error('[wearables/email] EMAIL_INGEST_SECRET not configured')
    return NextResponse.json({ error: 'unconfigured' }, { status: 503 })
  }
  if (req.headers.get('x-vitality-ingest-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const handle = handleFromRecipients(body.to)
  if (!handle) return NextResponse.json({ error: 'no_handle' }, { status: 400 })

  const admin = createAdminClient()
  const { data: addr } = await admin
    .from('email_ingest_addresses')
    .select('id, user_id')
    .eq('handle', handle)
    .maybeSingle()
  if (!addr) return NextResponse.json({ error: 'unknown_handle' }, { status: 404 })

  // Prefer the plain-text body; fall back to stripped HTML. Cap at the same 20k
  // ceiling the screenshot importer uses for pasted text — keeps the model call
  // cheap and bounded. The subject often carries the date/headline, so prepend it.
  const text = typeof body.text === 'string' ? body.text : ''
  const html = typeof body.html === 'string' ? body.html : ''
  const subject = typeof body.subject === 'string' ? body.subject : ''
  let content = (text || htmlToText(html)).slice(0, 20_000)
  if (subject) content = `Subject: ${subject}\n\n${content}`
  if (!content.trim()) return NextResponse.json({ error: 'empty_email' }, { status: 400 })

  const result = await runExtraction([
    { type: 'text', text: `${EXTRACTION_PROMPT}\n\n--- FORWARDED WEARABLE EMAIL ---\n${content}` },
  ])
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  const reading = result.reading
  if (!hasAnyMetric(reading)) {
    // 200, not an error: a real but metric-less email (e.g. a marketing blast
    // caught by an over-broad forward rule) shouldn't make the Worker retry.
    return NextResponse.json({ ok: true, saved: false, reason: 'no_metrics' })
  }

  const date = reading.date ?? getLocalDateKey()
  const row = {
    user_id: addr.user_id,
    provider: PROVIDER,
    date,
    recovery: reading.recovery,
    hrv: reading.hrv,
    rhr: reading.rhr,
    sleep_perf: reading.sleep_perf,
    sleep_hours: reading.sleep_hours,
    strain: reading.strain,
    raw: {
      source: 'email',
      from: typeof body.from === 'string' ? body.from : null,
      received_at: new Date().toISOString(),
    },
  }

  const { error } = await admin
    .from('wearable_data')
    .upsert(row, { onConflict: 'user_id,date,provider' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Best-effort "last synced" touch for the settings card.
  await admin
    .from('email_ingest_addresses')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', addr.id)

  return NextResponse.json({ ok: true, saved: true, date })
}
