import {
  STUDIO_VIDEO_STATUSES,
  STUDIO_LINK_KINDS,
  type StudioVideo,
  type StudioLink,
  type CreateVideoBody,
  type UpdateVideoBody,
  type CreateLinkBody,
  type UpdateLinkBody,
} from '@/lib/studio/types'

type Row = Record<string, unknown>
type Ok<T> = { ok: true; value: T }
type Err = { ok: false; error: string }

export function rowToVideo(r: Row): StudioVideo {
  return {
    id: String(r.id),
    title: String(r.title ?? ''),
    url: String(r.url ?? ''),
    status: (r.status as StudioVideo['status']) ?? 'draft',
    publishedAt: (r.published_at as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    extra: (r.extra as StudioVideo['extra']) ?? null,
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  }
}

export function rowToLink(r: Row): StudioLink {
  return {
    id: String(r.id),
    videoId: (r.video_id as string | null) ?? null,
    label: String(r.label ?? ''),
    url: String(r.url ?? ''),
    kind: (r.kind as StudioLink['kind']) ?? 'other',
    isDefault: Boolean(r.is_default),
    position: Number(r.position ?? 0),
  }
}

export function validateCreateVideo(body: unknown): Ok<CreateVideoBody & { url: string }> | Err {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'missing_fields' }
  const o = body as Record<string, unknown>
  const title = typeof o.title === 'string' ? o.title.trim() : ''
  if (!title) return { ok: false, error: 'missing_fields' }
  const url = typeof o.url === 'string' ? o.url.trim() : ''
  return { ok: true, value: { title, url } }
}

export function validateUpdateVideo(body: unknown): Ok<UpdateVideoBody> | Err {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'missing_fields' }
  const o = body as Record<string, unknown>
  const value: UpdateVideoBody = {}
  if (typeof o.title === 'string') value.title = o.title.trim()
  if (typeof o.url === 'string') value.url = o.url.trim()
  if (o.status !== undefined) {
    if (!STUDIO_VIDEO_STATUSES.includes(o.status as never)) return { ok: false, error: 'bad_status' }
    value.status = o.status as UpdateVideoBody['status']
  }
  if (o.publishedAt === null || typeof o.publishedAt === 'string') value.publishedAt = o.publishedAt as string | null
  if (o.notes === null || typeof o.notes === 'string') value.notes = o.notes as string | null
  if (o.extra === null || (typeof o.extra === 'object' && o.extra !== null)) {
    value.extra = o.extra as UpdateVideoBody['extra']
  }
  return { ok: true, value }
}

export function validateCreateLink(
  body: unknown,
): Ok<Required<Pick<CreateLinkBody, 'label' | 'url' | 'kind' | 'videoId' | 'isDefault' | 'position'>>> | Err {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'missing_fields' }
  const o = body as Record<string, unknown>
  const label = typeof o.label === 'string' ? o.label.trim() : ''
  const url = typeof o.url === 'string' ? o.url.trim() : ''
  if (!label || !url) return { ok: false, error: 'missing_fields' }
  const kind = o.kind === undefined ? 'other' : (o.kind as string)
  if (!STUDIO_LINK_KINDS.includes(kind as never)) return { ok: false, error: 'bad_kind' }
  return {
    ok: true,
    value: {
      label,
      url,
      kind: kind as StudioLink['kind'],
      videoId: typeof o.videoId === 'string' ? o.videoId : null,
      isDefault: Boolean(o.isDefault),
      position: typeof o.position === 'number' ? o.position : 0,
    },
  }
}

export function validateUpdateLink(body: unknown): Ok<UpdateLinkBody> | Err {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'missing_fields' }
  const o = body as Record<string, unknown>
  const value: UpdateLinkBody = {}
  if (typeof o.label === 'string') value.label = o.label.trim()
  if (typeof o.url === 'string') value.url = o.url.trim()
  if (o.kind !== undefined) {
    if (!STUDIO_LINK_KINDS.includes(o.kind as never)) return { ok: false, error: 'bad_kind' }
    value.kind = o.kind as UpdateLinkBody['kind']
  }
  if (o.isDefault !== undefined) value.isDefault = Boolean(o.isDefault)
  if (typeof o.position === 'number') value.position = o.position
  return { ok: true, value }
}
