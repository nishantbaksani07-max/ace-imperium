'use client'

/**
 * Read-only bridges (BUILD62) that pull other modules' day-values into the
 * Peak score, the same way useWaterCount reads the water tracker. Peak never
 * writes these — it reflects what Fuel/Goals logged. Each live-updates on
 * cross-tab edits via the `storage` event and on remount.
 */

import { useEffect, useState } from 'react'
import { getLocalDateKey } from '@/lib/dates'

const SUPP_LS_KEY = 'vitality_supplements_v1'
const GOALS_LS_KEY = 'vitality_goals_v1'

export interface SupplementSignal {
  taken: number
  total: number
}
export interface GoalSignal {
  streak: number
  required: number
  completed: number
}

/** Supplements use a 6am rollover (a 1am dose counts toward yesterday). */
function suppDateKey(): string {
  const d = new Date()
  if (d.getHours() < 6) d.setDate(d.getDate() - 1)
  return getLocalDateKey(d)
}

function readSupplements(): SupplementSignal {
  try {
    const raw = localStorage.getItem(SUPP_LS_KEY)
    if (!raw) return { taken: 0, total: 0 }
    const parsed = JSON.parse(raw) as {
      items?: { id: string }[]
      taken?: Record<string, Record<string, number>>
    }
    const items = parsed.items ?? []
    const total = items.length
    const todayTaken = parsed.taken?.[suppDateKey()] ?? {}
    const taken = items.filter(i => !!todayTaken[i.id]).length
    return { taken, total }
  } catch {
    return { taken: 0, total: 0 }
  }
}

function readGoals(): GoalSignal {
  try {
    const raw = localStorage.getItem(GOALS_LS_KEY)
    if (!raw) return { streak: 0, required: 0, completed: 0 }
    const parsed = JSON.parse(raw) as {
      goals?: { status?: string; kind?: string; dueDate?: string | null }[]
      streak?: { current?: number }
    }
    const todayKey = getLocalDateKey()
    const todays = (parsed.goals ?? [])
      .filter(g => g.status !== 'archived')
      .filter(g => {
        if (g.kind === 'habit') return true
        if (g.dueDate && g.dueDate <= todayKey) return true
        return false
      })
    return {
      streak: parsed.streak?.current ?? 0,
      required: todays.length,
      completed: todays.filter(g => g.status === 'completed').length,
    }
  } catch {
    return { streak: 0, required: 0, completed: 0 }
  }
}

export function useTodaySupplements(): SupplementSignal {
  const [sig, setSig] = useState<SupplementSignal>({ taken: 0, total: 0 })
  useEffect(() => {
    setSig(readSupplements())
    function onStorage(e: StorageEvent) {
      if (e.key === SUPP_LS_KEY) setSig(readSupplements())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return sig
}

export function useTodayGoals(): GoalSignal {
  const [sig, setSig] = useState<GoalSignal>({ streak: 0, required: 0, completed: 0 })
  useEffect(() => {
    setSig(readGoals())
    function onStorage(e: StorageEvent) {
      if (e.key === GOALS_LS_KEY) setSig(readGoals())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return sig
}
