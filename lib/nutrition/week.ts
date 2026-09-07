// The weekly cadence key for the adaptive check-in: the local Monday of the week
// containing `date`, as YYYY-MM-DD. One check-in per user per week is enforced by
// the (user_id, week_start) unique key — no cron needed.

import { getLocalDateKey } from '@/lib/dates'

export function weekStartKey(date: Date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const mondayOffset = (d.getDay() + 6) % 7 // Sun=0 -> 6, Mon=1 -> 0, ...
  d.setDate(d.getDate() - mondayOffset)
  return getLocalDateKey(d)
}
