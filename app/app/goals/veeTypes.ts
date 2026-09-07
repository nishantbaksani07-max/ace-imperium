/**
 * Vee Goals — domain types for the authoritative Supabase model
 * (migration 20260618000001). Mirrors the demo vocabulary so the ported UI
 * maps straight onto these. Pure types only; row<->domain mappers live in
 * lib/goals/repo.ts.
 */
import type { GoalCategory } from '@/lib/goals/categories'

/** Per-goal accountability: how much Vee shows up about this goal. */
export type Push = 'silent' | 'gentle' | 'balanced' | 'push'
/** 1 = Low, 2 = Medium, 3 = High. */
export type Prio = 1 | 2 | 3
export type BigGoalStatus = 'active' | 'achieved' | 'paused' | 'abandoned'

/** A big personal goal the user authors ("hit 1,000 subscribers"). */
export interface BigGoal {
  id: string
  title: string
  /** AI-tidied professional restatement of `title`; null until categorized. */
  cleanTitle: string | null
  /** One of the nine triage buckets; null until categorized. */
  category: GoalCategory | null
  /** ISO 'YYYY-MM-DD' — null = no deadline. */
  targetDate: string | null
  priority: Prio
  push: Push
  /** Optional numeric progress; null target = no progress bar (milestone-style). */
  progressCurrent: number | null
  progressTarget: number | null
  progressUnit: string | null
  /** Optional identity this goal votes toward ("a lifter"). */
  identityTag: string | null
  /** User-picked steering metric ("what steers this"): a guide module name
   *  ('weight', 'train', ...) or 'stream:<canonical_key>' for one of the user's
   *  own tile streams. null/absent = let Vee decide (auto-binding). Optional so
   *  pre-override fixtures and rows keep working unchanged. */
  bindingOverride?: string | null
  status: BigGoalStatus
  createdAt: string
  updatedAt: string
  achievedAt: string | null
}

export type HabitKind = 'habit' | 'task' | 'milestone'
export type HabitStatus = 'open' | 'completed' | 'archived'
export type HabitDifficulty = 'red' | 'yellow' | 'green' | null
export type HabitSource = 'supplements' | 'fitness' | 'finance' | 'mentor' | 'auto' | null

/**
 * How an auto-tracked habit is evaluated from real module data, e.g.
 *   { metric: 'train', target: 4, window: 'week' }
 *   { metric: 'protein', window: 'day' }
 *   { metric: 'sleep', target: 3, window: 'week', hours: 8 }
 * null = manual, user-tapped.
 */
export interface HabitTracking {
  metric: string
  target?: number
  window?: 'day' | 'week'
  unit?: string
  hours?: number
}

/** A small "THIS WEEK with Vitality" goal — auto-tracked or manually tapped. */
export interface HabitGoal {
  id: string
  parentGoalId: string | null
  title: string
  kind: HabitKind
  dueDate: string | null
  difficulty: HabitDifficulty
  estimatedMinutes: number | null
  suggestedStartHour: number | null
  whenCue: string | null
  source: HabitSource
  tracking: HabitTracking | null
  status: HabitStatus
  isTomorrow: boolean
  pushCount: number
  lastPushedAt: string | null
  createdAt: string
  completedAt: string | null
}

/** Global Duolingo-style streak. Maps 1:1 onto the goals_streak row. */
export interface GoalStreak {
  current: number
  longest: number
  lastExtendedDate: string | null
  freezes: number
  freezesUsed: number
}

export const EMPTY_STREAK: GoalStreak = {
  current: 0,
  longest: 0,
  lastExtendedDate: null,
  freezes: 0,
  freezesUsed: 0,
}

/** Everything the Goals surface needs on first load. */
export interface VeeGoalsState {
  bigGoals: BigGoal[]
  habitGoals: HabitGoal[]
  streak: GoalStreak
}
