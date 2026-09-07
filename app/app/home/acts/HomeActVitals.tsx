'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { HomePull, PullReading } from '@/lib/home/pullTypes'
import {
  computeVitalsScore,
  computeBaselines,
  computeScoreSeries,
  tierForScore,
  type Baselines,
  type ScoreSeriesRow,
  type Tier,
} from '@/lib/vitals/score'
import { deriveManualMetrics } from '@/lib/vitals/manualScore'
import type { Presence } from '@/lib/home/presence'
import { BASELINE, contributionAt, whoopMultiplier } from '../../peak/curve'
import type { SubstanceLog, WhoopSignal } from '../../peak/types'
import { getLocalDateKey } from '@/lib/dates'
import styles from './homeActVitals.module.css'

/*
 * ACT 1 - VITALS. The first act of "Vitality, I'm home".
 *
 * ZERO-INPUT by law. The shell only mounts this act when the account has a
 * vitals stream at all (presence.usesVitals). Inside:
 *   reads - Sleep / Recovery / Strain out of 100 + the overall Vitals line,
 *     computed by lib/vitals/score.ts from today's folded reading. When a
 *     band user has no row for TODAY yet, the latest read day renders
 *     instead, said plainly as the latest read - never a fabricated today.
 *   checkin - the ONE input exception, shown only when today is empty AND
 *     the account's history shows a manual-logging habit (manual rows in the
 *     last 14 days) AND there is no band at all. Compressed: sleep stepper +
 *     feel pills; RHR/HRV inputs appear only for users who historically fill
 *     them. Saves via /api/wearables/manual (same pipe Peak's check-in uses).
 *   graph - the score line (computeScoreSeries) with 7D / 30D / 3D ranges,
 *     touch scrub, and a dotted mint mark per day = that day's peak ceiling
 *     from the Peak curve math. Days without peak data draw nothing.
 *
 * Every number on screen is engine-derived. COLOR LAW: mint good, azure
 * steady, amber caution, never red.
 */

type Page = 'checkin' | 'saved' | 'reads' | 'graph'

/* One folded day: band rows beat manual per field (same fold Peak uses). */
interface FoldedDay {
  recovery: number | null
  hrv: number | null
  rhr: number | null
  sleepPerf: number | null
  sleepHours: number | null
  strain: number | null
  hasAny: boolean
}

type MetricKey = 'recovery' | 'hrv' | 'rhr' | 'sleep_perf' | 'sleep_hours' | 'strain'

function foldDay(readings: PullReading[], date: string): FoldedDay {
  const rows = readings.filter((r) => r.date === date)
  rows.sort((a, b) => (a.provider === 'manual' ? 1 : 0) - (b.provider === 'manual' ? 1 : 0))
  const pick = (k: MetricKey): number | null => {
    for (const r of rows) if (r[k] != null) return r[k]
    return null
  }
  const f = {
    recovery: pick('recovery'),
    hrv: pick('hrv'),
    rhr: pick('rhr'),
    sleepPerf: pick('sleep_perf'),
    sleepHours: pick('sleep_hours'),
    strain: pick('strain'),
  }
  return { ...f, hasAny: Object.values(f).some((v) => v != null) }
}

/** COLOR LAW: mint good, azure steady, amber caution. Never red. */
function toneFor(tier: Tier | null): string {
  if (tier === 'peak' || tier === 'strong') return 'var(--mint, #6EE7B7)'
  if (tier === 'steady') return '#6EA8FF'
  return '#F59E0B'
}

function fmtDay(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  if (!y || !m || !day) return d
  return new Date(y, m - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/* ── Peak ceiling: the Peak curve math run per historical day ─────────────
 * computeCurve() itself only scores the wall-clock today (it filters logs to
 * the current day), so we run its exact pipeline - BASELINE + contributionAt
 * per substance, clamped, times whoopMultiplier - for any past day. Only days
 * that actually have substance logs in peakState get a ceiling; nothing is
 * invented for the rest. */

interface PeakLite {
  logsByDate: Map<string, SubstanceLog[]>
  weightKg: number
}

function parsePeak(blob: unknown): PeakLite | null {
  if (!blob || typeof blob !== 'object') return null
  const b = blob as { substances?: unknown; profile?: { weightKg?: unknown } }
  if (!Array.isArray(b.substances)) return null
  const logsByDate = new Map<string, SubstanceLog[]>()
  for (const raw of b.substances) {
    const s = raw as SubstanceLog
    if (
      !s ||
      typeof s.key !== 'string' ||
      typeof s.takenAt !== 'number' ||
      typeof s.dose !== 'number' ||
      typeof s.tolerance !== 'number'
    ) continue
    const day = getLocalDateKey(new Date(s.takenAt))
    const list = logsByDate.get(day)
    if (list) list.push(s)
    else logsByDate.set(day, [s])
  }
  if (logsByDate.size === 0) return null
  const w = b.profile?.weightKg
  return { logsByDate, weightKg: typeof w === 'number' && w > 0 ? w : 75 }
}

/* WhoopSignal for one past day, mirroring peak/load.ts: sleep debt = hours
 * short of 8, wake hour unknown from the pull (the multiplier defaults to 7). */
function daySignal(f: FoldedDay, baselines: Baselines): WhoopSignal {
  return {
    recovery: f.recovery,
    hrv: f.hrv,
    sleepScore: f.sleepPerf,
    sleepHours: f.sleepHours,
    sleepDebtHours: f.sleepHours != null ? Math.max(0, 8 - f.sleepHours) : null,
    strain: f.strain,
    wakeHour: null,
    hrvBaseline: baselines.hrv,
    rhrBaseline: baselines.rhr,
    hrvAnomalous: f.hrv != null && (f.hrv < 15 || f.hrv > 150),
    daysAvailable: 0,
  }
}

function dayCeiling(
  logs: SubstanceLog[],
  weightKg: number,
  folded: FoldedDay | null,
  baselines: Baselines,
): number {
  const wm = folded && folded.hasAny ? whoopMultiplier(daySignal(folded, baselines)) : null
  let best = 0
  for (let h = 0; h < BASELINE.length; h++) {
    let v = BASELINE[h]
    for (const log of logs) v += contributionAt(h, log, weightKg)
    v = Math.max(0, Math.min(100, v))
    if (wm) v = Math.max(0, Math.min(100, v * wm[h]))
    if (v > best) best = v
  }
  return Math.round(best)
}

/* ── Check-in vocabulary (Peak's own words, warm, never shaming) ────────── */
const FEEL_OPTIONS = [
  { v: 1, label: 'Wrecked' },
  { v: 2, label: 'Rough' },
  { v: 4, label: 'Good' },
  { v: 5, label: 'Amazing' },
]

const RANGES = [
  { k: '7', label: '7D', n: 7 },
  { k: '30', label: '30D', n: 30 },
  { k: '3', label: '3D', n: 3 },
]

const GW = 320
const GH = 110
const GP = 14

export default function HomeActVitals({
  pull,
  presence,
  firstName,
  onDone,
}: {
  pull: HomePull
  presence: Presence
  firstName: string
  onDone: () => void
}) {
  const [readings, setReadings] = useState<PullReading[]>(pull.readings)
  // The check-in only exists for accounts whose HISTORY shows they manually
  // log vitals AND who have no band. Band users with no row today land on
  // reads (latest read day) - the band is asked, never the human.
  const [page, setPage] = useState<Page>(() =>
    foldDay(pull.readings, pull.today).hasAny || !presence.manualHabit || presence.hasBand
      ? 'reads'
      : 'checkin',
  )
  const [leaving, setLeaving] = useState(false)
  const rm = useRef(false)
  const timers = useRef<number[]>([])

  useEffect(() => {
    rm.current =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])
  useEffect(() => {
    const pending = timers.current
    return () => { pending.forEach((t) => window.clearTimeout(t)) }
  }, [])

  const goTo = useCallback((next: Page) => {
    if (rm.current) { setPage(next); return }
    setLeaving(true)
    timers.current.push(
      window.setTimeout(() => { setLeaving(false); setPage(next) }, 260),
    )
  }, [])

  /* ── Check-in state (compressed: sleep + feel; RHR/HRV only when the
   *    account's manual history shows those fields get filled) ──────────── */
  const [sleepH, setSleepH] = useState(8)
  const [feel, setFeel] = useState<number | null>(null)
  const [rhrText, setRhrText] = useState('')
  const [hrvText, setHrvText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  const stepSleep = (d: number) =>
    setSleepH((h) => Math.max(0, Math.min(16, Math.round((h + d) * 2) / 2)))

  /* ── Shared engine reads ────────────────────────────────────────────── */
  const baselines = useMemo(() => computeBaselines(readings), [readings])
  const todayFold = useMemo(() => foldDay(readings, pull.today), [readings, pull.today])

  // ANTICIPATE, NEVER ASK: a band user whose band has not dropped today's row
  // yet sees the latest read day, said as exactly that. Nothing is invented.
  const readDate = useMemo(() => {
    if (todayFold.hasAny) return pull.today
    const dates = Array.from(new Set(readings.map((r) => r.date))).sort()
    for (let i = dates.length - 1; i >= 0; i--) {
      if (foldDay(readings, dates[i]).hasAny) return dates[i]
    }
    return null
  }, [todayFold, readings, pull.today])
  const readFold = useMemo(
    () => (readDate ? foldDay(readings, readDate) : todayFold),
    [readDate, readings, todayFold],
  )
  const readsAreToday = readDate === pull.today

  const vitals = useMemo(
    () =>
      computeVitalsScore({
        recovery: readFold.recovery,
        sleepPerf: readFold.sleepPerf,
        hrv: readFold.hrv,
        rhr: readFold.rhr,
        sleepHours: readFold.sleepHours,
        strain: readFold.strain,
        hrvBaseline: baselines.hrv,
        rhrBaseline: baselines.rhr,
        sleepTarget: 8,
      }),
    [readFold, baselines],
  )

  const save = useCallback(async () => {
    if (saving) return
    setSaveErr(null)
    const parseOpt = (text: string, lo: number, hi: number) => {
      const t = text.trim()
      if (!t) return { value: null as number | null, bad: false }
      const n = Number(t)
      if (!Number.isFinite(n) || n < lo || n > hi) return { value: null, bad: true }
      return { value: n, bad: false }
    }
    const rhr = parseOpt(rhrText, 20, 120)
    const hrv = parseOpt(hrvText, 1, 400)
    if (rhr.bad) { setSaveErr('That resting HR looks off. Double-check the number.'); return }
    if (hrv.bad) { setSaveErr('That HRV looks off. Double-check the number.'); return }

    // Same derivation Peak's check-in ships: the self-report becomes the
    // WHOOP-style trio before it touches wearable_data. The compressed
    // check-in dropped the restfulness pills, so sleepQuality is null.
    const metrics = deriveManualMetrics({
      sleepHours: sleepH,
      sleepQuality: null,
      feel,
      hrv: hrv.value,
      rhr: rhr.value,
      exertion: null,
      hrvBaseline: baselines.hrv,
      rhrBaseline: baselines.rhr,
      sleepNeed: 8,
    })

    setSaving(true)
    try {
      const res = await fetch('/api/wearables/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: pull.today,
          recovery: metrics.recovery,
          sleep_perf: metrics.sleepPerf,
          sleep_hours: sleepH,
          hrv: hrv.value,
          rhr: rhr.value,
          strain: metrics.strain,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setSaveErr(data?.error || 'Could not save. Try again.')
        setSaving(false)
        return
      }
      // Fold the saved reading into local state so reads + graph are live.
      setReadings((prev) => [
        ...prev,
        {
          provider: 'manual',
          date: pull.today,
          recovery: metrics.recovery,
          hrv: hrv.value,
          rhr: rhr.value,
          sleep_perf: metrics.sleepPerf,
          sleep_hours: sleepH,
          strain: metrics.strain,
        },
      ])
      setSaving(false)
      goTo('saved')
      timers.current.push(window.setTimeout(() => goTo('reads'), 1500))
    } catch {
      setSaveErr('Could not reach the server. Try again.')
      setSaving(false)
    }
  }, [saving, rhrText, hrvText, sleepH, feel, baselines, pull.today, goTo])

  /* ── Reads page data ────────────────────────────────────────────────── */
  const sub = (key: 'sleep_perf' | 'recovery' | 'strain') =>
    vitals?.subs.find((s) => s.key === key) ?? null
  const reads: { label: string; sub: ReturnType<typeof sub> }[] = [
    { label: 'Sleep', sub: sub('sleep_perf') },
    { label: 'Recovery', sub: sub('recovery') },
    { label: 'Strain', sub: sub('strain') },
  ]
  const anyMissing = reads.some((r) => r.sub?.score == null)

  /* ── Graph page data ────────────────────────────────────────────────── */
  const series = useMemo(() => {
    const dates = Array.from(new Set(readings.map((r) => r.date))).sort()
    const rows: ScoreSeriesRow[] = dates.map((d) => {
      const f = foldDay(readings, d)
      return {
        date: d,
        recovery: f.recovery,
        sleep_perf: f.sleepPerf,
        hrv: f.hrv,
        rhr: f.rhr,
        sleep_hours: f.sleepHours,
        strain: f.strain,
      }
    })
    return computeScoreSeries(rows, baselines, 8)
  }, [readings, baselines])

  const ceilings = useMemo(() => {
    const out = new Map<string, number>()
    const peak = parsePeak(pull.peakState)
    if (!peak) return out
    for (const [day, logs] of peak.logsByDate) {
      const f = foldDay(readings, day)
      out.set(day, dayCeiling(logs, peak.weightKg, f.hasAny ? f : null, baselines))
    }
    return out
  }, [pull.peakState, readings, baselines])

  const [rangeK, setRangeK] = useState('7')
  const [scrub, setScrub] = useState<number | null>(null)
  const graphRef = useRef<HTMLDivElement>(null)

  const rangeN = RANGES.find((r) => r.k === rangeK)?.n ?? 7
  const pts = useMemo(() => series.slice(-rangeN), [series, rangeN])

  const ceilAt = (date: string): number | null => ceilings.get(date) ?? null
  const vals = pts.map((p) => p.score)
  const ceilVals = pts.map((p) => ceilAt(p.date)).filter((v): v is number => v != null)
  const mn = vals.length ? Math.min(...vals, ...(ceilVals.length ? ceilVals : vals)) : 0
  const mx = vals.length ? Math.max(...vals, ...(ceilVals.length ? ceilVals : vals)) : 100
  const lo = Math.floor(mn / 5) * 5
  const hi = Math.max(lo + 5, Math.ceil(mx / 5) * 5)
  const mid = Math.round((lo + hi) / 2)
  const xF = (i: number) => (pts.length < 2 ? GW / 2 : GP + (GW - 2 * GP) * (i / (pts.length - 1)))
  const yF = (v: number) => GP + (GH - 2 * GP) * (1 - (v - lo) / (hi - lo || 1))
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${xF(i).toFixed(1)} ${yF(p.score).toFixed(1)}`).join(' ')
  const areaD = pts.length
    ? `${line} L${xF(pts.length - 1).toFixed(1)} ${GH} L${xF(0).toFixed(1)} ${GH} Z`
    : ''

  const activeI = scrub != null ? scrub : pts.length - 1
  const cur = pts[activeI]
  const curTier = cur ? tierForScore(cur.score) : null
  const curCeil = cur ? ceilAt(cur.date) : null
  const showTag = scrub != null && cur != null
  const tagLeft = cur ? Math.max(15, Math.min(85, (xF(activeI) / GW) * 100)) : 50
  const anyCeilShown = pts.some((p) => ceilAt(p.date) != null)

  const onMove = (clientX: number) => {
    const el = graphRef.current
    if (!el || pts.length < 2) return
    const r = el.getBoundingClientRect()
    let f = (clientX - r.left) / r.width
    f = Math.max(0, Math.min(1, f))
    setScrub(Math.round(f * (pts.length - 1)))
  }

  return (
    <div className={`${styles.act} ${leaving ? styles.actLeaving : ''}`}>
      {page === 'checkin' && (
        <div className={styles.pageCol}>
          <p className={styles.vee}>
            <span className={styles.veeTag}>VEE</span>
            Before anything, tell me how you slept and how you feel. This is the one thing I cannot read for you.
          </p>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>SLEEP HOURS</span>
            <div className={styles.stepper}>
              <button
                type="button"
                className={styles.stepBtn}
                onClick={() => stepSleep(-0.5)}
                aria-label="Half an hour less sleep"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="6" y1="12" x2="18" y2="12" />
                </svg>
              </button>
              <span className={styles.stepVal}>
                {sleepH % 1 === 0 ? sleepH : sleepH.toFixed(1)}
                <small>h</small>
              </span>
              <button
                type="button"
                className={styles.stepBtn}
                onClick={() => stepSleep(0.5)}
                aria-label="Half an hour more sleep"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="6" y1="12" x2="18" y2="12" /><line x1="12" y1="6" x2="12" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>HOW YOU FEEL</span>
            <div className={styles.pills}>
              {FEEL_OPTIONS.map((o) => (
                <button
                  key={o.v}
                  type="button"
                  className={`${styles.pill} ${feel === o.v ? styles.pillOn : ''}`}
                  onClick={() => setFeel(o.v)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {(presence.manualRhrHabit || presence.manualHrvHabit) && (
            <div className={styles.optRow}>
              {presence.manualRhrHabit && (
                <label className={styles.optField}>
                  <span className={styles.fieldLabel}>RHR BPM · OPTIONAL</span>
                  <input
                    className={styles.optInput}
                    inputMode="numeric"
                    placeholder="--"
                    value={rhrText}
                    onChange={(e) => setRhrText(e.target.value)}
                  />
                </label>
              )}
              {presence.manualHrvHabit && (
                <label className={styles.optField}>
                  <span className={styles.fieldLabel}>HRV MS · OPTIONAL</span>
                  <input
                    className={styles.optInput}
                    inputMode="numeric"
                    placeholder="--"
                    value={hrvText}
                    onChange={(e) => setHrvText(e.target.value)}
                  />
                </label>
              )}
            </div>
          )}

          {saveErr && <p className={styles.err}>{saveErr}</p>}

          <button type="button" className={styles.save} onClick={save} disabled={saving}>
            {saving ? 'Saving your morning' : 'Save my check-in'}
          </button>
        </div>
      )}

      {page === 'saved' && (
        <div className={styles.pageCol}>
          <div className={styles.savedBeat}>
            <span className={styles.savedDot} />
            <span className={styles.savedText}>CHECK-IN SAVED</span>
          </div>
          <p className={styles.savedLine}>Locked in, {firstName}. Reading your body now.</p>
        </div>
      )}

      {page === 'reads' && (
        <div className={styles.pageCol}>
          <p className={styles.vee}>
            <span className={styles.veeTag}>VEE</span>
            {readsAreToday
              ? 'Here is your body today. Sleep, recovery, and strain, each out of a hundred.'
              : readDate
                ? `No reading has landed for today yet, so here is your latest, from ${fmtDay(readDate)}.`
                : 'No readings in your stream yet. The first one draws this picture.'}
          </p>

          <div className={styles.reads}>
            {reads.map((r) => (
              <div key={r.label} className={styles.read}>
                <span className={styles.readLabel}>{r.label}</span>
                <span
                  className={styles.readScore}
                  style={{ color: r.sub?.score != null ? toneFor(r.sub.tier) : 'rgba(255,255,255,.28)' }}
                >
                  {r.sub?.score != null ? r.sub.score : '--'}
                </span>
                <span className={styles.readOutOf}>/ 100</span>
              </div>
            ))}
          </div>

          {anyMissing && (
            <p className={styles.readHint}>A dash just means no reading for that one today.</p>
          )}

          {vitals && (
            <p className={styles.overall}>
              {readsAreToday ? 'Vitals today' : 'Vitals that day'}{' '}
              <b style={{ color: toneFor(tierForScore(vitals.score)) }}>{vitals.score}</b>
            </p>
          )}

          <button type="button" className={styles.next} onClick={() => goTo('graph')}>
            Next
          </button>
        </div>
      )}

      {page === 'graph' && (
        <div className={styles.pageCol}>
          <p className={styles.vee}>
            <span className={styles.veeTag}>VEE</span>
            Look at your line. Hit next to dive into the day.
          </p>

          {series.length < 3 ? (
            <p className={styles.sparse}>
              Your line needs a few more scored days. Check in each morning and it draws itself.
            </p>
          ) : (
            <div className={styles.graphCard}>
              <div className={styles.rangeRow}>
                {RANGES.map((r) => (
                  <button
                    key={r.k}
                    type="button"
                    className={`${styles.rangeBtn} ${rangeK === r.k ? styles.rangeOn : ''}`}
                    onClick={() => { setRangeK(r.k); setScrub(null) }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              <div
                className={styles.graph}
                ref={graphRef}
                onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onMove(e.clientX) }}
                onPointerMove={(e) => { if (e.buttons || e.pointerType === 'mouse') onMove(e.clientX) }}
                onPointerLeave={() => setScrub(null)}
                onPointerUp={() => setScrub(null)}
              >
                <svg viewBox={`0 0 ${GW} ${GH}`} preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="havg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6EE7B7" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#6EE7B7" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[hi, mid, lo].map((v) => (
                    <line
                      key={v}
                      x1="0"
                      y1={yF(v).toFixed(1)}
                      x2={GW}
                      y2={yF(v).toFixed(1)}
                      stroke="rgba(255,255,255,.07)"
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  <path d={areaD} fill="url(#havg)" />
                  <path
                    d={line}
                    fill="none"
                    stroke="#6EE7B7"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>

                {[hi, mid, lo].map((v) => (
                  <span key={v} className={styles.gridLabel} style={{ top: `${(yF(v) / GH) * 100}%` }}>
                    {v}
                  </span>
                ))}

                {pts.map((p, i) => {
                  const c = ceilAt(p.date)
                  if (c == null) return null
                  return (
                    <span
                      key={p.date}
                      className={styles.ceilDot}
                      style={{ left: `${(xF(i) / GW) * 100}%`, top: `${(yF(c) / GH) * 100}%` }}
                    />
                  )
                })}

                <span
                  className={styles.scrubLine}
                  style={{ left: `${(xF(activeI) / GW) * 100}%`, opacity: showTag ? 1 : 0 }}
                />
                {cur && (
                  <span
                    className={styles.scrubDot}
                    style={{
                      left: `${(xF(activeI) / GW) * 100}%`,
                      top: `${(yF(cur.score) / GH) * 100}%`,
                      background: toneFor(curTier),
                    }}
                  />
                )}
                {cur && (
                  <span
                    className={`${styles.scrubTag} ${showTag ? styles.tagShow : ''}`}
                    style={{ left: `${tagLeft}%` }}
                  >
                    <span className={styles.tagDate}>{fmtDay(cur.date)}</span>
                    <span className={styles.tagScore} style={{ color: toneFor(curTier) }}>
                      {cur.score}
                    </span>
                    {curCeil != null && (
                      <span className={styles.tagCeil}>ceiling {curCeil}</span>
                    )}
                  </span>
                )}
              </div>

              {anyCeilShown && (
                <span className={styles.ceilKey}>
                  <i className={styles.ceilKeyDot} aria-hidden />
                  PEAK CEILING
                </span>
              )}
            </div>
          )}

          <button type="button" className={styles.next} onClick={onDone}>
            Next
          </button>
        </div>
      )}
    </div>
  )
}
