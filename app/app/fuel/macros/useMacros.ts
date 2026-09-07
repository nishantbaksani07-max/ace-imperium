'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  Meal,
  MealTemplate,
  NutritionGoals,
  MealType,
  UsdaCandidate,
  SearchMode,
  DayType,
  DayTarget,
} from '@/lib/nutrition/types'
import {
  targetForDay,
  dayTypeFor,
  loadDayTypeMap,
  saveDayTypeMap,
  type DayTypeMap,
} from '@/lib/nutrition/dayType'
import type { Units } from '@/lib/supabase/types'
import {
  ZERO_MACROS,
  addMacros,
  scaleMacros,
  computeRemaining,
  isClarifyingAnswer,
  getRecentFoods,
  getStreakDays,
  getWeekSummary,
  lookupMacrosForMeal,
  dedupeTemplates,
  templateContentKey,
  type RecentFood,
} from '@/lib/nutrition/macros'
import { getLocalDayKey, getRecentDayKeys } from '@/lib/nutrition/dayKey'
import { parseMealPhoto, macroSearchFn, usdaSearchBest } from '@/lib/nutrition/client'
import { mealFatHint, type FoodSource, type FatLevel } from '@/lib/nutrition/foodSource'
import { rescaleByGrams } from '@/lib/nutrition/portions'
import { resizeAndEncodeImage, makeThumbnail } from './image'
import {
  saveMeal,
  updateMeal,
  deleteMeal,
  saveGoals,
  saveTemplate,
  deleteTemplate,
  saveWeight,
  getMealsForDay,
  saveCorrection,
  type SaveMealInput,
} from './actions'
import type { WeightEntry } from './serialize'
import { buildPhotoMeal } from './build'

export const SKIP_ANSWER = '__skip__'

// The intro "how to log" banner is a one-time tip card, NOT the section wall.
// It gates on this localStorage flag so dismissing it never touches
// nutrition_goals.onboarded — only the quiz summary sets that wall flag.
const TIPS_SEEN_KEY = 'vitality_fuel_tips_seen'

export type StatusTone = 'info' | 'working' | 'error' | 'success'
export interface Status {
  text: string
  tone: StatusTone
  // Optional inline action (e.g. "Undo" on a delete toast).
  action?: { label: string; run: () => void }
}

/** The coach's saved read for a day (out of 10 + one line), shown in History. */
export interface DayScore { score: number | null; reason: string }

export interface MacrosInit {
  initialGoals: NutritionGoals
  initialMeals: Meal[]
  initialTemplates: MealTemplate[]
  initialWeights: WeightEntry[]
  units: Units
  isPro: boolean
  /** Saved coach scores keyed by day (from coach_scores). Empty until that
   *  table exists; History just shows no score pill then. */
  initialScores?: Record<string, DayScore>
}

let tmpSeq = 0
function tempMealId(): string {
  tmpSeq += 1
  return `tmp_${tmpSeq}_${Math.round(performance.now())}`
}

export function useMacros(init: MacrosInit) {
  const [goals, setGoalsState] = useState<NutritionGoals>(init.initialGoals)
  const [meals, setMeals] = useState<Meal[]>(init.initialMeals)
  const [templates, setTemplates] = useState<MealTemplate[]>(init.initialTemplates)
  const [weights, setWeights] = useState<WeightEntry[]>(init.initialWeights)
  // Coach's saved per-day scores for History (read-only here; written by the
  // coach API on /api/coach). Seeded from the server load.
  const [scores] = useState<Record<string, DayScore>>(init.initialScores ?? {})
  const [todayKey, setTodayKey] = useState<string>(() => getLocalDayKey())
  const [currentDayKey, setCurrentDayKey] = useState<string>(() => getLocalDayKey())
  const [selectedMealType, setSelectedMealType] = useState<MealType>('auto')
  const [status, setStatus] = useState<Status | null>(null)
  // Default hidden so returning users never see the tip card flash; reveal it
  // only after hydration confirms a genuine first-timer (flag absent).
  const [tipsSeen, setTipsSeen] = useState(true)
  // Per-day gym/rest mark (localStorage, hydrated on mount). Empty until then,
  // so an unmarked day reads as the default (gym) — no flash of the wrong target.
  const [dayTypeMap, setDayTypeMap] = useState<DayTypeMap>({})
  // How many photos are analyzing in the background right now (non-blocking).
  const [pendingCount, setPendingCount] = useState(0)
  const busy = pendingCount > 0
  // The meal currently being re-scanned on Opus via "Redo scan" (one at a time).
  const [rescanningId, setRescanningId] = useState<string | null>(null)

  // Refs let the day-rollover listener read the latest keys without re-subscribing.
  const todayKeyRef = useRef(todayKey)
  const currentDayKeyRef = useRef(currentDayKey)
  // Guards against a double-tap logging the same meal twice (signature + window).
  const lastCommitRef = useRef<{ sig: string; at: number } | null>(null)
  // Temp ids of pending photo meals the user cancelled mid-analysis.
  const cancelledRef = useRef<Set<string>>(new Set())

  const { units, isPro } = init

  // ─── derived ──────────────────────────────────────────────────────────

  const dayMeals = useMemo(
    () =>
      meals
        .filter((m) => m.dayKey === currentDayKey)
        .sort((a, b) => (a.loggedAt || '').localeCompare(b.loggedAt || '')),
    [meals, currentDayKey]
  )

  const totals = useMemo(
    () => dayMeals.reduce((acc, m) => addMacros(acc, m.totals), { ...ZERO_MACROS }),
    [dayMeals]
  )

  // The gym/rest mark for any day, and the resolved macro target it implies.
  const dayTypeOf = useCallback(
    (dayKey: string): DayType => dayTypeFor(dayTypeMap, dayKey),
    [dayTypeMap]
  )
  const targetForDayKey = useCallback(
    (dayKey: string): DayTarget => targetForDay(goals, dayTypeOf(dayKey)),
    [goals, dayTypeOf]
  )
  const currentDayType = dayTypeOf(currentDayKey)
  // Today's effective target — gym-day or rest-day numbers (or the base when no
  // cycle). Everything the tile/bars show reads from this, never the raw base.
  const currentTarget = useMemo(
    () => targetForDay(goals, currentDayType),
    [goals, currentDayType]
  )

  // Mark the current day as a gym or rest day (persists per day).
  const setDayType = useCallback((type: DayType) => {
    setDayTypeMap((prev) => {
      const next = { ...prev, [currentDayKey]: type }
      saveDayTypeMap(next)
      return next
    })
  }, [currentDayKey])

  const remaining = useMemo(
    () => ({
      kcal: computeRemaining(totals.kcal, currentTarget.kcal),
      protein: computeRemaining(totals.protein, currentTarget.protein),
    }),
    [totals, currentTarget]
  )

  const last7 = useMemo(() => {
    const keys = new Set(getRecentDayKeys(todayKey, 7))
    return meals.filter((m) => keys.has(m.dayKey))
  }, [meals, todayKey])

  const recents: RecentFood[] = useMemo(() => getRecentFoods(last7, 6), [last7])
  const week = useMemo(
    () => getWeekSummary(last7, goals, targetForDayKey),
    [last7, goals, targetForDayKey]
  )
  const streak = useMemo(
    () => getStreakDays(todayKey, (k) => meals.some((m) => m.dayKey === k)),
    [meals, todayKey]
  )

  // What the UI shows for favorites: content-duplicates collapsed to one. The
  // raw `templates` state stays the source of truth (add/remove operate on it);
  // every render surface reads this de-duplicated view.
  const uniqueTemplates = useMemo(() => dedupeTemplates(templates), [templates])

  const latestWeight = weights.length > 0 ? weights[0] : null
  const isToday = currentDayKey === todayKey

  // ─── day rollover ─────────────────────────────────────────────────────────
  // "today" is computed once at mount. A tab left open past the 4am rollover
  // would otherwise keep logging to the wrong day. Re-check on focus/visibility
  // and roll the view forward if the user was sitting on the old "today".
  useEffect(() => { todayKeyRef.current = todayKey }, [todayKey])
  useEffect(() => { currentDayKeyRef.current = currentDayKey }, [currentDayKey])
  // Reveal the intro tip card only for genuine first-timers (flag not yet set).
  useEffect(() => {
    try { if (!localStorage.getItem(TIPS_SEEN_KEY)) setTipsSeen(false) } catch {}
  }, [])
  // Hydrate each day's saved gym/rest mark.
  useEffect(() => { setDayTypeMap(loadDayTypeMap()) }, [])
  useEffect(() => {
    function check() {
      const fresh = getLocalDayKey()
      if (fresh === todayKeyRef.current) return
      const wasViewingToday = currentDayKeyRef.current === todayKeyRef.current
      setTodayKey(fresh)
      if (wasViewingToday) setCurrentDayKey(fresh)
    }
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [])

  // ─── helpers ────────────────────────────────────────────────────────────

  // Optimistically insert a built meal, persist, then swap the temp id for the
  // real one. Rolls back on failure.
  const commitMeal = useCallback(async (input: SaveMealInput, opts?: { dedup?: boolean }): Promise<boolean> => {
    // Drop an accidental double-tap of the same item within a short window.
    // `dedup: false` (used by Undo) bypasses this so a re-log always lands.
    if (opts?.dedup !== false) {
      const firstFood = input.foods && input.foods[0] ? input.foods[0].name : input.whatISee ?? ''
      const sig = `${input.dayKey}|${Math.round(input.totals.kcal)}|${firstFood}`
      const now = performance.now()
      const last = lastCommitRef.current
      if (last && last.sig === sig && now - last.at < 1500) return false
      lastCommitRef.current = { sig, at: now }
    }
    const tempId = tempMealId()
    const optimistic: Meal = { ...(input as Omit<Meal, 'id'>), id: tempId, loggedAt: new Date().toISOString() }
    setMeals((prev) => [...prev, optimistic])
    const res = await saveMeal(input)
    if (!res.ok) {
      setMeals((prev) => prev.filter((m) => m.id !== tempId))
      setStatus({ text: res.error || 'Could not save that meal.', tone: 'error' })
      return false
    }
    setMeals((prev) =>
      prev.map((m) => (m.id === tempId ? { ...m, id: res.data!.id, loggedAt: res.data!.loggedAt } : m))
    )
    return true
  }, [])

  // ─── actions ──────────────────────────────────────────────────────────

  // Remove a pending photo card mid-analysis. The background request keeps
  // running server-side but its result is ignored (the temp id is marked
  // cancelled), so the card never reappears.
  const cancelAnalysis = useCallback((tempId: string) => {
    cancelledRef.current.add(tempId)
    setMeals((prev) => prev.filter((m) => m.id !== tempId))
  }, [])

  // The signature flow, non-blocking: drop an "analyzing" card instantly, run
  // the Claude parse + USDA resolve in the BACKGROUND, then swap the card for
  // the real meal (or remove it on failure/cancel). The UI is never locked, and
  // multiple photos can analyze at once — each is its own pending card.
  const analyzePhoto = useCallback(
    async (file: File, ctx?: { mealType?: MealType; foodSummary?: string; source?: FoodSource; fatLevel?: FatLevel }) => {
      const tempId = tempMealId()
      const dayKey = currentDayKey
      const mealType = ctx?.mealType ?? selectedMealType
      const isCancelled = () => cancelledRef.current.has(tempId)
      const drop = () => setMeals((prev) => prev.filter((m) => m.id !== tempId))
      const clearCancel = () => cancelledRef.current.delete(tempId)

      // Optimistic "analyzing" card, visible immediately. Not persisted.
      const pending: Meal = {
        id: tempId,
        dayKey,
        loggedAt: new Date().toISOString(),
        state: 'confident',
        whatISee: 'Analyzing your photo',
        mealType,
        totals: { ...ZERO_MACROS },
        foods: [],
        unmatched: [],
        clarifyingQuestions: [],
        thumbnail: null,
        source: 'photo',
        pending: true,
      }
      setMeals((prev) => [...prev, pending])
      setSelectedMealType('auto') // the chip prior is captured; reset it now
      setPendingCount((n) => n + 1)
      // Decode the thumbnail once; fill it into the card as soon as it's ready
      // (keeps the card instant) and reuse it for the saved meal below.
      const thumbPromise = makeThumbnail(file).catch(() => null)
      thumbPromise.then((thumb) => {
        if (thumb) setMeals((prev) => prev.map((m) => (m.id === tempId ? { ...m, thumbnail: thumb } : m)))
      })

      try {
        const encoded = await resizeAndEncodeImage(file)
        if (isCancelled()) return
        const hint =
          mealType !== 'auto' ? `User says this is a ${mealType.toUpperCase()}.` : undefined
        const caption = ctx?.foodSummary?.trim() || undefined
        const { parsed, resolved } = await parseMealPhoto(encoded.base64, encoded.mediaType, caption, hint, {
          sourceHint: mealFatHint(ctx?.source, ctx?.fatLevel),
        })
        if (isCancelled()) return

        if (parsed.state === 'bad_photo') {
          drop()
          setStatus({ text: `Bad photo: ${parsed.retake_guidance || 'try again'}`, tone: 'error' })
          return
        }
        const foodCount = (parsed.foods || []).length
        if (parsed.state === 'can_tell' && foodCount === 0) {
          drop()
          setStatus({ text: 'Could not identify the meal. Try a clearer photo or add it manually.', tone: 'error' })
          return
        }

        // Macros are resolved server-side (in parallel) and returned with the
        // parse. Only fall back to a client-side lookup if the server skipped it.
        const lookup = resolved ?? (await lookupMacrosForMeal(parsed, macroSearchFn))
        if (isCancelled()) return
        const thumbnail = await thumbPromise
        const input = buildPhotoMeal(parsed, lookup, thumbnail, dayKey, mealType)

        // Persist, then swap the pending card for the saved meal in place.
        if (isCancelled()) return
        const res = await saveMeal(input)
        if (isCancelled()) { clearCancel(); return }
        if (!res.ok) {
          drop()
          setStatus({ text: res.error || 'Could not save that meal.', tone: 'error' })
          return
        }
        const saved: Meal = { ...(input as Omit<Meal, 'id'>), id: res.data!.id, loggedAt: res.data!.loggedAt }
        setMeals((prev) => prev.map((m) => (m.id === tempId ? saved : m)))
        const kcal = Math.round(lookup.totals.kcal)
        const note = lookup.unmatched.length > 0 ? ` · ${lookup.unmatched.length} to confirm` : ''
        setStatus({ text: `Logged ${kcal} kcal${note}`, tone: 'success' })
      } catch (err) {
        if (!isCancelled()) {
          drop()
          const msg = err instanceof Error ? err.message : String(err)
          setStatus({ text: msg, tone: 'error' })
        }
      } finally {
        clearCancel()
        setPendingCount((n) => Math.max(0, n - 1))
      }
    },
    [currentDayKey, selectedMealType]
  )

  // Generic one-tap log (drink / manual / custom / template / recent). Always
  // logs to the day currently in view.
  const logBuilt = useCallback(
    async (input: SaveMealInput) => {
      const ok = await commitMeal(input)
      if (ok) setStatus({ text: `Logged ${Math.round(input.totals.kcal)} kcal`, tone: 'success' })
      return ok
    },
    [commitMeal]
  )

  const removeMeal = useCallback(async (id: string) => {
    const prev = meals
    const target = meals.find((m) => m.id === id)
    setMeals((cur) => cur.filter((m) => m.id !== id))
    const res = await deleteMeal(id)
    if (!res.ok) {
      setMeals(prev)
      setStatus({ text: res.error || 'Could not delete that meal.', tone: 'error' })
      return
    }
    // Offer a one-tap undo: re-log the deleted meal as a fresh row.
    if (target) {
      const { id: _id, loggedAt: _loggedAt, ...rest } = target
      void _id; void _loggedAt
      setStatus({
        text: 'Meal deleted',
        tone: 'info',
        action: { label: 'Undo', run: () => { void commitMeal(rest, { dedup: false }) } },
      })
    }
  }, [meals, commitMeal])

  const patchMeal = useCallback(async (id: string, patch: Partial<Meal>) => {
    // Capture the pre-patch meal so a failed save can roll back instead of
    // leaving the screen showing an edit that never persisted.
    let prevMeal: Meal | undefined
    setMeals((cur) => cur.map((m) => {
      if (m.id === id) { prevMeal = m; return { ...m, ...patch } }
      return m
    }))
    const res = await updateMeal(id, patch)
    if (!res.ok) {
      if (prevMeal) setMeals((cur) => cur.map((m) => (m.id === id ? prevMeal! : m)))
      setStatus({ text: res.error || 'Could not update that meal. Your change was not saved.', tone: 'error' })
    }
  }, [])

  // "Redo scan": re-run a photo meal on the stronger model (Opus). Reuses the
  // stored thumbnail as the image, then patches the meal in place with the
  // sharper result. Paid only when the user asks for a second opinion.
  const redoScan = useCallback(async (mealId: string) => {
    const meal = meals.find((m) => m.id === mealId)
    if (!meal || !meal.thumbnail) {
      setStatus({ text: 'No photo saved for this meal to re-scan.', tone: 'error' })
      return
    }
    const m = /^data:([^;]+);base64,(.+)$/.exec(meal.thumbnail)
    if (!m) {
      setStatus({ text: 'Could not read this meal’s photo to re-scan.', tone: 'error' })
      return
    }
    const [, mediaType, base64] = m
    setRescanningId(mealId)
    setStatus({ text: 'Taking another look with Opus…', tone: 'info' })
    try {
      const hint =
        meal.mealType && meal.mealType !== 'auto'
          ? `User says this is a ${meal.mealType.toUpperCase()}.`
          : undefined
      const { parsed, resolved } = await parseMealPhoto(base64, mediaType, undefined, hint, { escalate: true })
      if (parsed.state === 'bad_photo') {
        setStatus({ text: 'The saved photo is too unclear for a re-scan.', tone: 'error' })
        return
      }
      const lookup = resolved ?? (await lookupMacrosForMeal(parsed, macroSearchFn))
      await patchMeal(mealId, {
        state: parsed.state,
        whatISee: parsed.what_i_see || meal.whatISee,
        totals: lookup.totals,
        foods: lookup.foods,
        unmatched: lookup.unmatched,
        clarifyingQuestions: parsed.clarifying_questions || [],
      })
      setStatus({ text: `Re-scanned · ${Math.round(lookup.totals.kcal)} kcal`, tone: 'success' })
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : 'Re-scan failed. Try again.', tone: 'error' })
    } finally {
      setRescanningId(null)
    }
  }, [meals, patchMeal])

  const updateGoals = useCallback(async (patch: Partial<NutritionGoals>) => {
    setGoalsState((g) => ({ ...g, ...patch }))
    const res = await saveGoals(patch)
    if (!res.ok) setStatus({ text: res.error || 'Could not save targets.', tone: 'error' })
  }, [])

  // Dismiss the intro tip card only. This must NOT touch nutrition_goals.onboarded
  // (the section wall) — that flag is set exclusively by the quiz summary.
  const dismissOnboarding = useCallback(() => {
    try { localStorage.setItem(TIPS_SEEN_KEY, '1') } catch {}
    setTipsSeen(true)
  }, [])

  const addFavorite = useCallback(
    async (name: string, source: { foods: Meal['foods']; totals: Meal['totals']; thumbnail: string | null; mealType: MealType }) => {
      // Starring the same meal twice should be a no-op, not a second identical
      // row. If an existing favorite matches name + meal type + totals, stop.
      const key = templateContentKey({ name, mealType: source.mealType, totals: source.totals })
      if (templates.some((t) => templateContentKey(t) === key)) {
        setStatus({ text: 'Already in your favorites', tone: 'info' })
        return
      }
      const res = await saveTemplate({ name, foods: source.foods, totals: source.totals, thumbnail: source.thumbnail, mealType: source.mealType })
      if (!res.ok) {
        setStatus({ text: res.error || 'Could not save favorite.', tone: 'error' })
        return
      }
      setTemplates((prev) => [
        { id: res.data!.id, name: name.trim() || 'Untitled favorite', foods: source.foods, totals: source.totals, thumbnail: source.thumbnail, mealType: source.mealType, createdAt: res.data!.createdAt },
        ...prev,
      ])
      setStatus({ text: 'Saved to favorites', tone: 'success' })
    },
    [templates]
  )

  const removeFavorite = useCallback(async (id: string) => {
    const target = templates.find((t) => t.id === id)
    if (!target) return
    // The UI shows one favorite per content key, but pre-existing duplicates may
    // hide behind it. Delete every row matching that content so the favorite
    // actually disappears (and the DB is cleaned) rather than a hidden copy
    // resurfacing on the next render.
    const key = templateContentKey(target)
    const victimIds = templates.filter((t) => templateContentKey(t) === key).map((t) => t.id)
    const prev = templates
    const drop = new Set(victimIds)
    setTemplates((cur) => cur.filter((t) => !drop.has(t.id)))
    const results = await Promise.all(victimIds.map((vid) => deleteTemplate(vid)))
    if (results.some((r) => !r.ok)) {
      setTemplates(prev)
      setStatus({ text: 'Could not delete favorite.', tone: 'error' })
    }
  }, [templates])

  const logWeight = useCallback(
    async (kg: number) => {
      const dayKey = currentDayKey
      setWeights((prev) => {
        const without = prev.filter((w) => w.dayKey !== dayKey)
        return [{ dayKey, kg, loggedAt: new Date().toISOString() }, ...without].sort((a, b) =>
          b.dayKey.localeCompare(a.dayKey)
        )
      })
      const res = await saveWeight(dayKey, kg)
      if (!res.ok) setStatus({ text: res.error || 'Could not save weight.', tone: 'error' })
      else setStatus({ text: 'Weight logged', tone: 'success' })
    },
    [currentDayKey]
  )

  // Day navigation; fetches the day if it's outside the pre-loaded window.
  const goToDay = useCallback(
    async (dayKey: string) => {
      setCurrentDayKey(dayKey)
      const loaded = meals.some((m) => m.dayKey === dayKey)
      const keys = getRecentDayKeys(todayKey, 35)
      if (!loaded && !keys.includes(dayKey)) {
        const res = await getMealsForDay(dayKey)
        if (res.ok && res.data && res.data.length > 0) {
          setMeals((prev) => {
            const ids = new Set(prev.map((m) => m.id))
            return [...prev, ...res.data!.filter((m) => !ids.has(m.id))]
          })
        }
      }
    },
    [meals, todayKey]
  )

  // Answer a clarifying question. When the question is tied to a food and the
  // chosen option renames it, re-resolve that food's macros against USDA and
  // recompute the meal totals — unless the answer just confirms the existing
  // food (isClarifyingAnswer), in which case we only record the choice.
  const answerQuestion = useCallback(
    async (mealId: string, questionId: string, optionLabel: string) => {
      const meal = meals.find((m) => m.id === mealId)
      if (!meal) return
      const q = meal.clarifyingQuestions.find((x) => x.id === questionId)
      const questions = meal.clarifyingQuestions.map((x) =>
        x.id === questionId ? { ...x, answer: optionLabel } : x
      )

      const targetIdx = q?.about_food_id
        ? meal.foods.findIndex((f) => f.id === q.about_food_id)
        : -1
      const target = targetIdx >= 0 ? meal.foods[targetIdx] : null

      // Record-only path (no food tie, or the answer just confirms the food).
      if (!target || isClarifyingAnswer(target.name, optionLabel)) {
        await patchMeal(mealId, { clarifyingQuestions: questions })
        return
      }

      setStatus({ text: 'Updating macros', tone: 'working' })
      let match = null
      try {
        match = await usdaSearchBest(optionLabel)
      } catch {
        /* fall through — keep the prior macros, just record the answer */
      }
      let foods = meal.foods
      if (match) {
        const macros = scaleMacros(match.per100, target.grams)
        foods = meal.foods.map((f, i) =>
          i === targetIdx
            ? { ...f, name: optionLabel, macros, hintUsed: optionLabel, usdaDescription: match!.description }
            : f
        )
      }
      const totals = foods.reduce((acc, f) => addMacros(acc, f.macros), { ...ZERO_MACROS })
      await patchMeal(mealId, { foods, totals, clarifyingQuestions: questions })
      setStatus(match ? { text: 'Macros updated', tone: 'success' } : null)
    },
    [meals, patchMeal]
  )

  // Record a skip sentinel — no USDA lookup, just collapses the question.
  const skipQuestion = useCallback(
    async (mealId: string, questionId: string) => {
      const meal = meals.find((m) => m.id === mealId)
      if (!meal) return
      const questions = meal.clarifyingQuestions.map((q) =>
        q.id === questionId ? { ...q, answer: SKIP_ANSWER } : q
      )
      await patchMeal(mealId, { clarifyingQuestions: questions })
    },
    [meals, patchMeal]
  )

  // Clear the answer so the option chips re-appear (user can pick again).
  const changeAnswer = useCallback(
    async (mealId: string, questionId: string) => {
      const meal = meals.find((m) => m.id === mealId)
      if (!meal) return
      const questions = meal.clarifyingQuestions.map((q) =>
        q.id === questionId ? { ...q, answer: undefined } : q
      )
      await patchMeal(mealId, { clarifyingQuestions: questions })
    },
    [meals, patchMeal]
  )

  const clearStatus = useCallback(() => setStatus(null), [])

  const patchFood = useCallback(
    async (mealId: string, foodIdx: number, next: { name: string; grams: number }) => {
      const meal = meals.find((m) => m.id === mealId)
      if (!meal) return
      const cur = meal.foods[foodIdx]
      if (!cur) return
      const macros = rescaleByGrams(cur.macros, cur.grams, next.grams)
      const name = next.name.trim() || cur.name
      const foods = meal.foods.map((f, i) => (i === foodIdx ? { ...f, name, grams: next.grams, macros } : f))
      const totals = foods.reduce((acc, f) => addMacros(acc, f.macros), { ...ZERO_MACROS })
      await patchMeal(mealId, { foods, totals })
    },
    [meals, patchMeal]
  )

  // Drop one food the scan got wrong. Recompute totals; if it was the last
  // food, the meal is empty and meaningless, so remove the whole meal.
  const removeFood = useCallback(
    async (mealId: string, foodIdx: number) => {
      const meal = meals.find((m) => m.id === mealId)
      if (!meal) return
      const foods = meal.foods.filter((_, i) => i !== foodIdx)
      if (foods.length === 0) {
        await removeMeal(mealId)
        return
      }
      const totals = foods.reduce((acc, f) => addMacros(acc, f.macros), { ...ZERO_MACROS })
      await patchMeal(mealId, { foods, totals })
    },
    [meals, patchMeal, removeMeal]
  )

  const reidentifyFood = useCallback(
    async (mealId: string, foodIdx: number, candidate: UsdaCandidate, grams: number) => {
      const meal = meals.find((m) => m.id === mealId)
      if (!meal) return
      const cur = meal.foods[foodIdx]
      if (!cur) return
      // Capture the pre-correction name BEFORE the optimistic patch overwrites it.
      const guessedName = cur.name || null
      const macros = scaleMacros(candidate.per100, grams)
      const foods = meal.foods.map((f, i) =>
        i === foodIdx
          ? { ...f, name: candidate.displayName, grams, macros, hintUsed: candidate.displayName, usdaDescription: candidate.description }
          : f
      )
      const totals = foods.reduce((acc, f) => addMacros(acc, f.macros), { ...ZERO_MACROS })
      await patchMeal(mealId, { foods, totals })
      // Fire-and-forget correction memory write. A failure here must NOT surface
      // an error to the user or revert the food edit — it's write-only memory.
      saveCorrection({
        guessedName,
        correctedName: candidate.description,
        fdcId: candidate.fdcId ?? null,
        context: meal.whatISee || null,
        mealId,
      }).catch((err) => {
        console.warn('[reidentifyFood] correction memory write failed:', err)
      })
    },
    [meals, patchMeal]
  )

  // Add a food the scan missed or swapped (e.g. it logged chicken, you ate
  // turkey). Append it and recompute totals — same shape as resolving an
  // unmatched item, just user-initiated.
  const addFoodToMeal = useCallback(
    async (mealId: string, candidate: UsdaCandidate, grams: number) => {
      const meal = meals.find((m) => m.id === mealId)
      if (!meal) return
      const food = {
        id: null,
        name: candidate.displayName,
        grams,
        macros: scaleMacros(candidate.per100, grams),
        hintUsed: candidate.displayName,
        usdaDescription: candidate.description,
      }
      const foods = [...meal.foods, food]
      const totals = foods.reduce((acc, f) => addMacros(acc, f.macros), { ...ZERO_MACROS })
      await patchMeal(mealId, { foods, totals })
    },
    [meals, patchMeal]
  )

  const resolveQuestionWithFood = useCallback(
    async (mealId: string, questionId: string, candidate: UsdaCandidate, grams: number) => {
      const meal = meals.find((m) => m.id === mealId)
      if (!meal) return
      const q = meal.clarifyingQuestions.find((x) => x.id === questionId)
      if (!q) return
      const idx = q.about_food_id ? meal.foods.findIndex((f) => f.id != null && f.id === q.about_food_id) : -1
      let foods = meal.foods
      let totals = meal.totals
      let guessedName: string | null = null
      if (idx >= 0) {
        const cur = meal.foods[idx]
        guessedName = cur.name
        const macros = scaleMacros(candidate.per100, grams)
        foods = meal.foods.map((f, i) =>
          i === idx
            ? { ...f, name: candidate.displayName, grams, macros, hintUsed: candidate.displayName, usdaDescription: candidate.description }
            : f
        )
        totals = foods.reduce((acc, f) => addMacros(acc, f.macros), { ...ZERO_MACROS })
      }
      const questions = meal.clarifyingQuestions.map((x) => (x.id === questionId ? { ...x, answer: candidate.description } : x))
      await patchMeal(mealId, { foods, totals, clarifyingQuestions: questions })
      saveCorrection({
        guessedName,
        correctedName: candidate.description,
        fdcId: candidate.fdcId ?? null,
        context: meal.whatISee ?? null,
        mealId,
      }).catch((e) => console.warn('saveCorrection failed', e))
    },
    [meals, patchMeal]
  )

  const resolveUnmatched = useCallback(
    async (mealId: string, unmatchedIdx: number, candidate: UsdaCandidate, grams: number) => {
      const meal = meals.find((m) => m.id === mealId)
      if (!meal) return
      const u = meal.unmatched[unmatchedIdx]
      if (!u) return
      const macros = scaleMacros(candidate.per100, grams)
      const resolved = {
        id: null,
        name: candidate.displayName,
        grams,
        macros,
        hintUsed: candidate.displayName,
        usdaDescription: candidate.description,
      }
      const unmatched = meal.unmatched.filter((_, i) => i !== unmatchedIdx)
      const foods = [...meal.foods, resolved]
      const totals = foods.reduce((acc, f) => addMacros(acc, f.macros), { ...ZERO_MACROS })
      await patchMeal(mealId, { foods, unmatched, totals })
      // Learning loop: the user told us what an unidentifiable food was.
      saveCorrection({
        guessedName: u.name,
        correctedName: candidate.description,
        fdcId: candidate.fdcId ?? null,
        context: meal.whatISee ?? null,
        mealId,
      }).catch((e) => console.warn('saveCorrection failed', e))
    },
    [meals, patchMeal]
  )

  // Drop an unmatched food the user can't (or doesn't want to) resolve, so the
  // card stops nagging. Mirrors the "skip" on clarifying questions.
  const dismissUnmatched = useCallback(
    async (mealId: string, unmatchedIdx: number) => {
      const meal = meals.find((m) => m.id === mealId)
      if (!meal) return
      const unmatched = meal.unmatched.filter((_, i) => i !== unmatchedIdx)
      await patchMeal(mealId, { unmatched })
    },
    [meals, patchMeal]
  )

  const setSearchMode = useCallback((mode: SearchMode) => { updateGoals({ searchMode: mode }) }, [updateGoals])

  const setMealNote = useCallback(
    async (mealId: string, note: string) => {
      // Send the trimmed string (empty string when cleared), NOT undefined.
      // mealToRow skips undefined fields, so `notes: undefined` left the old note
      // in the DB and it reappeared on reload; an empty string persists the clear
      // (and rowToMeal reads it back as no note).
      const trimmed = note.trim()
      await patchMeal(mealId, { notes: trimmed })
    },
    [patchMeal]
  )

  return {
    // state
    goals, meals, templates: uniqueTemplates, weights, scores, currentDayKey, todayKey, isToday,
    selectedMealType, setSelectedMealType, status, busy, units, isPro, tipsSeen,
    currentDayType, setDayType, rescanningId,
    // derived
    dayMeals, totals, remaining, recents, week, streak, latestWeight,
    currentTarget, targetForDayKey,
    // actions
    analyzePhoto, cancelAnalysis, redoScan, logBuilt, removeMeal, patchMeal, updateGoals, dismissOnboarding,
    addFavorite, removeFavorite, logWeight, goToDay, answerQuestion, skipQuestion, changeAnswer, clearStatus,
    patchFood, removeFood, addFoodToMeal, reidentifyFood, resolveUnmatched, dismissUnmatched, resolveQuestionWithFood, setSearchMode, setMealNote,
  }
}

export type UseMacros = ReturnType<typeof useMacros>
