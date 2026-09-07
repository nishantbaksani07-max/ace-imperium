import type { ReportedStream } from '@/lib/tiles/reportContract'
import { REPORT_KEY, REPORT_KIND, type StudioVideo } from '@/lib/studio/types'

/**
 * Build the single life-stream the Studio tile reports into Vee: the running
 * count of the user's published videos. Pure, so the sealed tile's report call
 * and this helper cannot drift, and the shape is guarded against the LOCKED
 * reportContract in tests. See lib/tiles/reportContract.ts (kind must be one of
 * the fixed 7-member taxonomy; 'count' with goalDirection 'up').
 */
export function publishedCountToReport(
  videos: Pick<StudioVideo, 'status'>[],
  dateKey: string,
): ReportedStream {
  const value = videos.reduce((n, v) => (v.status === 'published' ? n + 1 : n), 0)
  return {
    key: REPORT_KEY,
    label: 'Videos shipped',
    value,
    date: dateKey,
    kind: REPORT_KIND,
    goalDirection: 'up',
  }
}
