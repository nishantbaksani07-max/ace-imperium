import 'server-only'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Founders-only gate for the Arts District moderation queue (/admin).
 *
 * A founder is any user whose account email is listed in the FOUNDER_EMAILS env
 * var (comma-separated, case-insensitive). This is Alex + Sam only.
 *
 * SECURITY, per CLAUDE.md hard rule #3 and the moderation lane brief:
 *  - server-only: the allowlist must NEVER ship to the client, so this module is
 *    poisoned with 'server-only' and the var is FOUNDER_EMAILS (never a
 *    NEXT_PUBLIC_ var).
 *  - fail-safe DENY: an unset / empty env var means NOBODY is a founder — never
 *    "everyone". A typo that empties the list locks the door, it does not open it.
 *  - identity comes from the server session, never from the client. isFounder()
 *    reads the logged-in user via the server Supabase client and compares that
 *    server-verified email to the allowlist.
 *
 * Both the page and every mutating server action re-check isFounder() (defense
 * in depth): a server action is a public HTTP endpoint, so the gate lives inside
 * the action, not only on the page that renders its buttons.
 */

/** Pure allowlist check on an email. No I/O. Empty allowlist ⇒ always false. */
export function isFounderEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const list = (process.env.FOUNDER_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (list.length === 0) return false
  return list.includes(email.trim().toLowerCase())
}

/**
 * True only if the current server session belongs to a founder. Reads the user
 * from the server Supabase client (getUser() re-validates the token with
 * Supabase), so the caller identity can never be spoofed from the client.
 */
export async function isFounder(): Promise<boolean> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return isFounderEmail(user?.email)
  } catch {
    // Fail safe: any auth error means "not a founder".
    return false
  }
}

/**
 * Guard a founders-only server component. Redirects non-founders to /app so the
 * moderation route is invisible to everyone else. Returns nothing; on success the
 * caller simply proceeds.
 */
export async function requireFounder(): Promise<void> {
  if (!(await isFounder())) {
    redirect('/app')
  }
}
