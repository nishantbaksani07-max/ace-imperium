'use client'

import {
  sampleCurve, fmtHour, hexToRgb, accentFor, scoreLabel,
  RECOVERY, type RecoveryLevel,
} from './curve'

interface Props {
  curve: number[]
  nowHour: number | null
  hoveredHour?: number | null
  size?: number
  thickness?: number
  recoveryLevel: RecoveryLevel
  animate?: boolean
}

export default function PeakRing({
  curve, nowHour, hoveredHour = null,
  size = 220, thickness = 14,
  recoveryLevel, animate = true,
}: Props) {
  const tone = RECOVERY[recoveryLevel].tone
  const baseTone = accentFor(tone)
  const accentRGB = hexToRgb(baseTone)

  const readHour = hoveredHour != null ? hoveredHour : (nowHour ?? 14)
  const score = Math.round(sampleCurve(curve, readHour))
  const label = scoreLabel(score)

  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - thickness
  const circumference = 2 * Math.PI * r
  const dashLen = (score / 100) * circumference
  const dashGap = circumference - dashLen

  return (
    <div style={{
      position: 'relative', width: size, height: size,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width={size} height={size} style={{
        position: 'absolute', inset: 0,
        transform: 'rotate(-225deg)',
        animation: animate ? 'pt-ringHueCycle 14s ease-in-out infinite' : undefined,
      }}>
        <defs>
          <linearGradient id={`pt-ring-${recoveryLevel}`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor={baseTone} />
            <stop offset="100%" stopColor={baseTone} stopOpacity="0.85" />
          </linearGradient>
          <filter id={`pt-ring-glow-${recoveryLevel}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx={cx} cy={cy} r={r}
          fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={thickness} />
        <circle cx={cx} cy={cy} r={r}
          fill="none"
          stroke={`url(#pt-ring-${recoveryLevel})`}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${dashLen} ${dashGap}`}
          filter={`url(#pt-ring-glow-${recoveryLevel})`}
          style={{ transition: 'stroke-dasharray .6s cubic-bezier(.2,.7,.2,1)' }}
        />
        <circle cx={cx + r * Math.cos(0)} cy={cy + r * Math.sin(0)}
          r={3} fill="#E89548"
          style={{ filter: 'drop-shadow(0 0 6px #E89548)' }} />
      </svg>

      <div style={{
        position: 'relative',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      }}>
        <span style={{
          fontFamily: "'Instrument Serif', serif", fontStyle: 'italic',
          fontSize: size * 0.4, lineHeight: 0.9,
          color: baseTone,
          letterSpacing: '-0.02em',
          textShadow: `0 0 24px rgba(${accentRGB},0.4)`,
          fontVariantNumeric: 'tabular-nums',
          transition: 'color .4s ease',
        }}>
          {score}
        </span>
        <span style={{
          fontFamily: "'Instrument Serif', serif", fontStyle: 'italic',
          fontSize: size * 0.105, color: 'rgba(255,255,255,0.85)',
          letterSpacing: '-0.01em', marginTop: 4,
        }}>
          {label}
        </span>
        <span style={{
          fontFamily: "'Instrument Serif', serif", fontWeight: 600, fontSize: size * 0.058,
          letterSpacing: '0.22em', textTransform: 'uppercase',
          color: hoveredHour != null
            ? `rgba(${accentRGB},0.85)`
            : 'rgba(255,255,255,0.9)',
          marginTop: 8,
          display: 'flex', alignItems: 'center', gap: 6,
          transition: 'color .3s ease',
        }}>
          {hoveredHour != null && (
            <span style={{
              width: 4, height: 4, borderRadius: '50%', background: baseTone,
            }} />
          )}
          {hoveredHour != null
            ? `at ${fmtHour(readHour).toLowerCase()}`
            : nowHour != null
              ? `now · ${fmtHour(nowHour).toLowerCase()}`
              : 'baseline'}
        </span>
      </div>
    </div>
  )
}
