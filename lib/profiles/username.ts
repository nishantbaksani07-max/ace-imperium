/**
 * Username rules for the Arts District identity layer (Pillar 3, v2).
 *
 * A username is a public, one-way-door handle (citext unique in the DB). It
 * becomes the maker's `/u/<username>` URL and the byline that credits their
 * published tiles, so it must be URL-safe, readable, and free of route /
 * brand collisions.
 *
 * This module is the single source of truth for the shape of a handle. The
 * server action validates with it before writing, and the DB enforces the
 * same shape as a CHECK constraint + a unique index as the real guarantee.
 * Pure + dependency-free so it runs in tests and on both client and server.
 */

export const USERNAME_MIN = 3
export const USERNAME_MAX = 20

// Lowercase letters, digits, underscore. No leading/trailing rules beyond the
// charset + length — keep it boring and predictable.
const USERNAME_RE = /^[a-z0-9_]+$/

/**
 * Handles we never hand to a user. Two reasons:
 *  - route collisions: `/u`, `/app`, `/account`, `/api`, `/mcp`, `/vee` etc.
 *    (a handle that shadows a real path is a footgun even though `/u/<h>` is
 *    namespaced — it reads as official).
 *  - brand / impersonation: `vitality`, `admin`, `support`, `team`, `official`.
 */
const RESERVED = new Set<string>([
  // routes / namespaces
  'u', 'app', 'api', 'account', 'auth', 'login', 'signup', 'logout',
  'onboarding', 'welcome', 'pricing', 'mcp', 'vee', 'settings', 'www',
  'assets', 'static', 'public', 'favicon', 'robots', 'sitemap',
  // legal / meta
  'about', 'terms', 'privacy', 'help', 'contact', 'support', 'not-found', 'notfound',
  // brand / authority
  'vitality', 'admin', 'administrator', 'root', 'team', 'official', 'staff',
  'mod', 'moderator', 'system', 'null', 'undefined', 'anonymous', 'me',
])

export function isReservedUsername(raw: string): boolean {
  return RESERVED.has(normalizeUsername(raw))
}

/**
 * Lowercase, trim, strip a single leading `@`. Intentionally does NOT remove
 * illegal characters — validation rejects those so the user gets an error
 * rather than a silently rewritten handle.
 */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, '')
}

export interface UsernameResult {
  ok: boolean
  /** normalized handle when ok */
  value?: string
  /** human-readable reason when not ok */
  error?: string
}

export function validateUsername(raw: string): UsernameResult {
  const value = normalizeUsername(raw)

  if (value.length === 0) {
    return { ok: false, error: 'Pick a username.' }
  }
  if (value.length < USERNAME_MIN) {
    return { ok: false, error: `Usernames are at least ${USERNAME_MIN} characters.` }
  }
  if (value.length > USERNAME_MAX) {
    return { ok: false, error: `Usernames are at most ${USERNAME_MAX} characters.` }
  }
  if (!USERNAME_RE.test(value)) {
    return { ok: false, error: 'Use only lowercase letters, numbers and underscores.' }
  }
  if (RESERVED.has(value)) {
    return { ok: false, error: 'That username is reserved. Try another.' }
  }

  return { ok: true, value }
}
