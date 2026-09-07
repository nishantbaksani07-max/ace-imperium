'use client'

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import ExplainerCard, { type ExplainerTarget } from '@/components/vitals/ExplainerCard'
import ScoreHistory from './ScoreHistory'
import VitalsSettings from './VitalsSettings'
import { RATING_REF } from '@/components/vitals/ratingRef'
import { TIER_PIPS, TIER_COLOR } from '@/components/vitals/tierMeta'
import { tierForScore, type Tier } from '@/lib/vitals/score'
import { stashMentorSeed } from '@/lib/vitals/mentorSeed'
import { goalCopy } from '@/lib/vitals/goalCopy'
import { evaluateGoalProgress } from '@/lib/vitals/goals'
import { METRIC_FIELD } from '@/lib/vitals/healthContext'
import type { VitalsPreferences } from '@/lib/preferences'
import type { VitalsGoal } from '@/lib/vitals/goals'
import type { Signal } from '@/lib/vitals/signal'
import type { VitalsScore, ScorePoint } from '@/lib/vitals/score'
import { WEARABLES, type WearableProviderId } from '@/lib/vitals/wearables'
import styles from './vitalsRemodel.module.css'

/**
 * Vitals dashboard — a 1:1 port of the approved public/vitals-remodel.html
 * preview, wired to real wearable_data. The single hero is the fused Vitals
 * Score orb (count-up + ring sweep + one-shot bloom) wearing its daily Signal
 * verdict; below it live today's raw numbers, the scrubbable score history, a
 * slim goal line, and one Talk-to-Vee action. Every number is real; the copy
 * comes from the pure Signal / Score engines (no em dashes, mint = good,
 * amber = caution, never red).
 */

export interface WearableRow {
  date: string
  hrv: number | null
  rhr: number | null
  sleep_perf: number | null
  sleep_hours: number | null
  recovery: number | null
  strain: number | null
  raw: unknown
}

const R_ORB = 84
const C_ORB = 2 * Math.PI * R_ORB

/** Metric card display name → the Vitals Score sub-metric key that drives its
 *  tier meter and its "?" rating sheet. */
const METRIC_SUB: Record<string, string> = {
  Sleep: 'sleep_perf', HRV: 'hrv', 'Resting HR': 'rhr', Strain: 'strain', 'Time asleep': 'sleep_hours',
}

/** Card label copy (the friendlier line under which the number sits). */
const CARD_LABEL: Record<string, string> = {
  Sleep: 'Sleep performance', HRV: 'Heart rate variability', 'Resting HR': 'Resting heart rate',
  Strain: 'Day strain', 'Time asleep': 'Time asleep',
}

/** Ring / orb hue by tier (r,g,b triplet). amber for caution, azure for strong,
 *  mint for peak, a soft neutral for steady. Never red. */
const RING_RGB: Record<Tier, string> = {
  'needs-care': '217,119,6', low: '245,158,11', steady: '186,196,205', strong: '109,180,245', peak: '110,231,183',
}

/** Words worth italic-mint emphasis in the serif verdict, per lean. */
const EMPH: Record<string, string[]> = {
  push: ['green light', 'primed', 'push', 'go after it', 'go use it'],
  steady: ['steady', 'solid', 'smart', 'streak', 'keep the'],
  recover: ['recovery', 'recover', 'easy', 'light', 'protect', 'rest', 'eat first'],
}

/** Fallback serif line when there is no Signal, keyed off the score tier. */
const FALLBACK: Record<Tier, { text: string; word: string }> = {
  peak: { text: 'You are running at your peak today.', word: 'peak' },
  strong: { text: 'A strong reading. Your body is in a good place.', word: 'strong' },
  steady: { text: 'A steady, workable day.', word: 'steady' },
  low: { text: 'Running a little low today. Ease in.', word: 'low' },
  'needs-care': { text: 'Your body is asking for rest today.', word: 'rest' },
}

function fmtDate(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  if (!y || !m || !day) return d
  const dt = new Date(y, m - 1, day)
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

/** Wrap the first matching keyword in a mint <em>, else render the text plain. */
function renderEmph(text: string, words: string[]): ReactNode {
  const lower = text.toLowerCase()
  for (const w of words) {
    const i = lower.indexOf(w.toLowerCase())
    if (i >= 0) {
      return (
        <>
          {text.slice(0, i)}
          <em>{text.slice(i, i + w.length)}</em>
          {text.slice(i + w.length)}
        </>
      )
    }
  }
  return text
}

const Spark = () => (
  <svg viewBox="0 0 24 24"><path d="M12 2 L13.6 8.4 L20 10 L13.6 11.6 L12 18 L10.4 11.6 L4 10 L10.4 8.4 Z" /></svg>
)

interface MetricDef { name: string; big: string; unit: string; subKey: string }

export default function VitalsDashboard({
  latest, week, history = [], quiz, goal = null, signal = null, vitalsScore = null, scoreSeries = [], provider = 'whoop',
}: {
  latest: WearableRow; week: WearableRow[]; history?: WearableRow[]; quiz: VitalsPreferences | null;
  goal?: VitalsGoal | null; signal?: Signal | null; vitalsScore?: VitalsScore | null;
  scoreSeries?: ScorePoint[]; provider?: WearableProviderId
}) {
  const router = useRouter()
  const wearable = WEARABLES[provider]

  const score = vitalsScore?.score ?? null
  const tier: Tier | null = vitalsScore?.tier ?? null
  const ringRgb = tier ? RING_RGB[tier] : '109,180,245'

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [scoreOpen, setScoreOpen] = useState(false)
  const [scoreFills, setScoreFills] = useState(false)
  const [explainer, setExplainer] = useState<ExplainerTarget | null>(null)
  const [verdictIn, setVerdictIn] = useState(false)
  const [bloomGo, setBloomGo] = useState(false)
  const [goalOn, setGoalOn] = useState(false)

  const numRef = useRef<HTMLDivElement>(null)
  const arcRef = useRef<SVGCircleElement>(null)
  const particlesRef = useRef<HTMLDivElement>(null)
  const scoreCardRef = useRef<HTMLDivElement>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)

  // ── the signature moment: orb count-up + ring sweep + one-shot bloom + verdict
  useEffect(() => {
    const arc = arcRef.current
    const num = numRef.current
    if (!arc || !num) return
    if (score == null) { num.textContent = '—'; return }

    const reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const arcColor = (e: number) => `rgba(${ringRgb},${(0.4 + 0.6 * e).toFixed(3)})`
    arc.style.filter = `drop-shadow(0 0 7px rgba(${ringRgb},0.55))`
    arc.style.strokeDasharray = String(C_ORB)
    arc.style.strokeDashoffset = String(C_ORB)

    if (reduce) {
      num.textContent = String(score)
      arc.style.stroke = arcColor(1)
      arc.style.strokeDashoffset = String(C_ORB * (1 - score / 100))
      setVerdictIn(true)
      return
    }

    arc.style.stroke = arcColor(0)
    let raf = 0
    let start: number | null = null
    const dur = 1650
    const step = (ts: number) => {
      if (start === null) start = ts
      const t = Math.min(1, (ts - start) / dur)
      const e = 1 - Math.pow(1 - t, 3)
      num.textContent = String(Math.round(score * e))
      arc.style.stroke = arcColor(e)
      arc.style.strokeDashoffset = String(C_ORB * (1 - (score / 100) * e))
      if (t < 1) { raf = requestAnimationFrame(step) }
      else {
        num.textContent = String(score)
        arc.style.stroke = arcColor(1)
        setBloomGo(true)
        setTimeout(() => setVerdictIn(true), 150)
      }
    }
    const t0 = setTimeout(() => { raf = requestAnimationFrame(step) }, 320)
    // Safety net: a data page must never sit on 0 for its hero value.
    const safety = setTimeout(() => {
      if (num.textContent !== String(score)) {
        num.textContent = String(score)
        arc.style.stroke = arcColor(1)
        arc.style.strokeDashoffset = String(C_ORB * (1 - score / 100))
        setVerdictIn(true)
      }
    }, 2600)
    return () => { clearTimeout(t0); clearTimeout(safety); cancelAnimationFrame(raf) }
  }, [score, ringRgb])

  // ── drifting particles (15 mobile / 24 desktop), reduced-motion flattened in CSS
  useEffect(() => {
    const root = particlesRef.current
    if (!root) return
    root.innerHTML = ''
    const N = window.innerWidth < 640 ? 15 : 24
    for (let i = 0; i < N; i++) {
      const s = document.createElement('span')
      s.style.left = `${Math.random() * 100}%`
      s.style.top = `${60 + Math.random() * 40}%`
      const size = 1.2 + Math.random() * 1.2
      s.style.width = s.style.height = `${size}px`
      const d = 22 + Math.random() * 28
      s.style.animationDuration = `${d}s`
      s.style.animationDelay = `${-Math.random() * d}s`
      s.style.setProperty('--dx', `${Math.random() * 30 - 15}px`)
      s.style.setProperty('--dy', `${-(60 + Math.random() * 50)}vh`)
      root.appendChild(s)
    }
    return () => { root.innerHTML = '' }
  }, [])

  // ── goal fill sweep
  useEffect(() => {
    if (!goal) return
    const reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const t = setTimeout(() => setGoalOn(true), reduce ? 0 : 200)
    return () => clearTimeout(t)
  }, [goal])

  // ── score breakdown fills animate on open
  useEffect(() => {
    if (!scoreOpen) { setScoreFills(false); return }
    const r = requestAnimationFrame(() => setScoreFills(true))
    return () => cancelAnimationFrame(r)
  }, [scoreOpen])

  // ── score sheet: focus trap + Escape + restore focus on close (matches preview)
  useEffect(() => {
    if (!scoreOpen) return
    lastFocusedRef.current = document.activeElement as HTMLElement | null
    const card = scoreCardRef.current
    const focusables = () => Array.from(
      card?.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])') ?? [],
    ).filter(n => !(n as HTMLButtonElement).disabled && n.offsetParent !== null)
    const t = setTimeout(() => focusables()[0]?.focus(), 60)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setScoreOpen(false); return }
      if (e.key === 'Tab') {
        const f = focusables()
        if (!f.length) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      lastFocusedRef.current?.focus?.()
    }
  }, [scoreOpen])

  // ── one-shot refresh when today's recovery has not finalized (provisional → null)
  const refreshedRef = useRef(false)
  useEffect(() => {
    if (latest.recovery == null && !refreshedRef.current) {
      refreshedRef.current = true
      const t = setTimeout(() => router.refresh(), 20000)
      return () => clearTimeout(t)
    }
  }, [latest.recovery, router])

  // ── today's numbers (self-hide any null metric)
  const metricDefs: MetricDef[] = []
  if (latest.sleep_perf != null) metricDefs.push({ name: 'Sleep', big: String(Math.round(latest.sleep_perf)), unit: '%', subKey: 'sleep_perf' })
  if (latest.hrv != null) metricDefs.push({ name: 'HRV', big: String(Math.round(latest.hrv)), unit: 'ms', subKey: 'hrv' })
  if (latest.rhr != null) metricDefs.push({ name: 'Resting HR', big: String(Math.round(latest.rhr)), unit: 'bpm', subKey: 'rhr' })
  if (latest.strain != null) metricDefs.push({ name: 'Strain', big: latest.strain.toFixed(1), unit: '/ 21', subKey: 'strain' })
  if (latest.sleep_hours != null) {
    let h = Math.floor(latest.sleep_hours)
    let m = Math.round((latest.sleep_hours - h) * 60)
    if (m >= 60) { h += 1; m -= 60 }
    metricDefs.push({ name: 'Time asleep', big: `${h}h`, unit: `${m}m`, subKey: 'sleep_hours' })
  }

  // ── goal line
  const gCopy = goal ? goalCopy(goal) : null
  const gProgress = goal ? evaluateGoalProgress(goal, week) : null
  const gPctInt = gProgress ? Math.round((gProgress.pct ?? 0) * 100) : 0
  let metDays = 0
  let totalDays = 0
  if (goal) {
    const field = METRIC_FIELD[goal.metric] as string
    for (const r of week) {
      const v = (r as unknown as Record<string, number | null>)[field]
      if (v != null) { totalDays += 1; if (v >= goal.targetValue) metDays += 1 }
    }
  }

  const whyNodes: ReactNode = signal
    ? renderEmph(signal.verdict, EMPH[signal.lean] ?? [])
    : tier
      ? renderEmph(FALLBACK[tier].text, [FALLBACK[tier].word])
      : 'Here is your day.'

  const openMentor = () => {
    const line = signal
      ? `${signal.verdict} ${signal.why}`.trim()
      : vitalsScore
        ? `My vitals score today is ${vitalsScore.score} out of 100, which reads as ${vitalsScore.tier.replace('-', ' ')}.`
        : 'I want to talk through my vitals today.'
    stashMentorSeed({
      topic: 'vitals',
      metricLabel: 'Vitals',
      line,
      opener: 'Want to talk through your day and what is moving your vitals?',
    })
    router.push('/app/mentor')
  }

  // The stale-link guard (Alex, 2026-07-12): a connected band whose newest
  // reading is 2+ local days old is a broken promise the user cannot see -
  // a dead token, a revoked grant, a WHOOP outage - so say it in calm amber
  // (never red) with the one-tap cure. Real staleness only: `manual` has no
  // OAuth to re-link, and a fresh row hides the band entirely.
  const staleDays = (() => {
    if (provider === 'manual' || !latest?.date) return 0
    const then = Date.parse(`${String(latest.date).slice(0, 10)}T00:00:00`)
    if (Number.isNaN(then)) return 0
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return Math.round((now.getTime() - then) / 86_400_000)
  })()

  return (
    <div className={styles.root}>
      {staleDays >= 2 && (
        <a className={styles.staleBand} href={`/api/${provider}/connect`} role="alert">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 12h6M10.5 7.5H7a4.5 4.5 0 0 0 0 9h3.5M13.5 7.5H17a4.5 4.5 0 0 1 0 9h-3.5" />
          </svg>
          <span>
            <b>Your {wearable.label} link went quiet {staleDays} days ago.</b> Tap to reconnect and your
            readings catch up on their own.
          </span>
        </a>
      )}
      {/* ── atmosphere ── */}
      <div className={styles.atmosphere} aria-hidden />
      <div className={styles.mountains} aria-hidden>
        <svg viewBox="0 0 1600 420" preserveAspectRatio="none">
          <defs>
            <linearGradient id="vrMtFar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d1a17" stopOpacity="0" />
              <stop offset="55%" stopColor="#0d1a17" stopOpacity=".55" />
              <stop offset="100%" stopColor="#0d1a17" stopOpacity=".95" />
            </linearGradient>
            <linearGradient id="vrMtNear" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#050a09" stopOpacity=".4" />
              <stop offset="60%" stopColor="#050a09" stopOpacity=".95" />
              <stop offset="100%" stopColor="#050a09" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path d="M0,300 L120,230 L210,260 L320,180 L430,220 L560,150 L680,210 L820,170 L960,220 L1100,180 L1240,240 L1380,200 L1500,250 L1600,220 L1600,420 L0,420 Z" fill="url(#vrMtFar)" />
          <path d="M0,360 L100,320 L220,340 L340,290 L460,330 L590,300 L720,340 L860,310 L1000,350 L1140,310 L1280,355 L1420,320 L1540,360 L1600,340 L1600,420 L0,420 Z" fill="url(#vrMtNear)" />
        </svg>
      </div>
      <div className={styles.particles} ref={particlesRef} aria-hidden />
      <div className={styles.grain} aria-hidden />

      <main className={styles.page}>
        {/* ── header ── */}
        <header className={styles.head}>
          <a className={styles.back} href="/app">
            <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
            DASHBOARD
          </a>
          <div className={styles.headTitle}>VITALS</div>
          <div className={styles.headRight}>
            <span className={styles.headDate}>{fmtDate(latest.date).toUpperCase()}</span>
            <button type="button" className={styles.help} onClick={() => setExplainer({ kind: 'score' })} aria-haspopup="dialog" aria-label="What the Vitality score is">?</button>
            <button type="button" className={styles.gear} onClick={() => setSettingsOpen(true)} aria-label="Settings">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v2.4M12 18.8v2.4M4.3 7.1l2.1 1.2M17.6 15.7l2.1 1.2M4.3 16.9l2.1-1.2M17.6 8.3l2.1-1.2" /></svg>
            </button>
          </div>
        </header>

        {/* ── fused hero: the one Vitals orb wearing its verdict ── */}
        <section className={styles.hero}>
          <div className={styles.eyebrow}>
            <Spark />
            VITALITY · TODAY
          </div>

          <div className={styles.orb} style={{ ['--ring-rgb']: ringRgb } as CSSProperties}>
            <div className={`${styles.orbBloom} ${bloomGo ? styles.go : ''}`} aria-hidden />
            <div className={styles.orbGlow} />
            <svg className={styles.ring} viewBox="0 0 200 200">
              <circle className={styles.ringTrack} cx="100" cy="100" r="84" />
              <circle className={styles.ringArc} ref={arcRef} cx="100" cy="100" r="84" style={{ strokeDasharray: C_ORB, strokeDashoffset: C_ORB }} />
            </svg>
            <div className={styles.orbCenter}>
              <div className={styles.orbNum} ref={numRef}>{score != null ? '0' : '—'}</div>
              <div className={styles.orbScale}>OUT OF 100</div>
            </div>
            {signal && (
              <div className={`${styles.verdict} ${verdictIn ? styles.in : ''} ${signal.tone === 'amber' ? styles.amber : ''}`}>
                <i />{signal.lean.toUpperCase()}
              </div>
            )}
          </div>

          <p className={styles.why}>{whyNodes}</p>

          {/* Receipts = only the context the orb + numbers grid don't already show. A
              raw wearable metric (WHOOP recovery, Oura sleep) is echoed in the grid below,
              so we drop those and keep just the flags that drive today's call (hard days,
              fuel, water, a Vee note). No number appears twice on the page. */}
          {(() => {
            const flags = signal ? signal.chips.filter(c => c.source !== 'WHOOP' && c.source !== 'Oura') : []
            if (!flags.length) return null
            return (
              <div className={styles.receipt}>
                {flags.map((c, i) => {
                  const warn = c.dir === 'warn' || c.dir === 'down'
                  return (
                    <span key={i} className={`${styles.rchip} ${warn ? styles.warn : ''}`}>
                      {c.dir === 'up'
                        ? <svg viewBox="0 0 24 24" aria-hidden><path d="M12 19V6M6 12l6-6 6 6" /></svg>
                        : c.dir === 'down'
                          ? <svg viewBox="0 0 24 24" aria-hidden><path d="M12 5v13M6 12l6 6 6-6" /></svg>
                          : <i />}
                      <b>{c.label}</b>{c.qualifier && <span>{c.qualifier}</span>}
                    </span>
                  )
                })}
              </div>
            )
          })()}

          {vitalsScore && (
            <div className={styles.scored}>
              <button type="button" className={styles.scoredBtn} onClick={() => setScoreOpen(true)} aria-haspopup="dialog">
                {"HOW IT'S SCORED"}
                <svg viewBox="0 0 24 24" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
              </button>
            </div>
          )}
        </section>

        {/* ── today's numbers ── */}
        {metricDefs.length > 0 && (
          <section className={styles.grid}>
            <div className={styles.slab}>Today&rsquo;s numbers</div>
            <div className={styles.cards}>
              {metricDefs.map((m) => {
                const sub = vitalsScore?.subs.find(s => s.key === METRIC_SUB[m.name])
                const t: Tier | null = sub?.score != null ? tierForScore(sub.score) : null
                const tappable = t != null && RATING_REF[m.name] != null
                return (
                  <div key={m.name} className={styles.card}>
                    <div className={styles.cardTop}>
                      <div className={styles.cardLabel}>{CARD_LABEL[m.name] ?? m.name}</div>
                      {tappable && t && (
                        <button type="button" className={styles.info} onClick={() => setExplainer({ kind: 'metric', name: m.name, tier: t })} aria-haspopup="dialog" aria-label={`About ${m.name}`}>?</button>
                      )}
                    </div>
                    <div className={styles.cardVal}><b>{m.big}</b>{m.unit && <span>{m.unit}</span>}</div>
                    {t && (
                      <div className={styles.pips} style={{ ['--tc']: TIER_COLOR[t] } as CSSProperties} aria-hidden>
                        {[1, 2, 3, 4, 5].map(i => (
                          <span key={i} className={`${styles.pip} ${i <= TIER_PIPS[t] ? styles.on : ''}`} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── score history (reuses the scrubbable ScoreHistory card) ── */}
        {scoreSeries.length > 0 && (
          <section className={styles.hist}>
            <div className={styles.slab}>Score history</div>
            <ScoreHistory series={scoreSeries} history={history} />
          </section>
        )}

        {/* ── goal as one slim line ── */}
        {goal && gCopy && (
          <section className={styles.goal}>
            <div className={styles.goalCard}>
              <div className={styles.goalTop}>
                <div className={styles.goalName}>
                  <Spark />
                  {gCopy.title}
                </div>
                <div className={styles.goalCount}>
                  {totalDays > 0 ? <><b>{metDays}</b> of {totalDays} days</> : <><b>{gPctInt}%</b> there</>}
                </div>
              </div>
              <div className={styles.goalTrack}>
                <div className={styles.goalFill} style={{ width: goalOn ? `${gPctInt}%` : '0%' }} />
              </div>
            </div>
          </section>
        )}

        {/* ── one action + footer ── */}
        <section className={styles.actions}>
          <button type="button" className={styles.vee} onClick={openMentor}>
            <Spark />
            Talk to Vee
          </button>
          <div className={styles.foot}>DATA BY {wearable.label.toUpperCase()}<i />{fmtDate(latest.date).toUpperCase()}</div>
        </section>
      </main>

      {/* ── score breakdown sheet (default closed, truly hidden when closed) ── */}
      <div className={`${styles.sheet} ${scoreOpen ? styles.open : ''}`} aria-hidden={!scoreOpen}>
        <div className={styles.sheetBack} onClick={() => setScoreOpen(false)} />
        <div className={styles.sheetCard} role="dialog" aria-modal="true" aria-label="How it's scored" ref={scoreCardRef}>
          <button type="button" className={styles.sheetClose} onClick={() => setScoreOpen(false)} aria-label="Close">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
          <div className={styles.sheetGrip} />
          <div className={styles.sheetLabel}>How it&rsquo;s scored</div>
          <p className={styles.sheetDesc} style={{ marginTop: 9 }}>
            Your Vitals score blends your daily signals into one 0 to 100 read of how ready your body is. It refreshes each morning from last night&rsquo;s data.
          </p>
          <div className={styles.breakdown}>
            {(vitalsScore?.subs ?? []).map((s) => (
              <div key={s.key} className={`${styles.bd} ${s.score == null ? styles.muted : ''}`}>
                <div className={styles.bdTop}>
                  <span className={styles.bdName}>{s.label}</span>
                  <span className={styles.bdVal}>{Math.round(s.weight * 100)}%</span>
                </div>
                <div className={styles.bdTrack}>
                  <div className={styles.bdFill} style={{ width: scoreFills ? `${s.score ?? 0}%` : '0%' }} />
                </div>
              </div>
            ))}
          </div>
          <div className={styles.bdFoot}>Recovery and sleep carry the most weight</div>
        </div>
      </div>

      {/* ── the one explainer card system: the score story (header "?") and the
             per-metric "what this number means" (each tile's "?") share a shell ── */}
      {explainer && (
        <ExplainerCard
          target={explainer}
          score={score}
          subs={vitalsScore?.subs}
          onClose={() => setExplainer(null)}
        />
      )}

      {settingsOpen && <VitalsSettings goal={goal} quiz={quiz} provider={provider} onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
