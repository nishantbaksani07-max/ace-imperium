'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './newWeekConfirm.module.css'

interface NewWeekConfirmProps {
  /** Confirm: start the new week. May be async; the button shows a working state. */
  onConfirm: () => void | Promise<void>
  onClose: () => void
}

/**
 * "Start a new week" confirm sheet — the one explainer before wiping the
 * schedule board to a clean slate. Mint accent (a fresh start / go), matching
 * DeloadConfirm's shape so the two schedule actions feel like siblings.
 *
 * The whole point is reassurance: a reset never deletes anything, every day
 * just goes back to fresh, and it's undoable. Honest framing — this is a clean
 * board, not a loss of data.
 */
export default function NewWeekConfirm({ onConfirm, onClose }: NewWeekConfirmProps) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  if (typeof document === 'undefined') return null

  async function confirm() {
    if (busy) return
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="Start a new week">
      <div className={styles.sheet} onClick={e => e.stopPropagation()}>
        <span className={styles.seal} aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v3m0 12v3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M3 12h3m12 0h3M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1" />
            <circle cx="12" cy="12" r="3.4" />
          </svg>
        </span>
        <span className={styles.eyebrow}>fresh start</span>
        <h2 className={styles.title}>Start a new week?</h2>
        <p className={styles.why}>
          Every day goes back to a clean slate, ready to log fresh. A clear board for a fresh week, whenever you want one.
        </p>

        <div className={styles.points}>
          <div className={styles.point}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 13l4 4L19 7" /></svg>
            <span>Every day back to <b>fresh</b></span>
          </div>
          <div className={styles.point}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 13l4 4L19 7" /></svg>
            <span>Open <b>any day, any time</b></span>
          </div>
        </div>

        <div className={styles.safe}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
          <span>Your history stays safe. Nothing you logged is ever deleted, and you can undo this for the next hour.</span>
        </div>

        <button type="button" className={styles.confirm} onClick={confirm} disabled={busy}>
          {busy ? 'Starting…' : 'Start fresh'}
        </button>
        <button type="button" className={styles.cancel} onClick={onClose}>Not yet</button>
      </div>
    </div>,
    document.body,
  )
}
