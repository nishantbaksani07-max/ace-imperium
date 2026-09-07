/**
 * Shared localStorage key derivation for the onboarding dismissed-set.
 *
 * Keyed by user id so multiple accounts on the same browser don't
 * inherit each other's dismissals — the bug Alex hit when testing
 * "Oscar" right after dismissing tasks on his primary account.
 *
 * Long-term we'll move this to `user_profile.dismissed_tasks` so it
 * survives clearing browser data and follows the user across devices;
 * for now per-user localStorage is a one-line fix that closes the
 * cross-user pollution.
 */
export function dismissedKeyForUser(userId: string): string {
  return `vitality.onboarding.dismissed:${userId}`
}
