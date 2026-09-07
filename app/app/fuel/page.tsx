import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import type { Units } from '@/lib/supabase/types'
import { getUserPreferences, type NutritionRestriction } from '@/lib/preferences'
import type { DietStyle } from '@/lib/nutrition/dietStyle'
import { collectNutritionQuiz } from '@/lib/coach/collectors'
import Macros from './macros/Macros'
import {
  rowToMeal,
  rowToTemplate,
  rowToGoals,
  rowToWeight,
  DEFAULT_GOALS,
  type MealRow,
  type TemplateRow,
  type GoalsRow,
  type WeightRow,
} from './macros/serialize'
import { toWeighIns, toDailyKcal } from '@/lib/nutrition/adaptiveInputs'
import { deriveGoalMode } from '@/lib/nutrition/goalContext'
import { estimateMaintenance as formulaMaintenance, type ActivityLevel, type Sex as MacroSex } from '@/lib/nutrition/macroCalc'
import { loadOrCreateWeeklyCheckin } from './macros/checkinLoad'
import MaintenanceSection from './macros/MaintenanceSection'
import WeightLogger from './macros/WeightLogger'
import WaterSection from './WaterSection'
import { loadWaterState } from './water/loadWaterState'
import SupplementsSection from './SupplementsSection'
import CoachSection from './CoachSection'
import type { AccountProfile, Sex, WeightUnit } from './water/types'

export const dynamic = 'force-dynamic'

// Mirrors macros/page.tsx — a wide preload window; the client computes the
// real local day keys and filters from this set.
const MEAL_WINDOW_DAYS = 35
const WEIGHT_WINDOW_DAYS = 180

function cutoffKey(daysBack: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - daysBack)
  return d.toISOString().slice(0, 10)
}

// Local calendar date (the training_day table keys by local date, like mentor).
function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function ageFromBirthday(birthday: string | null | undefined): number | null {
  if (!birthday) return null
  const [y, m, d] = birthday.split('-').map(Number)
  if (!y || !m || !d) return null
  const today = new Date()
  let age = today.getFullYear() - y
  const monthDiff = today.getMonth() + 1 - m
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) age -= 1
  return age > 0 && age < 130 ? age : null
}

/**
 * /app/fuel — the Fuel tracker. Macros is the spine; Water and Supplements are
 * folded in as stacked sections (the old hub stub + standalone routes redirect
 * here). One server load: macros data (goals/meals/favorites/weights), the
 * account profile that drives the water target, and the water mirror
 * (read-through: prefs + day logs survive a new phone / cleared cache).
 * Supps day data still lives in localStorage.
 *
 * Note: this does NOT gate on the hydration quiz — the tracker must always
 * render for water. Without a hydration slice the water target just falls back
 * to the body-weight baseline.
 *
 * It does NOT gate on the nutrition food-story quiz. The macro setup quiz is
 * the front door instead (the strong, recently-rebuilt one) — first visit flows
 * straight into it. The food-story quiz is now optional: it lives in the
 * onboarding-tasks checklist and the macro Targets panel, and the coach learns
 * the same context conversationally for anyone who skips it. (We deliberately
 * removed the old hard nutrition gate so people aren't walled off from the
 * macro quiz by a weaker one.)
 */
export default async function FuelPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const mealCutoff = cutoffKey(MEAL_WINDOW_DAYS)
  const weightCutoff = cutoffKey(WEIGHT_WINDOW_DAYS)

  const [goalsRes, mealsRes, scoresRes, templatesRes, weightsRes, profileRes, billingRes, prefs, trainingRes, topGoalRes, waterState] = await Promise.all([
    supabase.from('nutrition_goals').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('nutrition_meals').select('*').gte('day_key', mealCutoff).order('logged_at', { ascending: true }),
    supabase.from('coach_scores').select('day_key, score, reason').gte('day_key', mealCutoff),
    supabase.from('nutrition_templates').select('*').order('created_at', { ascending: false }),
    supabase.from('weights').select('date, weight_kg, created_at').gte('date', weightCutoff).order('date', { ascending: false }),
    supabase.from('user_profile').select('units, birthday, sex, starting_weight_kg, height_cm').eq('user_id', user.id).maybeSingle(),
    supabase.from('profiles').select('tier').eq('id', user.id).maybeSingle(),
    getUserPreferences(supabase, user.id),
    // Training signal for the coach's context questions. One cheap RLS single-row
    // read, null-guarded: a missing table/row simply means "not a training day".
    supabase.from('training_day').select('day_name').eq('user_id', user.id).eq('date', todayKey()).maybeSingle(),
    // The user's TOP active goal from the goals tab / Vee, so the coach grades by
    // the SAME goal ("lose weight" / "get leaner and stronger"). Null-guarded: a
    // missing vitality_goals table degrades to no signal (nutrition goal + rate
    // band still drive the mode). Read-only; never edits Vee-owned code.
    supabase.from('vitality_goals').select('title, clean_title, identity_tag, category').eq('user_id', user.id).eq('status', 'active').order('priority', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    // Water read-through: the durable prefs + day-log mirror, so water survives
    // a new phone / cleared cache (read half of water/sync.ts). Null on no rows.
    loadWaterState(supabase, user.id),
  ])

  // Setup gate: a first-timer is sent to the setup screen so the tracker always
  // opens on a real (or deliberately skipped) plan. This is now SOFTENED (Alex,
  // 2026-07-11): the setup screen offers "skip for now", and saveSkippedSetup
  // flips onboarded=true with the DB default targets + setup_skipped, so a user
  // who does not want the quiz still gets in (untailored). A genuinely
  // untouched account (never finished, never skipped) has onboarded=false and
  // keeps being routed to setup. Every Fuel route funnels through this page
  // (/app/fuel/macros and /app/fuel/water both redirect here), so this single
  // check gates the entire section. The quiz's own cancel/X routes to the
  // dashboard, never into the tracker.
  const macrosReady = !!goalsRes.data?.onboarded
  if (!macrosReady) redirect('/app/fuel/macros/setup')

  const goals = goalsRes.data ? rowToGoals(goalsRes.data as GoalsRow) : { ...DEFAULT_GOALS }
  const meals = ((mealsRes.data as MealRow[]) || []).map(rowToMeal)
  // Coach's saved per-day scores → a {dayKey: {score, reason}} map for History.
  // Empty (and harmless) until the coach_scores table is applied.
  const scoresMap = Object.fromEntries(
    (((scoresRes.data as { day_key: string; score: number | null; reason: string | null }[]) || [])).map((r) => [
      r.day_key,
      { score: r.score ?? null, reason: r.reason ?? '' },
    ]),
  )
  const templates = ((templatesRes.data as TemplateRow[]) || []).map(rowToTemplate)
  const weights = ((weightsRes.data as WeightRow[]) || []).map(rowToWeight)
  const units = ((profileRes.data?.units as Units) || 'metric') as Units
  // Macros AI features (photo analysis, food search, barcode) are open to
  // everyone for now while we decide what is actually Pro. The server routes are
  // ungated to match (requireUser, not requirePro). isPro now just picks the
  // manual-add default tab; leave it on the real tier. To re-gate, swap the
  // routes back to requirePro.
  const isPro = (billingRes.data?.tier as string) === 'pro'

  // Weekly adaptive check-in: compute from real logged data and persist a pending
  // audit row (migration-safe; no-ops if the table is absent). Threaded to the
  // Maintenance tile.
  const adaptiveWeighIns = toWeighIns(weights)
  const adaptiveDailyKcal = toDailyKcal(meals)
  const {
    checkin: adaptiveCheckin,
    weekStart: checkinWeekStart,
    decision: checkinDecision,
  } = await loadOrCreateWeeklyCheckin(supabase, user.id, goals, adaptiveWeighIns, adaptiveDailyKcal)
  const feelFirst = (prefs.nutrition as { approach?: string } | null)?.approach === 'feel_first'

  // Formula-based starting maintenance (Mifflin/Katch x activity) so the
  // calibrating tile shows a real number on day 1, sharpening as real data lands.
  const ACT: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'high']
  const lifestyle = (ACT.includes(goals.activity as ActivityLevel) ? goals.activity : 'moderate') as ActivityLevel
  const startingMaintenanceKcal = formulaMaintenance(
    (profileRes.data?.sex === 'F' ? 'F' : 'M') as MacroSex,
    ageFromBirthday(profileRes.data?.birthday) ?? 30,
    Number(profileRes.data?.height_cm) || 175,
    weights[0]?.kg || profileRes.data?.starting_weight_kg || 75,
    lifestyle,
    goals.trainingDays ?? 3,
    'moderate',
  )

  const waterProfile: AccountProfile = {
    weightKg: profileRes.data?.starting_weight_kg || 75,
    age: ageFromBirthday(profileRes.data?.birthday) ?? 25,
    sex: (profileRes.data?.sex === 'F' ? 'f' : 'm') as Sex,
    weightUnit: (profileRes.data?.units === 'imperial' ? 'lb' : 'kg') as WeightUnit,
  }

  // The food-story quiz is what turns the coach on. Done = the coach has real
  // personalization context (same signal the coach itself uses).
  const foodStoryDone = !!collectNutritionQuiz(prefs.nutrition)

  // Goal mode tunes how the coach grades the day (lose weights calories heaviest,
  // build weights protein, balanced is the default). Derived from data already
  // loaded: goal_outcome (surfaced as goals.approach) + the signed rate band.
  const bandMid = (goals.goalBand.lowKgPerWeek + goals.goalBand.highKgPerWeek) / 2
  const topGoal = topGoalRes.data as { title?: string | null; clean_title?: string | null; identity_tag?: string | null; category?: string | null } | null
  const goalMode = deriveGoalMode({
    goalOutcome: goals.approach,
    bandMidKgPerWeek: bandMid,
    bigGoal: topGoal ? { title: topGoal.title, cleanTitle: topGoal.clean_title, identityTag: topGoal.identity_tag, category: topGoal.category } : null,
  })
  // A training day enables the coach's context questions (preworkout fuel).
  const isTrainingDayToday = !!(trainingRes.data as { day_name?: string | null } | null)?.day_name

  return (
    <Macros
      initialGoals={goals}
      initialMeals={meals}
      initialScores={scoresMap}
      initialTemplates={templates}
      initialWeights={weights}
      units={units}
      isPro={isPro}
      foodStoryDone={foodStoryDone}
      initialCheckin={adaptiveCheckin}
      coachSlot={
        <CoachSection
          proteinTarget={goals.proteinTarget}
          kcalTarget={goals.kcalTarget}
          foodStoryDone={foodStoryDone}
          goalMode={goalMode}
          isTrainingDayToday={isTrainingDayToday}
          meals={meals}
          restrictions={(prefs.nutrition as { restrictions?: NutritionRestriction[] } | null)?.restrictions ?? []}
          dietStyle={((goalsRes.data as { diet_style?: string } | null)?.diet_style as DietStyle) ?? null}
        />
      }
      extraSections={
        <>
          <WeightLogger initialWeights={weights} units={units === 'imperial' ? 'imperial' : 'metric'} />
          <MaintenanceSection
            hideEyebrow
            initialCheckin={adaptiveCheckin}
            band={goals.goalBand}
            adaptiveEnabled={goals.adaptiveEnabled}
            weekStart={checkinWeekStart}
            decision={checkinDecision}
            units={units === 'imperial' ? 'imperial' : 'metric'}
            feelFirst={feelFirst}
            weighIns={adaptiveWeighIns}
            dailyKcal={adaptiveDailyKcal}
            cycleEnabled={goals.cycleEnabled}
            trainingKcal={goals.training?.kcal ?? null}
            restKcal={goals.rest?.kcal ?? null}
            startingMaintenanceKcal={startingMaintenanceKcal}
          />
          <WaterSection profile={waterProfile} initialWater={waterState} />
          <SupplementsSection />
        </>
      }
    />
  )
}
