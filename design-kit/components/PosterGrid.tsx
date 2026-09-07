import React, { useRef } from 'react'

export type PosterArt = 'aurora' | 'grid' | 'dots' | 'duotone' | 'frosted'
export type PosterSlot = 'hero' | 'wideTop' | 'tall' | 'square' | 'wideBot'

export interface PosterConfig {
  /** Which built-in animated art background to render. */
  art: PosterArt
  /** Bento placement. */
  slot: PosterSlot
  /** Serif-italic label, bottom-left. Omit for a "concept"/coming-soon tile. */
  label?: string
  /** Arbitrary id passed back to onSelect when the tile is clicked. */
  id?: string
  /** When true, renders the active "→" affordance + mint hover glow. */
  active?: boolean
}

export interface PosterGridProps {
  posters: PosterConfig[]
  /** Fired with the poster's id (or its index) when a tile is clicked. */
  onSelect?: (id: string, index: number) => void
}

const ART_CLASS: Record<PosterArt, string> = {
  aurora: 'dk-art--aurora',
  grid: 'dk-art--grid',
  dots: 'dk-art--dots',
  duotone: 'dk-art--duotone',
  frosted: 'dk-art--frosted',
}

const SLOT_CLASS: Record<PosterSlot, string> = {
  hero: 'dk-poster--hero',
  wideTop: 'dk-poster--wideTop',
  tall: 'dk-poster--tall',
  square: 'dk-poster--square',
  wideBot: 'dk-poster--wideBot',
}

/**
 * PosterGrid — animated bento grid of poster tiles with cursor-tracking
 * parallax on the artwork. Framework-agnostic: tiles are <button>s that
 * call onSelect (swap in your own router at the call site). Ported from
 * the source app's dashboard grid, stripped of next/link.
 */
export default function PosterGrid({ posters, onSelect }: PosterGridProps) {
  const artRefs = useRef<Array<HTMLDivElement | null>>([])

  const onMove = (i: number) => (e: React.PointerEvent<HTMLElement>) => {
    const el = e.currentTarget
    const art = artRefs.current[i]
    if (!art) return
    const rect = el.getBoundingClientRect()
    const dx = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2)
    const dy = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2)
    art.style.transform = `translate3d(${dx * 8}px, ${dy * 8}px, 0)`
  }

  const onLeave = (i: number) => () => {
    const art = artRefs.current[i]
    if (art) art.style.transform = 'translate3d(0, 0, 0)'
  }

  return (
    <div className="dk-grid">
      {posters.map((p, i) => {
        const indexLabel = `·${String(i + 1).padStart(2, '0')}`
        const cls = [
          'dk-poster',
          SLOT_CLASS[p.slot],
          p.active ? 'dk-poster--active' : '',
        ].filter(Boolean).join(' ')

        return (
          <button
            key={i}
            type="button"
            className={cls}
            onPointerMove={onMove(i)}
            onPointerLeave={onLeave(i)}
            onClick={() => onSelect?.(p.id ?? String(i), i)}
          >
            <div
              ref={el => { artRefs.current[i] = el }}
              className={`dk-poster__art ${ART_CLASS[p.art]}`}
            />
            <span className="dk-poster__index">{indexLabel}</span>
            {p.label && <span className="dk-poster__label">{p.label}</span>}
            {p.active
              ? <span className="dk-poster__arrow">→</span>
              : <span className="dk-poster__teaser">soon</span>}
          </button>
        )
      })}
    </div>
  )
}
