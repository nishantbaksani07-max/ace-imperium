/**
 * Types for the Peak Score module.
 *
 * All times are stored as ms since epoch. Hours-of-day are decimal
 * (e.g. 13.5 = 1:30 PM). Score values are 0-100.
 */

export type SubstanceCategory =
  | 'caffeine'
  | 'hydration'
  | 'supplement'
  | 'adhd'
  | 'nicotine'
  | 'depressant'
  | 'workout'

export interface SubstanceDef {
  key: string
  name: string
  category: SubstanceCategory
  icon: string
  defaultDose: number
  unit: string
  /** Peak amplitude effect on focus score (0-100). Negative = sedative. */
  amplitude: number
  /** Hours until onset. */
  onsetHours: number
  /** Hours until peak effect. */
  peakHours: number
  /** Elimination half-life in hours. */
  halfLifeHours: number
  mechanism: string
}

export interface SubstanceLog {
  id: string
  key: string
  takenAt: number
  dose: number
  /** User's tolerance 1-10. Cached at log time so changing the slider
   *  later doesn't retroactively shift past logs. */
  tolerance: number
}

export interface SubjectiveTap {
  id: string
  /** -100 (foggy) to +100 (peak), matches the dial in peak-tracker.html. */
  value: number
  /** ms since epoch. */
  time: number
}

export interface Profile {
  weightKg: number
  tolerance: number
}

export interface WhoopSignal {
  recovery: number | null
  hrv: number | null
  sleepScore: number | null
  sleepHours: number | null
  sleepDebtHours: number | null
  strain: number | null
  wakeHour: number | null
  /** Mean HRV across the last 14 valid days. Null if fewer than 3 days. */
  hrvBaseline: number | null
  /** Mean RHR across the last 14 valid days. Null if fewer than 3 days. */
  rhrBaseline: number | null
  /** True when today's HRV reading is non-physiological (>150ms or <15ms).
   *  We surface this in the ticker so users know the signal isn't trusted. */
  hrvAnomalous: boolean
  /** Sample size feeding the baselines — surfaced as "calibrating · n/7d"
   *  in the ticker when we don't yet have 7 days of data. */
  daysAvailable: number
}

/** Category of a scheduled event — drives colour + icon in the timeline. */
export type EventType =
  | 'school'
  | 'work'
  | 'workout'
  | 'practice'
  | 'meeting'
  | 'social'
  | 'personal'
  | 'other'

/**
 * A timeboxed item on the schedule. Either `recurringDays` OR `date` is set:
 *   · recurringDays = [1,2,3,4,5] → repeats every weekday
 *   · date = '2026-05-28' → one-off on that calendar day
 * `skippedDates` lets the user opt out of a recurring instance without
 * destroying the rule ("not going to practice today").
 */
export interface ScheduledEvent {
  id: string
  title: string
  type: EventType
  /** Decimal hour (0–24). Example: 13.5 = 1:30 PM. */
  startHour: number
  endHour: number
  /** 0=Sun … 6=Sat. Null if this is a one-off. */
  recurringDays: number[] | null
  /** YYYY-MM-DD for one-off events. Null for recurring. */
  date: string | null
  /** YYYY-MM-DD list of recurring instances the user has skipped. */
  skippedDates: string[]
  createdAt: number
}

/**
 * The single "what matters most today" task. Kept for back-compat — new
 * code should use DayTask[] which supports multiple tasks per day with
 * difficulty routing.
 */
export interface HardestTask {
  title: string
  /** YYYY-MM-DD this task was set on. Lets us clear it on a new day. */
  setOn: string
  /** Estimated duration in hours (used to size the suggested slot). */
  durationHours: number
}

/**
 * Difficulty routes the task to a different kind of slot:
 *   · hard   → highest peak window (deep work, important decisions)
 *   · normal → moderate window (standard meetings, normal output)
 *   · easy   → lowest free window above score 25 (admin, replies, errands)
 */
export type TaskDifficulty = 'easy' | 'normal' | 'hard'

export interface DayTask {
  id: string
  title: string
  difficulty: TaskDifficulty
  durationHours: number
  /** YYYY-MM-DD this task was set on. */
  setOn: string
}

/**
 * One day's manual self-report — the universal fallback that makes the peak
 * score (and, since BUILD68, the Vitals tab) move with no wearable. Every field
 * is optional; the score uses what's filled. Stored keyed by local YYYY-MM-DD in
 * PeakState.manual. On save the filled fields are turned into WHOOP-style
 * Recovery/Sleep/Strain (lib/vitals/manualScore.ts) and upserted to
 * `wearable_data` provider 'manual' so both surfaces read the same source.
 */
export interface ManualVitals {
  // ── Sleep ──────────────────────────────────────────────────────────────
  /** Hours slept last night (decimal; BUILD68 made this hh:mm-precise). */
  sleepHours?: number
  /** "Going to bed" tap — ms since epoch. With wakeAt + asleepOffsetMin this
   *  derives an exact sleepHours; either timestamp stays editable if forgotten. */
  bedAt?: number
  /** "Woke up" tap — ms since epoch. */
  wakeAt?: number
  /** Minutes lying awake before sleep (default ~10), subtracted from the
   *  bed→wake span to get true time asleep. */
  asleepOffsetMin?: number
  /** How restful sleep felt, 1 (rough) – 5 (deep). */
  sleepQuality?: number

  // ── Body signals ───────────────────────────────────────────────────────
  /** Resting heart rate in bpm, measured via the in-app pulse timer. */
  rhr?: number
  /** Heart-rate variability in ms (typed in, or pulse-derived). The biggest
   *  recovery driver when present + a baseline exists. */
  hrv?: number

  // ── Subjective ─────────────────────────────────────────────────────────
  /** One merged read — "how do you feel?", 1 (wrecked) – 5 (amazing).
   *  Replaces the separate energy/stress/soreness taps (BUILD68). */
  feel?: number
  /** Self-reported physical exertion today, 1 (rest) – 5 (max effort). Manual
   *  can't measure cardio load, so this is what derives Strain. */
  exertion?: number

  // ── Legacy (BUILD62) — kept optional so old localStorage rows still read ─
  /** @deprecated merged into `feel`. */
  energy?: number
  /** @deprecated merged into `feel`. */
  stress?: number
  /** @deprecated merged into `feel`. */
  soreness?: number

  /** ms since epoch of last edit. */
  updatedAt: number
}

/**
 * An in-progress sleep session (BUILD68). Lives at the top level, NOT inside the
 * date-keyed `manual` map, because a session spans midnight: you tap "going to
 * bed" at 11pm (one local date) and "woke up" at 7am the next (a different date).
 * On wake we compute the duration and write it into the *wake* day's ManualVitals,
 * then clear this. Null when no session is open.
 */
export interface SleepSession {
  /** "Going to bed" tap — ms since epoch. */
  bedAt: number
  /** Minutes lying awake before sleep (default ~10). */
  asleepOffsetMin: number
}

export interface PeakState {
  version: 1
  profile: Profile
  substances: SubstanceLog[]
  taps: SubjectiveTap[]
  events: ScheduledEvent[]
  hardestTask: HardestTask | null
  /** Day-of tasks list (BUILD19). When a user "schedules it", the task is
   *  converted into a one-off ScheduledEvent and removed from this list. */
  tasks: DayTask[]
  /** Manual self-report keyed by local YYYY-MM-DD (BUILD62). Feeds the score
   *  when no wearable is connected. */
  manual: Record<string, ManualVitals>
  /** Open bed→wake session, if one is running (BUILD68). */
  sleepSession?: SleepSession | null
  /** User-pinned quick-log substances (the "hot bar" — VELO / caffeine /
   *  Concerta etc). Order matters. Falls back to QUICK_LOG_KEYS when absent
   *  so existing localStorage rows still render the default chips. */
  quickKeys?: string[]
  /** Local YYYY-MM-DD the user last completed (or skipped) the "Start my day"
   *  flow (BUILD71). When this isn't today, Peak opens with the morning gate
   *  before the tracker. A soft once-per-day gate — no backend, localStorage only. */
  lastPlannedDate?: string
}

/** Tier label, mirrors SKILL.md vitality score tiers. */
export type ScoreTier = 'Peak' | 'Solid' | 'Tired' | 'Low' | 'Drained'

/** A predicted "best window for hard work" on today's curve. */
export interface PeakWindow {
  /** Decimal hour start. */
  start: number
  /** Decimal hour end. */
  end: number
  /** Average score across the window. */
  avgScore: number
  /** Hour of the local maximum inside the window. */
  peakHour: number
}
