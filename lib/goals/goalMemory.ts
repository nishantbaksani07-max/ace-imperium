/**
 * Vee Goals — the single source of truth for what a goal should leave in Vee's
 * shared memory (user_facts). Pure + IO-free so it can be unit-tested; the
 * Supabase upsert/delete that acts on it lives in app/app/goals/goalActions.ts.
 *
 * The whole point: Vee's memory must always match the goal's CURRENT state.
 * One canonical fact per goal (keyed by the goal id via user_facts.ref_id), so
 * editing progress refreshes it, flipping to 'silent' retracts it, deleting the
 * goal removes it, and achieving it turns it into a celebration — never a stale
 * "still working toward" line for a goal that is done, gone, or private.
 */
import type { BigGoal, Prio, Push } from '@/app/app/goals/veeTypes'

const PRIO_WORD: Record<Prio, string> = { 1: 'Low', 2: 'Medium', 3: 'High' }
const PRIO_SALIENCE: Record<Prio, number> = { 1: 0.45, 2: 0.6, 3: 0.8 }
const PUSH_WANT: Record<Push, string> = {
  silent: 'keep it private',
  gentle: 'cheer quietly',
  balanced: 'nudge them if they drift',
  push: 'push them to show up',
}

/** The tidy AI title if we have one, else the raw title the user typed. */
function goalName(g: BigGoal): string {
  return (g.cleanTitle ?? g.title).trim()
}

/** The canonical "what they're working toward" memory line for an active goal. */
export function goalFactBody(g: BigGoal): string {
  const parts = [`Personal goal: ${goalName(g)}.`]
  if (g.targetDate) parts.push(`Target date ${g.targetDate}.`)
  // Only a real target makes a count meaningful (milestone goals have no bar).
  if (g.progressTarget != null) {
    const unit = g.progressUnit ? ` ${g.progressUnit}` : ''
    parts.push(`At ${g.progressCurrent ?? 0} of ${g.progressTarget}${unit}.`)
  }
  parts.push(`${PRIO_WORD[g.priority]} priority.`)
  parts.push(`Wants Vee to ${PUSH_WANT[g.push]}.`)
  return parts.join(' ')
}

/** What Vee's memory should hold for this goal right now. */
export type GoalMemory =
  | { op: 'delete' }
  | { op: 'write'; body: string; salience: number }

/**
 * Decide the memory action for a goal's current state. Order matters:
 *   1. 'silent'                  → never remember it (the user asked for privacy)
 *   2. paused / abandoned        → retract it (Vee stops bringing it up)
 *   3. achieved                  → a celebration fact, not a to-do
 *   4. active                    → the working-toward fact, salience by priority
 */
export function goalMemoryAction(g: BigGoal): GoalMemory {
  if (g.push === 'silent') return { op: 'delete' }
  if (g.status === 'paused' || g.status === 'abandoned') return { op: 'delete' }
  if (g.status === 'achieved') {
    return { op: 'write', body: `Achieved their goal: ${goalName(g)}. Worth celebrating together.`, salience: 0.9 }
  }
  return { op: 'write', body: goalFactBody(g), salience: PRIO_SALIENCE[g.priority] ?? 0.6 }
}
