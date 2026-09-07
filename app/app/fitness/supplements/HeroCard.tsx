'use client'

import styles from './supplements.module.css'

interface Props {
  takenCount: number
  totalCount: number
  missedCount: number
  lowCount: number
}

/**
 * Top-of-page progress strip. Same eyebrow + count + bar pattern as
 * the water hero, simplified — supplements don't need a circular ring,
 * just "how close to done are you?"
 *
 * Drops to a soft empty-state copy when the user has nothing in the
 * stack yet (so the bar isn't an accusatory 0 / 0).
 */
export default function HeroCard({ takenCount, totalCount, missedCount, lowCount }: Props) {
  const pct = totalCount === 0 ? 0 : Math.min(100, (takenCount / totalCount) * 100)
  const hitAll = totalCount > 0 && takenCount >= totalCount

  let helper: string
  let helperGood = false
  if (totalCount === 0) {
    helper = 'Add a few supplements below to start your stack.'
  } else if (takenCount === 0) {
    helper = 'Nothing logged yet today.'
  } else if (hitAll) {
    helper = 'Stack complete for today.'
    helperGood = true
  } else {
    const remaining = totalCount - takenCount
    helper = `${remaining} left to take today.`
  }

  return (
    <section className={styles.heroCard}>
      <span className={styles.heroEyebrow}>
        <span className={styles.heroEyebrowMark}>·01</span>
        <span className={styles.heroEyebrowRule} />
        Today
      </span>

      <div className={styles.heroNumWrap}>
        <span className={styles.heroNum}>{takenCount}</span>
        <span className={styles.heroNumSlash}> / </span>
        <span className={styles.heroNumTotal}>{totalCount || '—'}</span>
      </div>

      <div className={styles.progressTrack} aria-hidden>
        <div
          className={`${styles.progressFill} ${hitAll ? styles.progressFillDone : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className={`${styles.helper} ${helperGood ? styles.helperGood : ''}`}>
        {helper}
      </p>

      {(missedCount > 0 || lowCount > 0) && (
        <div className={styles.heroFlags}>
          {missedCount > 0 && (
            <span className={`${styles.flagPill} ${styles.flagMissed}`}>
              {missedCount} missed
            </span>
          )}
          {lowCount > 0 && (
            <span className={`${styles.flagPill} ${styles.flagLow}`}>
              {lowCount} running low
            </span>
          )}
        </div>
      )}
    </section>
  )
}
