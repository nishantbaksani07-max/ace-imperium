import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { exchangeCode, fetchWhoopProfile, getWhoopCredentials, syncLatest } from '@/lib/whoop/client'
import { sealSecret } from '@/lib/wearables/secretbox'

export const dynamic = 'force-dynamic'

/**
 * OAuth return from Whoop. Whoop appends ?code=...&state=... (or
 * ?error=... on user denial). We verify state against the cookie set in
 * /api/whoop/connect, exchange the code for tokens, persist them, then
 * pull initial data so the user lands on a populated dashboard rather
 * than an empty "awaiting data" screen.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const returnedState = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error')
  const cookieStore = cookies()
  const storedState = cookieStore.get('whoop_oauth_state')?.value
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  // Where /api/whoop/connect said to return (Vitals dashboard by default).
  const returnPath = cookieStore.get('whoop_return')?.value || '/app/vitals/whoop'
  const moduleUrl = `${base}${returnPath}`

  if (oauthError) {
    return NextResponse.redirect(`${moduleUrl}?error=${encodeURIComponent(oauthError)}`)
  }
  if (!code || !returnedState || !storedState || returnedState !== storedState) {
    return NextResponse.redirect(`${moduleUrl}?error=invalid_state`)
  }
  cookieStore.delete('whoop_oauth_state')
  cookieStore.delete('whoop_return')

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${base}/login`)

  // The code can only be redeemed with the same app's credentials that started
  // the flow — the user's own WHOOP app keys, saved before connect.
  const creds = await getWhoopCredentials(supabase, user.id)
  if (!creds) {
    return NextResponse.redirect(`${moduleUrl}?error=missing_credentials`)
  }

  try {
    const tokens = await exchangeCode(code, creds.clientId, creds.clientSecret)
    const profile = await fetchWhoopProfile(tokens.access_token)
    const providerUserId = String(profile.user_id ?? 'unknown')
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    const { error: dbError } = await supabase
      .from('wearable_connections')
      .upsert(
        {
          user_id: user.id,
          provider: 'whoop',
          provider_user_id: providerUserId,
          encrypted_access_token: sealSecret(tokens.access_token),
          encrypted_refresh_token: sealSecret(tokens.refresh_token),
          access_token_expires_at: expiresAt,
        },
        { onConflict: 'user_id,provider' },
      )
    if (dbError) throw dbError

    // Best-effort: don't fail the connect just because today's sync errored
    try {
      await syncLatest(supabase, user.id)
    } catch (e) {
      console.error('[Whoop] initial sync failed', e)
    }
    // The ~30-day history backfill is deliberately NOT run here: the redirect
    // must land fast (a slow provider day could brush the function timeout and
    // show a gateway error for a connect that succeeded). maybeBackfillHistory
    // runs from /api/whoop/sync (manual button), /api/home/pull (the ritual
    // open) and the nightly cron instead. Same result, no slow connect hop.

    return NextResponse.redirect(`${moduleUrl}?connected=1`)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'connect_failed'
    console.error('[Whoop callback]', message)
    return NextResponse.redirect(`${moduleUrl}?error=${encodeURIComponent(message)}`)
  }
}
