'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  /** Time-ordered numeric points. Fewer than 2 renders nothing. */
  values: number[]
  /** Optional goal value — draws a dashed horizontal target line. */
  target?: number
  width?: number
  height?: number
  /** Stroke color. Defaults to the brand accent. */
  color?: string
  className?: string
}

/**
 * Per-metric line chart for the Business tab's custom KPIs. A richer
 * sibling of `Sparkline`: same draw-in animation and area fill, plus an
 * optional dashed **target line** so a metric reads against its goal at a
 * glance (the y-scale stretches to include the target so the line is
 * always on-canvas).
 *
 * Index-spaced on x (like Sparkline / AnalyticsCard) — datapoints are
 * evenly spaced regardless of when they were logged. Time-scaled axes are
 * a later build; for a manually-updated metric the trend shape is what
 * matters, and the delta chip carries the precise magnitude.
 *
 * Renders only client-side (the brand detail mounts behind a `mounted`
 * gate), so reading `matchMedia` in the initial state is hydration-safe.
 */
export default function KpiChart({
  values,
  target,
  width = 240,
  height = 64,
  color = 'var(--accent)',
  className,
}: Props) {
  // Skip the draw-in for reduced-motion users by starting "drawn".
  const [drawn, setDrawn] = useState(() =>
    typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
  )
  const gradId = useRef(`kpiFill-${Math.random().toString(36).slice(2, 9)}`)

  useEffect(() => {
    if (drawn) return
    const id = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!Array.isArray(values) || values.length < 2) return null

  const hasTarget = typeof target === 'number' && Number.isFinite(target)
  const padY = 6
  const lo = Math.min(...values, ...(hasTarget ? [target as number] : []))
  const hi = Math.max(...values, ...(hasTarget ? [target as number] : []))
  const range = hi - lo || 1

  const yOf = (v: number) => height - padY - ((v - lo) / range) * (height - padY * 2)
  const xOf = (i: number) => (i / (values.length - 1)) * width

  const points = values.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ')
  const lastY = yOf(values[values.length - 1])
  const targetY = hasTarget ? yOf(target as number) : null

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId.current} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill={`url(#${gradId.current})`}
        opacity={drawn ? 1 : 0}
        style={{ transition: 'opacity 600ms ease 200ms' }}
      />

      {targetY !== null && (
        <line
          x1="0"
          y1={targetY}
          x2={width}
          y2={targetY}
          stroke={color}
          strokeWidth="1"
          strokeDasharray="3 4"
          opacity={drawn ? 0.55 : 0}
          style={{ transition: 'opacity 500ms ease 320ms' }}
        />
      )}

      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={width * 2}
        strokeDashoffset={drawn ? 0 : width * 2}
        style={{ transition: 'stroke-dashoffset 800ms cubic-bezier(0.32, 0.72, 0, 1)' }}
      />

      <circle
        cx={width}
        cy={lastY}
        r={2.5}
        fill={color}
        opacity={drawn ? 1 : 0}
        style={{ transition: 'opacity 400ms ease 600ms' }}
      />
    </svg>
  )
}
