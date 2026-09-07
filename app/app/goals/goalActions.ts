'use server'

/**
 * Vee Goals — server actions (Phase 1 CRUD).
 *
 * Every write is RLS-scoped by user_id (auth.uid() = user_id on the tables) and
 * never throws to the client: each returns a small {ok,...} union so the UI can
 * stay calm if something fails. The pure row<->domain mappers live in
 * lib/goals/repo.ts; this file only does the IO.
 *
 * The authoritative tables ship in migration 20260618000001. Until that
 * migration is applied to a given environment, Postgres answers writes with
 * 42P01 ("relation does not exist") — we detect that and bubble a clear
 * `goals_tables_missing` so it's obvious what to fix (apply the migration),
 * not a mystery "could not save".
 */

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { upsertFactByRef, deleteFactsByRef } from '@/lib/memory/userFacts'
import { categorizeGoal } from '@/lib/goals/categorize'
import { isGibberish } from '@/lib/goals/gibberish'
import { unitToBackfill } from '@/lib/goals/goalUnit'
import { goalMemoryAction } from '@/lib/goals/goalMemory'
import {
  bigGoalToRow, rowToBigGoal, type BigGoalRow,
  habitGoalToRow, rowToHabitGoal, type HabitGoalRow,
} from '@/lib/goals/repo'
import type { BigGoal, BigGoalStatus, HabitGoal, HabitKind, HabitSource, HabitTracking, Prio, Push } from './veeTypes'

type Ok<T> = { ok: true } & T
type Err = { ok: false; error: string }

const GOALS_SOURCE = 'goals'

/**
 * Keep Vee's shared memory in lockstep with a goal's current state. The policy
 * (write working-toward / celebrate / retract) lives in lib/goals/goalMemory;
 * here we just apply it — one fact per goal, keyed by ref_id = goal.id. Never
 * throws: a memory hiccup must not fail the write the user actually made.
 */
async function syncGoalFact(supabase: SupabaseClient, userId: string, goal: BigGoal): Promise<void> {
  const action = goalMemoryAction(goal)
  if (action.op === 'delete') {
    await deleteFactsByRef(supabase, userId, GOALS_SOURCE, goal.id)
    return
  }
  await upsertFactByRef(supabase, userId, {
    source: GOALS_SOURCE,
    kind: 'goal',
    refId: goal.id,
    body: action.body,
    salience: action.salience,
  })
}

/**
 * Map a Supabase write error to a stable, client-friendly code. We never leak
 * raw Postgres text to the client (log it server-side instead) — except the one
 * "table missing" case, surfaced so a not-yet-migrated env is obvious to fix.
 */
function writeError(error: { code?: string; message?: string } | null): string {
  const code = error?.code
  const msg = error?.message ?? 'write_failed'
  if (code === '42P01' || /does not exist/i.test(msg)) return 'goals_tables_missing'
  if (process.env.NODE_ENV !== 'production') console.error('[goalActions] write failed:', code, msg)
  return 'write_failed'
}

/** UTC date key one day back — gives a full day of timezone slack so a valid
 *  near-future deadline is never rejected by the server safety net. */
function pastCutoffKey(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
}

// ── big personal goals ───────────────────────────────────────────────────────

export interface CreateBigGoalInput {
  title: string
  targetDate: string | null
  priority: Prio
  push: Push
  progressCurrent?: number | null
  progressTarget?: number | null
  progressUnit?: string | null
  identityTag?: string | null
}

export async function createBigGoal(input: CreateBigGoalInput): Promise<Ok<{ goal: BigGoal }> | Err> {
  const title = input.title.trim()
  if (!title) return { ok: false, error: 'empty_title' }
  if (title.length > 200) return { ok: false, error: 'too_long' }
  // The gibberish guard (TRAIN 4): keyboard mash never saves. Server-side so
  // the gate holds no matter which composer (or client) sent it.
  if (isGibberish(title)) return { ok: false, error: 'gibberish' }
  // Server safety net: the picker enforces a min date, but reject a clearly
  // past deadline if it somehow arrives (tampering / stale client).
  if (input.targetDate && input.targetDate < pastCutoffKey()) return { ok: false, error: 'bad_date' }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  const row = bigGoalToRow(
    {
      title,
      targetDate: input.targetDate,
      priority: input.priority,
      push: input.push,
      progressCurrent: input.progressCurrent ?? null,
      progressTarget: input.progressTarget ?? null,
      progressUnit: input.progressUnit ?? null,
      identityTag: input.identityTag ?? null,
      status: 'active',
    },
    user.id,
  )

  const { data, error } = await supabase
    .from('vitality_goals')
    .insert(row)
    .select('*')
    .single()

  if (error || !data) return { ok: false, error: writeError(error) }

  const goal = rowToBigGoal(data as BigGoalRow)
  // Feed Vee's shared memory so the goal surfaces in chat (the chat route
  // injects every user_facts source). 'silent' goals stay private (no fact).
  await syncGoalFact(supabase, user.id, goal)

  revalidatePath('/app/goals')
  return { ok: true, goal }
}

export async function updateBigGoalProgress(id: string, current: number): Promise<Ok<{ goal: BigGoal }> | Err> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  const { data, error } = await supabase
    .from('vitality_goals')
    .update({ progress_current: Math.max(0, Math.round(current)), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error || !data) return { ok: false, error: writeError(error) }

  const goal = rowToBigGoal(data as BigGoalRow)
  // Progress moved — refresh the memory so Vee knows where they are now.
  await syncGoalFact(supabase, user.id, goal)

  revalidatePath('/app/goals')
  return { ok: true, goal }
}

/** Change how much Vee shows up about a goal, and sync its memory to match —
 *  'silent' retracts it, anything else (re)writes it. Makes the card's
 *  "change how much I show up anytime" promise real. */
export async function updateBigGoalPush(id: string, push: Push): Promise<Ok<{ goal: BigGoal }> | Err> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  const { data, error } = await supabase
    .from('vitality_goals')
    .update({ push_level: push, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error || !data) return { ok: false, error: writeError(error) }

  const goal = rowToBigGoal(data as BigGoalRow)
  await syncGoalFact(supabase, user.id, goal)

  revalidatePath('/app/goals')
  return { ok: true, goal }
}

/** The whitelist for a binding override: a guide module name, one of the
 *  user's own tile streams as 'stream:<canonical_key>', or a CORE graph from
 *  the Graph Library as 'core:<graph_id>' (the loadCoreGraphs catalog: every
 *  lift, macro, vital, and body line - Alex, 2026-07-12). Kept here (not
 *  imported from goalGuide) so the server gate stays dependency-light. */
const BINDING_MODULES = new Set([
  'train', 'macros', 'weight', 'water', 'recovery', 'supplements', 'brand', 'finance', 'notes',
])
const STREAM_BINDING_RE = /^stream:[a-z0-9_.:-]{1,80}$/i
const CORE_BINDING_RE = /^core:[a-z0-9_.:-]{1,80}$/i

/**
 * "What steers this": persist the user's own choice of steering metric on a
 * goal, or clear it (null = let Vee decide). buildTicker honors the override
 * first, so the picked metric wins over auto-binding on the next load.
 */
export async function setGoalBinding(id: string, binding: string | null): Promise<Ok<{ goal: BigGoal }> | Err> {
  if (binding !== null && !BINDING_MODULES.has(binding) && !STREAM_BINDING_RE.test(binding) && !CORE_BINDING_RE.test(binding)) {
    return { ok: false, error: 'bad_binding' }
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  const { data, error } = await supabase
    .from('vitality_goals')
    .update({ binding_override: binding, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error || !data) return { ok: false, error: writeError(error) }

  revalidatePath('/app/goals')
  revalidatePath('/app/mentor')
  return { ok: true, goal: rowToBigGoal(data as BigGoalRow) }
}

export async function setBigGoalStatus(id: string, status: BigGoalStatus): Promise<Ok<{ goal: BigGoal }> | Err> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  if (status === 'achieved') patch.achieved_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('vitality_goals')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error || !data) return { ok: false, error: writeError(error) }

  const goal = rowToBigGoal(data as BigGoalRow)

  // Keep Vee's memory current: achieved -> a celebration fact, paused/abandoned
  // -> retract it, reactivated -> the working-toward fact (goalMemory decides).
  // Respects 'silent' throughout.
  await syncGoalFact(supabase, user.id, goal)

  revalidatePath('/app/goals')
  return { ok: true, goal }
}

export async function deleteBigGoal(id: string): Promise<Ok<unknown> | Err> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  const { error } = await supabase
    .from('vitality_goals')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { ok: false, error: writeError(error) }

  // The goal is gone — remove anything Vee remembered about it, so it never
  // brings up a goal the user deleted.
  await deleteFactsByRef(supabase, user.id, GOALS_SOURCE, id)

  revalidatePath('/app/goals')
  return { ok: true }
}

/**
 * Triage a goal: AI-tag it into one of the nine buckets + a clean title, then
 * persist both. Called async after create + as a backfill for goals missing a
 * category — the goal is already saved with its raw title, so this is purely
 * additive and never blocks. categorizeGoal itself never throws (keyword + raw
 * fallback), so the worst case is the goal keeps its original title.
 */
export async function categorizeAndCleanGoal(goalId: string): Promise<Ok<{ goal: BigGoal }> | Err> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  const { data: row } = await supabase
    .from('vitality_goals')
    .select('title, progress_unit')
    .eq('id', goalId)
    .eq('user_id', user.id)
    .single()
  if (!row) return { ok: false, error: 'not_found' }

  const r = row as { title: string; progress_unit: string | null }
  const { category, cleanTitle, unit } = await categorizeGoal(r.title)

  // Persist the goal's own unit onto the existing progress_unit column, fill-when-
  // empty so a unit the user set is never overwritten. A goal's progress unit IS
  // its measurement unit, so this is migration-free and purely additive: the goal
  // now carries its own unit and every brain reads THAT, never the account's.
  const patch: Record<string, unknown> = { category, clean_title: cleanTitle, updated_at: new Date().toISOString() }
  const backfillUnit = unitToBackfill(r.progress_unit, unit)
  if (backfillUnit) patch.progress_unit = backfillUnit

  const { data, error } = await supabase
    .from('vitality_goals')
    .update(patch)
    .eq('id', goalId)
    .eq('user_id', user.id)
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: writeError(error) }

  const goal = rowToBigGoal(data as BigGoalRow)
  // Refresh Vee's memory so it uses the tidy title once we have one.
  await syncGoalFact(supabase, user.id, goal)

  revalidatePath('/app/goals')
  revalidatePath('/app/mentor')
  return { ok: true, goal }
}

// ── this-week habit goals ──────────────────────────────────────────────────────

export interface AddHabitGoalInput {
  title: string
  kind?: HabitKind
  source?: HabitSource
  tracking?: HabitTracking | null
  suggestedStartHour?: number | null
  parentGoalId?: string | null
}

export async function addHabitGoal(input: AddHabitGoalInput): Promise<Ok<{ habit: HabitGoal }> | Err> {
  const title = input.title.trim()
  if (!title) return { ok: false, error: 'empty_title' }
  if (title.length > 200) return { ok: false, error: 'too_long' }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  const row = habitGoalToRow(
    {
      title,
      kind: input.kind ?? 'habit',
      source: input.source ?? null,
      tracking: input.tracking ?? null,
      suggestedStartHour: input.suggestedStartHour ?? null,
      parentGoalId: input.parentGoalId ?? null,
      status: 'open',
      isTomorrow: false,
    },
    user.id,
  )

  const { data, error } = await supabase
    .from('vitality_habit_goals')
    .insert(row)
    .select('*')
    .single()

  if (error || !data) return { ok: false, error: writeError(error) }

  revalidatePath('/app/goals')
  return { ok: true, habit: rowToHabitGoal(data as HabitGoalRow) }
}

export async function setHabitGoalDone(id: string, done: boolean): Promise<Ok<{ habit: HabitGoal }> | Err> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  const { data, error } = await supabase
    .from('vitality_habit_goals')
    .update({ status: done ? 'completed' : 'open', completed_at: done ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error || !data) return { ok: false, error: writeError(error) }

  revalidatePath('/app/goals')
  return { ok: true, habit: rowToHabitGoal(data as HabitGoalRow) }
}

export async function deleteHabitGoal(id: string): Promise<Ok<unknown> | Err> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  const { error } = await supabase
    .from('vitality_habit_goals')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { ok: false, error: writeError(error) }

  revalidatePath('/app/goals')
  return { ok: true }
}
