/**
 * Type definitions for the Water module.
 *
 * Profile fields (weight / age / sex / units) are owned by the canonical
 * user_profile row in Supabase — see actions.ts and page.tsx. Everything
 * else (display unit, bottle/glass size, activity hours, caffeine, added
 * substances, daily logs) lives in localStorage under `vitality_water_v1`.
 * Logs migrate to Supabase in a later BUILD.
 *
 * All volumes are stored in ml regardless of what the user sees on screen.
 * Display unit (bottle/glass/oz/ml) is a UI-boundary concern handled in
 * state.ts -> unitVolMl / unitLabel.
 */

export type WaterUnit = 'bottle' | 'glass' | 'oz' | 'ml'
export type WeightUnit = 'kg' | 'lb'
/** Subset of user_profile.sex used by the target-water formula. */
export type Sex = 'm' | 'f'

/**
 * Snapshot of the account-level profile fields the Water module needs.
 * Built server-side in page.tsx from user_profile; updates are written
 * back via actions.ts:updateAccountProfile. The Water module never
 * stores its own copy of these — it just renders + edits them.
 *
 *  - weightKg: always actual kilograms (matches user_profile.starting_weight_kg).
 *  - age: derived from user_profile.birthday; read-only here (edit lives
 *    on the account page so it's a single source of truth across modules).
 *  - sex: 'm' | 'f' (user_profile.sex is 'M' | 'F').
 *  - weightUnit: display preference, mirrors user_profile.units.
 */
export interface AccountProfile {
  weightKg: number
  age: number
  sex: Sex
  weightUnit: WeightUnit
}

export interface Substance {
  id: string
  name: string
  cat: string
  unit: string
  defaultDose: number
  mlPerUnit: number
  /** User-overridden dose (falls back to defaultDose). */
  dose?: number
  note?: string
  /**
   * Optional per-unit potency (e.g. mg per nicotine pouch). When
   * `mlPerMg` is also set on the DB entry, the water bump becomes
   *   dose × (strengthMg ?? defaultStrengthMg) × mlPerMg
   * instead of dose × mlPerUnit — used for substances where one
   * "unit" of dose (e.g. one pouch) varies widely in strength.
   */
  defaultStrengthMg?: number
  /** User-overridden strength (falls back to defaultStrengthMg). */
  strengthMg?: number
  /** Common strengths to surface in the strength picker. */
  strengthOptions?: number[]
  /** ml of water per mg of active ingredient (see defaultStrengthMg). */
  mlPerMg?: number
}

/**
 * Local (per-device) water module state. Account-backed profile fields
 * are deliberately NOT in here — they live on user_profile and flow in
 * as a separate prop. See AccountProfile.
 */
export interface WaterState {
  version: 2
  unit: WaterUnit
  bottleMl: number
  glassMl: number
  /** Water-specific (no user_profile column). Stays local. */
  activityHrsPerWeek: number
  caffeineMgPerDay: number
  substances: Substance[]
  /** Map of YYYY-MM-DD (local) -> count of servings consumed that day. */
  logs: Record<string, number>
  /**
   * Whether the user has finished the one-time onboarding wizard in
   * Settings. False on a brand-new device so the modal opens in wizard
   * mode; flipped true on wizard completion. Returning users (carrying
   * pre-wizard logs over) are auto-marked complete during migration —
   * see state.ts:normalize.
   */
  setupComplete: boolean
}

export interface TargetBreakdown {
  base: number
  exercise: number
  caffeine: number
  subs: number
  adjust: number
  total: number
}
