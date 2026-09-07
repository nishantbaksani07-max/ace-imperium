// Gym/rest day-type: which macro target applies on a given day, and how the
// user's per-day choice persists. The macro quiz computes a gym-day and a
// rest-day target; the tracker lets the user tap which kind of day today is.
//
// Persistence is intentionally localStorage (device-local), matching the water
// tracker bridge. A day's type is a lightweight per-day preference, not core
// nutrition data — meals/weights stay in Supabase. Cross-device sync can come
// later if it matters; YAGNI for now.

import type { DayTarget, DayType, NutritionGoals } from './types'

export const DAY_TYPE_KEY = 'vitality_fuel_daytype_v1'

// A fresh, unmarked day defaults to a gym day (the bigger target) — the user
// taps once to drop to a rest day. Decided with Alex: predictable over clever.
export const DEFAULT_DAY_TYPE: DayType = 'gym'

// The single source of truth for "what is today's target." When the plan has a
// real gym/rest cycle, pick the matching set; otherwise everyone (maintenance,
// non-lifters, or any plan missing cycle data) gets the base target — so the
// caller never has to special-case the no-cycle path.
export function targetForDay(goals: NutritionGoals, dayType: DayType): DayTarget {
  if (goals.cycleEnabled && goals.training && goals.rest) {
    return dayType === 'rest' ? goals.rest : goals.training
  }
  return {
    kcal: goals.kcalTarget,
    protein: goals.proteinTarget,
    carbs: goals.carbsTarget ?? 0,
    fat: goals.fatTarget ?? 0,
  }
}

// ─── per-day persistence (localStorage map keyed by dayKey) ───────────────

export type DayTypeMap = Record<string, DayType>

export function loadDayTypeMap(): DayTypeMap {
  try {
    const raw = localStorage.getItem(DAY_TYPE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    // Keep only valid gym/rest entries so a corrupted store can't poison reads.
    const out: DayTypeMap = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v === 'gym' || v === 'rest') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function saveDayTypeMap(map: DayTypeMap): void {
  try {
    localStorage.setItem(DAY_TYPE_KEY, JSON.stringify(map))
  } catch {
    // ignore (private mode / quota) — the in-memory map still drives this session
  }
}

// The day's chosen type, falling back to the default for an unmarked day.
export function dayTypeFor(map: DayTypeMap, dayKey: string): DayType {
  return map[dayKey] ?? DEFAULT_DAY_TYPE
}
