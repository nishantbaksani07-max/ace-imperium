import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { authUrl, gmailConfigured } from '@/lib/gmail/client'

export const dynamic = 'force-dynamic'

/** Start the Gmail OAuth flow: set a CSRF state cookie, redirect to Google. */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const ret = req.nextUrl.searchParams.get('return') || '/app/brand'
  if (!gmailConfigured()) {
    return NextResponse.redirect(new URL(`${ret}?gmail=not_configured`, req.url))
  }

  const state = randomBytes(16).toString('hex')
  const c = cookies()
  const secure = req.nextUrl.protocol === 'https:'
  c.set('gmail_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 600 })
  c.set('gmail_oauth_return', ret, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 600 })

  return NextResponse.redirect(authUrl(req.nextUrl.origin, state))
}
