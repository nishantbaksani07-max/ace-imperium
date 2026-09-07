'use client'

import styles from './peak.module.css'
import { fmtClockShort, type DayItem } from './dayModel'

/**
 * "NOW · RUNNING" + "UP NEXT" overview — what you're in right now and what's
 * coming, derived from the timed items + the ticking clock. (design `.c-now`)
 */
export default function NowPanel({ items, now }: { items: DayItem[]; now: number }) {
  const timed = items
    .filter((i) => i.start != null)
    .sort((a, b) => (a.start as number) - (b.start as number))

  const current = timed.find((i) => (i.start as number) <= now && (i.end ?? (i.start as number) + 1) > now) || null
  const next = timed.find((i) => (i.start as number) > now) || null

  return (
    <div className={styles.cNow}>
      <div className={`${styles.cNowLab} ${styles.mono}`}>
        ▍ NOW{current ? ' · RUNNING' : ' · OPEN'}
      </div>
      <h3 className={styles.cNowName}>{current ? current.name : 'Open block'}</h3>
      {current && (
        <div className={`${styles.cNowTime} ${styles.mono}`}>
          {fmtClockShort(current.start as number)} → {fmtClockShort(current.end ?? (current.start as number) + 1)}
          <i className={styles.cCaret} aria-hidden />
        </div>
      )}
      <div className={styles.cNext}>
        <span className={`${styles.cNextLab} ${styles.mono}`}>UP NEXT</span>
        {next ? (
          <div className={styles.cNextRow}>
            <i className={styles.cNextDot} style={{ background: next.color }} aria-hidden />
            <span className={styles.cNextName}>{next.name}</span>
            <span className={`${styles.cNextTime} ${styles.mono}`}>{fmtClockShort(next.start as number)}</span>
          </div>
        ) : (
          <div className={styles.cNextRow}>
            <span className={`${styles.cNextNone} ${styles.mono}`}>nothing scheduled</span>
          </div>
        )}
      </div>
    </div>
  )
}
