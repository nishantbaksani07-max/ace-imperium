'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition, useEffect, useRef } from 'react'
import dashboardStyles from '../../dashboard.module.css'
import fitnessStyles from '../fitness.module.css'
import styles from './setup.module.css'
import {
  PRESETS,
  recommendIntake,
  type Preset,
  type PresetDay,
  type SplitLevel,
  type IntakeAnswers,
  type IntakeRecommendation,
  type ActiveRest,
  type RecommendationFactor,
} from './presets'
import { type DayExercise } from '../log/splitData'
import { saveTrainingSetup, saveIntakeAnswers } from './actions'
import { gymLevelFromIntake } from './gymLevel'
import ExercisePicker from './ExercisePicker'
import IntakeQuiz from './IntakeQuiz'
import TuneCoachmark from '../log/TuneCoachmark'
import QuizComplete from '@/components/QuizComplete'
import WelcomeBackdrop from '@/components/WelcomeBackdrop'
import SectionGem from '@/components/SectionGem'
import { recommendExercises, type RecommendationReason } from './exerciseSelection'
import ActivityPickerSheet, { activityDisplay } from './ActivityPickerSheet'
import type { GoalPreferences } from '@/lib/preferences'

interface InitialProfile {
  firstName: string
  sex: 'M' | 'F'
  heightCm: number
  startingWeightKg: number
  units: 'metric' | 'imperial'
}

interface SetupWizardProps {
  /** Existing user_profile data, or null if missing (stale-data heal path). */
  initialProfile: InitialProfile | null
  existingDays: PresetDay[] | null
  /** Previously-saved tailored-intake snapshot. Null until the quiz is taken. */
  existingIntakeAnswers: IntakeAnswers | null
  existingIntakeRec: IntakeRecommendation | null
  isEditing: boolean
  /** Open the intake quiz immediately on mount (from `?intake=open`). */
  autoOpenIntake: boolean
  /** Deep-link straight into one saved day's exercise editor (swipe-left on
   *  a SessionMenu day tile). 0-based index into the saved rotation, or null
   *  for the normal full wizard. */
  focusDayIdx?: number | null
  /** Vitality Goal preferences, when the user has completed the Goal
   *  quiz. Threaded into recommendIntake() + recommendExercises() as a
   *  strategic overlay (Goal = intent, intake = capacity). Null when
   *  Goal hasn't been set — both functions degrade to their pre-Goal
   *  behavior in that case. */
  goal: GoalPreferences | null
}

type Step = 1 | 2 | 3
type Units = 'metric' | 'imperial'
type SelectedPresetId = Preset['id'] | 'current'

const TOTAL_STEPS = 3

const TYPE_OPTIONS: PresetDay['type'][] = ['HEAVY', 'VOLUME', 'RECOVERY']

/** Short label for the locked day-type tag on a heavy+volume preset. */
const DAY_TYPE_LABEL_SHORT: Record<PresetDay['type'], string> = {
  HEAVY: 'Heavy',
  VOLUME: 'Volume',
  RECOVERY: 'Rest',
}

/** Common day names → category, for the name autocomplete on custom days.
 *  Picking a suggestion sets the name AND the category, so the next step's
 *  exercise picker is filtered to the right group (a "Legs" day shows leg
 *  lifts, not the default push list). Push/Pull/Legs/Upper/Lower map exactly;
 *  the body-part names map to their nearest group. */
const DAY_NAME_LIBRARY: { name: string; category: PresetDay['category'] }[] = [
  { name: 'Push', category: 'push' },
  { name: 'Pull', category: 'pull' },
  { name: 'Legs', category: 'legs' },
  { name: 'Upper', category: 'upper' },
  { name: 'Lower', category: 'lower' },
  { name: 'Chest', category: 'push' },
  { name: 'Back', category: 'pull' },
  { name: 'Shoulders', category: 'push' },
  { name: 'Arms', category: 'pull' },
]

const KG_PER_LB = 0.453592

export default function SetupWizard({
  initialProfile,
  existingDays,
  existingIntakeAnswers,
  existingIntakeRec,
  isEditing,
  autoOpenIntake,
  focusDayIdx = null,
  goal,
}: SetupWizardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const particlesRef = useRef<HTMLDivElement | null>(null)

  // Drifting mint-particle field (same recipe as the landing / SessionMenu).
  // vh-based translate so the dots actually travel; cleaned up on unmount.
  useEffect(() => {
    const root = particlesRef.current
    if (!root) return
    const N = window.innerWidth < 640 ? 12 : 20
    const created: HTMLSpanElement[] = []
    for (let i = 0; i < N; i++) {
      const s = document.createElement('span')
      s.style.left = (Math.random() * 100) + '%'
      s.style.top = (60 + Math.random() * 40) + '%'
      const size = 1.2 + Math.random() * 1.2
      s.style.width = s.style.height = size + 'px'
      const dur = 20 + Math.random() * 26
      s.style.animationDuration = dur + 's'
      s.style.animationDelay = -Math.random() * dur + 's'
      s.style.setProperty('--dx', (Math.random() * 30 - 15) + 'px')
      s.style.setProperty('--dy', -(60 + Math.random() * 50) + 'vh')
      root.appendChild(s)
      created.push(s)
    }
    return () => { created.forEach(s => s.remove()) }
  }, [])

  const hasCurrent = !!(existingDays && existingDays.length > 0)

  // Focused mode: deep-linked from a SessionMenu day-tile swipe straight
  // into one day's exercise editor. Only honored when the index points at a
  // real, non-rest day in the saved rotation — otherwise we fall back to the
  // normal full wizard so a stale URL never strands the user on a blank day.
  const focused =
    focusDayIdx != null &&
    hasCurrent &&
    !!existingDays?.[focusDayIdx] &&
    existingDays[focusDayIdx].category !== 'rest'

  const [step, setStep] = useState<Step>(focused ? 3 : 1)
  // Celebration screen — shown after saveTrainingSetup succeeds, before
  // routing to the workout logger. Lets the user feel the "you're set up"
  // moment instead of being teleported.
  const [done, setDone] = useState(false)
  // Section gem celebration trigger — pulses true on each step advance
  // so the corner gem plays its CHECK + scale-pulse sequence as a small
  // reward for forward progress. Auto-clears so it can re-fire on the
  // next step.
  const [gemComplete, setGemComplete] = useState(false)
  const gemFirstRenderRef = useRef(true)
  useEffect(() => {
    if (gemFirstRenderRef.current) {
      gemFirstRenderRef.current = false
      return
    }
    setGemComplete(true)
    const timer = setTimeout(() => setGemComplete(false), 3500)
    return () => clearTimeout(timer)
  }, [step])
  const [continuing, setContinuing] = useState(false)
  // Default to Full Body · 3 days for new users — beginner-friendly,
  // technique-acquisition focused. The recommendation quiz below can
  // refine this. (Returning users with a saved split keep their current
  // rotation regardless.)
  const [selectedPresetId, setSelectedPresetId] = useState<SelectedPresetId>(
    hasCurrent ? 'current' : 'full_body_3'
  )
  const [days, setDays] = useState<PresetDay[]>(() => {
    if (hasCurrent) return existingDays as PresetDay[]
    return PRESETS.find(p => p.id === 'full_body_3')!.days
  })
  // Snapshot of the engine's recommendation per day, used by the
  // per-day "go back to recommended" affordance in the exercise picker.
  // Re-captured every time the engine runs (intake completion, preset
  // change with answers, manual refresh of recommendation).
  const [originalDays, setOriginalDays] = useState<PresetDay[]>(() => {
    if (hasCurrent) return existingDays as PresetDay[]
    return PRESETS.find(p => p.id === 'full_body_3')!.days
  })
  // 11-question intake state. Hydrates from training_settings.intake_*
  // so the diagnostic card and "Completed" badge on the launcher survive
  // a refresh / new device. The full IntakeAnswers + IntakeRecommendation
  // are kept so we can render the 4-part output (diagnostic, card,
  // reasoning bullets, alternatives link) above the preset grid.
  const [intakeOpen, setIntakeOpen] = useState(autoOpenIntake)
  // Returning user retake: when a completed user arrives via ?intake=open
  // (from the SettingsSheet "Tailor my split" row), seed the modal open
  // once, then strip the query param so a refresh — or X-ing out and
  // navigating back — doesn't re-trap them in the intake. First-time
  // shielded-mode users keep the URL so the locked-down flow survives
  // a refresh until they actually finish.
  useEffect(() => {
    if (autoOpenIntake && existingIntakeRec) {
      router.replace('/app/fitness/setup', { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Shielded-mode celebration: when the user lands here from the welcome
  // checklist (?intake=open), they only do the 11-question intake — they
  // never see the full wizard's QuizComplete that fires on final save.
  // Show a dedicated celebration after the intake save lands so the
  // moment isn't swallowed by an immediate redirect to /welcome.
  const [shieldedDone, setShieldedDone] = useState(false)
  const [shieldedContinuing, setShieldedContinuing] = useState(false)
  const [openFactorIdx, setOpenFactorIdx] = useState<number | null>(null)
  // Settings-edit retake celebration. When a returning user arrives via
  // ?intake=open (Settings → "Build your training" edit), they only
  // re-do the 11-question intake — same problem as shielded mode:
  // there's no QuizComplete because they don't finish the full 4-step
  // wizard. Without this they'd fill out 11 questions and silently land
  // back on Step 1 with no thank-you, which feels broken.
  // We arm the celebration once on mount (the ?intake=open + existingIntakeRec
  // signal) and disarm after first fire so manual in-wizard retakes
  // ("retake the quiz" button) don't keep showing the screen.
  const [editIntakeDone, setEditIntakeDone] = useState(false)
  const [editIntakeContinuing, setEditIntakeContinuing] = useState(false)
  const editIntakeArmedRef = useRef(autoOpenIntake && !!existingIntakeRec)
  const [intakeRec, setIntakeRec] = useState<IntakeRecommendation | null>(existingIntakeRec)
  const [intakeAnswers, setIntakeAnswers] = useState<IntakeAnswers | null>(existingIntakeAnswers)
  const [recommendedId, setRecommendedId] = useState<Preset['id'] | null>(existingIntakeRec?.presetId ?? null)
  // "Why this fits" is collapsed by default — the diagnostic + visual
  // hero answer the "what." Bullets are the deeper "why" the user can
  // open if curious. Reduces text wall on first impression.
  const [whyOpen, setWhyOpen] = useState(false)
  // The "matched for you" hero is collapsed by default into a compact row
  // (identical to the tailored-split row) and expands on tap. Keeps the page
  // calm when returning to change a split — the huge tile is opt-in.
  const [heroOpen, setHeroOpen] = useState(false)
  // Inline-intake celebration. The common path (user opens the "Not sure?"
  // intake from the setup page) had NO completion moment: the modal just
  // closed and dropped them on the collapsed "Matched for you" row, so it
  // read as if the quiz glitched out and gave them nothing. We now show the
  // shared QuizComplete gem (check + training mark) on finish, and its
  // "see tailored split" CTA lands them on the recommended split with its
  // details already expanded. Only the inline path sets this — the shielded
  // and settings-edit paths have their own thank-you screens above.
  const [intakeCelebrateDone, setIntakeCelebrateDone] = useState(false)
  // The matched-split block, so "see tailored split" can scroll it into view.
  const resultWrapRef = useRef<HTMLDivElement | null>(null)

  function handleIntakeComplete(answers: IntakeAnswers, rec: IntakeRecommendation) {
    setIntakeAnswers(answers)
    setIntakeRec(rec)
    setRecommendedId(rec.presetId)
    setIntakeOpen(false)
    const preset = PRESETS.find(p => p.id === rec.presetId)
    if (preset) {
      // pickPreset() seeds days from the preset template, then we
      // immediately replace those days with the intake-personalized
      // version: restriction subs, equipment filter, priority bias.
      // This wires the 11-question quiz into the actual exercises the
      // user sees in Step 3, not just the split shape.
      setSelectedPresetId(preset.id)
      const { days: nextDays } = recommendExercises(preset, answers, goal)
      setDays(nextDays)
      setOriginalDays(nextDays)
    }
    // Fire-and-forget persistence. The "Completed" badge already reflects
    // the in-memory state; we don't gate the UI on this round-trip. If
    // the call fails the user simply re-takes on next visit — graceful.
    saveIntakeAnswers(answers, rec).catch(err => {
      console.warn('[/app/fitness/setup] saveIntakeAnswers failed', err)
    })
    // Settings-edit celebration: if the user came in via ?intake=open
    // with an already-completed intake (i.e. they tapped "edit" on the
    // training row of Settings → Your Vitality setup), show the
    // thank-you screen instead of dropping them silently on Step 1.
    // Disarm immediately so a subsequent in-wizard "retake the quiz"
    // doesn't re-trigger the celebration.
    if (editIntakeArmedRef.current) {
      editIntakeArmedRef.current = false
      setEditIntakeDone(true)
    } else {
      // Inline path: pre-open the matched-split hero so it's already
      // expanded the instant the celebration is dismissed, then show the
      // congrats gem instead of cutting straight back to the page.
      setHeroOpen(true)
      setIntakeCelebrateDone(true)
    }
  }
  const [error, setError] = useState<string | null>(null)
  // Step 2 mode toggle — when off (default), per-day rows show a simple
  // Day/Rest pill instead of the HEAVY/VOLUME/RECOVERY dropdown. Most
  // users never think about that distinction; the toggle keeps the
  // affordance for users who want to program H/V splits without
  // dumping it on everyone. Defaults to ON if the user is on a known
  // H/V-bearing preset (ppl_6) so they don't have to discover it.
  const [showHV, setShowHV] = useState<boolean>(() =>
    !!existingDays && existingDays.some(d => d.type === 'VOLUME'),
  )
  // Back-to-fitness confirmation. The setup wizard accumulates state
  // across 4 steps that only commits on "Start training" — if the user
  // bails via the top-left back link mid-flow, all their tweaks vanish.
  // Intercept the click and force a confirm modal.
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false)
  // Which preset's info popover is open (null = none). One at a time so
  // we don't stack tooltips. Click the (i) again to dismiss, or click
  // outside the popover.
  const [infoOpenId, setInfoOpenId] = useState<Preset['id'] | null>(null)

  // Close info popover on outside-click + Escape.
  useEffect(() => {
    if (!infoOpenId) return
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest(`[data-info-anchor]`)) setInfoOpenId(null)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setInfoOpenId(null)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [infoOpenId])
  // Step 3 sub-view: null shows the day list; a number opens that one
  // day's exercise editor full-screen so the user isn't scrolling
  // through every day at once.
  const [editingDayIdx, setEditingDayIdx] = useState<number | null>(focused ? focusDayIdx : null)
  // Step 2: which rest-day index has the activity picker sheet open
  // (null = closed). Sheet lets users swap an engine-picked activity,
  // or set one on a rest day the engine left as full rest.
  const [activityPickerIdx, setActivityPickerIdx] = useState<number | null>(null)
  // Day-name autocomplete — index of the row whose suggestion list is open.
  const [nameSuggestIdx, setNameSuggestIdx] = useState<number | null>(null)

  // Reset to the day list whenever the user leaves step 3 — re-entering
  // should always start on the overview, never mid-edit.
  useEffect(() => {
    if (step !== 3) setEditingDayIdx(null)
  }, [step])

  // First-run "Tune" explainer — fires the one time a user opens a day's lift
  // editor on Step 3 (Pick exercises), where each lift shows a Tune button and
  // nothing signals the weights are theirs to set. Shown once ever; a short
  // delay lets the editor render so the card animates in over it.
  const [showTuneCoach, setShowTuneCoach] = useState(false)
  const TUNE_COACH_KEY = 'vitality_tune_coach_setup_seen'
  useEffect(() => {
    if (step !== 3 || editingDayIdx === null) return
    try {
      if (window.localStorage.getItem(TUNE_COACH_KEY)) return
    } catch {
      return
    }
    const t = setTimeout(() => setShowTuneCoach(true), 350)
    return () => clearTimeout(t)
  }, [step, editingDayIdx])

  function dismissTuneCoach() {
    setShowTuneCoach(false)
    try { window.localStorage.setItem(TUNE_COACH_KEY, '1') } catch { /* no-op */ }
  }

  // Editable profile fields — pre-filled from initialProfile if present,
  // sensible defaults if missing (the stale-data heal path).
  const [sex, setSex] = useState<'M' | 'F'>(initialProfile?.sex ?? 'M')
  const [units, setUnits] = useState<Units>(initialProfile?.units ?? 'metric')
  // We always track the canonical weight in kg; the UI input shows the
  // user-preferred unit and converts on edit.
  const [weightKg, setWeightKg] = useState<number>(
    initialProfile?.startingWeightKg ?? 75
  )
  // The text the user typed in the input — kept independent so they can
  // clear it / type partial numbers without us forcing a value back.
  const [weightInput, setWeightInput] = useState<string>(() => {
    const initKg = initialProfile?.startingWeightKg ?? 75
    return initialProfile?.units === 'imperial'
      ? String(Math.round(initKg / KG_PER_LB))
      : String(initKg)
  })

  function onWeightChange(v: string) {
    setWeightInput(v)
    const parsed = parseFloat(v)
    if (Number.isFinite(parsed) && parsed > 0) {
      const kg = units === 'imperial' ? parsed * KG_PER_LB : parsed
      setWeightKg(kg)
    }
  }

  function onUnitsChange(u: Units) {
    setUnits(u)
    // Re-display the existing kg value in the new unit
    if (u === 'imperial') {
      setWeightInput(String(Math.round(weightKg / KG_PER_LB)))
    } else {
      setWeightInput(weightKg.toFixed(1).replace(/\.0$/, ''))
    }
  }

  function pickPreset(p: Preset) {
    setSelectedPresetId(p.id)
    // When the user has done the intake, every split they pick gets
    // their answers applied — not just the recommended one. Click PPL
    // instead of the matched Full Body? PPL still gets your restriction
    // subs, equipment filter, and priority extras.
    const nextDays = intakeAnswers
      ? recommendExercises(p, intakeAnswers, goal).days
      : p.days
    setDays(nextDays)
    setOriginalDays(nextDays)
    // Reflect the split the user actually picked: if it periodises (has any
    // VOLUME day — e.g. "PPL heavy + volume"), turn H/V mode ON so the
    // customize screen shows the heavy/volume the card promised, instead of
    // flattening it to plain Day/Rest rows. Non-periodised picks turn it off.
    setShowHV(nextDays.some(d => d.type === 'VOLUME'))
  }

  // "Your current split" is a UI-only sentinel — selecting it keeps the
  // user's existing days untouched and drops into Customize Days (step 2), so
  // the user can add / remove / rename / re-rest days BEFORE picking exercises.
  // Jumping straight to the exercise editor (step 3) made adding another day
  // impossible without backing out — that was the bug.
  function pickCurrentSplit() {
    if (!existingDays) return
    setSelectedPresetId('current')
    setDays(existingDays)
    setOriginalDays(existingDays)
    setShowHV(existingDays.some(d => d.type === 'VOLUME'))
    setStep(2)
  }

  function updateDay(idx: number, patch: Partial<PresetDay>) {
    setDays(prev => prev.map((d, i) => i === idx ? { ...d, ...patch } : d))
  }

  function updateDayExercises(idx: number, next: DayExercise[]) {
    setDays(prev => prev.map((d, i) => i === idx ? { ...d, exercises: next } : d))
  }

  function removeDay(idx: number) {
    setDays(prev => prev.filter((_, i) => i !== idx))
  }

  function addDay() {
    setDays(prev => [
      ...prev,
      { name: 'New day', type: 'HEAVY', category: 'push', exercises: [] },
    ])
  }

  function handleSave() {
    setError(null)
    if (days.length === 0) {
      setError('Add at least one day before saving.')
      return
    }

    startTransition(async () => {
      const result = await saveTrainingSetup({
        days,
        sex,
        startingWeightKg: Math.round(weightKg * 100) / 100,
        units,
        // Pass the current intake snapshot through so the row stays in sync
        // even when the user finishes setup without re-taking the quiz.
        // Server derives gym_level from intakeAnswers.experience.
        intakeAnswers,
        intakeRec,
      })
      if (result.ok) {
        setDone(true)
      } else {
        setError(result.error ?? 'Something went wrong saving your setup.')
      }
    })
  }

  function handleContinueAfterDone() {
    setContinuing(true)
    router.push('/app/fitness/log')
  }

  // Focused mode save — persist the (single edited day inside the) full
  // rotation and drop straight back to the day menu the swipe came from.
  // No celebration screen here; this is a quick in-place tweak, not setup.
  function handleFocusedSave() {
    setError(null)
    startTransition(async () => {
      const result = await saveTrainingSetup({
        days,
        sex,
        startingWeightKg: Math.round(weightKg * 100) / 100,
        units,
        intakeAnswers,
        intakeRec,
      })
      if (result.ok) {
        router.push('/app/fitness/log')
      } else {
        setError(result.error ?? 'Something went wrong saving your changes.')
      }
    })
  }

  function nextStep() {
    setError(null)
    if (step === 1 && days.length === 0 && selectedPresetId !== 'blank') {
      setError('Pick a preset to continue.')
      return
    }
    if (step < TOTAL_STEPS) setStep(s => (s + 1) as Step)
  }

  function prevStep() {
    setError(null)
    if (step > 1) setStep(s => (s - 1) as Step)
  }

  if (done) {
    return (
      <QuizComplete
        eyebrow={isEditing ? 'plan updated' : 'training plan locked in'}
        headline={isEditing ? 'Your plan is updated.' : "You're set up to train."}
        sub="Every session from here builds on what you just put in."
        ctaLabel="log my first session"
        glyph="bar"
        onContinue={handleContinueAfterDone}
        submitting={continuing}
      />
    )
  }

  // Settings-edit intake celebration — fires once when a returning user
  // finishes the 11-question intake after arriving via ?intake=open
  // (from Settings → "Your Vitality setup" → Build your training edit).
  // Without this they get no thank-you for completing 11 questions and
  // the moment feels broken.
  if (editIntakeDone) {
    return (
      <QuizComplete
        eyebrow="training re-tuned"
        headline="Got your updates locked in."
        sub="Your split, exercises, and weights are matched to what you just told me."
        ctaLabel="open workout logger"
        glyph="bar"
        onContinue={() => {
          setEditIntakeContinuing(true)
          // Push to the workout logger so the user lands on the
          // module their answers now power, instead of being dumped
          // on the dashboard wondering where the result went. They
          // can navigate back to remaining onboarding from the
          // checklist any time.
          router.push('/app/fitness/log')
        }}
        submitting={editIntakeContinuing}
        // Second path: a user who reaches this via /welcome (editing
        // the training task before finishing other onboarding to-dos)
        // can hop back to the checklist. Fully-set-up returning users
        // from Settings hitting this just land on /welcome's empty
        // state — harmless, and we can't tell them apart at the URL
        // level (both use ?intake=open).
        secondaryCtaLabel="back to my to-dos"
        onSecondary={() => {
          setEditIntakeContinuing(true)
          router.push('/welcome')
        }}
      />
    )
  }

  // Inline intake celebration — the common path, when the user opens the
  // "Not sure?" intake straight from the setup page. Without this the modal
  // just closed and dropped them on the collapsed row with nothing signalling
  // the quiz went through, which read as a glitch. "see tailored split" drops
  // the gem and reveals the recommended split (hero pre-expanded in
  // handleIntakeComplete), scrolled into view.
  if (intakeCelebrateDone) {
    return (
      <QuizComplete
        eyebrow="training tailored"
        headline="Your split is ready."
        sub="Matched to everything you just told me. Here's the plan I built for you."
        ctaLabel="see tailored split"
        glyph="bar"
        onContinue={() => {
          setIntakeCelebrateDone(false)
          requestAnimationFrame(() =>
            resultWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
          )
        }}
      />
    )
  }

  // Shielded mode: the user landed here from /welcome via ?intake=open
  // before ever seeing the dashboard. Render ONLY the intake modal over a
  // clean welcome-style atmosphere — no wizard chrome (header, intake
  // launcher card, preset grid, exercise picker) leaks through behind the
  // modal. On cancel or completion we navigate back to /welcome so the
  // checklist reflects progress and the user keeps working through tasks
  // without being dumped into an area they haven't earned access to yet.
  //
  // ONLY for users who haven't completed the intake yet. A returning user
  // arriving via ?intake=open (from the workout-logger Settings sheet
  // "Tailor my split" row) gets the modal inline in the full wizard
  // instead — so X-ing out leaves them in the wizard, not bounced to
  // /welcome, and the URL strip above prevents a refresh from reopening.
  if (autoOpenIntake && !existingIntakeRec) {
    const handleShieldedComplete = async (answers: IntakeAnswers, rec: IntakeRecommendation) => {
      try {
        await saveIntakeAnswers(answers, rec)
      } catch (err) {
        console.warn('[/app/fitness/setup] saveIntakeAnswers (shielded) failed', err)
      }
      setShieldedDone(true)
    }
    const handleShieldedContinue = () => {
      setShieldedContinuing(true)
      // Push to the workout logger so the user sees the split their
      // answers just produced. SetupNudge in /app layout keeps a
      // persistent "back to onboarding" affordance for any remaining
      // to-dos, so we don't strand them.
      router.push('/app/fitness/log')
    }
    const handleShieldedBackToChecklist = () => {
      setShieldedContinuing(true)
      router.push('/welcome')
    }
    if (shieldedDone) {
      return (
        <QuizComplete
          eyebrow="training tailored"
          headline="I've got your training."
          sub="Split, exercises, and starting weights are dialed in. Open them anytime from your fitness hub."
          ctaLabel="open workout logger"
          glyph="bar"
          onContinue={handleShieldedContinue}
          submitting={shieldedContinuing}
          // Secondary path: brand-new users are still working through
          // the welcome checklist. Let them go finish their other
          // to-dos before exploring the dashboard if they want.
          secondaryCtaLabel="back to my to-dos"
          onSecondary={handleShieldedBackToChecklist}
        />
      )
    }
    return (
      <main className={`${styles.shieldedPage} grain-overlay`}>
        <WelcomeBackdrop />
        <IntakeQuiz
          initialAnswers={intakeAnswers}
          goal={goal}
          onComplete={handleShieldedComplete}
          onCancel={() => router.push('/welcome')}
        />
      </main>
    )
  }

  return (
    <main className={`${dashboardStyles.page} ${styles.editorialPage} grain-overlay`}>
      {/* Section gem — small corner accent in the top-right of the
          setup page. Engraves TALLY (workout logger mark) and glitches
          to the brand V every few seconds. `complete` pulses on each
          step advance for a CHECK + scale-pulse reward. Tracks the
          cursor for life. Scrolls off with the page (default absolute
          positioning) so it stays anchored to the top of the section
          and doesn't follow the user down. */}
      {!focused && (
        <SectionGem
          glyph="TALLY"
          complete={gemComplete}
          size={140}
          top={32}
          right={32}
        />
      )}
      {/* Editorial atmosphere — same canon as the SessionMenu makeover.
          Aurora wash + mountain horizon + drifting particles, all sitting
          behind the wizard shell (lifted to z=5 via .editorialShell). */}
      <div className={styles.atmosphere} aria-hidden />
      <div className={styles.mountainsLayer} aria-hidden>
        <svg viewBox="0 0 1600 420" preserveAspectRatio="none">
          <defs>
            <linearGradient id="setup-mt-far" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d1a17" stopOpacity="0" />
              <stop offset="55%" stopColor="#0d1a17" stopOpacity=".55" />
              <stop offset="100%" stopColor="#0d1a17" stopOpacity=".95" />
            </linearGradient>
            <linearGradient id="setup-mt-near" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#050a09" stopOpacity=".4" />
              <stop offset="60%" stopColor="#050a09" stopOpacity=".95" />
              <stop offset="100%" stopColor="#050a09" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path
            d="M0,300 L120,230 L210,260 L320,180 L430,220 L560,150 L680,210 L820,170 L960,220 L1100,180 L1240,240 L1380,200 L1500,250 L1600,220 L1600,420 L0,420 Z"
            fill="url(#setup-mt-far)"
          />
          <path
            d="M0,360 L100,320 L220,340 L340,290 L460,330 L590,300 L720,340 L860,310 L1000,350 L1140,310 L1280,355 L1420,320 L1540,360 L1600,340 L1600,420 L0,420 Z"
            fill="url(#setup-mt-near)"
          />
        </svg>
      </div>
      <div className={styles.particles} ref={particlesRef} aria-hidden />

      <div className={`${dashboardStyles.shell} ${styles.editorialShell}`}>
        {focused ? (
          /* Focused per-day edit (swipe-in). One clean, centered header —
             no preset/step chrome, no progress bars, no corner gem — so the
             screen reads as a single simple "edit this day" page. */
          <div className={styles.focusedHeader}>
            <button
              type="button"
              className={styles.focusedBack}
              onClick={() => router.push('/app/fitness/log')}
            >
              <span className={fitnessStyles.backArrow}>←</span> Your days
            </button>
            <p className={styles.focusedEyebrow}>EDITING</p>
            <h1 className={styles.focusedTitle}>
              {focusDayIdx != null && days[focusDayIdx] ? (
                <em>{days[focusDayIdx].name}</em>
              ) : (
                <em>Edit day</em>
              )}
            </h1>
          </div>
        ) : (
          <>
            <div className={fitnessStyles.header}>
              <button
                type="button"
                className={fitnessStyles.back}
                onClick={() => setConfirmLeaveOpen(true)}
              >
                <span className={fitnessStyles.backArrow}>←</span> Fitness
              </button>
              <h1 className={fitnessStyles.title}>
                {isEditing ? 'Edit your training setup' : 'Set up your training'}
              </h1>
              <p className={fitnessStyles.subtitle}>
                Step {step} of {TOTAL_STEPS} ·{' '}
                {step === 1 && 'Pick a split'}
                {step === 2 && 'Customize days'}
                {step === 3 && 'Pick exercises'}
              </p>
            </div>

            <div className={styles.progressTrack} aria-label={`Step ${step} of ${TOTAL_STEPS}`}>
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
                const n = i + 1
                return (
                  <div
                    key={i}
                    className={`${styles.progressSeg} ${n < step ? styles.progressSegDone : ''} ${n === step ? styles.progressSegCurrent : ''}`}
                  />
                )
              })}
            </div>
          </>
        )}

        {/* ── Step 1 ─────────────────────────────────────────────── */}
        {step === 1 && (
          <section className={styles.stepBody}>
            <p className={styles.pickLede}>
              <em>Not sure?</em> Tell us about you and we’ll pick the best fit.
            </p>

            {/* Intake launcher — opens the 11-question chapter wizard.
                Stays visible after completion with a "✓ Completed" badge so
                the user always sees the entry point for retaking. */}
            <button
              type="button"
              className={`${styles.intakeLauncher} ${intakeRec ? styles.intakeLauncherDone : ''}`}
              onClick={() => setIntakeOpen(true)}
            >
              <span className={styles.intakeLauncherIcon} aria-hidden>
                <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 1 L13 4 L13 10 L7 13 L1 10 L1 4 Z" />
                  <path d="M7 7 L13 4" />
                  <path d="M7 7 L1 4" />
                  <path d="M7 7 L7 13" />
                </svg>
              </span>
              <span className={styles.intakeLauncherCopy}>
                <span className={styles.intakeLauncherTitle}>
                  {intakeRec
                    ? <em>Your tailored split</em>
                    : <em>Build me a tailored split</em>}
                </span>
                <span className={styles.intakeLauncherSub}>
                  {intakeRec
                    ? <>Matched to <em>{PRESETS.find(p => p.id === intakeRec.presetId)?.name ?? 'your split'}</em>. Tap to retake. Your answers are saved.</>
                    : <>A 2-minute quiz. We build the split that fits you.</>}
                </span>
              </span>
              {/* End-of-row meta: completed pill + retake/forward arrow,
                  paired and vertically centered together. Replaces the
                  previous split layout where the badge floated absolute
                  at top-right while the arrow sat centered in the row. */}
              <span className={styles.intakeLauncherEnd}>
                {intakeRec && (
                  <span className={styles.intakeLauncherBadge} aria-label="Tailored intake completed">
                    ✓ Completed
                  </span>
                )}
                <span className={styles.intakeLauncherArrow} aria-hidden>{intakeRec ? '↻' : '→'}</span>
              </span>
            </button>

            {/* Result hero — the recommended split as a visual card with
                the weekly rhythm graphic up top, then the diagnostic +
                top reasoning bullets. Replaces the old text-wall layout
                so the user sees their split, not paragraphs. */}
            {intakeRec && (() => {
              const recPreset = PRESETS.find(p => p.id === intakeRec.presetId)
              if (!recPreset) return null
              // For rotating presets, count UNIQUE workouts in the cycle
              // (ppl_3 = 3: push/pull/legs), not the 7-day calendar layout
              // count which double-counts the wrap. Non-rotating = calendar
              // work days as before.
              const sessions = recPreset.rotating
                ? new Set(recPreset.days.filter(d => d.category !== 'rest').map(d => d.category)).size
                : recPreset.days.filter(d => d.category !== 'rest').length
              const recTitle = recPreset.name.split(' · ')[0]
              // Structured diagnostic — headline / reason / personal.
              // recommendIntake is deterministic, so regenerate from
              // saved answers as the source of truth (also covers
              // older snapshots saved before the structured fields
              // existed). Per the backfill rule.
              const live = intakeAnswers ? recommendIntake(intakeAnswers, goal) : null
              const dxHeadline = live?.diagnosticHeadline ?? intakeRec.diagnosticHeadline ?? ''
              const dxReason   = live?.diagnosticReason   ?? intakeRec.diagnosticReason   ?? ''
              const dxPersonal = live?.diagnosticPersonal ?? intakeRec.diagnosticPersonal ?? ''
              const hasStructured = !!(dxHeadline && dxReason && dxPersonal)
              // Last-resort fallback — only used if we have NO live
              // answers AND no saved structured parts (pre-structured
              // snapshot, post-clear of intakeAnswers).
              const fallback = (() => {
                const idx = intakeRec.diagnostic.indexOf("We're putting you on")
                return idx >= 0 ? intakeRec.diagnostic.slice(idx).trim() : intakeRec.diagnostic
              })()
              return (
                <div className={styles.resultWrap} ref={resultWrapRef}>
                  {/* Collapsed row — identical look to the tailored-split row,
                      with a chevron. Closed by default; expands the full hero. */}
                  <button
                    type="button"
                    className={`${styles.intakeLauncher} ${styles.resultToggle}`}
                    onClick={() => setHeroOpen(o => !o)}
                    aria-expanded={heroOpen}
                  >
                    <span className={styles.intakeLauncherIcon} aria-hidden>
                      {/* A pyramid — different solid from the tailored-split
                          row's cube, but the same 3D wireframe line style, so
                          the two rows read as a matched set, not clones. (The
                          preset's own glyph still shows in the expanded hero.) */}
                      <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M7 1.5 L1.5 11.5 L12.5 11.5 Z" />
                        <path d="M7 1.5 L9.8 8.2" />
                        <path d="M12.5 11.5 L9.8 8.2" />
                        <path d="M1.5 11.5 L9.8 8.2" />
                      </svg>
                    </span>
                    <span className={styles.intakeLauncherCopy}>
                      <span className={styles.intakeLauncherTitle}><em>Matched for you</em></span>
                      <span className={styles.intakeLauncherSub}>
                        <em>{recTitle}</em> · {sessions}× {recPreset.rotating ? 'per cycle' : 'per week'}. Tap to {heroOpen ? 'hide' : 'see'} the details.
                      </span>
                    </span>
                    <span className={styles.intakeLauncherEnd}>
                      <span className={`${styles.resultChevron} ${heroOpen ? styles.resultChevronOpen : ''}`} aria-hidden>⌄</span>
                    </span>
                  </button>

                  {heroOpen && (
                  <div className={styles.resultHero}>
                    <div className={styles.resultBadge}>
                      <span className={styles.resultBadgeStar} aria-hidden>★</span>
                      matched for you
                    </div>

                  <div className={styles.resultTitleRow}>
                    <span className={styles.resultGlyph} aria-hidden>
                      <PresetGlyph id={recPreset.id} />
                    </span>
                    <div className={styles.resultTitleBlock}>
                      <h3 className={styles.resultTitle}>{recTitle}</h3>
                      <span className={styles.resultSessions}>
                        {sessions}<span className={styles.resultSessionsX}>×</span>
                        <span className={styles.resultSessionsLabel}>
                          {recPreset.rotating ? 'per cycle' : 'per week'}
                        </span>
                      </span>
                    </div>
                    {recPreset.level && <LevelDot level={recPreset.level} />}
                  </div>

                  <WeekRhythm days={recPreset.days} />

                  {/* Hero body — 2-column layout. Diagnostic on the
                      left, factor list on the right. Uses the empty
                      right space instead of expanding downward, so
                      the hero stays compact regardless of factor
                      count. Stacks vertically on narrow screens. */}
                  <div className={styles.heroBody}>
                    <div className={styles.heroBodyLeft}>
                      {hasStructured ? (
                        <div className={styles.diagnosticBlock}>
                          <span className={styles.diagnosticEyebrow}>
                            <span className={styles.diagnosticEyebrowLabel}>THE CALL</span>
                          </span>
                          <h3 className={styles.diagnosticHeadline}>
                            <em>{dxHeadline}</em>
                          </h3>
                          <p className={styles.diagnosticReason}>{dxReason}</p>
                          <span className={`${styles.diagnosticEyebrow} ${styles.diagnosticEyebrowSpaced}`}>
                            <span className={styles.diagnosticEyebrowLabel}>
                              <span className={styles.diagnosticEyebrowStar} aria-hidden>★</span>
                              FOR YOU
                            </span>
                          </span>
                          <p className={styles.diagnosticPersonal}>
                            <em>{dxPersonal}</em>
                          </p>
                        </div>
                      ) : (
                        <p className={styles.resultDiagnostic}><em>{fallback}</em></p>
                      )}

                      {intakeRec.daysOverride && (
                        <div className={styles.resultOverride}>
                          <span className={styles.resultOverrideTag} aria-hidden>
                            <span className={styles.resultOverrideTagRule} />
                            HEADS UP
                          </span>
                          <p className={styles.resultOverrideBody}>
                            You asked for <em>{intakeRec.daysOverride.requested} days</em>. We&apos;re recommending <em>{intakeRec.daysOverride.recommended}</em> because {intakeRec.daysOverride.why}
                          </p>
                        </div>
                      )}
                    </div>

                    <aside className={styles.heroBodyRight} aria-label="Built from your answers">
                      {(() => {
                        const factors = intakeRec.factors
                          ?? (intakeAnswers ? recommendIntake(intakeAnswers, goal).factors : undefined)
                        const useFactors = !!(factors && factors.length > 0)
                        const count = useFactors ? factors.length : intakeRec.reasoning.slice(0, 3).length
                        return (
                          <>
                            <header className={styles.factorPanelHeader}>
                              <span className={styles.factorPanelLabel}>
                                Built from your answers
                                {count > 0 && (
                                  <span className={styles.factorToggleCount} aria-hidden>
                                    {String(count).padStart(2, '0')}
                                  </span>
                                )}
                              </span>
                            </header>
                            {useFactors ? (
                              <ul className={styles.factorList}>
                                {factors.map((f, i) => {
                                  const isOpen = openFactorIdx === i
                                  // Display-only trims so the right column reads
                                  // clean: shorten the verbose `MOVEMENT_PREFERENCE`
                                  // label, and drop the `(you asked for N)`
                                  // parenthetical from FREQUENCY since the orange
                                  // HEADS UP card on the left already owns that nudge.
                                  const category = f.category === 'movement_preference'
                                    ? 'movement'
                                    : f.category
                                  const answer = f.answer.replace(/\s*\(you asked for [^)]+\)\s*$/i, '')
                                  return (
                                    <li
                                      key={i}
                                      className={`${styles.factorRow} ${isOpen ? styles.factorRowOpen : ''}`}
                                    >
                                      <button
                                        type="button"
                                        className={styles.factorButton}
                                        aria-expanded={isOpen}
                                        onClick={() => setOpenFactorIdx(isOpen ? null : i)}
                                      >
                                        <span className={styles.factorCategory}>{category}</span>
                                        <span className={styles.factorAnswer}>{answer}</span>
                                        <span className={styles.factorChevron} aria-hidden>⌄</span>
                                      </button>
                                      <div className={styles.factorDetail}>
                                        <p className={styles.factorDecision}>{f.decision}</p>
                                      </div>
                                    </li>
                                  )
                                })}
                              </ul>
                            ) : (
                              <ul className={styles.factorList}>
                                {intakeRec.reasoning.slice(0, 3).map((b, i) => <li key={i}>{b}</li>)}
                              </ul>
                            )}
                          </>
                        )
                      })()}
                    </aside>
                  </div>

                  <div className={styles.resultActions}>
                    <button
                      type="button"
                      className={styles.resultUseBtn}
                      onClick={() => setStep(2)}
                    >
                      use this split <span aria-hidden>→</span>
                    </button>
                    <button
                      type="button"
                      className={styles.resultRetakeBtn}
                      onClick={() => setIntakeOpen(true)}
                    >
                      retake the quiz
                    </button>
                  </div>
                  </div>
                  )}
                </div>
              )
            })()}

            {/* Section header — sets visual context that the cards below
                are alternatives to the matched hero above. Without this,
                the grid reads as "all your options" and the hero feels
                redundant. Pre-quiz (no intakeRec), the grid IS all options,
                so the header is suppressed. */}
            {intakeRec && (
              <div className={styles.altSectionHeader} aria-hidden>
                <span className={styles.altSectionRule} />
                <span className={styles.altSectionLabel}><em>Other splits to explore</em></span>
                <span className={styles.altSectionRule} />
              </div>
            )}

            <div className={styles.presetGrid}>
              {PRESETS
                .filter(p => p.id !== 'blank')
                // Keep the recommended preset IN the grid (with the orange
                // recommended badge + border) so the user can compare it
                // side-by-side with the alternatives rather than having to
                // remember what the hero card said.
                .map(p => {
                const isRecommended = recommendedId === p.id
                // Rotating presets count unique workouts in the cycle
                // (ppl_3 = 3 — push/pull/legs), not the 7-day calendar
                // layout which double-counts the wrap.
                const sessions = p.rotating
                  ? new Set(p.days.filter(d => d.category !== 'rest').map(d => d.category)).size
                  : p.days.filter(d => d.category !== 'rest').length
                // Two-line title: big italic family name + small dim variant.
                // Without this, "Push Pull Legs · Classic" and "Push Pull Legs
                // · Heavy + Volume" both rendered as identical "Push Pull Legs"
                // and looked like accidental duplicates.
                const [title, variant] = p.name.includes(' · ')
                  ? (p.name.split(' · ') as [string, string])
                  : [p.name, '']
                const infoOpen = infoOpenId === p.id
                return (
                  /* Wrapper exists so we can render the (i) info button as a
                     sibling of the card button rather than nested inside it
                     (nested <button> is invalid HTML). data-info-anchor lets
                     the outside-click handler tell "click on info chrome" from
                     "click on something else, close the popover." */
                  <div key={p.id} className={styles.presetCardWrap} data-info-anchor={infoOpen ? p.id : undefined}>
                    <button
                      type="button"
                      className={`${styles.presetCard} ${selectedPresetId === p.id ? styles.presetCardActive : ''} ${isRecommended ? styles.presetCardRecommended : ''}`}
                      // One tap = into the flow (customize days), like Edit
                      // current / Build your own. No select-then-Continue.
                      onClick={() => { pickPreset(p); setStep(2) }}
                      aria-label={`${p.name}, ${sessions} sessions per week`}
                    >
                      {isRecommended && (
                        <span className={styles.presetRecBadge}>
                          ★ <em>recommended</em>
                        </span>
                      )}
                      <div className={styles.presetHeader}>
                        <span className={styles.presetGlyph} aria-hidden>
                          <PresetGlyph id={p.id} />
                        </span>
                        <div className={styles.presetTitleBlock}>
                          <span className={styles.presetName}>{title}</span>
                          {variant && (
                            <span className={styles.presetVariant}>{variant}</span>
                          )}
                          <span className={styles.presetSessions}>
                            {sessions}<span className={styles.presetSessionsX}>×</span>
                            <span className={styles.presetSessionsLabel}>{p.rotating ? '/cycle' : '/wk'}</span>
                            {p.rotating && (
                              <span className={styles.presetSessionsRotates} aria-hidden>↻ rotates</span>
                            )}
                          </span>
                        </div>
                      </div>

                      <WeekRhythm days={p.days} rotating={p.rotating} />
                    </button>

                    {/* Corner meta — level pill + (i) button sit together in a
                        single absolute row pinned to top-right of every card.
                        Outside the card button so the (i) is a valid nested
                        element and so the recommended badge above the header
                        doesn't push these two out of sync across cards. */}
                    <div className={styles.presetCornerMeta} aria-hidden={false}>
                      {p.level && <LevelDot level={p.level} />}
                      {p.info && (
                        <button
                          type="button"
                          className={`${styles.presetInfoBtn} ${infoOpen ? styles.presetInfoBtnOpen : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setInfoOpenId(infoOpen ? null : p.id)
                          }}
                          aria-label={infoOpen ? `Close info about ${p.name}` : `About ${p.name}`}
                          aria-expanded={infoOpen}
                        >
                          i
                        </button>
                      )}
                    </div>

                    {infoOpen && p.info && (
                      <div className={styles.presetInfoPopover} role="tooltip">
                        <div className={styles.presetInfoHead}>
                          <span className={styles.presetInfoEyebrow}>
                            <span className={styles.presetInfoEyebrowRule} aria-hidden />
                            ABOUT THIS SPLIT
                          </span>
                          <button
                            type="button"
                            className={styles.presetInfoClose}
                            onClick={(e) => { e.stopPropagation(); setInfoOpenId(null) }}
                            aria-label="Close"
                          >
                            ×
                          </button>
                        </div>

                        {/* Title + meta line for fast scanning */}
                        <div className={styles.presetInfoTitleBlock}>
                          <p className={styles.presetInfoTitle}>
                            <em>{title}</em>
                            {variant && <span className={styles.presetInfoTitleVariant}> · {variant}</span>}
                          </p>
                          <p className={styles.presetInfoMeta}>
                            {sessions}× weekly
                            {p.rotating && <span className={styles.presetInfoMetaTag}> · rotates</span>}
                            {p.level && <> · <span className={styles.presetInfoMetaLevel}>{p.level}</span></>}
                          </p>
                        </div>

                        {/* Mint-checkmark highlights — the at-a-glance verdict */}
                        {p.infoHighlights && p.infoHighlights.length > 0 && (
                          <ul className={styles.presetInfoHighlights}>
                            {p.infoHighlights.map((h, idx) => (
                              <li key={idx}>
                                <span className={styles.presetInfoCheck} aria-hidden>✓</span>
                                {h}
                              </li>
                            ))}
                          </ul>
                        )}

                        {/* Full narrative description */}
                        <p className={styles.presetInfoBody}>{p.info}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {hasCurrent && (
              <button
                type="button"
                className={`${styles.currentSplitCard} ${selectedPresetId === 'current' ? styles.currentSplitCardActive : ''}`}
                onClick={pickCurrentSplit}
              >
                <div className={styles.currentSplitCopy}>
                  <span className={styles.currentSplitBadge}>★ your split</span>
                  <span className={styles.currentSplitName}>
                    <em>Edit current</em>
                  </span>
                  <span className={styles.currentSplitHint}>
                    Keep your {(existingDays ?? []).length}-day rotation. Nothing gets reset.
                  </span>
                </div>
                <WeekRhythm days={existingDays ?? []} compact />
              </button>
            )}

            {(() => {
              const blank = PRESETS.find(p => p.id === 'blank')!
              return (
                <button
                  type="button"
                  className={`${styles.presetCardBlank} ${selectedPresetId === 'blank' ? styles.presetCardBlankActive : ''}`}
                  // Build-your-own jumps straight into step 2 (customize days) —
                  // no select-then-Continue. Same one-tap feel as "Edit current".
                  onClick={() => { pickPreset(blank); setStep(2) }}
                >
                  <span className={styles.presetBlankPlus} aria-hidden>+</span>
                  <span className={styles.presetBlankLabel}>Build your own</span>
                </button>
              )
            })()}
          </section>
        )}

        {/* ── Step 2 ─────────────────────────────────────────────── */}
        {step === 2 && (
          <section className={styles.stepBody}>
            {/* Toolbar — H/V programming switch lives top-right so power
                users can discover it without overwhelming the default case.
                Most users only think "lifting day vs rest day"; the
                heavy/volume distinction is opt-in. */}
            <div className={styles.daysToolbar}>
              <span className={styles.daysToolbarHint}>
                <em>Name your days and mark rest.</em>
              </span>
              {/* The split decides the mode — no flip-able toggle on presets.
                  A heavy+volume preset shows Heavy/Volume per day (showHV set in
                  pickPreset); a simple preset shows Day/Rest. The H/V switch only
                  appears for a CUSTOM build ('blank'/'current'), where the user
                  genuinely chooses whether to program heavy/volume themselves.
                  This kills the old bug where toggling H/V off on a preset made
                  the switch vanish forever. */}
              {(selectedPresetId === 'blank' || selectedPresetId === 'current') && (
                <button
                  type="button"
                  className={`${styles.hvSwitch} ${showHV ? styles.hvSwitchOn : ''}`}
                  onClick={() => setShowHV(v => !v)}
                  aria-pressed={showHV}
                  aria-label="Toggle Heavy / Volume programming"
                >
                  <span className={styles.hvSwitchLabel}>H/V mode</span>
                  <span className={styles.hvSwitchTrack} aria-hidden>
                    <span className={styles.hvSwitchKnob} />
                  </span>
                </button>
              )}
            </div>

            <div className={styles.daysList}>
              {days.map((d, i) => {
                const isRest = d.type === 'RECOVERY'
                const ar = d.activeRest
                const arDisplay = ar ? activityDisplay(ar) : null
                return (
                  <div
                    key={i}
                    className={`${styles.dayRow} ${isRest ? styles.dayRowRest : ''} ${showHV ? styles.dayRowAdvanced : ''} ${ar ? styles.dayRowActive : ''}`}
                  >
                    <span className={styles.dayRowIdx}>·{String(i + 1).padStart(2, '0')}</span>
                    <div className={styles.dayRowMain}>
                      <div className={styles.dayRowNameWrap}>
                        <input
                          className={styles.dayRowName}
                          type="text"
                          value={d.name}
                          onChange={e => updateDay(i, { name: e.target.value })}
                          onFocus={() => setNameSuggestIdx(i)}
                          onBlur={() => window.setTimeout(() => setNameSuggestIdx(prev => (prev === i ? null : prev)), 120)}
                          placeholder="Day name"
                          autoComplete="off"
                        />
                        {nameSuggestIdx === i && (() => {
                          // Default "New day" (or empty) → show the whole library
                          // so a fresh day is discoverable; otherwise filter by prefix.
                          const raw = d.name.trim().toLowerCase()
                          const q = (raw === '' || raw === 'new day') ? '' : raw
                          const matches = DAY_NAME_LIBRARY.filter(
                            o => o.name.toLowerCase().startsWith(q) && o.name.toLowerCase() !== q,
                          )
                          if (matches.length === 0) return null
                          return (
                            <div className={styles.nameSuggest} role="listbox">
                              {matches.map(o => (
                                <button
                                  key={o.name}
                                  type="button"
                                  className={styles.nameSuggestItem}
                                  // mouseDown (not click) + preventDefault fires before the
                                  // input's blur, so the selection lands instead of the
                                  // dropdown just closing.
                                  onMouseDown={e => {
                                    e.preventDefault()
                                    updateDay(i, { name: o.name, category: o.category })
                                    setNameSuggestIdx(null)
                                  }}
                                >
                                  <span className={styles.nameSuggestName}>{o.name}</span>
                                  <span className={styles.nameSuggestCat}>{o.category}</span>
                                </button>
                              ))}
                            </div>
                          )
                        })()}
                      </div>
                      {isRest && (
                        <button
                          type="button"
                          className={`${styles.dayRowActivityChip} ${ar ? styles.dayRowActivityChipFilled : ''}`}
                          onClick={() => setActivityPickerIdx(i)}
                          aria-label={ar ? `Change activity for ${d.name}` : `Add activity to ${d.name}`}
                        >
                          {arDisplay ? (
                            <>
                              <span className={styles.dayRowActivityLabel}>{arDisplay.label}</span>
                              <span className={styles.dayRowActivitySep} aria-hidden>·</span>
                              <span className={styles.dayRowActivityMeta}>{arDisplay.suffix}</span>
                              <span className={styles.dayRowActivityEdit} aria-hidden>↻</span>
                            </>
                          ) : (
                            <>
                              <span className={styles.dayRowActivityPlus} aria-hidden>+</span>
                              <span className={styles.dayRowActivityLabel}><em>add activity</em></span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {showHV ? (
                      (selectedPresetId === 'blank' || selectedPresetId === 'current') ? (
                      /* Custom build — editable type dropdown (you're defining it) */
                      <select
                        className={styles.dayRowType}
                        value={d.type}
                        onChange={e => updateDay(i, { type: e.target.value as PresetDay['type'] })}
                      >
                        {TYPE_OPTIONS.map(t => (
                          <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
                        ))}
                      </select>
                      ) : (
                      /* Preset heavy+volume — fixed, locked tag (not editable).
                         You chose a heavy+volume split, so its periodisation is
                         set; the screen just shows it. */
                      <span
                        className={`${styles.dayRowTypeTag} ${
                          d.type === 'HEAVY' ? styles.typeTagHeavy
                          : d.type === 'VOLUME' ? styles.typeTagVolume
                          : styles.typeTagRest
                        }`}
                      >
                        <span className={styles.dayRowTypeDot} aria-hidden />
                        {DAY_TYPE_LABEL_SHORT[d.type]}
                      </span>
                      )
                    ) : !isRest && (
                      /* Default mode — simple Day → Rest one-way switch on
                         workout rows. On rest rows the toggle is hidden
                         entirely: the row already reads "Rest" with the
                         + add activity chip, and the × button removes it.
                         A "Rest → Day" toggle would just create an empty,
                         unnamed workout, which the user can do more
                         deliberately via "+ add day" instead. */
                      <div className={styles.dayRestToggle} role="group" aria-label="Day or rest">
                        <button
                          type="button"
                          className={`${styles.dayRestOption} ${styles.dayRestOptionActive}`}
                          aria-pressed
                          disabled
                        >
                          Day
                        </button>
                        <button
                          type="button"
                          className={styles.dayRestOption}
                          onClick={() => updateDay(i, { type: 'RECOVERY', category: 'rest' })}
                          aria-pressed={false}
                        >
                          Rest
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      className={styles.dayRowRemove}
                      onClick={() => removeDay(i)}
                      aria-label={`Remove day ${i + 1}`}
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
            <button type="button" className={styles.addDayBtn} onClick={addDay}>
              + Add day
            </button>
          </section>
        )}

        {/* ── Step 3 · Pick exercises ───────────────────────────── */}
        {step === 3 && editingDayIdx === null && (
          <section className={styles.stepBody}>
            <p className={styles.stepHint}>
              <em>Pick a day to customize.</em> Each card shows its current exercise count. Tap one to edit just that day.
            </p>
            <div className={styles.dayPickerList}>
              {days.map((d, i) => (
                d.category === 'rest' ? (
                  <div key={i} className={`${styles.dayPickerRowRest} ${d.activeRest ? styles.dayPickerRowActive : ''}`}>
                    <span className={styles.dayPickerIdx}>·{String(i + 1).padStart(2, '0')}</span>
                    <span className={styles.dayPickerNameWrap}>
                      <span className={styles.dayPickerName}>{d.name}</span>
                      {d.activeRest && (() => {
                        const a = activityDisplay(d.activeRest)
                        return (
                          <span className={styles.dayPickerCount}>
                            {a.label} · {a.suffix}
                          </span>
                        )
                      })()}
                    </span>
                    <em className={styles.dayPickerRestNote}>
                      {d.activeRest ? 'Active rest' : 'Rest day'}
                    </em>
                  </div>
                ) : (
                  <button
                    key={i}
                    type="button"
                    className={styles.dayPickerRow}
                    onClick={() => setEditingDayIdx(i)}
                  >
                    <span className={styles.dayPickerIdx}>·{String(i + 1).padStart(2, '0')}</span>
                    <span className={styles.dayPickerNameWrap}>
                      <span className={styles.dayPickerName}>{d.name}</span>
                      <span className={styles.dayPickerCount}>
                        {d.exercises.length} {d.exercises.length === 1 ? 'exercise' : 'exercises'}
                      </span>
                    </span>
                    {showHV && (
                      <span className={`${styles.dayPickerType} ${styles[`dayPickerType-${d.type}`]}`}>{d.type}</span>
                    )}
                    <span className={styles.dayPickerArrow} aria-hidden>→</span>
                  </button>
                )
              ))}
            </div>
          </section>
        )}

        {showTuneCoach && <TuneCoachmark onClose={dismissTuneCoach} />}

        {step === 3 && editingDayIdx !== null && days[editingDayIdx] && (
          <section className={styles.stepBody}>
            {!focused && (
              <button
                type="button"
                className={styles.editorBack}
                onClick={() => setEditingDayIdx(null)}
              >
                <span className={styles.editorBackArrow}>←</span> Back to days
              </button>
            )}
            {(() => {
              // Picker inputs:
              //   recommendedExerciseIds → green RECOMMENDED / amber YOUR-ADD pills
              //   reasons                → "why we recommend" popover on each pill
              // Both come from one recommendExercises() call so they're
              // always internally consistent — no chance of stale state
              // drift between sets and reasons.
              //
              // Two modes:
              //   1. Picked preset (a real preset id): the saved-split
              //      structure matches the preset 1:1, slot-match by
              //      editingDayIdx.
              //   2. Free-form ('current' or 'blank' sentinels): the
              //      user's day order may not align with any preset —
              //      'current' = saved split (may have been hand-edited),
              //      'blank' = empty slate they're filling themselves.
              //      Compute against intakeRec.presetId — the engine's
              //      official recommendation for this user — then
              //      collapse picks + reasons across ALL days to bare
              //      exercise ids. Any engine-endorsed lift surfaces its
              //      pill regardless of slot.
              //
              // Quiz retake is automatic: handleIntakeComplete switches
              // selectedPresetId off the free-form sentinel onto the new
              // rec preset id AND updates intakeRec, so the next render
              // recomputes from the new answers — old pills clear, new
              // ones land, no extra code path needed.
              //
              // Stateless and deterministic. Same (intakeAnswers,
              // intakeRec.presetId, selectedPresetId, editingDayIdx)
              // always produces the same output. Safe at any scale.
              let recommendedIds: Set<string> | undefined
              const dayReasons: Record<string, RecommendationReason> = {}

              if (intakeAnswers) {
                const isFreeForm = selectedPresetId === 'current' || selectedPresetId === 'blank'
                const computePresetId = isFreeForm ? intakeRec?.presetId : selectedPresetId
                const computePreset = computePresetId
                  ? PRESETS.find(p => p.id === computePresetId)
                  : null
                if (computePreset) {
                  const { days: recDays, reasons: recReasons } = recommendExercises(computePreset, intakeAnswers, goal)
                  if (isFreeForm) {
                    const allRecIds = new Set<string>()
                    for (const rd of recDays) {
                      for (const ex of rd.exercises) allRecIds.add(ex.id)
                    }
                    recommendedIds = allRecIds
                    // Prefer the reason at the day-slot the user is
                    // editing first, so a lift recommended in multiple
                    // days gets the most relevant "why" text. Then fall
                    // back to any other day for completeness.
                    const preferPrefix = `${editingDayIdx}:`
                    for (const [key, reason] of Object.entries(recReasons)) {
                      if (key.startsWith(preferPrefix)) {
                        dayReasons[key.slice(preferPrefix.length)] = reason
                      }
                    }
                    for (const [key, reason] of Object.entries(recReasons)) {
                      const colonIdx = key.indexOf(':')
                      if (colonIdx > -1) {
                        const exId = key.slice(colonIdx + 1)
                        if (!(exId in dayReasons)) dayReasons[exId] = reason
                      }
                    }
                  } else {
                    const recDay = recDays[editingDayIdx]
                    if (recDay) recommendedIds = new Set(recDay.exercises.map(e => e.id))
                    const prefix = `${editingDayIdx}:`
                    for (const [key, reason] of Object.entries(recReasons)) {
                      if (key.startsWith(prefix)) {
                        dayReasons[key.slice(prefix.length)] = reason
                      }
                    }
                  }
                }
              }

              return (
                <ExercisePicker
                  dayIdx={editingDayIdx}
                  dayName={days[editingDayIdx].name}
                  dayType={days[editingDayIdx].type}
                  showDayType={showHV}
                  category={days[editingDayIdx].category}
                  exercises={days[editingDayIdx].exercises}
                  onChange={next => updateDayExercises(editingDayIdx, next)}
                  intakeAnswers={intakeAnswers}
                  recommendedExerciseIds={recommendedIds}
                  reasons={dayReasons}
                  startingWeightKg={weightKg}
                  sex={sex}
                  gymLevel={gymLevelFromIntake(intakeAnswers)}
                  units={units}
                />
              )
            })()}
          </section>
        )}

        {error && <p className={styles.error}>{error}</p>}

        {/* Ready-state for the primary action button. When the current step
            has a valid selection we light the button with a shimmer animation
            that visually pairs with the selected card's mint glow — so the
            user has an unmistakable "now press this" cue. */}
        {(() => {
          const stepReady =
            step === 1 ? days.length > 0 && selectedPresetId !== null
          : step === 2 ? days.length > 0 && days.some(d => d.category !== 'rest')
          : days.every(d => d.category === 'rest' || d.exercises.length > 0)
          const showReady = stepReady && !isPending
          // "All tuned" nudge — every picked lift across every training day
          // has been tuned. Lights the forward button fully on the exercise
          // step (step 3) as a "you're done dialing in, press this" cue.
          // Rest days are excused (they legitimately hold no exercises), the
          // same way step 3's stepReady excuses them. Visual only — never
          // gates the button.
          const allTuned =
            days.length > 0 &&
            days.every(d =>
              d.category === 'rest' ||
              (d.exercises.length > 0 && d.exercises.every(e => e.tuned)),
            )
          // Focused per-day edit — a single Save that writes the rotation
          // and drops back to the day menu. No Back/Continue (the header's
          // "Your days" is the only way out).
          if (focused) {
            return (
              <div className={`${styles.navRow} ${styles.navRowFocused}`}>
                <button
                  type="button"
                  className={`btn btn-primary ${styles.navPrimary} ${showReady && allTuned ? styles.continueAllTuned : ''} ${showReady ? styles.navPrimaryReady : ''}`}
                  onClick={handleFocusedSave}
                  disabled={isPending}
                >
                  {isPending ? 'Saving…' : 'Save changes →'}
                </button>
              </div>
            )
          }
          // Step 1 is fully card-driven — every card (a preset, Edit current,
          // Build your own) is ONE tap straight into the flow. No Continue
          // button here, so there's never a "did tapping do something, or do I
          // still press the button?" ambiguity.
          if (step === 1) return null
          return (
            <div className={styles.navRow}>
              {step > 1 && (
                <button type="button" className="btn btn-ghost" onClick={prevStep} disabled={isPending}>
                  Back
                </button>
              )}
              {step < TOTAL_STEPS ? (
                <button
                  type="button"
                  className={`btn btn-primary ${styles.navPrimary} ${showReady ? styles.navPrimaryReady : ''}`}
                  onClick={nextStep}
                  disabled={isPending}
                >
                  Continue →
                </button>
              ) : (
                <button
                  type="button"
                  className={`btn btn-primary ${styles.navPrimary} ${showReady ? styles.navPrimaryReady : ''} ${step === 3 && allTuned ? styles.continueAllTuned : ''}`}
                  onClick={handleSave}
                  disabled={isPending}
                >
                  {isPending ? 'Saving…' : isEditing ? 'Save changes' : 'Start training →'}
                </button>
              )}
            </div>
          )
        })()}
      </div>

      {activityPickerIdx !== null && days[activityPickerIdx] && (
        <ActivityPickerSheet
          dayName={days[activityPickerIdx].name}
          current={days[activityPickerIdx].activeRest}
          onPick={next => updateDay(activityPickerIdx, { activeRest: next ?? undefined })}
          onClose={() => setActivityPickerIdx(null)}
        />
      )}

      {intakeOpen && (
        <IntakeQuiz
          initialAnswers={intakeAnswers}
          goal={goal}
          onComplete={handleIntakeComplete}
          onCancel={() => setIntakeOpen(false)}
        />
      )}

      {/* Leave-confirm modal — guards the back-to-Fitness link so a
          half-finished wizard isn't thrown away with one click. */}
      {confirmLeaveOpen && (
        <div
          className={styles.confirmOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-leave-title"
          onClick={() => setConfirmLeaveOpen(false)}
        >
          <div className={styles.confirmDialog} onClick={e => e.stopPropagation()}>
            <span className={styles.confirmEyebrow}>
              <span className={styles.confirmEyebrowRule} aria-hidden />
              HEADS UP
            </span>
            <h2 id="confirm-leave-title" className={styles.confirmTitle}>
              <em>Leave setup?</em>
            </h2>
            <p className={styles.confirmBody}>
              Your changes won&apos;t be saved until you finish all three steps. Heading back to Fitness now means starting this setup over next time.
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmStay}
                onClick={() => setConfirmLeaveOpen(false)}
              >
                Stay
              </button>
              <button
                type="button"
                className={styles.confirmLeave}
                // Leaving to /app/fitness/log loops: that route redirects back
                // to /app/fitness/setup whenever setup_complete is false (which
                // it is for anyone who hasn't finished setup), so the user just
                // landed back here. Go to the dashboard (/app) instead — it has
                // no setup gate. An EDITING user (isEditing === setup_complete)
                // already has a split, so send them to their session menu.
                onClick={() => router.push(isEditing ? '/app/fitness/log' : '/app')}
              >
                Leave anyway →
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

/**
 * Weekly rhythm visualization — the card's "icon."
 * Renders 7 weekday letters with a dot beneath each: mint (heavy),
 * amber (volume), faint outline (rest). Pattern-as-icon — readable at
 * a glance, no description paragraph needed.
 *
 * `compact` halves the cell width for use inside the side-by-side
 * "Edit current" card.
 */
/** Dot class for a day. On the chooser, EVERY training day is one mint colour —
 *  heavy/volume periodisation isn't surfaced here (it'd force a concept on people
 *  just picking how many days they want; it lives in the logger instead). Rest is
 *  a hollow dot; an active-rest day keeps its mint outline. */
function rhythmDotClass(d: PresetDay): string {
  if (d.type === 'RECOVERY') return d.activeRest ? styles.rhythmActive : styles.rhythmRest
  return styles.rhythmHeavy // mint — all training days alike
}

/** Smallest repeating period of a rotation by category — e.g. PPL classic
 *  [push, pull, legs, rest, push, pull, legs] repeats every 4. Falls back to
 *  the full length when there's no clean sub-period. Lets a rotating card show
 *  ONE microcycle instead of a cramped 7-day expansion. */
function cyclePeriod(days: PresetDay[]): number {
  const n = days.length
  for (let p = 1; p < n; p++) {
    let ok = true
    for (let i = p; i < n; i++) {
      if (days[i].category !== days[i % p].category) { ok = false; break }
    }
    if (ok) return p
  }
  return n
}

/** Short, readable label for a training day — its real name trimmed to one
 *  tidy word that fits under a dot. Rest days get no label. */
function sessionLabel(day: PresetDay): string {
  if (day.type === 'RECOVERY' || day.category === 'rest') return ''
  const name = day.name.trim()
  const short: Record<string, string> = { shoulders: 'Delts', 'full body': 'Full' }
  const key = name.toLowerCase()
  if (short[key]) return short[key]
  return name.split(/\s+/)[0] // first word only ("Push day" → "Push")
}

/** Clean loop glyph for the "repeats" tag — an SVG (not a unicode ↻, which
 *  renders inconsistently across fonts). */
function LoopGlyph() {
  return (
    <svg className={styles.rhythmRepeatIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  )
}

function WeekRhythm({
  days, compact = false, rotating = false,
}: {
  days: PresetDay[]
  compact?: boolean
  /** When true, render one microcycle + a "repeats" tag instead of a week. */
  rotating?: boolean
}) {
  // One unified 7-column grid for every card, so all rhythms line up. Each
  // training day is a labelled dot (its real name — mint heavy / amber volume);
  // rest is a hollow dot, no label. Rotating splits show ONE microcycle, then a
  // "repeats" tag fills the trailing columns — so the frequency always matches
  // the visible dots. Labels are hidden in `compact` (the tiny Edit-current strip).
  const renderCell = (d: PresetDay, i: number) => {
    const label = sessionLabel(d)
    return (
      <div key={i} className={styles.rhythmCell}>
        <span className={`${styles.rhythmDot} ${rhythmDotClass(d)}`} />
        {label
          ? <span className={styles.rhythmLabel}>{label}</span>
          : <span className={styles.rhythmLabelSpacer} aria-hidden />}
      </div>
    )
  }

  if (rotating) {
    const cycle = days.slice(0, Math.min(7, cyclePeriod(days)))
    const span = 7 - cycle.length
    return (
      <div className={`${styles.weekRhythm} ${compact ? styles.weekRhythmCompact : ''}`} aria-hidden>
        {cycle.map(renderCell)}
        {span > 0 && (
          <span className={styles.rhythmRepeat} style={{ gridColumn: `span ${span}` }} title="cycle repeats">
            <LoopGlyph /> repeats
          </span>
        )}
      </div>
    )
  }

  const week = [...days.slice(0, 7)]
  while (week.length < 7) week.push({ name: 'Rest', type: 'RECOVERY', category: 'rest', exercises: [] })

  return (
    <div className={`${styles.weekRhythm} ${compact ? styles.weekRhythmCompact : ''}`} aria-hidden>
      {week.map(renderCell)}
    </div>
  )
}

/**
 * Minimal abstract glyph per split — line-art in currentColor so it
 * inherits mint-on-active. Geometry maps to the split's rhythm:
 *   • Full Body 2 → one filled disc (one shape of session, two beats)
 *   • Full Body 3 → triangle (three identical sessions)
 *   • Upper/Lower → split square (two halves)
 *   • PPL 3      → three connected nodes (push · pull · legs)
 *   • Bro Split  → pentagon (five body parts)
 *   • PPL 6      → hexagon (PPL × 2)
 */
function PresetGlyph({ id }: { id: Preset['id'] }) {
  const props = {
    viewBox: '0 0 24 24', width: 22, height: 22,
    fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  }
  switch (id) {
    case 'full_body_2':
      return (
        <svg {...props}>
          <circle cx="9" cy="12" r="3.5" />
          <circle cx="16" cy="12" r="1.5" fill="currentColor" />
        </svg>
      )
    case 'full_body_3':
      return (
        <svg {...props}>
          <path d="M12 4 L20 19 L4 19 Z" />
        </svg>
      )
    case 'upper_lower_4':
      return (
        <svg {...props}>
          <rect x="4" y="4" width="16" height="7" rx="1.4" />
          <rect x="4" y="13" width="16" height="7" rx="1.4" />
        </svg>
      )
    case 'ppl_3':
      return (
        <svg {...props}>
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
          <line x1="6.8" y1="12" x2="10.2" y2="12" />
          <line x1="13.8" y1="12" x2="17.2" y2="12" />
        </svg>
      )
    case 'bro_5':
      return (
        <svg {...props}>
          <path d="M12 3.5 L20.5 9.7 L17.3 19.7 L6.7 19.7 L3.5 9.7 Z" />
        </svg>
      )
    case 'ppl_6':
      // Heavy × Volume rotation — two rows of three dots: top row filled
      // (the three HEAVY days: Push H / Pull H / Legs H), bottom row
      // outlined (the three VOLUME days: Push V / Pull V / Legs V).
      // Communicates the split's defining trait (two intensities per
      // movement) at glyph scale, no text needed.
      return (
        <svg {...props}>
          <circle cx="6"  cy="9"  r="1.6" fill="currentColor" />
          <circle cx="12" cy="9"  r="1.6" fill="currentColor" />
          <circle cx="18" cy="9"  r="1.6" fill="currentColor" />
          <circle cx="6"  cy="15" r="1.6" />
          <circle cx="12" cy="15" r="1.6" />
          <circle cx="18" cy="15" r="1.6" />
          <line x1="3" y1="9"  x2="3" y2="9.5"  strokeOpacity="0.4" />
          <line x1="3" y1="15" x2="3" y2="15.5" strokeOpacity="0.4" />
        </svg>
      )
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="5" />
        </svg>
      )
  }
}

/**
 * Beginner-friendliness badge — colored dot + tiny label. Green = good for
 * first-timers, amber = some experience helpful, red = high volume / demanding.
 * Drives the split-picker glance value: "which one's safest for me?"
 */
function LevelDot({ level }: { level: SplitLevel }) {
  const label = level === 'beginner' ? 'beginner'
              : level === 'intermediate' ? 'intermediate'
              : 'advanced'
  const klass = level === 'beginner' ? styles.levelBeginner
              : level === 'intermediate' ? styles.levelIntermediate
              : styles.levelAdvanced
  return (
    <span className={`${styles.levelBadge} ${klass}`}>
      <span className={styles.levelDot} aria-hidden />
      {label}
    </span>
  )
}
