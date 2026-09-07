import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { openCredentials } from '@/lib/connectors/crypto'
import { accessFromRefresh, recentInbox } from '@/lib/gmail/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 45

/**
 * Auto-pull the connected user's recent inbox via the Gmail API, then run it
 * through Claude for a tagged triage (opportunities / questions / problems /
 * needs-reply / spam). Returns { read } for the Inbox panel to save.
 */

const MODEL = 'claude-opus-4-8' // swap to claude-sonnet-4-6 to cut cost

const SYSTEM = `You triage a creator/business owner's recent emails. Read them all and run down EVERYTHING that matters — good and bad. Never skip problems.

Return EXACTLY this, nothing else:
MEANING: <2 to 3 sentences: what needs attention right now, and anything time-sensitive>
EMAILS:
- [!] <sender — subject — one-line gist of a message that NEEDS a reply>
- [$] <a business opportunity: collab, sponsor, invoice, paid work>
- [?] <a genuine question>
- [-] <a complaint or problem>
- [spam] <obvious promo/spam, one line>
(tag every line; list real emails most-important first; keep the negatives. If a bucket is empty, skip it.)`

export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI is not configured on the server' }, { status: 500 })

  const { data: conn } = await supabase
    .from('gmail_connections')
    .select('credentials')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!conn) return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 })

  let refresh = ''
  try { refresh = String((openCredentials(conn.credentials) as { refresh_token?: string }).refresh_token || '') }
  catch { return NextResponse.json({ error: 'Stored Gmail token is unreadable. Reconnect.' }, { status: 400 }) }
  if (!refresh) return NextResponse.json({ error: 'No Gmail token. Reconnect.' }, { status: 400 })

  let emails
  try {
    const access = await accessFromRefresh(refresh)
    emails = await recentInbox(access, 20)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Gmail fetch failed' }, { status: 502 })
  }
  if (!emails.length) return NextResponse.json({ error: 'No recent inbox emails found.' }, { status: 404 })

  const list = emails
    .map((m) => `FROM: ${m.from.slice(0, 80)}\nSUBJECT: ${m.subject.slice(0, 120)}\n${m.snippet.replace(/\s+/g, ' ').slice(0, 280)}`)
    .join('\n---\n')

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM,
        messages: [{ role: 'user', content: `Here are my ${emails.length} most recent inbox emails:\n\n${list}\n\nTriage them in the required format.` }],
      }),
    })
    const data = await res.json().catch(() => ({})) as { content?: Array<{ type: string; text?: string }>; error?: { message?: string } }
    if (!res.ok) return NextResponse.json({ error: data?.error?.message || `Anthropic ${res.status}` }, { status: 502 })
    const read = (data.content ?? []).filter((b) => b.type === 'text' && b.text).map((b) => b.text as string).join('\n').trim()
    if (!read) return NextResponse.json({ error: 'No read came back. Try again.' }, { status: 502 })
    return NextResponse.json({ read, count: emails.length })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'AI request failed' }, { status: 502 })
  }
}
