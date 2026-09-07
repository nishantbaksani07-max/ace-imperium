'use client'

// Dev lab: mounts the REAL Fuel CoachSection with mock data so the goal-aware
// coach can be eyeballed without auth or a logged day. Not linked anywhere.
// Mirrors the /maintenance-lab pattern.

import CoachSection from '@/app/app/fuel/CoachSection'
import { getLocalDayKey } from '@/lib/nutrition/dayKey'
import type { Meal, MealFood, MealType, Macros } from '@/lib/nutrition/types'

function food(name: string, grams: number, macros: Macros): MealFood {
  return { id: null, name, grams, macros, hintUsed: null, usdaDescription: '' }
}

function meal(id: string, dayKey: string, mealType: MealType, whatISee: string, foods: MealFood[]): Meal {
  const totals = foods.reduce(
    (a, f) => ({ kcal: a.kcal + f.macros.kcal, protein: a.protein + f.macros.protein, carbs: a.carbs + f.macros.carbs, fat: a.fat + f.macros.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 } as Macros,
  )
  return {
    id,
    dayKey,
    loggedAt: `${dayKey}T12:00:00.000Z`,
    state: 'confident',
    whatISee,
    mealType,
    totals,
    foods,
    unmatched: [],
    clarifyingQuestions: [],
    thumbnail: null,
  }
}

export default function CoachLab() {
  const dk = getLocalDayKey()

  // BUILD day, training day, latest meal carb-forward -> the +1 question fires.
  const buildMeals: Meal[] = [
    meal('b1', dk, 'breakfast', 'eggs and oats', [
      food('eggs', 150, { kcal: 220, protein: 19, carbs: 2, fat: 15 }),
      food('oats', 80, { kcal: 300, protein: 10, carbs: 54, fat: 6 }),
    ]),
    meal('b2', dk, 'lunch', 'chicken and rice bowl', [
      food('grilled chicken', 200, { kcal: 330, protein: 60, carbs: 0, fat: 8 }),
      food('white rice', 250, { kcal: 320, protein: 6, carbs: 70, fat: 1 }),
      food('broccoli', 120, { kcal: 40, protein: 3, carbs: 8, fat: 0 }),
    ]),
  ]

  // LOSE day, training day, latest meal fat-heavy + carb-light -> the -1 question.
  const loseMeals: Meal[] = [
    meal('l1', dk, 'breakfast', 'greek yogurt', [
      food('greek yogurt', 200, { kcal: 130, protein: 20, carbs: 8, fat: 2 }),
    ]),
    meal('l2', dk, 'lunch', 'dining hall mac and cheese', [
      food('mac and cheese', 400, { kcal: 800, protein: 24, carbs: 70, fat: 46 }),
    ]),
  ]

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '48px 20px 140px', display: 'flex', flexDirection: 'column', gap: 48 }}>
      <div style={{ fontFamily: 'monospace', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)' }}>
        coach lab · build / get stronger · training day
      </div>
      <CoachSection proteinTarget={180} kcalTarget={3000} foodStoryDone goalMode="build" isTrainingDayToday meals={buildMeals} />

      <div style={{ fontFamily: 'monospace', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)' }}>
        coach lab · lose weight · training day · dining hall before the gym
      </div>
      <CoachSection proteinTarget={160} kcalTarget={1900} foodStoryDone goalMode="lose" isTrainingDayToday meals={loseMeals} />
    </main>
  )
}
