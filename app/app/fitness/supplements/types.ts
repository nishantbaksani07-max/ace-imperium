/**
 * Supplement module types.
 *
 * State is persisted as a single namespaced blob in localStorage
 * (`vitality_supplements_v1`). Mirrors the water module pattern; will
 * migrate to Supabase in a later BUILD.
 */

export type WindowKey = 'morning' | 'lunch' | 'evening' | 'bed' | 'anytime'

/** Time blocks that can be toggled on/off in the schedule (anytime is always on). */
export type ToggleableSlot = 'morning' | 'lunch' | 'evening' | 'bed'

/** Colour family for an intake-condition label (maps to a CSS tone class). */
export type ConditionTone = 'food' | 'empty' | 'timing' | 'water' | 'habit'

/** A reusable intake-condition label (e.g. "With food", "Empty stomach"). */
export interface ConditionLabel {
  id: string
  label: string
  tone: ConditionTone
  /** VitalityIcon name shown on the chip. */
  icon: string
}

/**
 * A line in the user's stack — what they take, how much, when.
 *
 * Notes on identity:
 *  - `id` is unique per stack entry, not per substance, so the same
 *    supplement can be added in two windows (e.g. magnesium AM + PM).
 *  - `sourceId` ties an entry back to the seeded DB row it came from
 *    so we can show the info popover later. null for hand-typed items.
 */
export interface StackItem {
  id: string
  name: string
  icon: string
  dose: string
  window: WindowKey
  note: string
  sourceId: string | null
  /** Intake-condition label ids (see CONDITIONS in supplements.ts). */
  conditions: string[]
  /** Editorial flag, not auth — "I've ordered this from my pharmacy". */
  ordered: boolean
}

/**
 * Map of stack-item id -> timestamp the user marked it taken today.
 * Resets at the 6 AM day boundary (so a 1 AM nightcap still counts as
 * "yesterday's evening dose").
 */
export type TakenMap = Record<string, number>

/** Stack-item ids the user has flagged as running low. */
export type LowList = string[]

export interface SupplementsState {
  version: 2
  items: StackItem[]
  taken: Record<string, TakenMap>  // dateKey -> taken map
  low: LowList
  /** Toggleable time blocks shown on the day rail. 'anytime' is implicit. */
  slots: ToggleableSlot[]
}

/**
 * Signals the recommender pulls from the user's connected state.
 * Each db row declares the signals it responds to via `signalBoosts`.
 *
 * Order is rough categories:
 *   - stimulant / caffeine load
 *   - substance flags (from water module's substances array)
 *   - training context (from training_settings.gym_level)
 *   - goal (from user_profile.goal)
 *   - demographic (sex, age band)
 *   - sleep/recovery (placeholder for future WHOOP wiring)
 */
export type Signal =
  | 'high-caffeine'        // >200 mg/day
  | 'very-high-caffeine'   // >400 mg/day
  | 'has-stims'            // ADHD stim or generic stim in water substances
  | 'has-nicotine'
  | 'has-alcohol'
  | 'beginner-training'
  | 'heavy-training'       // intermediate+ gym level
  | 'bulk-goal'
  | 'cut-goal'
  | 'recomp-goal'
  | 'general-health-goal'
  | 'male'
  | 'female'
  | 'aging'                // 40+
  | 'senior'               // 50+
  | 'poor-sleep'           // reserved for WHOOP wiring
  | 'low-recovery'         // reserved for WHOOP wiring

/**
 * Curated supplement DB row. Search hits in `aliases` + `name`. The
 * info popover (i) on each result reads the rich fields (`helps`,
 * `bestTime`, `note`); the recommender reads `baseScore`, `signalBoosts`,
 * and the cost fields.
 */
export interface DbSupplement {
  id: string
  name: string
  icon: string
  dose: string
  window: WindowKey
  note: string          // short timing/usage tip
  helps: string         // 1-sentence "what it does"
  bestTime: string      // more nuanced timing detail than just the window
  aliases: string[]
  /** Suggested brand — well-regarded, mid-range. Not endorsements. */
  brand: string
  /**
   * Optional curated purchase URL. When unset, the UI generates an Amazon
   * search URL from `name + brand` instead — so this field is only worth
   * populating for products where a specific SKU is clearly best.
   */
  buyUrl?: string
  /** Rough US$ per month at the suggested dose. Round numbers. */
  priceUsdMonthly: number
  /** Default usefulness (1–10) for a generic adult. */
  baseScore: number
  /** Add/subtract from baseScore when the named signal is active. */
  signalBoosts: Partial<Record<Signal, number>>
}

/** A scored, ranked recommendation produced by the recommender. */
export interface Recommendation {
  supplement: DbSupplement
  /** Final 1–10 score after applying all active signal boosts. */
  score: number
  /** Active signals that contributed positively, for the "why" line. */
  reasons: Signal[]
}

export interface WindowMeta {
  key: WindowKey
  icon: string
  title: string
  time: string
  /** Hour-of-day past which an un-taken item counts as "missed". */
  cutoffHour: number | null
}
