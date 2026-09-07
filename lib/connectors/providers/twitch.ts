import 'server-only'

import type { ConnectorDef, OAuthTokens, SyncedMetric } from '../types'

/**
 * Twitch connector — OAuth. Pulls the broadcaster's follower count (and the
 * legacy channel view count when present). Admin sets TWITCH_CLIENT_ID +
 * TWITCH_CLIENT_SECRET (dev.twitch.tv → register an app). Redirect:
 * <app>/api/connectors/twitch/callback. Scope: moderator:read:followers (the
 * authed user is their own broadcaster, so they can read their follower total).
 */

const SCOPES = 'moderator:read:followers'
const AUTH_URL = 'https://id.twitch.tv/oauth2/authorize'
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const HELIX = 'https://api.twitch.tv/helix'

async function tokenRequest(extra: Record<string, string>): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID!,
    client_secret: process.env.TWITCH_CLIENT_SECRET!,
    ...extra,
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Twitch token request failed (${res.status}): ${text.slice(0, 200)}`)
  }
  const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string[] }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresInSeconds: json.expires_in,
    scope: Array.isArray(json.scope) ? json.scope.join(' ') : undefined,
  }
}

async function helix<T = any>(token: string, path: string): Promise<T> {
  const res = await fetch(`${HELIX}${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Client-Id': process.env.TWITCH_CLIENT_ID! },
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Twitch ${path} → ${res.status}: ${text.slice(0, 160)}`)
  }
  return res.json() as Promise<T>
}

export const twitchConnector: ConnectorDef = {
  id: 'twitch',
  label: 'Twitch',
  blurb: 'Follower count for your Twitch channel.',
  authType: 'oauth',
  requiredEnv: ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET'],

  oauth: {
    scopes: SCOPES,
    buildAuthUrl(state, redirectUri) {
      const params = new URLSearchParams({
        client_id: process.env.TWITCH_CLIENT_ID!,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES,
        state,
      })
      return `${AUTH_URL}?${params.toString()}`
    },
    exchangeCode(code, redirectUri) {
      return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
    },
    refresh(refreshToken) {
      return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken })
    },
  },

  async sync({ credentials }) {
    const token = String(credentials.accessToken ?? '')
    if (!token) throw new Error('Twitch token missing')

    const me = await helix<{ data?: Array<{ id: string; display_name?: string; view_count?: number }> }>(token, '/users')
    const user = me.data?.[0]
    if (!user) throw new Error('Twitch returned no user')

    const metrics: SyncedMetric[] = []
    const followers = await helix<{ total?: number }>(token, `/channels/followers?broadcaster_id=${user.id}`).catch(() => null)
    if (followers?.total != null) metrics.push({ metric: 'followers', label: 'Followers', value: followers.total, unit: '', period: 'snapshot' })
    if (typeof user.view_count === 'number') metrics.push({ metric: 'views_lifetime', label: 'Channel views', value: user.view_count, unit: '', period: 'lifetime' })

    return { accountLabel: user.display_name, metrics }
  },
}
