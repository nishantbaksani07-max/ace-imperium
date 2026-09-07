import type { TaskDifficulty } from './parser'
import type { EventTypeKey, RecoveryLevel } from './curve'

/** Repeat rule for a scheduled item ("Your Day" calendar). */
export type ScheduleRepeat = 'none' | 'daily' | 'weekdays'

export interface PeakEvent {
  id: string
  title: string
  type: EventTypeKey
  startHour: number
  endHour: number
  /** Per-task accent colour (dusk palette) — distinguishes blocks on the calendar/curve. */
  color?: string
  repeat?: ScheduleRepeat
}

export interface PeakTask {
  id: string
  title: string
  difficulty: TaskDifficulty
  durationHours: number
  done: boolean
  pinned: boolean
  pinnedStartHour?: number | null
  color?: string
  repeat?: ScheduleRepeat
}

export interface PeakTrackerInitial {
  date: string
  peakedness: number
  recoveryLevel: RecoveryLevel
  wakeTime: number
  sleepNeedHours: number
  events: PeakEvent[]
  tasks: PeakTask[]
}
