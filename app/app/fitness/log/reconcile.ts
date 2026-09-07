import type { DayExercise } from './splitData'
import type { SavedExercise } from '@/lib/workouts/queries'

/** One slot in today's reconstructed exercise list. */
export interface ReconciledSlot {
  /** The exercise def to render (id / sets / reps), with `added: true` for
   *  user-added lifts so the UI can tag them and offer "keep". */
  def: DayExercise
  /** The saved workout row for this slot, or null when nothing is saved yet. */
  saved: SavedExercise | null
}

/**
 * Reconstruct today's ordered exercise list from the split (`dayExercises`)
 * and any already-saved workout row (`initialExercises`).
 *
 * The saved row is the source of truth for ORDER today. It records:
 *   - swaps   — same slot, a different exercise id (added !== true)
 *   - adds    — a user-inserted lift (added === true), interleaved at the spot
 *               where the user dropped it
 *
 * Non-added rows are matched to `dayExercises` BY ID (not position), so a
 * mid-list insert — or a transient mismatch between the split and the saved
 * row (e.g. right after "keep" updates rotation_days) — never shifts a lift
 * onto the wrong saved sets or duplicates one. Added rows are emitted inline at
 * their saved position; a saved id absent from the split is treated as a swap
 * and keeps its own saved shape; split lifts missing from the saved row are
 * appended fresh.
 */
export function reconcileExercises(
  dayExercises: DayExercise[],
  initialExercises: SavedExercise[] | null,
): ReconciledSlot[] {
  if (!initialExercises || initialExercises.length === 0) {
    return dayExercises.map(def => ({ def, saved: null }))
  }

  const splitById = new Map<string, DayExercise>()
  for (const d of dayExercises) if (!splitById.has(d.id)) splitById.set(d.id, d)

  const usedSplitIds = new Set<string>()
  const slots: ReconciledSlot[] = []
  let swapCount = 0 // non-added saved rows whose id isn't a split lift (a swap)

  for (const s of initialExercises) {
    if (s.added) {
      slots.push({
        def: { id: s.id, sets: s.targetSets, reps: s.targetReps, added: true },
        saved: s,
      })
      continue
    }

    const splitDef = splitById.get(s.id)
    if (splitDef && !usedSplitIds.has(s.id)) {
      // Split lift — use the split's live prescription, attach its saved sets.
      usedSplitIds.add(s.id)
      slots.push({ def: splitDef, saved: s })
    } else {
      // Swap: the saved id isn't a (remaining) split lift, so it filled a split
      // slot the user swapped out. Keep its own saved shape — never orphan data.
      swapCount++
      slots.push({ def: { id: s.id, sets: s.targetSets, reps: s.targetReps }, saved: s })
    }
  }

  // Split lifts absent from the saved row split into two buckets: those a swap
  // already replaced (don't re-add the swapped-out lift), and those genuinely
  // not yet saved (a fresh session lift, or a mid-day keep/setup edit the
  // workouts row hasn't caught up to). Each swap accounts for one absence, so
  // append only the surplus — the not-yet-saved ones.
  const uncovered = dayExercises.filter(d => !usedSplitIds.has(d.id))
  for (const d of uncovered.slice(0, Math.max(0, uncovered.length - swapCount))) {
    slots.push({ def: d, saved: null })
  }

  return slots
}
