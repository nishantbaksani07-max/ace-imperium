import type { SupabaseClient } from '@supabase/supabase-js'
import type { PeakEvent, PeakTask, ScheduleRepeat } from './types'
import type { EventTypeKey, RecoveryLevel } from './curve'
import type { TaskDifficulty } from './parser'
import type { PeakTrackerInitial } from './types'

/**
 * Shared loader for a day's Peak schedule (events + tasks) and the user's
 * curve prefs. Used by both the unified Peak dashboard (/app/peak) and the
 * legacy /app/peak-tracker entry. Reads the `peak_tracker_tasks` rows for the
 * date and maps them into the `PeakEvent` / `PeakTask` shapes, carrying the
 * per-task `color` + `repeat` added in BUILD24.
 */
export async function loadPeakSchedule(
  supabase: SupabaseClient,
  userId: string,
  date: string,
): Promise<PeakTrackerInitial> {
  const TASK_COLS = 'id, kind, title, hour, end_hour, event_type, difficulty, duration_hours, done, pinned'
  const prefsP = supabase
    .from('peak_tracker_prefs')
    .select('peakedness, recovery_level, wake_time, sleep_need_hours')
    .eq('user_id', userId)
    .maybeSingle()

  // Try with the BUILD24 color/repeat columns; if they aren't in the DB yet
  // (migration not pushed) the select errors, so fall back to the base columns
  // — schedules still load, just without per-task colour/repeat.
  const full = await supabase
    .from('peak_tracker_tasks')
    .select(`${TASK_COLS}, color, repeat`)
    .eq('user_id', userId)
    .eq('date', date)
  let rows: Array<Record<string, unknown>> = (full.data as Array<Record<string, unknown>> | null) ?? []
  if (full.error) {
    const baseRes = await supabase
      .from('peak_tracker_tasks')
      .select(TASK_COLS)
      .eq('user_id', userId)
      .eq('date', date)
    rows = (baseRes.data as Array<Record<string, unknown>> | null) ?? []
  }
  const prefsRes = await prefsP

  const events: PeakEvent[] = []
  const tasks: PeakTask[] = []
  for (const row of rows) {
    const color = (row.color as string | null) ?? undefined
    const repeat = ((row.repeat as ScheduleRepeat | null) ?? 'none') as ScheduleRepeat
    if (row.kind === 'event' && row.hour != null && row.end_hour != null) {
      events.push({
        id: row.id as string,
        title: row.title as string,
        type: (row.event_type as EventTypeKey | null) ?? 'default',
        startHour: Number(row.hour),
        endHour: Number(row.end_hour),
        color,
        repeat,
      })
    } else if (row.kind === 'task') {
      tasks.push({
        id: row.id as string,
        title: row.title as string,
        difficulty: (row.difficulty as TaskDifficulty | null) ?? 'normal',
        durationHours: row.duration_hours != null ? Number(row.duration_hours) : 1,
        done: Boolean(row.done),
        pinned: Boolean(row.pinned),
        pinnedStartHour: row.pinned && row.hour != null ? Number(row.hour) : null,
        color,
        repeat,
      })
    }
  }

  const peakedness = prefsRes.data?.peakedness != null ? Number(prefsRes.data.peakedness) : 0.6
  const recoveryLevel = (prefsRes.data?.recovery_level as RecoveryLevel | null) ?? 'high'
  const wakeTime = prefsRes.data?.wake_time != null ? Number(prefsRes.data.wake_time) : 6.5
  const sleepNeedHours = prefsRes.data?.sleep_need_hours != null ? Number(prefsRes.data.sleep_need_hours) : 8

  return { date, peakedness, recoveryLevel, wakeTime, sleepNeedHours, events, tasks }
}
