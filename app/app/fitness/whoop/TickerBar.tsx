'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './whoop.module.css'

/**
 * Stock-ticker treatment for the wearable hero metrics.
 *
 * Each item carries:
 *   · symbol  — 3-letter caps (REC, HRV, RHR, SLP, STR, DBT) like an NYSE ticker
 *   · value   — current value as displayed
 *   · spark   — mini sparkline from whatever recent history we have
 *   · delta   — signed change vs baseline / weekly avg / target, with unit
 *   · tone    — vitality canon: mint (good) / amber (watch) / red (urgent)
 *
 * Live behaviour:
 *   · the track scrolls horizontally (existing marquee)
 *   · whenever the underlying numeric value changes, the cell flashes mint
 *     once for ~600ms — like a tick on a real-time feed
 *
 * The component is shape-only: pass a structurally compatible data
 * object from WhoopData / FitbitData / OuraData (all three share the
 * exact same shape after the rename).
 */

export interface TickerDataLike {
  recovery: number | null
  hrv: number | null
  rhr: number | null
  sleepPerf: number | null
  sleepHours: number | null
  strain: number | null
  hrvBaseline: number | null
  rhrBaseline: number | null
  sleepPerfBaseline: number | null
  strainWeeklyAvg: number | null
  hrvAnomalous: boolean
  recoveryTrend: number[]
  sleepDebt7d: { day: string; hours: number }[]
  sleepTargetHours: number
}

type Tone = 'good' | 'watch' | 'urgent'

interface Item {
  key: string
  symbol: string
  value: string
  unit: string
  spark: number[]
  delta: number | null
  deltaUnit: string
  /** True when "down" is good (RHR is lower-is-better). Inverts arrow direction. */
  inverse?: boolean
  tone: Tone
}

function buildItems(d: TickerDataLike): Item[] {
  const items: Item[] = []

  // ── REC — recovery score (%)
  if (d.recovery != null) {
    const trend = d.recoveryTrend.length >= 2 ? d.recoveryTrend : [d.recovery, d.recovery]
    const prior = trend.length > 1 ? trend.slice(0, -1).reduce((a, b) => a + b, 0) / (trend.length - 1) : d.recovery
    const delta = Math.round(d.recovery - prior)
    const tone: Tone = d.recovery >= 67 ? 'good' : d.recovery >= 34 ? 'watch' : 'urgent'
    items.push({
      key: 'REC', symbol: 'REC',
      value: String(Math.round(d.recovery)),
      unit: '%',
      spark: trend,
      delta, deltaUnit: '%',
      tone,
    })
  }

  // ── HRV — heart rate variability (ms)
  if (d.hrv != null) {
    const baseline = d.hrvBaseline ?? d.hrv
    const delta = d.hrvBaseline != null && !d.hrvAnomalous ? Math.round(d.hrv - d.hrvBaseline) : null
    const tone: Tone = d.hrvAnomalous
      ? 'urgent'
      : delta == null
      ? 'watch'
      : delta >= -2 ? 'good' : delta >= -8 ? 'watch' : 'urgent'
    items.push({
      key: 'HRV', symbol: 'HRV',
      value: String(Math.round(d.hrv)),
      unit: 'ms',
      spark: [baseline, d.hrv],
      delta, deltaUnit: 'ms',
      tone,
    })
  }

  // ── RHR — resting heart rate (bpm). Lower is better → inverse arrows.
  if (d.rhr != null) {
    const baseline = d.rhrBaseline ?? d.rhr
    const delta = d.rhrBaseline != null ? Math.round(d.rhr - d.rhrBaseline) : null
    const tone: Tone = delta == null
      ? 'watch'
      : delta <= 0 ? 'good' : delta <= 3 ? 'watch' : 'urgent'
    items.push({
      key: 'RHR', symbol: 'RHR',
      value: String(Math.round(d.rhr)),
      unit: 'bpm',
      spark: [baseline, d.rhr],
      delta, deltaUnit: 'bpm',
      inverse: true,
      tone,
    })
  }

  // ── SLP — sleep hours (h)
  if (d.sleepHours != null) {
    // Sparkline: prefer the actual 7-night history if we have it.
    const spark = d.sleepDebt7d.length >= 2
      ? d.sleepDebt7d.map(n => n.hours)
      : [d.sleepTargetHours, d.sleepHours]
    const delta = Math.round((d.sleepHours - d.sleepTargetHours) * 10) / 10
    const tone: Tone = d.sleepHours >= d.sleepTargetHours - 0.5
      ? 'good'
      : d.sleepHours >= d.sleepTargetHours - 1.5
      ? 'watch'
      : 'urgent'
    const h = Math.floor(d.sleepHours)
    const m = Math.round((d.sleepHours - h) * 60)
    items.push({
      key: 'SLP', symbol: 'SLP',
      value: `${h}h${String(m).padStart(2, '0')}`,
      unit: '',
      spark,
      delta, deltaUnit: 'h',
      tone,
    })
  }

  // ── STR — strain (today vs weekly avg)
  if (d.strain != null) {
    const baseline = d.strainWeeklyAvg ?? d.strain
    const delta = d.strainWeeklyAvg != null ? Math.round((d.strain - d.strainWeeklyAvg) * 10) / 10 : null
    // Strain has no "good/bad" direction by itself — flag only when way over avg.
    const tone: Tone = delta != null && delta > 2 ? 'watch' : 'good'
    items.push({
      key: 'STR', symbol: 'STR',
      value: d.strain.toFixed(1),
      unit: '',
      spark: [baseline, d.strain],
      delta, deltaUnit: '',
      tone,
    })
  }

  // ── DBT — cumulative sleep debt over the visible 7-night window
  if (d.sleepDebt7d.length > 0) {
    const debtH = d.sleepDebt7d.reduce((a, n) => a + (n.hours - d.sleepTargetHours), 0)
    const debtRounded = Math.round(debtH * 10) / 10
    const tone: Tone = debtH > -1 ? 'good' : debtH > -3 ? 'watch' : 'urgent'
    items.push({
      key: 'DBT', symbol: 'DBT',
      value: `${debtH >= 0 ? '+' : ''}${debtRounded.toFixed(1)}`,
      unit: 'h',
      spark: d.sleepDebt7d.map(n => n.hours - d.sleepTargetHours),
      delta: null, deltaUnit: '',
      tone,
    })
  }

  return items
}

// ─── Sparkline ─────────────────────────────────────────────────────────────

function Sparkline({ values, tone }: { values: number[]; tone: Tone }) {
  if (values.length < 2) return null
  const W = 56
  const H = 16
  const pad = 1.5
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(0.0001, max - min)
  const stepX = (W - pad * 2) / (values.length - 1)
  const pts = values
    .map((v, i) => {
      const x = pad + i * stepX
      const y = H - pad - ((v - min) / range) * (H - pad * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const last = values[values.length - 1]
  const lastX = pad + (values.length - 1) * stepX
  const lastY = H - pad - ((last - min) / range) * (H - pad * 2)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.tickerSpark} aria-hidden data-tone={tone}>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={1.6} fill="currentColor" />
    </svg>
  )
}

// ─── Per-item cell with number-flash on update ────────────────────────────

function TickerCell({ item }: { item: Item }) {
  const [flash, setFlash] = useState(false)
  const prev = useRef(item.value)

  useEffect(() => {
    if (prev.current !== item.value) {
      setFlash(true)
      prev.current = item.value
      const t = setTimeout(() => setFlash(false), 600)
      return () => clearTimeout(t)
    }
  }, [item.value])

  const arrow = item.delta == null
    ? null
    : item.inverse
    ? (item.delta <= 0 ? '↗' : '↘')   // RHR: down=good, render as up-arrow
    : (item.delta >= 0 ? '↗' : '↘')

  const deltaText = item.delta == null
    ? null
    : `${item.delta >= 0 ? '+' : ''}${item.delta}${item.deltaUnit}`

  return (
    <span className={styles.tickerCell} data-tone={item.tone}>
      <span className={styles.tickerSymbol}>{item.symbol}</span>
      <span className={`${styles.tickerValue} ${flash ? styles.tickerValueFlash : ''}`}>
        {item.value}
        {item.unit && <span className={styles.tickerUnit}>{item.unit}</span>}
      </span>
      <Sparkline values={item.spark} tone={item.tone} />
      {deltaText && (
        <span className={styles.tickerDelta}>
          {arrow} {deltaText}
        </span>
      )}
    </span>
  )
}

// ─── Public component ─────────────────────────────────────────────────────

export default function TickerBar({ d }: { d: TickerDataLike }) {
  const items = buildItems(d)
  if (items.length === 0) return null
  // Duplicate the items so the marquee can loop seamlessly via translateX(-50%).
  const rolled = [...items, ...items]

  return (
    <div className={styles.ticker} role="status" aria-label="Vitality live insights">
      <div className={styles.tickerEyebrow}>
        <span className={styles.tickerPulse} aria-hidden />
        Vitality · Live
      </div>
      <div className={styles.tickerScroll}>
        <div className={styles.tickerTrack}>
          {rolled.map((item, i) => (
            <TickerCell key={`${item.key}-${i}`} item={item} />
          ))}
        </div>
      </div>
    </div>
  )
}
