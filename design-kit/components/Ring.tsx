import React from 'react'

export interface RingProps {
  /** 0–100. Determines how far the arc fills. */
  value: number
  /** Diameter in px. */
  size?: number
  /** Stroke thickness in px. */
  stroke?: number
  /** Optional caption under the number (e.g. "Today overall"). */
  label?: string
  /** Override the big center number (defaults to the rounded value). */
  display?: React.ReactNode
}

/**
 * Ring — the signature SVG progress gauge. A glowing mint arc over a
 * faint track, with a serif-italic number in the middle. Pure prop-driven
 * (no state, no data deps) — feed it any 0–100 value.
 */
export default function Ring({
  value,
  size = 188,
  stroke = 8,
  label,
  display,
}: RingProps) {
  const v = Math.max(0, Math.min(100, value))
  const r = (size - stroke) / 2
  const cx = size / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - v / 100)
  const numSize = Math.round(size * 0.33)

  return (
    <div className="dk-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="dk-ring__track" cx={cx} cy={cx} r={r} fill="none" strokeWidth={stroke} />
        <circle
          className="dk-ring__fill"
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="dk-ring__center">
        <span className="dk-ring__num" style={{ fontSize: numSize }}>
          {display ?? Math.round(v)}
        </span>
        {label && <span className="dk-ring__label">{label}</span>}
      </div>
    </div>
  )
}
