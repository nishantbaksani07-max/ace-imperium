/**
 * Client-side helpers for reading and writing the `workouts` table.
 *
 * The SplitLog UI calls `saveWorkoutState` on every set tap (debounced).
 * The HistoryModal calls `getExerciseHistory` to render the per-lift
 * progression graph.
 *
 * Both use the browser Supabase client — RLS is set up on the table
 * (BUILD02) so each query is automatically scoped to the current user.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { MuscleIconKey } from '@/components/MuscleIcon'
import { mergeBackfillExercises } from './backfill'

/**
 * Readiness level for an off / sick day. Mirrors OffDaySheet's `OffDayLevel`
 * (kept as a plain union here so the query layer doesn't import a client
 * component). null = a normal session. Persisted to `workouts.off_day` so the
 * eased session can be excluded from the progress graph on every later read.
 */
export type OffDayLevel = 'little' | 'rough' | 'deload'

/** One set inside a logged exercise. Matches SplitLog's local state shape. */
export interface SavedSet {
  weight: number | null
  reps: number | null
  done: boolean
  failed: boolean
  /** Epoch ms when this set was checked off in the logger. Lets Peak read the
   *  real time of day with no picker. Optional + nullable: old rows lack it. */
  loggedAt?: number | null
}

/** One exercise inside a logged workout. */
export interface SavedExercise {
  id: string         // EX dictionary key (e.g. "bench_bb")
  name: string       // human label at time of save (defensive against EX renames)
  targetSets: number // sets prescribed by the split that day
  targetReps: number
  sets: SavedSet[]
  /** True when the user added this lift mid-session (today only). Lets
   *  hydration reconstruct it inline instead of mistaking it for a swap. */
  added?: boolean
  /** Body part for a custom lift, persisted on the row so a just-for-log
   *  one-off (not in custom_exercises) still shows its glyph + label on reload. */
  muscle?: MuscleIconKey
}

/** One optional cardio bout logged at the end of a session. */
export interface CardioEntry {
  type: string               // CARDIO_TYPES id (e.g. "walk")
  label: string              // human label at time of save (defensive against renames)
  durationMin: number | null // total minutes
  zone2Min: number | null    // minutes in zone 2 (optional)
}

/** A row in the `workouts` table, deserialized. */
export interface SavedWorkout {
  date: string             // YYYY-MM-DD (local)
  day_name: string
  exercises: SavedExercise[]
  /** Optional — only the logger hydration path reads this; other consumers
   *  (e.g. the progress signals) never construct it. getWorkoutForDay always
   *  fills it (defaulting to []). */
  cardio?: CardioEntry[]
  submitted_at: string | null
  /** Readiness marker — set when the session was logged as an off / sick day.
   *  null = normal session. The graph skips off-day sessions so they never dent
   *  the baseline. Only the logger hydration path reads this. */
  off_day?: OffDayLevel | null
}

/**
 * One session's top-set entry for the history graph.
 * `vol` = sum(weight × reps) across all completed (non-failed) sets.
 * `workoutId` + `dayName` identify the source row so the modal can
 * edit / delete this specific entry.
 */
export interface ExerciseHistoryPoint {
  workoutId: string
  dayName: string
  date: string
  topWeight: number
  topReps: number
  vol: number
  setCount: number
  /** Prescribed reps for that session (the target the top set is judged against). */
  targetReps: number
  /** True when the BEST set fell short of target reps — a real down-day the
   *  graph marks amber. A short non-best set doesn't flip this (your top set
   *  still stands). */
  partial: boolean
  /** Per-set reps for the tally under the graph (logged sets only; a missed set
   *  reads as 0). `full` = hit target reps on a real, non-failed set. */
  setReps: { reps: number; full: boolean }[]
  /** Set when this session was logged as an off / sick day. The graph keeps it
   *  as a soft grey marker but skips it on the strength line and excludes it
   *  from best / progression math, so an off day never dents the baseline. */
  offDay: OffDayLevel | null
}

interface SaveArgs {
  userId: string
  date: string       // YYYY-MM-DD, MUST be local (see lib/dates.ts)
  dayName: string
  exercises: SavedExercise[]
  /** Optional end-of-session cardio. Omitted = leave the column untouched. */
  cardio?: CardioEntry[] | null
  /** Set when the user explicitly finishes the session. */
  submittedAt?: string | null
  /** Readiness level for an off / sick day. Omitted = leave the column
   *  untouched; null explicitly clears it (the "undo" on the off-day banner). */
  offDay?: OffDayLevel | null
}

/**
 * True when a saved set genuinely counts as logged: done, not failed, with a
 * real weight AND reps. This is the SAME test getExerciseHistory uses to count
 * a session, so "what shows in history" and "what we keep on disk" never drift.
 */
export function isLoggedSet(s: SavedSet): boolean {
  return !!s.done && !s.failed && (s.weight ?? 0) > 0 && (s.reps ?? 0) > 0
}

/**
 * True when a workout has at least one genuinely-logged set across all of its
 * exercises. An empty workout (every set un-logged / cleared) is NOT a real
 * session — keeping it would leave a "ghost" row that history, stats, and the
 * progressive-overload comparison all wrongly treat as a logged session.
 */
function hasAnyLoggedSet(exercises: SavedExercise[]): boolean {
  return exercises.some(ex => ex.sets.some(isLoggedSet))
}

/**
 * Whether this save should keep a row at all. We keep it if anything real is
 * being recorded: a logged set, a cardio bout, or an explicit "finish" mark.
 * Otherwise the row is empty and we delete it instead of upserting (see
 * saveWorkoutState) so an all-unlogged day never persists as a ghost session.
 */
function workoutHasContent(args: SaveArgs): boolean {
  if (hasAnyLoggedSet(args.exercises)) return true
  if (args.cardio && args.cardio.some(c => (c.durationMin ?? 0) > 0 || (c.zone2Min ?? 0) > 0)) return true
  if (args.submittedAt) return true
  return false
}

/**
 * Delete the (user, date, day_name) workout row if one exists. Used when a
 * save would otherwise persist an empty/ghost session. Scoped to the user via
 * the explicit user_id filter on top of RLS (CLAUDE.md rule 3). Idempotent —
 * a missing row is a no-op.
 */
async function deleteEmptyWorkout(supabase: SupabaseClient, args: SaveArgs): Promise<void> {
  const { error } = await supabase
    .from('workouts')
    .delete()
    .eq('user_id', args.userId)
    .eq('date', args.date)
    .eq('day_name', args.dayName)
    // NEVER auto-delete a FINISHED session. The empty-cleanup exists to drop
    // ghost rows where every set was un-logged, but a trailing contentless
    // autosave/unload write (which carries no submittedAt) must not be able to
    // erase a row the user already finished. Scoping to submitted_at IS NULL
    // makes a finished session immune to this path. (Explicit user delete uses
    // deleteWorkout, not this.)
    .is('submitted_at', null)
  if (error) throw new Error(`saveWorkoutState (empty cleanup) failed: ${error.message}`)
}

/**
 * Upsert today's workout. Keyed on (user_id, date, day_name) — the
 * unique constraint from BUILD10's migration.
 *
 * If the workout has no genuinely-logged set (and no cardio / finish mark),
 * the row is DELETED instead of written. This is the source-level fix for the
 * "ghost log" bug: unlogging every set must actually clear the saved session,
 * not leave a stale done set behind that history + overload then read as a
 * real today session. (See hasAnyLoggedSet / getExerciseHistory's setCount
 * filter — same logged-set test on both sides.)
 *
 * Throws on Postgres errors so the caller can show a "Save failed"
 * indicator. Don't swallow these — silently dropping saves is exactly
 * the failure mode that would waste weeks of training data.
 */
export async function saveWorkoutState(
  supabase: SupabaseClient,
  args: SaveArgs,
): Promise<void> {
  if (!workoutHasContent(args)) {
    await deleteEmptyWorkout(supabase, args)
    return
  }
  const { error } = await supabase
    .from('workouts')
    .upsert(buildWorkoutUpsertRow(args), { onConflict: 'user_id,date,day_name' })
  if (error) {
    throw new Error(`saveWorkoutState failed: ${error.message}`)
  }
}

/** Shape the upsert row once so the typed and keepalive paths stay in sync. */
function buildWorkoutUpsertRow(args: SaveArgs) {
  return {
    user_id: args.userId,
    date: args.date,
    day_name: args.dayName,
    exercises: args.exercises,
    ...(args.cardio !== undefined ? { cardio: args.cardio } : {}),
    ...(args.submittedAt !== undefined ? { submitted_at: args.submittedAt } : {}),
    ...(args.offDay !== undefined ? { off_day: args.offDay } : {}),
  }
}

/**
 * Keepalive variant of `saveWorkoutState`, for page-unload / unmount writes.
 *
 * supabase-js doesn't expose a per-call `keepalive`, so when the page is
 * being torn down (pagehide / visibilitychange:hidden / SPA unmount) we hit
 * PostgREST directly with `fetch({ keepalive: true })` — the browser keeps
 * that request alive through the unload, where an ordinary supabase write
 * would be cancelled and the trailing sets lost. Same unique key and
 * merge-duplicates semantics as `saveWorkoutState`, scoped to the user via
 * RLS on the access token.
 *
 * Mirrors saveWorkoutState's empty-row cleanup: if the unload save carries no
 * genuinely-logged set (and no cardio / finish mark), it DELETEs the row so an
 * all-unlogged day can't survive a backgrounding as a ghost session.
 */
export async function saveWorkoutKeepalive(
  cfg: { url: string; anonKey: string; accessToken: string },
  args: SaveArgs,
): Promise<void> {
  if (!workoutHasContent(args)) {
    const params = new URLSearchParams({
      user_id: `eq.${args.userId}`,
      date: `eq.${args.date}`,
      day_name: `eq.${args.dayName}`,
      // Mirror deleteEmptyWorkout: a finished session is immune to the
      // empty-cleanup, so an unload write can never erase it.
      submitted_at: 'is.null',
    })
    const del = await fetch(`${cfg.url}/rest/v1/workouts?${params.toString()}`, {
      method: 'DELETE',
      keepalive: true,
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.accessToken}`,
        Prefer: 'return=minimal',
      },
    })
    if (!del.ok) {
      throw new Error(`saveWorkoutKeepalive (empty cleanup) failed: ${del.status}`)
    }
    return
  }
  const res = await fetch(`${cfg.url}/rest/v1/workouts?on_conflict=user_id,date,day_name`, {
    method: 'POST',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.accessToken}`,
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(buildWorkoutUpsertRow(args)),
  })
  if (!res.ok) {
    throw new Error(`saveWorkoutKeepalive failed: ${res.status}`)
  }
}

/**
 * Pull the top-set history for one exercise, oldest → newest.
 *
 * Filters server-side via the JSONB `@>` containment operator so we
 * don't download every workout to the client. Only workouts where
 * the exercise was actually logged count — empty (no done/failed sets)
 * appearances are skipped. (Today's in-progress session is excluded at the
 * view layer — see HistoryModal — so it isn't filtered here.)
 *
 * `userId` is required and applied as an explicit `.eq('user_id', userId)`
 * filter on top of RLS. RLS already prevents cross-user reads, but the
 * belt-and-suspenders filter means a regressed/dropped policy can't silently
 * leak workouts (per CLAUDE.md rule 3).
 */
export async function getExerciseHistory(
  supabase: SupabaseClient,
  exerciseId: string,
  userId: string,
  limit = 20,
): Promise<ExerciseHistoryPoint[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select('id, date, day_name, exercises, off_day')
    .eq('user_id', userId)
    // postgrest-js .contains() with an array value builds a Postgres array
    // literal (`cs.{"[object Object]"}`), which Postgres can't parse as JSONB.
    // Pre-stringify so the string branch fires and we get `cs.[{"id":"…"}]`.
    .contains('exercises', JSON.stringify([{ id: exerciseId }]))
    .order('date', { ascending: false })
    .limit(limit)
  if (error) {
    throw new Error(`getExerciseHistory failed: ${error.message}`)
  }

  const points: ExerciseHistoryPoint[] = []
  for (const row of data ?? []) {
    const ex = ((row.exercises as SavedExercise[] | null) ?? []).find(e => e.id === exerciseId)
    if (!ex) continue
    let topWeight = 0
    let topReps = 0
    let vol = 0
    let setCount = 0
    for (const s of ex.sets) {
      if (!s.done || s.failed) continue
      const w = s.weight ?? 0
      const r = s.reps ?? 0
      if (w === 0 || r === 0) continue
      setCount += 1
      vol += w * r
      if (w > topWeight || (w === topWeight && r > topReps)) {
        topWeight = w
        topReps = r
      }
    }
    if (setCount === 0) continue
    // Quality signal: judge the BEST set against the session's prescribed reps.
    // A short non-best set never flips this (your top set still stands); only a
    // best set below target reads as a partial / down-day (amber on the graph).
    const target = ex.targetReps || topReps
    const partial = topReps > 0 && topReps < target
    // Per-set tally (logged sets, in order): a missed set reads 0; `full` means
    // a real, non-failed set that hit the target.
    const setReps = ex.sets
      .filter(s => s.done || s.failed)
      .map(s => ({
        reps: s.failed ? 0 : (s.reps ?? 0),
        full: !!s.done && !s.failed && (s.reps ?? 0) >= target,
      }))
    points.push({
      workoutId: row.id,
      dayName: row.day_name,
      date: row.date,
      topWeight,
      topReps,
      vol,
      setCount,
      targetReps: target,
      partial,
      setReps,
      offDay: (row.off_day as OffDayLevel | null) ?? null,
    })
  }
  // Return oldest → newest so the graph reads left-to-right.
  return points.reverse()
}

/**
 * Update one exercise's top set inside a specific workout row.
 * Used by the history modal's "edit" affordance.
 *
 * Reads the row's full exercises array, replaces the matching entry's
 * sets with a single corrected set, writes back. Doesn't touch the
 * workout's day_name / date — for moving an entry to a different
 * date, delete + re-add instead.
 */
export async function updateExerciseTopSet(
  supabase: SupabaseClient,
  args: { workoutId: string; userId: string; exerciseId: string; weight: number; reps: number; sets?: number },
): Promise<void> {
  const { data: row, error: readErr } = await supabase
    .from('workouts')
    .select('exercises')
    .eq('id', args.workoutId)
    .eq('user_id', args.userId)
    .maybeSingle()
  if (readErr) throw new Error(`updateExerciseTopSet read failed: ${readErr.message}`)
  if (!row) throw new Error('Workout row not found')

  const prior = (row.exercises as SavedExercise[] | null) ?? []
  const idx = prior.findIndex(e => e.id === args.exerciseId)
  if (idx < 0) throw new Error(`Exercise ${args.exerciseId} not in this workout`)

  // Write `sets` identical done sets (defaults to 1 to preserve old behavior).
  // The history graph reads the top weight×reps, so all sets carry the same
  // corrected weight/reps — editing sets just changes how many count.
  const setCount = Math.max(1, Math.min(10, Math.round(args.sets ?? 1)))
  const newSet = { weight: args.weight, reps: args.reps, done: true, failed: false }
  const newSets = Array.from({ length: setCount }, () => ({ ...newSet }))
  const next = prior.map((e, i) => i === idx
    ? { ...e, sets: newSets, targetSets: setCount, targetReps: args.reps }
    : e)

  const { error: writeErr } = await supabase
    .from('workouts')
    .update({ exercises: next })
    .eq('id', args.workoutId)
    .eq('user_id', args.userId)
  if (writeErr) throw new Error(`updateExerciseTopSet write failed: ${writeErr.message}`)
}

/**
 * Remove one exercise from a workout row. If the row has no other
 * exercises after removal, the whole row is deleted — leaving an
 * empty workout would pollute the daily list with phantom sessions.
 */
export async function deleteExerciseFromWorkout(
  supabase: SupabaseClient,
  args: { workoutId: string; userId: string; exerciseId: string },
): Promise<void> {
  const { data: row, error: readErr } = await supabase
    .from('workouts')
    .select('exercises')
    .eq('id', args.workoutId)
    .eq('user_id', args.userId)
    .maybeSingle()
  if (readErr) throw new Error(`deleteExerciseFromWorkout read failed: ${readErr.message}`)
  if (!row) return

  const prior = (row.exercises as SavedExercise[] | null) ?? []
  const next = prior.filter(e => e.id !== args.exerciseId)

  if (next.length === 0) {
    const { error: delErr } = await supabase
      .from('workouts')
      .delete()
      .eq('id', args.workoutId)
      .eq('user_id', args.userId)
    if (delErr) throw new Error(`deleteExerciseFromWorkout delete failed: ${delErr.message}`)
    return
  }

  const { error: writeErr } = await supabase
    .from('workouts')
    .update({ exercises: next })
    .eq('id', args.workoutId)
    .eq('user_id', args.userId)
  if (writeErr) throw new Error(`deleteExerciseFromWorkout update failed: ${writeErr.message}`)
}

/**
 * Day-name sentinel for backfilled history entries. The setup wizard
 * day names (Push heavy / Pull heavy / etc.) are reserved for real
 * sessions; using a distinct sentinel keeps backfilled rows from
 * colliding with the user's actual training rows on the unique
 * constraint (user_id, date, day_name).
 */
export const BACKFILL_DAY_NAME = '(history)'

interface BackfillArgs {
  userId: string
  date: string         // YYYY-MM-DD local
  exerciseId: string
  exerciseName: string
  weight: number
  reps: number
}

/**
 * Add or update a single backfilled session for one exercise. Multiple
 * exercises backfilled to the same date land in the same "(history)"
 * row (merged), so the user can pull in a full session by adding rows
 * one exercise at a time.
 *
 * The set is stored as `done: true, failed: false` so it counts toward
 * the history graph's top-set / volume math identically to a freshly
 * logged set.
 */
export async function saveBackfillSession(
  supabase: SupabaseClient,
  args: BackfillArgs,
): Promise<void> {
  const { data: existing, error: readErr } = await supabase
    .from('workouts')
    .select('exercises')
    .eq('user_id', args.userId)
    .eq('date', args.date)
    .eq('day_name', BACKFILL_DAY_NAME)
    .maybeSingle()
  if (readErr) {
    throw new Error(`saveBackfillSession read failed: ${readErr.message}`)
  }

  const prior = (existing?.exercises as SavedExercise[] | null) ?? []
  const existingIdx = prior.findIndex(e => e.id === args.exerciseId)
  const newSet = { weight: args.weight, reps: args.reps, done: true, failed: false }

  let nextExercises: SavedExercise[]
  if (existingIdx >= 0) {
    // Replace the prior entry — backfilling the same exercise/date
    // again is treated as a correction, not an addition.
    nextExercises = prior.map((e, i) => i === existingIdx
      ? { ...e, sets: [newSet], targetSets: 1, targetReps: args.reps }
      : e)
  } else {
    nextExercises = [
      ...prior,
      {
        id: args.exerciseId,
        name: args.exerciseName,
        targetSets: 1,
        targetReps: args.reps,
        sets: [newSet],
      },
    ]
  }

  const { error: writeErr } = await supabase
    .from('workouts')
    .upsert(
      {
        user_id: args.userId,
        date: args.date,
        day_name: BACKFILL_DAY_NAME,
        exercises: nextExercises,
      },
      { onConflict: 'user_id,date,day_name' },
    )
  if (writeErr) {
    throw new Error(`saveBackfillSession write failed: ${writeErr.message}`)
  }
}

/**
 * Backfill a WHOLE past session at once (the "Log a past workout" form) into the
 * same shared `(history)` sentinel row `saveBackfillSession` uses — merged by
 * exercise id, so backfilled data never collides with the user's real rotation
 * rows on the unique constraint, and `getRecentDayStatuses` correctly ignores it
 * (it skips `(history)`). Re-backfilling an exercise on the same date corrects it
 * rather than duplicating. No-ops on an empty list so an empty row is never
 * written. Unlike `saveBackfillSession`, this carries the full multi-set shape.
 */
export async function saveBackfillWorkout(
  supabase: SupabaseClient,
  args: { userId: string; date: string; exercises: SavedExercise[] },
): Promise<void> {
  if (args.exercises.length === 0) return

  const { data: existing, error: readErr } = await supabase
    .from('workouts')
    .select('exercises')
    .eq('user_id', args.userId)
    .eq('date', args.date)
    .eq('day_name', BACKFILL_DAY_NAME)
    .maybeSingle()
  if (readErr) {
    throw new Error(`saveBackfillWorkout read failed: ${readErr.message}`)
  }

  const prior = (existing?.exercises as SavedExercise[] | null) ?? []
  const nextExercises = mergeBackfillExercises(prior, args.exercises)

  const { error: writeErr } = await supabase
    .from('workouts')
    .upsert(
      {
        user_id: args.userId,
        date: args.date,
        day_name: BACKFILL_DAY_NAME,
        exercises: nextExercises,
      },
      { onConflict: 'user_id,date,day_name' },
    )
  if (writeErr) {
    throw new Error(`saveBackfillWorkout write failed: ${writeErr.message}`)
  }
}

/**
 * Fetch the saved workout for a specific user/date/day_name. Returns
 * null if none exists. Called server-side from the dynamic [day] page
 * to hydrate SplitLog with whatever the user already logged today.
 */
export async function getWorkoutForDay(
  supabase: SupabaseClient,
  args: { userId: string; date: string; dayName: string },
): Promise<SavedWorkout | null> {
  const { data, error } = await supabase
    .from('workouts')
    .select('date, day_name, exercises, cardio, submitted_at, off_day')
    .eq('user_id', args.userId)
    .eq('date', args.date)
    .eq('day_name', args.dayName)
    .maybeSingle()
  if (error) {
    throw new Error(`getWorkoutForDay failed: ${error.message}`)
  }
  if (!data) return null
  return {
    date: data.date,
    day_name: data.day_name,
    exercises: ((data.exercises as SavedExercise[] | null) ?? []),
    cardio: ((data.cardio as CardioEntry[] | null) ?? []),
    submitted_at: data.submitted_at,
    off_day: (data.off_day as OffDayLevel | null) ?? null,
  }
}

/**
 * The user's most recent FINISHED session of a given split day, strictly before
 * `beforeDate`. This is the baseline the finish-screen verdict (see
 * lib/workouts/sessionVerdict.ts) judges today against. Skips off / sick days
 * (not a fair bar) and, implicitly, backfilled history rows (their day_name is
 * BACKFILL_DAY_NAME, never a real split day). Returns null with nothing to
 * compare to — the first time through a day reads as "fresh".
 */
export async function getPreviousSessionForDay(
  supabase: SupabaseClient,
  args: { userId: string; dayName: string; beforeDate: string },
): Promise<SavedWorkout | null> {
  const { data, error } = await supabase
    .from('workouts')
    .select('date, day_name, exercises, submitted_at, off_day')
    .eq('user_id', args.userId)
    .eq('day_name', args.dayName)
    .lt('date', args.beforeDate)
    .not('submitted_at', 'is', null)
    .is('off_day', null)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`getPreviousSessionForDay failed: ${error.message}`)
  if (!data) return null
  return {
    date: data.date,
    day_name: data.day_name,
    exercises: (data.exercises as SavedExercise[] | null) ?? [],
    submitted_at: data.submitted_at,
    off_day: (data.off_day as OffDayLevel | null) ?? null,
  }
}

/**
 * Day-names that already have a logged DELOAD session on or after `sinceDate`.
 * A deload spans one pass through the split: each training day is eased once,
 * then "spent". This is how we know which days are still owed an easy session
 * (the workouts rows are the source of truth — no separate counter to drift).
 * Error-tolerant: returns [] if the query fails so the logger never breaks.
 */
export async function getDeloadedDayNamesSince(
  supabase: SupabaseClient,
  userId: string,
  sinceDate: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select('day_name')
    .eq('user_id', userId)
    .eq('off_day', 'deload')
    .gte('date', sinceDate)
  if (error || !data) return []
  return Array.from(new Set(data.map(r => r.day_name as string)))
}

/**
 * The status of one rotation day, derived from its most recent workout
 * row. Powers the schedule tiles: a `submitted_at`-set row → "completed"
 * tile (view / copy / delete), a past unsubmitted row → "not finished"
 * tile (one-tap finish-it). Keyed by `day_name` because the logger saves
 * every session under (user, date, day_name) and the schedule shows the
 * rotation by name, not by calendar date.
 */
export interface DayStatus {
  workoutId: string
  dayName: string
  date: string               // YYYY-MM-DD (local) of the matched row
  submittedAt: string | null
  setCount: number           // done, non-failed sets that carry weight×reps
  exercises: SavedExercise[] // kept for the "copy workout" summary
}

/**
 * Build a `day_name → DayStatus` map from the user's recent workouts so
 * each schedule tile knows whether its day is completed / unfinished.
 *
 * We only look back `sinceDate` (the page passes ~one rotation's worth of
 * days) so a Push finished months ago doesn't keep a tile marked
 * "completed" forever — the rotation position isn't tracked yet, so
 * recency is the honest proxy for "this cycle". Within the window we keep
 * the newest row per day_name (rows arrive date-descending).
 */
export async function getRecentDayStatuses(
  supabase: SupabaseClient,
  userId: string,
  sinceDate: string,
): Promise<Record<string, DayStatus>> {
  const { data, error } = await supabase
    .from('workouts')
    .select('id, date, day_name, exercises, submitted_at')
    .eq('user_id', userId)
    .gte('date', sinceDate)
    .order('date', { ascending: false })
  if (error) {
    throw new Error(`getRecentDayStatuses failed: ${error.message}`)
  }

  const byDay: Record<string, DayStatus> = {}
  for (const row of data ?? []) {
    // Skip backfilled history rows — they aren't a rotation day.
    if (row.day_name === BACKFILL_DAY_NAME) continue
    // First row seen for a day_name is the most recent (date-desc order).
    if (byDay[row.day_name]) continue

    const exercises = (row.exercises as SavedExercise[] | null) ?? []
    let setCount = 0
    for (const ex of exercises) {
      for (const s of ex.sets) {
        if (s.done && !s.failed && (s.weight ?? 0) > 0 && (s.reps ?? 0) > 0) setCount += 1
      }
    }

    byDay[row.day_name] = {
      workoutId: row.id,
      dayName: row.day_name,
      date: row.date,
      submittedAt: row.submitted_at,
      setCount,
      exercises,
    }
  }
  return byDay
}

/**
 * Delete an entire workout row — the "delete" action on a completed
 * tile. Wipes that session's logged data and its completed mark, so the
 * day reverts to its planned (un-done) state. Scoped to the user via the
 * explicit `user_id` filter on top of RLS (CLAUDE.md rule 3).
 */
export async function deleteWorkout(
  supabase: SupabaseClient,
  args: { workoutId: string; userId: string },
): Promise<void> {
  const { error } = await supabase
    .from('workouts')
    .delete()
    .eq('id', args.workoutId)
    .eq('user_id', args.userId)
  if (error) throw new Error(`deleteWorkout failed: ${error.message}`)
}
