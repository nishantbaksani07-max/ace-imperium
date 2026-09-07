// CozyLoader content library — the canonical home for every section's cozy-wait
// lines. Any page imports from '@/lib/cozy': the CozyLoader component renders
// these, the /cozy-library lab browses them, and lib/cozy/PROMPT.md is the
// claude.ai prompt that generates more of them in the same shape.

import { FUEL_SET } from './fuel'
import { COACH_SET } from './coach'
import { MENTOR_SET } from './mentor'
import { PEAK_SET } from './peak'
import { FITNESS_SET } from './fitness'
import { FINANCE_SET } from './finance'
import { GOALS_SET } from './goals'
import { ONBOARDING_SET } from './onboarding'
import { EMPTY_SET } from './empty'
import type { CozySet } from './types'

export * from './types'
export { FUEL_SET, COACH_SET, MENTOR_SET, PEAK_SET, FITNESS_SET, FINANCE_SET, GOALS_SET, ONBOARDING_SET, EMPTY_SET }

/** Every section's set, in lab display order. */
export const COZY_SETS: CozySet[] = [
  FUEL_SET,
  COACH_SET,
  MENTOR_SET,
  PEAK_SET,
  FITNESS_SET,
  FINANCE_SET,
  GOALS_SET,
  ONBOARDING_SET,
  EMPTY_SET,
]

/** Lookup a set by id (e.g. COZY_SET_BY_ID.mentor). */
export const COZY_SET_BY_ID: Record<string, CozySet> = Object.fromEntries(
  COZY_SETS.map((s) => [s.id, s]),
)
