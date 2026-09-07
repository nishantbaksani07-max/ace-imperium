'use client'

import Link from 'next/link'
import { Fragment, useState, useEffect, useMemo, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dashboardStyles from '../../dashboard.module.css'
import fitnessStyles from '../fitness.module.css'
import styles from './log.module.css'
import { SPLIT, EX, REST_SEC, TIER_LABEL, type DayType, type SplitDay, type ExerciseDef } from './splitData'
import { createClient } from '@/lib/supabase/client'
import { saveWorkoutState, saveWorkoutKeepalive, getPreviousSessionForDay, type SavedExercise, type CardioEntry } from '@/lib/workouts/queries'
import { writePendingSnapshot, readPendingSnapshot, clearPendingSnapshot } from '@/lib/workouts/pendingSnapshot'
import { CARDIO_TYPES, cardioLabel } from '@/lib/workouts/cardioLibrary'
import CardioGlyph from './CardioGlyph'
import ConquerStar from './ConquerStar'
import { createWorkoutSaver, type WorkoutSaver } from '@/lib/workouts/saver'
import { setUnits as setUnitsAction, keepExerciseInSplit, removeExerciseFromSplit, reorderSplitExercises, addCustomExercise, saveExerciseOverride, startDeload, endDeload, type CustomExercise } from './actions'
import DeloadConfirm from './DeloadConfirm'
import SettingsSheet from './SettingsSheet'
import TrainerDoorway from './TrainerDoorway'
import HistoryModal from './HistoryModal'
import OverloadModal, { type OverloadBump } from './OverloadModal'
import { SettingsGear } from '@/components/SettingsGear'
import OffDayFlow from './OffDayFlow'
import { easeWeightKg, buildOffDayPlan, type OffDayLevel, type OffDayTarget, type OffDayLift } from './offDayPlan'
import SetPill, { type PillKind } from './SetPill'
import ExerciseSettings from './ExerciseSettings'
import SwapModal from './SwapModal'
import NameLiftCard from './NameLiftCard'
import FormReferenceSheet from './FormReferenceSheet'
import { exerciseReferences } from '@/lib/exerciseReferences'
import { getAlternatives } from '@/lib/exerciseAlternatives'
import { kgToDisplay, unitLabel, type Units } from '@/lib/units'
import MuscleIcon, { MUSCLE_ICON_LABEL, type MuscleIconKey } from '@/components/MuscleIcon'
import { exerciseMuscleDisplay } from '@/lib/training/muscleDisplay'
import type { DayExercise } from './splitData'
import type { TrainerSnapshot } from '@/lib/workouts/trainerPrompt'
import { reconcileExercises } from './reconcile'
import CelebrationScreen from '@/components/CelebrationScreen'
import SessionVerdictCard from './SessionVerdict'
import { computeSessionVerdict, type SessionVerdict } from '@/lib/workouts/sessionVerdict'

/**
 * SplitLog v2 — single-day workout logger.
 *
 * Reached by tapping a day card on /app/fitness/log (the SessionMenu).
 * Renders the logging UI for exactly ONE day from the rotation. To switch
 * days, navigate back to the menu.
 *
 * v1 lives at ~/Desktop/Vitality/split-standalone/ and stays as the immutable
 * YouTube reference standalone. v2 takes all v1's features (tiered exercises,
 * form tips, rest timer, history dots, PR stars, set classification) and
 * rebuilds them in Vitality's editorial language — Instrument Serif italic
 * for exercise names, tabular numeric inputs, mint shimmer on mark-clean,
 * dark + mint palette throughout.
 *
 * Fully wired to Supabase: the split + recommended weights + saved sets come
 * in as server-fetched props (see [day]/page.tsx), and every change persists
 * through lib/workouts/saver.ts. Local state mirrors the saved row for instant
 * UI; the saver reconciles it back to the workouts + training_settings tables.
 */

interface SetEntry {
  weight: number | null
  reps: number | null
  done: boolean
  failed: boolean
  loggedAt?: number | null
}

interface SplitLogProps {
  day: number // 1..N (N = split.length)
  /** Customized rotation from training_settings.rotation_days. Falls back to
   *  the SPLIT seed only when unprovided (e.g. a dev render). */
  split?: SplitDay[]
  /** Per-exercise starting weights (kg) from setup / saved overrides. Falls
   *  back to the most recent top-set from server-fetched history. */
  recommendedWeights?: Record<string, number>
  /** Per-exercise rest-between-sets overrides (seconds), keyed `${exId}__${dayType}`.
   *  Falls back to REST_SEC[tier][dayType] when a key is absent. */
  restOverrides?: Record<string, number>
  /** Current user's auth.uid — needed for the workouts upsert. */
  userId?: string
  /** YYYY-MM-DD local key for today. The server computes this so we
   *  don't UTC-drift across midnight. */
  todayKey?: string
  /** Already-logged exercises for (user, todayKey, day_name), if any.
   *  Lets refresh / re-enter pick up where the user left off. */
  initialExercises?: SavedExercise[] | null
  /** Already-logged end-of-session cardio for (user, todayKey, day_name). */
  initialCardio?: CardioEntry[] | null
  initialSubmittedAt?: string | null
  /** Persisted readiness marker for today's session ('little' | 'rough' | null).
   *  Hydrates the off-day mood + eased weights on refresh / re-entry. */
  initialOffDay?: OffDayLevel | null
  /** Prefetched top-set history (oldest → newest, last 6) for each exercise
   *  on this day. Drives HistoryDots + PR detection. Server-side fetched in
   *  [day]/page.tsx via getExerciseHistory. Empty array = no history yet. */
  exerciseHistory?: Record<string, number[]>
  /** Per-exercise PREVIOUS-session best (top set), EXCLUDING today's row. Drives
   *  the progressive-overload celebration: a logged set beats this when it's
   *  heavier, or the same weight at more reps. Absent / null = no prior session
   *  to beat (so a first-ever log never false-fires). */
  prevBest?: Record<string, { weight: number; reps: number } | null>
  /** Per-exercise MOST-RECENT logged session (sets/reps/weight), today + off
   *  days excluded. Drives the overload card's "last session" readout so it
   *  reflects real logged history, never the live (just-tuned) prescription. */
  prevSession?: Record<string, { sets: number; reps: number; weight: number } | null>
  /** Per-day-name completion for the split rail: done (submitted) vs in
   *  progress (logged, not submitted). The current day uses live state. */
  dayStatuses?: Record<string, { completed: boolean; inProgress: boolean }>
  /** Deload week: training days still owed an easy session, and the total in
   *  the split. >0 remaining + initialOffDay='deload' means today is a deload. */
  deloadRemaining?: number
  deloadTotal?: number
  /** Display unit preference. Storage stays in kg; this drives display
   *  + input conversion via lib/units.ts. Set from user_profile.units. */
  units?: Units
  /** Whether the user has completed the 11-question tailored intake.
   *  Drives the Completed badge on the SettingsSheet "Tailor my split" row. */
  intakeCompleted?: boolean
  /** The user's own custom lifts (not in the EX library). Searchable in the
   *  add picker; resolved for name/tier when one is on the day. */
  customExercises?: CustomExercise[]
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const dayTypeClass: Record<DayType, string> = {
  HEAVY:    styles.dayPillHeavy,
  VOLUME:   styles.dayPillVolume,
  RECOVERY: styles.dayPillRest,
}

function emptySet(): SetEntry {
  return { weight: null, reps: null, done: false, failed: false }
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function SplitLog({
  day: dayNum,
  split,
  recommendedWeights,
  restOverrides: initialRestOverrides,
  userId,
  todayKey,
  initialExercises,
  initialCardio,
  initialSubmittedAt,
  initialOffDay,
  exerciseHistory,
  prevBest,
  prevSession,
  dayStatuses,
  deloadRemaining = 0,
  deloadTotal = 0,
  units: initialUnits = 'metric',
  intakeCompleted = false,
  customExercises: initialCustomExercises = [],
}: SplitLogProps) {
  const router = useRouter()
  const historyMap: Record<string, number[]> = exerciseHistory ?? {}
  // Previous-session best per lift (top set, today excluded). Drives the
  // progressive-overload celebration; see beatsPrevBest below.
  const prevBestMap: Record<string, { weight: number; reps: number } | null> = prevBest ?? {}
  const activeSplit = split && split.length > 0 ? split : SPLIT
  const day = activeSplit[dayNum - 1]

  // Defensive: if dayNum exceeds activeSplit length somehow (race between a
  // rotation edit in another tab and this page render), bail out with a
  // graceful empty state rather than crashing on `day.exercises` below.
  // Returned BEFORE any hook calls so the rules-of-hooks invariant holds
  // across both the missing-day and present-day render paths.
  if (!day) {
    return (
      <main className={`${dashboardStyles.page} ${styles.editorialPage} grain-overlay`}>
        <div className={`${dashboardStyles.shell} ${styles.editorialShell}`}>
          <div className={fitnessStyles.header}>
            <Link href="/app/fitness/log" className={fitnessStyles.back}>
              <span className={fitnessStyles.backArrow}>←</span> Today&apos;s session
            </Link>
            <h1 className={fitnessStyles.title}>Day not found</h1>
            <p className={fitnessStyles.subtitle}>
              This rotation day no longer exists. <Link href="/app/fitness/log">Back to today&apos;s session</Link>.
            </p>
          </div>
        </div>
      </main>
    )
  }

  // Local units state — seeded from server-rendered prop, mutable via the
  // gear → SettingsSheet so flipping kg↔lbs reflects on every pill in this
  // session without a hard reload. Persists via setUnits action.
  const [units, setUnits] = useState<Units>(initialUnits)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [trainerOpen, setTrainerOpen] = useState(false)
  const [trainerFiring, setTrainerFiring] = useState(false)
  const [, startUnitsTransition] = useTransition()
  const atmosphereParticlesRef = useRef<HTMLDivElement | null>(null)

  // Editorial atmosphere particles — same drift recipe as the landing,
  // creators section, and session menu. vh-based translate distance
  // (% would only move a 1.5px dot by 1.5px — see SKILL.md notes).
  useEffect(() => {
    const root = atmosphereParticlesRef.current
    if (!root) return

    const N = window.innerWidth < 640 ? 10 : 18
    const created: HTMLSpanElement[] = []

    for (let i = 0; i < N; i++) {
      const s = document.createElement('span')
      const x = Math.random() * 100
      const startY = 65 + Math.random() * 35
      const dur = 22 + Math.random() * 24
      const delay = -Math.random() * dur
      const dx = Math.random() * 30 - 15 + 'px'
      const dy = -(60 + Math.random() * 50) + 'vh'
      const size = 1.2 + Math.random() * 1.2
      s.style.left = x + '%'
      s.style.top = startY + '%'
      s.style.width = s.style.height = size + 'px'
      s.style.animationDuration = dur + 's'
      s.style.animationDelay = delay + 's'
      s.style.setProperty('--dx', dx)
      s.style.setProperty('--dy', dy)
      root.appendChild(s)
      created.push(s)
    }

    return () => {
      created.forEach((s) => s.remove())
    }
  }, [])

  function toggleUnits(next: Units) {
    if (next === units) return
    setUnits(next) // optimistic
    startUnitsTransition(async () => {
      const res = await setUnitsAction(next)
      if (!res.ok) setUnits(units) // revert on failure
    })
  }

  // Local override map — seeded from the prop, mutated when ExerciseSettings
  // saves so unlogged pills re-prefill immediately without a page refresh.
  // Local mirror of saved rest overrides, so a tune updates the rest timer
  // immediately (same pattern as weightOverrides). Keyed `${exId}__${dayType}`.
  const [restOverrides, setRestOverrides] = useState<Record<string, number>>(
    () => ({ ...(initialRestOverrides ?? {}) })
  )
  const [weightOverrides, setWeightOverrides] = useState<Record<string, number>>(
    () => ({ ...(recommendedWeights ?? {}) })
  )

  // Look up the prescribed weight for an exercise on THIS day type.
  // Precedence: per-day-type override (`exId__HEAVY`) → flat wizard default
  // (`exId`) → most recent top-set from server-fetched history → 0. The
  // double-key model lets the same lift hold different base weights on
  // heavy vs volume days.
  function lookupStartingWeight(exId: string): number {
    const scopedKey = `${exId}__${day.type}`
    if (scopedKey in weightOverrides) return weightOverrides[scopedKey]
    if (exId in weightOverrides) return weightOverrides[exId]
    return historyMap[exId]?.at(-1) ?? 0
  }

  // The user's own custom lifts. Seeded from the server prop; a lift created
  // mid-session is appended here so it resolves immediately (name on the day +
  // a match in the picker) without a reload.
  const [customList, setCustomList] = useState<CustomExercise[]>(
    () => initialCustomExercises ?? []
  )
  const customById = useMemo(
    () => new Map(customList.map(c => [c.id, c])),
    [customList],
  )
  // Names of "just for the log" custom lifts — created with the library toggle
  // OFF, so they live only on today's workout row, not in custom_exercises.
  // Seeded from the saved row (which stores each lift's name) so they still
  // resolve a name on reload, and appended to when one is created mid-session.
  const [sessionNames, setSessionNames] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const e of initialExercises ?? []) {
      if (e.id.startsWith('custom_') && e.name && e.name !== e.id) m[e.id] = e.name
    }
    return m
  })
  // Body part for just-for-log custom lifts (library customs carry it on their
  // custom_exercises entry instead). Seeded from the saved row so a one-off
  // keeps its glyph + label on reload.
  const [sessionMuscles, setSessionMuscles] = useState<Record<string, MuscleIconKey>>(() => {
    const m: Record<string, MuscleIconKey> = {}
    for (const e of initialExercises ?? []) {
      if (e.id.startsWith('custom_') && e.muscle) m[e.id] = e.muscle
    }
    return m
  })
  // Resolve an exercise id to a definition. Built-in EX lifts pass through; a
  // library custom lift gets a synthesized def (saved name + neutral tier); a
  // just-for-log custom lift falls back to its remembered session name so it
  // still renders. null = truly unknown.
  function resolveDef(id: string): ExerciseDef | null {
    const builtin = EX[id]
    if (builtin) return builtin
    const custom = customById.get(id)
    if (custom) return { name: custom.name, tier: 'iso' }
    const sessionName = sessionNames[id]
    if (sessionName) return { name: sessionName, tier: 'iso' }
    return null
  }
  // A lift that lives only on today's log — a just-for-log custom (in
  // sessionNames, never saved to the library). Used to hide "keep to split",
  // which would dangle (the split can't resolve a name that isn't in the
  // library). One-off lifts get re-created with the toggle on if wanted.
  function isJustForLog(id: string): boolean {
    return !EX[id] && !customById.has(id) && !!sessionNames[id]
  }
  // The muscle glyph + label for a lift's card. Built-ins resolve via the static
  // attribution map; custom lifts use the body part the user picked in the
  // wizard (library customs store it on their entry, one-offs in sessionMuscles).
  // null = no glyph (don't invent one).
  function resolveMuscle(id: string): { iconKey: MuscleIconKey; label: string } | null {
    const builtin = exerciseMuscleDisplay(id)
    if (builtin) return { iconKey: builtin.iconKey, label: builtin.primaryLabel }
    const m = customById.get(id)?.muscle ?? sessionMuscles[id]
    if (m) return { iconKey: m, label: MUSCLE_ICON_LABEL[m] }
    return null
  }

  // Reconstruct today's ordered exercise list — the split, plus any in-session
  // swaps and user-added lifts — from the saved workout row. See ./reconcile:
  // added lifts are emitted inline at the spot the user inserted them and split
  // slots are matched positionally (skipping adds), so a mid-list insert never
  // shifts a split lift onto the wrong saved sets. day.exercises + initial-
  // Exercises are stable props for this mount, so this runs once.
  const initialSlots = useMemo(
    () => reconcileExercises(day.exercises, initialExercises ?? null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const [activeExercises, setActiveExercises] = useState<DayExercise[]>(
    () => initialSlots.map(s => s.def),
  )

  // Initial session state — each slot's saved sets (capped to its prescribed
  // count) or empty rows for a fresh lift.
  const [session, setSession] = useState<SetEntry[][]>(() =>
    initialSlots.map(({ def, saved }) => {
      if (!saved) return Array.from({ length: def.sets }, emptySet)
      const rows: SetEntry[] = []
      for (let i = 0; i < def.sets; i++) {
        const s = saved.sets[i]
        rows.push(s ? { weight: s.weight, reps: s.reps, done: s.done, failed: s.failed, loggedAt: s.loggedAt ?? null } : emptySet())
      }
      return rows
    }),
  )

  const [submittedAt, setSubmittedAt] = useState<string | null>(initialSubmittedAt ?? null)
  // Finish-screen progress verdict (this session vs the last same-day session).
  // Computed async on finish; null until ready, so the card slots in cleanly.
  const [verdict, setVerdict] = useState<SessionVerdict | null>(null)
  const [verdictLastDate, setVerdictLastDate] = useState<string | null>(null)
  // Mirror of submittedAt for the saver's stable closure. Every autosave reads
  // this so a post-finish write carries the finish mark — otherwise the row
  // would be re-evaluated as "empty" and could be deleted by the cleanup path.
  const submittedAtRef = useRef<string | null>(initialSubmittedAt ?? null)
  // Optional end-of-session cardio (walk / run / bike …). Hydrated from the
  // saved row; mirrored to a ref so the saver's stable closure persists it.
  const [cardio, setCardio] = useState<CardioEntry[]>(initialCardio ?? [])
  const cardioRef = useRef<CardioEntry[]>(cardio)
  const [cardioPickerOpen, setCardioPickerOpen] = useState(false)
  // `endsAt` (epoch ms) is the source of truth so the countdown stays accurate
  // even while the PWA is backgrounded (a plain per-second decrement stalls and
  // drifts when the tab is suspended). secondsLeft is just the displayed mirror,
  // recomputed from endsAt on every tick and whenever the app regains focus.
  const [restTimer, setRestTimer] = useState<{ endsAt: number; secondsLeft: number; exerciseName: string; done?: boolean } | null>(null)
  const restIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const restDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [historyOpenExId, setHistoryOpenExId] = useState<string | null>(null)
  // First-time-only nudge: once a session is in the books, gently pulse the
  // history buttons green so the user knows to check their updated history.
  // Shown once ever (localStorage), dismissed the moment any history opens.
  const [showHistoryNudge, setShowHistoryNudge] = useState(false)
  // Flips true once "finish session" saves successfully — takes over the view
  // with the gem celebration, which then auto-returns to Today's session.
  const [sessionDone, setSessionDone] = useState(false)
  /** exId whose progressive-overload card is open, or null. */
  const [overloadOpenExId, setOverloadOpenExId] = useState<string | null>(null)
  // On an off day, tapping the ★ shows a kind "rest, don't push" note first
  // (with a way through if they really want to overload anyway).
  const [offOverloadNoteExId, setOffOverloadNoteExId] = useState<string | null>(null)
  const [settingsOpenExId, setSettingsOpenExId] = useState<string | null>(null)
  const [formRefOpenExId, setFormRefOpenExId] = useState<string | null>(null)
  /** exIdx of the exercise whose ⇄ swap modal is open, or null. */
  const [swapOpenIdx, setSwapOpenIdx] = useState<number | null>(null)
  /** Lift index awaiting remove confirmation (the ✕ on a lift head). -1 = none. */
  const [confirmRemoveIdx, setConfirmRemoveIdx] = useState<number>(-1)
  /** Insertion index for the "add exercise" picker (the gap the user tapped),
   *  or null when closed. 0 = before the first card, length = at the end. */
  const [addOpenIdx, setAddOpenIdx] = useState<number | null>(null)
  /** "Build a lift" wizard. null = not creating. 'name' → NameLiftCard,
   *  'tune' → mandatory Setup. Nothing is created or added to the log until the
   *  Setup step is saved (commitNewLift). `keepInLibrary` rides through both
   *  steps; `tune` preserves dialed-in values across a Setup→Name→Setup trip. */
  const [createFlow, setCreateFlow] = useState<
    {
      step: 'name' | 'tune'
      name: string
      insertIdx: number
      keepInLibrary: boolean
      muscle: MuscleIconKey | null
      tune?: { weightKg: number; sets: number; reps: number; rest: number }
    } | null
  >(null)
  // Lifts the user "kept" to the split THIS session. Keep flips `added` off so a
  // reload reads them as normal split lifts — but we keep showing the ✕ remove
  // for the rest of the session so keep is never a one-way trap (see keepExercise
  // / removeExercise). Cleared when removed.
  const [keptIds, setKeptIds] = useState<Set<string>>(() => new Set())
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const supabaseRef = useRef(typeof window !== 'undefined' ? createClient() : null)
  // Live mirrors so the saver's stable `save` closure always reads current
  // data: session + active exercises (mutated by swaps/tune) and todayKey
  // (LocalDateSync can correct it after a midnight/timezone refresh).
  const sessionRef = useRef(session)
  useEffect(() => { sessionRef.current = session }, [session])
  const activeExercisesRef = useRef(activeExercises)
  const todayKeyRef = useRef(todayKey)
  // Off-day level mirror for the saver closure (offDayLevel state is declared
  // lower down; the ref lets every save read the current readiness marker).
  const offDayLevelRef = useRef<OffDayLevel | null>(initialOffDay ?? null)
  // Confirmed eased plan mirror — read by the reload-hydrate guard.
  const offDayPlanRef = useRef<Record<string, OffDayTarget> | null>(null)
  // Access token cached for the keepalive unload write (PostgREST needs the
  // user's JWT; we can't await getSession() during page teardown).
  const accessTokenRef = useRef<string | null>(null)

  // Build the on-disk shape from refs only, so the saver can be created once.
  function buildSavedExercisesNow(): SavedExercise[] {
    return activeExercisesRef.current.map((exDef, exIdx) => {
      const ex = resolveDef(exDef.id)
      const rows = sessionRef.current[exIdx] ?? []
      // Body part for a custom lift — persisted so a just-for-log one-off keeps
      // its glyph on reload (library customs also carry it in custom_exercises).
      const muscle = customById.get(exDef.id)?.muscle ?? sessionMuscles[exDef.id]
      return {
        id: exDef.id,
        name: ex?.name ?? exDef.id,
        targetSets: exDef.sets,
        targetReps: exDef.reps,
        sets: rows.map(s => ({ weight: s.weight, reps: s.reps, done: s.done, failed: s.failed, loggedAt: s.loggedAt ?? null })),
        // Persist the added flag so a refresh reconstructs it inline (and keeps
        // it distinct from a swap). Omitted for normal/split lifts.
        ...(exDef.added ? { added: true } : {}),
        ...(muscle ? { muscle } : {}),
      }
    })
  }

  // One lifecycle-aware saver for the component's life. See lib/workouts/saver.ts:
  // it owns the debounce / in-flight / unload semantics so trailing sets are
  // never dropped (the mobile data-loss bug).
  const saverRef = useRef<WorkoutSaver | null>(null)
  if (!saverRef.current && typeof window !== 'undefined') {
    saverRef.current = createWorkoutSaver({
      debounceMs: 600,
      onStatus: (s) => {
        setSaveStatus(s)
        if (s === 'saved') setTimeout(() => setSaveStatus(p => (p === 'saved' ? 'idle' : p)), 1500)
      },
      save: async ({ keepalive }) => {
        if (!userId || !todayKeyRef.current) return
        const args = {
          userId,
          date: todayKeyRef.current,
          dayName: day.name,
          exercises: buildSavedExercisesNow(),
          cardio: cardioRef.current,
          // Carry the finish mark on every write. Once a session is finished
          // this keeps workoutHasContent() true and re-asserts submitted_at, so
          // no autosave can demote a finished row to "empty".
          submittedAt: submittedAtRef.current ?? undefined,
          offDay: offDayLevelRef.current,
        }
        // Write-through: a synchronous localStorage backup of this exact
        // payload BEFORE the network write. On iOS standalone the page can be
        // frozen/killed mid-fetch on an app-switch; localStorage survives that,
        // and the mount-recovery effect below folds anything unconfirmed back
        // in. Cleared only once the network write is confirmed.
        writePendingSnapshot(args)
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        if (keepalive && accessTokenRef.current && url && anon) {
          await saveWorkoutKeepalive({ url, anonKey: anon, accessToken: accessTokenRef.current }, args)
        } else if (supabaseRef.current) {
          await saveWorkoutState(supabaseRef.current, args)
        } else {
          return // nothing wrote — keep the backup for next-mount recovery
        }
        clearPendingSnapshot(args.userId, args.date, args.dayName)
      },
    })
  }

  useEffect(() => {
    // No active countdown when there's no timer, or it has just finished
    // (the "done" GO flash plays separately and removes itself).
    if (!restTimer || restTimer.done) {
      if (restIntervalRef.current) {
        clearInterval(restIntervalRef.current)
        restIntervalRef.current = null
      }
      return
    }
    if (restIntervalRef.current) return

    // Recompute remaining from the wall clock (endsAt) rather than counting
    // down by 1 — so a throttled/suspended interval self-corrects on its next
    // fire instead of falling behind real time.
    const recompute = () => {
      setRestTimer(prev => {
        if (!prev || prev.done) return prev
        const left = Math.max(0, Math.round((prev.endsAt - Date.now()) / 1000))
        if (left <= 0) return { ...prev, secondsLeft: 0, done: true }
        return { ...prev, secondsLeft: left }
      })
    }
    restIntervalRef.current = setInterval(recompute, 1000)
    // Snap to the true remaining the moment the app comes back to the
    // foreground (visibility/focus), covering the suspended-interval gap.
    const onVisible = () => { if (document.visibilityState === 'visible') recompute() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', recompute)

    return () => {
      if (restIntervalRef.current) {
        clearInterval(restIntervalRef.current)
        restIntervalRef.current = null
      }
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', recompute)
    }
  }, [restTimer])

  // Rest finished: buzz the phone (where supported) and clear the pill once the
  // GO flash has played. iOS Safari has no Vibration API, so the buzz is a
  // progressive enhancement (Android / installed PWA); the GO flash always plays.
  useEffect(() => {
    if (!restTimer?.done) return
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([140, 70, 140])
    }
    restDoneTimerRef.current = setTimeout(() => setRestTimer(null), 1100)
    return () => {
      if (restDoneTimerRef.current) {
        clearTimeout(restDoneTimerRef.current)
        restDoneTimerRef.current = null
      }
    }
  }, [restTimer?.done])

  // ── Continuous saves ─────────────────────────────────────────────
  // Per Vitality lessons rule #8: persist continuously, never "save at end".
  // Discrete commits (logging/undoing/missing a set, swaps, tune-shape
  // changes) save immediately; only ambient edits debounce. The saver
  // (lib/workouts/saver.ts) guarantees trailing sets survive leaving the
  // screen — the mobile data-loss bug.
  function updateSet(
    exIdx: number,
    setIdx: number,
    patch: Partial<SetEntry>,
    immediate = false,
  ) {
    setSession(prev => {
      const next = prev.map(row => row.slice())
      next[exIdx][setIdx] = { ...next[exIdx][setIdx], ...patch }
      // Keep the ref in lockstep so an immediate save reads this set, not the
      // pre-render value (the post-render sync effect hasn't run yet).
      sessionRef.current = next
      return next
    })
    if (immediate) saverRef.current?.flushNow()
    else saverRef.current?.schedule()
  }

  async function finishSession() {
    if (!userId || !todayKeyRef.current || !supabaseRef.current) return
    // Finishing saves ONLY what the user actually logged — every set they tapped
    // "done" (or marked failed). Untouched rows stay unlogged; we never auto-fill
    // a forgotten row, so "X of Y logged" always reflects real work and a finished
    // session can't silently invent sets the user didn't do.
    const now = new Date().toISOString()
    setSubmittedAt(now)
    // Set the ref synchronously (before the await) so any autosave racing this
    // finish also carries the mark and can't demote the row to "empty".
    submittedAtRef.current = now
    setSaveStatus('saving')
    try {
      await saveWorkoutState(supabaseRef.current, {
        userId,
        date: todayKeyRef.current,
        dayName: day.name,
        exercises: buildSavedExercisesNow(),
        cardio: cardioRef.current,
        submittedAt: now,
        offDay: offDayLevelRef.current,
      })
      // The finish save is authoritative — silence the saver so no trailing
      // autosave / unload / unmount write can fire (and so the DELETE-guard +
      // finish-mark are belt-and-suspenders, not the only line of defense).
      saverRef.current?.disable()
      setSaveStatus('saved')
      setSessionDone(true)
      // Progress verdict for the finish screen. Non-blocking: the celebration
      // shows immediately, the verdict card slots in when its one comparison
      // query returns. A failure just omits the card — never blocks the finish.
      void (async () => {
        try {
          const supabase = supabaseRef.current
          if (!supabase) return
          const last = await getPreviousSessionForDay(supabase, {
            userId,
            dayName: day.name,
            beforeDate: todayKeyRef.current!,
          })
          setVerdictLastDate(last?.date ?? null)
          setVerdict(computeSessionVerdict(buildSavedExercisesNow(), last?.exercises ?? null))
        } catch (e) {
          console.error('[SplitLog] session verdict failed:', e)
        }
      })()
      setTimeout(() => setSaveStatus(s => s === 'saved' ? 'idle' : s), 1500)
    } catch (err) {
      console.error('[SplitLog] finishSession failed:', err)
      setSaveStatus('error')
    }
  }

  // After a finished session, let the gem celebration breathe, then auto-return
  // to Today's session (the user can also tap the button to go right away).
  useEffect(() => {
    if (!sessionDone) return
    const t = setTimeout(() => router.push('/app/fitness/log'), 3600)
    return () => clearTimeout(t)
  }, [sessionDone, router])

  // Keep the saver's live mirrors current.
  useEffect(() => { activeExercisesRef.current = activeExercises }, [activeExercises])
  useEffect(() => { todayKeyRef.current = todayKey }, [todayKey])
  useEffect(() => { cardioRef.current = cardio }, [cardio])
  useEffect(() => { submittedAtRef.current = submittedAt }, [submittedAt])

  // Recover trailing sets the network write may have lost (iOS standalone
  // freeze/reload — see pendingSnapshot.ts). On mount, fold any still-missing
  // logged set from the local backup back into this session, then re-save to
  // confirm. Additive only: we never clear a logged set the server already
  // has, so a stale backup can only ever restore real logged work, never
  // delete or overwrite it. Runs once against the server-seeded mount state.
  useEffect(() => {
    if (!userId || !todayKey) return
    const pending = readPendingSnapshot(userId, todayKey, day.name)
    if (!pending) return
    const pendingById = new Map<string, SavedExercise>()
    for (const e of pending.exercises) if (!pendingById.has(e.id)) pendingById.set(e.id, e)

    const nextSession = session.map(rows => rows.slice())
    let recovered = false
    activeExercises.forEach((def, exIdx) => {
      const pe = pendingById.get(def.id)
      if (!pe) return
      nextSession[exIdx]?.forEach((row, setIdx) => {
        const ps = pe.sets[setIdx]
        const psLogged = !!ps && !!ps.done && !ps.failed && (ps.weight ?? 0) > 0 && (ps.reps ?? 0) > 0
        if (psLogged && !row.done && !row.failed) {
          nextSession[exIdx][setIdx] = { weight: ps.weight, reps: ps.reps, done: true, failed: false, loggedAt: ps.loggedAt ?? null }
          recovered = true
        }
      })
    })

    const pendingCardio = pending.cardio ?? []
    const cardioRecovered = pendingCardio.length > 0 && cardio.length === 0

    if (recovered) {
      sessionRef.current = nextSession
      setSession(nextSession)
    }
    if (cardioRecovered) {
      cardioRef.current = pendingCardio
      setCardio(pendingCardio)
    }
    if (recovered || cardioRecovered) {
      // Re-persist the recovered session; a confirmed save clears the backup.
      saverRef.current?.flushNow()
    } else {
      // Server already had everything the backup held — drop the stale backup.
      clearPendingSnapshot(userId, todayKey, day.name)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pulse the history buttons the first time a session is in the books (just
  // finished, or opened via "view"). Once ever, so it never gets annoying.
  const HISTORY_NUDGE_KEY = 'vitality_history_nudge_seen'
  useEffect(() => {
    if (!submittedAt) return
    try {
      if (window.localStorage.getItem(HISTORY_NUDGE_KEY)) return
    } catch {
      return
    }
    setShowHistoryNudge(true)
  }, [submittedAt])

  function dismissHistoryNudge() {
    if (!showHistoryNudge) return
    setShowHistoryNudge(false)
    try { window.localStorage.setItem(HISTORY_NUDGE_KEY, '1') } catch { /* no-op */ }
  }

  // After adding a bout, focus its minutes field so logging is two taps:
  // pick a type → type the minutes.
  const cardioListRef = useRef<HTMLDivElement | null>(null)
  const focusNewCardio = useRef(false)
  useEffect(() => {
    if (!focusNewCardio.current) return
    focusNewCardio.current = false
    const input = cardioListRef.current?.lastElementChild?.querySelector('input')
    if (input) (input as HTMLInputElement).focus()
  }, [cardio.length])

  // ── Cardio mutators ────────────────────────────────────────────────
  // Each writes state + persists. Adding/removing is a discrete commit
  // (flushNow); editing the minute fields debounces (schedule).
  function addCardio(typeId: string) {
    setCardio(prev => [...prev, { type: typeId, label: cardioLabel(typeId), durationMin: null, zone2Min: null }])
    setCardioPickerOpen(false)
    focusNewCardio.current = true
    saverRef.current?.flushNow()
  }
  function updateCardio(idx: number, patch: Partial<CardioEntry>) {
    setCardio(prev => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)))
    saverRef.current?.schedule()
  }
  function removeCardio(idx: number) {
    setCardio(prev => prev.filter((_, i) => i !== idx))
    saverRef.current?.flushNow()
  }
  // Cardio totals drive the "Zone 2 today" summary card.
  const cardioMins = cardio.reduce((s, c) => s + (c.durationMin || 0), 0)
  const cardioZ2 = cardio.reduce((s, c) => s + (c.zone2Min || 0), 0)
  const cardioPct = cardioMins ? Math.min(100, Math.round((cardioZ2 / cardioMins) * 100)) : 0

  // Cache the access token for the keepalive unload write, and keep it fresh.
  useEffect(() => {
    const sb = supabaseRef.current
    if (!sb) return
    sb.auth.getSession().then(({ data }) => {
      accessTokenRef.current = data.session?.access_token ?? null
    })
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      accessTokenRef.current = session?.access_token ?? null
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Force a durable write when the page is leaving (tab close, app switch,
  // mobile background) — pagehide and visibilitychange:hidden are the only
  // signals that reliably fire on mobile. flushUnload does NOT bail on an
  // in-flight save; it issues a keepalive write that survives the unload.
  // The unmount cleanup covers in-app (SPA) navigation, where neither event
  // fires but React tears the component down.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') saverRef.current?.flushUnload()
    }
    const onPageHide = () => saverRef.current?.flushUnload()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
      saverRef.current?.dispose()
    }
  }, [])

  // ── Pill handlers ────────────────────────────────────────────────
  // The pill model exposes three primitives to SetPill: log, undo, miss.
  // log = "I did the set" (with explicit weight + reps from the pill).
  // undo = "actually I didn't" (reverts to empty without losing values? no — clears them).
  // miss = "I tried and failed" (same as toggleFailed → red pill).

  /**
   * Swap the exercise at `exIdx` for an alternative (per-session only).
   * - Replaces activeExercises[exIdx].id with the alternative id
   * - Seeds weightOverrides with the converted weight so unlogged pills
   *   prefill the right value immediately
   * - Persists immediately so a refresh reads the swapped exercise
   *   from the workouts row (hydration falls back to positional match)
   */
  function swapExercise(exIdx: number, newExerciseId: string, convertedWeightKg: number) {
    setActiveExercises(prev => {
      const next = [...prev]
      next[exIdx] = { ...next[exIdx], id: newExerciseId }
      activeExercisesRef.current = next
      return next
    })
    setWeightOverrides(prev => ({
      ...prev,
      [`${newExerciseId}__${day.type}`]: convertedWeightKg,
    }))
    // Also clear the session row for this slot — the prior exercise's
    // logged sets shouldn't carry over to a different lift.
    setSession(prev => {
      const next = prev.map(row => row.slice())
      next[exIdx] = next[exIdx].map(() => emptySet())
      sessionRef.current = next
      return next
    })
    saverRef.current?.flushNow()
  }

  /**
   * Insert a user-chosen lift at `insertIdx` (the gap the user tapped) for
   * today only. Splices a fresh added slot into activeExercises + an empty
   * session block, seeds its weight, persists, then chains into Tune so the
   * user can dial in weight/sets/reps right away (same as a swap).
   */
  function addExerciseAt(insertIdx: number, newId: string, weightKg: number) {
    const reps = day.type === 'HEAVY' ? 6 : day.type === 'VOLUME' ? 12 : 10
    const newDef: DayExercise = { id: newId, sets: 3, reps, added: true }
    setActiveExercises(prev => {
      const next = [...prev]
      next.splice(insertIdx, 0, newDef)
      activeExercisesRef.current = next
      return next
    })
    setSession(prev => {
      const next = prev.map(row => row.slice())
      next.splice(insertIdx, 0, Array.from({ length: newDef.sets }, emptySet))
      sessionRef.current = next
      return next
    })
    setWeightOverrides(prev => ({ ...prev, [`${newId}__${day.type}`]: weightKg }))
    saverRef.current?.flushNow()
    setAddOpenIdx(null)
    setSettingsOpenExId(newId)
  }

  /**
   * "Keep" an added lift: drop the today-only tag and save it into the split
   * (rotation_days) so it returns every time this day comes around. Optimistic
   * locally; the workouts row re-saves without the added flag.
   */
  function keepExercise(exIdx: number) {
    const exDef = activeExercisesRef.current[exIdx]
    if (!exDef || !exDef.added) return
    const afterId = activeExercisesRef.current[exIdx - 1]?.id ?? null
    setActiveExercises(prev => {
      const next = prev.map((d, i) => (i === exIdx ? { ...d, added: false } : d))
      activeExercisesRef.current = next
      return next
    })
    // Remember it's kept-this-session so the card still shows the ✕ remove —
    // keep is reversible until you leave the page.
    setKeptIds(prev => new Set(prev).add(exDef.id))
    saverRef.current?.flushNow()
    keepExerciseInSplit({
      dayNum,
      exerciseId: exDef.id,
      sets: exDef.sets,
      reps: exDef.reps,
      afterId,
    }).then(res => {
      if (!res.ok) console.error('[SplitLog] keepExercise failed:', res.error)
    })
  }

  /**
   * Commit a brand-new custom lift — the final step of the build-a-lift wizard,
   * fired only when the user SAVES the mandatory Setup. With the library toggle
   * ON it creates the custom exercise (DB) so it's searchable forever; OFF it
   * gets a session-only id remembered in sessionNames (one-off, never written to
   * the library). Either way it's inserted into today's session at the tapped
   * gap with the tuned sets/reps/weight/rest. Nothing here runs if they cancel
   * out of Setup, so an abandoned new lift never touches the log or library.
   */
  async function commitNewLift(
    insertIdx: number, name: string, weightKg: number, sets: number, reps: number, rest: number,
    keepInLibrary: boolean, muscle: MuscleIconKey | null,
  ) {
    let id: string
    if (keepInLibrary) {
      const res = await addCustomExercise(name, muscle ?? undefined)
      if (!res.ok || !res.exercise) {
        console.error('[SplitLog] addCustomExercise failed:', res.error)
        setCreateFlow(null)
        return
      }
      const created = res.exercise
      id = created.id
      setCustomList(prev => (prev.some(c => c.id === created.id) ? prev : [...prev, created]))
    } else {
      // Just for the log: mint a stable id and remember the name + body part
      // locally only. It's never written to custom_exercises, so it won't
      // clutter future searches; the workout row carries both so they survive a
      // reload.
      id = `custom_${crypto.randomUUID()}`
      setSessionNames(prev => ({ ...prev, [id]: name }))
      if (muscle) setSessionMuscles(prev => ({ ...prev, [id]: muscle }))
    }
    const newDef: DayExercise = { id, sets, reps, added: true }
    setActiveExercises(prev => {
      const next = [...prev]
      next.splice(insertIdx, 0, newDef)
      activeExercisesRef.current = next
      return next
    })
    setSession(prev => {
      const next = prev.map(row => row.slice())
      next.splice(insertIdx, 0, Array.from({ length: sets }, emptySet))
      sessionRef.current = next
      return next
    })
    setWeightOverrides(prev => ({ ...prev, [`${id}__${day.type}`]: weightKg }))
    setRestOverrides(prev => ({ ...prev, [`${id}__${day.type}`]: rest }))
    saverRef.current?.flushNow()
    setCreateFlow(null)
    // Persist the tuned weight + rest as server-side overrides so they survive a
    // reload — the Setup step skips this (the lift didn't exist yet), so we do it
    // here now that the lift has a stable id. Mirrors how a built-in added lift
    // persists its tune via the non-creating Tune's saveExerciseOverride.
    // (sets/reps for a not-yet-kept lift live in the workouts row, not rotation_days.)
    saveExerciseOverride({
      exerciseId: id, dayType: day.type, dayNum, weight: weightKg, sets, reps, rest,
    }).then(r => { if (!r.ok) console.error('[SplitLog] commitNewLift override save failed:', r.error) })
  }

  /**
   * Remove an added-today lift from the session (the ✕ on its card). Drops the
   * slot + its set rows and re-persists. Only added lifts expose this — the
   * split's own lifts aren't removable mid-session. The custom exercise stays in
   * the library (searchable / re-addable); this just takes it off today's log.
   */
  function removeExercise(exIdx: number) {
    const exDef = activeExercisesRef.current[exIdx]
    if (!exDef) return
    // A lift "lives in the split" (rotation_days) when it's a normal split lift
    // (not added this session) OR an added lift the user chose to keep. Those
    // must be pulled out of rotation_days so the day doesn't re-add them next
    // time around. A just-added-not-kept lift is session-only — local removal is
    // enough. Logged HISTORY is never touched either way (it lives in `workouts`).
    const wasKept = keptIds.has(exDef.id)
    const removesFromSplit = !exDef.added || wasKept
    setActiveExercises(prev => {
      const next = prev.filter((_, i) => i !== exIdx)
      activeExercisesRef.current = next
      return next
    })
    setSession(prev => {
      const next = prev.filter((_, i) => i !== exIdx).map(row => row.slice())
      sessionRef.current = next
      return next
    })
    if (settingsOpenExId === exDef.id) setSettingsOpenExId(null)
    saverRef.current?.flushNow()
    if (removesFromSplit) {
      if (wasKept) setKeptIds(prev => { const next = new Set(prev); next.delete(exDef.id); return next })
      // Persist the split removal robustly. A fire-and-forget write can be
      // dropped (iOS freeze / a quick navigation), which is exactly how a
      // "removed" lift comes back next session. Retry once, then refresh so the
      // server-persisted split — not a stale client cache — is authoritative.
      const exerciseId = exDef.id
      ;(async () => {
        let res = await removeExerciseFromSplit({ dayNum, exerciseId })
        if (!res.ok) res = await removeExerciseFromSplit({ dayNum, exerciseId })
        if (!res.ok) {
          console.error('[SplitLog] removeExerciseFromSplit failed:', res.error)
          return
        }
        router.refresh()
      })()
    }
  }

  function logSet(exIdx: number, setIdx: number, weight: number, reps: number) {
    const exDef = activeExercises[exIdx]
    const ex = resolveDef(exDef.id)
    updateSet(exIdx, setIdx, { done: true, failed: false, weight, reps, loggedAt: Date.now() }, true)

    // The progressive-overload celebration (gold flush + star burst) and the
    // persistent conquered marking are now driven entirely by live logged sets
    // vs prevBest — see conqueredSet + its transition effect. Logging here just
    // records the set; the effect decides if this crossed prevBest, so the
    // celebration is fully reversible (unlog clears it) and re-fires on a later
    // re-cross, with no once-per-session guard.

    const isLastSet = setIdx + 1 >= exDef.sets
    if (!isLastSet && ex) {
      // Per-lift saved rest (Tune) wins over the tier×day-type default.
      const rest = restOverrides[`${exDef.id}__${day.type}`] ?? REST_SEC[ex.tier][day.type]
      setRestTimer({ endsAt: Date.now() + rest * 1000, secondsLeft: rest, exerciseName: ex.name })
    } else {
      setRestTimer(null)
    }
  }

  function undoSet(exIdx: number, setIdx: number) {
    updateSet(exIdx, setIdx, { done: false, failed: false, weight: null, reps: null }, true)
    setRestTimer(null)
  }

  function toggleFailed(exIdx: number, setIdx: number) {
    const set = session[exIdx][setIdx]
    updateSet(exIdx, setIdx, { failed: !set.failed, done: false }, true)
    setRestTimer(null)
  }

  // Progressive-overload ★ arming — SESSION-ONLY component state (no DB column).
  // Keyed by exercise id → the user-chosen bump {weightKg, reps}. When armed,
  // the lift's prescribed weight is bumped by the chosen kg AND its prescribed
  // reps by the chosen rep count for this session, reflected in the set rows'
  // seeded values via the bumped lookup below. The overload card lets the user
  // customize both — it is NOT a fixed +2.5kg nudge.
  const [armedOverload, setArmedOverload] = useState<Map<string, OverloadBump>>(() => new Map())
  // exId currently flushing gold (the one-time PR celebration burst) — drives
  // the .celebrate class + star burst on that card for ~1.6s on the TRANSITION
  // into conquered. Distinct from the persistent conquered marking below.
  const [celebrating, setCelebrating] = useState<string | null>(null)
  // exIds whose card last rendered as COMPLETE (every set logged). Detects the
  // edge (unfinished → finished) so the star burst fires once when you finish
  // a lift, whether or not it was a PR.
  const completedPrevRef = useRef<Set<string>>(new Set())
  // Bumped on each transition into complete/conquered to fire the centered
  // ConquerStar celebration (a random crisp star + contained burst — replaces
  // the old edge-clipping gold ring that fired off the overload pill).
  const [conquerToken, setConquerToken] = useState(0)

  // Arm / replace the session overload for a lift with the chosen bump.
  function armOverload(exId: string, bump: OverloadBump) {
    setArmedOverload(prev => {
      const next = new Map(prev)
      if (bump.weightKg > 0 || bump.reps > 0) next.set(exId, bump)
      else next.delete(exId)
      return next
    })
  }
  // Clear the overload for a lift, reverting its rows to the base prescription.
  function clearOverload(exId: string) {
    setArmedOverload(prev => {
      if (!prev.has(exId)) return prev
      const next = new Map(prev)
      next.delete(exId)
      return next
    })
  }
  // The armed bump for a lift, or null when not armed.
  function overloadBump(exId: string): OverloadBump | null {
    return armedOverload.get(exId) ?? null
  }
  // The session overload weight bump (kg) applied to a lift's prescribed weight
  // when its star is armed. 0 when not armed.
  function overloadBumpKg(exId: string): number {
    return armedOverload.get(exId)?.weightKg ?? 0
  }
  // The session overload reps bump applied to a lift's prescribed reps. 0 when
  // not armed.
  function overloadBumpReps(exId: string): number {
    return armedOverload.get(exId)?.reps ?? 0
  }

  // Is the armed overload goal MET for this lift right now? Pure function of the
  // STICKY armed goal (never mutated by edits) + the lift's currently LOGGED
  // sets, so it's fully reversible: undo a set or lower reps and this flips back
  // to false, re-showing the armed star + goal label "like nothing happened".
  //
  // Met = at least one logged (done, not failed) set clears the goal:
  //   weight-and-reps bump → weight >= base + weightBumpKg AND reps >= baseReps + repsBump
  //   reps-only bump       → reps   >= baseReps + repsBump
  //   weight-only bump     → weight >= base + weightBumpKg
  // Reps fall back to the prescribed reps when a logged set left reps blank
  // (matches how the pill auto-logs at target).
  function overloadMet(exId: string, baseWeightKg: number, baseReps: number, exIdx: number): boolean {
    const bump = armedOverload.get(exId)
    if (!bump || (bump.weightKg <= 0 && bump.reps <= 0)) return false
    const weightGoal = baseWeightKg + bump.weightKg
    const repsGoal = baseReps + bump.reps
    const rows = session[exIdx] ?? []
    return rows.some(s => {
      if (!s.done || s.failed) return false
      const w = s.weight ?? 0
      const r = s.reps ?? baseReps
      const weightOk = bump.weightKg > 0 ? w >= weightGoal : true
      const repsOk = bump.reps > 0 ? r >= repsGoal : true
      return weightOk && repsOk
    })
  }

  // ── Reorder lifts ───────────────────────────────────────────────────
  // A dedicated "Reorder lifts" card (ReorderModal) lists every lift with
  // ▲ / ▼ controls; each tap moves a lift one slot and persists the order.
  // No drag and no entrance-animation hacks, so the lift cards can never
  // blank out mid-reorder (the old grip-drag bug we replaced).
  const [reorderOpen, setReorderOpen] = useState(false)
  // Off-day / readiness mode. null = a normal session. When set, the logger
  // recolors to the calm "blue void" mood, seeds eased weights, persists the
  // level on the workouts row, and the graph excludes the session from
  // best/progression so an off day never dents the baseline.
  const [offDayOpen, setOffDayOpen] = useState(false)

  // ── Trainer: "Ask Claude, mid-set" ───────────────────────────────────
  // Map the live in-progress session into the snapshot the doorway hands to
  // Claude. Weights convert kg → the user's display unit here so the prompt
  // reads naturally. focusName = the lift the user is currently on (the last
  // one with an acted-on set), which makes the question specific.
  function buildTrainerSnapshot(): TrainerSnapshot {
    const exercises = activeExercises.map((exDef, exIdx) => {
      const name = resolveDef(exDef.id)?.name ?? exDef.id
      const sets = (session[exIdx] ?? []).map((s) => ({
        weight: s.weight != null ? kgToDisplay(s.weight, units) : null,
        reps: s.reps,
        done: s.done,
        failed: s.failed,
      }))
      const pb = prevBestMap[exDef.id]
      return {
        name,
        sets,
        prevBest: pb
          ? { weight: kgToDisplay(pb.weight, units), reps: pb.reps }
          : null,
      }
    })
    let focusName: string | null = null
    for (let i = activeExercises.length - 1; i >= 0; i--) {
      const sets = session[i] ?? []
      if (sets.some((s) => s.done || s.failed)) {
        focusName =
          resolveDef(activeExercises[i].id)?.name ?? activeExercises[i].id
        break
      }
    }
    return {
      dayName: day.name,
      unitLabel: unitLabel(units),
      exercises,
      focusName,
    }
  }

  function onAskClaude() {
    setTrainerFiring(true)
    // Flush the latest set to the DB so the MCP connector sees fresh data.
    saverRef.current?.flushNow()
    setTrainerOpen(true)
  }
  const [deloadConfirmOpen, setDeloadConfirmOpen] = useState(false)
  const [offDayLevel, setOffDayLevel] = useState<OffDayLevel | null>(initialOffDay ?? null)
  // The confirmed per-lift eased plan (sets/reps/weight). Drives the seeded
  // weights + reduced set rows. Session-local: a reload rebuilds the default
  // from the persisted level (see the hydrate effect below), edits aside.
  const [offDayPlan, setOffDayPlan] = useState<Record<string, OffDayTarget> | null>(null)
  // One-shot reveal: when the off day is confirmed, each lift card crosses out
  // its full prescription and blooms in the eased one (staggered). Cleared after
  // the cascade so the eased numbers then sit calmly without re-animating.
  const [offRevealing, setOffRevealing] = useState(false)
  const offRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (offRevealTimerRef.current) clearTimeout(offRevealTimerRef.current) }, [])
  // Live mirror for the saver closure (it reads refs, not state).
  useEffect(() => { offDayLevelRef.current = offDayLevel }, [offDayLevel])

  // Build the per-lift inputs the off-day flow needs (name, tier, base numbers).
  function buildOffDayLifts(): OffDayLift[] {
    return activeExercisesRef.current.map(d => ({
      id: d.id,
      name: resolveDef(d.id)?.name ?? d.id,
      compound: isCompoundLift(d.id),
      sets: d.sets,
      reps: d.reps,
      baseKg: lookupStartingWeight(d.id),
    }))
  }

  // Resize each exercise's set rows to its eased target, never dropping a logged
  // set (off day is picked at the start, so rows are usually all empty). Trailing
  // un-logged rows are removed first; empties are padded to reach the target.
  function resizeSession(targetFor: (exId: string, def: DayExercise) => number) {
    setSession(prev => {
      const next = prev.map((rows, exIdx) => {
        const def = activeExercisesRef.current[exIdx]
        if (!def) return rows
        const loggedCount = rows.filter(s => s.done || s.failed).length
        const target = Math.max(1, targetFor(def.id, def), loggedCount)
        if (target === rows.length) return rows
        const result = rows.slice()
        while (result.length > target) {
          // drop the last un-logged row; stop if only logged rows remain
          let removed = false
          for (let i = result.length - 1; i >= 0; i--) {
            if (!result[i].done && !result[i].failed) { result.splice(i, 1); removed = true; break }
          }
          if (!removed) break
        }
        while (result.length < target) result.push(emptySet())
        return result
      })
      sessionRef.current = next
      return next
    })
  }

  // Confirm from the flow: lock the level + plan, ease the live session, persist.
  function confirmOffDay(level: OffDayLevel, plan: Record<string, OffDayTarget>) {
    offDayLevelRef.current = level
    setOffDayLevel(level)
    offDayPlanRef.current = plan
    setOffDayPlan(plan)
    resizeSession(exId => plan[exId]?.sets ?? 0)
    setOffDayOpen(false)
    saverRef.current?.flushNow()
    // Play the cross-out -> eased reveal. The struck "was" lines stay put and the
    // real pills are mounted throughout, so when revealing ends the only change is
    // the dropped (already-poofed) rows unmounting — seamless, no flash.
    setOffRevealing(true)
    if (offRevealTimerRef.current) clearTimeout(offRevealTimerRef.current)
    offRevealTimerRef.current = setTimeout(() => setOffRevealing(false), 2000)
  }

  // Undo the off day: clear level + plan, restore the prescribed set counts.
  function clearOffDay() {
    offDayLevelRef.current = null
    setOffDayLevel(null)
    offDayPlanRef.current = null
    setOffDayPlan(null)
    resizeSession((_id, def) => def.sets)
    saverRef.current?.flushNow()
  }

  // ── Deload week ──────────────────────────────────────────────────
  // Open the deload confirm (from the off-day sheet's third option).
  function openDeloadConfirm() {
    setOffDayOpen(false)
    setDeloadConfirmOpen(true)
  }
  // Confirm a deload: ease today's session now (same machinery as an off day,
  // level 'deload') AND start the multi-session deload server-side so the rest
  // of the split eases too. startDeload is best-effort — if the column isn't
  // migrated yet, today still eases; only the cross-session span is skipped.
  async function confirmDeload() {
    setDeloadConfirmOpen(false)
    confirmOffDay('deload', buildOffDayPlan('deload', buildOffDayLifts()))
    await startDeload()
    router.refresh()
  }
  // End the deload early: restore today's prescription + stop future auto-easing.
  function endDeloadNow() {
    clearOffDay()
    endDeload().then(() => router.refresh())
  }

  // On reload with a persisted off_day level, rebuild the default eased plan and
  // re-apply the reduced sets (custom edits aren't persisted yet — level is).
  useEffect(() => {
    if (!initialOffDay || offDayPlanRef.current) return
    const plan = buildOffDayPlan(initialOffDay, buildOffDayLifts())
    offDayPlanRef.current = plan
    setOffDayPlan(plan)
    resizeSession(exId => plan[exId]?.sets ?? 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // A lift is a "compound" (heavier systemic cost → eased a touch more) when its
  // tier is one of the compound tiers; everything else gets the lighter touch.
  function isCompoundLift(exId: string): boolean {
    const t = resolveDef(exId)?.tier
    return t === 'heavy_compound' || t === 'compound'
  }

  function reorderExercise(from: number, to: number) {
    if (from === to) return
    // Build the next order from the ref so we can persist it without waiting on
    // a render. activeExercisesRef is the live mirror of activeExercises.
    const nextActive = [...activeExercisesRef.current]
    const [movedDef] = nextActive.splice(from, 1)
    nextActive.splice(to, 0, movedDef)
    activeExercisesRef.current = nextActive
    setActiveExercises(nextActive)
    setSession(prev => {
      const next = prev.map(row => row.slice())
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      sessionRef.current = next
      return next
    })
    saverRef.current?.flushNow()
    // Persist the new order onto the split so it sticks across reloads AND every
    // future time this day comes around (without this it's session-only and
    // snaps back to the split order on reload).
    reorderSplitExercises({ dayNum, orderedIds: nextActive.map(e => e.id) }).then(res => {
      if (!res.ok) console.error('[SplitLog] reorderSplitExercises failed:', res.error)
    })
  }

  // Move a lift one slot up or down from the reorder card and persist.
  function moveExercise(idx: number, dir: -1 | 1) {
    const to = idx + dir
    if (to < 0 || to >= activeExercisesRef.current.length) return
    reorderExercise(idx, to)
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(6)
  }

  function classify(set: SetEntry, target: number) {
    if (set.failed) return 'failed' as const
    if (!set.done) return 'empty' as const
    const reps = set.reps ?? target
    if (reps < target) return 'partial' as const
    if (reps > target) return 'over' as const
    return 'clean' as const
  }

  function isPR(exId: string, set: SetEntry, target: number): boolean {
    if (!set.done || set.failed) return false
    const reps = set.reps ?? target
    const weight = set.weight ?? 0
    const history = historyMap[exId]
    if (!history || history.length === 0) return false
    // Use the running max across all observed top sets, not just the last
    // one — otherwise a recent off-day lower than a prior PR would let
    // anything above today's number flash a star even when it's not a real
    // PR.
    const prev = Math.max(...history, 0)
    return weight > prev && reps >= target
  }

  // Does a just-logged set beat the lift's PREVIOUS session best? True when it's
  // heavier than last time, OR the same weight at more reps. Compares only
  // against prevBest (which excludes today's session), so logging a second set
  // at the same number you just hit today never re-fires, and it never compares
  // against the set you just logged. No prior session (null/absent) = no beat,
  // so a brand-new lift's first log doesn't false-celebrate. Independent of the
  // ★ overload arm — a normal PR celebrates on its own.
  function beatsPrevBest(exId: string, weight: number, reps: number): boolean {
    const best = prevBestMap[exId]
    if (!best || best.weight <= 0) return false
    if (weight > best.weight) return true
    if (weight === best.weight && reps > best.reps) return true
    return false
  }

  // A lift is CONQUERED when it is a COMPLETED progressive overload: every set
  // in the lift is logged (done or failed) AND at least one done set beats
  // prevBest. This lands the payoff at the END of the lift (finishing the final
  // set), not on set 1. Reversible — unlog below the overload, or un-complete a
  // set, and it clears; re-complete the overload and it returns. Never depends
  // on a today mislog (prevBest excludes today) nor on the ★ being armed (a
  // normal completed PR conquers too).
  function isConqueredNow(exId: string, exIdx: number): boolean {
    const rows = session[exIdx] ?? []
    if (rows.length === 0) return false
    // Must be a fully-logged lift: no set left empty/untouched.
    const allLogged = rows.every(s => s.done || s.failed)
    if (!allLogged) return false
    // ...and at least one done set must beat the previous session best.
    return rows.some(s => {
      if (!s.done || s.failed) return false
      const w = s.weight ?? 0
      const r = s.reps ?? 0
      if (w <= 0 || r <= 0) return false
      return beatsPrevBest(exId, w, r)
    })
  }

  // The set of exIds conquered right now, recomputed from live logged sets on
  // every session change. Drives the persistent gold marking on each card.
  const conqueredSet = useMemo(() => {
    const s = new Set<string>()
    activeExercises.forEach((exDef, exIdx) => {
      if (isConqueredNow(exDef.id, exIdx)) s.add(exDef.id)
    })
    return s
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeExercises])

  // A lift is COMPLETE the moment every one of its sets is logged (done or
  // failed) with at least one done set — that's "you finished this lift",
  // independent of whether it beat a PR. This is what earns the celebratory
  // star burst; conquered (a PR) still drives the persistent gold marker.
  const completedSet = useMemo(() => {
    const s = new Set<string>()
    activeExercises.forEach((exDef, exIdx) => {
      const rows = session[exIdx] ?? []
      if (rows.length > 0 && rows.every(r => r.done || r.failed) && rows.some(r => r.done)) {
        s.add(exDef.id)
      }
    })
    return s
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeExercises])

  // Fire the star burst on the TRANSITION into complete (the final set of a
  // lift was just logged), so finishing ANY lift is celebrated — not only a
  // PR. Reversible: unlog a set and it can re-fire when you finish again.
  // Purely derived from completedSet, so logging/unlogging anywhere triggers it
  // consistently (not just through logSet).
  useEffect(() => {
    const prev = completedPrevRef.current
    completedSet.forEach(exId => {
      if (!prev.has(exId)) {
        setCelebrating(exId)
        setConquerToken(t => t + 1)
        setTimeout(() => setCelebrating(c => (c === exId ? null : c)), 1600)
      }
    })
    completedPrevRef.current = new Set(completedSet)
  }, [completedSet])

  const { total, logged } = useMemo(() => {
    let total = 0
    let logged = 0
    session.forEach(row => row.forEach(set => {
      total += 1
      if (set.done || set.failed) logged += 1
    }))
    return { total, logged }
  }, [session])

  const pct = total === 0 ? 0 : (logged / total) * 100

  // Heavy/Volume is only meaningful when the user actually runs an H/V
  // split (the rotation has at least one VOLUME day). Otherwise the "HEAVY"
  // badge is just noise on every day — hide it. Mirrors the setup wizard's
  // H/V toggle, which is itself derived from "any VOLUME day exists".
  const hvMode = activeSplit.some(d => d.type === 'VOLUME')

  // Finished + saved → take over with the gem celebration. It auto-returns to
  // Today's session after a moment; the button lets the user go right away.
  if (sessionDone) {
    return (
      <CelebrationScreen
        gemGlyph="TROPHY"
        celebrateOnMount
        eyebrow="session complete"
        title={`${day.name} in the books`}
        highlight={day.name}
        sub="Every set saved. Strong work. Recovery starts now."
        slot={verdict ? (
          <SessionVerdictCard
            verdict={verdict}
            dayName={day.name}
            lastDate={verdictLastDate}
            units={units}
          />
        ) : undefined}
        primary={{ label: "Back to today's session", onClick: () => router.push('/app/fitness/log') }}
      />
    )
  }

  return (
    <main className={`${dashboardStyles.page} ${styles.editorialPage} grain-overlay ${offDayLevel ? styles.offActive : ''}`}>
      <ConquerStar token={conquerToken} />
      {/* Editorial atmosphere — mint aurora wash at top, mountain horizon
          at bottom, drifting particles. Matches the canon documented in
          SKILL.md "Editorial visual language" so the day-level logger
          sits in the same publication as the session menu, setup wizard,
          and landing. */}
      <div className={styles.editorialAtmosphere} aria-hidden />

      <div className={styles.editorialMountains} aria-hidden>
        <svg viewBox="0 0 1600 420" preserveAspectRatio="none">
          <defs>
            <linearGradient id="splitlog-mt-far" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d1a17" stopOpacity="0" />
              <stop offset="55%" stopColor="#0d1a17" stopOpacity=".55" />
              <stop offset="100%" stopColor="#0d1a17" stopOpacity=".95" />
            </linearGradient>
            <linearGradient id="splitlog-mt-near" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#050a09" stopOpacity=".4" />
              <stop offset="60%" stopColor="#050a09" stopOpacity=".95" />
              <stop offset="100%" stopColor="#050a09" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path
            d="M0,300 L120,230 L210,260 L320,180 L430,220 L560,150 L680,210 L820,170 L960,220 L1100,180 L1240,240 L1380,200 L1500,250 L1600,220 L1600,420 L0,420 Z"
            fill="url(#splitlog-mt-far)"
          />
          <path
            d="M0,360 L100,320 L220,340 L340,290 L460,330 L590,300 L720,340 L860,310 L1000,350 L1140,310 L1280,355 L1420,320 L1540,360 L1600,340 L1600,420 L0,420 Z"
            fill="url(#splitlog-mt-near)"
          />
        </svg>
      </div>

      <div className={styles.editorialParticles} ref={atmosphereParticlesRef} aria-hidden />

      <div className={`${dashboardStyles.shell} ${styles.editorialShell}`}>
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className={fitnessStyles.header}>
          <div className={styles.topBar}>
            <div className={styles.topBarLeft}>
              <Link href="/app/fitness/log" className={`${fitnessStyles.back} ${styles.backThemed}`}>
                <span className={fitnessStyles.backArrow}>←</span> Today&apos;s session
              </Link>
              {/* Persistent deload badge, right beside "Today's session" so the
                  state is unmistakable. The moon marks the deload week; tap it to
                  end early (same action as the banner's "end"). */}
              {offDayLevel === 'deload' && (
                <button
                  type="button"
                  className={styles.deloadBadge}
                  onClick={endDeloadNow}
                  aria-label="Deload week active — tap to end"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z" />
                  </svg>
                  <span className={styles.deloadBadgeLabel}>deload</span>
                  <span className={styles.deloadBadgeEnd}>end</span>
                </button>
              )}
            </div>
            <div className={styles.topControls}>
              {/* Ask Claude — opens a fresh Claude chat pre-filled with this
                  live session (TrainerDoorway). Zero API cost to us. */}
              {activeExercises.length > 0 && (
                <button
                  type="button"
                  className={`${styles.actionPill} ${styles.askClaudeBtn} ${trainerFiring ? styles.askClaudeFiring : ''}`}
                  onClick={onAskClaude}
                  onAnimationEnd={() => setTrainerFiring(false)}
                  aria-label="Ask Claude about this session"
                >
                  <svg className={styles.actionPillIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
                  </svg>
                  <span className={styles.actionPillLabel}>ask Claude</span>
                </button>
              )}
              {/* Off-day control. Hidden on a rest day (no lifts to ease) and
                  during a deload (the deload badge by "Today's session" is the
                  control then). */}
              {day.exercises.length > 0 && offDayLevel !== 'deload' && (
                <button
                  type="button"
                  className={`${styles.actionPill} ${styles.offDayBtn} ${offDayLevel ? styles.offDayBtnOn : ''}`}
                  onClick={() => setOffDayOpen(true)}
                  aria-label="Off day"
                >
                  <svg className={styles.actionPillIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z" />
                  </svg>
                  <span className={styles.actionPillLabel}>off day</span>
                </button>
              )}
              {activeExercises.length > 1 && (
                <button
                  type="button"
                  className={styles.actionPill}
                  onClick={() => setReorderOpen(true)}
                  aria-label="Reorder lifts"
                >
                  <svg className={styles.actionPillIcon} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 2.5 L4 11.5 M4 2.5 L2 4.5 M4 2.5 L6 4.5" />
                    <path d="M10 11.5 L10 2.5 M10 11.5 L8 9.5 M10 11.5 L12 9.5" />
                  </svg>
                  <span className={styles.actionPillLabel}>reorder lifts</span>
                </button>
              )}
              <button
                type="button"
                className={styles.settingsBtn}
                onClick={() => setSettingsOpen(true)}
                aria-label="Settings"
                title="Settings"
              >
                <SettingsGear />
              </button>
            </div>
          </div>
          {/* The day position now lives in the split rail below the title, so
              the "Day X of N" eyebrow is gone. This line only appears when
              there's save feedback to show (so it never leaves an empty gap). */}
          {(saveStatus !== 'idle' || submittedAt) && (
            <p className={styles.dayEyebrow}>
              {saveStatus !== 'idle' && (
                <span className={`${styles.saveStatus} ${styles[`saveStatus-${saveStatus}`]}`}>
                  {saveStatus === 'saving' && 'saving…'}
                  {saveStatus === 'saved'  && 'saved ✓'}
                  {saveStatus === 'error'  && 'save failed. retry by editing a set'}
                </span>
              )}
              {submittedAt && saveStatus === 'idle' && (
                <span className={styles.submittedFlag}>session locked in</span>
              )}
            </p>
          )}
          <div className={styles.headRow}>
            <h1 className={fitnessStyles.title}>{day.name}</h1>
            {hvMode && (
              <span className={`${styles.dayPill} ${dayTypeClass[day.type]}`}>{day.type}</span>
            )}
          </div>

          {/* ── Split rail ───────────────────────────────────────────
              A pure POSITION indicator: which day of the split you're on.
              Driven entirely by the live split (activeSplit) and the validated
              route day (dayNum), so it survives ANY shape — custom day counts,
              custom/blank names, rest days, duplicate names — and re-renders
              the moment the user edits their split. It makes NO assumptions
              about calendar/"today" or completion (those aren't wired yet), so
              there's nothing to miscount. The viewed day is lit, the rest are
              neutral. Long splits scroll sideways; long names clip. Set counts
              never touch it — it's purely the day list. */}
          {activeSplit.length > 1 && (
            <div className={styles.splitRail} role="list" aria-label="Your split">
              {activeSplit.map((d, i) => {
                const isCurrent = i === dayNum - 1
                const label = d.name && d.name.trim() ? d.name : `Day ${i + 1}`
                // Done (solid fill + check) | current (dotted glow) | partial
                // (logged, not here) | idle. The day you're on reads its DONE
                // state live (submittedAt) so finishing flips it without a reload.
                const st = dayStatuses?.[d.name]
                const completed = isCurrent ? !!submittedAt : !!st?.completed
                const segClass = completed
                  ? styles.railSegDone
                  : isCurrent
                    ? styles.railSegCurrent
                    : st?.inProgress
                      ? styles.railSegPartial
                      : ''
                const stateLabel = completed ? `${label}, done` : isCurrent ? `${label}, in progress` : label
                return (
                  <div
                    key={`rail-${i}`}
                    role="listitem"
                    className={`${styles.railSeg} ${segClass}`}
                    aria-current={isCurrent ? 'true' : undefined}
                  >
                    <span className={styles.railBar} />
                    <span className={styles.railLbl} title={label} aria-label={stateLabel}>
                      {label}
                      {completed && <span className={styles.railCheck} aria-hidden>✓</span>}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Progress ───────────────────────────────────────────── */}
        {day.exercises.length > 0 && (
          <div className={styles.progressRow}>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${pct}%` }} />
            </div>
            <span className={styles.progressLabel}>{logged} of {total} logged</span>
          </div>
        )}

        {/* ── Exercise stack ─────────────────────────────────────── */}
        {offDayLevel && (
          <div className={`${styles.offBanner} ${offDayLevel === 'deload' ? styles.deloadBanner : ''}`} role="status">
            <svg className={styles.offBannerIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z" />
            </svg>
            {offDayLevel === 'deload' ? (
              <>
                <span className={styles.offBannerText}>
                  <b>Deload week.</b>{' '}
                  {deloadTotal > 0
                    ? `${deloadRemaining} of ${deloadTotal} easy sessions left, then back to building.`
                    : 'Today’s session is eased. Baseline safe.'}
                </span>
                <button type="button" className={styles.offBannerUndo} onClick={endDeloadNow}>end</button>
              </>
            ) : (
              <>
                <span className={styles.offBannerText}>
                  <b>Off day{offDayLevel === 'rough' ? ' · pretty rough' : ' · a little off'}.</b> Weights eased, baseline safe.
                </span>
                <button type="button" className={styles.offBannerUndo} onClick={clearOffDay}>undo</button>
              </>
            )}
          </div>
        )}

        {day.exercises.length === 0 ? (
          <div className={styles.restState}>
            <p className={styles.restStateTitle}>
              <em>Rest day.</em>
            </p>
            <p className={styles.restStateBody}>
              Optional active recovery: a walk, light cardio, mobility work. The dashboard logs anything you do; the lift programming resumes tomorrow.
            </p>
            <Link href="/app/fitness/log" className={styles.subtleBtn}>
              <em>← back to today&apos;s session</em>
            </Link>
          </div>
        ) : (
          <div className={styles.exercises}>
            {activeExercises.map((exDef, exIdx) => {
              const ex = resolveDef(exDef.id)
              if (!ex) return null
              const ref = exerciseReferences[exDef.id]
              const md = resolveMuscle(exDef.id)
              // The name is tappable (opens the form card) only when a form
              // reference exists for this lift; otherwise it's plain text.
              const hasFormRef = !!ref
              const history = historyMap[exDef.id] ?? []
              // Day-type-scoped lookup — picks up live edits from the
              // ⚙ ExerciseSettings sheet immediately (see weightOverrides
              // state above + the onSaved callback below).
              const lookedUp = lookupStartingWeight(exDef.id)
              const baseWeight = lookedUp > 0 ? lookedUp : (history.at(-1) ?? 0)
              // When the ★ overload is armed for this lift, the set rows seed
              // from the user-chosen bump for this session: the prescribed
              // weight gets + the chosen kg, and the prescribed reps get + the
              // chosen rep count. Both come from the customizable overload card.
              const armed = armedOverload.has(exDef.id)
              const weightBumpKg = overloadBumpKg(exDef.id)
              const repsBump = overloadBumpReps(exDef.id)
              // Goal met = live, reversible check against logged sets. When met,
              // the star shuts OFF (completed) and the goal label hides; undo a
              // set and it re-arms unchanged. The armed goal itself is never
              // mutated by this — it's sticky in armedOverload until the user
              // clears it in the OverloadModal.
              const goalMet = armed && overloadMet(exDef.id, baseWeight, exDef.reps, exIdx)
              // Off-day mode seeds the eased plan's weight + reps (and ignores any
              // armed overload bump — you're not pushing on a sick day). A normal
              // day keeps the overload bump. The plan is the confirmed/edited
              // target; fall back to the default ease if it's somehow missing.
              const offTarget = offDayLevel ? offDayPlan?.[exDef.id] : undefined
              const lastWeight = offDayLevel
                ? (offTarget ? offTarget.kg : easeWeightKg(offDayLevel, isCompoundLift(exDef.id), baseWeight))
                : (baseWeight > 0 ? baseWeight + weightBumpKg : baseWeight)
              const prescribedReps = offTarget ? offTarget.reps : exDef.reps + repsBump
              const isCelebrating = celebrating === exDef.id
              // Clean, calm conquered marker: stays on while the lift is a
              // fully-logged overload (all sets logged + one beats prevBest).
              // Reversible — clears the moment you unlog or un-complete below it.
              const isConquered = conqueredSet.has(exDef.id)
              // The ★ overload arms a PLANNED bump before you lift, so it only
              // makes sense before anything is logged. Once any set on this lift
              // is logged (done or failed), the star goes inert + dimmed.
              const anyLogged = (session[exIdx] ?? []).some(s => s.done || s.failed)
              const removable = exDef.added || keptIds.has(exDef.id)
              // The chosen bump shown inline next to an armed star, e.g.
              // "+2.5 kg", "+1 rep", or "+2.5 kg · +2 reps".
              const starAmtParts: string[] = []
              if (weightBumpKg > 0) starAmtParts.push('+' + kgToDisplay(weightBumpKg, units) + ' ' + unitLabel(units))
              if (repsBump > 0) starAmtParts.push('+' + repsBump + ' rep' + (repsBump > 1 ? 's' : ''))
              const starAmt = starAmtParts.join(' · ')

              return (
                <Fragment key={`slot-${exDef.id}-${exIdx}`}>
                <article
                  className={`${styles.exercise} ${isConquered ? styles.exerciseConquered : ''} ${isCelebrating ? styles.exerciseCelebrate : ''} ${offTarget && offRevealing ? styles.offReveal : ''}`}
                  style={{ animationDelay: `${120 + exIdx * 50}ms`, ['--exi' as string]: exIdx }}
                >
                  <header className={styles.exerciseHead}>
                    {md && (
                      <span className={styles.exerciseMuscleIcon} aria-hidden>
                        <MuscleIcon name={md.iconKey} size={20} ariaLabel={md.label} />
                      </span>
                    )}
                    <h2 className={styles.exerciseName}>
                      {hasFormRef ? (
                        <button
                          type="button"
                          className={`${styles.nameBtn} ${styles.nameBtnTappable}`}
                          onClick={() => setFormRefOpenExId(exDef.id)}
                          aria-haspopup="dialog"
                          aria-label={`${ex.name} — tap for the form guide`}
                        >
                          {ex.name}
                          <span className={styles.nameInfo} aria-hidden>i</span>
                        </button>
                      ) : (
                        <span className={styles.nameBtn}>{ex.name}</span>
                      )}
                      {/* Clean, calm conquered marker: a small steady gold star
                          beside the name once the lift is a fully-logged
                          overload. No looping animation — reversible with the
                          conquered state. */}
                      {isConquered && (
                        <svg
                          className={styles.conqueredStar}
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-label="Progressive overload conquered"
                          role="img"
                        >
                          <path d="M12 2.5l2.6 5.86 6.4.62-4.83 4.24 1.43 6.28L12 16.9l-5.6 2.6 1.43-6.28L3 8.98l6.4-.62L12 2.5z" />
                        </svg>
                      )}
                    </h2>
                    {/* ✕ remove — top-right of the head. Shown on EVERY lift now;
                        a tap opens a confirm card (data is safe, this only takes
                        the lift out of the split). See confirmRemoveIdx below. */}
                    <button
                      type="button"
                      className={styles.del}
                      onClick={() => setConfirmRemoveIdx(exIdx)}
                      aria-label={`Remove ${ex.name}`}
                      title="Remove lift"
                    >
                      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                        <path d="M3.5 3.5 L10.5 10.5 M10.5 3.5 L3.5 10.5" />
                      </svg>
                    </button>
                  </header>

                  <p className={`${styles.exerciseMeta} ${offTarget ? styles.exerciseMetaOff : ''}`}>
                    <span className={styles.tier}>{TIER_LABEL[ex.tier]}</span>
                    <span className={styles.metaSep}>·</span>
                    {offTarget ? (
                      <span className={styles.offNow}>{offTarget.sets} × {offTarget.reps} · {kgToDisplay(offTarget.kg, units)} {unitLabel(units)}</span>
                    ) : (
                      <>
                        <span>{exDef.sets} × {exDef.reps}</span>
                        <span className={styles.metaSep}>·</span>
                        <span>last {kgToDisplay(baseWeight, units)} {unitLabel(units)}</span>
                      </>
                    )}
                  </p>

                  {removable && (
                    <p className={styles.addedTag}>
                      <span className={styles.addedDot} aria-hidden />
                      {exDef.added ? 'added today' : 'in your split'}
                      {/* "keep" adds the lift to the split, which needs a library
                          entry to stay resolvable. A just-for-log one-off has
                          none, so it only gets "remove" (the ✕ in the head). */}
                      {exDef.added && !isJustForLog(exDef.id) && (
                        <button
                          type="button"
                          className={styles.keepBtn}
                          onClick={() => keepExercise(exIdx)}
                        >
                          keep
                        </button>
                      )}
                    </p>
                  )}

                  {/* Actions row: swap · history · tune · ★ (one star, at the end). */}
                  <div className={styles.actionsRow}>
                    {/* ⇄ Swap — opens a centered modal (SwapModal) with matched
                        alternatives + a searchable library. In-session swap only. */}
                    <button
                      type="button"
                      className={styles.actionPill}
                      onClick={() => setSwapOpenIdx(exIdx)}
                      aria-label={`Swap ${ex.name} for another exercise`}
                      aria-haspopup="dialog"
                    >
                      <svg className={styles.actionPillIcon} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M2 4 L11 4" />
                        <polyline points="9,2 11,4 9,6" />
                        <path d="M12 10 L3 10" />
                        <polyline points="5,8 3,10 5,12" />
                      </svg>
                      <span className={styles.actionPillLabel}>swap</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.actionPill} ${showHistoryNudge ? styles.actionPillNudge : ''}`}
                      onClick={() => { setHistoryOpenExId(exDef.id); dismissHistoryNudge() }}
                      aria-label={`History for ${ex.name}`}
                    >
                      <svg className={styles.actionPillIcon} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M2 10 L5 7 L7.5 9 L12 4" />
                        <path d="M9 4 L12 4 L12 7" />
                      </svg>
                      <span className={styles.actionPillLabel}>history</span>
                    </button>
                    {/* Tune — opens the ExerciseSettings modal card (rendered at
                        the bottom of this component). Persists via its onSaved. */}
                    <button
                      type="button"
                      className={styles.actionPill}
                      onClick={() => setSettingsOpenExId(exDef.id)}
                      aria-haspopup="dialog"
                      aria-label={`Tune weight and sets for ${ex.name}`}
                    >
                      <svg className={styles.actionPillIcon} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="2" y1="4.5" x2="12" y2="4.5" />
                        <circle cx="9" cy="4.5" r="1.6" fill="currentColor" stroke="none" />
                        <line x1="2" y1="9.5" x2="12" y2="9.5" />
                        <circle cx="5" cy="9.5" r="1.6" fill="currentColor" stroke="none" />
                      </svg>
                      <span className={styles.actionPillLabel}>tune</span>
                    </button>
                    {/* ★ progressive-overload — opens the overload card, where the
                        user arms / clears a session bump (+2.5kg/+5lb) for this lift,
                        reflected in the set rows' seeded weight. The star matches the
                        serif ★ used by the history dots' PR mark. It arms a PLANNED
                        bump BEFORE lifting, so once any set is logged it goes inert +
                        dimmed: tapping does nothing (no OverloadModal). */}
                    <button
                      type="button"
                      className={`${styles.starPill} ${armed && !goalMet ? styles.starPillArmed : ''} ${goalMet ? styles.starPillDone : ''} ${anyLogged && !goalMet ? styles.starPillInert : ''}`}
                      onClick={() => { if (anyLogged) return; if (offDayLevel) setOffOverloadNoteExId(exDef.id); else setOverloadOpenExId(exDef.id) }}
                      disabled={anyLogged}
                      aria-disabled={anyLogged}
                      aria-pressed={armed && !goalMet}
                      aria-haspopup="dialog"
                      aria-label={goalMet ? `Overload goal met for ${ex.name}` : anyLogged ? `Progressive overload unavailable once sets are logged for ${ex.name}` : armed ? `Overload set for ${ex.name}, tap to change` : `Progressive overload for ${ex.name}`}
                      title={goalMet ? 'Overload goal met' : anyLogged ? 'Set the overload before you log a set' : 'Progressive overload'}
                    >
                      <span className={styles.starDots} aria-hidden>
                        <span className={styles.starDot} />
                        <span className={styles.starDot} />
                      </span>
                      <span className={styles.starGlyph} aria-hidden>★</span>
                    </button>
                    {armed && !goalMet && <span className={styles.starAmt}>{starAmt}</span>}
                  </div>

                  <div className={styles.pills}>
                    {session[exIdx]?.map((set, setIdx) => {
                      const kind = classify(set, exDef.reps) as PillKind
                      const isPRSet = isPR(exDef.id, set, exDef.reps)
                      return (
                        <SetPill
                          key={setIdx}
                          idx={setIdx}
                          prescribedWeight={lastWeight}
                          prescribedReps={prescribedReps}
                          currentWeight={set.weight}
                          currentReps={set.reps}
                          kind={kind}
                          isPR={isPRSet}
                          units={units}
                          perHand={!!ex.perHand}
                          // Off-day: stack the normal-day prescription, struck, above
                          // the eased value inside the pill.
                          wasWeightKg={offTarget ? baseWeight : null}
                          wasReps={exDef.reps}
                          onLog={(w, r) => logSet(exIdx, setIdx, w, r)}
                          onMiss={() => toggleFailed(exIdx, setIdx)}
                          onUndo={() => undoSet(exIdx, setIdx)}
                        />
                      )
                    })}
                    {/* Dropped sets: shown briefly on confirm, struck out, then poofed. */}
                    {offTarget && offRevealing && !anyLogged && Array.from({ length: Math.max(0, exDef.sets - offTarget.sets) }).map((_, k) => (
                      <div key={`cut-${k}`} className={styles.offCutRow} style={{ ['--ri' as string]: offTarget.sets + k }}>
                        <span className={styles.offCutStrike}>
                          {baseWeight > 0 ? kgToDisplay(baseWeight, units) : kgToDisplay(offTarget.kg, units)}<u>{unitLabel(units)}</u> × {exDef.reps}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
                </Fragment>
              )
            })}
            <button
              type="button"
              className={styles.addLift}
              onClick={() => setAddOpenIdx(activeExercises.length)}
              aria-label="Add an exercise at the end"
            >
              <span className={styles.addLiftRing} aria-hidden>
                <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                  <path d="M7 3 V11 M3 7 H11" />
                </svg>
              </span>
              <span className={styles.addLiftLabel}>add a lift</span>
            </button>
          </div>
        )}

        {/* ── Optional cardio ────────────────────────────────────── */}
        {day.exercises.length > 0 && (
          <section className={styles.cardioSection} aria-label="Optional cardio">
            <div className={styles.cardioHead}>
              <span className={styles.cardioEyebrow}>After the lifts</span>
              <div className={styles.cardioHeadRow}>
                <svg
                  className={styles.cardioPulse}
                  viewBox="0 0 30 24"
                  width="30"
                  height="24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M0 12h7l3-7 5 14 3-7h9" />
                </svg>
                <h2 className={styles.cardioTitle}>Cardio</h2>
                <span className={styles.cardioRule} aria-hidden />
              </div>
            </div>

            {/* Zone 2 today — the value readout. */}
            {cardio.length > 0 && (
              <div className={styles.cardioSummary}>
                <span className={styles.cardioSummaryLabel}>Zone 2 today</span>
                <div className={styles.cardioSummaryBig}>
                  {cardioZ2}<small>min in Z2</small>
                </div>
                <p className={styles.cardioSummaryLine}>
                  {cardioMins > 0
                    ? <><b>{cardioPct}%</b> of your {cardioMins} min was zone 2</>
                    : <>{cardio.length} {cardio.length > 1 ? 'bouts' : 'bout'} logged</>}
                </p>
                <div className={styles.cardioMeter}>
                  <i style={{ width: `${cardioPct}%` }} />
                </div>
              </div>
            )}

            {cardio.length > 0 && (
              <div className={styles.cardioList} ref={cardioListRef}>
                {cardio.map((c, i) => (
                  <div key={i} className={styles.cardioRow}>
                    <span className={styles.cardioIcon}>
                      <CardioGlyph type={c.type} />
                    </span>
                    <span className={styles.cardioName}>{c.label}</span>
                    <label className={styles.cardioField}>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        className={styles.cardioInput}
                        value={c.durationMin ?? ''}
                        placeholder="0"
                        onChange={e => updateCardio(i, { durationMin: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0) })}
                        aria-label={`${c.label} total minutes`}
                      />
                      <span className={styles.cardioUnit}>min</span>
                    </label>
                    <label className={`${styles.cardioField} ${styles.cardioFieldZ2}`}>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        className={styles.cardioInput}
                        value={c.zone2Min ?? ''}
                        placeholder="0"
                        onChange={e => updateCardio(i, { zone2Min: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0) })}
                        aria-label={`${c.label} minutes in zone 2`}
                      />
                      <span className={styles.cardioUnit}>in Z2</span>
                    </label>
                    <button
                      type="button"
                      className={styles.cardioRemove}
                      onClick={() => removeCardio(i)}
                      aria-label={`Remove ${c.label}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {cardioPickerOpen ? (
              <div className={styles.cardioPicker} role="listbox" aria-label="Pick a cardio type">
                <div className={styles.cardioPickerTop}>
                  <span className={styles.cardioPickerLabel}>Pick your cardio</span>
                  <button
                    type="button"
                    className={styles.cardioPickerClose}
                    onClick={() => setCardioPickerOpen(false)}
                    aria-label="Cancel"
                  >
                    ×
                  </button>
                </div>
                <div className={styles.cardioTiles}>
                  {CARDIO_TYPES.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      className={styles.cardioTile}
                      onClick={() => addCardio(t.id)}
                    >
                      <CardioGlyph type={t.id} />
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : cardio.length > 0 ? (
              <button
                type="button"
                className={styles.cardioAddSm}
                onClick={() => setCardioPickerOpen(true)}
              >
                <span className={styles.cardioAddPlus} aria-hidden>+</span>
                Add more
              </button>
            ) : (
              <div className={styles.cardioInvite}>
                <p className={styles.cardioInviteLine}>Cap the session with a little <b>zone 2</b>.</p>
                <p className={styles.cardioInviteSub}>A walk, a run, anything easy. It builds the aerobic base your lifts sit on.</p>
                <div className={styles.cardioInviteRail} aria-hidden>
                  {CARDIO_TYPES.slice(0, 5).map(t => (
                    <span key={t.id} className={styles.cardioInviteChip}>
                      <CardioGlyph type={t.id} />
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.cardioInviteBtn}
                  onClick={() => setCardioPickerOpen(true)}
                >
                  <span className={styles.cardioAddPlus} aria-hidden>+</span>
                  Add cardio
                </button>
              </div>
            )}
          </section>
        )}

        {/* ── Footer actions ─────────────────────────────────────── */}
        {day.exercises.length > 0 && (
          <div className={styles.footer}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={logged === 0 || saveStatus === 'saving'}
              onClick={finishSession}
            >
              {submittedAt ? 're-lock session' : 'finish session'}
            </button>
          </div>
        )}
      </div>

      {/* ── Remove-lift confirm card ─────────────────────────────────
          A centered "are you sure" card before pulling a lift out of the
          split. Reassures that logged history is safe (it lives in `workouts`,
          untouched) and points to where to re-add it. */}
      {/* ── Reorder lifts card ───────────────────────────────────── */}
      {offDayOpen && (
        <OffDayFlow
          units={units}
          lifts={activeExercises.map(exDef => ({
            id: exDef.id,
            name: resolveDef(exDef.id)?.name ?? exDef.id,
            compound: isCompoundLift(exDef.id),
            sets: exDef.sets,
            reps: exDef.reps,
            baseKg: lookupStartingWeight(exDef.id),
          }))}
          onConfirm={confirmOffDay}
          onDeload={openDeloadConfirm}
          onClose={() => setOffDayOpen(false)}
        />
      )}

      {deloadConfirmOpen && (
        <DeloadConfirm
          dayNames={Array.from(new Set(activeSplit.filter(d => d.exercises.length > 0).map(d => d.name)))}
          onConfirm={confirmDeload}
          onClose={() => setDeloadConfirmOpen(false)}
        />
      )}

      {reorderOpen && (
        <div
          className={styles.reorderOverlay}
          onClick={() => setReorderOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Reorder lifts"
        >
          <div className={styles.reorderCard} onClick={e => e.stopPropagation()}>
            <header className={styles.reorderCardHead}>
              <div>
                <p className={styles.reorderEyebrow}>reorder</p>
                <h3 className={styles.reorderCardTitle}>{day.name} lifts</h3>
              </div>
              <button
                type="button"
                className={styles.reorderCardDone}
                onClick={() => setReorderOpen(false)}
              >
                Done
              </button>
            </header>
            <p className={styles.reorderHint}>Use the arrows to set the order you train in.</p>
            <ol className={styles.reorderList}>
              {activeExercises.map((exDef, i) => {
                const roEx = resolveDef(exDef.id)
                return (
                  <li key={`ro-${exDef.id}-${i}`} className={styles.reorderRow}>
                    <span className={styles.reorderNum}>{i + 1}</span>
                    <span className={styles.reorderName}>{roEx?.name ?? exDef.id}</span>
                    <span className={styles.reorderArrows}>
                      <button
                        type="button"
                        onClick={() => moveExercise(i, -1)}
                        disabled={i === 0}
                        aria-label={`Move ${roEx?.name ?? 'lift'} up`}
                      >
                        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3.5 9 L7 5.5 L10.5 9" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => moveExercise(i, 1)}
                        disabled={i === activeExercises.length - 1}
                        aria-label={`Move ${roEx?.name ?? 'lift'} down`}
                      >
                        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3.5 5 L7 8.5 L10.5 5" />
                        </svg>
                      </button>
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      )}

      {confirmRemoveIdx >= 0 && activeExercises[confirmRemoveIdx] && (() => {
        const exDef = activeExercises[confirmRemoveIdx]
        const name = resolveDef(exDef.id)?.name ?? 'this lift'
        const close = () => setConfirmRemoveIdx(-1)
        return (
          <div className={styles.confirmOverlay} onClick={close} role="dialog" aria-modal="true" aria-label={`Remove ${name}`}>
            <div className={styles.confirmCard} onClick={e => e.stopPropagation()}>
              <h3 className={styles.confirmTitle}>Remove {name}?</h3>
              <p className={styles.confirmBody}>
                Your logged history is kept. This only removes it from your {day.name} day.
              </p>
              <div className={styles.confirmActions}>
                <button type="button" className={styles.confirmKeep} onClick={close}>Keep it</button>
                <button
                  type="button"
                  className={styles.confirmRemove}
                  onClick={() => { removeExercise(confirmRemoveIdx); close() }}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── History modal ────────────────────────────────────────── */}
      {historyOpenExId && (
        <HistoryModal
          exerciseId={historyOpenExId}
          exerciseName={resolveDef(historyOpenExId)?.name ?? historyOpenExId}
          userId={userId}
          units={units}
          onClose={() => setHistoryOpenExId(null)}
        />
      )}

      {/* ── Off-day overload note ─ a kind "rest, don't push" nudge ── */}
      {offOverloadNoteExId && (
        <div
          className={styles.offNoteOverlay}
          onClick={() => setOffOverloadNoteExId(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Take it easy today"
        >
          <div className={styles.offNoteCard} onClick={e => e.stopPropagation()}>
            <span className={styles.offNoteStar} aria-hidden>★</span>
            <h3 className={styles.offNoteTitle}>Not today</h3>
            <p className={styles.offNoteBody}>
              You said you&apos;re not feeling your best, so there&apos;s nothing to prove.
              Skip the push today and your overload will be right here when you&apos;re back.
            </p>
            <button
              type="button"
              className={styles.offNoteOk}
              onClick={() => setOffOverloadNoteExId(null)}
            >
              okay, rest
            </button>
            <button
              type="button"
              className={styles.offNoteAnyway}
              onClick={() => { const id = offOverloadNoteExId; setOffOverloadNoteExId(null); setOverloadOpenExId(id) }}
            >
              use it anyway
            </button>
          </div>
        </div>
      )}

      {/* ── Progressive-overload card ────────────────────────────── */}
      {overloadOpenExId && (() => {
        const exId = overloadOpenExId
        const exIdx = activeExercises.findIndex(e => e.id === exId)
        const exDef = exIdx >= 0 ? activeExercises[exIdx] : undefined
        const ex = resolveDef(exId)
        if (!exDef || !ex) return null
        const md = resolveMuscle(exId)
        const baseKg = lookupStartingWeight(exId)
        const history = historyMap[exId] ?? []
        const lastKg = baseKg > 0 ? baseKg : (history.at(-1) ?? 0)
        // "Last session" must read from real logged history, never the live
        // (possibly just-tuned) prescription — otherwise a tune + ★ shows up as
        // your previous session. Fall back to the prescription only for a
        // first-ever lift with no logged history.
        const prev = prevSession?.[exId] ?? null
        return (
          <OverloadModal
            exerciseName={ex.name}
            muscleIcon={md ? <MuscleIcon name={md.iconKey} size={20} ariaLabel={md.label} /> : null}
            bump={overloadBump(exId)}
            units={units}
            lastWeightKg={prev ? prev.weight : lastKg}
            lastSets={prev ? prev.sets : exDef.sets}
            lastReps={prev ? prev.reps : exDef.reps}
            onArm={(bump) => armOverload(exId, bump)}
            onClear={() => clearOverload(exId)}
            onClose={() => setOverloadOpenExId(null)}
          />
        )
      })()}

      {/* ── Form reference sheet (demo photos + instructions) ──── */}
      {formRefOpenExId && EX[formRefOpenExId] && (
        <FormReferenceSheet
          exerciseId={formRefOpenExId}
          exerciseName={EX[formRefOpenExId].name}
          tier={EX[formRefOpenExId].tier}
          onClose={() => setFormRefOpenExId(null)}
        />
      )}

      {/* ── Swap modal (matched alternatives + searchable library) ── */}
      {swapOpenIdx !== null && (() => {
        const exIdx = swapOpenIdx
        const exDef = activeExercises[exIdx]
        if (!exDef) return null
        // The lift's current target weight on this day — same value the
        // recommended-alt converter and library fallback both build on.
        const lastWeight = lookupStartingWeight(exDef.id)
        // 1-2 biomechanically matched alternatives. Weight placeholder = the
        // user's OWN logged/remembered weight for that alt if they have one,
        // else the system estimate (source weight converted via the coef).
        const recommendations = getAlternatives(exDef.id)
          .map(alt => {
            const altDef = EX[alt.id]
            if (!altDef) return null
            const own = lookupStartingWeight(alt.id)
            return { id: alt.id, name: altDef.name, weightKg: own > 0 ? own : lastWeight * alt.coef }
          })
          .filter((r): r is { id: string; name: string; weightKg: number } => r !== null)
        const recIds = new Set(recommendations.map(r => r.id))
        // Everything else in the library, searchable. Seed weight = the lift's
        // own remembered base (override/history) if any, else the source weight.
        const library = Object.keys(EX)
          .filter(id => id !== exDef.id && !recIds.has(id))
          .map(id => {
            const own = lookupStartingWeight(id)
            const md = exerciseMuscleDisplay(id)
            return {
              id,
              name: EX[id].name,
              muscle: md?.primaryLabel ?? null,
              weightKg: own > 0 ? own : lastWeight,
              hasHistory: own > 0,
            }
          })
          .sort((a, b) => a.name.localeCompare(b.name))
        return (
          <SwapModal
            sourceName={resolveDef(exDef.id)?.name ?? exDef.id}
            dayType={day.type}
            units={units}
            recommendations={recommendations}
            library={library}
            onSelect={(newId, weightKg) => {
              swapExercise(exIdx, newId, weightKg)
              setSwapOpenIdx(null)
              // Chain straight into Tune for the new lift so the user can dial
              // in weight / sets / reps on the swap immediately. The seeded
              // weight (own history, else estimate) pre-fills the Tune weight.
              setSettingsOpenExId(newId)
            }}
            onClose={() => setSwapOpenIdx(null)}
          />
        )
      })()}

      {/* ── Add-exercise picker (inline +) ──────────────────────── */}
      {addOpenIdx !== null && (() => {
        // Lifts already on today's session — excluded from the picker so you
        // never see (or duplicate) something you've already got.
        const onDayIds = new Set(activeExercises.map(e => e.id))
        // The rest of the library, searchable — built-in EX lifts plus the
        // user's own custom lifts. Seed weight = the lift's own remembered
        // base/history if any, else 0 (no source lift to inherit).
        const builtin = Object.keys(EX)
          .filter(id => !onDayIds.has(id))
          .map(id => {
            const own = lookupStartingWeight(id)
            const md = exerciseMuscleDisplay(id)
            return {
              id,
              name: EX[id].name,
              muscle: md?.primaryLabel ?? null,
              weightKg: own,
              hasHistory: own > 0,
            }
          })
        const custom = customList
          .filter(c => !onDayIds.has(c.id))
          .map(c => {
            const own = lookupStartingWeight(c.id)
            return { id: c.id, name: c.name, muscle: c.muscle ? MUSCLE_ICON_LABEL[c.muscle] : null, weightKg: own, hasHistory: own > 0 }
          })
        const library = [...builtin, ...custom].sort((a, b) => a.name.localeCompare(b.name))
        return (
          <SwapModal
            mode="add"
            sourceName="Add a lift"
            dayType={day.type}
            units={units}
            recommendations={[]}
            library={library}
            onSelect={(newId, weightKg) => addExerciseAt(addOpenIdx, newId, weightKg)}
            onCreateCustom={name => {
              // Don't create/add yet — start the wizard. The lift is only made
              // real after the user names it (NameLiftCard) and saves the
              // mandatory Setup (commitNewLift). Default to keeping it in the
              // library; the Name step's toggle flips it to just-for-log.
              setCreateFlow({ step: 'name', name, insertIdx: addOpenIdx, keepInLibrary: true, muscle: null })
              setAddOpenIdx(null)
            }}
            onClose={() => setAddOpenIdx(null)}
          />
        )
      })()}

      {/* ── Build-a-lift wizard · step 1: name ──────────────────── */}
      {createFlow?.step === 'name' && (
        <NameLiftCard
          initialName={createFlow.name}
          initialKeepInLibrary={createFlow.keepInLibrary}
          initialMuscle={createFlow.muscle}
          dayType={day.type}
          onBack={() => {
            // Step back to the search picker at the same gap.
            const idx = createFlow.insertIdx
            setCreateFlow(null)
            setAddOpenIdx(idx)
          }}
          onNext={(name, keepInLibrary, muscle) => setCreateFlow({
            step: 'tune', name, keepInLibrary, muscle, insertIdx: createFlow.insertIdx, tune: createFlow.tune,
          })}
        />
      )}

      {/* ── Build-a-lift wizard · step 2: mandatory Setup ───────────
          The Tune card in `creating` mode (step rail + "add to today"). Save →
          commitNewLift creates + adds the lift. back → Name (keeping values).
          cancel/backdrop → discard; nothing is created or added. */}
      {createFlow?.step === 'tune' && (() => {
        const reps = day.type === 'HEAVY' ? 6 : day.type === 'VOLUME' ? 12 : 10
        // A brand-new custom lift has no library context for rest, so start at a
        // neutral 1:00 rather than borrowing the generic "iso" recommendation
        // (which read as a real suggestion when it wasn't one).
        const defaultRest = 60
        const t = createFlow.tune
        return (
          <ExerciseSettings
            creating
            hasRecommendation={false}
            exerciseId=""
            exerciseName={createFlow.name}
            dayType={day.type}
            dayNum={dayNum}
            currentWeight={t?.weightKg ?? 0}
            currentSets={t?.sets ?? 3}
            defaultSets={3}
            currentReps={t?.reps ?? reps}
            defaultReps={reps}
            currentRest={t?.rest ?? defaultRest}
            defaultRest={defaultRest}
            loggedSetCount={0}
            units={units}
            onSaved={(weight, sets, r, rest) =>
              commitNewLift(createFlow.insertIdx, createFlow.name, weight, sets, r, rest, createFlow.keepInLibrary, createFlow.muscle)}
            onBack={(vals) => setCreateFlow({
              step: 'name', name: createFlow.name, keepInLibrary: createFlow.keepInLibrary, muscle: createFlow.muscle,
              insertIdx: createFlow.insertIdx, tune: vals,
            })}
            onClose={() => setCreateFlow(null)}
          />
        )
      })()}

      {/* ── Shared settings sheet (units + edit setup) ──────────── */}
      <TrainerDoorway
        open={trainerOpen}
        onClose={() => setTrainerOpen(false)}
        snapshot={
          trainerOpen
            ? buildTrainerSnapshot()
            : { dayName: day.name, unitLabel: unitLabel(units), exercises: [], focusName: null }
        }
        onBeforeOpen={() => saverRef.current?.flushNow()}
      />
      {settingsOpen && (
        <SettingsSheet
          units={units}
          onUnitsChange={toggleUnits}
          intakeCompleted={intakeCompleted}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* ── Per-exercise settings sheet ─────────────────────────── */}
      {settingsOpenExId && (() => {
        const exIdx = activeExercises.findIndex(e => e.id === settingsOpenExId)
        const exDef = exIdx >= 0 ? activeExercises[exIdx] : undefined
        if (!exDef || exIdx < 0) return null
        // The split's default prescription — used by the modal's "reset" link.
        // SPLIT is the immutable Vitality 8-day seed; this is the canonical answer
        // to "what was it originally?" before any user override.
        const defaultDay = SPLIT.find(d => d.day === dayNum)
        const defaultEx = defaultDay?.exercises.find(e => e.id === settingsOpenExId)
        const defaultSets = defaultEx?.sets ?? exDef.sets
        const defaultReps = defaultEx?.reps ?? exDef.reps
        // Rest: tier×day-type default, and the current value (saved override
        // if any, else that default). Keyed by exId + day type like weight.
        const restKey = `${settingsOpenExId}__${day.type}`
        const exTier = resolveDef(settingsOpenExId)?.tier
        const defaultRest = exTier ? REST_SEC[exTier][day.type] : 120
        const currentRest = restOverrides[restKey] ?? defaultRest
        // How many sets has the user already touched? Used to block shrinking
        // past logged data.
        const sessionRows = session[exIdx] ?? []
        let loggedSetCount = 0
        for (let i = 0; i < sessionRows.length; i++) {
          const s = sessionRows[i]
          if (s.done || s.failed) loggedSetCount = i + 1
        }
        // Tune always opens on the BASE weight the user last set (the saved
        // override → lookupStartingWeight). Logging a set does NOT rewrite the
        // base, so a tuned value (e.g. 80) sticks in Tune even if an earlier
        // set was logged at a different weight (75). Predictable: Tune = your
        // base, not an average of what you happened to lift.
        return (
          <ExerciseSettings
            exerciseId={settingsOpenExId}
            exerciseName={resolveDef(settingsOpenExId)?.name ?? settingsOpenExId}
            dayType={day.type}
            dayNum={dayNum}
            // Only built-in lifts carry a real rest recommendation; custom/just-
            // for-log lifts use a neutral fallback, so hide the "reset" link.
            hasRecommendation={!!EX[settingsOpenExId]}
            currentWeight={lookupStartingWeight(settingsOpenExId)}
            currentSets={sessionRows.length || exDef.sets}
            defaultSets={defaultSets}
            currentReps={exDef.reps}
            defaultReps={defaultReps}
            currentRest={currentRest}
            defaultRest={defaultRest}
            loggedSetCount={loggedSetCount}
            units={units}
            onSaved={(weight, sets, reps, rest) => {
              // 0) Rest override — applies to the next rest timer immediately.
              setRestOverrides(prev => ({ ...prev, [restKey]: rest }))
              // 1) Weight override — applies immediately via lookupStartingWeight.
              setWeightOverrides(prev => ({
                ...prev,
                [`${settingsOpenExId}__${day.type}`]: weight,
              }))
              // 2) Re-shape session[exIdx]: a tune re-prescribes the whole
              //    lift, so EVERY unlogged row resets to empty — it then
              //    re-prefills at the tuned weight × reps. This is why a value
              //    you'd typed into an unlogged pill (e.g. 10) snaps to the new
              //    tune (5) instead of sticking. Already-logged rows (done /
              //    failed) keep their recorded data — a tune never rewrites
              //    history. Then grow/shrink to the new set count, never below
              //    the rows already logged.
              setSession(prev => {
                const next = prev.map(row => row.slice())
                const reset = next[exIdx].map(s => (s.done || s.failed) ? s : emptySet())
                if (sets > reset.length) {
                  while (reset.length < sets) reset.push(emptySet())
                } else if (sets < reset.length) {
                  let liveLogged = 0
                  for (let i = 0; i < reset.length; i++) {
                    if (reset[i].done || reset[i].failed) liveLogged = i + 1
                  }
                  reset.length = Math.max(sets, liveLogged)
                }
                next[exIdx] = reset
                sessionRef.current = next
                return next
              })
              // 3) Update the slot's prescription so the meta line ("3 × 5")
              //    and every unlogged pill's target reps reflect the new
              //    sets/reps right away (exDef.reps drives pill classification).
              setActiveExercises(prev => {
                const next = [...prev]
                if (next[exIdx]) next[exIdx] = { ...next[exIdx], sets, reps }
                activeExercisesRef.current = next
                return next
              })
              // 4) Persist the shape change immediately so a refresh hydrates
              //    with the new count (rotation_days has the new sets too, but
              //    the workouts row needs the new shape for hydration).
              saverRef.current?.flushNow()
            }}
            onClose={() => setSettingsOpenExId(null)}
          />
        )
      })()}

      {/* ── Floating rest timer ──────────────────────────────────── */}
      {restTimer && (
        <div
          className={`${styles.restPill} ${restTimer.done ? styles.restPillDone : ''}`}
          role="status"
          aria-live="polite"
        >
          {restTimer.done ? (
            <div className={styles.restBody}>
              <span className={styles.restGo}>GO →</span>
              <span className={styles.restLabel}>{restTimer.exerciseName}</span>
            </div>
          ) : (
            <>
              <button
                type="button"
                className={styles.restAdjust}
                onClick={() => setRestTimer(t => {
                  if (!t) return t
                  const left = Math.max(15, t.secondsLeft - 15)
                  return { ...t, secondsLeft: left, endsAt: Date.now() + left * 1000 }
                })}
                aria-label="Subtract 15 seconds"
              >
                −15
              </button>
              <div className={styles.restBody}>
                <span className={styles.restTime}>{fmtTime(restTimer.secondsLeft)}</span>
                <span className={styles.restLabel}>{restTimer.exerciseName}</span>
              </div>
              <button
                type="button"
                className={styles.restAdjust}
                onClick={() => setRestTimer(t => {
                  if (!t) return t
                  const left = t.secondsLeft + 15
                  return { ...t, secondsLeft: left, endsAt: Date.now() + left * 1000 }
                })}
                aria-label="Add 15 seconds"
              >
                +15
              </button>
              <button
                type="button"
                className={styles.restDismiss}
                onClick={() => setRestTimer(null)}
                aria-label="Dismiss rest timer"
              >
                ×
              </button>
            </>
          )}
        </div>
      )}
    </main>
  )
}
