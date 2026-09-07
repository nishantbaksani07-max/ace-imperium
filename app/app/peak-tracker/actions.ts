'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getLocalDateKey } from '@/lib/dates'
import type { EventTypeKey, RecoveryLevel } from './curve'
import type { TaskDifficulty } from './parser'
import type { ScheduleRepeat } from './types'

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string }

// The unified "Your Day" schedule now lives on /app/peak; revalidate both
// routes so either entry point reflects a change.
function revalidateSchedule() {
  revalidatePath('/app/peak')
  revalidatePath('/app/peak-tracker')
}

/**
 * True when a write failed only because the BUILD24 `color` / `repeat` columns
 * aren't in the DB yet (migration not pushed). Lets writes degrade gracefully:
 * we retry without those fields so scheduling works now, and they start
 * persisting automatically once the migration is applied.
 */
function isMissingScheduleColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === 'PGRST204' || err.code === '42703') return true
  return /\b(color|repeat)\b/i.test(err.message ?? '')
}

async function userScope() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'unauthorized' as const }
  return { ok: true as const, supabase, userId: user.id }
}

function clampHour(h: number): number {
  if (!Number.isFinite(h)) return 12
  if (h < 0) return 0
  if (h >= 24) return 23.99
  return Math.round(h * 4) / 4
}

export async function addEvent(input: {
  title: string
  type: EventTypeKey
  startHour: number
  endHour: number
  date?: string
  color?: string
  repeat?: ScheduleRepeat
}): Promise<Result<{ id: string }>> {
  const scope = await userScope()
  if (!scope.ok) return { ok: false, error: scope.error }
  const { supabase, userId } = scope

  const title = input.title.trim()
  if (!title) return { ok: false, error: 'title required' }
  const date = input.date ?? getLocalDateKey()
  const startHour = clampHour(input.startHour)
  const endHour = clampHour(input.endHour)

  const base = {
    user_id: userId,
    date,
    kind: 'event',
    title,
    event_type: input.type,
    hour: startHour,
    end_hour: endHour,
  }
  const extras = {
    ...(input.color ? { color: input.color } : {}),
    ...(input.repeat ? { repeat: input.repeat } : {}),
  }

  let { data, error } = await supabase.from('peak_tracker_tasks').insert({ ...base, ...extras }).select('id').single()
  if (error && Object.keys(extras).length && isMissingScheduleColumn(error)) {
    ;({ data, error } = await supabase.from('peak_tracker_tasks').insert(base).select('id').single())
  }

  if (error || !data) return { ok: false, error: error?.message ?? 'insert failed' }
  revalidateSchedule()
  return { ok: true, data: { id: data.id } }
}

export async function addTask(input: {
  title: string
  difficulty: TaskDifficulty
  durationHours: number
  date?: string
  pinnedStartHour?: number | null
  color?: string
  repeat?: ScheduleRepeat
}): Promise<Result<{ id: string }>> {
  const scope = await userScope()
  if (!scope.ok) return { ok: false, error: scope.error }
  const { supabase, userId } = scope

  const title = input.title.trim()
  if (!title) return { ok: false, error: 'title required' }
  const date = input.date ?? getLocalDateKey()
  const pinned = input.pinnedStartHour != null
  const hour = pinned ? clampHour(input.pinnedStartHour as number) : null

  const base = {
    user_id: userId,
    date,
    kind: 'task',
    title,
    difficulty: input.difficulty,
    duration_hours: input.durationHours,
    hour,
    pinned,
  }
  const extras = {
    ...(input.color ? { color: input.color } : {}),
    ...(input.repeat ? { repeat: input.repeat } : {}),
  }

  let { data, error } = await supabase.from('peak_tracker_tasks').insert({ ...base, ...extras }).select('id').single()
  if (error && Object.keys(extras).length && isMissingScheduleColumn(error)) {
    ;({ data, error } = await supabase.from('peak_tracker_tasks').insert(base).select('id').single())
  }

  if (error || !data) return { ok: false, error: error?.message ?? 'insert failed' }
  revalidateSchedule()
  return { ok: true, data: { id: data.id } }
}

/**
 * Patch a scheduled item in place — drives the calendar's click-to-edit
 * popover (rename, re-time, set repeat). Only the provided fields are written.
 * `endHour` clears `duration_hours` so a now-timed task stops being treated as
 * duration-only.
 */
export async function updateTask(id: string, patch: {
  title?: string
  startHour?: number | null
  endHour?: number | null
  color?: string
  repeat?: ScheduleRepeat
  /** Flip a row between unscheduled task ↔ timed event (calendar edit). */
  kind?: 'task' | 'event'
  eventType?: EventTypeKey
}): Promise<Result> {
  const scope = await userScope()
  if (!scope.ok) return { ok: false, error: scope.error }

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.title !== undefined) {
    const t = patch.title.trim()
    if (!t) return { ok: false, error: 'title required' }
    row.title = t
  }
  if (patch.startHour !== undefined) {
    row.hour = patch.startHour == null ? null : clampHour(patch.startHour)
  }
  if (patch.endHour !== undefined) {
    row.end_hour = patch.endHour == null ? null : clampHour(patch.endHour)
    row.duration_hours = null
  }
  if (patch.kind !== undefined) {
    row.kind = patch.kind
    if (patch.kind === 'event') row.event_type = patch.eventType ?? 'default'
  }
  if (patch.color !== undefined) row.color = patch.color
  if (patch.repeat !== undefined) row.repeat = patch.repeat

  let { error } = await scope.supabase.from('peak_tracker_tasks').update(row).eq('id', id)
  if (error && ('color' in row || 'repeat' in row) && isMissingScheduleColumn(error)) {
    const { color: _c, repeat: _r, ...rest } = row
    ;({ error } = await scope.supabase.from('peak_tracker_tasks').update(rest).eq('id', id))
  }

  if (error) return { ok: false, error: error.message }
  revalidateSchedule()
  return { ok: true }
}

export async function toggleTaskDone(id: string, done: boolean): Promise<Result> {
  const scope = await userScope()
  if (!scope.ok) return { ok: false, error: scope.error }

  const { error } = await scope.supabase
    .from('peak_tracker_tasks')
    .update({ done, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidateSchedule()
  return { ok: true }
}

export async function deleteTask(id: string): Promise<Result> {
  const scope = await userScope()
  if (!scope.ok) return { ok: false, error: scope.error }
  const { error } = await scope.supabase.from('peak_tracker_tasks').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidateSchedule()
  return { ok: true }
}

export async function deleteEvent(id: string): Promise<Result> {
  return deleteTask(id)
}

export async function setRecoveryLevel(level: RecoveryLevel): Promise<Result> {
  const scope = await userScope()
  if (!scope.ok) return { ok: false, error: scope.error }

  const { error } = await scope.supabase
    .from('peak_tracker_prefs')
    .upsert({ user_id: scope.userId, recovery_level: level, updated_at: new Date().toISOString() })

  if (error) return { ok: false, error: error.message }
  revalidateSchedule()
  return { ok: true }
}

export async function setPeakedness(value: number): Promise<Result> {
  const scope = await userScope()
  if (!scope.ok) return { ok: false, error: scope.error }

  const clamped = Math.max(0, Math.min(1, value))
  const { error } = await scope.supabase
    .from('peak_tracker_prefs')
    .upsert({ user_id: scope.userId, peakedness: clamped, updated_at: new Date().toISOString() })

  if (error) return { ok: false, error: error.message }
  revalidateSchedule()
  return { ok: true }
}

export async function setWakeTime(hour: number): Promise<Result> {
  const scope = await userScope()
  if (!scope.ok) return { ok: false, error: scope.error }

  const clamped = clampHour(hour)
  const { error } = await scope.supabase
    .from('peak_tracker_prefs')
    .upsert({ user_id: scope.userId, wake_time: clamped, updated_at: new Date().toISOString() })

  if (error) return { ok: false, error: error.message }
  revalidateSchedule()
  return { ok: true }
}

export async function setSleepNeed(hours: number): Promise<Result> {
  const scope = await userScope()
  if (!scope.ok) return { ok: false, error: scope.error }

  const clamped = Math.max(4, Math.min(14, hours))
  const { error } = await scope.supabase
    .from('peak_tracker_prefs')
    .upsert({ user_id: scope.userId, sleep_need_hours: clamped, updated_at: new Date().toISOString() })

  if (error) return { ok: false, error: error.message }
  revalidateSchedule()
  return { ok: true }
}
