'use client'

import type { SubjectiveTap } from './types'

interface MoodOption {
  key: string
  label: string
  color: string
  value: number
  solid?: boolean
}

export const MOOD_OPTIONS: MoodOption[] = [
  { key: 'foggy', label: 'Foggy', color: '#EF4444', value: -80 },
  { key: 'tired', label: 'Tired', color: '#F59E0B', value: -40 },
  { key: 'steady', label: 'Steady', color: 'rgba(255,255,255,0.5)', value: 0 },
  { key: 'sharp', label: 'Sharp', color: '#6EE7B7', value: 50 },
  { key: 'peak', label: 'Peak', color: '#6EE7B7', value: 90, solid: true },
]

export function keyForTap(v: number): string {
  if (v >= 70) return 'peak'
  if (v >= 20) return 'sharp'
  if (v >= -20) return 'steady'
  if (v >= -60) return 'tired'
  return 'foggy'
}

interface Props {
  todayTaps: SubjectiveTap[]
  onPick: (value: number) => void
}

/**
 * Replaces the SubjectiveDial overlay. Five chips mapped to the
 * underlying -100..+100 dial. Most recent tap shown inline as a
 * receipt so the user can see the model has it.
 */
export default function MoodChips({ todayTaps, onPick }: Props) {
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <div
        style={{
          fontFamily: 'var(--font-serif), Georgia, serif',
          fontStyle: 'italic',
          fontSize: 22,
          color: 'var(--fg)',
          lineHeight: 1.1,
        }}
      >
        How are you feeling?
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {MOOD_OPTIONS.map(m => {
          const isActive = activeKey === m.key
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => onPick(m.value)}
              style={{
                padding: '6px 12px',
                border: '1px solid var(--border-strong)',
                borderRadius: 999,
                background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                color: 'var(--fg)',
                fontSize: 13,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 180ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  background: m.solid ? m.color : 'transparent',
                  border: m.solid ? 'none' : `1.5px solid ${m.color}`,
                  boxShadow: m.solid ? `0 0 8px ${m.color}` : 'none',
                }}
              />
              {m.label}
            </button>
          )
        })}
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
  )
}
