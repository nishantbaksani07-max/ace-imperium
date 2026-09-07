/**
 * Shared Studio tile types. The single source of truth for the video-card and
 * link-library shapes, imported by the route handlers, the report helper, and
 * the tests. Kept in sync with supabase/migrations/20260703000001_studio_tables.sql.
 */
import type { ReportKind } from '@/lib/tiles/reportContract'

export const STUDIO_VIDEO_STATUSES = ['draft', 'published', 'archived'] as const
export type StudioVideoStatus = (typeof STUDIO_VIDEO_STATUSES)[number]

export const STUDIO_LINK_KINDS = ['social', 'store', 'affiliate', 'other'] as const
export type StudioLinkKind = (typeof STUDIO_LINK_KINDS)[number]

/** One saved video card (a row of studio_videos), as the API returns it. */
export interface StudioVideo {
  id: string
  title: string
  url: string
  status: StudioVideoStatus
  publishedAt: string | null // local YYYY-MM-DD (date column)
  notes: string | null
  /** Manual upload-package fields the tile stores in the extra jsonb column. */
  extra: {
    description?: string
    tags?: string[]
    hashtags?: string[]
    chapters?: { t: string; label: string }[]
    titleOptions?: string[]
    thumbnailWords?: string
    thumbnailPrompt?: string
    /** Snapshot from /api/studio/lookup at package time (source video facts,
     *  not live analytics): view count, duration, and channel name. Used by
     *  the tile's Stats tab to compare a video against the library average. */
    sourceViews?: number | null
    sourceDuration?: string | null
    sourceAuthor?: string | null
  } | null
  createdAt: string
  updatedAt: string
}

/** One saved link (a row of studio_links), as the API returns it. */
export interface StudioLink {
  id: string
  videoId: string | null
  label: string
  url: string
  kind: StudioLinkKind
  isDefault: boolean
  position: number
}

export interface CreateVideoBody {
  title: string
  url?: string
}
export interface UpdateVideoBody {
  title?: string
  url?: string
  status?: StudioVideoStatus
  publishedAt?: string | null
  notes?: string | null
  extra?: StudioVideo['extra']
}
export interface CreateLinkBody {
  label: string
  url: string
  kind?: StudioLinkKind
  videoId?: string | null
  isDefault?: boolean
  position?: number
}
export interface UpdateLinkBody {
  label?: string
  url?: string
  kind?: StudioLinkKind
  isDefault?: boolean
  position?: number
}

/** The one stream the Studio tile reports into Vee. */
export const REPORT_KEY = 'videos_published' as const
export const REPORT_KIND: ReportKind = 'count'
