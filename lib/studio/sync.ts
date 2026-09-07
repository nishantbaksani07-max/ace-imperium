import type { StudioVideo, StudioLink } from '@/lib/studio/types'

/**
 * The sealed tile saves cards WITHOUT createdAt/updatedAt (the DB mints those),
 * so the envelope's video shape is StudioVideo minus those two server-owned
 * fields. This is the exact JSON the tile persists via Vitality.save.
 *
 * Not wired into useTileHost yet (Task 6 found no injectable save/load seam
 * there; save/load are hard-wired to tileStore). This module is the pure
 * translation a later slice plugs in once that seam exists. See
 * docs/superpowers/sdd/task-6-report.md for the full read.
 */
export type EnvelopeVideo = Omit<StudioVideo, 'createdAt' | 'updatedAt'>

export interface StudioEnvelope {
  v: 1
  videos: EnvelopeVideo[]
  links: StudioLink[]
}

/** Split the tile's saved blob into the row shapes the endpoints accept. */
export function envelopeToWrites(env: StudioEnvelope): { videos: EnvelopeVideo[]; links: StudioLink[] } {
  return {
    videos: Array.isArray(env?.videos) ? env.videos : [],
    links: Array.isArray(env?.links) ? env.links : [],
  }
}

/** Fold the endpoint responses back into the blob the tile expects on load. */
export function writesToEnvelope(videos: StudioVideo[], links: StudioLink[]): StudioEnvelope {
  return { v: 1, videos: videos ?? [], links: links ?? [] }
}
