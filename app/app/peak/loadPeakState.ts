import type { SupabaseClient } from '@supabase/supabase-js'
import type { PeakState } from './types'

/**
 * Read the user's durable Peak state (substance logs, subjective taps, stimulant
 * profile, hot bar…) from the `peak_state` mirror table — the read half of the
 * write-mirror in ./sync.ts (table + RLS: 20260620000002_peak_state_mirror.sql).
 *
 * One jsonb blob per user, RLS-scoped to `auth.uid()`, so this only ever returns
 * the calling user's own row. Returns the stored `data` (a superset of PeakState
 * — sync.ts enriches each substance with name/category/unit; the extra fields are
 * harmless) or null when there's no row yet. Callers spread it over DEFAULT_STATE.
 *
 * This is what makes Peak logs persist across devices and sessions instead of
 * living only in one browser's localStorage.
 */
export async function loadPeakState(
  supabase: SupabaseClient,
  userId: string,
): Promise<Partial<PeakState> | null> {
  const { data, error } = await supabase
    .from('peak_state')
    .select('data')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data?.data) return null
  return data.data as Partial<PeakState>
}
