'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { mirrorGoalsToSupabase } from './sync'
import type {
  DayLog,
  Difficulty,
  Goal,
  GoalKind,
  GoalsPersistedState,
  StreakState,
} from './types'

const LS_KEY = 'vitality_goals_v1'

const DEFAULT_STREAK: StreakState = {
  current: 0,
  longest: 0,
  lastExtendedDate: null,
  freezes: 0,
  freezesUsed: 0,
}

const DEFAULT_STATE: GoalsPersistedState = {
  goals: [],
  streak: DEFAULT_STREAK,
  dayLogs: [],
  tomorrow: [],
}

/** YYYY-MM-DD in local time (NOT toISOString — that's UTC and rolls over wrong). */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function uid(): string {
  return Math.random().toString(36).slice(2, 11)
}

function read(): GoalsPersistedState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<GoalsPersistedState>
    return {
      goals: Array.isArray(parsed.goals) ? parsed.goals : [],
      streak: parsed.streak ? { ...DEFAULT_STREAK, ...parsed.streak } : DEFAULT_STREAK,
      dayLogs: Array.isArray(parsed.dayLogs) ? parsed.dayLogs : [],
      tomorrow: Array.isArray(parsed.tomorrow) ? parsed.tomorrow : [],
    }
  } catch {
    return DEFAULT_STATE
  }
}

function write(state: GoalsPersistedState): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state))
  } catch {}
}

/**
 * Strict Duolingo streak rule:
 *   - "Successful day" = at least one required goal today AND all of
 *     today's due/habit goals are completed.
 *   - When a new successful day rolls in and the previous successful
 *     day was yesterday → streak += 1.
 *   - When previous successful day was further back AND no freeze
 *     covers the gap → streak resets to 1 (today still counts).
 *   - Freezes auto-consume to bridge exactly one missed day at a time.
 *   - Every 7th successful day grants +1 freeze (max 3 banked).
 */
function rollStreak(prev: StreakState, todayKey: string, logs: DayLog[]): StreakState {
  // No-op if we already extended today.
  if (prev.lastExtendedDate === todayKey) return prev

  // Earliest meaningful question: how many days ago was the last extension?
  const last = prev.lastExtendedDate
  if (!last) {
    // First successful day ever.
    const current = 1
    return {
      ...prev,
      current,
      longest: Math.max(prev.longest, current),
      lastExtendedDate: todayKey,
    }
  }

  const lastDate = new Date(last)
  const today = new Date(todayKey)
  const dayMs = 86_400_000
  const gap = Math.round((today.getTime() - lastDate.getTime()) / dayMs)

  if (gap === 1) {
    // Standard increment.
    const current = prev.current + 1
    let freezes = prev.freezes
    if (current % 7 === 0) freezes = Math.min(3, freezes + 1)
    return {
      ...prev,
      current,
      longest: Math.max(prev.longest, current),
      lastExtendedDate: todayKey,
      freezes,
    }
  }

  if (gap === 2 && prev.freezes > 0) {
    // Use a freeze to bridge a single missed day.
    const current = prev.current + 1
    let freezes = prev.freezes - 1
    if (current % 7 === 0) freezes = Math.min(3, freezes + 1)
    return {
      ...prev,
      current,
      longest: Math.max(prev.longest, current),
      lastExtendedDate: todayKey,
      freezes,
      freezesUsed: prev.freezesUsed + 1,
    }
  }

  // Streak broke. Today resets to 1.
  return {
    ...prev,
    current: 1,
    longest: Math.max(prev.longest, 1),
    lastExtendedDate: todayKey,
  }
}

/**
 * Append a goal from outside the goals module (e.g. mentor "quick jot").
 * Writes straight to localStorage so the goals page picks it up on its next
 * mount — we don't have a shared React store. No-op on the server.
 */
export function appendGoalToLocalStorage(
  title: string,
  opts?: { difficulty?: Difficulty; source?: Goal['source'] }
): boolean {
  if (typeof window === 'undefined') return false
  const t = title.trim()
  if (!t) return false
  const state = read()
  const goal: Goal = {
    id: uid(),
    title: t,
    kind: 'task',
    dueDate: localDateKey(),
    difficulty: opts?.difficulty ?? null,
    estimatedMinutes: null,
    suggestedStartHour: null,
    parentId: null,
    whenCue: null,
    source: opts?.source ?? null,
    createdTs: Date.now(),
    completedTs: null,
    lastPushedTs: null,
    pushCount: 0,
    status: 'open',
  }
  write({ ...state, goals: [...state.goals, goal] })
  return true
}

export interface GoalsActions {
  addGoal: (input: {
    title: string
    kind?: GoalKind
    difficulty?: Difficulty
    estimatedMinutes?: number | null
    suggestedStartHour?: number | null
    dueDate?: string | null
    parentId?: string | null
    whenCue?: string | null
    source?: Goal['source']
  }) => void
  completeGoal: (id: string) => void
  uncompleteGoal: (id: string) => void
  pushToTomorrow: (id: string) => void
  deleteGoal: (id: string) => void
  addTomorrow: (title: string) => void
  promoteTomorrow: () => void  // called automatically at 6am roll
}

export function useGoalsState() {
  const [state, setState] = useState<GoalsPersistedState>(DEFAULT_STATE)
  const [ready, setReady] = useState(false)

  // Hydrate from localStorage + run the daily-roll housekeeping (promote
  // yesterday's "tomorrow" queue into today, evaluate streak for yesterday).
  useEffect(() => {
    const loaded = read()
    const todayKey = localDateKey()

    // Promote tomorrow queue if at least one calendar day has passed since
    // it was created. We don't enforce the 6am clock here — keep it simple:
    // if it's a new day, the planned items become today's open goals.
    const lastLogDate = loaded.dayLogs[loaded.dayLogs.length - 1]?.date ?? null
    if (loaded.tomorrow.length > 0 && lastLogDate !== todayKey) {
      const promoted = loaded.tomorrow.map(g => ({ ...g, dueDate: todayKey }))
      loaded.goals.push(...promoted)
      loaded.tomorrow = []
    }

    setState(loaded)
    setReady(true)
  }, [])

  // Persist on every change once we've hydrated.
  useEffect(() => {
    if (!ready) return
    write(state)
  }, [state, ready])

  // Mirror to Supabase (durable + MCP-readable). Debounced + best-effort;
  // localStorage above stays the primary client store. See ./sync.ts.
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => { void mirrorGoalsToSupabase(state) }, 800)
    return () => clearTimeout(t)
  }, [state, ready])

  // ----- Today's slice (derived) -----
  const todayKey = localDateKey()
  const todayGoals = useMemo(() => {
    return state.goals
      .filter(g => g.status !== 'archived')
      .filter(g => {
        // Habits always appear today.
        if (g.kind === 'habit') return true
        // Tasks/milestones appear if due today or before (overdue stays visible).
        if (g.dueDate && g.dueDate <= todayKey) return true
        return false
      })
  }, [state.goals, todayKey])

  const requiredCount = todayGoals.length
  const completedCount = todayGoals.filter(g => g.status === 'completed').length
  const allDone = requiredCount > 0 && completedCount === requiredCount

  // When the user completes the final required goal of the day, roll the streak.
  useEffect(() => {
    if (!ready) return
    if (!allDone) return
    if (state.streak.lastExtendedDate === todayKey) return

    setState(prev => {
      const nextStreak = rollStreak(prev.streak, todayKey, prev.dayLogs)
      const log: DayLog = {
        date: todayKey,
        requiredCount,
        completedCount,
        successful: true,
        freezeUsed: false,
      }
      // Replace or append today's log.
      const dayLogs = prev.dayLogs.filter(l => l.date !== todayKey).concat(log)
      return { ...prev, streak: nextStreak, dayLogs }
    })
  }, [allDone, ready, todayKey, requiredCount, completedCount, state.streak.lastExtendedDate])

  // ----- Actions -----
  const actions: GoalsActions = {
    addGoal: useCallback((input) => {
      const goal: Goal = {
        id: uid(),
        title: input.title.trim(),
        kind: input.kind ?? 'task',
        dueDate: input.dueDate ?? localDateKey(),
        difficulty: input.difficulty ?? null,
        estimatedMinutes: input.estimatedMinutes ?? null,
        suggestedStartHour: input.suggestedStartHour ?? null,
        parentId: input.parentId ?? null,
        whenCue: input.whenCue ?? null,
        source: input.source ?? null,
        createdTs: Date.now(),
        completedTs: null,
        lastPushedTs: null,
        pushCount: 0,
        status: 'open',
      }
      if (!goal.title) return
      setState(prev => ({ ...prev, goals: [...prev.goals, goal] }))
    }, []),

    completeGoal: useCallback((id) => {
      setState(prev => ({
        ...prev,
        goals: prev.goals.map(g =>
          g.id === id ? { ...g, status: 'completed', completedTs: Date.now() } : g
        ),
      }))
    }, []),

    uncompleteGoal: useCallback((id) => {
      setState(prev => ({
        ...prev,
        goals: prev.goals.map(g =>
          g.id === id ? { ...g, status: 'open', completedTs: null } : g
        ),
      }))
    }, []),

    pushToTomorrow: useCallback((id) => {
      const tomorrowKey = localDateKey(new Date(Date.now() + 86_400_000))
      setState(prev => ({
        ...prev,
        goals: prev.goals.map(g =>
          g.id === id
            ? { ...g, dueDate: tomorrowKey, lastPushedTs: Date.now(), pushCount: g.pushCount + 1 }
            : g
        ),
      }))
    }, []),

    deleteGoal: useCallback((id) => {
      setState(prev => ({ ...prev, goals: prev.goals.filter(g => g.id !== id) }))
    }, []),

    addTomorrow: useCallback((title) => {
      const t = title.trim()
      if (!t) return
      const tomorrowKey = localDateKey(new Date(Date.now() + 86_400_000))
      const goal: Goal = {
        id: uid(),
        title: t,
        kind: 'task',
        dueDate: tomorrowKey,
        difficulty: null,
        estimatedMinutes: null,
        suggestedStartHour: null,
        parentId: null,
        whenCue: null,
        source: null,
        createdTs: Date.now(),
        completedTs: null,
        lastPushedTs: null,
        pushCount: 0,
        status: 'open',
      }
      setState(prev => ({ ...prev, tomorrow: [...prev.tomorrow, goal] }))
    }, []),

    promoteTomorrow: useCallback(() => {
      const todayKey = localDateKey()
      setState(prev => {
        if (!prev.tomorrow.length) return prev
        const promoted = prev.tomorrow.map(g => ({ ...g, dueDate: todayKey }))
        return { ...prev, goals: [...prev.goals, ...promoted], tomorrow: [] }
      })
    }, []),
  }

  return {
    ready,
    state,
    actions,
    todayGoals,
    requiredCount,
    completedCount,
    allDone,
    todayKey,
  }
}
