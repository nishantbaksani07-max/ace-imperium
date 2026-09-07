'use client'

/**
 * Act 2 of the homecoming ritual - PEAK / OPTIMIZE.
 *
 * ZERO-INPUT by law: the shell only mounts this act when peak_state carries
 * substance history (presence.usesPeak). One briefing view, no controls:
 *   - today's curve (real logs only) as a compact SVG
 *   - the anticipation rows: right-now score, best window left, tonight's
 *     lights-out (debt-clearing bedtime), all engine-derived
 *   - the two-bar "tomorrow's ceiling" compare when sleep debt exists
 *   - the single best next action (improvementTips)
 * The live stim picker still exists but opens COLLAPSED behind one tap
 * ("Shape today's stack"); additions redraw the curve live and stay LOCAL
 * preview only - nothing is written to peak_state.
 *
 * Honesty rules: every number on screen comes from the peak engine. Sleep
 * debt is single-night only (max(0, 8 - last night)), never a multi-day
 * ledger. No sleep reading = no debt claim.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { HomePull, PullReading } from '@/lib/home/pullTypes'
import {
  bestHourToday,
  computeCurve,
  fmtHourLabel,
  improvementTips,
  scoreAtHour,
  scoreDrivers,
  scoreNow,
  tierFor,
} from '../../peak/curve'
import { SUBSTANCES } from '../../peak/substances'
import type {
  ManualVitals,
  PeakState,
  Profile,
  ScoreTier,
  SubstanceLog,
  WhoopSignal,
} from '../../peak/types'
import styles from './homeActPeak.module.css'

/** Same categories the Peak hot bar offers in its "+ Add" search. */
const ADDABLE = new Set(['caffeine', 'adhd', 'nicotine', 'supplement', 'depressant'])

const TIME_CHOICES = [
  { key: 'morning', label: 'Morning', hour: 9 },
  { key: 'midday', label: 'Midday', hour: 12 },
  { key: 'afternoon', label: 'Afternoon', hour: 15 },
  { key: 'now', label: 'Now', hour: null },
] as const
type TimeKey = (typeof TIME_CHOICES)[number]['key']

const DOSE_MULTIPLES = [0.5, 1, 1.5, 2]

/** Mirrors lib validity ranges (app/app/peak/load.ts) so a noisy reading can't move the curve. */
const VALID_HRV = (v: number) => v >= 15 && v <= 150
const VALID_RHR = (v: number) => v >= 30 && v <= 90

/** Engine strings pass through here so stray long dashes render as plain hyphens. */
function cleanCopy(s: string): string {
  return s.replace(/[\u2013\u2014]/g, '-')
}

/** Fold today's rows (band first, manual as fallback) into one reading. */
function foldToday(readings: PullReading[], today: string) {
  const rows = readings.filter((r) => r.date === today)
  rows.sort((a, b) => (a.provider === 'manual' ? 1 : 0) - (b.provider === 'manual' ? 1 : 0))
  const pick = (k: keyof Omit<PullReading, 'provider' | 'date'>): number | null => {
    for (const r of rows) if (r[k] != null) return r[k]
    return null
  }
  return {
    recovery: pick('recovery'),
    hrv: pick('hrv'),
    rhr: pick('rhr'),
    sleepPerf: pick('sleep_perf'),
    sleepHours: pick('sleep_hours'),
    strain: pick('strain'),
  }
}

/**
 * Compact WhoopSignal from the pull: today's folded reading + personal
 * HRV/RHR baselines from the most recent ~14 valid days (same validity
 * windows as app/app/peak/load.ts).
 */
function buildSignal(readings: PullReading[], today: string): WhoopSignal {
  const fold = foldToday(readings, today)
  const desc = [...readings].sort((a, b) => (a.date < b.date ? 1 : -1))
  const hrvHistory: number[] = []
  const rhrHistory: number[] = []
  for (const r of desc) {
    if (r.hrv != null && VALID_HRV(Number(r.hrv)) && hrvHistory.length < 14) hrvHistory.push(Number(r.hrv))
    if (r.rhr != null && VALID_RHR(Number(r.rhr)) && rhrHistory.length < 14) rhrHistory.push(Number(r.rhr))
    if (hrvHistory.length >= 14 && rhrHistory.length >= 14) break
  }
  const mean = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length
  return {
    recovery: fold.recovery,
    hrv: fold.hrv,
    sleepScore: fold.sleepPerf,
    sleepHours: fold.sleepHours,
    sleepDebtHours: fold.sleepHours != null ? Math.max(0, 8 - fold.sleepHours) : null,
    strain: fold.strain,
    wakeHour: null,
    hrvBaseline: hrvHistory.length >= 3 ? mean(hrvHistory) : null,
    rhrBaseline: rhrHistory.length >= 3 ? mean(rhrHistory) : null,
    hrvAnomalous: fold.hrv != null && !VALID_HRV(fold.hrv),
    daysAvailable: Math.max(hrvHistory.length, rhrHistory.length),
  }
}

/** Minimal PeakState wrapper so the pure engine can run on any log set. */
function stateFor(logs: SubstanceLog[], profile: Profile): PeakState {
  return {
    version: 1,
    profile,
    substances: logs,
    taps: [],
    events: [],
    hardestTask: null,
    tasks: [],
    manual: {},
  }
}

function clockParts(decimalHour: number): { hm: string; ap: string } {
  const total = ((Math.round((decimalHour * 60) / 5) * 5) % 1440 + 1440) % 1440
  let hh = Math.floor(total / 60)
  const mm = total % 60
  const ap = hh >= 12 ? 'PM' : 'AM'
  hh = hh % 12
  if (hh === 0) hh = 12
  return { hm: `${hh}:${String(mm).padStart(2, '0')}`, ap }
}

function fmtClock(decimalHour: number): string {
  const p = clockParts(decimalHour)
  return `${p.hm} ${p.ap}`
}

function msTodayAt(hour: number): number {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), hour, 0, 0, 0).getTime()
}

/** COLOR LAW: mint good, azure steady, amber caution. Never red. */
function toneForTier(tier: ScoreTier): string {
  if (tier === 'Peak' || tier === 'Solid') return '#6EE7B7'
  if (tier === 'Tired') return '#6EA8FF'
  return '#F59E0B'
}

/** rAF-lerped curve values so the chart visibly glides when the plan changes. */
function useAnimatedCurve(target: number[], reduced: boolean): number[] {
  const [vals, setVals] = useState(target)
  const currentRef = useRef(target)
  const targetRef = useRef(target)
  targetRef.current = target
  const key = target.map((v) => v.toFixed(2)).join(',')
  useEffect(() => {
    const to = targetRef.current
    const from = currentRef.current
    if (reduced || from.length !== to.length) {
      currentRef.current = to
      setVals(to)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const D = 520
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / D)
      const e = 1 - Math.pow(1 - k, 3)
      const cur = to.map((v, i) => from[i] + (v - from[i]) * e)
      currentRef.current = cur
      setVals(cur)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduced])
  return vals
}

/* ── Compact curve chart ────────────────────────────────────────────────── */

const W = 520
const H = 138
const PX = 10
const PT = 10
const PB = 22
const xFor = (h: number) => PX + (h / 24) * (W - PX * 2)
const yFor = (v: number) => PT + (1 - Math.max(0, Math.min(100, v)) / 100) * (H - PT - PB)

function smoothPath(vals: number[]): string {
  const pts = vals.map((v, i) => [xFor(i), yFor(v)] as const)
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return d
}

function CompactCurve({ vals, base, showBase }: { vals: number[]; base: number[]; showBase: boolean }) {
  const now = new Date()
  const nowH = now.getHours() + now.getMinutes() / 60
  const nowX = xFor(nowH)
  const nowY = yFor(scoreAtHour(vals, nowH))
  const floorY = H - PB
  return (
    <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Today's peak curve">
      <defs>
        <linearGradient id="homeActPeakFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(110,231,183,0.22)" />
          <stop offset="100%" stopColor="rgba(110,231,183,0)" />
        </linearGradient>
      </defs>
      <line x1={PX} y1={floorY} x2={W - PX} y2={floorY} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      {showBase && (
        <path d={smoothPath(base)} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.4" strokeDasharray="3 5" />
      )}
      <path
        d={`${smoothPath(vals)} L ${xFor(24).toFixed(1)} ${floorY} L ${xFor(0).toFixed(1)} ${floorY} Z`}
        fill="url(#homeActPeakFill)"
        stroke="none"
      />
      <path d={smoothPath(vals)} fill="none" stroke="#6EE7B7" strokeWidth="2" strokeLinecap="round" />
      <line x1={nowX} y1={PT} x2={nowX} y2={floorY} stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
      <circle cx={nowX} cy={nowY} r="3.5" fill="#6EE7B7" />
      {[
        { h: 6, t: '6AM' },
        { h: 12, t: '12PM' },
        { h: 18, t: '6PM' },
      ].map(({ h, t }) => (
        <text key={h} x={xFor(h)} y={H - 7} textAnchor="middle" className={styles.chartTick}>
          {t}
        </text>
      ))}
      <text x={Math.min(nowX, W - PX - 14)} y={PT + 2} textAnchor="middle" className={styles.chartTick}>
        NOW
      </text>
    </svg>
  )
}

/* ── The act ────────────────────────────────────────────────────────────── */

export default function HomeActPeak({
  pull,
  firstName,
  onDone,
}: {
  pull: HomePull
  firstName: string
  onDone: () => void
}) {
  const [reduced, setReduced] = useState(false)

  // ONE optional tap row: the stack shaper opens collapsed behind this.
  const [shaping, setShaping] = useState(false)

  // Today's plan - LOCAL preview only, never written to peak_state.
  const [plan, setPlan] = useState<SubstanceLog[]>([])
  const [adding, setAdding] = useState(false)
  const [configKey, setConfigKey] = useState<string | null>(null)
  const [selDose, setSelDose] = useState(0)
  const [selTime, setSelTime] = useState<TimeKey>('now')

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  /* ── Parse the pull (null-guard everything) ───────────────────────────── */

  const ps = (pull.peakState ?? null) as Partial<PeakState> | null

  const profile: Profile = useMemo(() => {
    const p = ps?.profile
    const weightKg = p && typeof p.weightKg === 'number' && p.weightKg > 0 ? p.weightKg : 75
    const tolerance =
      p && typeof p.tolerance === 'number' ? Math.max(1, Math.min(10, p.tolerance)) : 5
    return { weightKg, tolerance }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pull.peakState])

  /** The profile carries no wake target today; read one defensively if a
   *  future shape adds it. hasWakeTarget marks whether the 6.5 fallback is a
   *  real account value or just the anchor for the 8-hour math - the copy
   *  only quotes a wake time when it is real (verify MED-4). */
  const [wakeTarget, hasWakeTarget] = useMemo((): [number, boolean] => {
    const p = (ps?.profile ?? null) as Record<string, unknown> | null
    for (const k of ['wakeTargetHour', 'wakeHour']) {
      const v = p?.[k]
      if (typeof v === 'number' && v >= 4 && v <= 12) return [v, true]
    }
    return [6.5, false]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pull.peakState])

  /** Real logs already in Peak today - the honest floor under the preview plan. */
  const realLogs: SubstanceLog[] = useMemo(() => {
    const subs = ps?.substances
    if (!Array.isArray(subs)) return []
    const n = new Date()
    const dayStart = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()
    return subs
      .filter(
        (l) =>
          !!l &&
          typeof l === 'object' &&
          typeof l.key === 'string' &&
          typeof l.takenAt === 'number' &&
          typeof l.dose === 'number',
      )
      .filter((l) => l.takenAt >= dayStart && l.takenAt < dayStart + 86_400_000)
      .map((l) => ({
        ...l,
        tolerance: typeof l.tolerance === 'number' ? l.tolerance : profile.tolerance,
      }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pull.peakState, profile])

  const manualToday: ManualVitals | null = useMemo(() => {
    const m = ps?.manual
    if (!m || typeof m !== 'object') return null
    return (m as Record<string, ManualVitals>)[pull.today] ?? null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pull.peakState, pull.today])

  const signal = useMemo(() => buildSignal(pull.readings, pull.today), [pull.readings, pull.today])
  const water = pull.waterToday ?? 0

  /* ── Page 1: SLEEP ─────────────────────────────────────────────────────── */

  // Single-night debt only: max(0, 8 - last night). Never a multi-day ledger.
  const lastNight = signal.sleepHours ?? (typeof manualToday?.sleepHours === 'number' ? manualToday.sleepHours : null)
  const debt = lastNight != null ? Math.max(0, 8 - lastNight) : null
  const hasDebt = debt != null && debt > 0.5

  // Tomorrow's ceiling: scoreDrivers run twice, ONLY the sleep fields differ.
  const ceiling = useMemo(() => {
    if (!hasDebt || debt == null) return null
    const asIs = scoreDrivers(
      { ...signal, sleepHours: lastNight, sleepDebtHours: debt },
      [], 0, manualToday,
    ).total
    const cleared = scoreDrivers(
      { ...signal, sleepHours: 8, sleepDebtHours: 0 },
      [], 0, manualToday,
    ).total
    return { asIs: Math.round(asIs), cleared: Math.round(cleared) }
  }, [hasDebt, debt, lastNight, signal, manualToday])

  const bedHour = (((wakeTarget - (8 + (debt ?? 0))) % 24) + 24) % 24
  const bed = clockParts(bedHour)

  /* ── The curve (real logs; the preview plan redraws it live) ───────────── */

  const baseCurve = useMemo(
    () => computeCurve(stateFor(realLogs, profile), signal),
    [realLogs, profile, signal],
  )
  const planCurve = useMemo(
    () => (plan.length ? computeCurve(stateFor([...realLogs, ...plan], profile), signal) : baseCurve),
    [plan, realLogs, profile, signal, baseCurve],
  )
  const drawnCurve = useAnimatedCurve(planCurve, reduced)

  const peakDelta = Math.round(Math.max(...planCurve) - Math.max(...baseCurve))
  const bestHour = bestHourToday(planCurve)

  // THE LAW: no free-text in the ritual. The picker is a tap-only shortlist:
  // this account's own logged substances (most used first), topped up with
  // catalog staples. The full search lives in the Peak tab, not here.
  const results = useMemo(() => {
    const counts = new Map<string, number>()
    for (const log of Array.isArray(ps?.substances) ? ps!.substances! : []) {
      if (log && typeof log.key === 'string') counts.set(log.key, (counts.get(log.key) ?? 0) + 1)
    }
    const mine = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => SUBSTANCES[key])
      .filter((s): s is NonNullable<typeof s> => !!s && ADDABLE.has(s.category))
    const fill = Object.values(SUBSTANCES).filter(
      (s) => ADDABLE.has(s.category) && !counts.has(s.key),
    )
    return [...mine, ...fill].slice(0, 8)
  }, [ps])

  const configDef = configKey ? SUBSTANCES[configKey] ?? null : null

  function openConfig(key: string) {
    const def = SUBSTANCES[key]
    if (!def) return
    setConfigKey(key)
    setSelDose(def.defaultDose)
    setSelTime('now')
  }

  function addToPlan() {
    if (!configDef) return
    const choice = TIME_CHOICES.find((t) => t.key === selTime)
    const takenAt = choice && choice.hour != null ? msTodayAt(choice.hour) : Date.now()
    setPlan((p) => [
      ...p,
      {
        id: `plan-${Date.now()}-${configDef.key}`,
        key: configDef.key,
        takenAt,
        dose: selDose,
        tolerance: profile.tolerance,
      },
    ])
    setConfigKey(null)
    setAdding(false)
  }

  /* ── The now read + the one best lever ─────────────────────────────────── */

  const nowScore = scoreNow(baseCurve) // real logs only - the preview plan is not taken yet
  const tier = tierFor(nowScore)
  const tips = useMemo(
    () => improvementTips(signal, realLogs, water),
    [signal, realLogs, water],
  )
  const tip = tips[0] ?? null

  // The whole beat is one anticipation: the debt story when there is one,
  // otherwise where the day peaks. Nothing is asked.
  const vee =
    hasDebt && ceiling && debt != null
      ? `You are carrying ${debt.toFixed(1)} hours of sleep debt. Clear it tonight and tomorrow lifts from ${ceiling.asIs} to ${ceiling.cleared}.`
      : `Here is today's curve, ${firstName}. Your best window left lands at ${fmtHourLabel(bestHour)}.`

  /* ── Render: one briefing view, the shaper collapsed behind one tap ────── */

  return (
    <div className={styles.act}>
      <div className={styles.page}>
        <p className={styles.vee}>
          <span className={styles.veeTag}>VEE</span>
          {vee}
        </p>

        <div className={styles.chartWrap}>
          <CompactCurve vals={drawnCurve} base={baseCurve} showBase={plan.length > 0} />
          <div className={styles.deltaRow}>
            {plan.length > 0 && (
              <span
                className={styles.deltaPill}
                style={
                  peakDelta > 0
                    ? undefined
                    : { color: '#F59E0B', borderColor: 'rgba(245, 158, 11, 0.4)' }
                }
              >
                {peakDelta > 0 ? `+${peakDelta} projected peak` : peakDelta < 0 ? `${peakDelta} projected peak` : 'no lift yet'}
              </span>
            )}
            <span className={styles.bestHour}>best hour left · {fmtHourLabel(bestHour)}</span>
          </div>
        </div>

        <div className={styles.antRows}>
          <div className={styles.antRow}>
            <span className={styles.antLabel}>RIGHT NOW</span>
            <span className={styles.antVal} style={{ color: toneForTier(tier) }}>
              {nowScore} · {tier}
            </span>
          </div>
          {/* LIGHTS OUT only renders on a real sleep basis (last night known),
              and never quotes a wake target the account does not carry - the
              6:30 fallback was an invented constant (verify MED-4). */}
          {lastNight != null && (
            <div className={styles.antRow}>
              <span className={styles.antLabel}>LIGHTS OUT</span>
              <span className={styles.antVal}>
                {bed.hm} {bed.ap}
                <span className={styles.antSub}>
                  {hasWakeTarget ? ` for a ${fmtClock(wakeTarget)} wake` : ' for a full 8 hours'}
                  {hasDebt && debt != null ? ` · 8h + ${debt.toFixed(1)}h debt` : ''}
                </span>
              </span>
            </div>
          )}
        </div>

        {ceiling && (
          <div className={styles.bars}>
            <div className={styles.barRow}>
              <span className={styles.barLabel}>As is</span>
              <div className={styles.barTrack}>
                <div className={`${styles.barFill} ${styles.barAmber}`} style={{ width: `${ceiling.asIs}%` }} />
              </div>
              <span className={styles.barVal} style={{ color: '#F59E0B' }}>{ceiling.asIs}</span>
            </div>
            <div className={styles.barRow}>
              <span className={styles.barLabel}>Debt cleared</span>
              <div className={styles.barTrack}>
                <div className={`${styles.barFill} ${styles.barMint}`} style={{ width: `${ceiling.cleared}%` }} />
              </div>
              <span className={styles.barVal} style={{ color: '#6EE7B7' }}>{ceiling.cleared}</span>
            </div>
            <span className={styles.barsNote}>tomorrow&apos;s ceiling · engine projected · everything else held steady</span>
          </div>
        )}

        {tip && !shaping && (
          <div className={styles.tipCard}>
            <div className={styles.tipTop}>
              <span className={styles.tipLabel}>{cleanCopy(tip.label)}</span>
              <span className={styles.tipGain}>{cleanCopy(tip.gain)}</span>
            </div>
            <p className={styles.tipDetail}>{cleanCopy(tip.detail)}</p>
          </div>
        )}

        {!shaping && (
          <button type="button" className={styles.shapeToggle} onClick={() => setShaping(true)}>
            Shape today&apos;s stack
          </button>
        )}

        {shaping && (
          <div className={styles.planBlock}>
            <div className={styles.planHead}>
              <span className={styles.eyebrow}>Today&apos;s plan · preview only</span>
              <button type="button" className={styles.addBtn} onClick={() => { setAdding((a) => !a); setConfigKey(null) }}>
                {adding ? 'Close' : '+ Add'}
              </button>
            </div>

            {adding && !configDef && (
              <div className={styles.picker}>
                {/* Tap-only (THE LAW): your own substances first, staples after. */}
                <div className={styles.suggest}>
                  {results.map((s) => (
                    <button key={s.key} type="button" className={styles.suggestRow} onClick={() => openConfig(s.key)}>
                      <span className={s.amplitude >= 0 ? styles.dotMint : styles.dotAmber} aria-hidden />
                      <span className={styles.suggestName}>{s.name}</span>
                      <span className={styles.suggestDose}>{s.defaultDose} {s.unit}</span>
                    </button>
                  ))}
                  <span className={styles.emptyLine}>the full library lives in Peak</span>
                </div>
              </div>
            )}

            {adding && configDef && (
              <div className={styles.config}>
                <span className={styles.configName}>{configDef.name}</span>
                <div className={styles.chipRow}>
                  {DOSE_MULTIPLES.map((m) => {
                    const dose = Math.round(configDef.defaultDose * m * 100) / 100
                    return (
                      <button
                        key={m}
                        type="button"
                        className={`${styles.chip} ${selDose === dose ? styles.chipOn : ''}`}
                        onClick={() => setSelDose(dose)}
                      >
                        {dose} {configDef.unit}
                      </button>
                    )
                  })}
                </div>
                <div className={styles.chipRow}>
                  {TIME_CHOICES.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      className={`${styles.chip} ${selTime === t.key ? styles.chipOn : ''}`}
                      onClick={() => setSelTime(t.key)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className={styles.configActions}>
                  <button type="button" className={styles.addPill} onClick={addToPlan}>
                    Add to plan
                  </button>
                  <button type="button" className={styles.backBtn} onClick={() => setConfigKey(null)}>
                    Back
                  </button>
                </div>
              </div>
            )}

            {!adding && plan.length > 0 && (
              <div className={styles.planList}>
                {plan.map((item) => {
                  const def = SUBSTANCES[item.key]
                  if (!def) return null
                  const at = new Date(item.takenAt)
                  return (
                    <div key={item.id} className={styles.planRow}>
                      <span className={def.amplitude >= 0 ? styles.dotMint : styles.dotAmber} aria-hidden />
                      <span className={styles.planName}>{def.name}</span>
                      <span className={styles.planMeta}>
                        {item.dose} {def.unit} · {fmtClock(at.getHours() + at.getMinutes() / 60)}
                      </span>
                      <button
                        type="button"
                        className={styles.planX}
                        onClick={() => setPlan((p) => p.filter((i) => i.id !== item.id))}
                        aria-label={`Remove ${def.name} from today's plan`}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                          <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
                        </svg>
                      </button>
                    </div>
                  )
                })}
                <span className={styles.previewNote}>nothing here is logged to Peak</span>
              </div>
            )}
          </div>
        )}

        <button type="button" className={styles.next} onClick={onDone}>
          Next
        </button>
      </div>
    </div>
  )
}
