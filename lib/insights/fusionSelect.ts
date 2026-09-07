/**
 * Fusion selection — the small bridge between the seam detectors and the §01 card.
 * Each seam (caffeine x recovery, sleep x training, ...) produces a FusionCandidate
 * carrying its card copy, an honest "watched" label, and a ScoredInsight. This runs
 * them all through the correlation engine's ranking (deepest TRUE insight first, then
 * strongest) and returns the ONE Vee should show. As more seams land, the engine
 * keeps choosing the best automatically, exactly as the spec describes.
 *
 * Pure + IO-free + unit-tested (see __tests__/fusionSelect.test.ts).
 */

import { selectStrongest } from './correlationEngine'
import type { FusionCandidate } from './fusion'

// Re-exported here so the selection layer is the one import seams + the gather need.
export { relContrast } from './correlationEngine'
export type { FusionCandidate } from './fusion'

/** The single fusion notice Vee surfaces, or null when no seam fired. */
export function selectFusion(
  candidates: ReadonlyArray<FusionCandidate | null | undefined>,
): FusionCandidate | null {
  const real = candidates.filter((c): c is FusionCandidate => !!c)
  if (real.length === 0) return null
  // Rank by the engine on each candidate's score, carrying the candidate along.
  const winner = selectStrongest(real.map((c) => ({ ...c.score, candidate: c })))
  return winner ? winner.candidate : null
}
