import type { Sex, Units, FocusArea } from '@/lib/supabase/types'

const STORAGE_KEY = 'vitality_onboarding_v1'

// Strict return type — all fields have the exact union types that FormState expects.
// This is what the component spreads into state, so types must match.
export interface ValidatedCacheState {
  userId: string
  step: number
  firstName: string
  birthday: string
  sex: Sex | ''
  heightCm: string
  heightFt: string
  heightIn: string
  startingWeightKg: string
  startingWeightLbs: string
  units: Units
  focusAreas: FocusArea[]
}

// Loose input type for saving — we validate on load, not on save.
// Accepts FormState spread (where sex/units/goal are union types) as well as
// the broader strings written by the cache test helpers.
interface RawCacheInput {
  step: number
  firstName?: string
  birthday?: string
  sex?: string
  heightCm?: string
  heightFt?: string
  heightIn?: string
  startingWeightKg?: string
  startingWeightLbs?: string
  units?: string
  focusAreas?: FocusArea[]
}

const VALID_SEX = new Set<string>(['M', 'F', ''])
const VALID_UNITS = new Set<string>(['metric', 'imperial'])
const VALID_FOCUS = new Set<string>(['body', 'mind', 'peak', 'brand', 'money'])

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

// Returns a fully validated cache state whose field types match FormState exactly.
// Clears storage and returns null when userId doesn't match (cross-user guard).
// Invalid union values are defaulted to the FormState initial value instead of
// propagating a bad string into strictly-typed state.
export function loadOnboardingCache(userId: string): ValidatedCacheState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const p = JSON.parse(raw) as Record<string, unknown>

    if (typeof p.userId !== 'string' || p.userId !== userId) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    if (typeof p.step !== 'number') return null

    return {
      userId: p.userId,
      step: p.step,
      firstName: str(p.firstName),
      birthday: str(p.birthday),
      sex: VALID_SEX.has(str(p.sex)) ? (str(p.sex) as Sex | '') : '',
      heightCm: str(p.heightCm),
      heightFt: str(p.heightFt),
      heightIn: str(p.heightIn, '0'),
      startingWeightKg: str(p.startingWeightKg),
      startingWeightLbs: str(p.startingWeightLbs),
      units: VALID_UNITS.has(str(p.units)) ? (str(p.units) as Units) : 'metric',
      focusAreas: Array.isArray(p.focusAreas)
        ? (p.focusAreas as unknown[]).filter((v): v is FocusArea => typeof v === 'string' && VALID_FOCUS.has(v))
        : [],
    }
  } catch {
    return null
  }
}

export function saveOnboardingCache(userId: string, state: RawCacheInput): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, userId }))
  } catch {}
}

export function clearOnboardingCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}
