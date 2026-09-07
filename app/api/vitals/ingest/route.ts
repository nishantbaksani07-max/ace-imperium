import 'server-only'

import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLocalDateKey } from '@/lib/dates'

/**
 * POST /api/vitals/ingest  — Phase 4b (Apple/Shortcut ingest)
 *
 * An iOS Shortcut (or any external poster) sends the day's RHR / HRV / sleep
 * here, authenticated by a per-user bearer token (see vitals_ingest_tokens).
 * There's no Supabase session on this path, so we hash the token, look the
 * user up with the service-role client, and upsert a `wearable_data` row under
 * provider `apple` — which `app/app/peak/load.ts` reads like any other vendor.
 *
 * Auth:  Authorization: Bearer <token>   (or  { "token": "<token>" }  in body)
 * Body:  { date?, rhr?, hrv?, sleep_hours?, sleep_perf? }
 *        date is local "YYYY-MM-DD"; defaults to the server's local day if absent
 *        (Shortcuts should send the phone's local date to avoid drift).
 */

const PROVIDER = 'apple'

async function userIdForToken(token: string): Promise<string | null> {
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const { data } = await createAdminClient()
    .from('vitals_ingest_tokens')
    .select('user_id')
    .eq('token_hash', tokenHash)
    .maybeSingle()
  return data?.user_id ?? null
}

function page(ok: boolean): Response {
  const body = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<body style="margin:0;background:#04060a;color:#e9efe9;font-family:-apple-system,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px">
<div><div style="font-size:46px;color:${ok ? '#6ee7b7' : '#f59e0b'}">${ok ? '✓' : '!'}</div>
<h1 style="font-weight:600;font-size:20px;margin:14px 0 6px">${ok ? 'Your Vitality link works' : 'This link isn’t recognized'}</h1>
<p style="color:#9aa39a;font-size:14px;line-height:1.55;max-width:300px;margin:0 auto">${
    ok
      ? 'Your iPhone Shortcut can post sleep and heart rate here each morning. Nothing to do on this page.'
      : 'Open Peak → Connect your phone → Create my link, then paste the new one into your Shortcut.'
  }</p></div></body>`
  return new Response(body, {
    status: ok ? 200 : 401,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

/** GET = a friendly "is my link working?" check when tapped in a browser. */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get('key')?.trim() || ''
  if (!key) return page(false)
  return page((await userIdForToken(key)) != null)
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function inRange(n: number | null, lo: number, hi: number): number | null {
  return n != null && n >= lo && n <= hi ? n : null
}

export async function POST(req: Request) {
  // ── token ──
  const auth = req.headers.get('authorization') ?? ''
  const headerToken = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    body = {}
  }

  // Token can arrive three ways, simplest-first: a ?key= in the URL (the
  // "personal link" users paste into the Shortcut — no header to set), a Bearer
  // header, or a token field in the JSON body.
  const queryToken = new URL(req.url).searchParams.get('key')?.trim() || ''
  const token = queryToken || headerToken || (typeof body.token === 'string' ? body.token.trim() : '')
  if (!token) return Response.json({ error: 'missing_token' }, { status: 401 })

  const tokenHash = createHash('sha256').update(token).digest('hex')
  const admin = createAdminClient()

  const { data: tokenRow } = await admin
    .from('vitals_ingest_tokens')
    .select('id, user_id')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (!tokenRow) return Response.json({ error: 'invalid_token' }, { status: 401 })

  // ── payload ──
  const date =
    typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : getLocalDateKey()

  const rhr = inRange(num(body.rhr), 25, 120)
  const hrv = inRange(num(body.hrv), 5, 250)
  const sleepHours = inRange(num(body.sleep_hours ?? body.sleepHours), 0, 16)
  const sleepPerf = inRange(num(body.sleep_perf ?? body.sleepPerf), 0, 100)

  if (rhr == null && hrv == null && sleepHours == null && sleepPerf == null) {
    // Echo what we actually received so the Shortcut's result popup shows WHY
    // it failed — usually a wrong field name, a time/date instead of a number,
    // or a value out of range (sleep_hours must be 0–16, e.g. 7.5).
    return Response.json(
      {
        error: 'no_valid_metrics',
        hint: 'Send sleep_hours as a plain number of hours, e.g. 7.5',
        received: {
          sleep_hours: body.sleep_hours ?? body.sleepHours ?? null,
          rhr: body.rhr ?? null,
          hrv: body.hrv ?? null,
          sleep_perf: body.sleep_perf ?? body.sleepPerf ?? null,
        },
      },
      { status: 400 },
    )
  }

  const row = {
    user_id: tokenRow.user_id,
    provider: PROVIDER,
    date,
    rhr: rhr != null ? Math.round(rhr) : null,
    hrv,
    sleep_hours: sleepHours,
    sleep_perf: sleepPerf,
    raw: { source: 'apple-shortcut', received_at: new Date().toISOString() },
  }

  const { error } = await admin
    .from('wearable_data')
    .upsert(row, { onConflict: 'user_id,date,provider' })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Best-effort touch so a settings page can show "last synced".
  await admin
    .from('vitals_ingest_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', tokenRow.id)

  return Response.json({ ok: true, date, wrote: { rhr, hrv, sleep_hours: sleepHours, sleep_perf: sleepPerf } })
}
