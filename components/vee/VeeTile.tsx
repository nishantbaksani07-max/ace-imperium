'use client'

import { useState, type ReactNode } from 'react'
import styles from './veeTile.module.css'

const EchoMark = (
  <span className={styles.echo} aria-hidden>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7l7 11 7-11" /></svg>
  </span>
)

export default function VeeTile({ tag, children, className }: { tag: string; children: ReactNode; className?: string }) {
  // Once the tile's OWN entrance animation finishes, flatten it: the entrance
  // keyframes hold a transform/filter via fill-mode (eFade ends on filter:blur,
  // eUnfold on perspective), which keeps the card on a GPU layer. A later
  // re-render (answering an option) makes Chrome re-rasterize that layer = a
  // one-frame "card blanks and comes back" flash. `.tileSettled` drops the
  // animation + held transform/filter so there is no layer left to churn. We
  // gate on target===currentTarget so child reveal animations (which bubble)
  // don't trip it, and we never touch the children's own animations (the key
  // word reveal must keep running, or it reverts to its opacity:0 resting state).
  const [settled, setSettled] = useState(false)
  return (
    <div
      className={`${styles.tile}${className ? ` ${className}` : ''}${settled ? ` ${styles.tileSettled}` : ''}`}
      onAnimationEnd={(e) => { if (e.target === e.currentTarget) setSettled(true) }}
    >
      <div className={styles.top}>{EchoMark}<span className={styles.tag}>{tag}</span></div>
      <div className={styles.body}>{children}</div>
    </div>
  )
}
