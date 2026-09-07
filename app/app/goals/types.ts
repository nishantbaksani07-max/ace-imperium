/**
 * Goals module — data model.
 *
 * Single-table design: every "goal" is a Goal record. The differences
 * between a daily habit, a one-shot task, and a long-term goal collapse
 * to three orthogonal fields rather than three separate types:
 *
 *   - `kind`       'habit' (recurs) | 'task' (one-off) | 'milestone' (sub-goal)
 *   - `dueDate`    null = no deadline · 'YYYY-MM-DD' otherwise
 *   - `parentId`   when set, this goal is a milestone of another Goal
 *
 * A long-term goal is just a regular Goal that other goals point at via
 * parentId. The unified view groups by parentId to surface progress.
 */

export type GoalKind = 'habit' | 'task' | 'milestone'

/**
 * Difficulty drives smart-slot suggestion via Peak's existing curve.
 *   red    → hard task; slotted in the highest-scoring peak window
 *   yellow → normal task; slotted in a moderate window
 *   green  → easy task; slotted in the lowest (but still usable) window
 *   null   → "quick add" — no smart scheduling, no color border
 *
 * Mirrors Peak's TaskDifficulty enum (we map red→hard, yellow→normal,
 * green→easy when calling findSlotByMode) so the underlying scheduling
 * logic stays single-sourced in app/app/peak/schedule.ts.
 */
export type Difficulty = 'red' | 'yellow' | 'green' | null

export interface Goal {
  id: string
  title: string
  kind: GoalKind
  /** ISO 'YYYY-MM-DD' — null means no deadline (for habits or open-ended). */
  dueDate: string | null
  /** Optional difficulty rating. null = quick-add, no color, no smart slot. */
  difficulty: Difficulty
  /** Estimated duration in minutes — required for smart slot suggestion. */
  estimatedMinutes: number | null
  /**
   * Suggested start hour (decimal, e.g. 9.5 = 9:30 AM). Filled in when the
   * user accepts a smart-slot suggestion at add-time. Display only — does
   * not write a ScheduledEvent into Peak (that's a separate explicit action).
   */
  suggestedStartHour: number | null
  /** Optional parent Goal id — when set, this is a milestone. */
  parentId?: string | null
  /** Optional "when X, I will Y" implementation intention. */
  whenCue?: string | null
  /** Optional source — when this Goal was auto-generated from another module. */
  source?: 'supplements' | 'fitness' | 'finance' | null
  /** Created timestamp (ms). */
  createdTs: number
  /** Completed timestamp (ms) when status === 'completed'. */
  completedTs?: number | null
  /** When the user last rescheduled to tomorrow — used to detect chronic punters. */
  lastPushedTs?: number | null
  /** How many times this goal has been pushed to tomorrow. */
  pushCount: number
  /** Current status — derived for habits per-day, stored for tasks. */
  status: 'open' | 'completed' | 'archived'
}

/**
 * Streak state — strict Duolingo-style. The user has one global streak
 * for "did I complete all my required goals today." Freezes auto-apply
 * if streak would break and a freeze is available.
 */
export interface StreakState {
  current: number
  longest: number
  /** ISO date of the last day the streak was extended. */
  lastExtendedDate: string | null
  /** Number of streak freezes available. Earned 1 per 7-day streak milestone. */
  freezes: number
  /** Total freezes auto-used historically — surfaced as "saves" in UI. */
  freezesUsed: number
}

/**
 * Per-day completion log. Lets us answer "was today completed?" and
 * "did the streak break yesterday?" without recomputing from goal status.
 */
export interface DayLog {
  date: string                  // YYYY-MM-DD
  requiredCount: number         // goals that had to be done today
  completedCount: number
  /** True when requiredCount > 0 AND completedCount === requiredCount. */
  successful: boolean
  /** True when a freeze was consumed to save the streak this day. */
  freezeUsed: boolean
}

/** Persisted module state — single localStorage blob. */
export interface GoalsPersistedState {
  goals: Goal[]
  streak: StreakState
  dayLogs: DayLog[]
  /** Goals queued for "plan tomorrow" — locked until 6am next day. */
  tomorrow: Goal[]
}

/** Difficulty display meta — drives row color + label. */
export const DIFFICULTY_META: Record<Exclude<Difficulty, null>, { label: string; tint: string; hint: string; peakMode: 'highest' | 'moderate' | 'lowest' }> = {
  red:    { label: 'Hard',   tint: '#EF4444', hint: 'Pair with peak energy',     peakMode: 'highest' },
  yellow: { label: 'Medium', tint: '#F59E0B', hint: 'Moderate window is fine',   peakMode: 'moderate' },
  green:  { label: 'Easy',   tint: '#6EE7B7', hint: 'Anytime, low energy ok',    peakMode: 'lowest'  },
}

/** Format a decimal hour (e.g. 13.5) as "1:30 PM". */
export function formatHour(decimalHour: number): string {
  const h = Math.floor(decimalHour)
  const m = Math.round((decimalHour - h) * 60)
  const h12 = ((h + 11) % 12) + 1
  const ampm = h < 12 ? 'AM' : 'PM'
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}
