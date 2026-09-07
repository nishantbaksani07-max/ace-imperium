import type { ScheduleRepeat } from '../peak-tracker/types'
import type { TaskDifficulty } from '../peak-tracker/parser'

/**
 * Shared model + helpers for the "Your Day" schedule (the unified Peak
 * dashboard's calendar + console). A DayItem is the client-side view of a
 * peak_tracker_tasks row: a timed block (start/end) or an unscheduled,
 * duration-only task. Pure helpers only — no React, safe to import anywhere.
 */

export const DAY_START = 6   // 6 AM
export const DAY_END = 23    // 11 PM
export const DAY_SPAN = DAY_END - DAY_START

/** Dusk palette — each task cycles a shade so overlapping blocks stay distinct. */
export const TASK_COLORS = ['#e8b04a', '#ef6a4f', '#5fd0a0', '#d8893c', '#e0846a', '#46b48c', '#e6c64e']
export const colorForIndex = (i: number): string => TASK_COLORS[((i % TASK_COLORS.length) + TASK_COLORS.length) % TASK_COLORS.length]

export interface DayItem {
  id: string
  kind: 'event' | 'task'
  name: string
  /** Decimal start hour (e.g. 13.5 = 1:30 PM) or null for unscheduled tasks. */
  start: number | null
  end: number | null
  /** Duration in hours for unscheduled tasks (drives the chip + auto end). */
  durHours: number | null
  color: string
  repeat: ScheduleRepeat
  difficulty: TaskDifficulty
  /** Transient flag for the entry flash. */
  isNew?: boolean
  /** Pin a block so curve drags + auto-placement leave it where the user put it.
   *  Client-side only for now — not persisted (no schema column yet). */
  locked?: boolean
}

export const clampDay = (h: number): number => Math.max(DAY_START, Math.min(DAY_END, h))

export function fmtClock(h: number): string {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  const ap = hh >= 12 ? 'PM' : 'AM'
  let h12 = hh % 12
  if (h12 === 0) h12 = 12
  return `${h12}:${String(mm).padStart(2, '0')} ${ap}`
}
export const fmtClockShort = (h: number): string => fmtClock(h).replace(':00', '')

export const hToInput = (h: number | null): string =>
  h == null ? '' : `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h - Math.floor(h)) * 60)).padStart(2, '0')}`
export const inputToH = (s: string): number | null => {
  if (!s) return null
  const p = s.split(':')
  return Math.max(0, Math.min(23.98, (+p[0]) + ((+p[1] || 0) / 60)))
}

export const REPEATS: Array<[ScheduleRepeat, string]> = [['none', 'Once'], ['daily', 'Daily'], ['weekdays', 'Weekdays']]

/**
 * Greedy interval-partition into columns so overlapping events sit side-by-side
 * (not stacked). Each returned item carries `_col` (its column) and `_cols`
 * (how many columns its overlap cluster spans). Ported from the design's
 * `egClusterCols`.
 */
export function clusterCols<T extends { start: number; end: number }>(events: T[]): Array<T & { _col: number; _cols: number }> {
  const sorted = [...events].sort((a, b) => a.start - b.start || a.end - b.end) as Array<T & { _col: number; _cols: number }>
  const colEnds: number[] = []
  sorted.forEach((ev) => {
    let c = 0
    while (c < colEnds.length && ev.start < colEnds[c] - 1e-6) c++
    ev._col = c
    colEnds[c] = ev.end
  })
  let i = 0
  while (i < sorted.length) {
    let clusterEnd = sorted[i].end
    let k = i + 1
    while (k < sorted.length && sorted[k].start < clusterEnd - 1e-6) { clusterEnd = Math.max(clusterEnd, sorted[k].end); k++ }
    const cols = Math.max(...sorted.slice(i, k).map((e) => e._col)) + 1
    for (let m = i; m < k; m++) sorted[m]._cols = cols
    i = k
  }
  return sorted
}

let _tmp = 0
/** Optimistic-UI temp id, swapped for the server id once the insert returns. */
export const tempId = (): string => `tmp_${Date.now()}_${_tmp++}`
