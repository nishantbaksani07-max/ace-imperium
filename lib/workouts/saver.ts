/**
 * Reliable, lifecycle-aware saver for the workout logger.
 *
 * The logger must never lose a logged set. The original inline save logic
 * dropped trailing edits on mobile: a debounced (600ms) timer that the OS
 * suspends when the tab is backgrounded, a `visibilitychange` flush that
 * *bailed* whenever a save was already in-flight, and no flush at all when
 * the component unmounted on in-app (SPA) navigation. The net effect was
 * that only the set whose save happened to complete before you left the
 * screen survived — every later set reverted to its prefill value.
 *
 * This module centralizes the save lifecycle so the component just declares
 * intent:
 *   - `schedule()`  — debounced; for high-frequency edits (typing weight/reps)
 *   - `flushNow()`  — immediate; for discrete commits (logging/undoing a set)
 *   - `flushUnload()` — force a keepalive write that does NOT bail mid-flight;
 *                       for `pagehide` / `visibilitychange: hidden`
 *   - `dispose()`   — flush any unsaved work on unmount (SPA navigation)
 *
 * The actual network write is injected as `save`, so this is pure scheduling
 * logic and unit-testable without a browser.
 */

export interface WorkoutSaverOptions {
  /**
   * Performs the actual write, reading the latest data itself. `keepalive`
   * is true for unload writes — the implementation should use a request that
   * survives the page being torn down (fetch `keepalive: true`).
   */
  save: (opts: { keepalive: boolean }) => Promise<void>
  /** Debounce window for `schedule()` in ms. */
  debounceMs?: number
  /** Optional status callback for a "saving / saved / error" indicator. */
  onStatus?: (status: 'idle' | 'saving' | 'saved' | 'error') => void
}

export interface WorkoutSaver {
  /** Debounced save — coalesces rapid edits (typing). */
  schedule(): void
  /** Immediate save — for discrete commits like logging a set. */
  flushNow(): void
  /** Force a keepalive write now, even if a save is in-flight. Page is leaving. */
  flushUnload(): void
  /** Flush any unsaved work, then stop. Call on unmount. */
  dispose(): void
  /**
   * Permanently silence the saver — call once a session is FINISHED. After
   * this, no write fires from any trigger (debounce, flushNow, flushUnload, or
   * dispose). This closes the data-loss window where a trailing contentless
   * autosave/unload write — which carries no submittedAt — could delete the
   * just-finished row via the empty-session cleanup.
   */
  disable(): void
}

export function createWorkoutSaver(opts: WorkoutSaverOptions): WorkoutSaver {
  const debounceMs = opts.debounceMs ?? 600
  const { save, onStatus } = opts

  let timer: ReturnType<typeof setTimeout> | null = null
  let inFlight = false
  let dirty = false
  let disposed = false

  function clearTimer() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  // Normal write path. Single-in-flight: if a save is already running, mark
  // the new data dirty and let the in-flight save re-arm in its `finally`.
  async function flush(keepalive: boolean) {
    if (inFlight) {
      dirty = true
      return
    }
    inFlight = true
    dirty = false
    onStatus?.('saving')
    try {
      await save({ keepalive })
      onStatus?.('saved')
    } catch {
      // Re-mark dirty so the trailing flush retries instead of dropping the
      // batch — a failed save that silently vanishes is the exact data-loss
      // mode this module exists to prevent.
      dirty = true
      onStatus?.('error')
    } finally {
      inFlight = false
      // Re-arm immediately (not via the debounce) so edits that landed during
      // the save are persisted right away, even if a background tab has frozen
      // its timers.
      if (dirty && !disposed) flush(false)
    }
  }

  return {
    schedule() {
      if (disposed) return
      dirty = true
      clearTimer()
      timer = setTimeout(() => {
        timer = null
        flush(false)
      }, debounceMs)
    },

    flushNow() {
      if (disposed) return
      clearTimer()
      flush(false)
    },

    flushUnload() {
      // A disabled saver (session finished) must never write — a contentless
      // unload write here is exactly what deleted the finished row.
      if (disposed) return
      clearTimer()
      // The page is going away. Do NOT respect the in-flight guard: an
      // in-flight non-keepalive fetch may be killed by the unload, so issue a
      // fresh keepalive write of the current state. Overlapping writes hit the
      // same (user, date, day_name) upsert key — last write wins, and this one
      // carries the most complete session.
      dirty = false
      save({ keepalive: true }).catch(() => {})
    },

    dispose() {
      if (disposed) return
      clearTimer()
      // On unmount, persist anything not yet written. Skip the write entirely
      // when there's nothing outstanding so ordinary navigation doesn't spam
      // redundant upserts.
      if (dirty || inFlight) {
        dirty = false
        save({ keepalive: true }).catch(() => {})
      }
      disposed = true
    },

    disable() {
      // Silence every future write path. Unlike dispose(), this flushes
      // NOTHING — the finish save already persisted the authoritative row, and
      // any further write would omit the finish mark.
      clearTimer()
      dirty = false
      disposed = true
    },
  }
}
