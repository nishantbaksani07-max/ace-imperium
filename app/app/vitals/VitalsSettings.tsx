'use client'

import { useEffect } from 'react'
import type { VitalsGoal } from '@/lib/vitals/goals'
import type { VitalsPreferences } from '@/lib/preferences'
import { WEARABLES, type WearableProviderId } from '@/lib/vitals/wearables'
import styles from './vitalsSettings.module.css'

/**
 * Vitals settings — opened from the dashboard gear. Built to match the macros
 * "Targets" panel: a goal-is-set card (the chosen goal + safety flags as chips
 * + redo), and a device card that is now the ONLY way back to the wearables
 * gallery (manage / add a device). Renders inside the .page scope so the azure
 * tokens inherit.
 */

const GOAL_LABEL: Record<string, { title: string; sub: string }> = {
  sleep: { title: 'Sleep more', sub: 'getting your hours up' },
  recovery: { title: 'Recover better', sub: 'raising your recovery' },
  hrv: { title: 'Calmer and more resilient', sub: 'raising your HRV' },
  strain: { title: 'Train harder', sub: 'building your capacity' },
}

const FLAG_LABEL: Record<string, string> = {
  injury: 'an injury',
  medication: 'medication',
  condition: 'a condition',
  cycle: 'a cycle',
  other: 'a note for Imperium',
}

export default function VitalsSettings({
  goal,
  quiz,
  provider = 'whoop',
  onClose,
}: {
  goal: VitalsGoal | null
  quiz: VitalsPreferences | null
  provider?: WearableProviderId
  onClose: () => void
}) {
  const wearable = WEARABLES[provider]
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const label = goal ? GOAL_LABEL[goal.metric] : null
  const flags = quiz?.healthFlags ?? []

  return (
    <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="Vitals settings">
        <div className={styles.head}>
          <div className={styles.title}>Settings</div>
          <button className={styles.close} onClick={onClose} aria-label="close">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
              <path d="M6 6 18 18M18 6 6 18" />
            </svg>
          </button>
        </div>

        {/* Goal */}
        <div className={`${styles.card}${goal ? ' ' + styles.done : ''}`}>
          {goal ? (
            <>
              <div className={styles.cardTop}>
                <div>
                  <div className={styles.cardTitle}>Your goal is set</div>
                  <div className={styles.cardSub}>
                    {label ? `Focused on ${label.sub}. I read your wearable through this lens every day.` : 'I read your wearable through your goal every day.'}
                  </div>
                </div>
                <span className={styles.pill}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  complete
                </span>
              </div>

              <div className={styles.chips}>
                {label && <span className={`${styles.chip} ${styles.chipFocus}`}>{label.title}</span>}
                {flags.length > 0
                  ? flags.map(f => <span key={f} className={styles.chip}>{FLAG_LABEL[f] ?? String(f)}</span>)
                  : <span className={styles.chip}>no health flags</span>}
              </div>

              <a className={styles.redoBtn} href="/app/vitals/quiz?redo=1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
                redo goal
              </a>
            </>
          ) : (
            <>
              <div className={styles.cardTitle}>Set your goal</div>
              <div className={styles.cardSub}>Pick what you want from your wearable and I will coach you there.</div>
              <a className={styles.redoBtn} href="/app/vitals/quiz">pick a goal</a>
            </>
          )}
        </div>

        {/* Device */}
        <div className={styles.card}>
          <a className={styles.deviceRow} href="/app/vitals?manage=1">
            <span className={styles.deviceDot}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
            </span>
            <span className={styles.deviceTxt}>
              <span className={styles.deviceName}>{wearable.label} · connected</span>
              <span className={styles.deviceMeta}>Manage or add a wearable.</span>
            </span>
            <span className={styles.deviceArrow}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
            </span>
          </a>
          {/* Device actions, user-proof: manual can log again; a wearable user can
              reconnect, ALSO log manually anytime, or disconnect to switch bands.
              (manual's "reconnect" is just another check-in, now on Vitals not Peak.) */}
          {provider === 'manual' ? (
            <a className={styles.reconnect} href="/app/vitals/manual?log=1">log another check-in</a>
          ) : (
            <>
              <a className={styles.reconnect} href={`/api/${provider}/connect?return=${encodeURIComponent(wearable.readingsPath)}`}>reconnect {wearable.label}</a>
              <a className={styles.reconnect} href="/app/vitals/manual?log=1">or log manually</a>
              <button
                type="button"
                className={styles.reconnect}
                onClick={async () => {
                  try { await fetch(`/api/${provider}/disconnect`, { method: 'POST' }) } catch { /* land on the gallery regardless */ }
                  window.location.href = '/app/vitals'
                }}
              >
                disconnect {wearable.label}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
