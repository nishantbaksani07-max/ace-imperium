/**
 * Social Command Center types (BUILD51). Plain module (no 'server-only') —
 * imported by the client component, the parser, and the API routes alike.
 */

export type SocialPlatform = 'youtube' | 'instagram' | 'tiktok' | 'other'

export const SOCIAL_PLATFORMS: { id: SocialPlatform; label: string; short: string }[] = [
  { id: 'instagram', label: 'Instagram', short: 'IG' },
  { id: 'tiktok', label: 'TikTok', short: 'TT' },
  { id: 'youtube', label: 'YouTube', short: 'YT' },
  { id: 'other', label: 'Other', short: '··' },
]

/** The numeric columns on social_snapshots, in display order. */
export const SNAPSHOT_METRICS: { key: keyof ParsedSnapshot; label: string; unit?: string }[] = [
  { key: 'followers', label: 'Followers' },
  { key: 'views', label: 'Views' },
  { key: 'reach', label: 'Reach' },
  { key: 'pctNonFollowers', label: 'Non-followers', unit: '%' },
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Comments' },
  { key: 'saves', label: 'Saves' },
  { key: 'shares', label: 'Shares' },
  { key: 'follows', label: 'Follows' },
  { key: 'engagementRate', label: 'Engagement', unit: '%' },
]

export interface ParsedSnapshot {
  platform: SocialPlatform
  period: string
  followers?: number
  views?: number
  reach?: number
  pctNonFollowers?: number
  likes?: number
  comments?: number
  saves?: number
  shares?: number
  follows?: number
  engagementRate?: number
  topComments: string[]
  extra: Record<string, number>
  raw: string
}
