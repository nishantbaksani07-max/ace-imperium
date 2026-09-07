import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { buildAuthUrl, getWhoopCredentials } from '@/lib/whoop/client'

export const dynamic = 'force-dynamic'

/**
 * Kicks off the Whoop OAuth flow.
 *
 * Sets a short-lived httpOnly state cookie to defend against CSRF on the
 * callback, then 302s the user to Whoop's authorize URL. The callback
 * route verifies the returned state matches before trusting the code.
 * A second cookie remembers where to send the user back afterwards.
 */

// Only allow returning to an internal /app/* path, so ?return can't be turned
// into an open redirect off-site after the OAuth round-trip.
function safeReturn(raw: string | null): string {
  if (raw && raw.startsWith('/app/') && !raw.startsWith('/app//') && !raw.includes('://')) return raw
  return '/app/vitals/whoop'
}

export async function GET(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  if (!user) return NextResponse.redirect(`${base}/login`)

  const returnTo = safeReturn(new URL(request.url).searchParams.get('return'))

  // Bring-your-own-credentials: the user must have saved their own WHOOP app's
  // client_id + client_secret first. Without them there's no app to authorize
  // against, so send them to the key-entry form — carrying where they were
  // headed (e.g. the Vitals onboarding hop) so saving keys + authorizing lands
  // them back on track rather than dead-ending on an error.
  const creds = await getWhoopCredentials(supabase, user.id)
  if (!creds) {
    const dest = new URL(`${base}/app/fitness/whoop`)
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
  jar.set('whoop_oauth_state', state, cookieOpts)
  // Remember where the user started so the callback lands them back there
  // (the Vitals dashboard by default) instead of always the old module page.
  jar.set('whoop_return', returnTo, cookieOpts)

  return NextResponse.redirect(buildAuthUrl(state, creds.clientId))
}
