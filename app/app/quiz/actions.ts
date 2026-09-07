'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { QuizSliceKey, UserPreferences, VitalsPreferences } from '@/lib/preferences'
import { QUIZZES, type QuizId } from '@/lib/quizzes/registry'

export type SaveQuizResult =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Save a quiz slice into `user_profile.preferences`. Merges with any
 * existing slices so saving Mentor never wipes a previously-saved
 * Goal. Always stamps `completed_at` server-side so we have a single
 * source of truth for "when did you finish this quiz."
 *
 * RLS keeps the write scoped to auth.uid(); no extra check needed
 * beyond the auth.getUser() guard.
 *
 * Revalidates the dashboard + welcome routes so the checklist's done
 * status updates instantly on next render.
 */
export async function saveQuizSlice<K extends QuizSliceKey>(
  slice: K,
  // The slice payload — omit `completed_at`; we stamp it server-side.
  payload: Omit<NonNullable<UserPreferences[K]>, 'completed_at'>,
): Promise<SaveQuizResult> {
  const supabase = createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: 'Not authenticated.' }
  }

  // Read existing row in one shot — saveQuizSlice should never INSERT
  // a fresh user_profile row, because that would require knowing the
  // user's onboarding fields (birthday, sex, height, weight, units) and
  // we don't have them here. INSERT branch would NOT-NULL-violation.
  // Onboarding is the only trusted creator of user_profile rows.
  const { data: existingRow } = await supabase
    .from('user_profile')
    .select('preferences, seen_quizzes')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!existingRow) {
    return { ok: false, error: 'Please finish onboarding before taking quizzes.' }
  }

  const existingPrefs = (existingRow.preferences as UserPreferences | null) ?? {}
  const merged: UserPreferences = {
    ...existingPrefs,
    [slice]: {
      ...payload,
      completed_at: new Date().toISOString(),
    },
  } as UserPreferences

  // Taking a quiz is implicit acknowledgement — union the slice into
  // seen_quizzes so the gem greeting modal doesn't re-pop next session.
  const existingSeen = (existingRow.seen_quizzes as string[] | null) ?? []
  const mergedSeen = Array.from(new Set([...existingSeen, slice]))

  const { error } = await supabase
    .from('user_profile')
    .update({
      preferences: merged,
      seen_quizzes: mergedSeen,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)

  if (error) {
    return { ok: false, error: `Failed to save: ${error.message}` }
  }

  revalidatePath('/welcome')
  revalidatePath('/app')

  return { ok: true }
}

/**
 * Save the Vitals (wearable) onboarding quiz. Thin wrapper over
 * `saveQuizSlice('vitals', ...)` so it inherits the same RLS-scoped merge,
 * server-side `completed_at` stamp, and dashboard revalidation as every other
 * quiz. Writes to `user_profile.preferences.vitals`. Caller omits
 * `completed_at` (stamped here). Q3 skipped = pass `healthFlags: []`.
 */
export async function saveVitalsQuiz(
  answers: Omit<VitalsPreferences, 'completed_at'>,
): Promise<SaveQuizResult> {
  return saveQuizSlice('vitals', answers)
}

/**
 * Mark a set of quiz ids as "seen" — i.e., the user has been notified
 * about them via the dashboard's NewQuizGreeting modal. Idempotent:
 * passing already-seen ids is a no-op. Unknown ids are filtered out
 * so a bad client payload can't poison the column.
 *
 * Called from the NewQuizGreeting client component when the user
 * clicks "take it now" or "maybe later." Either way the modal won't
 * pop again for those quizzes.
 */
export async function markQuizzesSeen(ids: string[]): Promise<SaveQuizResult> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, error: 'Not authenticated.' }

  // Hard-filter against the registry so a bad client can't write
  // arbitrary strings into the column.
  const validIds = (Object.keys(QUIZZES) as QuizId[])
  const toAdd = ids.filter((id): id is QuizId => (validIds as string[]).includes(id))
  if (toAdd.length === 0) return { ok: true }

  // Read existing list, union with toAdd, write back. Avoids a race
  // where two concurrent notify reads overwrite each other.
  const { data } = await supabase
    .from('user_profile')
    .select('seen_quizzes')
    .eq('user_id', user.id)
    .maybeSingle()

  const existing = (data?.seen_quizzes as string[] | null | undefined) ?? []
  const union = Array.from(new Set([...existing, ...toAdd]))

  const { error } = await supabase
    .from('user_profile')
    .upsert(
      { user_id: user.id, seen_quizzes: union, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )

  if (error) return { ok: false, error: `Failed to mark seen: ${error.message}` }
  revalidatePath('/app')
  return { ok: true }
}
