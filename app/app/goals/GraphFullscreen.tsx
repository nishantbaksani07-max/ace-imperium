'use client'

import { useEffect } from 'react'
import type { TickerRow } from '@/lib/insights/ticker'
import styles from './graphFullscreen.module.css'

/**
 * GraphFullscreen - the goal sparkline, expanded (TRAIN 5 addition). Exactly
 * the same real series the 54px sparkline draws, on a canvas that fills the
 * screen: a date axis (real dates when the row carries them, honest week words
 * for the training buckets, never invented), min/max on the y side, the state
 * word and measured detail up top. Close on tap anywhere, the X, or Escape.
 * Springy entrance, flattened under prefers-reduced-motion.
 */

type Tone = 'up' | 'dn' | 'flat'

const W = 720
const H = 400
const PAD_L = 56
const PAD_R = 28
const PAD_T = 28
const PAD_B = 44

/** Catmull-Rom to cubic bezier - the same smooth-curve look as the goal demos. */
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return ''
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? pts[i + 1]
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

/** 'YYYY-MM-DD' → 'May 4' (local, no UTC drift). Falls back to the raw key. */
function fmtDay(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  if (!y || !m || !day) return d
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function fmtVal(n: number): string {
  return String(Math.round(n * 100) / 100)
}

/** The x-axis labels we can honestly draw: real dates when the row has them,
 *  week words for the 3-bucket training cadence, oldest/latest otherwise. */
function axisLabels(row: TickerRow): { frac: number; text: string }[] {
  const n = row.spark.length
  if (n < 2) return []
  const dates = row.sparkDates
  if (dates && dates.length === n) {
    const picks = n >= 5 ? [0, Math.round((n - 1) / 2), n - 1] : [0, n - 1]
    const out: { frac: number; text: string }[] = []
    for (const i of picks) {
      const text = fmtDay(dates[i])
      if (!out.some(o => o.text === text)) out.push({ frac: i / (n - 1), text })
    }
    return out
  }
  if (row.metric === 'training' && n === 3) {
    return [
      { frac: 0, text: '3 wks ago' },
      { frac: 0.5, text: 'last wk' },
      { frac: 1, text: 'this wk' },
    ]
  }
  return [
    { frac: 0, text: 'oldest' },
    { frac: 1, text: 'latest' },
  ]
}

export default function GraphFullscreen({
  row,
  tone,
  word,
  onClose,
}: {
  row: TickerRow
  tone: Tone
  word: string
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const spark = row.spark
  if (spark.length < 2) return null

  const min = Math.min(...spark)
  const max = Math.max(...spark)
  const range = max - min || 1
  const x = (i: number) => PAD_L + ((W - PAD_L - PAD_R) * i) / (spark.length - 1)
  const y = (v: number) => PAD_T + (H - PAD_T - PAD_B) * (1 - (v - min) / range)
  const pts = spark.map((v, i) => [x(i), y(v)] as [number, number])
  const line = smoothPath(pts)
  const baseY = H - PAD_B
  const area = `${line} L${x(spark.length - 1).toFixed(1)},${baseY} L${PAD_L},${baseY} Z`
  const last = pts[pts.length - 1]

  const color = tone === 'up' ? 'var(--mint, #6EE7B7)' : tone === 'dn' ? 'var(--amber, #F59E0B)' : 'var(--n-muted-strong, rgba(233,239,233,0.72))'
  const labels = axisLabels(row)
  const stateClass = tone === 'up' ? styles.stateUp : tone === 'dn' ? styles.stateDn : ''

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={`${row.title} graph`}
      onClick={onClose}
    >
      <div className={styles.head} onClick={e => e.stopPropagation()} style={{ cursor: 'default' }}>
        <div>
          <div className={styles.title}>{row.title}</div>
          <div className={styles.meta}>
            <span className={`${styles.state} ${stateClass}`}>{word}</span>
            {row.detail && <span className={styles.detail}>{row.detail}</span>}
          </div>
        </div>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <div className={styles.stage}>
        <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} aria-hidden>
          <defs>
            <linearGradient id="gfArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* quarter grid */}
          {[0.25, 0.5, 0.75].map(f => (
            <line key={f} className={styles.gridLine} x1={PAD_L} x2={W - PAD_R} y1={PAD_T + (H - PAD_T - PAD_B) * f} y2={PAD_T + (H - PAD_T - PAD_B) * f} />
          ))}
          <line className={styles.axis} x1={PAD_L} x2={W - PAD_R} y1={baseY} y2={baseY} />
          {/* honest y bounds */}
          <text className={styles.yLabel} x={PAD_L - 10} y={y(max) + 3.5} textAnchor="end">{fmtVal(max)}</text>
          <text className={styles.yLabel} x={PAD_L - 10} y={y(min) + 3.5} textAnchor="end">{fmtVal(min)}</text>
          {/* the series */}
          <path d={area} fill="url(#gfArea)" stroke="none" />
          <path className={styles.line} d={line} stroke={color} />
          {pts.map(([px, py], i) => (
            <circle key={i} className={styles.dot} cx={px} cy={py} r={i === pts.length - 1 ? 5 : 2.6} fill={color} opacity={i === pts.length - 1 ? 1 : 0.55} />
          ))}
          <circle cx={last[0]} cy={last[1]} r={9} fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="1.4" />
          {/* date axis */}
          {labels.map(l => (
            <text
              key={`${l.frac}-${l.text}`}
              className={styles.axisLabel}
              x={PAD_L + (W - PAD_L - PAD_R) * l.frac}
              y={H - PAD_B + 26}
              textAnchor={l.frac === 0 ? 'start' : l.frac === 1 ? 'end' : 'middle'}
            >
              {l.text}
            </text>
          ))}
        </svg>
      </div>

      <div className={styles.hint}>tap anywhere to close</div>
    </div>
  )
}
