import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { buildAuthUrl } from '@/lib/fitbit/client'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  if (!user) return NextResponse.redirect(`${base}/login`)

  // Fitbit is "coming soon": its legacy Web API is being retired (Sept 2026) and
  // new-app registration moved to Google, so we have no shared client_id yet.
  // Bounce back to Peak instead of redirecting to Fitbit with an empty client_id
  // (which is the "unauthorized_client / Invalid client_id" error users hit).
  if (!process.env.FITBIT_CLIENT_ID) {
    return NextResponse.redirect(`${base}/app/peak`)
  }

  const state = crypto.randomBytes(32).toString('hex')
  cookies().set('fitbit_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  })

  return NextResponse.redirect(buildAuthUrl(state))
}
