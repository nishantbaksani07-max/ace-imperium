'use client'

import { useEffect, useState } from 'react'
import { getLocalDateKey } from '@/lib/dates'

// The one water tracker (/app/fuel/water) persists here.
const WATER_LS_KEY = 'vitality_water_v1'

/**
 * Today's water-serving count, read from the single water tracker's
 * localStorage. Read-only bridge — Peak never writes water, it reflects what
 * Fuel logged. Mirrors useWaterSnapshot in the supplements module.
 *
 * Returns 0 until localStorage hydrates. Live-updates on cross-tab edits via the
 * `storage` event; same-tab edits are picked up on remount (you navigate to
 * Fuel to log, then back to Peak).
 */
function readTodayWaterCount(): number {
  try {
    const raw = localStorage.getItem(WATER_LS_KEY)
    if (!raw) return 0
    const parsed = JSON.parse(raw) as { logs?: Record<string, number> }
    const logs = parsed.logs
    if (!logs || typeof logs !== 'object') return 0
    const n = logs[getLocalDateKey()]
    return typeof n === 'number' && n > 0 ? n : 0
  } catch {
    return 0
  }
}

export function useTodayWaterCount(): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    setCount(readTodayWaterCount())
    function onStorage(e: StorageEvent) {
      if (e.key === WATER_LS_KEY) setCount(readTodayWaterCount())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return count
}
