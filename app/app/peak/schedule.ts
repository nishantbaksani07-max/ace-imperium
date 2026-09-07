/**
 * Schedule helpers — pure functions.
 *
 * Splits cleanly into two concerns:
 *   1. Filtering the events list to today (recurring + one-off + skip rules).
 *   2. Finding the best free peak slot for the day's "hardest task" by
 *      sliding a window of `durationHours` across the curve, scoring each
 *      candidate by avg peak score, and rejecting any window that collides
 *      with a busy event.
 */

import type { ScheduledEvent, EventType } from './types'

export function getLocalDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function dayOfWeek(d: Date = new Date()): number {
  return d.getDay()
}

/** Day-of-week labels matching getDay() indices. */
export const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DOW_LABELS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/**
 * Today's effective event list. Recurring entries appear when today's
 * day-of-week is in `recurringDays` AND today's date isn't in `skippedDates`.
 * One-off entries appear when `date === today`. Result sorted by start time.
 */
export function eventsForToday(events: ScheduledEvent[]): ScheduledEvent[] {
  const today = new Date()
  const todayKey = getLocalDateKey(today)
  const dow = dayOfWeek(today)
  return events
    .filter(e => {
      if (e.date && e.date === todayKey) return true
      if (e.recurringDays && e.recurringDays.includes(dow) && !e.skippedDates.includes(todayKey)) return true
      return false
    })
    .sort((a, b) => a.startHour - b.startHour)
}

/**
 * Does [aStart, aEnd) overlap [bStart, bEnd)? End-exclusive — back-to-back
 * events don't count as a collision.
 */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

/**
 * Avg score across a half-open hour range, interpolating linearly between
 * the integer-hour curve points so a 6:30–8:00 PM window averages over the
 * fractional buckets too.
 */
function avgScoreOver(curve: number[], start: number, end: number): number {
  const step = 0.25
  let sum = 0
  let n = 0
  for (let h = start; h < end; h += step) {
    const i = Math.floor(h)
    const f = h - i
    const v0 = curve[i] ?? 0
    const v1 = curve[Math.min(curve.length - 1, i + 1)] ?? v0
    sum += v0 + (v1 - v0) * f
    n += 1
  }
  return n > 0 ? sum / n : 0
}

export interface BestSlot {
  start: number
  end: number
  avgScore: number
}

/**
 * Slot finder by mode — wraps the same sweep as findBestSlot but lets the
 * caller pick the picker (highest / moderate / lowest avg score).
 */
export function findSlotByMode(
  curve: number[],
  busy: ScheduledEvent[],
  durationHours: number,
  mode: 'highest' | 'moderate' | 'lowest',
  fromHour = new Date().getHours() + new Date().getMinutes() / 60,
  maxEndHour = 22.5,
): BestSlot | null {
  const STEP = 0.25
  const candidates: BestSlot[] = []
  for (let start = Math.max(fromHour, 6); start + durationHours <= maxEndHour; start += STEP) {
    const end = start + durationHours
    const collides = busy.some(b => overlaps(start, end, b.startHour, b.endHour))
    if (collides) continue
    const score = avgScoreOver(curve, start, end)
    candidates.push({ start, end, avgScore: score })
  }
  if (!candidates.length) return null
  if (mode === 'highest') return candidates.reduce((a, b) => (b.avgScore > a.avgScore ? b : a))
  if (mode === 'lowest') {
    const eligible = candidates.filter(c => c.avgScore >= 25)
    const pool = eligible.length > 0 ? eligible : candidates
    return pool.reduce((a, b) => (b.avgScore < a.avgScore ? b : a))
  }
  return candidates.reduce((a, b) =>
    Math.abs(b.avgScore - 60) < Math.abs(a.avgScore - 60) ? b : a,
  )
}

/**
 * Find the highest-avg-score slot of width `durationHours` between
 * [fromHour, 22] that doesn't collide with any of `busy`. Returns null when
 * the day is too packed to fit the requested duration.
 */
export function findBestSlot(
  curve: number[],
  busy: ScheduledEvent[],
  durationHours: number,
  fromHour = new Date().getHours() + new Date().getMinutes() / 60,
  maxEndHour = 22.5,
): BestSlot | null {
  const STEP = 0.25
  let best: BestSlot | null = null

  for (let start = Math.max(fromHour, 6); start + durationHours <= maxEndHour; start += STEP) {
    const end = start + durationHours
    const collides = busy.some(b => overlaps(start, end, b.startHour, b.endHour))
    if (collides) continue
    const score = avgScoreOver(curve, start, end)
    if (!best || score > best.avgScore) {
      best = { start, end, avgScore: score }
    }
  }
  return best
}

/**
 * Free windows between `lo` and `hi`, with `busy` intervals subtracted.
 * Used to expand a "big/small gap X" command into one fill per open stretch.
 * Windows shorter than 15 min are dropped. Ported from Schedule Lab's freeGaps.
 */
export function freeWindows(
  busy: Array<{ start: number; end: number }>,
  lo: number,
  hi: number,
): Array<[number, number]> {
  const sorted = busy
    .filter(b => b.end > lo && b.start < hi)
    .sort((a, b) => a.start - b.start)
  const out: Array<[number, number]> = []
  let t = lo
  for (const b of sorted) {
    if (b.start > t) out.push([t, Math.min(b.start, hi)])
    t = Math.max(t, b.end)
  }
  if (t < hi) out.push([t, hi])
  return out.filter(([s, e]) => e - s >= 0.25)
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  school:   'School',
  work:     'Work',
  workout:  'Workout',
  practice: 'Practice',
  meeting:  'Meeting',
  social:   'Social',
  personal: 'Personal',
  other:    'Other',
}

/**
 * Visual tone for each event type. Mint variants for "this is the work that
 * matters", amber for outflow-y obligations (school, meeting), muted for
 * personal / other.
 */
export const EVENT_TYPE_TONE: Record<EventType, 'mint' | 'amber' | 'muted' | 'red'> = {
  school:   'amber',
  work:     'mint',
  workout:  'mint',
  practice: 'mint',
  meeting:  'amber',
  social:   'muted',
  personal: 'muted',
  other:    'muted',
}

export const EVENT_TYPE_ICONS: Record<EventType, string> = {
  school:   '✎',
  work:     '◆',
  workout:  '✦',
  practice: '◇',
  meeting:  '◉',
  social:   '◐',
  personal: '○',
  other:    '·',
}

export function fmtHour12(h: number): string {
  const hour = Math.floor(h) % 24
  const min = Math.round((h - Math.floor(h)) * 60)
  const period = hour >= 12 ? 'PM' : 'AM'
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return min === 0
    ? `${display} ${period}`
    : `${display}:${String(min).padStart(2, '0')} ${period}`
}
