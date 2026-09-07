import type { CSSProperties } from 'react'
import { tierForScore, type Tier } from '@/lib/vitals/score'
import { TIER_PIPS, TIER_WORD, TIER_COLOR, TIER_WEIGHT } from './tierMeta'
import styles from './tierMeter.module.css'

/**
 * The colorblind-safe tier indicator: a five-segment pip meter (count = tier)
 * plus the tier word. Hue only reinforces. Pass a 0-100 `score` or an explicit
 * `tier`. `word={false}` renders just the pips (e.g. inside a small caption).
 */
export default function TierMeter({
  score,
  tier,
  word = true,
  className,
}: {
  score?: number | null
  tier?: Tier | null
  word?: boolean
  className?: string
}) {
  const t: Tier | null = tier ?? (score == null ? null : tierForScore(score))
  if (!t) return null

  const n = TIER_PIPS[t]
  const peak = t === 'peak'
  const style = { ['--tc']: TIER_COLOR[t] } as CSSProperties

  return (
    <span className={`${styles.tier}${className ? ' ' + className : ''}`} style={style}>
      <span className={styles.pips} aria-hidden>
        {[1, 2, 3, 4, 5].map(i => (
          <span
            key={i}
            className={`${styles.pip}${i <= n ? ' ' + styles.on : ''}${peak && i <= n ? ' ' + styles.glow : ''}`}
            style={{ animationDelay: `${(i - 1) * 50}ms` }}
          />
        ))}
      </span>
      {word && (
        <span className={styles.word} style={{ fontWeight: TIER_WEIGHT[t] }}>
          {TIER_WORD[t]}
        </span>
      )}
    </span>
  )
}
