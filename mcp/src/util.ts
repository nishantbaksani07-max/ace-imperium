// Small shared helpers: local date keys (matching the app's convention),
// decimal-hour formatting, and safe coercions.
//
// Deliberately env-free: this module is imported by tools.ts/queries.ts/
// nudges.ts, which the HOSTED Next.js route also imports. Reaching for env.ts's
// getEnv() here would drag its `process.exit(1)`-on-missing-VITALITY_* loader
// into the Vercel bundle and kill the serverless function (its env vars only
// exist on the stdio CLI). So we read VITALITY_TIMEZONE straight off
// process.env — set by env.ts's loadDotenv() in the CLI process, simply absent
// (→ host local time) in the hosted route. No import, no exit-on-missing.

/** Local YYYY-MM-DD, honoring VITALITY_TIMEZONE if set, else host local time.
 *  Mirrors the app's getLocalDateKey() (never toISOString — UTC drift). */
export function getLocalDateKey(date = new Date()): string {
  const tz = process.env.VITALITY_TIMEZONE;
  if (tz) {
    // en-CA yields YYYY-MM-DD parts.
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
    return parts;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/** A date key N days before today. */
export function dateKeyDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return getLocalDateKey(d);
}

/** Local date key with an early-morning rollover: an entry before `rolloverHour`
 *  local time counts as the PREVIOUS day. The app rolls food/macros at 4am and
 *  supplements at 6am, so the MCP must use the same cutoff to agree with what the
 *  user sees, and so the MCP's own read and write land on the same day. Shifts the
 *  absolute instant back by `rolloverHour` hours, then renders the local key. */
export function getRolloverDateKey(rolloverHour: number, date = new Date()): string {
  return getLocalDateKey(new Date(date.getTime() - rolloverHour * 3_600_000));
}

/** The Fuel / macros day key (4am rollover), matching the app. */
export const getNutritionDayKey = (date = new Date()): string => getRolloverDateKey(4, date);

/** The supplements day key (6am rollover), matching the app. */
export const getSupplementDayKey = (date = new Date()): string => getRolloverDateKey(6, date);

/** The UTC instant of LOCAL midnight `days` ago, as an ISO string. Use this to
 *  filter a timestamptz column by a "last N local days" window: a bare
 *  `${dateKey}T00:00:00Z` pins the boundary to UTC midnight, which drifts up to a
 *  day for a user whose local midnight is not UTC midnight. */
export function localDayStartISO(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/** Decimal hour (e.g. 22.5) → "10:30 PM". */
export function fmtHour(decimalHour: number): string {
  let h = ((decimalHour % 24) + 24) % 24;
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  // round-up of minutes can push to next hour
  let hh = hours;
  let mm = mins;
  if (mm === 60) {
    mm = 0;
    hh = (hh + 1) % 24;
  }
  const ampm = hh < 12 ? 'AM' : 'PM';
  let display = hh % 12;
  if (display === 0) display = 12;
  return `${display}:${String(mm).padStart(2, '0')} ${ampm}`;
}

export const num = (v: unknown): number | null => {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

export const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

export function ageFromBirthday(birthday: unknown): number | null {
  const b = str(birthday);
  if (!b) return null;
  const [y, m, d] = b.split('-').map(Number);
  if (!y || !m || !d) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  const md = today.getMonth() + 1 - m;
  if (md < 0 || (md === 0 && today.getDate() < d)) age -= 1;
  return age > 0 && age < 130 ? age : null;
}

/** Round to at most `places` decimals, dropping trailing zeros. */
export function round(n: number, places = 1): number {
  const f = Math.pow(10, places);
  return Math.round(n * f) / f;
}

/**
 * Format a brand KPI value with its free-text unit. Mirrors the brand UI's
 * `formatKpi` (app/app/brand/[id]/BrandDetail.tsx) so MCP text matches what the
 * user sees: currency prefixes ($1,200), percent suffix (40%), rate suffix
 * (12/wk), everything else a spaced suffix (3 leads).
 */
export function fmtKpi(value: number, unit: string): string {
  const n = value.toLocaleString();
  if (!unit) return n;
  if (/^[$£€¥]/.test(unit)) return `${unit}${n}`;
  if (unit === '%') return `${n}%`;
  if (unit.startsWith('/')) return `${n}${unit}`;
  return `${n} ${unit}`;
}

/** Whole-number days from `fromKey` to `toKey` (both local `YYYY-MM-DD`). Negative = past. */
export function daysBetweenKeys(fromKey: string, toKey: string): number {
  const from = new Date(fromKey + 'T00:00:00').getTime();
  const to = new Date(toKey + 'T00:00:00').getTime();
  return Math.round((to - from) / 86_400_000);
}
