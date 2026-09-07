import React from 'react'

export interface TickerItem {
  label: string
  value: string
  /** Highlight in the accent color (e.g. the headline metric). */
  live?: boolean
}

export interface TickerProps {
  items: TickerItem[]
  /** Show a pulsing "Live" pip + label at the front. */
  showLive?: boolean
}

/**
 * Ticker — the scrolling stat marquee. Pass an array of {label, value};
 * the track is duplicated so the scroll loops seamlessly. Pauses on hover.
 * Marquee animation is decorative and disabled under reduced-motion.
 */
export default function Ticker({ items, showLive = true }: TickerProps) {
  const row = (
    <>
      {showLive && (
        <span className="dk-ticker__item dk-ticker__item--live">
          <span className="dk-ticker__pip" />
          <b>Live</b>
          <span className="dk-ticker__sep">/</span>
        </span>
      )}
      {items.map((it, i) => (
        <span key={i} className={`dk-ticker__item ${it.live ? 'dk-ticker__item--live' : ''}`}>
          {it.label} <b>{it.value}</b>
          <span className="dk-ticker__sep">/</span>
        </span>
      ))}
    </>
  )

  return (
    <div className="dk-ticker">
      <div className="dk-ticker__track">
        {row}
        {row}
      </div>
    </div>
  )
}
