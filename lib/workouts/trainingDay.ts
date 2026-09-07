import type { SplitDay } from '@/app/app/fitness/log/splitData'

export interface TrainingDayGuess {
  /** Best guess for today's split day, or null when there's no basis to guess. */
  guess: SplitDay | null
  /** Human reason shown in the Confirm card sub-line. Empty when no guess. */
  reason: string
  /** The full rotation, for the Choice fallback. */
  options: SplitDay[]
}

/**
 * Assume-then-confirm: pick the next day in the user's rotation cycle after the
 * one they last logged. Cycle-based, not weekday-based. Always confirmed by the
 * user via the UI, so a wrong guess is harmless. Pure and side-effect free.
 */
export function guessTrainingDay(
  rotation: SplitDay[],
  lastWorkout: { dayName: string; date: string } | null,
  _today: string,
): TrainingDayGuess {
  if (!rotation.length) return { guess: null, reason: '', options: [] }
  if (!lastWorkout) return { guess: null, reason: '', options: rotation }

  const idx = rotation.findIndex(d => d.name === lastWorkout.dayName)
  if (idx === -1) return { guess: null, reason: '', options: rotation }

  const next = rotation[(idx + 1) % rotation.length]
  const weekday = new Date(`${lastWorkout.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' })
  return {
    guess: next,
    reason: `Last session was ${lastWorkout.dayName} on ${weekday}, so ${next.name.toLowerCase()} is next in your rotation.`,
    options: rotation,
  }
}
