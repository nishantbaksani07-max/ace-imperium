import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { sealCredentials } from '@/lib/connectors/crypto'
import { exchangeCode, emailFromIdToken } from '@/lib/gmail/client'

export const dynamic = 'force-dynamic'

/** OAuth return from Google. Verify state, exchange code, store the sealed
 *  refresh token against the user, redirect back where they started. */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const c = cookies()
  const ret = c.get('gmail_oauth_return')?.value || '/app/brand'
  const back = (status: string) => NextResponse.redirect(new URL(`${ret}?gmail=${status}`, req.url))

  const url = req.nextUrl
  if (url.searchParams.get('error')) return back('denied')

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const storedState = c.get('gmail_oauth_state')?.value
  c.delete('gmail_oauth_state')
  c.delete('gmail_oauth_return')
  if (!code || !state || state !== storedState) return back('invalid_state')

  try {
    const tokens = await exchangeCode(url.origin, code)
    if (!tokens.refresh_token) return back('no_refresh')
    const email = emailFromIdToken(tokens.id_token)
    const credentials = sealCredentials({ refresh_token: tokens.refresh_token })
    const { error } = await supabase.from('gmail_connections').upsert({
      user_id: user.id,
      email,
      credentials,
      connected_at: new Date().toISOString(),
    })
    if (error) { console.error('[gmail/callback] store error:', error.message); return back('error') }
  } catch (e) {
    console.error('[gmail/callback] error:', e)
    return back('error')
  }
  return back('connected')
}
