/**
 * The end-of-session cardio library.
 *
 * A deliberately small, broad set covering what any user (and what a wearable
 * like Whoop) would log as zone-2 cardio. Kept flat — no tiers, no muscles —
 * because cardio at the end of a lift session is meant to be a two-tap log,
 * not a planning surface. Future wearable imports map their activity type onto
 * one of these ids.
 */
export interface CardioType {
  id: string
  label: string
}

export const CARDIO_TYPES: CardioType[] = [
  { id: 'walk', label: 'Walk' },
  { id: 'incline_walk', label: 'Incline walk' },
  { id: 'run', label: 'Run' },
  { id: 'cycle', label: 'Cycling' },
  { id: 'row', label: 'Rowing' },
  { id: 'stairs', label: 'Stairmaster' },
  { id: 'elliptical', label: 'Elliptical' },
  { id: 'other', label: 'Other cardio' },
]

/** Display label for a stored cardio type id (defensive against renames). */
export function cardioLabel(id: string): string {
  return CARDIO_TYPES.find((t) => t.id === id)?.label ?? 'Cardio'
}
