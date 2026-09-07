'use client'

import { useCallback, useEffect, useState } from 'react'
import { mirrorSupplementsToSupabase } from './sync'
import type {
  LowList,
  StackItem,
  SupplementsState,
  TakenMap,
  ToggleableSlot,
  WindowKey,
} from './types'

const LS_KEY = 'vitality_supplements_v1'

const VALID_WINDOWS: WindowKey[] = ['morning', 'lunch', 'evening', 'bed', 'anytime']
const SLOT_ORDER: ToggleableSlot[] = ['morning', 'lunch', 'evening', 'bed']

const DEFAULT_STATE: SupplementsState = {
  version: 2,
  items: [],
  taken: {},
  low: [],
  slots: [...SLOT_ORDER],
}

/**
 * Day boundary at 06:00 local. An item logged at 1 AM still counts as
 * the previous day's evening dose — matches how people actually think
 * about "last night." Mirrors the standalone health.html behavior.
 */
export function getActiveDateKey(now: Date = new Date()): string {
  const d = new Date(now)
  if (d.getHours() < 6) d.setDate(d.getDate() - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function normalize(parsed: unknown): SupplementsState {
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_STATE, slots: [...SLOT_ORDER] }
  const p = parsed as Partial<SupplementsState>
  // v1 → v2: items gain `conditions`, state gains `slots`. Backfill both so
  // returning users keep their stack and just get the new fields as empty.
  const items: StackItem[] = (Array.isArray(p.items) ? p.items : []).map((raw) => {
    const it = raw as StackItem
    return {
      ...it,
      window: VALID_WINDOWS.includes(it.window) ? it.window : 'anytime',
      conditions: Array.isArray(it.conditions) ? it.conditions : [],
    }
  })
  const slots =
    Array.isArray(p.slots) && p.slots.length
      ? SLOT_ORDER.filter((s) => (p.slots as string[]).includes(s))
      : [...SLOT_ORDER]
  return {
    version: 2,
    items,
    taken: p.taken && typeof p.taken === 'object' ? p.taken : {},
    low: Array.isArray(p.low) ? p.low : [],
    slots,
  }
}

function load(): SupplementsState {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return DEFAULT_STATE
    return normalize(JSON.parse(raw))
  } catch {
    return DEFAULT_STATE
  }
}

export interface SupplementsActions {
  addItem: (
    input: Omit<StackItem, 'id' | 'ordered' | 'conditions'> & { ordered?: boolean; conditions?: string[] },
  ) => void
  removeItem: (id: string) => void
  toggleTaken: (id: string) => void
  toggleLow: (id: string) => void
  /** Move a stack item to a different time block. */
  setWindow: (id: string, window: WindowKey) => void
  /** Add/remove an intake-condition label on a stack item. */
  toggleCondition: (id: string, conditionId: string) => void
  /** Show/hide a time block on the rail. Hiding moves its items to anytime. */
  toggleSlot: (slot: ToggleableSlot) => void
  resetAll: () => void
}

export function useSupplementsState() {
  const [state, setState] = useState<SupplementsState>(DEFAULT_STATE)
  const [ready, setReady] = useState(false)
  // Re-derives the active date key on a 1 min tick so the 6 AM rollover
  // happens without a page refresh.
  const [dateKey, setDateKey] = useState(() => getActiveDateKey())

  useEffect(() => {
    setState(load())
    setReady(true)
    const id = setInterval(() => {
      setDateKey(getActiveDateKey())
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!ready) return
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state))
    } catch {
      // localStorage full or disabled — fail quiet, UI stays functional
    }
  }, [state, ready])

  // Mirror to Supabase (durable + MCP-readable). Debounced + best-effort;
  // localStorage above stays the primary client store. See ./sync.ts.
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => { void mirrorSupplementsToSupabase(state) }, 800)
    return () => clearTimeout(t)
  }, [state, ready])

  const addItem = useCallback(
    (input: Omit<StackItem, 'id' | 'ordered' | 'conditions'> & { ordered?: boolean; conditions?: string[] }) => {
      setState(prev => {
        const id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        const next: StackItem = {
          id,
          name: input.name.trim(),
          icon: input.icon || '💊',
          dose: input.dose.trim(),
          window: input.window,
          note: input.note.trim(),
          sourceId: input.sourceId ?? null,
          conditions: input.conditions ?? [],
          ordered: input.ordered ?? true,
        }
        if (!next.name) return prev
        return { ...prev, items: [...prev.items, next] }
      })
    },
    [],
  )

  const removeItem = useCallback((id: string) => {
    setState(prev => {
      const items = prev.items.filter(i => i.id !== id)
      // Strip from low list + any taken maps so we don't carry orphans.
      const low: LowList = prev.low.filter(x => x !== id)
      const taken = { ...prev.taken }
      for (const k of Object.keys(taken)) {
        if (taken[k][id]) {
          const copy: TakenMap = { ...taken[k] }
          delete copy[id]
          taken[k] = copy
        }
      }
      return { ...prev, items, low, taken }
    })
  }, [])

  const toggleTaken = useCallback((id: string) => {
    const key = getActiveDateKey()
    setState(prev => {
      const day: TakenMap = { ...(prev.taken[key] || {}) }
      if (day[id]) delete day[id]
      else day[id] = Date.now()
      return { ...prev, taken: { ...prev.taken, [key]: day } }
    })
  }, [])

  const toggleLow = useCallback((id: string) => {
    setState(prev => {
      const isLow = prev.low.includes(id)
      return {
        ...prev,
        low: isLow ? prev.low.filter(x => x !== id) : [...prev.low, id],
      }
    })
  }, [])

  const setWindow = useCallback((id: string, window: WindowKey) => {
    setState(prev => ({ ...prev, items: prev.items.map(i => (i.id === id ? { ...i, window } : i)) }))
  }, [])

  const toggleCondition = useCallback((id: string, conditionId: string) => {
    setState(prev => ({
      ...prev,
      items: prev.items.map(i => {
        if (i.id !== id) return i
        const has = i.conditions.includes(conditionId)
        return {
          ...i,
          conditions: has ? i.conditions.filter(c => c !== conditionId) : [...i.conditions, conditionId],
        }
      }),
    }))
  }, [])

  const toggleSlot = useCallback((slot: ToggleableSlot) => {
    setState(prev => {
      if (prev.slots.includes(slot)) {
        // Hiding a block: move its items to 'anytime' so nothing disappears.
        return {
          ...prev,
          slots: prev.slots.filter(s => s !== slot),
          items: prev.items.map(i => (i.window === slot ? { ...i, window: 'anytime' } : i)),
        }
      }
      return { ...prev, slots: SLOT_ORDER.filter(s => s === slot || prev.slots.includes(s)) }
    })
  }, [])

  const resetAll = useCallback(() => setState({ ...DEFAULT_STATE, slots: [...SLOT_ORDER] }), [])

  const todayTaken: TakenMap = state.taken[dateKey] || {}
  const totalCount = state.items.length
  const takenCount = state.items.filter(i => !!todayTaken[i.id]).length

  // Items in past-cutoff windows that haven't been ticked off yet.
  const missed = (() => {
    const now = new Date()
    const hour = now.getHours() + now.getMinutes() / 60
    return state.items.filter(item => {
      const w = WINDOW_CUTOFFS[item.window]
      if (w === null) return false
      if (todayTaken[item.id]) return false
      return hour > w
    })
  })()

  const actions: SupplementsActions = {
    addItem, removeItem, toggleTaken, toggleLow, setWindow, toggleCondition, toggleSlot, resetAll,
  }

  return {
    ready,
    state,
    dateKey,
    todayTaken,
    totalCount,
    takenCount,
    missed,
    actions,
  }
}

// Local cutoff lookup so state.ts doesn't have to import WINDOWS just
// for the hour values (avoids a cycle if supplements.ts ever grows).
const WINDOW_CUTOFFS: Record<WindowKey, number | null> = {
  morning: 10,
  lunch: 14,
  evening: 21,
  bed: null,
  anytime: null,
}
