import type { IntakeAnswers } from './presets'

export type GymLevel = 'beginner' | 'intermediate' | 'advanced'

// Derive gym_level from intake.experience. Conservative on uncertainty —
// 'back_long' (long lay-off) and missing intake both default to beginner
// so starting weights err light; the logger auto-calibrates upward on
// the first real set anyway. Intermediate users who skipped the intake
// see slightly-too-light estimates on session 1 and adjust inline.
//
// Lives in its own module (not actions.ts) because actions.ts is a
// 'use server' file, where every runtime export must be an async server
// action — a plain sync helper can't be exported from there.
export function gymLevelFromIntake(answers: IntakeAnswers | null | undefined): GymLevel {
  if (!answers) return 'beginner'
  switch (answers.experience) {
    case 'new':         return 'beginner'
    case 'back_long':   return 'beginner'
    case 'some':        return 'intermediate'
    case 'back_recent': return 'intermediate'
    case 'experienced': return 'advanced'
    default:            return 'beginner'
  }
}
