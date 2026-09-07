'use client'

import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import type { Tier } from '@/lib/vitals/score'
import { TIER_PIPS, TIER_WORD, TIER_COLOR } from './tierMeta'
import { RATING_REF } from './ratingRef'
import styles from './ratingSheet.module.css'

const TIER_ORDER: Tier[] = ['needs-care', 'low', 'steady', 'strong', 'peak']

/**
 * The per-metric rating reference. Tap a tile's rating and this explains what
 * the rating means for THAT metric: the good direction (↑/↓/↔), a five-rung
 * ladder with a "you" marker at the current tier, and a warm note. Reuses the
 * shared tier metadata so the pips + words match the tiles exactly.
 */
export default function RatingSheet({
  name,
  tier,
  onClose,
}: {
  name: string
  tier: Tier
  onClose: () => void
}) {
  const ref = RATING_REF[name]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!ref) return null

  return (
    <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={`${name} rating`}>
        <div className={styles.grab} aria-hidden />

        <div className={styles.top}>
          <div>
            <div className={styles.name}>{name}</div>
            <div className={styles.measure}>{ref.measure[0].toUpperCase() + ref.measure.slice(1)}.</div>
          </div>
          <button className={styles.close} onClick={onClose} aria-label="close">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
              <path d="M6 6 18 18M18 6 6 18" />
            </svg>
          </button>
        </div>

        <span className={styles.dir}>
          <span className={styles.ar}>{ref.dir.ar}</span>
          {ref.dir.text}
        </span>

        <div className={styles.ladder}>
          {[...TIER_ORDER].reverse().map((t, k) => {
            const cur = t === tier
            const style = { ['--tc']: TIER_COLOR[t], animationDelay: `${k * 55}ms` } as CSSProperties
            return (
              <div
                key={t}
                className={`${styles.rung}${cur ? ' ' + styles.cur : ''}`}
                data-tier={t}
                style={style}
              >
                <span className={styles.pips} aria-hidden>
                  {[1, 2, 3, 4, 5].map(i => (
                    <span key={i} className={`${styles.pip}${i <= TIER_PIPS[t] ? ' ' + styles.pipOn : ''}`} />
                  ))}
                </span>
                <span className={styles.word}>{TIER_WORD[t]}</span>
                <span className={styles.mean}>{ref.ladder[t]}</span>
                {cur && <span className={styles.you}>you</span>}
              </div>
            )
          })}
        </div>

        <p className={styles.note}>{ref.note}</p>
      </div>
    </div>
  )
}
