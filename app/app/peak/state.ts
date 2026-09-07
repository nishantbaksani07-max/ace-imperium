'use client'

/**
 * Peak module state + persistence (BUILD14 — localStorage).
 *
 * Follows the same shape as the finance and water modules: one namespaced
 * blob (`vitality_peak_v1`) holds today's substance logs, subjective taps,
 * and profile. WHOOP signals are pulled separately from
 * `wearable_data` via server props — they're truth-of-the-world signals,
 * not user-owned state we want to dual-write.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  DayTask,
  HardestTask,
  ManualVitals,
  PeakState,
  Profile,
  ScheduledEvent,
  SubstanceLog,
  SubjectiveTap,
  TaskDifficulty,
  WhoopSignal,
} from './types'
import { sleepHoursFromSession } from '@/lib/vitals/manualScore'
import { SUBSTANCES, QUICK_LOG_KEYS } from './substances'
import { getLocalDateKey } from '@/lib/dates'
import { mirrorPeakToSupabase } from './sync'

export const STORAGE_KEY = 'vitality_peak_v1'

const DEFAULT_STATE: PeakState = {
  version: 1,
  profile: { weightKg: 75, tolerance: 5 },
  substances: [],
  taps: [],
  events: [],
  hardestTask: null,
  tasks: [],
  manual: {},
  sleepSession: null,
}

const DEFAULT_ASLEEP_OFFSET_MIN = 10

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

function genId(prefix = 'p'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function load(): PeakState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<PeakState>
    return { ...DEFAULT_STATE, ...parsed }
  } catch {
    return DEFAULT_STATE
  }
}

function save(state: PeakState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* storage full / blocked */
  }
}

export interface PeakActions {
  /** Quick-log a substance at the current time using its default dose. */
  logSubstance: (key: string, dose?: number) => void
  removeSubstance: (id: string) => void
  /** Pin a substance to the quick-log hot bar (no-op if already pinned). */
  pinSubstance: (key: string) => void
  /** Remove a substance from the quick-log hot bar. */
  unpinSubstance: (key: string) => void
  setProfile: (patch: Partial<Profile>) => void
  /** Subjective dial: -100 (foggy) to +100 (peak). */
  tap: (value: number) => void
  /** Patch today's manual self-report (sleep/feel/exertion/hrv/rhr…). */
  setManual: (patch: Partial<Omit<ManualVitals, 'updatedAt'>>) => void
  /** "Going to bed" — open a sleep session at the current time. */
  startSleep: () => void
  /** "Woke up" — close the open session, compute the duration, and write
   *  bedAt/wakeAt/asleepOffsetMin/sleepHours into the wake day's manual record. */
  wakeUp: () => void
  /** Discard the open session without recording anything. */
  cancelSleep: () => void

  // Schedule
  addEvent: (input: Omit<ScheduledEvent, 'id' | 'createdAt' | 'skippedDates'> & { skippedDates?: string[] }) => void
  updateEvent: (id: string, patch: Partial<Omit<ScheduledEvent, 'id' | 'createdAt'>>) => void
  deleteEvent: (id: string) => void
  /** Mark a recurring event as skipped on a specific YYYY-MM-DD. */
  skipEventOnDate: (id: string, dateKey: string) => void
  /** Undo a skip. */
  unskipEventOnDate: (id: string, dateKey: string) => void

  // Hardest task (legacy)
  setHardestTask: (title: string, durationHours?: number) => void
  clearHardestTask: () => void

  // Day tasks (BUILD19)
  addTask: (title: string, difficulty: TaskDifficulty, durationHours?: number) => void
  removeTask: (id: string) => void
  clearAllTasks: () => void

  /** Mark today's "Start my day" flow done (or skipped) — closes the morning
   *  gate until the next local day (BUILD71). */
  markDayPlanned: () => void
}

export interface UsePeak {
  ready: boolean
  state: PeakState
  whoop: WhoopSignal
  actions: PeakActions
}

export function usePeakState(
  initialWhoop?: WhoopSignal,
  initialState?: Partial<PeakState> | null,
): UsePeak {
  // The DB-loaded state (peak_state mirror) is the cross-device source of truth
  // when it carries real data — seed straight from it so logs render without a
  // flash (SSR-safe: no localStorage in this initializer). Otherwise start from
  // DEFAULT_STATE and let the mount effect fall back to this browser's cache.
  const srv = initialState as Record<string, unknown> | null | undefined
  const srvLen = (k: string) => (Array.isArray(srv?.[k]) ? (srv![k] as unknown[]).length : 0)
  const serverHasData = !!srv && (srvLen('substances') > 0 || srvLen('taps') > 0 || srvLen('quickKeys') > 0)

  const [state, setState] = useState<PeakState>(() =>
    serverHasData ? { ...DEFAULT_STATE, ...initialState } : DEFAULT_STATE,
  )
  const [ready, setReady] = useState(false)
  const whoop = initialWhoop ?? EMPTY_WHOOP

  useEffect(() => {
    // Server data already seeded above; only reach for this browser's
    // localStorage when the DB had nothing for the user (offline / first run).
    if (!serverHasData) setState(load())
    setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hasHydrated = useRef(false)
  useEffect(() => {
    if (!ready) return
    if (!hasHydrated.current) {
      hasHydrated.current = true
      return
    }
    save(state)
  }, [state, ready])

  // Mirror to Supabase (durable + MCP-readable). Debounced + best-effort;
  // localStorage above stays the primary client store. See ./sync.ts.
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => { void mirrorPeakToSupabase(state) }, 1200)
    return () => clearTimeout(t)
  }, [state, ready])

  const logSubstance = useCallback((key: string, dose?: number) => {
    const def = SUBSTANCES[key]
    if (!def) return
    setState(s => ({
      ...s,
      substances: [
        ...s.substances,
        {
          id: genId('sub'),
          key,
          takenAt: Date.now(),
          dose: dose ?? def.defaultDose,
          tolerance: s.profile.tolerance,
        } satisfies SubstanceLog,
      ],
    }))
  }, [])

  const removeSubstance = useCallback((id: string) => {
    setState(s => ({ ...s, substances: s.substances.filter(x => x.id !== id) }))
  }, [])

  const pinSubstance = useCallback((key: string) => {
    if (!SUBSTANCES[key]) return
    setState(s => {
      const cur = s.quickKeys ?? QUICK_LOG_KEYS
      if (cur.includes(key)) return s
      return { ...s, quickKeys: [...cur, key] }
    })
  }, [])

  const unpinSubstance = useCallback((key: string) => {
    setState(s => ({ ...s, quickKeys: (s.quickKeys ?? QUICK_LOG_KEYS).filter(k => k !== key) }))
  }, [])

  const setProfile = useCallback((patch: Partial<Profile>) => {
    setState(s => ({ ...s, profile: { ...s.profile, ...patch } }))
  }, [])

  const tap = useCallback((value: number) => {
    const v = Math.max(-100, Math.min(100, value))
    setState(s => ({
      ...s,
      taps: [...s.taps, { id: genId('tap'), value: v, time: Date.now() } satisfies SubjectiveTap],
    }))
  }, [])

  const setManual = useCallback<PeakActions['setManual']>(patch => {
    const key = getLocalDateKey()
    setState(s => {
      const prev = s.manual?.[key] ?? {}
      return {
        ...s,
        manual: { ...s.manual, [key]: { ...prev, ...patch, updatedAt: Date.now() } },
      }
    })
  }, [])

  const startSleep = useCallback<PeakActions['startSleep']>(() => {
    setState(s => ({
      ...s,
      sleepSession: { bedAt: Date.now(), asleepOffsetMin: DEFAULT_ASLEEP_OFFSET_MIN },
    }))
  }, [])

  const wakeUp = useCallback<PeakActions['wakeUp']>(() => {
    const key = getLocalDateKey()
    const wakeAt = Date.now()
    setState(s => {
      const session = s.sleepSession
      if (!session) return s
      const hours = sleepHoursFromSession(session.bedAt, wakeAt, session.asleepOffsetMin)
      const prev = s.manual?.[key] ?? {}
      return {
        ...s,
        sleepSession: null,
        manual: {
          ...s.manual,
          [key]: {
            ...prev,
            bedAt: session.bedAt,
            wakeAt,
            asleepOffsetMin: session.asleepOffsetMin,
            ...(hours != null ? { sleepHours: hours } : {}),
            updatedAt: Date.now(),
          },
        },
      }
    })
  }, [])

  const cancelSleep = useCallback<PeakActions['cancelSleep']>(() => {
    setState(s => ({ ...s, sleepSession: null }))
  }, [])

  const addEvent = useCallback<PeakActions['addEvent']>(input => {
    setState(s => ({
      ...s,
      events: [
        ...s.events,
        {
          ...input,
          id: genId('evt'),
          createdAt: Date.now(),
          skippedDates: input.skippedDates ?? [],
        } satisfies ScheduledEvent,
      ],
    }))
  }, [])

  const updateEvent = useCallback<PeakActions['updateEvent']>((id, patch) => {
    setState(s => ({
      ...s,
      events: s.events.map(e => (e.id === id ? { ...e, ...patch } : e)),
    }))
  }, [])

  const deleteEvent = useCallback<PeakActions['deleteEvent']>(id => {
    setState(s => ({ ...s, events: s.events.filter(e => e.id !== id) }))
  }, [])

  const skipEventOnDate = useCallback<PeakActions['skipEventOnDate']>((id, dateKey) => {
    setState(s => ({
      ...s,
      events: s.events.map(e =>
        e.id === id && !e.skippedDates.includes(dateKey)
          ? { ...e, skippedDates: [...e.skippedDates, dateKey] }
          : e,
      ),
    }))
  }, [])

  const unskipEventOnDate = useCallback<PeakActions['unskipEventOnDate']>((id, dateKey) => {
    setState(s => ({
      ...s,
      events: s.events.map(e =>
        e.id === id ? { ...e, skippedDates: e.skippedDates.filter(d => d !== dateKey) } : e,
      ),
    }))
  }, [])

  const setHardestTask = useCallback<PeakActions['setHardestTask']>((title, durationHours = 1.5) => {
    const trimmed = title.trim()
    if (!trimmed) return
    const now = new Date()
    const setOn = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    setState(s => ({
      ...s,
      hardestTask: { title: trimmed, setOn, durationHours } satisfies HardestTask,
    }))
  }, [])

  const clearHardestTask = useCallback<PeakActions['clearHardestTask']>(() => {
    setState(s => ({ ...s, hardestTask: null }))
  }, [])

  const addTask = useCallback<PeakActions['addTask']>((title, difficulty, durationHours = 1.5) => {
    const trimmed = title.trim()
    if (!trimmed) return
    const now = new Date()
    const setOn = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    setState(s => ({
      ...s,
      tasks: [
        ...s.tasks,
        {
          id: genId('task'),
          title: trimmed,
          difficulty,
          durationHours,
          setOn,
        } satisfies DayTask,
      ],
    }))
  }, [])

  const removeTask = useCallback<PeakActions['removeTask']>(id => {
    setState(s => ({ ...s, tasks: s.tasks.filter(t => t.id !== id) }))
  }, [])

  const clearAllTasks = useCallback<PeakActions['clearAllTasks']>(() => {
    setState(s => ({ ...s, tasks: [] }))
  }, [])

  const markDayPlanned = useCallback<PeakActions['markDayPlanned']>(() => {
    setState(s => ({ ...s, lastPlannedDate: getLocalDateKey() }))
  }, [])

  const actions: PeakActions = useMemo(
    () => ({
      logSubstance,
      removeSubstance,
      pinSubstance,
      unpinSubstance,
      setProfile,
      tap,
      setManual,
      startSleep,
      wakeUp,
      cancelSleep,
      addEvent,
      updateEvent,
      deleteEvent,
      skipEventOnDate,
      unskipEventOnDate,
      setHardestTask,
      clearHardestTask,
      addTask,
      removeTask,
      clearAllTasks,
      markDayPlanned,
    }),
    [
      logSubstance,
      removeSubstance,
      pinSubstance,
      unpinSubstance,
      setProfile,
      tap,
      setManual,
      startSleep,
      wakeUp,
      cancelSleep,
      addEvent,
      updateEvent,
      deleteEvent,
      skipEventOnDate,
      unskipEventOnDate,
      setHardestTask,
      clearHardestTask,
      addTask,
      removeTask,
      clearAllTasks,
      markDayPlanned,
    ],
  )

  return { ready, state, whoop, actions }
}

/** Read today's substance logs filtered to local day. */
export function todayLogs(state: PeakState): SubstanceLog[] {
  const d = new Date()
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const end = start + 86_400_000
  return state.substances.filter(s => s.takenAt >= start && s.takenAt < end)
}

/** Read today's manual self-report (null if nothing entered yet today). */
export function todayManual(state: PeakState): ManualVitals | null {
  return state.manual?.[getLocalDateKey()] ?? null
}

/** True when today's manual report has at least one field filled. */
export function hasManualToday(m: ManualVitals | null): boolean {
  return (
    !!m &&
    (m.sleepHours != null ||
      m.sleepQuality != null ||
      m.feel != null ||
      m.exertion != null ||
      m.hrv != null ||
      m.rhr != null ||
      // legacy BUILD62 fields, still counted for old localStorage rows
      m.energy != null ||
      m.stress != null ||
      m.soreness != null)
  )
}
