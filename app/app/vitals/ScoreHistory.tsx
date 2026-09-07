'use client'

import { useMemo, useRef, useState } from 'react'
import type { ScorePoint } from '@/lib/vitals/score'
import { tierForScore } from '@/lib/vitals/score'
import { TIER_COLOR, TIER_WORD } from '@/components/vitals/tierMeta'
import styles from './scoreHistory.module.css'

export interface MetricRow {
  date: string
  recovery: number | null
  sleep_perf: number | null
  hrv: number | null
  strain: number | null
}

const WINS = [
  { k: '7', label: '7D', n: 7 },
  { k: '30', label: '30D', n: 30 },
  { k: '90', label: '3M', n: 90 },
  { k: 'all', label: 'All', n: Infinity },
]
const RANGE_LABEL: Record<string, string> = { '7': '7 days', '30': '30 days', '90': '3 months', all: 'all time' }

function fmtDay(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  if (!y || !m || !day) return d
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

const GW = 320, GH = 88, GP = 12

/** Tiny static trend line for one metric (no scrub). */
function Mini({ name, unit, values }: { name: string; unit: string; values: number[] }) {
  const last = values.length ? values[values.length - 1] : null
  let body = null
  if (values.length >= 2) {
    const mn = Math.min(...values), mx = Math.max(...values)
    const xF = (i: number) => 3 + (120 - 6) * (i / (values.length - 1))
    const yF = (v: number) => 27 - (v - mn) / (mx - mn || 1) * 24
    const d = values.map((v, i) => `${i ? 'L' : 'M'}${xF(i).toFixed(1)} ${yF(v).toFixed(1)}`).join(' ')
    body = (
      <svg viewBox="0 0 120 30" preserveAspectRatio="none">
        <path d={d} fill="none" stroke="rgba(94,155,255,.55)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <circle cx={xF(values.length - 1).toFixed(1)} cy={yF(values[values.length - 1]).toFixed(1)} r="2" fill="var(--accent-hi)" />
      </svg>
    )
  }
  return (
    <div className={styles.hm}>
      <div className={styles.hmTop}>
        <span className={styles.hmName}>{name}</span>
        <span className={styles.hmVal}>{last == null ? '—' : Math.round(last)}<small>{unit}</small></span>
      </div>
      {body}
    </div>
  )
}

export default function ScoreHistory({ series, history }: { series: ScorePoint[]; history: MetricRow[] }) {
  const [winK, setWinK] = useState('7')
  const [scrub, setScrub] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const ordered = useMemo(() => [...series].reverse(), [series]) // oldest → newest
  const n = WINS.find(w => w.k === winK)!.n
  const pts = useMemo(() => (n === Infinity ? ordered : ordered.slice(-n)), [ordered, n])

  const vals = pts.map(p => p.score)
  const mn = pts.length ? Math.min(...vals) : 0
  const mx = pts.length ? Math.max(...vals) : 100
  const lo = Math.floor(mn / 5) * 5
  const hi = Math.max(lo + 5, Math.ceil(mx / 5) * 5)
  const mid = Math.round((lo + hi) / 2)
  const xF = (i: number) => (pts.length < 2 ? GW / 2 : GP + (GW - 2 * GP) * (i / (pts.length - 1)))
  const yF = (v: number) => GP + (GH - 2 * GP) * (1 - (v - lo) / (hi - lo || 1))
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${xF(i).toFixed(1)} ${yF(p.score).toFixed(1)}`).join(' ')
  const areaD = pts.length ? `${line} L${xF(pts.length - 1).toFixed(1)} ${GH} L${xF(0).toFixed(1)} ${GH} Z` : ''

  const avg = pts.length ? Math.round(vals.reduce((a, b) => a + b, 0) / pts.length) : 0
  const best = pts.length ? mx : 0
  const trend = pts.length > 1 ? pts[pts.length - 1].score - pts[0].score : 0

  const activeI = scrub != null ? scrub : pts.length - 1
  const cur = pts[activeI]
  const curTier = cur ? tierForScore(cur.score) : 'steady'
  const prev = activeI > 0 ? pts[activeI - 1] : null
  const delta = cur && prev ? cur.score - prev.score : null

  const onMove = (clientX: number) => {
    const el = ref.current
    if (!el || pts.length < 2) return
    const r = el.getBoundingClientRect()
    let f = (clientX - r.left) / r.width
    f = Math.max(0, Math.min(1, f))
    setScrub(Math.round(f * (pts.length - 1)))
  }

  // metric mini-trends from the raw rows
  const orderedH = useMemo(() => [...history].reverse(), [history])
  const hWin = n === Infinity ? orderedH : orderedH.slice(-Math.min(n, 30))
  const minis: { name: string; unit: string; get: (r: MetricRow) => number | null }[] = [
    { name: 'Recovery', unit: '', get: r => r.recovery },
    { name: 'Sleep', unit: '%', get: r => r.sleep_perf },
    { name: 'HRV', unit: 'ms', get: r => r.hrv },
    { name: 'Strain', unit: '', get: r => r.strain },
  ]

  const showTag = scrub != null && cur != null
  const tagLeft = cur ? Math.max(13, Math.min(87, (xF(activeI) / GW) * 100)) : 50

  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <div className={styles.lead}>
          <span className={styles.eyb}>Average</span>
          <span className={styles.big}>{avg || '—'}</span>
          <span className={styles.sub}>vitals score · <b>{RANGE_LABEL[winK]}</b></span>
        </div>
        <div className={styles.range}>
          {WINS.map(w => (
            <button key={w.k} type="button" className={winK === w.k ? styles.on : ''} onClick={() => { setWinK(w.k); setScrub(null) }}>{w.label}</button>
          ))}
        </div>
      </div>

      {pts.length < 2 ? (
        <div className={styles.empty}>Log a couple more days and your line starts here.</div>
      ) : (
        <>
          <div
            className={styles.graph}
            ref={ref}
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); onMove(e.clientX) }}
            onPointerMove={e => { if (e.buttons || e.pointerType === 'mouse') onMove(e.clientX) }}
            onPointerLeave={() => setScrub(null)}
            onPointerUp={() => setScrub(null)}
          >
            <svg viewBox="0 0 320 88" preserveAspectRatio="none">
              <defs>
                <linearGradient id="schg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[hi, mid, lo].map(v => (
                <line key={v} x1="0" y1={yF(v).toFixed(1)} x2="320" y2={yF(v).toFixed(1)} stroke="rgba(255,255,255,.07)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              ))}
              <path d={areaD} fill="url(#schg)" />
              <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
            {[hi, mid, lo].map(v => (
              <span key={v} className={styles.gridLabel} style={{ top: `${(yF(v) / GH) * 100}%` }}>{v}</span>
            ))}
            <span className={styles.scrubLine} style={{ left: `${(xF(activeI) / GW) * 100}%`, opacity: showTag ? 1 : 0 }} />
            {cur && (
              <span className={styles.scrubDot} style={{ left: `${(xF(activeI) / GW) * 100}%`, top: `${(yF(cur.score) / GH) * 100}%`, background: TIER_COLOR[curTier] }} />
            )}
            {cur && (
              <span className={`${styles.scrubTag} ${showTag ? styles.show : ''}`} style={{ left: `${tagLeft}%`, top: `${(yF(cur.score) / GH) * 100}%` }}>
                <span className={styles.stDate}>{fmtDay(cur.date)}</span>
                <span className={styles.stRow}>
                  <span className={styles.stScore} style={{ color: TIER_COLOR[curTier] }}>{cur.score}</span>
                  <span className={styles.stTier} style={{ color: TIER_COLOR[curTier] }}>{TIER_WORD[curTier]}</span>
                </span>
                {delta != null && (
                  <span className={styles.stDelta} style={{ color: delta > 0 ? 'var(--accent)' : delta < 0 ? 'var(--amber)' : 'var(--muted)' }}>
                    {delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : '— level'} from day before
                  </span>
                )}
              </span>
            )}
          </div>

          <div className={styles.stats}>
            <div className={styles.stat}><span className={styles.lbl}>Trend</span><span className={styles.val} style={{ color: trend > 0 ? 'var(--accent)' : trend < 0 ? 'var(--amber)' : 'var(--muted-strong)' }}>{trend > 0 ? `▲ +${trend}` : trend < 0 ? `▼ ${trend}` : '— 0'}</span></div>
            <div className={styles.stat}><span className={styles.lbl}>Best</span><span className={styles.val} style={{ color: 'var(--mint)' }}>{best}</span></div>
            <div className={styles.stat}><span className={styles.lbl}>Logged</span><span className={styles.val}>{pts.length}{n === Infinity ? ' days' : ` / ${n}`}</span></div>
          </div>

          <div className={styles.minis}>
            {minis.map(m => (
              <Mini key={m.name} name={m.name} unit={m.unit} values={hWin.map(m.get).filter((v): v is number => v != null)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
