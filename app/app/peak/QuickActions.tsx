'use client'

import Link from 'next/link'
import SubstanceIcon from './SubstanceIcon'

interface Props {
  waterCount: number
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '16px 18px',
  borderRadius: 18,
  border: '1px solid rgba(110,231,183,0.22)',
  background: 'rgba(110,231,183,0.035)',
  textDecoration: 'none',
}

const iconBoxStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  flex: 'none',
  borderRadius: 11,
  background: 'rgba(110,231,183,0.1)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--mint)',
}

/**
 * Peak is a read-only insight surface — it doesn't log anything. Two links out:
 * water lives in the one tracker (Fuel → /app/fuel), and the wearables (WHOOP /
 * Fitbit / Oura — recovery + readiness data) now live under Peak. The wearables
 * link is the entry point for them after the Fitness hub was retired in the
 * 6-tile consolidation.
 */
export default function QuickActions({ waterCount }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Link href="/app/fuel" style={rowStyle}>
        <span style={iconBoxStyle}>
          <SubstanceIcon category="hydration" size={20} />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          <span style={{ fontSize: 15, color: 'var(--fg)', fontWeight: 500 }}>Log water in Fuel</span>
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            {waterCount > 0 ? `${waterCount} logged today` : 'Track hydration in one place'}
          </span>
        </span>
        <span style={{ color: 'var(--mint)', fontSize: 16 }}>→</span>
      </Link>

      <Link href="/app/vitals" style={rowStyle}>
        <span style={iconBoxStyle} aria-hidden>
          {/* pulse glyph — wearable recovery data, now its own Vitals module */}
          <svg width="20" height="20" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M-10 0 L-5 0 L-2 -7 L2 7 L5 0 L10 0" />
          </svg>
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          <span style={{ fontSize: 15, color: 'var(--fg)', fontWeight: 500 }}>Open Vitals</span>
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>WHOOP recovery, sleep &amp; strain</span>
        </span>
        <span style={{ color: 'var(--mint)', fontSize: 16 }}>→</span>
      </Link>

      <Link href="/app/mentor" style={rowStyle}>
        <span style={iconBoxStyle} aria-hidden>
          {/* note glyph — mentor + the void */}
          <svg width="20" height="20" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="-7" y="-9" width="14" height="18" rx="1.5" />
            <line x1="-4" y1="-4" x2="4" y2="-4" /><line x1="-4" y1="0" x2="4" y2="0" /><line x1="-4" y1="4" x2="2" y2="4" />
          </svg>
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          <span style={{ fontSize: 15, color: 'var(--fg)', fontWeight: 500 }}>Mentor</span>
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Chat, the void, quick notes</span>
        </span>
        <span style={{ color: 'var(--mint)', fontSize: 16 }}>→</span>
      </Link>

      <Link href="/app/goals" style={rowStyle}>
        <span style={iconBoxStyle} aria-hidden>
          {/* target glyph — streak goals */}
          <svg width="20" height="20" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="0" cy="0" r="9" /><circle cx="0" cy="0" r="4" /><circle cx="0" cy="0" r="0.6" fill="currentColor" />
          </svg>
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          <span style={{ fontSize: 15, color: 'var(--fg)', fontWeight: 500 }}>Goals</span>
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Streaks, identity, plan tomorrow</span>
        </span>
        <span style={{ color: 'var(--mint)', fontSize: 16 }}>→</span>
      </Link>
    </div>
  )
}
