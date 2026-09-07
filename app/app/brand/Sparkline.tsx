'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  /** Time-ordered numeric points. Anything less than 2 renders nothing. */
  values: number[]
  width?: number
  height?: number
  /** Stroke color. Defaults to mint. */
  color?: string
  /** Drop a soft area fill beneath the line. */
  fill?: boolean
  /** Show a dot at the latest point. */
  dot?: boolean
  /** Animate the line drawing on first mount. */
  animate?: boolean
  /** Anchor the y-axis at 0 so the area fills from the bottom (a fuller, more
   *  dramatic rise) instead of zooming into the value range. */
  minZero?: boolean
  className?: string
}

/**
 * Minimal SVG line sparkline used across the brand module (stats hero,
 * platform cards, socials view). Stretches to fill its container; the
 * width/height props only matter for the viewBox aspect ratio.
 *
 * On first mount, animates the line drawing with the classic
 * stroke-dasharray trick. Subsequent value changes just re-render
 * (the path swaps without re-animating, so frequent updates don't
 * feel jittery).
 */
export default function Sparkline({
  values,
  width = 240,
  height = 48,
  color = 'var(--mint)',
  fill = true,
  dot = true,
  animate = true,
  minZero = false,
  className,
}: Props) {
  // Only run the draw-in animation once, on mount. The dependency array
  // is empty on purpose — we don't want to re-animate on each refresh.
  const [drawn, setDrawn] = useState(!animate)
  const idRef = useRef(`sparkFade-${Math.random().toString(36).slice(2, 9)}`)
  useEffect(() => {
    if (!animate) return
    const id = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!Array.isArray(values) || values.length < 2) return null

  const min = minZero ? 0 : Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const padY = 4

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width
    const y = height - padY - ((v - min) / range) * (height - padY * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  const lastIdx = values.length - 1
  const lastX = width
  const lastY = height - padY - ((values[lastIdx] - min) / range) * (height - padY * 2)

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden
    >
      {fill && (
        <defs>
          <linearGradient id={idRef.current} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
      )}
      {fill && (
        <polygon
          points={`0,${height} ${points} ${width},${height}`}
          fill={`url(#${idRef.current})`}
          opacity={drawn ? 1 : 0}
          style={{ transition: 'opacity 600ms ease 200ms' }}
        />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        // Draw-in via stroke-dasharray: dashLen ≈ path length-ish
        // (we use width*2 which is always longer than the diagonal).
        strokeDasharray={animate ? width * 2 : undefined}
        strokeDashoffset={animate && !drawn ? width * 2 : 0}
        style={animate ? { transition: 'stroke-dashoffset 800ms cubic-bezier(0.32, 0.72, 0, 1)' } : undefined}
      />
      {dot && (
        <circle
          cx={lastX}
          cy={lastY}
          r={3}
          fill={color}
          opacity={drawn ? 1 : 0}
          style={{ transition: 'opacity 400ms ease 600ms' }}
        />
      )}
    </svg>
  )
}
