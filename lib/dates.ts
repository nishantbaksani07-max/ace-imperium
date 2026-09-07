/**
 * Local-time date key as YYYY-MM-DD.
 *
 * NEVER use `toISOString().split('T')[0]` for app-level date keys —
 * that returns UTC, which silently rolls over for users in non-UTC
 * timezones. A user logging a workout at 11pm local in CEST sees their
 * date flip to "tomorrow" if we key on UTC midnight. Use this everywhere
 * the app stores or compares dates by day.
 *
 * The Supabase `date` column stores the value as plain text in this
 * format — Postgres will parse it as a date in the database's session
 * timezone, but we never read it back as a Date object, only as a
 * YYYY-MM-DD string for grouping / display.
 */
export function getLocalDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Date key (YYYY-MM-DD) for an instant as seen at a specific UTC offset, e.g.
 * a wearable's per-reading `timezone_offset` ("-05:00" / "+09:00").
 *
 * Why: the server runs in UTC, so keying a reading on the server's day labels a
 * Californian's late-night reading with tomorrow's date. The wearable already
 * tells us the user's offset per reading, so we use THAT to land on their real
 * local day — correct for any user in any timezone, no stored profile needed.
 * Falls back to the server-local key when no usable offset is given.
 */
export function dateKeyForOffset(date: Date, offset: string | null | undefined): string {
  if (!offset) return getLocalDateKey(date)
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(offset.trim())
  if (!m) return getLocalDateKey(date)
  const sign = m[1] === '-' ? -1 : 1
  const mins = sign * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10))
  // Shift the instant by the offset, then read the UTC calendar date — that's
  // the user's local wall-clock day.
  return new Date(date.getTime() + mins * 60_000).toISOString().slice(0, 10)
}

/**
 * The last `n` midnight day keys ending on `endDayKey` (a YYYY-MM-DD string),
 * most-recent first. Noon-UTC math dodges DST edges; pure, so it stays testable.
 * Mirrors getRecentDayKeys in lib/nutrition/dayKey.ts (which uses the 4am key).
 */
export function getRecentDateKeys(endDayKey: string, n: number): string[] {
  const [y, m, d] = endDayKey.split('-').map(Number)
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d - i, 12, 0, 0))
    const yy = dt.getUTCFullYear()
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(dt.getUTCDate()).padStart(2, '0')
    out.push(`${yy}-${mm}-${dd}`)
  }
  return out
}
