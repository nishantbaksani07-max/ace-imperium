import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { gateConnector } from '@/lib/connectors/gate'
import { getConnector } from '@/lib/connectors/registry'
import { storeConnection, recordMetrics } from '@/lib/connectors/service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/connectors/<provider>/callback — OAuth return.
 *
 * Validates state, exchanges the code for tokens, stores the (sealed) token set,
 * then attempts an immediate sync. Redirects back to the brand the connection
 * feeds. Provider quirks: Google sends `code`, Amazon sends `spapi_oauth_code`.
 */
export async function GET(req: Request, { params }: { params: { provider: string } }) {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const def = getConnector(params.provider)
  const url = new URL(req.url)
  const jar = cookies()

  const brandRef = jar.get(`cx_brand_${params.provider}`)?.value ?? ''
  const moduleUrl = `${base}/app/brand${brandRef ? `/${brandRef}` : ''}`
  const fail = (msg: string) => NextResponse.redirect(`${moduleUrl}?error=${encodeURIComponent(msg)}`)

  if (!def || def.authType !== 'oauth' || !def.oauth) return fail('unknown connector')

  const oauthError = url.searchParams.get('error')
  if (oauthError) return fail(oauthError)

  const code = url.searchParams.get('code') || url.searchParams.get('spapi_oauth_code')
  const returnedState = url.searchParams.get('state')
  const storedState = jar.get(`cx_state_${params.provider}`)?.value
  if (!code || !returnedState || !storedState || returnedState !== storedState) {
    return fail('invalid_state')
  }
  jar.delete(`cx_state_${params.provider}`)
  jar.delete(`cx_brand_${params.provider}`)

  const supabase = createClient()
  const gate = await gateConnector(supabase)
  if ('error' in gate) return NextResponse.redirect(`${base}/login`)

  try {
    const redirectUri = `${base}/api/connectors/${def.id}/callback`
    const tokens = await def.oauth.exchangeCode(code, redirectUri)

    const extra: Record<string, unknown> = { ...(tokens.extra ?? {}) }
    const sellerId = url.searchParams.get('selling_partner_id')
    if (sellerId) extra.sellingPartnerId = sellerId

    const credentials: Record<string, unknown> = { accessToken: tokens.accessToken, extra }
    if (tokens.refreshToken) credentials.refreshToken = tokens.refreshToken
    if (tokens.expiresInSeconds != null) {
      credentials.expiresAt = new Date(Date.now() + tokens.expiresInSeconds * 1000).toISOString()
    }

    await storeConnection(supabase, gate.userId, {
      provider: def.id,
      brandRef,
      authType: 'oauth',
      credentials,
      scopes: tokens.scope ?? def.oauth.scopes,
    })

    // Best-effort first sync so the card isn't empty on return.
    try {
      const result = await def.sync({ credentials, brandRef })
      await recordMetrics(supabase, gate.userId, def.id, brandRef, result.metrics)
      if (result.accountLabel) {
        await supabase
          .from('brand_connections')
          .update({ account_label: result.accountLabel })
          .eq('user_id', gate.userId)
          .eq('provider', def.id)
          .eq('brand_ref', brandRef)
      }
    } catch (e) {
      console.error(`[connector ${def.id}] initial sync failed`, e)
    }

    return NextResponse.redirect(`${moduleUrl}?connected=${def.id}`)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'connect_failed'
    console.error(`[connector ${def.id} callback]`, message)
    return fail(message)
  }
}
