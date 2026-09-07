'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import styles from './tuneCoachmark.module.css'

/**
 * First-run explainer for the per-lift "Tune" control on setup Step 3 ("Pick
 * exercises"). When a user opens a day to edit it, each lift shows a "Tune"
 * button and nothing signals that the weights are theirs to set. This one-time
 * centered card (blurred backdrop, mirrors NewWeekConfirm) names the feature,
 * points at the exact button, and explains you dial in weight/sets/reps for
 * each lift to finish. Shown once ever.
 */
export default function TuneCoachmark({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' || e.key === 'Enter') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="How to tune your lifts">
      <div className={styles.sheet} onClick={e => e.stopPropagation()}>
        <span className={styles.seal} aria-hidden>
          {/* sliders — the universal "adjust / tune" mark */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7h9m4 0h3M4 17h3m4 0h9" />
            <circle cx="15" cy="7" r="2.3" fill="#07100c" />
            <circle cx="9" cy="17" r="2.3" fill="#07100c" />
          </svg>
        </span>

        <span className={styles.eyebrow}>your last step</span>
        <h2 className={styles.title}>Dial in every lift</h2>
        <p className={styles.why}>
          Each lift comes pre-filled with a smart starting weight. Make it yours: tap
          <b> Tune</b> on a lift to set your exact working weight, sets, and reps.
        </p>

        {/* A mock of a Step 3 lift row, with its Tune button lit like the real one. */}
        <div className={styles.pillDemo} aria-hidden>
          <span className={styles.demoLiftRow}>
            <span className={styles.demoLiftName}>Barbell bench</span>
            <span className={`${styles.demoTune} ${styles.demoPillLit}`}>Tune</span>
          </span>
          <span className={styles.demoHint}>tap Tune on each lift</span>
        </div>

        <div className={styles.points}>
          <div className={styles.point}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 13l4 4L19 7" /></svg>
            <span>Set your <b>weight, sets &amp; reps</b> per lift</span>
          </div>
          <div className={styles.point}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 13l4 4L19 7" /></svg>
            <span>Tune <b>every lift</b> to finish your setup</span>
          </div>
        </div>

        <button type="button" className={styles.confirm} onClick={onClose} autoFocus>
          Got it
        </button>
      </div>
    </div>,
    document.body,
  )
}
