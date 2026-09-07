'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import VitalityIcon from '@/components/VitalityIcon'
import { kgToDisplay, unitLabel, type Units } from '@/lib/units'
import type { GoalBand } from '@/lib/nutrition/adaptive'
import styles from '../fuelSections.module.css'

interface Props {
  /** Smoothed (7-day MA) weight series from computeTrendRate, oldest -> newest. */
  smoothed: { date: string; avgKg: number }[]
  /** Daily calorie totals, oldest -> newest (for the bars under the line). */
  dailyKcal: { dayKey: string; kcal: number }[]
  band: GoalBand
  units: Units
  maintenanceKcal: number | null
  weeklyRateKg: number | null
  /** 'hero' = the big, scrubbable, explained lane chart that leads the nudge.
   *  'full' = the calm-week expand (lane + calorie bars + chips + deep link). */
  variant?: 'hero' | 'full'
}

function parse(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtDate(key: string): string {
  const [, m, d] = key.split('-').map(Number)
  return `${MON[m - 1]} ${d}`
}

const W = 520
const H = 116

/** One scrubbable point: pixel position (as %) + the numbers to read out. */
interface Row {
  leftPct: number
  topPct: number
  xv: number
  value: number
  dateKey: string
  dir: 'above' | 'below' | 'in'
  gap: number
}

interface AxisTick {
  yv: number
  topPct: number
  label: number
}

/**
 * The trend card: the smoothed weight line riding inside a shaded goal path (a
 * cone from the user's start at their goal rate). Pure presentational. All
 * weights render in the user's unit (never kg).
 *
 * The hero variant is built to be understood at a glance by a first-timer: a
 * plain caption, a weight axis + time anchors (so the line reads as pounds over
 * time at rest), and a color key that says what each line MEANS. It is also
 * scrubbable (Apple-Stocks style): drag/hover and a readout shows that day's
 * weight, date, and how far off the path it was, with a crosshair + ringed dot.
 */
export default function TrendCard({ smoothed, dailyKcal, band, units, maintenanceKcal, weeklyRateKg, variant = 'full' }: Props) {
  const router = useRouter()
  const hero = variant === 'hero'
  const pts = smoothed.slice(-28)
  const u = unitLabel(units)

  const [active, setActive] = useState<number | null>(null)
  const downRef = useRef(false)
  const boxRef = useRef<HTMLDivElement>(null)

  let chart: React.ReactNode = null
  let rows: Row[] = []
  let axisTicks: AxisTick[] = []
  let startLabel = ''
  if (pts.length >= 2) {
    const t0 = parse(pts[0].date)
    const spanDays = (parse(pts[pts.length - 1].date) - t0) / 86_400_000
    const span = Math.max(1, spanDays)
    const weeks = (i: number) => (parse(pts[i].date) - t0) / 86_400_000 / 7
    const x = (i: number) => ((parse(pts[i].date) - t0) / 86_400_000 / span) * W
    const first = pts[0].avgKg
    const laneLow = pts.map((_, i) => first + band.lowKgPerWeek * weeks(i))
    const laneHigh = pts.map((_, i) => first + band.highKgPerWeek * weeks(i))
    const ys = [...pts.map((p) => p.avgKg), ...laneLow, ...laneHigh]
    const lo = Math.min(...ys)
    const hi = Math.max(...ys)
    const pad = (hi - lo) * 0.18 || 1
    const y = (kg: number) => H - ((kg - (lo - pad)) / (hi - lo + pad * 2)) * H
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.avgKg).toFixed(1)}`).join(' ')
    const laneTop = pts.map((_, i) => `${x(i).toFixed(1)},${y(laneHigh[i]).toFixed(1)}`)
    const laneBot = pts.map((_, i) => `${x(i).toFixed(1)},${y(laneLow[i]).toFixed(1)}`)
    const lanePath = `M${laneTop.join(' L')} L${laneBot.reverse().join(' L')} Z`
    const lastY = y(pts[pts.length - 1].avgKg)
    const vbH = hero ? H + 8 : H + 34

    // calorie bars under the line (own scale) — only on the full/calm card
    const bars = dailyKcal.slice(-28)
    const maxKcal = Math.max(1, ...bars.map((b) => b.kcal))

    // per-point readout rows (hero scrub)
    rows = pts.map((p, i) => {
      const a = laneHigh[i]
      const b = laneLow[i]
      const top = Math.max(a, b)
      const bot = Math.min(a, b)
      let dir: 'above' | 'below' | 'in'
      let gap: number
      if (p.avgKg > top) {
        dir = 'above'
        gap = p.avgKg - top
      } else if (p.avgKg < bot) {
        dir = 'below'
        gap = bot - p.avgKg
      } else {
        dir = 'in'
        gap = 0
      }
      return { leftPct: (x(i) / W) * 100, topPct: (y(p.avgKg) / vbH) * 100, xv: x(i), value: kgToDisplay(p.avgKg, units), dateKey: p.date, dir, gap }
    })

    // weight axis (hero): 3 faint gridlines labeled in display units, deduped
    if (hero) {
      const domLo = lo - pad
      const domHi = hi + pad
      const seen = new Set<number>()
      for (const t of [0.82, 0.5, 0.18]) {
        const kg = domLo + t * (domHi - domLo)
        const label = Math.round(kgToDisplay(kg, units))
        if (seen.has(label)) continue
        seen.add(label)
        axisTicks.push({ yv: y(kg), topPct: (y(kg) / vbH) * 100, label })
      }
      const weeksN = Math.max(1, Math.round(spanDays / 7))
      startLabel = spanDays < 11 ? `${Math.max(1, Math.round(spanDays))} days ago` : `${weeksN} weeks ago`
    }

    chart = (
      <svg viewBox={`0 0 ${W} ${vbH}`} width="100%" height={hero ? 168 : 150} preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="mLaneFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="rgba(110,231,183,.16)" />
            <stop offset="1" stopColor="rgba(110,231,183,.04)" />
          </linearGradient>
        </defs>
        {hero && axisTicks.map((t, i) => <line key={`g${i}`} x1="0" y1={t.yv} x2={W} y2={t.yv} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />)}
        <path d={lanePath} fill="url(#mLaneFill)" />
        <polyline points={laneTop.join(' ')} fill="none" stroke="rgba(110,231,183,.35)" strokeWidth="1" strokeDasharray="4 5" />
        <polyline points={laneBot.join(' ')} fill="none" stroke="rgba(110,231,183,.35)" strokeWidth="1" strokeDasharray="4 5" />
        <path d={line} fill="none" stroke="#6ee7b7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(pts.length - 1)} cy={lastY} r="4" fill="#6ee7b7" />
        {!hero && (
          <g opacity=".42">
            {bars.map((b, i) => {
              const bw = W / bars.length
              const bh = Math.max(3, (b.kcal / maxKcal) * 28)
              return <rect key={b.dayKey} x={i * bw + bw * 0.2} y={H + 32 - bh} width={bw * 0.6} height={bh} rx="2" fill="rgba(110,231,183,.5)" />
            })}
          </g>
        )}
      </svg>
    )
  }

  // pointer → nearest data point
  function pick(clientX: number) {
    const el = boxRef.current
    if (!el || rows.length === 0) return
    const r = el.getBoundingClientRect()
    const tx = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * W
    let best = 0
    let bd = Infinity
    for (let i = 0; i < rows.length; i++) {
      const d = Math.abs(rows[i].xv - tx)
      if (d < bd) {
        bd = d
        best = i
      }
    }
    setActive(best)
  }

  const sel = rows.length ? Math.min(active ?? rows.length - 1, rows.length - 1) : -1
  const selRow = sel >= 0 ? rows[sel] : null
  const scrubbing = active !== null

  const rateChip =
    weeklyRateKg != null
      ? `${weeklyRateKg >= 0 ? '+' : ''}${kgToDisplay(weeklyRateKg, units)} ${u}/wk`
      : null

  return (
    <div className={styles.mTrend}>
      {hero && selRow && (
        <p className={styles.mCaption}>
          Your <b>weight over time</b> vs your <b>goal lane</b>. Stay inside the lane to arrive on time.
        </p>
      )}

      {hero && selRow && (
        <div className={styles.mReadout}>
          <div className={styles.mReadMain}>
            <span className={styles.mReadVal}>{selRow.value.toLocaleString()}</span>
            <span className={styles.mReadUnit}>{u}</span>
            <span className={styles.mReadDate}>· {scrubbing ? fmtDate(selRow.dateKey) : 'now'}</span>
          </div>
          <span className={`${styles.mReadChip} ${selRow.dir === 'in' ? styles.mReadChipOk : ''}`}>
            <i />
            {selRow.dir === 'in' ? 'on track' : `${kgToDisplay(selRow.gap, units)} ${u} ${selRow.dir} lane`}
          </span>
        </div>
      )}

      <div className={styles.mChartWrap}>
        {!hero && <span className={styles.mLaneTag}>your goal lane</span>}
        {hero ? (
          <>
            <div
              ref={boxRef}
              className={styles.mChartBox}
              onPointerDown={(e) => {
                downRef.current = true
                e.currentTarget.setPointerCapture(e.pointerId)
                pick(e.clientX)
              }}
              onPointerMove={(e) => {
                if (downRef.current || e.pointerType === 'mouse') pick(e.clientX)
              }}
              onPointerUp={() => {
                downRef.current = false
                setActive(null)
              }}
              onPointerCancel={() => {
                downRef.current = false
                setActive(null)
              }}
              onPointerLeave={() => {
                if (!downRef.current) setActive(null)
              }}
            >
              {chart}
              {axisTicks.map((t, i) => (
                <span key={`t${i}`} className={styles.mAxisLbl} style={{ top: `${t.topPct}%` }}>
                  {t.label} {u}
                </span>
              ))}
              {selRow && scrubbing && (
                <>
                  <span className={styles.mCross} style={{ left: `${selRow.leftPct}%` }} />
                  <span className={styles.mDotLive} style={{ left: `${selRow.leftPct}%`, top: `${selRow.topPct}%` }} />
                </>
              )}
            </div>
            {selRow && (
              <div className={styles.mXaxis}>
                <span>{startLabel}</span>
                <span>now</span>
              </div>
            )}
          </>
        ) : (
          chart
        )}
      </div>

      {hero && selRow && (
        <div className={styles.mKey}>
          <span className={styles.mKeyRow}>
            <span className={styles.mKeySw} />
            <span>
              <b>You</b> <span className={styles.km}>your real weight, smoothed day to day</span>
            </span>
          </span>
          <span className={styles.mKeyRow}>
            <span className={`${styles.mKeySw} ${styles.mKeySwZone}`} />
            <span>
              <b>Goal lane</b> <span className={styles.km}>the zone that keeps you on pace</span>
            </span>
          </span>
        </div>
      )}

      {!hero && (
        <>
          <div className={styles.mChips}>
            {maintenanceKcal != null && (
              <span className={styles.mChip}>
                maintenance <b>~{maintenanceKcal.toLocaleString()} kcal</b>, sharpening
              </span>
            )}
            {rateChip && (
              <span className={styles.mChip}>
                this week <b>{rateChip}</b>
              </span>
            )}
          </div>
          <button className={styles.mSee} onClick={() => router.push('/app/fitness/progress')}>
            See full chart
            <VitalityIcon name="week" size={13} />
          </button>
        </>
      )}
    </div>
  )
}
