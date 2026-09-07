'use client'

import { useEffect, useState, type ReactNode } from 'react'
import styles from './CozyLoader.module.css'
import type { ToneKey, CozyItem } from '@/lib/cozy/types'

export type { ToneKey, CozyItem } from '@/lib/cozy/types'

/**
 * CozyLoader — Vitality's reusable "Pop / cozy" loading treatment.
 *
 * Generalized 1:1 from the macro tracker's PendingMealCard (the look Alex loves).
 * Five things make the mechanic, all preserved here:
 *   1. A playful TAG bounces in (rotates through `tags`).
 *   2. The CONTENT springs up under it (bounce ease), one phrase color-emphasized.
 *   3. The WHOLE CARD tints to the item's `tone` (border, tag, bar, dots, highlight)
 *      via the `data-tone` attribute, cross-fading to the next item every interval.
 *   4. Three DOTS pulse.
 *   5. Fully reduced-motion safe (animations off, content still shows).
 *
 * Drop it into any waiting / empty / delight moment with its own content set.
 */

export interface CozyLoaderProps {
  /** The pool of lines to rotate through (facts, affirmations, tips...). */
  items: CozyItem[]
  /** Playful rotating tags (e.g. ['Fuel fact', 'Hot take']). Hidden if omitted. */
  tags?: string[]
  /** Persistent header line (e.g. "Analyzing your photo…"). Optional. */
  title?: string
  /** Optional thumbnail / shimmer placeholder slot on the left. */
  leading?: ReactNode
  /** The sliding shimmer progress bar. Default true. */
  showProgress?: boolean
  /** The pulsing dots. Default true. */
  showDots?: boolean
  /** Milliseconds between item swaps. Default 3200. */
  intervalMs?: number
  /** Renders a cancel "×" in the top-right when provided. */
  onCancel?: () => void
  /** Extra class on the root, for layout tweaks at the call site. */
  className?: string
}

function pickNext(length: number, current: number): number {
  if (length <= 1) return 0
  let next = current
  while (next === current) next = Math.floor(Math.random() * length)
  return next
}

export default function CozyLoader({
  items,
  tags,
  title,
  leading,
  showProgress = true,
  showDots = true,
  intervalMs = 3200,
  onCancel,
  className,
}: CozyLoaderProps) {
  // First render is deterministic (index 0) to avoid an SSR hydration mismatch;
  // randomization starts once mounted. `tick` re-keys the tag + text so the pop
  // animation replays on every swap.
  const [idx, setIdx] = useState(0)
  const [tagIdx, setTagIdx] = useState(0)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (items.length <= 1 && (!tags || tags.length <= 1)) return
    const t = setInterval(() => {
      setIdx((cur) => pickNext(items.length, cur))
      setTagIdx((cur) => pickNext(tags?.length ?? 0, cur))
      setTick((n) => n + 1)
    }, intervalMs)
    return () => clearInterval(t)
  }, [items.length, tags, intervalMs])

  if (items.length === 0) return null

  const item = items[Math.min(idx, items.length - 1)]
  const tone: ToneKey = item.tone ?? 'mint'
  const tag = tags && tags.length > 0 ? tags[Math.min(tagIdx, tags.length - 1)] : null

  const hlIdx = item.highlight ? item.text.indexOf(item.highlight) : -1

  return (
    <article className={`${styles.loader}${className ? ` ${className}` : ''}`} data-tone={tone} aria-live="polite">
      {leading != null && <div className={styles.leading}>{leading}</div>}

      <div className={styles.body}>
        {(title || onCancel) && (
          <div className={styles.top}>
            {title ? <span className={styles.title}>{title}</span> : <span />}
            {onCancel && (
              <button className={styles.cancel} onClick={onCancel} aria-label="Cancel">
                ×
              </button>
            )}
          </div>
        )}

        {showProgress && (
          <div className={styles.bar} aria-hidden>
            <span />
          </div>
        )}

        <div className={styles.fact}>
          {tag && (
            <span key={`tag${tick}`} className={styles.tag}>
              {tag}
            </span>
          )}
          <p key={`text${tick}`} className={styles.text}>
            {hlIdx < 0 || !item.highlight ? (
              item.text
            ) : (
              <>
                {item.text.slice(0, hlIdx)}
                <span className={styles.hl}>{item.highlight}</span>
                {item.text.slice(hlIdx + item.highlight.length)}
              </>
            )}
          </p>
          {showDots && (
            <div className={styles.dots} aria-hidden>
              <i />
              <i />
              <i />
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
