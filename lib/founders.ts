/**
 * The founder allowlist, used ONLY for visibility (which tiles the Arts
 * District shows this viewer) during a dogfood phase. It is never a security
 * boundary: server routes gate on the session (requireUser) and RLS, and a
 * founder-only tile carries no extra authority beyond what its byte-equality
 * trust already grants any unmodified copy.
 *
 * Set FOUNDER_EMAILS in your env as a comma-separated list of emails.
 */
const FOUNDER_EMAILS = (process.env.FOUNDER_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

export function isFounderEmail(email: string | null | undefined): boolean {
  return !!email && FOUNDER_EMAILS.includes(email.trim().toLowerCase())
}
