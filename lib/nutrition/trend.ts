import type { Macros, Meal } from './types'
import { addMacros, ZERO_MACROS } from './macros'

export type WeightPoint = { dayKey: string; kg: number }

const daysBetween = (a: string, b: string) => {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.abs((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000)
}

// latest weight minus the entry closest to `daysAgo` before `todayKey`.
export function weightDelta(weights: WeightPoint[], todayKey: string, daysAgo: number): number | null {
  if (!weights || weights.length < 2) return null
  const sorted = [...weights].sort((a, b) => b.dayKey.localeCompare(a.dayKey))
  const latest = sorted[0]
  let closest = sorted[1]
  let best = Infinity
  for (const w of sorted.slice(1)) {
    const d = Math.abs(daysBetween(latest.dayKey, w.dayKey) - daysAgo)
    if (d < best) { best = d; closest = w }
  }
  return latest.kg - closest.kg
}

export function dayTotals(meals: Meal[], dayKey: string): Macros {
  return meals.filter((m) => m.dayKey === dayKey).reduce((acc, m) => addMacros(acc, m.totals), { ...ZERO_MACROS })
}
