'use client'

import { createClient } from '@/lib/supabase/client'
import { mirrorBrandToSupabase } from '@/app/app/brand/sync'
import { mirrorGoalsToSupabase } from '@/app/app/goals/sync'
import { mirrorPeakToSupabase } from '@/app/app/peak/sync'
import { mirrorSupplementsToSupabase } from '@/app/app/fitness/supplements/sync'
import { mirrorWaterToSupabase } from '@/app/app/fuel/water/sync'
import type { BrandState } from '@/app/app/brand/types'
import type { GoalsPersistedState } from '@/app/app/goals/types'
import type { PeakState } from '@/app/app/peak/types'
import type { SupplementsState } from '@/app/app/fitness/supplements/types'
import type { WaterState } from '@/app/app/fuel/water/types'

/**
 * Sync-on-load: the per-module Supabase mirrors (brand/goals/peak/supplements/
 * water) only fire while THAT module's page is mounted. So a user who set goals
 * weeks ago and hasn't reopened the page has nothing on the server — and the MCP
 * truthfully reports "no goals", which makes the "assistant that knows you"
 * promise look broken. This pushes every non-empty local blob to Supabase on app
 * load, regardless of which page you're on, reusing each module's own mirror.
 *
 * NO-CLOBBER RULE: the blob mirrors do a whole-row upsert, so pushing an EMPTY
 * local store (e.g. a fresh device) would overwrite real server data. Every
 * entry therefore guards on `hasData` — we only push a module that actually
 * holds user data locally. This makes the sync purely additive/safe; pulling
 * server → local (true two-way sync) is a separate, larger piece.
 */

type Blob = Record<string, unknown>
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

// ── Owner stamp: prevent shared-device cross-user data bleed ──────────────────
//
// localStorage survives sign-out, so on a shared device User B (after A signs
// out) would otherwise see A's data AND the push below would write it into B's
// server row. We stamp localStorage with the signed-in user's id; if on load the
// stamp belongs to a DIFFERENT user, we wipe every `vitality_*` key before any
// hydrate/push, so B starts clean and then hydrates their OWN data.
//
// CRITICAL safety: an ABSENT stamp means the data predates this feature — almost
// certainly the CURRENT user's own data — so we must NEVER wipe it (that would
// delete every existing user's local state on the first load after this ships).
// We wipe ONLY on a confirmed different prior owner (stamp present AND != current).
export const OWNER_KEY = 'vitality_sync_owner'

/** All `vitality_*` localStorage keys except the owner stamp itself. */
export function keysToPurge(allKeys: string[]): string[] {
  return allKeys.filter((k) => k.startsWith('vitality_') && k !== OWNER_KEY)
}

export interface OwnerAction {
  purge: string[]
  /** New owner to stamp; null = leave the stamp untouched (e.g. signed out). */
  stampTo: string | null
}

/**
 * Pure decision for the owner reconcile. See the CRITICAL note above: a null/
 * absent `storedOwner` NEVER purges — it only stamps. Only a present stamp that
 * differs from the signed-in user triggers a wipe of the prior user's data.
 */
export function ownerAction(currentUserId: string | null, storedOwner: string | null, allKeys: string[]): OwnerAction {
  if (!currentUserId) return { purge: [], stampTo: null } // signed out — leave everything as-is
  if (storedOwner && storedOwner !== currentUserId) {
    return { purge: keysToPurge(allKeys), stampTo: currentUserId } // a different user owned this device → wipe theirs
  }
  return { purge: [], stampTo: currentUserId } // same user, or first stamp over pre-existing data → just (re)stamp
}

/**
 * Apply the owner reconcile for the signed-in user: wipe a prior different
 * user's `vitality_*` data, then stamp this device as theirs. Best-effort; MUST
 * run BEFORE hydrate/push so the wipe can't race them.
 */
export async function reconcileOwner(): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    const { data } = await createClient().auth.getUser()
    const uid = data.user?.id ?? null
    if (!uid) return // not signed in — nothing to reconcile
    const action = ownerAction(uid, window.localStorage.getItem(OWNER_KEY), Object.keys(window.localStorage))
    for (const k of action.purge) {
      try {
        window.localStorage.removeItem(k)
      } catch {
        /* ignore a single key */
      }
    }
    if (action.stampTo) window.localStorage.setItem(OWNER_KEY, action.stampTo)
    // A real user-switch wipe just happened. A module page that already mounted
    // with the PRIOR user's data in React state could re-persist it after this
    // purge (a slow getUser() race). Force one clean reload so every module
    // remounts from the now-wiped (and about-to-hydrate) localStorage. Only
    // fires on an actual different-owner switch — rare, and a reload there is
    // expected ("switching accounts…"). The stamp is set above first, so the
    // reloaded page sees the same owner and does NOT reload again.
    if (action.purge.length > 0) {
      window.location.reload()
    }
  } catch {
    /* best-effort; never affects the UI */
  }
}

export interface ModuleMirror {
  key: string
  /** True only when the parsed blob holds real user data — the no-clobber gate. */
  hasData: (s: Blob) => boolean
  mirror: (s: Blob) => Promise<void>
}

export const MODULE_MIRRORS: ModuleMirror[] = [
  { key: 'vitality_brand_v1', hasData: (s) => arr(s.brands).length > 0, mirror: (s) => mirrorBrandToSupabase(s as unknown as BrandState) },
  {
    // goals OR a streak history (dayLogs) OR a planned-tomorrow queue — a user
    // with a long streak but no open goals still has data worth syncing.
    key: 'vitality_goals_v1',
    hasData: (s) => arr(s.goals).length > 0 || arr(s.dayLogs).length > 0 || arr(s.tomorrow).length > 0,
    mirror: (s) => mirrorGoalsToSupabase(s as unknown as GoalsPersistedState),
  },
  {
    key: 'vitality_peak_v1',
    hasData: (s) =>
      arr(s.substances).length + arr(s.events).length + arr(s.tasks).length + arr(s.taps).length > 0 || s.hardestTask != null,
    mirror: (s) => mirrorPeakToSupabase(s as unknown as PeakState),
  },
  { key: 'vitality_supplements_v1', hasData: (s) => arr(s.items).length > 0, mirror: (s) => mirrorSupplementsToSupabase(s as unknown as SupplementsState) },
  {
    // Water's mirror upserts the WHOLE prefs row (incl. caffeine/activity used by
    // the hydration target), so gate on setupComplete — never push default prefs
    // over a user's configured ones just because a stray log exists. Logs without
    // completed setup are low-value and safer left for the in-module mirror.
    key: 'vitality_water_v1',
    hasData: (s) => s.setupComplete === true,
    mirror: (s) => mirrorWaterToSupabase(s as unknown as WaterState),
  },
]

export interface MirrorTarget {
  key: string
  parsed: Blob
  mirror: (s: Blob) => Promise<void>
}

/**
 * Pure: given a localStorage reader, return the modules to mirror now — key
 * present, parses to a plain object, and holds data. Garbage/empty/non-object
 * blobs are skipped, so a fresh or cleared device never clobbers server data.
 */
export function mirrorTargets(read: (key: string) => string | null): MirrorTarget[] {
  const out: MirrorTarget[] = []
  for (const m of MODULE_MIRRORS) {
    const raw = read(m.key)
    if (!raw) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      continue
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
    if (!m.hasData(parsed as Blob)) continue
    out.push({ key: m.key, parsed: parsed as Blob, mirror: m.mirror })
  }
  return out
}

/**
 * The blob-backed modules we can hydrate server → local. Each maps its
 * localStorage key to the Supabase jsonb table written by its mirror. Water is
 * intentionally absent — it's relational (water_prefs + water_days), not a single
 * blob, so reconstructing its localStorage shape is a separate piece.
 */
const PULLABLE_TABLES: Record<string, string> = {
  vitality_brand_v1: 'brand_state',
  vitality_goals_v1: 'goals_state',
  vitality_peak_v1: 'peak_state',
  vitality_supplements_v1: 'supplements_state',
}

/**
 * Pure: which module keys are eligible to hydrate from the server right now —
 * the localStorage key is entirely ABSENT (a fresh device/module). We deliberately
 * do NOT hydrate when the key exists-but-empty: that means the user cleared it on
 * this device, and pulling server data back would resurrect deleted data. Absent
 * = nothing local to lose, so it's the only safe pull condition.
 */
export function keysToHydrate(read: (key: string) => string | null): string[] {
  return Object.keys(PULLABLE_TABLES).filter((key) => read(key) === null)
}

/**
 * Hydrate server → local for fresh devices/modules: when a module's localStorage
 * key is absent, pull its blob from Supabase and seed localStorage so the module
 * shows the user's existing data instead of starting empty. The no-overwrite
 * guard (absent-only) means this can never clobber local edits. Best-effort; a
 * module page that mounts before this finishes picks the data up on next mount.
 */
export async function hydrateFromServer(): Promise<void> {
  if (typeof window === 'undefined') return
  // Snapshot absence SYNCHRONOUSLY, before any await: a module page that mounts
  // during the fetch may eagerly write a default blob (making the key "present"),
  // but we've already proven it was genuinely fresh — so we still seed the real
  // server data over that transient default. (The freshly-seeded data shows on
  // the next navigation/refresh; the common /app-first path has no such race.)
  const absent = keysToHydrate((k) => window.localStorage.getItem(k))
  if (absent.length === 0) return
  try {
    const db = createClient()
    const { data: u } = await db.auth.getUser()
    const uid = u.user?.id
    if (!uid) return
    for (const key of absent) {
      const table = PULLABLE_TABLES[key]
      const mirror = MODULE_MIRRORS.find((m) => m.key === key)
      if (!mirror) continue
      try {
        const { data } = await db.from(table).select('data').eq('user_id', uid).maybeSingle()
        const blob = (data as { data?: unknown } | null)?.data
        // Only seed when the server actually holds data for this module — never
        // write an empty {} that would later be re-pushed as a phantom store.
        if (blob && typeof blob === 'object' && !Array.isArray(blob) && mirror.hasData(blob as Blob)) {
          window.localStorage.setItem(key, JSON.stringify(blob))
        }
      } catch {
        /* per-module best-effort */
      }
    }
  } catch {
    /* best-effort; never affects the UI */
  }
}

let started = false

// Resolves once the load-time push has finished (or been skipped). The remote
// watcher waits on this before recording its baseline, so the push's own
// `updated_at` bumps aren't mistaken for a remote write (a load-time false pill).
let resolveSettled: (() => void) | undefined
export const syncSettled: Promise<void> = new Promise((r) => {
  resolveSettled = r
})

/**
 * Push every non-empty local module blob to Supabase. Best-effort, runs once per
 * page load, only when signed in. Failures are swallowed so the UI is unaffected.
 */
export async function syncAllModules(): Promise<void> {
  if (typeof window === 'undefined' || started) return
  started = true
  try {
    const { data } = await createClient().auth.getUser()
    if (!data.user) {
      started = false // not signed in yet — allow a later attempt
      return
    }
    const targets = mirrorTargets((k) => window.localStorage.getItem(k))
    for (const t of targets) {
      try {
        await t.mirror(t.parsed)
      } catch {
        /* per-module best-effort */
      }
    }
  } catch {
    /* best-effort; never affects the UI */
  } finally {
    resolveSettled?.() // unblock the remote watcher's baseline (push done/skipped)
  }
}
