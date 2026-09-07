import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { buildAuthUrl, getOuraCredentials } from '@/lib/oura/client'

export const dynamic = 'force-dynamic'

/**
 * Kicks off the Oura OAuth flow. Mirrors the WHOOP connect route: a short-lived
 * httpOnly state cookie guards the callback against CSRF, and a second cookie
 * remembers where to send the user back afterwards (the Vitals paired hop by
 * default, which routes them into the quiz / readings).
 */

// Only allow returning to an internal /app/* path, so ?return can't be turned
// into an open redirect off-site after the OAuth round-trip.
function safeReturn(raw: string | null): string {
  if (raw && raw.startsWith('/app/') && !raw.startsWith('/app//') && !raw.includes('://')) return raw
  return '/app/vitals/paired'
}

export async function GET(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  if (!user) return NextResponse.redirect(`${base}/login`)

  const returnTo = safeReturn(new URL(request.url).searchParams.get('return'))

  // Bring-your-own-credentials: prefer the user's own Oura app's client_id +
  // client_secret (saved first), falling back to a shared env app if one is
  // configured. Without either there's no app to authorize against, so send them
  // to the key-entry form — carrying where they were headed so saving keys +
  // authorizing lands them back on track rather than dead-ending on an error.
  const creds = await getOuraCredentials(supabase, user.id)
  if (!creds) {
    const dest = new URL(`${base}/app/fitness/oura`)
    dest.searchParams.set('return', returnTo)
    return NextResponse.redirect(dest.toString())
  }

  const state = crypto.randomBytes(32).toString('hex')
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 10,
    path: '/',
  }
  const jar = cookies()
  jar.set('oura_oauth_state', state, cookieOpts)
  jar.set('oura_return', returnTo, cookieOpts)

  return NextResponse.redirect(buildAuthUrl(state, creds.clientId))
}
