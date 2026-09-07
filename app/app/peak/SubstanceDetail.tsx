'use client'

/**
 * PK detail modal (Peak Stack port) — tap any stim card to see how it moves
 * through your day: a mini onset → peak → comedown → cleared curve, the phase
 * durations, your personal half-life, an editable dose, and a category caution.
 *
 * Mirrors peak-stack.html's openDetail(), but reads the live SubstanceDef PK
 * fields (onsetHours / peakHours / halfLifeHours / amplitude) so the math
 * matches the curve the rest of /app/peak draws — no separate Bateman model.
 */

import { useEffect, useState } from 'react'
import styles from './peak.module.css'
import { pkPhases, relAt } from './curve'
import type { SubstanceDef, SubstanceLog } from './types'

interface Props {
  def: SubstanceDef
  /** Today's logs of this substance — drives the count + last-used dose. */
  logs: SubstanceLog[]
  /** Whether it's pinned to the hot bar (toggles the secondary button). */
  pinned: boolean
  onLog: (key: string, dose: number) => void
  onPin: (key: string) => void
  onUnpin: (key: string) => void
  onClose: () => void
}

/** "45 min" under an hour, else "3h 30m". */
function fmtDur(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`
  const hr = Math.floor(h)
  const m = Math.round((h - hr) * 60)
  return m ? `${hr}h ${m}m` : `${hr}h`
}

/** A short, honest caution by category — the live def has no per-drug copy. */
function cautionFor(def: SubstanceDef): string | null {
  switch (def.category) {
    case 'adhd':
      return 'Prescription stimulant. Don’t stack with other stimulants, eat first, and skip late doses — they cost you sleep.'
    case 'nicotine':
      return 'Highly addictive — the short half-life drives the next hit. Raises heart rate and blood pressure.'
    case 'depressant':
      return 'Sedates: blunts reaction time and fragments sleep even when it helps you fall asleep.'
    default:
      return null
  }
}

export default function SubstanceDetail({ def, logs, pinned, onLog, onPin, onUnpin, onClose }: Props) {
  const lastDose = logs.length ? logs[logs.length - 1].dose : def.defaultDose
  const [dose, setDose] = useState<number>(lastDose)
  const ph = pkPhases(def)
  const sedative = def.amplitude < 0
  const accent = sedative ? 'var(--amber, #F59E0B)' : 'var(--mint, #6ee7b7)'

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // ── mini curve geometry ─────────────────────────────────────────
  const W = 420
  const H = 132
  const padL = 6
  const padR = 6
  const padT = 12
  const padB = 10
  const end = Math.max(ph.cleared * 1.04, ph.peak + 0.5)
  const sx = (t: number) => padL + (t / end) * (W - padL - padR)
  const sy = (v: number) => padT + (1 - v) * (H - padT - padB)
  const pts: [number, number][] = []
  for (let t = 0; t <= end; t += end / 120) pts.push([sx(t), sy(relAt(def, t))])
  const line = pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ')
  const area = `M${sx(0)} ${sy(0)} ${pts.map(q => `L${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ')} L${sx(end)} ${sy(0)} Z`

  const markers: { id: string; t: number; col: string }[] = [
    { id: 'onset', t: ph.onset, col: '#8fb8c9' },
    { id: 'peak', t: ph.peak, col: sedative ? '#F59E0B' : '#6ee7b7' },
    { id: 'comeStart', t: ph.comeStart, col: '#F59E0B' },
    { id: 'comeEnd', t: ph.comeEnd, col: '#F59E0B' },
  ]

  function logNow() {
    const d = isFinite(dose) && dose > 0 ? dose : def.defaultDose
    onLog(def.key, d)
    onClose()
  }

  const caution = cautionFor(def)
  const peakLbl = sedative ? `−${Math.abs(def.amplitude)}` : `+${def.amplitude}`

  return (
    <div className={styles.pkModalBackdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.pkModal} onClick={e => e.stopPropagation()}>
        <button className={styles.pkModalClose} onClick={onClose} aria-label="close">×</button>
        <div className={styles.pkDtlHead}>
          <span className={styles.pkDtlIcon} aria-hidden>{def.icon}</span>
          <span className={styles.pkDtlTitle}>{def.name}</span>
        </div>
        <p className={styles.pkDtlMech}>{def.mechanism}</p>

        {/* onset / peak / comedown / cleared mini-curve */}
        <div className={styles.pkDtlChart}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient id="pkDtlGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={accent} stopOpacity="0.28" />
                <stop offset="1" stopColor={accent} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#pkDtlGrad)" />
            <path d={line} fill="none" stroke={accent} strokeWidth="2.2" strokeLinejoin="round" />
            {markers.map(({ id, t, col }) => (
              <g key={id}>
                <line x1={sx(t)} y1={sy(relAt(def, t))} x2={sx(t)} y2={H - padB} stroke={col} strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
                <circle cx={sx(t)} cy={sy(relAt(def, t))} r="3.2" fill={col} />
              </g>
            ))}
          </svg>
        </div>
        <div className={styles.pkDtlPhases}>
          <div className={styles.pkDtlPhase} data-tone="onset"><span className={styles.pkDtlPhNum}>{fmtDur(ph.onset)}</span><span className={styles.pkDtlPhLbl}>onset</span></div>
          <div className={styles.pkDtlPhase} data-tone="peak"><span className={styles.pkDtlPhNum}>{fmtDur(ph.peak)}</span><span className={styles.pkDtlPhLbl}>peak</span></div>
          <div className={styles.pkDtlPhase} data-tone="come"><span className={styles.pkDtlPhNum}>{fmtDur(ph.comeStart)}–{fmtDur(ph.comeEnd)}</span><span className={styles.pkDtlPhLbl}>comedown</span></div>
          <div className={styles.pkDtlPhase} data-tone="clear"><span className={styles.pkDtlPhNum}>{fmtDur(ph.cleared)}</span><span className={styles.pkDtlPhLbl}>cleared</span></div>
        </div>

        {/* KPIs — half-life, editable dose, peak effect */}
        <div className={styles.pkDtlKpis}>
          <div className={styles.pkDtlKpi}>
            <span className={styles.pkDtlKpiNum}>{fmtDur(def.halfLifeHours)}</span>
            <span className={styles.pkDtlKpiLbl}>half-life</span>
          </div>
          <div className={`${styles.pkDtlKpi} ${styles.pkDtlKpiEdit}`}>
            <input
              className={styles.pkDtlDose}
              type="number"
              step="any"
              inputMode="decimal"
              value={dose}
              onChange={e => setDose(parseFloat(e.target.value))}
              aria-label={`dose in ${def.unit}`}
            />
            <span className={styles.pkDtlKpiLbl}>this dose · {def.unit}</span>
          </div>
          <div className={styles.pkDtlKpi}>
            <span className={styles.pkDtlKpiNum} style={{ color: accent }}>{peakLbl}</span>
            <span className={styles.pkDtlKpiLbl}>peak effect</span>
          </div>
        </div>

        <p className={styles.pkDtlLine}>
          All times are measured from when you take it. <b>Onset</b> {fmtDur(ph.onset)}, <b>peak</b> at {fmtDur(ph.peak)}, the <b>comedown</b> runs {fmtDur(ph.comeStart)}–{fmtDur(ph.comeEnd)}, and it’s ~fully <b>cleared</b> after {fmtDur(ph.cleared)} (5 half-lives).
        </p>

        {caution && (
          <div className={styles.pkDtlWarn} data-danger={def.category === 'nicotine' ? '1' : '0'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
            <span>{caution}</span>
          </div>
        )}

        <button type="button" className={styles.pkDtlLog} onClick={logNow}>＋ Log now</button>
        {pinned ? (
          <button type="button" className={styles.pkDtlGhost} onClick={() => { onUnpin(def.key); onClose() }}>Remove from stack</button>
        ) : (
          <button type="button" className={styles.pkDtlGhost} onClick={() => onPin(def.key)}>Pin to stack</button>
        )}
      </div>
    </div>
  )
}
