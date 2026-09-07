'use client'

import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import type { Signal, SignalLean } from '@/lib/vitals/signal'
import styles from './signalInfoSheet.module.css'

/**
 * Explains Today's Signal: a recover ↔ steady ↔ push spectrum with the user's
 * lean marked, the three states in one line each, and the "Vee reads the same
 * signal" trust line. Deliberately light — the inputs that fed today's call
 * already live on the signal card itself. Renders inside the .page scope so the
 * azure tokens inherit. Colorblind-safe: glyph (▲■◆) + word + position carry it.
 */

const STATES: { key: SignalLean; glyph: string; name: string; mean: string }[] = [
  { key: 'push', glyph: '▲', name: 'push', mean: 'Go harder than usual. Your body can take more.' },
  { key: 'steady', glyph: '■', name: 'steady', mean: 'Train normal and keep the rhythm going.' },
  { key: 'recover', glyph: '◆', name: 'recover', mean: 'Ease off and take a lighter day.' },
]

const MARKER_LEFT: Record<SignalLean, number> = { recover: 12, steady: 50, push: 88 }
const STATE_CLASS: Record<SignalLean, string> = { push: styles.sPush, steady: styles.sSteady, recover: styles.sRecover }

export default function SignalInfoSheet({ signal, onClose }: { signal: Signal; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const markerCls = signal.lean === 'recover' ? styles.amber : signal.lean === 'push' ? styles.mint : ''

  return (
    <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="Today's signal explained">
        <div className={styles.grab} aria-hidden />

        <div className={styles.top}>
          <div>
            <div className={styles.name}>Today&rsquo;s signal</div>
            <div className={styles.measure}>One read across your recovery, sleep, training and fuel. Not one number.</div>
          </div>
          <button className={styles.close} onClick={onClose} aria-label="close">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
              <path d="M6 6 18 18M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className={styles.spectrum}>
          <div className={styles.track}>
            <div className={`${styles.marker} ${markerCls}`} style={{ left: `${MARKER_LEFT[signal.lean]}%` }}>
              <span className={styles.you}>today</span>
            </div>
          </div>
          <div className={styles.labels}>
            <span className={`${styles.label} ${styles.aRecover}`}><span className={styles.g}>◆</span>recover</span>
            <span className={`${styles.label} ${styles.aSteady}`}><span className={styles.g}>■</span>steady</span>
            <span className={`${styles.label} ${styles.aPush}`}><span className={styles.g}>▲</span>push</span>
          </div>
        </div>

        <div className={styles.states}>
          {STATES.map((s, i) => {
            const cur = s.key === signal.lean
            return (
              <div
                key={s.key}
                className={`${styles.state} ${STATE_CLASS[s.key]}${cur ? ' ' + styles.cur : ''}`}
                style={{ animationDelay: `${60 + i * 60}ms` } as CSSProperties}
              >
                <div className={styles.glyph}>{s.glyph}</div>
                <div className={styles.body}>
                  <div className={styles.sName}>{s.name}{cur && <span className={styles.sYou}>today</span>}</div>
                  <div className={styles.sMean}>{s.mean}</div>
                </div>
              </div>
            )
          })}
        </div>

        <p className={styles.trust}><b>Vee reads the same signal,</b> so your mentor and your numbers always agree.</p>
      </div>
    </div>
  )
}
