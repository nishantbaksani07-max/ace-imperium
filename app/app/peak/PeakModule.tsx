'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getLocalDateKey } from '@/lib/dates'
import dashboardStyles from '../dashboard.module.css'
import styles from './peak.module.css'
import { usePeakState, todayLogs, todayManual, hasManualToday } from './state'
import type { EventType, PeakState, ScheduledEvent, SubstanceLog, TaskDifficulty, WhoopSignal } from './types'
import type { WorkoutReadResult } from './workoutRead'
import YourDaySchedule from './YourDaySchedule'
import QuickAddConsole from './QuickAddConsole'
import { useDaySchedule } from './useDaySchedule'
import type { DayItem } from './dayModel'
import type { PeakTrackerInitial } from '../peak-tracker/types'
import type { DayInputs } from './loadDayInputs'
import {
  bestHourToday,
  computeCurve,
  computeCurveDetailed,
  findPeakWindows,
  scoreDrivers,
  scoreNow,
  tierFor,
  tierHint,
} from './curve'
import { SUBSTANCES } from './substances'
import { eventsForToday, findSlotByMode } from './schedule'
import CurveChart, { type CurvePill } from './CurveChart'
import TodayCard, { type TodayBullet } from './TodayCard'
import QuickActions from './QuickActions'
import { useTodayWaterCount } from './useWaterCount'
import { useTodaySupplements, useTodayGoals } from './useLifeSignals'
import { usePostingDeadlines } from './usePostingDeadlines'
import DayCommitments from './DayCommitments'
import type { ScoreInputs } from './curve'
import MoodPicker from './MoodPicker'
import HealthWatch from './HealthWatch'
import StimQuickLog from './StimQuickLog'
import StartMyDay from './StartMyDay'
import BestHours from './BestHours'
import PeakGem from '@/components/PeakGem'
import WelcomeBackdrop from '@/components/WelcomeBackdrop'

interface Props {
  initialWhoop: WhoopSignal
  initialSchedule: PeakTrackerInitial
  initialDayInputs: DayInputs
  /** Durable Peak state from the DB (substance logs, taps, profile, pinned
   *  stack), RLS-scoped to this user — seeds usePeakState so logs persist
   *  across devices. Null when there's no row yet (falls back to localStorage). */
  initialPeakState?: Partial<PeakState> | null
  /** Today's auto-read workout verdict from Train (Peak reads it, never writes
   *  Train). Drives the curve bump at the real training time + a warm line. */
  initialWorkout?: WorkoutReadResult
}

/** Standalone Peak stack builder (served separately during dev). The SETUP
 *  link in the quick-log opens it in a new tab. */
const STANDALONE_PEAK_URL = 'http://localhost:8777/peak-stack.html'

function fmtHourShort(h: number): string {
  if (h === 0 || h === 24) return '12 AM'
  if (h === 12) return '12 PM'
  return h > 12 ? `${h - 12} PM` : `${h} AM`
}

/**
 * Builds the hero copy, supporting bullets, and signal chips for the
 * TodayCard from the user's actual state. Mirrors the standalone
 * design's buildToday()/buildCoach() functions but is data-driven —
 * no preset scenarios; whatever the user has logged is what shows up.
 */
function buildToday({
  score,
  whoop,
  bestHour,
  todaySubstanceLogs,
  isEmpty,
  waterCount,
}: {
  score: number
  whoop: WhoopSignal
  bestHour: number
  todaySubstanceLogs: ReturnType<typeof todayLogs>
  isEmpty: boolean
  waterCount: number
}): { hero: { title: string; body: string }; bullets: TodayBullet[] } {
  const tier = tierFor(score)
  const now = new Date()
  const hour = now.getHours() + now.getMinutes() / 60

  const caffeine = todaySubstanceLogs.filter(s => SUBSTANCES[s.key]?.category === 'caffeine')
  const workouts = todaySubstanceLogs.filter(s => s.key === 'workout')
  const hadWater = waterCount > 0
  const hadWorkout = workouts.length > 0
  const lastCaffeine = caffeine[caffeine.length - 1]

  if (isEmpty) {
    return {
      hero: {
        title: 'Your evening still rises — that’s biology.',
        body: `With no logs and no wearable, this is your circadian baseline. Even on a blank day, your peak window opens around ${fmtHourShort(bestHour)}.`,
      },
      bullets: [
        { title: 'Start small.', body: 'Log a coffee or connect WHOOP — the rest fills in.' },
        { title: 'Or just check your mood.', body: 'Tap a chip below — that alone helps the model learn you.' },
      ],
    }
  }

  const bullets: TodayBullet[] = []
  if (whoop.recovery != null && whoop.recovery >= 80) {
    bullets.push({
      title: `Recovery ${Math.round(whoop.recovery)}%.`,
      body: 'Stack your hardest training or thinking session inside the peak window.',
    })
  } else if (whoop.recovery != null && whoop.recovery < 50) {
    bullets.push({
      title: `Recovery ${Math.round(whoop.recovery)}%.`,
      body: 'Cut caffeine ~30% and skip a second hard session. Brute-forcing a red day costs you tomorrow.',
    })
  }
  if (lastCaffeine) {
    const hoursSince = (Date.now() - lastCaffeine.takenAt) / 3_600_000
    if (hoursSince < 8 && hour > 15) {
      bullets.push({
        title: 'Caffeine in the last 8h.',
        body: 'Stop now for clean sleep — half-life ~5h. After 3pm it bleeds into slow-wave sleep.',
      })
    } else if (hoursSince > 6 && hour < 14) {
      bullets.push({
        title: 'Caffeine cleared.',
        body: 'Past its half-life — no afternoon dose needed unless you’re truly dragging.',
      })
    }
  } else if (hour < 11) {
    bullets.push({
      title: 'No caffeine logged.',
      body: 'A standard coffee in the next 30 minutes lifts your morning curve ~12 points.',
    })
  }
  if (!hadWorkout && hour > 9 && hour < 18 && score >= 60) {
    bullets.push({
      title: 'Workout window open.',
      body: 'A session here pegs your peak ~90 min after via BDNF + dopamine.',
    })
  }
  if (!hadWater && hour > 8) {
    bullets.push({
      title: 'No hydration logged.',
      body: 'A glass of water nudges focus. Log it in Fuel, the cheapest move in your stack.',
    })
  }

  const heroTitle = tierHint(tier).replace(/[.!]$/, '')
  const heroBody =
    bestHour > hour
      ? `Best hour today is ${fmtHourShort(bestHour)} — block it for what matters most.`
      : `Peak window passed (${fmtHourShort(bestHour)}). Remaining day favors moderate-load tasks.`

  return {
    hero: { title: `${heroTitle}.`, body: heroBody },
    bullets: bullets.slice(0, 3),
  }
}

/**
 * Peak Score module — read-only insight surface (final "Peak Interactive"
 * redesign). Layout, top to bottom:
 *   · compact header (back · Peak · date)
 *   · CurveChart on top — live hover gauge + scrubbing cursor + Line/Bars/Stack
 *   · ScheduleStrip (events + substance + mood dots, aligned to chart axis)
 *   · MoodPicker card (5 big options)
 *   · MarketTicker (NASDAQ-style WHOOP + hydration signals)
 *   · TodayCard (hero recommendation + bullets)
 *   · score row: ScoreRing (day-overall) | BestHours (all windows)
 *   · ScoreDrivers ("why your score is N" waterfall + how to raise it)
 *   · QuickActions (single "Log water in Fuel" link — Peak no longer logs)
 *
 * Three distinct score readings coexist (intentionally):
 *   · ring + drivers → whole-DAY overall score (scoreDrivers().total)
 *   · hover gauge / cursor → per-hour score (scoreAtHour)
 *   · chart "now" dot → instantaneous score (scoreNow)
 *
 * Logging surfaces (full substance picker, gym planner, event CRUD, tasks)
 * move to a separate Schedule tab — those files still exist in this directory.
 */
export default function PeakModule({ initialWhoop, initialSchedule, initialDayInputs, initialPeakState, initialWorkout }: Props) {
  const { ready, state, actions } = usePeakState(initialWhoop, initialPeakState)
  const waterCount = useTodayWaterCount()
  const supSignal = useTodaySupplements()
  const goalSignal = useTodayGoals()
  const postingDeadlines = usePostingDeadlines()
  const [tick, setTick] = useState(0)
  const [ringOpen, setRingOpen] = useState(false)
  const [toast, setToast] = useState<{ text: string; tone: 'good' | 'neutral' } | null>(null)
  // Single source of truth for the "Your Day" schedule, shared between the
  // lower UI (YourDaySchedule) and the energy curve below — its items render
  // as bands on the curve, and curve drags write straight back through it.
  const schedule = useDaySchedule(initialSchedule)
  const scheduleItems = schedule.items

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2400)
    return () => clearTimeout(id)
  }, [toast])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setRingOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const {
    curve,
    detailedCurve,
    baselineCurve,
    score,
    baselineNow,
    stimLift,
    windows,
    best,
    nowHour,
    todaySubstanceLogs,
    todayTaps,
    todayEvents,
  } = useMemo(() => {
    // Auto-first: place today's real workout on the curve at the time it
    // actually happened (from the logged set timestamps), unless the user
    // already tapped a workout manually. Reuses the existing 'workout'
    // substance, so no new curve math: dose 1 + current tolerance is exactly
    // what a manual tap would log. Curve only — the substance timeline and the
    // whole-day drivers ring stay as the user's own logged inputs.
    const derivedWorkout: SubstanceLog | null =
      initialWorkout?.hadSession &&
      initialWorkout.window &&
      !todayLogs(state).some(l => l.key === 'workout')
        ? {
            id: `derived_workout_${initialWorkout.window.startMs}`,
            key: 'workout',
            takenAt: initialWorkout.window.startMs,
            dose: 1,
            tolerance: state.profile.tolerance ?? 5,
          }
        : null
    const stateForCurve = derivedWorkout
      ? { ...state, substances: [...state.substances, derivedWorkout] }
      : state
    const c = computeCurve(stateForCurve, initialWhoop)
    const dc = computeCurveDetailed(stateForCurve, initialWhoop)
    // The same curve with the psychoactive logs (caffeine + alcohol) stripped —
    // the dotted "without your stims" reference the chart draws under the real
    // line, so the gap between them IS the effect of what you logged. A workout
    // is not a stim, so it stays in this baseline too.
    const stimless = stateForCurve.substances.filter(l => {
      const cat = SUBSTANCES[l.key]?.category
      return cat !== 'caffeine' && cat !== 'depressant'
    })
    const bc = computeCurve({ ...stateForCurve, substances: stimless }, initialWhoop)
    const s = scoreNow(c)
    // The readiness lift right now: with-stims score − no-stims baseline. Same
    // delta the standalone's renderPeakWindow shows ("natural 38 → 72, +34").
    const bn = scoreNow(bc)
    const now = new Date()
    const nh = now.getHours() + now.getMinutes() / 60
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    return {
      curve: c,
      detailedCurve: dc,
      baselineCurve: bc,
      score: s,
      baselineNow: bn,
      stimLift: s - bn,
      windows: findPeakWindows(c),
      best: bestHourToday(c),
      nowHour: nh,
      todaySubstanceLogs: todayLogs(state),
      todayTaps: state.taps.filter(t => t.time >= dayStart),
      todayEvents: eventsForToday(state.events),
    }
    // tick included so the live score re-derives every minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, initialWhoop, tick, initialWorkout])

  // Whether anything psychoactive is logged — drives the dotted baseline + legend.
  const hasStimsToday = useMemo(
    () => todaySubstanceLogs.some(l => {
      const cat = SUBSTANCES[l.key]?.category
      return cat === 'caffeine' || cat === 'depressant'
    }),
    [todaySubstanceLogs],
  )

  const signalCount = useMemo(() => {
    let n = 0
    if (initialWhoop.recovery != null) n++
    if (initialWhoop.sleepScore != null) n++
    if (initialWhoop.sleepHours != null) n++
    if (initialWhoop.hrv != null) n++
    if (initialWhoop.strain != null) n++
    if (initialWhoop.sleepDebtHours != null) n++
    return n
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialWhoop])

  // Today's manual check-in — the universal fallback that moves the score with
  // no wearable. tick keeps it fresh across midnight.
  const manualToday = useMemo(() => todayManual(state), [state, tick])
  const manualFilled = hasManualToday(manualToday)

  const isEmpty =
    todaySubstanceLogs.length === 0 && signalCount === 0 && waterCount === 0 && !manualFilled
  const confidence = isEmpty ? 'baseline' : signalCount >= 4 ? 'full' : (signalCount as 1 | 2 | 3 | 4 | 5 | 6)
  const confLabel =
    confidence === 'baseline'
      ? 'Circadian baseline'
      : confidence === 'full'
        ? 'Full read'
        : `${confidence} signal${confidence === 1 ? '' : 's'}`

  const today = useMemo(
    () =>
      buildToday({
        score,
        whoop: initialWhoop,
        bestHour: best,
        todaySubstanceLogs,
        isEmpty,
        waterCount,
      }),
    [score, initialWhoop, best, todaySubstanceLogs, isEmpty, waterCount],
  )

  // Whole-day overall score — defined by its drivers (they sum to it). This is
  // the number the ring + drivers panel show, distinct from the instantaneous
  // scoreNow used by the chart's "now" dot.
  // Everything else the app already tracks, pulled in as score drivers (Phase 3).
  // Server-loaded sources (real workouts + nutrition) arrive via initialDayInputs;
  // the client/localStorage sources (supplements, goals, mood) are read here.
  const scoreInputs = useMemo<ScoreInputs>(() => {
    const moodAvg = todayTaps.length
      ? todayTaps.reduce((a, t) => a + t.value, 0) / todayTaps.length
      : undefined
    return {
      trainedToday: initialDayInputs.trainedToday,
      workoutSets: initialDayInputs.workoutSets || undefined,
      ateToday: initialDayInputs.ateToday,
      proteinPct: initialDayInputs.proteinPct ?? undefined,
      caloriesPct: initialDayInputs.caloriesPct ?? undefined,
      supTaken: supSignal.total > 0 ? supSignal.taken : undefined,
      supTotal: supSignal.total > 0 ? supSignal.total : undefined,
      streak: goalSignal.streak || undefined,
      goalsRequired: goalSignal.required > 0 ? goalSignal.required : undefined,
      goalsCompleted: goalSignal.required > 0 ? goalSignal.completed : undefined,
      moodAvg,
    }
  }, [initialDayInputs, supSignal, goalSignal, todayTaps])

  const driverData = useMemo(
    () => scoreDrivers(initialWhoop, todaySubstanceLogs, waterCount, manualToday, scoreInputs),
    [initialWhoop, todaySubstanceLogs, waterCount, manualToday, scoreInputs],
  )
  const dayScore = driverData.total
  const dayTier = tierFor(dayScore)

  // Schedule items → ScheduledEvent bands on the energy curve. Timed items sit
  // where the user put them; loose (untimed) tasks AUTO-PLACE on the best free
  // window for their difficulty (hard→peak, normal→moderate, easy→lowest), so
  // typing "deep work hard" drops it straight onto your peak. Coloured by
  // difficulty via EventType tone. Merged with any legacy localStorage events.
  const scheduleEvents = useMemo<ScheduledEvent[]>(() => {
    const todayKey = getLocalDateKey()
    const diffToType: Record<TaskDifficulty, EventType> = { hard: 'work', normal: 'other', easy: 'personal' }
    const diffToMode: Record<TaskDifficulty, 'highest' | 'moderate' | 'lowest'> = { hard: 'highest', normal: 'moderate', easy: 'lowest' }
    const mk = (i: DayItem, startHour: number, endHour: number): ScheduledEvent => ({
      id: i.id,
      title: i.name,
      type: diffToType[i.difficulty] ?? 'other',
      startHour,
      endHour,
      recurringDays: null,
      date: todayKey,
      skippedDates: [],
      createdAt: 0,
    })
    // Fixed events (legacy + timed items) are obstacles the loose tasks dodge.
    const busy: ScheduledEvent[] = [...todayEvents]
    const out: ScheduledEvent[] = []
    for (const i of scheduleItems) {
      if (i.start == null) continue
      const ev = mk(i, i.start, i.end ?? i.start + 1)
      out.push(ev); busy.push(ev)
    }
    for (const i of scheduleItems) {
      if (i.start != null) continue
      const slot = findSlotByMode(curve, busy, i.durHours ?? 1, diffToMode[i.difficulty] ?? 'moderate')
      if (!slot) continue
      const ev = mk(i, slot.start, slot.end)
      out.push(ev); busy.push(ev)
    }
    return out
  }, [scheduleItems, curve, todayEvents])

  // The same placed items as draggable pills for the interactive curve overlay.
  // Carries each item's colour + lock pin; ghost = an untimed task shown at its
  // auto-placed slot (dragging it pins a real time).
  const schedulePills = useMemo<CurvePill[]>(() => {
    const byId = new Map(scheduleItems.map(i => [i.id, i]))
    return scheduleEvents.map(ev => {
      const i = byId.get(ev.id)
      return {
        id: ev.id,
        start: ev.startHour,
        end: ev.endHour,
        name: ev.title,
        color: i?.color ?? '#6EE7B7',
        locked: i?.locked,
        ghost: i?.start == null,
      }
    })
  }, [scheduleEvents, scheduleItems])

  const handleOpenSchedule = useCallback(() => {
    // The schedule is now inline on this page (the "Your Day" section).
    setToast({ text: 'Add it in the schedule above ↑', tone: 'neutral' })
  }, [])

  if (!ready) {
    return (
      <main className={`${dashboardStyles.page} grain-overlay`}>
        <div className={dashboardStyles.shell} />
      </main>
    )
  }

  const dateLabel = new Date()
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    .toUpperCase()

  // Soft once-per-day morning gate (BUILD71) — opens the "Start my day" flow
  // before the tracker until the user completes or skips it for the day.
  const needsPlan = state.lastPlannedDate !== getLocalDateKey()

  return (
    <main className={`${dashboardStyles.page} grain-overlay`}>
      <WelcomeBackdrop />
      {needsPlan && (
        <StartMyDay
          windows={windows}
          bestHour={best}
          deadlines={postingDeadlines}
          trainedToday={initialDayInputs.trainedToday}
          workoutSets={initialDayInputs.workoutSets}
          hero={today.hero}
          onAddItem={schedule.handleAdd}
          onClose={actions.markDayPlanned}
        />
      )}
      <div className={dashboardStyles.shell}>
        <Link href="/app" className={styles.piBackPill} style={{ alignSelf: 'flex-start', marginBottom: 20 }}>
          <span style={{ fontSize: 14, lineHeight: 1 }}>←</span> Vitality
        </Link>

        {/* top bar: gem + serif title + date, with today's vitals on the right */}
        <div className={styles.pkHeader}>
          <PeakGem size={148} className={styles.pkGemWrap} />
          <div className={styles.pkHeaderText}>
            <h1 className={styles.pkTitle}>Your <span className={styles.pkTitleAccent}>peak</span> today</h1>
            <div className={styles.pkDate}>{dateLabel}</div>
          </div>
        </div>

        {/* ── ·01 YOUR DAY — the energy curve, first thing on the page ─────── */}
        <div className={styles.pkSection} style={{ animationDelay: '0.14s' }}>
          <div className={styles.pkEyebrow}>
            <span className={styles.pkEyebrowNum}>·01</span>
            <span className={styles.pkEyebrowLbl}>Your day</span>
            <span className={styles.pkEyebrowRule} />
            <button className={styles.pkInfoI} onClick={() => setRingOpen(true)} aria-label="why this score">i</button>
          </div>
          {/* One-tap stim logging — each tap feeds the real curve so the solid
              line lifts above the dotted no-stims baseline. */}
          <StimQuickLog
            onLog={actions.logSubstance}
            onPin={actions.pinSubstance}
            onUnpin={actions.unpinSubstance}
            quickKeys={state.quickKeys}
            logs={todaySubstanceLogs}
            standaloneUrl={STANDALONE_PEAK_URL}
            showLegend={hasStimsToday}
            naturalNow={baselineNow}
            withStimsNow={score}
            lift={stimLift}
          />
          <CurveChart
            curve={detailedCurve}
            baselineCurve={baselineCurve}
            windows={windows}
            nowHour={nowHour}
            events={[...todayEvents, ...scheduleEvents]}
            taps={todayTaps}
            logs={todaySubstanceLogs}
            onLogFeeling={actions.tap}
            pills={schedulePills}
            onMovePill={schedule.move}
            onToggleLock={schedule.toggleLock}
            onArmWindow={schedule.armWindow}
            armed={schedule.armed}
            pendingOverlap={schedule.pendingOverlap}
            onResolveOverlap={schedule.resolveOverlap}
          />
          {/* Quick-add console — plan straight off the day you're looking at. */}
          <div className={styles.yourDay}>
            <QuickAddConsole onAdd={schedule.handleAdd} />
          </div>
        </div>

        {/* ── ·02 YOUR SCHEDULE — sits directly under the graph ────────────── */}
        <div className={styles.pkSection} style={{ animationDelay: '0.20s' }}>
          <div className={styles.pkEyebrow}>
            <span className={styles.pkEyebrowNum}>·02</span>
            <span className={styles.pkEyebrowLbl}>Your schedule</span>
            <span className={styles.pkEyebrowRule} />
          </div>
          <div className={styles.pkCard}>
            <YourDaySchedule schedule={schedule} />
          </div>
          {/* Commitments from other modules — brand posting deadlines + workout */}
          <DayCommitments
            deadlines={postingDeadlines}
            trainedToday={initialDayInputs.trainedToday}
            workoutSets={initialDayInputs.workoutSets}
            bestHour={best}
          />
          <div className={styles.pkSubLbl}>Peak windows</div>
          <BestHours curve={curve} nowHour={nowHour} onBlock={handleOpenSchedule} />
        </div>

        {/* ── ·03 NOW — health watch · score + recommendation ──────────────── */}
        <div className={styles.pkSection} style={{ animationDelay: '0.26s' }}>
          <div className={styles.pkEyebrow}>
            <span className={styles.pkEyebrowNum}>·03</span>
            <span className={styles.pkEyebrowLbl}>Now</span>
            <span className={styles.pkEyebrowRule} />
          </div>
          {/* Health watch — real-data load & vitals monitor (caffeine mg, late
              doses, tolerance + live WHOOP/manual vitals, no demo values). */}
          <HealthWatch logs={todayLogs(state)} whoop={initialWhoop} manual={manualToday} />
          {/* score + recommendation, side by side */}
          <div className={styles.pkRightNow}>
            <button type="button" className={styles.pkScoreTile} onClick={() => setRingOpen(true)} aria-label="Why this score">
              <span className={styles.pkScoreTop}>
                <span className={styles.pkScoreIc}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10.5H13L13 2Z" />
                  </svg>
                </span>
                <span className={styles.pkScoreLbl}>Today overall</span>
              </span>
              <span className={styles.pkScoreBig}>
                <span className={styles.pkScoreNum}>{Math.round(dayScore)}</span>
                <span className={styles.pkScoreUnit}>/ 100<br />{dayTier}</span>
              </span>
              <span className={styles.pkScoreMeter}>
                <span className={styles.pkScoreFill} style={{ width: `${Math.min(100, Math.max(0, dayScore))}%` }} />
              </span>
              <span className={styles.pkScoreFoot}>
                <span>{confLabel}</span>
                <span className={styles.pkScoreWhy}>Why this score →</span>
              </span>
            </button>
            <div className={styles.pkTodayCell}>
              <TodayCard
                hero={today.hero}
                bullets={
                  initialWorkout?.hadSession
                    ? [{ title: initialWorkout.label, body: initialWorkout.detail }, ...today.bullets]
                    : today.bullets
                }
              />
            </div>
          </div>
        </div>

        {/* ── ·04 LOG — quick log · mood ─────────────────────────────────── */}
        <div className={styles.pkSection} style={{ animationDelay: '0.32s' }}>
          <div className={styles.pkEyebrow}>
            <span className={styles.pkEyebrowNum}>·04</span>
            <span className={styles.pkEyebrowLbl}>Log</span>
            <span className={styles.pkEyebrowRule} />
          </div>
          <QuickActions waterCount={waterCount} />
          <div className={styles.pkLogDivider} />
          <MoodPicker todayTaps={todayTaps} onPick={actions.tap} compact simple />
        </div>
      </div>

      {ringOpen && (
        <div
          className={styles.pkModalBackdrop}
          onClick={() => setRingOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className={styles.pkModal} onClick={e => e.stopPropagation()}>
            <button className={styles.pkModalClose} onClick={() => setRingOpen(false)} aria-label="close">×</button>
            <div className={styles.pkModalEyebrow}>
              <span className={styles.pkModalGem}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10.5H13L13 2Z" />
                </svg>
              </span>
              Recovery · Sleep · Load
            </div>
            <div className={styles.pkModalRule} />
            <div className={styles.pkModalTitle}>Why you&apos;re at <em>{Math.round(dayScore)}</em></div>
            <p className={styles.pkModalBody}>{tierHint(dayTier)}</p>
            <div className={styles.pkDrivers}>
              {(() => {
                const ds = driverData.drivers
                const maxAbs = Math.max(1, ...ds.map(d => Math.abs(d.value)))
                return ds.map((d, i) => {
                  const neg = d.value < 0
                  return (
                    <div key={i} className={styles.pkDriver}>
                      <span className={styles.pkDriverLbl}>{d.label}</span>
                      <span className={styles.pkDriverBar}>
                        <i data-neg={neg ? '1' : '0'} style={{ width: `${Math.round((Math.abs(d.value) / maxAbs) * 100)}%` }} />
                      </span>
                      <span className={styles.pkDriverVal} data-neg={neg ? '1' : '0'}>
                        {neg ? '−' : '+'}{Math.abs(Math.round(d.value))}
                      </span>
                    </div>
                  )
                })
              })()}
            </div>
            <div className={styles.pkModalNote}>
              <span className={styles.pkModalNoteRule} />
              <em>
                {(() => {
                  const top = driverData.drivers
                    .filter(d => d.value > 0 && !/baseline|circadian/i.test(d.label))
                    .sort((a, b) => b.value - a.value)[0]
                  return top ? `Mostly your ${top.label.toLowerCase()} today.` : 'Building from your baseline.'
                })()}
              </em>
              <span className={styles.pkModalNoteRule} />
            </div>
            <div className={styles.pkModalFoot}>Based on your WHOOP + logs</div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={styles.piToast}
          data-tone={toast.tone}
          role="status"
        >
          <span className={styles.piToastDot} data-tone={toast.tone} />
          {toast.text}
        </div>
      )}
    </main>
  )
}
