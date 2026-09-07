'use client'

import { createClient } from '@/lib/supabase/client'
import { MODULE_MIRRORS } from './syncAllModules'

/**
 * Live "watch it change": when Claude (via the MCP) or another device writes to
 * a blob table, the app is localStorage-primary so it wouldn't otherwise notice.
 * This watches each blob table's `updated_at` and, when it moves PAST the value
 * this tab last saw (a remote write), surfaces a one-tap "refresh" so the user's
 * own writes never auto-reload the page out from under them.
 *
 * Why timestamps, not content: the peak mirror enriches substances, and jsonb
 * key order isn't stable, so content compares give false positives. `updated_at`
 * is the clean signal. Why no false positives from THIS tab's own pushes: the
 * dashboard (/app — the side-by-side surface) mounts no module hooks, so nothing
 * here pushes while you sit on it; only a remote writer moves the timestamp.
 */

/** key → table for the four blob-backed modules (water is relational, skipped). */
export const WATCHED_TABLES: Record<string, string> = {
  vitality_brand_v1: 'brand_state',
  vitality_goals_v1: 'goals_state',
  vitality_peak_v1: 'peak_state',
  vitality_supplements_v1: 'supplements_state',
}

export type StampMap = Record<string, string | null>

/**
 * Pure: which tables have a STRICTLY newer `updated_at` than the baseline this
 * tab recorded. ISO-8601 UTC timestamps compare correctly lexicographically. A
 * table absent/null in either map (or unchanged) is not "newer".
 */
export function newerTables(baseline: StampMap, current: StampMap): string[] {
  const out: string[] = []
  for (const table of Object.keys(current)) {
    const cur = current[table]
    const base = baseline[table]
    if (cur && (!base || cur > base)) out.push(table)
  }
  return out
}

/** Fetch the current `updated_at` for every watched table, in parallel. */
export async function fetchStamps(): Promise<StampMap> {
  const db = createClient()
  const { data: u } = await db.auth.getUser()
  const uid = u.user?.id
  if (!uid) return {}
  const tables = Array.from(new Set(Object.values(WATCHED_TABLES)))
  const rows = await Promise.all(
    tables.map(async (t) => {
      try {
        const { data } = await db.from(t).select('updated_at').eq('user_id', uid).maybeSingle()
        return [t, (data as { updated_at?: string } | null)?.updated_at ?? null] as const
      } catch {
        return [t, null] as const
      }
    }),
  )
  return Object.fromEntries(rows)
}

/**
 * Apply a remote update: pull each changed table's blob into localStorage (only
 * when it actually holds data), so a reload shows the new data. Returns the
 * fresh stamp map to use as the next baseline.
 */
export async function applyRemote(changedTables: string[]): Promise<void> {
  if (typeof window === 'undefined' || changedTables.length === 0) return
  const db = createClient()
  const { data: u } = await db.auth.getUser()
  const uid = u.user?.id
  if (!uid) return
  for (const table of changedTables) {
    const key = Object.keys(WATCHED_TABLES).find((k) => WATCHED_TABLES[k] === table)
    const mirror = MODULE_MIRRORS.find((m) => m.key === key)
    if (!key || !mirror) continue
    try {
      const { data } = await db.from(table).select('data').eq('user_id', uid).maybeSingle()
      const blob = (data as { data?: unknown } | null)?.data
      if (blob && typeof blob === 'object' && !Array.isArray(blob) && mirror.hasData(blob as Record<string, unknown>)) {
        window.localStorage.setItem(key, JSON.stringify(blob))
      }
    } catch {
      /* per-table best-effort */
    }
  }
}
