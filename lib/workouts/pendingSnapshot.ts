/**
 * Local write-through backup for the workout logger.
 *
 * The network saver (lib/workouts/saver.ts) is robust against trailing edits,
 * but on an iOS *standalone* home-screen web app the OS can freeze and then
 * reload the page on an app-switch (change song, reply to a text, …) before an
 * in-flight save reaches the server. The result the user sees: the last 25–50%
 * of the sets they just logged come back un-logged.
 *
 * A localStorage write is synchronous and survives that freeze/kill, so we
 * mirror every save's payload here BEFORE the network write and clear it once
 * the write is confirmed. On the next mount the logger reads any leftover
 * snapshot and folds the still-missing logged sets back in (additive only —
 * see SplitLog's recovery effect), then re-saves to confirm.
 *
 * The pure helpers here (key, counting, the should-recover gate) are unit
 * tested; the read/write/clear functions touch localStorage and no-op on the
 * server or when storage is unavailable.
 */
import type { SavedExercise, CardioEntry, OffDayLevel } from './queries'

export interface PendingSnapshot {
  userId: string
  date: string
  dayName: string
  exercises: SavedExercise[]
  cardio: CardioEntry[]
  offDay?: OffDayLevel | null
  submittedAt?: string | null
  /** Epoch ms the snapshot was written — for staleness / debugging. */
  savedAt: number
}

const PREFIX = 'vitality_pending_workout'

/** Storage key for one (user, local-date, day-name) workout. */
export function pendingKey(userId: string, date: string, dayName: string): string {
  return `${PREFIX}:${userId}:${date}:${dayName}`
}

/** Count genuinely-logged sets (done, not failed, real weight + reps). Mirrors
 *  queries.isLoggedSet so "what we'd recover" matches "what counts as logged". */
export function countLoggedSets(exercises: SavedExercise[]): number {
  let n = 0
  for (const ex of exercises) {
    for (const s of ex.sets) {
      if (s.done && !s.failed && (s.weight ?? 0) > 0 && (s.reps ?? 0) > 0) n += 1
    }
  }
  return n
}

/**
 * True when the local backup holds logged sets (or cardio) the freshly-loaded
 * server snapshot is missing — i.e. a trailing write never confirmed. Recovery
 * is additive, so the gate is deliberately permissive: any surplus triggers it.
 */
export function shouldRecoverFromPending(
  pending: Pick<PendingSnapshot, 'exercises' | 'cardio'>,
  server: { exercises: SavedExercise[]; cardio: CardioEntry[] },
): boolean {
  if (countLoggedSets(pending.exercises) > countLoggedSets(server.exercises)) return true
  const pendingCardio = (pending.cardio ?? []).some(c => (c.durationMin ?? 0) > 0 || (c.zone2Min ?? 0) > 0)
  const serverCardio = (server.cardio ?? []).some(c => (c.durationMin ?? 0) > 0 || (c.zone2Min ?? 0) > 0)
  return pendingCardio && !serverCardio
}

/** Mirror a save payload to localStorage. Synchronous; survives an iOS freeze. */
export function writePendingSnapshot(
  args: Omit<PendingSnapshot, 'savedAt'>,
): void {
  if (typeof window === 'undefined') return
  try {
    const snap: PendingSnapshot = { ...args, savedAt: Date.now() }
    window.localStorage.setItem(pendingKey(args.userId, args.date, args.dayName), JSON.stringify(snap))
  } catch {
    // Private mode / quota — the network saver remains the primary path.
  }
}

/** Read the backup for one (user, date, day), or null. */
export function readPendingSnapshot(userId: string, date: string, dayName: string): PendingSnapshot | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(pendingKey(userId, date, dayName))
    if (!raw) return null
    const snap = JSON.parse(raw) as PendingSnapshot
    if (!snap || !Array.isArray(snap.exercises)) return null
    return snap
  } catch {
    return null
  }
}

/** Drop the backup once the network write is confirmed. */
export function clearPendingSnapshot(userId: string, date: string, dayName: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(pendingKey(userId, date, dayName))
  } catch {
    /* no-op */
  }
}
