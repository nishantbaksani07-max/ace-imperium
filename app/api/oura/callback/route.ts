import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { exchangeCode, fetchOuraProfile, getOuraCredentials, syncLatest } from '@/lib/oura/client'
import { sealSecret } from '@/lib/wearables/secretbox'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const returnedState = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error')
  const cookieStore = cookies()
  const storedState = cookieStore.get('oura_oauth_state')?.value
  // Where to land after pairing (set by the connect route; defaults to the
  // Vitals paired hop, which routes into the quiz / readings).
  const returnTo = cookieStore.get('oura_return')?.value || '/app/vitals/paired'
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const errorUrl = `${base}/app/vitals`

  if (oauthError) {
    return NextResponse.redirect(`${errorUrl}?error=${encodeURIComponent(oauthError)}`)
  }
  if (!code || !returnedState || !storedState || returnedState !== storedState) {
    return NextResponse.redirect(`${errorUrl}?error=invalid_state`)
  }
  cookieStore.delete('oura_oauth_state')
  cookieStore.delete('oura_return')

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${base}/login`)

  // The code can only be redeemed with the same app's credentials that started
  // the flow — the user's own Oura app keys (saved before connect), else the
  // shared env app.
  const creds = await getOuraCredentials(supabase, user.id)
  if (!creds) {
    return NextResponse.redirect(`${errorUrl}?error=missing_credentials`)
  }

  try {
    const tokens = await exchangeCode(code, creds.clientId, creds.clientSecret)
    const profile = await fetchOuraProfile(tokens.access_token)
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    const { error: dbError } = await supabase
      .from('wearable_connections')
      .upsert(
        {
          user_id: user.id,
          provider: 'oura',
          provider_user_id: profile.user_id,
          encrypted_access_token: sealSecret(tokens.access_token),
          encrypted_refresh_token: sealSecret(tokens.refresh_token),
          access_token_expires_at: expiresAt,
        },
        { onConflict: 'user_id,provider' },
      )
    if (dbError) throw dbError

    try {
      await syncLatest(supabase, user.id)
    } catch (e) {
      console.error('[Oura] initial sync failed', e)
    }
    // The ~30-day history backfill is deliberately NOT run here: the redirect
    // must land fast (a slow provider day could brush the function timeout and
    // show a gateway error for a connect that succeeded). maybeBackfillHistory
    // runs from /api/oura/sync (manual button), /api/home/pull (the ritual
    // open) and the nightly cron instead. Same result, no slow connect hop.

    return NextResponse.redirect(`${base}${returnTo}`)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'connect_failed'
    console.error('[Oura callback]', message)
    return NextResponse.redirect(`${errorUrl}?error=${encodeURIComponent(message)}`)
  }
}
