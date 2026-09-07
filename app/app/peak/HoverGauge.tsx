'use client'

import { scoreAtHour, scoreColorFor, tierFor } from './curve'

interface Props {
  /** Plain 25-point score curve. */
  curve: number[]
  /** Fractional hour under the cursor, or null when not scrubbing. */
  hoverHour: number | null
  /** Wall-clock "now" hour — what the gauge falls back to. */
  nowHour: number
  size?: number
}

function fmt(h: number): string {
  const r = Math.round(h)
  if (r === 0 || r === 24) return '12 AM'
  if (r === 12) return '12 PM'
  return r < 12 ? `${r} AM` : `${r - 12} PM`
}

/**
 * Compact circular gauge in the chart header. Mirrors the live cursor: shows
 * the hovered hour's score (colour red→green via scoreColorFor), or the
 * current "now" score when the pointer is off the chart.
 */
export default function HoverGauge({ curve, hoverHour, nowHour, size = 104 }: Props) {
  const live = hoverHour != null
  const h = live ? hoverHour : nowHour
  const score = scoreAtHour(curve, h)
  const tier = tierFor(score)
  const color = scoreColorFor(score)
  const stroke = 8
  const glowPad = 12
  const r = size / 2 - stroke / 2 - glowPad
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, score)) / 100

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}
        >
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * pct} ${c}`}
            style={{
              filter: `drop-shadow(0 0 6px ${color})`,
              transition: 'stroke-dasharray 220ms cubic-bezier(0.16, 1, 0.3, 1), stroke 220ms linear',
            }}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-serif), Georgia, serif',
              fontStyle: 'italic',
              fontSize: size * 0.34,
              lineHeight: 1,
              color,
              fontVariantNumeric: 'tabular-nums',
              transition: 'color 220ms linear',
            }}
          >
            {Math.round(score)}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontStyle: 'italic', fontSize: 18, color: 'var(--fg)' }}>
          {tier}
        </span>
        <span style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 500 }}>
          {live ? `At ${fmt(h)}` : 'Right now'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
          <span style={{ width: 5, height: 5, borderRadius: 999, background: live ? color : 'var(--muted)' }} />
          {live ? 'Scrubbing' : 'Hover the curve'}
        </span>
      </div>
    </div>
  )
}
