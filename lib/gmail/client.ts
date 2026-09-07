/**
 * Gmail OAuth + read helpers (server-only).
 *
 * Per-user OAuth: one app registration (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET),
 * each user authorizes their own Gmail. We request the read-only scope, store
 * the refresh token (sealed), and mint short-lived access tokens server-side.
 *
 * Needs env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and (optionally)
 * GOOGLE_REDIRECT_URI — otherwise the redirect is derived from the request origin.
 */

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'openid', 'email']

export function gmailConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

export function redirectUri(origin: string): string {
  return process.env.GOOGLE_REDIRECT_URI || `${origin}/api/gmail/callback`
}

export function authUrl(origin: string, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent', // force a refresh_token every time
    include_granted_scopes: 'true',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`
}

interface TokenResponse { access_token?: string; refresh_token?: string; id_token?: string; expires_in?: number }

export async function exchangeCode(origin: string, code: string): Promise<TokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: redirectUri(origin),
      grant_type: 'authorization_code',
      code,
    }),
  })
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`)
  return res.json() as Promise<TokenResponse>
}

export async function accessFromRefresh(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) throw new Error(`Google token refresh failed (${res.status}). Reconnect Gmail.`)
  const data = await res.json() as TokenResponse
  if (!data.access_token) throw new Error('No access token from Google')
  return data.access_token
}

/** Read the email claim from a Google id_token (no signature check — display only). */
export function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString('utf8'))
    return typeof payload.email === 'string' ? payload.email : null
  } catch { return null }
}

export interface GmailMessage { from: string; subject: string; snippet: string; date: string }

/** Pull recent inbox messages (metadata + snippet) for an access token. */
export async function recentInbox(accessToken: string, max = 20): Promise<GmailMessage[]> {
  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
  listUrl.searchParams.set('maxResults', String(max))
  listUrl.searchParams.set('q', 'in:inbox newer_than:14d')
  const listRes = await fetch(listUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!listRes.ok) throw new Error(`Gmail list failed (${listRes.status})`)
  const list = await listRes.json() as { messages?: Array<{ id: string }> }
  const ids = (list.messages ?? []).map((m) => m.id)

  const out: GmailMessage[] = []
  for (const id of ids) {
    const mUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`)
    mUrl.searchParams.set('format', 'metadata')
    mUrl.searchParams.append('metadataHeaders', 'From')
    mUrl.searchParams.append('metadataHeaders', 'Subject')
    mUrl.searchParams.append('metadataHeaders', 'Date')
    const mRes = await fetch(mUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!mRes.ok) continue
    const m = await mRes.json() as {
      snippet?: string
      payload?: { headers?: Array<{ name?: string; value?: string }> }
    }
    const h = (name: string) => m.payload?.headers?.find((x) => x.name?.toLowerCase() === name)?.value || ''
    out.push({ from: h('from'), subject: h('subject'), date: h('date'), snippet: (m.snippet || '').trim() })
  }
  return out
}
