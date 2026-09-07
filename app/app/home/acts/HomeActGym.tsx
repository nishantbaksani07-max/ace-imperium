'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { HomePull, PullReading } from '@/lib/home/pullTypes'
import type { PeakState, WhoopSignal } from '@/app/app/peak/types'
import { bestHourToday, computeCurve, fmtHourLabel } from '@/app/app/peak/curve'
import {
  daysBetween,
  inferTodayTrainingDay,
  type TrainingAnticipation,
} from '@/lib/home/presence'
import styles from './homeActGym.module.css'

/**
 * ACT 3 - GYM. Today's session as one button-card inside the homecoming
 * ritual. The shell only mounts this when the account trains (presence).
 * The day comes from inferTodayTrainingDay (lib/home/presence.ts): a locked
 * training_day row stays locked; otherwise the rotation math anticipates it
 * and Vee SAYS so ("Yesterday was Push. Today reads as Pull."). No rotation
 * and nothing locked = no fabricated day name - the card goes open-session.
 * The peak-window line only appears when peak_state exists (bestHourToday
 * over the real curve). No writes in v1 - "Lock it in" is a spoken
 * commitment; the schedule write lands with the daily_ritual migration.
 */

interface Props {
  pull: HomePull
  firstName: string
  onDone: () => void
}

type Beat = 'session' | 'locked' | 'skipped'

const norm = (s: string) => s.trim().toLowerCase()

/** "Last Push was 4 days ago" - only when recentWorkouts can back it. */
function lastSeenLine(pull: HomePull, resolved: TrainingAnticipation): string | null {
  const same = pull.recentWorkouts.find(
    w => w.day_name != null && norm(w.day_name) === norm(resolved.name),
  )
  const pick = same ?? pull.recentWorkouts[0] ?? null
  if (!pick) return null
  const n = daysBetween(pull.today, pick.date)
  const what = same ? `Last ${resolved.name}` : 'Your last session'
  if (n <= 0) return same ? `You already logged ${resolved.name} today.` : 'You already trained today.'
  if (n === 1) return `${what} was yesterday.`
  return `${what} was ${n} days ago.`
}

/**
 * Narrow the peak_state.data blob to the fields computeCurve reads
 * (substances + profile.weightKg). Anything malformed -> null, no curve line.
 */
function coercePeakState(raw: unknown): PeakState | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const p = o.profile && typeof o.profile === 'object' ? (o.profile as Record<string, unknown>) : null
  const weightKg = typeof p?.weightKg === 'number' && Number.isFinite(p.weightKg) ? p.weightKg : 75
  const tolerance = typeof p?.tolerance === 'number' ? p.tolerance : 5
  const substances: PeakState['substances'] = []
  if (Array.isArray(o.substances)) {
    for (const s of o.substances) {
      if (!s || typeof s !== 'object') continue
      const l = s as Record<string, unknown>
      if (typeof l.key !== 'string' || typeof l.takenAt !== 'number' || typeof l.dose !== 'number') continue
      substances.push({
        id: typeof l.id === 'string' ? l.id : '',
        key: l.key,
        takenAt: l.takenAt,
        dose: l.dose,
        tolerance: typeof l.tolerance === 'number' ? l.tolerance : 5,
      })
    }
  }
  return {
    version: 1,
    profile: { weightKg, tolerance },
    substances,
    taps: [],
    events: [],
    hardestTask: null,
    tasks: [],
    manual: {},
  }
}

/**
 * WhoopSignal from the pull readings - same fold as the recap (band first,
 * manual fills gaps) and the same validity windows loadWhoopSignal uses so
 * a noisy reading can't poison the curve.
 */
function deriveWhoop(readings: PullReading[], today: string): WhoopSignal {
  const rows = readings
    .filter(r => r.date === today)
    .sort((a, b) => (a.provider === 'manual' ? 1 : 0) - (b.provider === 'manual' ? 1 : 0))
  const pick = (k: 'recovery' | 'hrv' | 'rhr' | 'sleep_perf' | 'sleep_hours' | 'strain'): number | null => {
    for (const r of rows) if (r[k] != null) return r[k]
    return null
  }
  const VALID_HRV = (v: number) => v >= 15 && v <= 150
  const VALID_RHR = (v: number) => v >= 30 && v <= 90
  const hrvHist: number[] = []
  const rhrHist: number[] = []
  for (const r of readings) {
    if (r.hrv != null && VALID_HRV(r.hrv)) hrvHist.push(r.hrv)
    if (r.rhr != null && VALID_RHR(r.rhr)) rhrHist.push(r.rhr)
  }
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length
  const hrv = pick('hrv')
  const sleepHours = pick('sleep_hours')
  return {
    recovery: pick('recovery'),
    hrv,
    sleepScore: pick('sleep_perf'),
    sleepHours,
    sleepDebtHours: sleepHours != null ? Math.max(0, 8 - sleepHours) : null,
    strain: pick('strain'),
    wakeHour: null,
    hrvBaseline: hrvHist.length >= 3 ? mean(hrvHist) : null,
    rhrBaseline: rhrHist.length >= 3 ? mean(rhrHist) : null,
    hrvAnomalous: hrv != null && !VALID_HRV(hrv),
    daysAvailable: Math.max(hrvHist.length, rhrHist.length),
  }
}

export default function HomeActGym({ pull, firstName, onDone }: Props) {
  const [beat, setBeat] = useState<Beat>('session')
  const doneRef = useRef(false)
  const rm = useRef(false)

  useEffect(() => {
    rm.current =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  const resolved = useMemo(
    () =>
      inferTodayTrainingDay({
        rotationDays: pull.rotationDays,
        recentWorkouts: pull.recentWorkouts,
        today: pull.today,
        trainingDay: pull.trainingDay,
        cycleStartedAt: pull.cycleStartedAt,
      }),
    [pull],
  )
  const seen = useMemo(
    () => (resolved ? lastSeenLine(pull, resolved) : null),
    [pull, resolved],
  )

  // The peak line only exists for a real Peak USER - a peak_state row with
  // zero substance logs is just the mirror of an opened tab, and its "best
  // window" would be the bare circadian template, not this account's data
  // (verify HIGH-3). Rest days and already-done days carry no window either.
  const peakTime = useMemo(() => {
    if (resolved?.isRest || resolved?.confidence === 'done') return null
    const state = coercePeakState(pull.peakState)
    if (!state || state.substances.length === 0) return null
    const curve = computeCurve(state, deriveWhoop(pull.readings, pull.today))
    return fmtHourLabel(bestHourToday(curve))
  }, [pull, resolved])

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    onDone()
  }

  // Confirmation beats read for a breath, then hand back to the shell.
  useEffect(() => {
    if (beat === 'session') return
    const t = window.setTimeout(finish, rm.current ? 1400 : 2400)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat])

  // No basis for a day name (history but no rotation, nothing locked):
  // the session card goes open - a fabricated day name never renders.
  if (!resolved && pull.recentWorkouts.length === 0) {
    return (
      <div className={styles.act}>
        <p className={styles.vee}>
          <span className={styles.veeTag}>VEE</span>
          I do not see a training plan yet, {firstName}. The Train tile is where we build one.
        </p>
        <button type="button" className={styles.skip} onClick={finish}>
          Continue
        </button>
      </div>
    )
  }

  if (beat !== 'session') {
    const line =
      beat === 'skipped'
        ? 'Rest is training too. I will see you tomorrow.'
        : resolved == null
          ? `Locked. A session today${peakTime ? ` at ${peakTime}` : ''}. I will hold you to it.`
          : resolved.isRest
            ? 'Locked. Rest today. Recovery is part of the plan.'
            : `Locked. ${resolved.name}${peakTime ? ` at ${peakTime}` : ''}. I will hold you to it.`
    return (
      <div className={styles.beatWrap}>
        <p className={`${styles.vee} ${styles.veeBig}`}>
          <span className={styles.veeTag}>VEE</span>
          {line}
        </p>
      </div>
    )
  }

  // A session already logged today is a closed book: celebrate it, never
  // propose the next rotation day on top of it (verify HIGH-2).
  if (resolved?.confidence === 'done') {
    return (
      <div className={styles.act}>
        <p className={styles.vee}>
          <span className={styles.veeTag}>VEE</span>
          {resolved.name} is already in the books today. That is the whole assignment.
        </p>
        <button type="button" className={styles.skip} onClick={finish}>
          Continue
        </button>
      </div>
    )
  }

  // ANTICIPATE, NEVER ASK: inferred days get said as an anticipation.
  const veeLine =
    resolved == null
      ? 'Now, the gym. No split on file, so today is your call.'
      : resolved.confidence === 'inferred'
        ? resolved.yesterdayName
          ? `Yesterday was ${resolved.yesterdayName}. Today reads as ${resolved.isRest ? 'a rest day' : resolved.name}.`
          : `Your rotation reads as ${resolved.isRest ? 'a rest day' : resolved.name} today.`
        : 'Now, the gym.'

  return (
    <div className={styles.act}>
      <p className={styles.vee}>
        <span className={styles.veeTag}>VEE</span>
        {veeLine}
      </p>

      <button type="button" className={styles.card} onClick={() => setBeat('locked')}>
        <span className={styles.cardEyebrow}>
          {resolved == null || resolved.confidence === 'inferred'
            ? 'Today reads as'
            : 'Today’s session'}
        </span>
        <span className={styles.cardDay}>{resolved ? resolved.name : 'Open session'}</span>
        <span className={styles.cardMeta}>{resolved ? resolved.meta : 'You pick the focus'}</span>
        {seen && <span className={styles.cardSeen}>{seen}</span>}
        <span className={styles.lockPill}>Lock it in</span>
      </button>

      {peakTime && (
        <p className={styles.peakLine}>
          Your peak lands at <b>{peakTime}</b>. That is your best window to train.
        </p>
      )}

      <button type="button" className={styles.skip} onClick={() => setBeat('skipped')}>
        not today
      </button>
    </div>
  )
}
