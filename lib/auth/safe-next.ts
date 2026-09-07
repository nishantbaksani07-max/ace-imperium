// A post-login return path is safe ONLY if it is a same-origin relative path.
// Used by the login flow + the MCP OAuth /authorize bounce so we never redirect
// to an attacker-controlled absolute or protocol-relative URL (open redirect).
//
// The value is assumed already URL-decoded once (Next's useSearchParams / the
// server URL parser do that), so this validates — it does NOT decode again.
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (!raw.startsWith('/')) return null
  // Block protocol-relative ('//host') and backslash tricks ('/\\host').
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null
  return raw
}
