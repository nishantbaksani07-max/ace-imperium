'use client'

import { useEffect, useState } from 'react'
import { computeCurve, findPeakWindows, scoreNow, tierFor } from '@/app/app/peak/curve'
import { findSlotByMode } from '@/app/app/peak/schedule'
import type { PeakState, PeakWindow, ScheduledEvent, ScoreTier, WhoopSignal } from '@/app/app/peak/types'

/**
 * Cross-module read of the Peak tracker. We avoid instantiating Peak's
 * useState hook here — that would create a second React store divorced
 * from the user's actual Peak data. Instead we read the persisted
 * `vitality_peak_v1` and `vitality_whoop_v1` blobs directly and let the
 * pure functions in peak/curve.ts + peak/schedule.ts do the math.
 *
 * Returned data is reactive to `storage` events, so when the user edits
 * Peak in another tab, Goals' suggestions stay current.
 */

const PEAK_LS = 'vitality_peak_v1'
const WHOOP_LS = 'vitality_whoop_v1'

export interface PeakSnapshot {
  /** True only after first client read — guards SSR + initial paint. */
  ready: boolean
  /** Hourly score (length 24, 0-100). Empty array when Peak hasn't loaded. */
  curve: number[]
  /** Current 0-100 score (Vitality Score for the day). */
  score: number
  /** Tier label. */
  tier: ScoreTier
  /** Best multi-hour windows for deep work. */
  windows: PeakWindow[]
  /** Today's scheduled events (recurring + one-off, with skips filtered). */
  todayEvents: ScheduledEvent[]
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Pick today's scheduled events from a PeakState — same filter as TasksPanel. */
function filterTodayEvents(events: ScheduledEvent[]): ScheduledEvent[] {
  const t = todayKey()
  const dow = new Date().getDay()
  return events.filter(e => {
    if (e.date) return e.date === t
    if (e.recurringDays && e.recurringDays.includes(dow)) {
      return !e.skippedDates.includes(t)
    }
    return false
  })
}

function readPeakState(): PeakState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(PEAK_LS)
    if (!raw) return null
    return JSON.parse(raw) as PeakState
  } catch {
    return null
  }
}

/**
 * Neutral WHOOP signal — used as the fallback when the user hasn't
 * connected WHOOP yet (or localStorage is empty). All-null lets
 * computeCurve fall back to its peak-state-only path.
 */
const EMPTY_WHOOP: WhoopSignal = {
  recovery: null,
  hrv: null,
  sleepScore: null,
  sleepHours: null,
  sleepDebtHours: null,
  strain: null,
  wakeHour: null,
  hrvBaseline: null,
  rhrBaseline: null,
  hrvAnomalous: false,
  daysAvailable: 0,
}

function readWhoop(): WhoopSignal | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = localStorage.getItem(WHOOP_LS)
    if (!raw) return undefined
    // The WhoopModule writes a flat snapshot — we coerce its field names
    // into the Peak WhoopSignal shape. Missing fields stay null.
    const parsed = JSON.parse(raw) as Record<string, number | null>
    const sleepDeficitMin = parsed.sleepDeficitMin
    return {
      recovery: parsed.recovery ?? null,
      hrv: parsed.hrv ?? null,
      sleepScore: parsed.sleepPerf ?? null,
      sleepHours: parsed.sleepHours ?? null,
      sleepDebtHours: typeof sleepDeficitMin === 'number' ? sleepDeficitMin / 60 : null,
      strain: parsed.strain ?? null,
      wakeHour: null,
      hrvBaseline: parsed.hrvBaseline ?? null,
      rhrBaseline: null,
    } as WhoopSignal
  } catch {
    return undefined
  }
}

export function usePeakSnapshot(): PeakSnapshot {
  const [snap, setSnap] = useState<PeakSnapshot>({
    ready: false,
    curve: [],
    score: 0,
    tier: 'Tired',
    windows: [],
    todayEvents: [],
  })

  useEffect(() => {
    function refresh() {
      const peakState = readPeakState()
      const whoop = readWhoop()
      if (!peakState) {
        setSnap(s => ({ ...s, ready: true }))
        return
      }
      // computeCurve requires a non-undefined WhoopSignal. When the
      // user hasn't connected WHOOP, fall back to an all-null signal
      // so the curve still computes from peak state alone.
      const curve = computeCurve(peakState, whoop ?? EMPTY_WHOOP)
      const score = scoreNow(curve)
      setSnap({
        ready: true,
        curve,
        score,
        tier: tierFor(score),
        windows: findPeakWindows(curve),
        todayEvents: filterTodayEvents(peakState.events),
      })
    }
    refresh()
    function onStorage(e: StorageEvent) {
      if (e.key === PEAK_LS || e.key === WHOOP_LS) refresh()
    }
    window.addEventListener('storage', onStorage)
    // Re-derive the live score every minute so it stays in sync as time
    // passes without forcing the user to refresh.
    const id = setInterval(refresh, 60_000)
    return () => {
      window.removeEventListener('storage', onStorage)
      clearInterval(id)
    }
  }, [])

  return snap
}

/**
 * Suggest a start hour for a goal given its difficulty + duration. Returns
 * null when the day is too packed or Peak hasn't loaded. Wraps Peak's own
 * findSlotByMode so the routing is identical to what Peak's TasksPanel uses.
 */
export function suggestSlot(
  snap: PeakSnapshot,
  durationMinutes: number,
  mode: 'highest' | 'moderate' | 'lowest',
): { startHour: number; endHour: number; avgScore: number } | null {
  if (!snap.ready || snap.curve.length === 0) return null
  if (durationMinutes <= 0) return null
  const slot = findSlotByMode(snap.curve, snap.todayEvents, durationMinutes / 60, mode)
  if (!slot) return null
  return { startHour: slot.start, endHour: slot.end, avgScore: slot.avgScore }
}
