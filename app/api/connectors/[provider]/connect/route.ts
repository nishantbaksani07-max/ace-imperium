import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { gateConnector } from '@/lib/connectors/gate'
import { getConnector, isConfigured } from '@/lib/connectors/registry'

export const dynamic = 'force-dynamic'

/**
 * GET /api/connectors/<provider>/connect[?brand=<ref>]
 *
 * Starts an OAuth connector. Sets a short-lived state cookie (CSRF) plus the
 * brand scope, then redirects to the provider's consent screen. The fixed
 * redirect URI lands back at this provider's /callback.
 */
export async function GET(req: Request, { params }: { params: { provider: string } }) {
  const supabase = createClient()
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const gate = await gateConnector(supabase)
  if ('error' in gate) return NextResponse.redirect(`${base}/login`)

  const def = getConnector(params.provider)
  if (!def || def.authType !== 'oauth' || !def.oauth) {
    return NextResponse.json({ error: 'unknown oauth connector' }, { status: 404 })
  }
  if (!isConfigured(def)) {
    return NextResponse.redirect(`${base}/app/brand?error=${encodeURIComponent(`${def.label} isn’t set up yet`)}`)
  }

  const brandRef = new URL(req.url).searchParams.get('brand') ?? ''
  const state = crypto.randomBytes(32).toString('hex')
  const jar = cookies()
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 10,
    path: '/',
  }
  jar.set(`cx_state_${def.id}`, state, cookieOpts)
  jar.set(`cx_brand_${def.id}`, brandRef, cookieOpts)

  const redirectUri = `${base}/api/connectors/${def.id}/callback`
  return NextResponse.redirect(def.oauth.buildAuthUrl(state, redirectUri))
}
