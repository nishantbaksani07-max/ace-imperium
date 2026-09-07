'use client'

/**
 * Health Watch card — the real-data load & vitals monitor (Vitality port of the
 * standalone's health watch). Every value is computed from the user's actual
 * logged substances + live WHOOP/manual vitals by `buildHealthWatch`; this file
 * is pure presentation over that result.
 */

import { useMemo } from 'react'
import styles from './peak.module.css'
import type { ManualVitals, SubstanceLog, WhoopSignal } from './types'
import { buildHealthWatch } from './healthWatchModel'

interface Props {
  logs: SubstanceLog[]
  whoop: WhoopSignal
  manual: ManualVitals | null
}

const HeartIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.5l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 22l7.8-7.7 1-1a5.5 5.5 0 0 0 0-7.7z" />
    <path d="M3.5 12.5h4l2-4 3 7 2-4h4" strokeWidth="1.5" />
  </svg>
)
const WarnIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
)

export default function HealthWatch({ logs, whoop, manual }: Props) {
  const h = useMemo(() => buildHealthWatch({ logs, whoop, manual }), [logs, whoop, manual])
  const tone = h.severity === 2 ? styles.hwAlert : h.severity === 1 ? styles.hwCaution : styles.hwOk

  const title =
    h.severity === 2 ? "That's a lot for one day."
      : h.severity === 1 ? 'Heads up — ease off a little.'
        : "You're in a healthy range."
  const sub =
    h.severity === 0
      ? "Nothing flagged. We're watching your load and your vitals as you log."
      : `${h.signals.length} thing${h.signals.length > 1 ? 's' : ''} worth noticing today.`

  // Vitals hook — honest about the source. WHOOP wins; else the check-in; else
  // a prompt. No invented numbers.
  const hasWhoop = whoop.recovery != null || whoop.sleepHours != null || whoop.sleepDebtHours != null
  const vitalsSource = hasWhoop ? 'live WHOOP feed' : manual ? 'your check-in' : null
  const caffPct = Math.max(0, Math.min(100, Math.round((h.caffMg / h.caffCeiling) * 100)))
  const caffColor = h.caffMg > h.caffCeiling ? 'var(--amber)' : 'var(--mint)'

  return (
    <div className={`${styles.hw} ${tone}`}>
      <div className={styles.hwTop}>
        <span className={styles.hwIc}>{h.severity === 0 ? <HeartIcon /> : <WarnIcon />}</span>
        <div>
          <div className={styles.hwTitle}>{title}</div>
          <div className={styles.hwSub}>{sub}</div>
        </div>
      </div>

      <div className={styles.hwVitals}>
        <span className={styles.hwVitalsDot} aria-hidden />
        VITALS · resting HR <b>{h.restingHR != null ? Math.round(h.restingHR) : '—'}</b>
        {' · '}sleep <b>{h.sleepH != null ? `${h.sleepH.toFixed(1)}h` : '—'}</b>
        {' · '}debt <b>{h.sleepDebtH != null ? `${h.sleepDebtH.toFixed(1)}h` : '—'}</b>
        {vitalsSource && <span className={styles.hwVitalsSrc}> · {vitalsSource}</span>}
      </div>

      {h.severity === 0 ? (
        <div className={styles.hwMeter}>
          <div className={styles.hwMeterTop}>
            <span>CAFFEINE TODAY</span>
            <b>{h.caffMg} / {h.caffCeiling} MG</b>
          </div>
          <div className={styles.hwMeterBar}>
            <div className={styles.hwMeterFill} style={{ width: `${caffPct}%`, background: caffColor }} />
          </div>
        </div>
      ) : (
        <>
          <div className={styles.hwSigList}>
            {h.signals.map((s, i) => (
              <div key={i} className={`${styles.hwSig} ${s.level === 2 ? styles.hwSig2 : styles.hwSig1}`}>
                <span className={styles.hwSigDot} aria-hidden />
                <span>{s.text}</span>
              </div>
            ))}
          </div>
          {(h.shortEffects.length > 0 || h.longEffects.length > 0) && (
            <div className={styles.hwEffGrid}>
              {h.shortEffects.length > 0 && (
                <div className={styles.hwEffCol}>
                  <div className={styles.hwEffLbl}>⚠ Short-term · today</div>
                  {h.shortEffects.map((e, i) => (
                    <div key={i} className={styles.hwEffItem}><span className={styles.hwEffX}>✕</span><span>{e}</span></div>
                  ))}
                </div>
              )}
              {h.longEffects.length > 0 && (
                <div className={styles.hwEffCol}>
                  <div className={styles.hwEffLbl}>⚠ Long-term · if sustained</div>
                  {h.longEffects.map((e, i) => (
                    <div key={i} className={styles.hwEffItem}><span className={styles.hwEffX}>✕</span><span>{e}</span></div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className={styles.hwFoot}>
        Watching: caffeine total, stacking, late doses, tolerance &amp; your vitals — all from your real logs{hasWhoop ? ' + WHOOP feed' : ''}.
      </div>
    </div>
  )
}
