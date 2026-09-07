import type { UsdaCandidate } from './types'

export const RAW_MARKERS = /\b(raw|dry|uncooked|unprepared)\b/i
const RAW_OPT_IN = /\b(raw|dry|uncooked|unprepared|sushi|sashimi|tartare|carpaccio)\b/i

export function filterBasicResults(candidates: UsdaCandidate[], query: string): UsdaCandidate[] {
  const wantsRaw = RAW_OPT_IN.test(query || '')
  return candidates.filter((c) => {
    const desc = c.description || ''
    if (!wantsRaw && RAW_MARKERS.test(desc)) return false
    if ((c.per100?.kcal || 0) === 0) return false
    return true
  })
}
