'use client'

import { bestWindows } from './curve'
import styles from './peak.module.css'

interface Props {
  /** Plain 25-point score curve. */
  curve: number[]
  nowHour: number
  /** Tap "Block →" on a window. */
  onBlock?: (hour: number) => void
}

const TIER_COLOR: Record<string, string> = {
  Peak: '#6EE7B7',
  Solid: '#6EE7B7',
  Tired: '#F59E0B',
  Low: '#d97706',
  Drained: '#EF4444',
}

function fmt(h: number): string {
  h = Math.round(h)
  if (h === 0 || h === 24) return '12 AM'
  if (h === 12) return '12 PM'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

function fmtShort(h: number): string {
  h = Math.round(h)
  if (h === 0 || h === 24) return '12a'
  if (h === 12) return '12p'
  return h < 12 ? `${h}a` : `${h - 12}p`
}

/**
 * Lists ALL of today's strong windows (e.g. 9 AM–1 PM and 3–11 PM), each with
 * its peak score, tier, and a block action. Active/past windows are styled
 * distinctly. Empty state when recovery caps the day below the threshold.
 */
export default function BestHours({ curve, nowHour, onBlock }: Props) {
  const windows = bestWindows(curve, 75)

  if (!windows.length) {
    return (
      <div className={styles.piBesthours}>
        <div className={styles.piEyebrow}>Best hours</div>
        <div
          style={{
            fontFamily: 'var(--font-serif), Georgia, serif',
            fontStyle: 'italic',
            fontSize: 22,
            color: 'var(--muted-strong)',
            marginTop: 10,
            lineHeight: 1.2,
          }}
        >
          No peak windows today.
        </div>
        <div style={{ color: 'var(--muted-strong)', fontSize: 13, marginTop: 6 }}>
          Recovery is capping your ceiling. Rest, hydrate, and aim for tomorrow.
        </div>
      </div>
    )
  }

  return (
    <div className={styles.piBesthours}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div className={styles.piEyebrow}>
          Best hours · {windows.length} window{windows.length > 1 ? 's' : ''}
        </div>
        <span style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Today
        </span>
      </div>
      <div className={styles.piBesthoursList}>
        {windows.map((w, i) => {
          const past = w.end < nowHour
          const active = nowHour >= w.start && nowHour <= w.end
          const color = TIER_COLOR[w.tier]
          const cls = `${styles.piBesthour} ${active ? styles.piBesthourActive : ''} ${past ? styles.piBesthourPast : ''}`
          return (
            <div key={i} className={cls}>
              <div className={styles.piBesthourTime}>
                <span
                  style={{
                    fontFamily: 'var(--font-serif), Georgia, serif',
                    fontStyle: 'italic',
                    fontSize: 26,
                    color: past ? 'var(--muted)' : color,
                    lineHeight: 1,
                  }}
                >
                  {fmtShort(w.start)}–{fmtShort(w.end)}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--muted)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    marginTop: 2,
                  }}
                >
                  {active ? 'In it now' : past ? 'Passed' : `Peaks ${fmt(w.peakHour)}`}
                </span>
              </div>
              <div className={styles.piBesthourMeta}>
                <span
                  style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: past ? 'var(--muted)' : color }}
                >
                  {w.tier}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-serif), Georgia, serif',
                    fontStyle: 'italic',
                    fontSize: 20,
                    color: past ? 'var(--muted)' : 'var(--fg)',
                  }}
                >
                  {Math.round(w.peakScore)}
                </span>
              </div>
              {!past && (
                <button type="button" className={styles.piBesthourBlock} onClick={() => onBlock?.(w.peakHour)}>
                  Block →
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
