/**
 * New-quiz notification logic.
 *
 * Lives separately from the quiz registry so the notify path can be
 * reasoned about in isolation: given (current registry, user's seen
 * list, user's completed slices), what — if anything — should we
 * surface to the user as "new"?
 *
 * Wired into /app/layout.tsx: on every gated route, the layout reads
 * the user's seen list, diffs against the registry, and renders the
 * NewQuizGreeting modal if anything's new. The modal calls
 * markQuizzesSeen on dismiss so it doesn't re-pop.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { QUIZZES, type QuizId } from './registry'
import { getUserPreferences } from '@/lib/preferences'

const ALL_QUIZ_IDS = Object.keys(QUIZZES) as QuizId[]

export interface NewQuizNotification {
  /** Quiz ids the user has not been notified about AND hasn't completed.
   *  Empty array means "nothing to show." */
  newIds: QuizId[]
}

/**
 * Diff the current quiz registry against the user's notification
 * history. A quiz is "new to notify about" when:
 *   - It exists in the current registry (just-shipped)
 *   - User has never explicitly dismissed/taken it via the modal
 *     (not in seen_quizzes)
 *   - User has not already completed it (no preferences slice — we
 *     treat completion as implicit acknowledgement)
 *
 * NULL seen_quizzes is treated as an empty set — no auto-backfill.
 * The earlier "seed everything as seen on first load" pass was a
 * footgun: it suppressed notifications for un-completed quizzes too,
 * meaning brand-new users never saw the modal. Better to err on the
 * side of "show the modal at least once" — the user can dismiss it
 * with one click, and `markQuizzesSeen` populates the column going
 * forward so it doesn't re-pop.
 *
 * Silent-failing — any Supabase error returns an empty notification
 * so the dashboard never breaks because of this side feature.
 */
export async function computeNewQuizzes(
  supabase: SupabaseClient,
  userId: string,
): Promise<NewQuizNotification> {
  try {
    const { data, error } = await supabase
      .from('user_profile')
      .select('seen_quizzes')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) return { newIds: [] }

    const seen = (data?.seen_quizzes as string[] | null | undefined) ?? []
    const seenSet = new Set(seen)

    // Also pull focus_areas so we only notify about quizzes that are
    // relevant to what the user said they care about. A money-focused
    // user shouldn't get a popup about the Hydration quiz.
    const { data: profileRow } = await supabase
      .from('user_profile')
      .select('focus_areas')
      .eq('user_id', userId)
      .maybeSingle()
    const focusAreas = (Array.isArray(profileRow?.focus_areas) ? profileRow?.focus_areas : []) as string[]

    // Match the QUIZ_FOCUS_GATE from lib/onboardingTasks. Duplicated
    // here on purpose — keeping the dep graph one-way (notify can't
    // import from onboardingTasks without pulling Supabase types in).
    const quizFocusGate: Record<QuizId, string[] | 'all'> = {
      mentor:    'all',
      nutrition: ['body'],
    }

    const prefs = await getUserPreferences(supabase, userId)
    const newIds = ALL_QUIZ_IDS.filter(id => {
      if (seenSet.has(id)) return false
      if (prefs[id]) return false
      const gate = quizFocusGate[id]
      if (gate !== 'all' && !gate.some(area => focusAreas.includes(area))) return false
      return true
    })

    return { newIds }
  } catch {
    // Network blip / schema race — fail quiet, the modal just won't
    // appear this session. Next load tries again.
    return { newIds: [] }
  }
}
