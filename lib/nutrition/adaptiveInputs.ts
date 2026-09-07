// Shape the rows the Fuel server already loads into the adaptive engine's input
// arrays. Weights are one-per-day (unique per user/date); meals are many-per-day
// and get summed into a daily calorie total.

import type { DailyKcal, WeighIn } from './adaptive'

export function toWeighIns(weights: { dayKey: string; kg: number }[]): WeighIn[] {
  return weights.map((w) => ({ date: w.dayKey, weightKg: w.kg }))
}

export function toDailyKcal(meals: { dayKey: string; totals: { kcal: number } }[]): DailyKcal[] {
  const byDay = new Map<string, number>()
  for (const m of meals) {
    byDay.set(m.dayKey, (byDay.get(m.dayKey) ?? 0) + (m.totals?.kcal || 0))
  }
  return Array.from(byDay.entries()).map(([dayKey, kcal]) => ({ dayKey, kcal: Math.round(kcal) }))
}
