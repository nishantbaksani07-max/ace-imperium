/**
 * Vee Goals repo — pure row<->domain mappers + thin RLS-scoped read helpers.
 * Mappers are IO-free (unit-tested in __tests__/veeGoalsRepo.test.ts); the
 * Supabase writes live in app/app/goals/goalActions.ts. Mirrors the style of
 * lib/vitals/goalsRepo.ts (numerics arrive from PostgREST as strings).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  BigGoal, BigGoalStatus, Prio, Push,
  HabitGoal, HabitKind, HabitStatus, HabitDifficulty, HabitSource, HabitTracking,
  GoalStreak,
} from '@/app/app/goals/veeTypes'
import { EMPTY_STREAK } from '@/app/app/goals/veeTypes'
import { clampCategory } from '@/lib/goals/categories'

const num = (v: string | number | null | undefined): number | null =>
  v == null ? null : typeof v === 'number' ? v : Number.isFinite(Number(v)) ? Number(v) : null

const clampPrio = (v: unknown): Prio => {
  const n = num(v as number)
  return n === 1 || n === 3 ? n : 2
}
const asPush = (v: unknown): Push =>
  v === 'silent' || v === 'gentle' || v === 'push' ? v : 'balanced'

// ── big goals ──────────────────────────────────────────────────────────────
export interface BigGoalRow {
  id: string
  user_id: string
  title: string
  clean_title: string | null
  category: string | null
  target_date: string | null
  priority: string | number
  push_level: string
  progress_current: string | number | null
  progress_target: string | number | null
  progress_unit: string | null
  identity_tag: string | null
  /** Optional so envs that have not applied 20260710130000 keep mapping. */
  binding_override?: string | null
  status: string
  created_at: string
  updated_at: string
  achieved_at: string | null
}

export function rowToBigGoal(row: BigGoalRow): BigGoal {
  return {
    id: row.id,
    title: row.title,
    cleanTitle: row.clean_title,
    category: row.category ? clampCategory(row.category) : null,
    targetDate: row.target_date,
    priority: clampPrio(row.priority),
    push: asPush(row.push_level),
    progressCurrent: num(row.progress_current),
    progressTarget: num(row.progress_target),
    progressUnit: row.progress_unit,
    identityTag: row.identity_tag,
    bindingOverride: row.binding_override ?? null,
    status: (['active', 'achieved', 'paused', 'abandoned'].includes(row.status) ? row.status : 'active') as BigGoalStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    achievedAt: row.achieved_at,
  }
}

/** Insert/update payload (omits server-managed id/timestamps). */
export function bigGoalToRow(g: Partial<BigGoal>, userId: string) {
  return {
    user_id: userId,
    title: g.title,
    clean_title: g.cleanTitle ?? null,
    category: g.category ?? null,
    target_date: g.targetDate ?? null,
    priority: g.priority ?? 2,
    push_level: g.push ?? 'balanced',
    progress_current: g.progressCurrent ?? null,
    progress_target: g.progressTarget ?? null,
    progress_unit: g.progressUnit ?? null,
    identity_tag: g.identityTag ?? null,
    status: g.status ?? 'active',
  }
}

// ── habit goals ──────────────────────────────────────────────────────────────
export interface HabitGoalRow {
  id: string
  user_id: string
  parent_goal_id: string | null
  title: string
  kind: string
  due_date: string | null
  difficulty: string | null
  estimated_minutes: number | null
  suggested_start_hour: string | number | null
  when_cue: string | null
  source: string | null
  tracking: unknown
  status: string
  is_tomorrow: boolean
  push_count: number | null
  last_pushed_at: string | null
  created_at: string
  completed_at: string | null
}

export function rowToHabitGoal(row: HabitGoalRow): HabitGoal {
  return {
    id: row.id,
    parentGoalId: row.parent_goal_id,
    title: row.title,
    kind: (['habit', 'task', 'milestone'].includes(row.kind) ? row.kind : 'task') as HabitKind,
    dueDate: row.due_date,
    difficulty: (['red', 'yellow', 'green'].includes(row.difficulty ?? '') ? row.difficulty : null) as HabitDifficulty,
    estimatedMinutes: row.estimated_minutes ?? null,
    suggestedStartHour: num(row.suggested_start_hour),
    whenCue: row.when_cue,
    source: (row.source ?? null) as HabitSource,
    tracking: (row.tracking ?? null) as HabitTracking | null,
    status: (['open', 'completed', 'archived'].includes(row.status) ? row.status : 'open') as HabitStatus,
    isTomorrow: !!row.is_tomorrow,
    pushCount: row.push_count ?? 0,
    lastPushedAt: row.last_pushed_at,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  }
}

export function habitGoalToRow(h: Partial<HabitGoal>, userId: string) {
  return {
    user_id: userId,
    parent_goal_id: h.parentGoalId ?? null,
    title: h.title,
    kind: h.kind ?? 'task',
    due_date: h.dueDate ?? null,
    difficulty: h.difficulty ?? null,
    estimated_minutes: h.estimatedMinutes ?? null,
    suggested_start_hour: h.suggestedStartHour ?? null,
    when_cue: h.whenCue ?? null,
    source: h.source ?? null,
    tracking: (h.tracking ?? null) as Record<string, unknown> | null,
    status: h.status ?? 'open',
    is_tomorrow: h.isTomorrow ?? false,
  }
}

// ── streak ──────────────────────────────────────────────────────────────────
export interface StreakRow {
  user_id: string
  current: number | null
  longest: number | null
  last_extended_date: string | null
  freezes: number | null
  freezes_used: number | null
}

export function rowToStreak(row: StreakRow | null): GoalStreak {
  if (!row) return { ...EMPTY_STREAK }
  return {
    current: row.current ?? 0,
    longest: row.longest ?? 0,
    lastExtendedDate: row.last_extended_date,
    freezes: row.freezes ?? 0,
    freezesUsed: row.freezes_used ?? 0,
  }
}

export function streakToRow(s: GoalStreak, userId: string) {
  return {
    user_id: userId,
    current: s.current,
    longest: s.longest,
    last_extended_date: s.lastExtendedDate,
    freezes: s.freezes,
    freezes_used: s.freezesUsed,
  }
}

// ── RLS-scoped reads (thin; the client enforces auth.uid() = user_id) ─────────
// Each read THROWS on a PostgREST error instead of returning []. supabase-js
// resolves errors as { data: null, error }, so swallowing .error makes a failed
// table read (RLS misfire, mid-migration, outage) impersonate "no rows" - the
// user is told they have no goals. Throwing lets loadNoticed's allSettled batch
// mark the load degraded, and the page-level try/catch callers (app/app/goals,
// gatherGreenLight) keep their calm blank-slate fallback.
export async function getBigGoals(supabase: SupabaseClient, userId: string): Promise<BigGoal[]> {
  const { data, error } = await supabase
    .from('vitality_goals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`vitality_goals read failed: ${error.message}`)
  return (data ?? []).map(r => rowToBigGoal(r as BigGoalRow))
}

export async function getHabitGoals(supabase: SupabaseClient, userId: string): Promise<HabitGoal[]> {
  const { data, error } = await supabase
    .from('vitality_habit_goals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`vitality_habit_goals read failed: ${error.message}`)
  return (data ?? []).map(r => rowToHabitGoal(r as HabitGoalRow))
}

export async function getStreak(supabase: SupabaseClient, userId: string): Promise<GoalStreak> {
  const { data, error } = await supabase
    .from('goals_streak')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`goals_streak read failed: ${error.message}`)
  return rowToStreak((data as StreakRow) ?? null)
}
