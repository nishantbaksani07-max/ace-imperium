'use client'

import styles from './water.module.css'
import type { WaterState } from './types'
import { getLocalDateKey } from '@/lib/dates'

interface Props {
  state: WaterState
  targetUnits: number
}

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function pastDays(n: number): { date: Date; key: string }[] {
  const arr: { date: Date; key: string }[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    arr.push({ date: d, key: getLocalDateKey(d) })
  }
  return arr
}

/**
 * 14-day history card.
 *  - Sparkline: 14 vertical bars on a shared scale (max of target / max log).
 *    Dashed mint target line drawn across at the target Y. Days that hit the
 *    target render in mint, misses in muted/red.
 *  - List: the 7 most recent days (excluding today) as a row of date · bar · count/target.
 *
 * Empty state: if zero logs across the window, show a single editorial line
 * instead of all-red bars (would feel discouraging on a brand-new account).
 */
export default function HistoryCard({ state, targetUnits }: Props) {
  const days14 = pastDays(14)
  const counts = days14.map(d => state.logs[d.key] || 0)
  const hasAnyData = counts.some(c => c > 0)

  const maxVal = Math.max(targetUnits, ...counts) || 1
  const W = 280
  const H = 70
  const pad = 4
  const colW = (W - pad * 2) / counts.length
  const barW = colW * 0.7
  const targetY = H - pad - (targetUnits / maxVal) * (H - pad * 2)

  const todayKey = getLocalDateKey()
  const list = days14
    .filter(d => d.key !== todayKey)
    .slice(-7)
    .map(d => ({ date: d.date, key: d.key, count: state.logs[d.key] || 0 }))

  return (
    <section className={styles.histCard}>
      <span className={styles.heroEyebrow}>Last 14 days</span>

      {hasAnyData ? (
        <>
          <div className={styles.sparkWrap}>
            <svg
              className={styles.sparkSvg}
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              aria-hidden
            >
              <line
                className={styles.sparkTarget}
                x1={0}
                x2={W}
                y1={targetY}
                y2={targetY}
              />
              {counts.map((v, i) => {
                const x = pad + i * colW + (colW - barW) / 2
                const h = (v / maxVal) * (H - pad * 2)
                const y = H - pad - h
                const hit = v >= targetUnits && v > 0
                return (
                  <rect
                    key={i}
                    className={`${styles.sparkBar} ${hit ? styles.sparkBarHit : styles.sparkBarMiss}`}
                    x={x.toFixed(1)}
                    y={y.toFixed(1)}
                    width={barW.toFixed(1)}
                    height={Math.max(0, h).toFixed(1)}
                    rx={2}
                  />
                )
              })}
            </svg>
          </div>

          <div className={styles.histList}>
            {list.map(({ date, key, count }) => {
              const label = `${DOW_SHORT[date.getDay()]} ${date.getMonth() + 1}/${date.getDate()}`
              const pct = Math.min(100, (count / targetUnits) * 100)
              const hit = count >= targetUnits && count > 0
              return (
                <div key={key} className={styles.histRow}>
                  <span className={styles.histDate}>{label}</span>
                  <div className={styles.histBarWrap}>
                    <div
                      className={`${styles.histBarFill} ${hit ? '' : styles.histBarMiss}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className={styles.histCount}>{count}/{targetUnits}</span>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <p className={styles.histEmpty}>Log a few days and the chart fills in.</p>
      )}
    </section>
  )
}
