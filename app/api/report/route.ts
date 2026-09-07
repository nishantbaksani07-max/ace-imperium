import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { createClient } from '@/lib/supabase/server'

// POST /api/report — the in-app "Report a problem" button.
// Auth required (RLS stamps the row to the user). Stores the message + the page
// it was sent from + the browser, so a report is actionable. Best-effort: a
// failure returns a clear error the UI shows, never a crash.
//
// The report is saved two places: the bug_reports Supabase table (durable
// backup, read via the SQL editor) AND Sentry's User Feedback inbox (so reports
// land next to our error monitoring at vitality-79.sentry.io). Sentry is
// production-only and forwarding is best-effort — it never blocks the save.
export async function POST(request: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { message?: string; page?: string } | null
  const message = (body?.message ?? '').trim()
  if (!message) return NextResponse.json({ error: 'empty' }, { status: 400 })
  if (message.length > 2000) return NextResponse.json({ error: 'too_long' }, { status: 400 })

  const page = (body?.page ?? '').slice(0, 300) || null
  const userAgent = (request.headers.get('user-agent') ?? '').slice(0, 300) || null

  // Save to the durable Supabase backup (RLS stamps it to the user).
  const { error } = await supabase.from('bug_reports').insert({
    user_id: user.id,
    message: message.slice(0, 2000),
    page,
    user_agent: userAgent,
  })

  // Forward to Sentry's User Feedback inbox so reports sit alongside our error
  // monitoring at vitality-79.sentry.io. Best-effort and returns an event id on
  // success; a no-op (and falsy) in dev/preview, where Sentry is disabled.
  let sentryId: string | undefined
  try {
    sentryId = Sentry.captureFeedback(
      {
        message: message.slice(0, 2000),
        email: user.email ?? undefined,
        name: user.email ?? undefined,
        url: page ?? undefined,
        source: 'report-a-problem',
        tags: { page: page ?? 'unknown' },
      },
      {
        captureContext: {
          user: { id: user.id, email: user.email ?? undefined },
          tags: { source: 'report-a-problem' },
          extra: { userAgent },
        },
      },
    )
  } catch {
    // swallow — Sentry must never break a report
  }

  // The report counts as delivered if EITHER store accepted it, so a missing
  // table or a Sentry hiccup alone never loses a beta tester's report.
  if (error && !sentryId) return NextResponse.json({ error: 'save_failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
