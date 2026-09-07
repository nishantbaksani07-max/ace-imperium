'use client'

import type { SubjectiveTap } from './types'
import { MOOD_OPTIONS, keyForTap } from './MoodChips'
import styles from './peak.module.css'

interface Props {
  todayTaps: SubjectiveTap[]
  onPick: (value: number) => void
  compact?: boolean
  /** Drops the subtitle + tightens padding for a smaller, simpler card. */
  simple?: boolean
}

/**
 * The "How are you feeling?" card — five big, labelled options (drained →
 * peak) with generous tap targets, sitting directly under the chart. Replaces
 * the fiddly small chips for the primary surface. One tap logs a subjective
 * SubjectiveTap (-100..+100) that teaches the model the user's real peaks.
 */
export default function MoodPicker({ todayTaps, onPick, compact = false, simple = false }: Props) {
  const latest = todayTaps[todayTaps.length - 1]
  const activeKey = latest ? keyForTap(latest.value) : null
  const latestOpt = latest ? MOOD_OPTIONS.find(m => m.key === activeKey) : null

  let receipt: string | null = null
  if (latest && latestOpt) {
    const d = new Date(latest.time)
    const hr = d.getHours()
    const min = d.getMinutes()
    const period = hr >= 12 ? 'PM' : 'AM'
    const hr12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr
    receipt = `${latestOpt.label} · ${hr12}:${String(min).padStart(2, '0')} ${period}`
  }

  return (
    <div className={styles.piMoodCard} style={simple ? { padding: '14px 18px' } : undefined}>
      <div className={styles.piMoodHead} style={simple ? { marginBottom: 10 } : undefined}>
        <div>
          <div style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontStyle: 'italic', fontSize: compact ? 18 : 22, color: 'var(--fg)' }}>
            How are you feeling?
          </div>
          {!simple && (
            <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500, marginTop: 3 }}>
              One tap · teaches the model your real peaks
            </div>
          )}
        </div>
        {receipt && latestOpt && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 10px',
              borderRadius: 999,
              border: `1px solid ${latestOpt.color}33`,
              color: latestOpt.color,
              fontSize: 11,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: 999, background: latestOpt.color }} />
            {receipt}
          </div>
        )}
      </div>

      <div className={styles.piMoodpicker} style={{ gap: compact ? 6 : 8 }}>
        {MOOD_OPTIONS.map(m => {
          const on = activeKey === m.key
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => onPick(m.value)}
              className={styles.piMoodOpt}
              style={{
                padding: compact ? '10px 4px' : '14px 6px',
                border: on ? `1px solid ${m.color}` : '1px solid var(--border)',
                background: on ? `${m.color}14` : 'var(--card)',
                color: on ? 'var(--fg)' : 'var(--muted-strong)',
              }}
            >
              <span
                style={{
                  width: on ? 13 : 11,
                  height: on ? 13 : 11,
                  borderRadius: 999,
                  background: m.solid || on ? m.color : 'transparent',
                  border: m.solid || on ? 'none' : `2px solid ${m.color}`,
                  boxShadow: on ? `0 0 12px ${m.color}` : 'none',
                  transition: 'all 180ms cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              />
              <span style={{ fontSize: compact ? 11 : 12.5, fontWeight: on ? 500 : 400 }}>{m.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
