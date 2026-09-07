import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { exchangeCode, fetchFitbitProfile, syncLatest } from '@/lib/fitbit/client'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const returnedState = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error')
  const cookieStore = cookies()
  const storedState = cookieStore.get('fitbit_oauth_state')?.value
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const moduleUrl = `${base}/app/fitness/fitbit`

  if (oauthError) {
    return NextResponse.redirect(`${moduleUrl}?error=${encodeURIComponent(oauthError)}`)
  }
  if (!code || !returnedState || !storedState || returnedState !== storedState) {
    return NextResponse.redirect(`${moduleUrl}?error=invalid_state`)
  }
  cookieStore.delete('fitbit_oauth_state')

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${base}/login`)

  try {
    const tokens = await exchangeCode(code)
    const profile = await fetchFitbitProfile(tokens.access_token)
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    const { error: dbError } = await supabase
      .from('wearable_connections')
      .upsert(
        {
          user_id: user.id,
          provider: 'fitbit',
          provider_user_id: profile.user_id,
          encrypted_access_token: tokens.access_token,
          encrypted_refresh_token: tokens.refresh_token,
          access_token_expires_at: expiresAt,
        },
        { onConflict: 'user_id,provider' },
      )
    if (dbError) throw dbError

    try {
      await syncLatest(supabase, user.id)
    } catch (e) {
      console.error('[Fitbit] initial sync failed', e)
    }

    return NextResponse.redirect(`${moduleUrl}?connected=1`)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'connect_failed'
    console.error('[Fitbit callback]', message)
    return NextResponse.redirect(`${moduleUrl}?error=${encodeURIComponent(message)}`)
  }
}
