/**
 * Quiz gate helper — the "soft to-do, hard gate" pattern.
 *
 * Each tailoring quiz appears as a recommended to-do in the welcome
 * checklist; if the user skips it there, they hit a hard wall when
 * they click into the consumer module. That module's page calls
 * `requireQuizCompletion(prefs, 'goal', '/app/fitness')` — if the
 * slice is missing, it returns a redirect target that routes the user
 * to the quiz with a `return` param so they come back here once done.
 *
 * Wrap the result in `redirect(...)` from `next/navigation`. The pages
 * stay server-side, so there's no flash of un-personalized module.
 */
import type { UserPreferences, QuizSliceKey } from '@/lib/preferences'

export function quizGateRedirect(
  prefs: UserPreferences,
  slice: QuizSliceKey,
  returnPath: string,
): string | null {
  if (prefs[slice]) return null
  // URI-encode the return path so query strings on the consumer page
  // survive the round trip (e.g., /app/fitness/log?day=mon).
  return `/app/quiz/${slice}?return=${encodeURIComponent(returnPath)}`
}
