'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import styles from './brand.module.css'

/**
 * Centered popup that every feature panel opens into — one focused overview at a
 * time instead of panels stacking down the page. Closes on the ✕, a backdrop
 * click, or Escape; locks body scroll while open. Portalled to <body> so it
 * escapes the brand page's stacking / overflow contexts.
 */
export default function FeatureModal({
  title, onClose, children, style,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  /** Accent CSS vars (accentVars) — passed in because the portal escapes the
   *  brand <main> where those vars are scoped. */
  style?: React.CSSProperties
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label={title} onClick={onClose} style={style}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <header className={styles.modalHead}>
          <span className={styles.modalTitle}>{title}</span>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className={styles.modalBody}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}
