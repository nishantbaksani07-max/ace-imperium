'use client'

import { Fragment, type CSSProperties } from 'react'
import styles from './RevealText.module.css'

/**
 * RevealText — cozy word-bloom reveal for the Echo coach.
 *
 * Splits text into words that rise and fade in on a gentle stagger. One phrase
 * (the `highlight`, or auto-detected key number if none is given) blooms in mint
 * and gets a marker swipe. Animates on mount, so render it with a `key` that
 * changes per message and it replays for each new answer. Reduced-motion safe.
 */

interface RevealTextProps {
  text: string
  /** Exact phrase to emphasize. If omitted, the first number+unit is used.
   *  Pass an empty string to disable auto-emphasis entirely. */
  highlight?: string
  /** Emphasize with a mint GLOW (color + soft halo) instead of the marker band.
   *  Use for hero titles / brand words; the band suits body copy. */
  glow?: boolean
  /** Element to render as. Defaults to a paragraph. Use 'h1'/'h2' for titles. */
  as?: 'p' | 'h1' | 'h2' | 'h3' | 'span'
  /** Delay (ms) added before the whole reveal starts — stagger after a sibling. */
  delay?: number
  className?: string
}

// First number with a unit (135g, 1659 kcal, 80%, 18/180) — coach answers are
// number-led, so this is almost always the load-bearing phrase.
const NUMBER_RE = /\d[\d.,]*\s?(?:g|kcal|kg|lb|%)|\d[\d.,]*\s?\/\s?\d[\d.,]*/i

function resolveHighlight(text: string, highlight?: string): string | null {
  if (highlight === '') return null              // explicit opt-out
  if (highlight && text.includes(highlight)) return highlight
  if (highlight) return null                     // requested phrase absent → no emphasis
  const m = text.match(NUMBER_RE)
  return m ? m[0] : null
}

export default function RevealText({ text, highlight, glow, as = 'p', delay = 0, className }: RevealTextProps) {
  const hl = resolveHighlight(text, highlight)
  const Tag = as
  const hlClass = glow ? styles.hlGlow : styles.hl

  // Build [before words…, highlight (one unit), after words…]
  const items: { t: string; hl: boolean }[] = []
  if (hl) {
    const i = text.indexOf(hl)
    text.slice(0, i).split(/\s+/).filter(Boolean).forEach((t) => items.push({ t, hl: false }))
    items.push({ t: hl, hl: true })
    text.slice(i + hl.length).split(/\s+/).filter(Boolean).forEach((t) => items.push({ t, hl: false }))
  } else {
    text.split(/\s+/).filter(Boolean).forEach((t) => items.push({ t, hl: false }))
  }

  const count = items.length || 1
  const step = Math.min(40, Math.round(1100 / count))

  return (
    <Tag className={`${styles.reveal}${className ? ` ${className}` : ''}`}>
      {items.map((it, i) => {
        const wd = delay + i * step
        const style = { '--wd': `${wd}ms`, '--mk': `${wd + 260}ms` } as CSSProperties
        return (
          <Fragment key={i}>
            <span className={`${styles.word}${it.hl ? ` ${hlClass}` : ''}`} style={style}>
              {it.t}
            </span>
            {i < items.length - 1 ? ' ' : ''}
          </Fragment>
        )
      })}
    </Tag>
  )
}
