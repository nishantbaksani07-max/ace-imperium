'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './driftCard.module.css'
import { logDriftShown, resolveDrift } from './driftActions'
import type { DriftKind, DriftResolution } from '@/lib/goals/drift'

/**
 * DriftCard — Vee's warm outreach when it notices you slipping (BUILD42 flagship).
 * Reaches out FIRST, before the user does. On mount it logs that it was shown
 * (cooldown). The three responses (grace / ease / talk) all rest the nudge and
 * are always honest. "Talk to me" hands off to the chat right below.
 */

const RESOLVE_COPY: Record<DriftResolution, [string, string]> = {
  graced: ['Graced. We are good.', 'Rest, then come back when you can. I will be right here.'],
  shrunk: ['Eased for this week.', 'Smaller is still a vote for who you are. We can grow it back when life settles.'],
  talk: ['Okay. Let us talk.', 'I am right here below. Tell me what is really going on, no pressure.'],
}

export default function DriftCard({
  kind,
  line,
  sub,
  onTalk,
}: {
  kind: DriftKind
  line: string
  sub: string
  onTalk?: () => void
}) {
  const [resolved, setResolved] = useState<DriftResolution | null>(null)
  const logged = useRef(false)

  // Record that this nudge was surfaced (cooldown keeps Vee present, not naggy).
  useEffect(() => {
    if (logged.current) return
    logged.current = true
    void logDriftShown(kind)
  }, [kind])

  function resolve(r: DriftResolution) {
    setResolved(r)
    void resolveDrift(kind, r)
    if (r === 'talk') onTalk?.()
  }

  return (
    <section className={`${styles.nudge} ${resolved ? styles.nudgeResolved : ''}`} aria-label="a note from Vee">
      <span className={styles.who}>{resolved ? 'Vee' : 'Vee noticed'}</span>
      {resolved ? (
        <>
          <p className={styles.line}>{RESOLVE_COPY[resolved][0]}</p>
          <p className={styles.p}>{RESOLVE_COPY[resolved][1]}</p>
        </>
      ) : (
        <>
          <p className={styles.line}>{line}</p>
          <p className={styles.p}>{sub}</p>
          <div className={styles.sparkRow}>
            <button type="button" className={`${styles.spark} ${styles.sparkWarm}`} onClick={() => resolve('graced')}>
              <svg width="16" height="16" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M-8 1 C-8 -7 0 -9 0 -3 C0 -9 8 -7 8 1 L0 9 Z" /></svg>
              Give me grace
            </button>
            <button type="button" className={`${styles.spark} ${styles.sparkIris}`} onClick={() => resolve('shrunk')}>
              <svg width="16" height="16" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M-9 0 H9" /><path d="M-9 0 l5 -5 M-9 0 l5 5" /></svg>
              Ease this week
            </button>
            <button type="button" className={styles.spark} onClick={() => resolve('talk')}>
              <svg width="16" height="16" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M-9 -6 h18 v11 h-11 l-5 5 z" /></svg>
              Talk to me
            </button>
          </div>
        </>
      )}
    </section>
  )
}
