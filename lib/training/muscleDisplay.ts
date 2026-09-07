/**
 * Maps the fine-grained `MuscleGroup` (front_delts, lats, mid_upper_back,
 * etc., from `volumeLandmarks.ts`) onto the broader 12-icon library
 * (`components/MuscleIcon.tsx`).
 *
 * Two collapses happen here:
 *   - The three deltoid heads (front/side/rear) share the Shoulders glyph.
 *   - Lats and mid-upper-back both render as the Back glyph; traps gets
 *     its own glyph (kite) for when an attribution explicitly hits traps.
 *
 * Display labels stay fine-grained so the user still sees "Front delts" /
 * "Lats" / "Mid back" — only the glyph collapses. That matches the
 * picker's existing volume-audit copy ("hits 4 of your 14 weekly chest
 * sets") which uses the fine-grained groups by name.
 */

import type { MuscleGroup } from './volumeLandmarks'
import type { MuscleIconKey } from '@/components/MuscleIcon'
import { attributionFor } from './muscleMapping'

const ICON_FOR_GROUP: Record<MuscleGroup, MuscleIconKey> = {
  chest:          'chest',
  lats:           'back',
  mid_upper_back: 'back',
  front_delts:    'shoulders',
  side_delts:     'shoulders',
  rear_delts:     'shoulders',
  biceps:         'biceps',
  triceps:        'triceps',
  quads:          'quads',
  hamstrings:     'hamstrings',
  glutes:         'glutes',
  calves:         'calves',
  core:           'core',
}

const LABEL_FOR_GROUP: Record<MuscleGroup, string> = {
  chest:          'Chest',
  lats:           'Lats',
  mid_upper_back: 'Mid back',
  front_delts:    'Front delts',
  side_delts:     'Side delts',
  rear_delts:     'Rear delts',
  biceps:         'Biceps',
  triceps:        'Triceps',
  quads:          'Quads',
  hamstrings:     'Hamstrings',
  glutes:         'Glutes',
  calves:         'Calves',
  core:           'Core',
}

export function iconKeyForMuscleGroup(group: MuscleGroup): MuscleIconKey {
  return ICON_FOR_GROUP[group]
}

export function labelForMuscleGroup(group: MuscleGroup): string {
  return LABEL_FOR_GROUP[group]
}

export interface ExerciseMuscleDisplay {
  /** The glyph to render — always the primary mover's icon. */
  iconKey: MuscleIconKey
  /** "Chest", "Front delts", etc. — the primary muscle name. */
  primaryLabel: string
  /** Secondary movers as fine-grained labels, deduped, in attribution order. */
  secondaryLabels: string[]
  /** "Chest · Triceps · Front delts" — primary first, then secondaries.
   *  Useful as a one-line subtitle under an exercise name. */
  joinedLabel: string
}

/**
 * Resolve the icon + muscle labels for an exercise id. Returns `null`
 * when the exercise isn't in EXERCISE_MUSCLE_ATTRIBUTION — callers
 * should fall back to no icon (don't invent a default that could mislead).
 */
export function exerciseMuscleDisplay(exerciseId: string): ExerciseMuscleDisplay | null {
  const att = attributionFor(exerciseId)
  if (!att) return null
  const primaryLabel = LABEL_FOR_GROUP[att.primary]
  const secondaryLabels = (att.secondary ?? []).map(s => LABEL_FOR_GROUP[s])
  return {
    iconKey: ICON_FOR_GROUP[att.primary],
    primaryLabel,
    secondaryLabels,
    joinedLabel: [primaryLabel, ...secondaryLabels].join(' · '),
  }
}
