import 'server-only'

import type { ConnectorDef, OAuthTokens, SyncedMetric } from '../types'

/**
 * YouTube connector — OAuth (Google), the deep-analytics path.
 *
 * The public `/api/brand/refresh` path (YOUTUBE_API_KEY) only sees channel
 * totals. This connector adds per-user OAuth so we can read the YouTube
 * Analytics API: views, watch time, and subscribers gained/lost over a window —
 * the numbers a creator actually watches. Mirrors the wearable OAuth pattern.
 *
 * Admin sets up a Google Cloud OAuth client (YouTube Data + Analytics APIs
 * enabled), then sets YOUTUBE_OAUTH_CLIENT_ID + YOUTUBE_OAUTH_CLIENT_SECRET.
 * Redirect URI: <app>/api/connectors/youtube/callback.
 */

const SCOPES = [
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ')

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

async function tokenRequest(body: URLSearchParams): Promise<OAuthTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google token request failed (${res.status}): ${text.slice(0, 200)}`)
  }
  const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresInSeconds: json.expires_in,
    scope: json.scope,
  }
}

async function ytGet<T = any>(token: string, url: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`YouTube GET ${res.status}: ${text.slice(0, 160)}`)
  }
  return res.json() as Promise<T>
}

export const youtubeConnector: ConnectorDef = {
  id: 'youtube',
  label: 'YouTube',
  blurb: 'Subscribers, views, watch time, and subs gained/lost (last 28 days).',
  authType: 'oauth',
  requiredEnv: ['YOUTUBE_OAUTH_CLIENT_ID', 'YOUTUBE_OAUTH_CLIENT_SECRET'],

  oauth: {
    scopes: SCOPES,
    buildAuthUrl(state, redirectUri) {
      const params = new URLSearchParams({
        client_id: process.env.YOUTUBE_OAUTH_CLIENT_ID!,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES,
        access_type: 'offline',
        include_granted_scopes: 'true',
        prompt: 'consent', // force a refresh_token on re-auth
        state,
      })
      return `${AUTH_URL}?${params.toString()}`
    },
    exchangeCode(code, redirectUri) {
      return tokenRequest(
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: process.env.YOUTUBE_OAUTH_CLIENT_ID!,
          client_secret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET!,
        }),
      )
    },
    refresh(refreshToken) {
      return tokenRequest(
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: process.env.YOUTUBE_OAUTH_CLIENT_ID!,
          client_secret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET!,
        }),
      )
    },
  },

  async sync({ credentials }) {
    const token = String(credentials.accessToken ?? '')
    if (!token) throw new Error('YouTube token missing')

    const metrics: SyncedMetric[] = []
    let accountLabel: string | undefined

    // Channel totals (Data API, with the OAuth bearer → "mine").
    const channel = await ytGet<{
      items?: Array<{ snippet?: { title?: string }; statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string } }>
    }>(token, 'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true').catch(() => null)
    const stats = channel?.items?.[0]?.statistics
    if (channel?.items?.[0]?.snippet?.title) accountLabel = channel.items[0].snippet.title
    if (stats) {
      const subs = parseInt(stats.subscriberCount ?? '', 10)
      const views = parseInt(stats.viewCount ?? '', 10)
      const videos = parseInt(stats.videoCount ?? '', 10)
      if (Number.isFinite(subs)) metrics.push({ metric: 'subscribers', label: 'Subscribers', value: subs, unit: '', period: 'snapshot' })
      if (Number.isFinite(views)) metrics.push({ metric: 'views_lifetime', label: 'Lifetime views', value: views, unit: '', period: 'lifetime' })
      if (Number.isFinite(videos)) metrics.push({ metric: 'videos', label: 'Videos', value: videos, unit: '', period: 'snapshot' })
    }

    // Last-28-day analytics (Analytics API).
    const end = new Date()
    const start = new Date(Date.now() - 28 * 86_400_000)
    const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports')
    url.searchParams.set('ids', 'channel==MINE')
    url.searchParams.set('startDate', ymd(start))
    url.searchParams.set('endDate', ymd(end))
    url.searchParams.set('metrics', 'views,estimatedMinutesWatched,subscribersGained,subscribersLost')
    const report = await ytGet<{ rows?: number[][] }>(token, url.toString()).catch(() => null)
    const row = report?.rows?.[0]
    if (row && row.length >= 4) {
      metrics.push({ metric: 'views_28d', label: 'Views (28d)', value: row[0], unit: '', period: 'month' })
      metrics.push({ metric: 'watch_minutes_28d', label: 'Watch time (28d)', value: row[1], unit: 'min', period: 'month' })
      metrics.push({ metric: 'subs_gained_28d', label: 'Subs gained (28d)', value: row[2], unit: '', period: 'month' })
      metrics.push({ metric: 'subs_lost_28d', label: 'Subs lost (28d)', value: row[3], unit: '', period: 'month' })
    }

    return { accountLabel, metrics }
  },
}
