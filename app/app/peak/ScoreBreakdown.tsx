'use client'

import type { DetailedHour } from './curve'
import { tierFor } from './curve'
import type { ScoreTier } from './types'

interface PopoverProps {
  curve: DetailedHour[]
  hour: number
  onClose: () => void
  floating?: boolean
  onPlan?: (hour: number) => void
}

const TIER_COLOR: Record<ScoreTier, string> = {
  Peak: '#6EE7B7',
  Solid: '#6EE7B7',
  Tired: '#F59E0B',
  Low: '#d97706',
  Drained: '#EF4444',
}

function fmtHour(h: number): string {
  if (h === 0 || h === 24) return '12 AM'
  if (h === 12) return '12 PM'
  return h > 12 ? `${h - 12} PM` : `${h} AM`
}

/**
 * Per-hour breakdown popover — anchored to a tapped bar/point on the
 * curve. Shows the score, tier, and every segment (baseline + each
 * substance contribution + WHOOP multiplier), then offers a "plan
 * something here" jump to the Schedule tab.
 */
export function ScoreBreakdown({ curve, hour, onClose, floating = false, onPlan }: PopoverProps) {
  const h = Math.round(hour)
  const c = curve[h]
  if (!c) return null
  const tier = tierFor(c.score)
  const tierColor = TIER_COLOR[tier]
  const baseline = c.segments.find(s => s.source === 'baseline')
  const contribs = c.segments.filter(s => s.source !== 'baseline')

  return (
    <div
      style={{
        width: floating ? 340 : '100%',
        padding: 20,
        borderRadius: 12,
        border: '1px solid var(--border-strong)',
        background: 'rgba(10,10,10,0.96)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: floating ? '0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(110,231,183,0.08)' : undefined,
        color: 'var(--fg)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            fontWeight: 500,
          }}
        >
          {fmtHour(h)} · Why
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            color: 'var(--muted)',
            fontSize: 16,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ×
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
        <span
          style={{
            fontFamily: 'var(--font-serif), Georgia, serif',
            fontStyle: 'italic',
            fontSize: 44,
            color: tierColor,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {Math.round(c.score)}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-serif), Georgia, serif',
            fontStyle: 'italic',
            fontSize: 18,
            color: 'var(--fg)',
          }}
        >
          {tier}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
        {baseline && (
          <Row label="Baseline" sub="circadian" value={`+${Math.round(baseline.value)}`} />
        )}
        {contribs.map((s, i) => (
          <Row
            key={i}
            label={s.label}
            value={`${s.value > 0 ? '+' : ''}${Math.round(s.value)}`}
            color={s.value < 0 ? 'var(--red)' : 'var(--mint)'}
          />
        ))}
        {Math.abs(c.mult - 1) > 0.01 && (
          <Row
            label="WHOOP recovery"
            value={`×${c.mult.toFixed(2)}`}
            color={c.mult > 1 ? 'var(--mint)' : 'var(--amber)'}
          />
        )}
        <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 500 }}>
          <span>Total</span>
          <span style={{ color: tierColor, fontFamily: 'var(--font-mono), ui-monospace, monospace' }}>
            {Math.round(c.score)}
          </span>
        </div>
      </div>
      {onPlan && (
        <button
          onClick={() => onPlan(h)}
          style={{
            marginTop: 16,
            width: '100%',
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid rgba(110,231,183,0.3)',
            background: 'rgba(110,231,183,0.08)',
            color: 'var(--mint)',
            fontSize: 13,
            letterSpacing: '0.04em',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Plan something for {fmtHour(h)} → Schedule
        </button>
      )}
    </div>
  )
}

function Row({ label, sub, value, color = 'var(--fg)' }: { label: string; sub?: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ color: 'var(--muted-strong)' }}>
        {label} {sub && <span style={{ color: 'var(--muted)' }}>· {sub}</span>}
      </span>
      <span style={{ color, fontFamily: 'var(--font-mono), ui-monospace, monospace' }}>{value}</span>
    </div>
  )
}

interface DayProps {
  curve: DetailedHour[]
  nowHour: number
  onClose: () => void
}

/**
 * Modal day-breakdown shown when the user taps the score ring. Aggregates
 * every segment across the 25-hour curve into one "why your day is
 * shaped like this" view.
 */
export function DayBreakdown({ curve, nowHour, onClose }: DayProps) {
  const nowI = Math.max(0, Math.min(24, Math.round(nowHour)))
  const nowScore = curve[nowI]?.score ?? 0
  const tier = tierFor(nowScore)
  const tierColor = TIER_COLOR[tier]

  const totals: Record<string, { label: string; value: number }> = {}
  let baselineSum = 0
  let multSum = 0
  let multN = 0
  for (const c of curve) {
    for (const s of c.segments) {
      if (s.source === 'baseline') baselineSum += s.value
      else {
        if (!totals[s.source]) totals[s.source] = { label: s.label, value: 0 }
        totals[s.source].value += s.value
      }
    }
    multSum += c.mult
    multN += 1
  }
  const avgMult = multN > 0 ? multSum / multN : 1
  const contribs = Object.values(totals).sort((a, b) => Math.abs(b.value) - Math.abs(a.value))

  return (
    <div
      style={{
        padding: 22,
        borderRadius: 12,
        border: '1px solid var(--border-strong)',
        background: 'rgba(10,10,10,0.96)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(110,231,183,0.08)',
        color: 'var(--fg)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            fontWeight: 500,
          }}
        >
          Why this score
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            color: 'var(--muted)',
            fontSize: 18,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ×
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
        <span
          style={{
            fontFamily: 'var(--font-serif), Georgia, serif',
            fontStyle: 'italic',
            fontSize: 56,
            color: tierColor,
            lineHeight: 1,
            textShadow: `0 0 28px ${tierColor}55`,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {Math.round(nowScore)}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-serif), Georgia, serif',
            fontStyle: 'italic',
            fontSize: 20,
            color: 'var(--fg)',
          }}
        >
          {tier}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            color: 'var(--muted)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Right now
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
        <Row label="Circadian baseline" sub="evening peak shape" value={`+${Math.round(baselineSum / 25)}`} />
        {contribs.map((c, i) => (
          <Row
            key={i}
            label={c.label}
            value={`${c.value > 0 ? '+' : ''}${Math.round(c.value / 25)}`}
            color={c.value > 0 ? 'var(--mint)' : 'var(--red)'}
          />
        ))}
        {Math.abs(avgMult - 1) > 0.01 && (
          <Row
            label="WHOOP recovery"
            sub={`avg ${avgMult.toFixed(2)}× across the day`}
            value={`×${avgMult.toFixed(2)}`}
            color={avgMult > 1 ? 'var(--mint)' : 'var(--amber)'}
          />
        )}
        <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 500 }}>
          <span>Right now</span>
          <span style={{ color: tierColor, fontFamily: 'var(--font-mono), ui-monospace, monospace' }}>
            {Math.round(nowScore)}
          </span>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 14, lineHeight: 1.55 }}>
        Score = (baseline + Σ substances) × WHOOP multiplier, computed each hour. Tap any column on the chart for the per-hour breakdown.
      </div>
    </div>
  )
}
