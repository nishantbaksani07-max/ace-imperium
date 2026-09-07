'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './deloadConfirm.module.css'

interface DeloadConfirmProps {
  /** Training day names in the split (rest days excluded) — shown as the pass
   *  that will be eased, e.g. Push · Pull · Legs. */
  dayNames: string[]
  /** Confirm: start the deload. May be async; the button shows a working state. */
  onConfirm: () => void | Promise<void>
  onClose: () => void
}

/**
 * Deload confirm sheet — the one explainer before starting a light week.
 *
 * Opened from the off-day sheet's third option and from the tucked "Take a
 * deload week" entry. States the why warmly, shows which pass eases, the
 * concrete change, and the baseline-safe reassurance. Honest framing: a deload
 * is recovery so the next block lands, never a growth booster.
 */
export default function DeloadConfirm({ dayNames, onConfirm, onClose }: DeloadConfirmProps) {
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

  const days = dayNames.length > 0 ? dayNames : ['your split']

  return createPortal(
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="Deload week">
      <div className={styles.sheet} onClick={e => e.stopPropagation()}>
        <span className={styles.eyebrow}>deload</span>
        <h2 className={styles.title}>A lighter week</h2>
        <p className={styles.why}>Recover now so you come back stronger.</p>

        <div className={styles.splitRow}>
          {days.map((d, i) => (
            <div key={`${d}-${i}`} className={styles.dayChip}>
              <span className={styles.dayName}>{d}</span>
              <span className={styles.dayState}>easy</span>
            </div>
          ))}
        </div>

        <div className={styles.change}>
          <div className={styles.changeRow}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 12h7M3 6h12M3 18h5" /></svg>
            <span>Half the sets</span>
          </div>
          <div className={styles.changeRow}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 5v14M5 12l7 7 7-7" /></svg>
            <span>10% lighter</span>
          </div>
          <div className={styles.changeRow}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            <span>Stop a few reps early</span>
          </div>
        </div>

        <div className={styles.safe}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
          <span>Your real weights stay safe.</span>
        </div>

        <button type="button" className={styles.confirm} onClick={confirm} disabled={busy}>
          {busy ? 'Starting…' : 'Take a deload'}
        </button>
        <button type="button" className={styles.cancel} onClick={onClose}>Not right now</button>
      </div>
    </div>,
    document.body,
  )
}
