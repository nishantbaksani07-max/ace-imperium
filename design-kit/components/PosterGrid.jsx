/**
 * PosterGrid — the signature bento grid of "concept poster" tiles, each with an
 * animated gradient art fill and cursor-tracking parallax. Pass any number of
 * posters; the bento CSS handles ~6 tiles on desktop and stacks to one column
 * on mobile.
 *
 *   <PosterGrid posters={[
 *     { art: 'aurora',  slot: 'hero',    label: 'Training', href: '#' },
 *     { art: 'duotone', slot: 'wideTop', label: 'Fuel',     href: '#' },
 *     { art: 'dots',    slot: 'square',  label: 'Soon' },        // no href → "soon" teaser
 *   ]} />
 *
 * art:  'aurora' | 'grid' | 'dots' | 'duotone' | 'frosted' | 'lines' | 'mountain'
 * slot: 'hero' | 'wideTop' | 'tall' | 'square' | 'wideBot'
 *
 * `href` makes a tile a link (renders <a>; swap for your router's <Link> if you
 * want). Pass `linkComponent` to use a custom link component (e.g. Next's Link).
 */
import React, { useRef } from 'react'

const artClass = {
  aurora: 'dk-art-aurora',
  grid: 'dk-art-grid',
  dots: 'dk-art-dots',
  duotone: 'dk-art-duotone',
  frosted: 'dk-art-frosted',
  lines: 'dk-art-lines',
  mountain: 'dk-art-mountain',
}

const slotClass = {
  hero: 'dk-slot-hero',
  wideTop: 'dk-slot-wideTop',
  tall: 'dk-slot-tall',
  square: 'dk-slot-square',
  wideBot: 'dk-slot-wideBot',
}

export default function PosterGrid({ posters = [], linkComponent: LinkComponent }) {
  const artRefs = useRef([])

  const onMove = (i) => (e) => {
    const el = e.currentTarget
    const art = artRefs.current[i]
    if (!art) return
    const r = el.getBoundingClientRect()
    const dx = (e.clientX - r.left - r.width / 2) / (r.width / 2)
    const dy = (e.clientY - r.top - r.height / 2) / (r.height / 2)
    art.style.transform = `translate3d(${dx * 8}px, ${dy * 8}px, 0)`
  }

  const onLeave = (i) => () => {
    const art = artRefs.current[i]
    if (art) art.style.transform = 'translate3d(0, 0, 0)'
  }

  return (
    <div className="dk-grid">
      {posters.map((p, i) => {
        const isActive = !!p.href
        const cls = [
          'dk-poster',
          slotClass[p.slot] || slotClass.square,
          isActive ? 'dk-poster-active' : '',
        ].filter(Boolean).join(' ')

        const inner = (
          <>
            <div
              ref={(el) => { artRefs.current[i] = el }}
              className={`dk-poster-art ${artClass[p.art] || artClass.aurora}`}
            >
              {p.art === 'lines' ? <LinesArt /> : null}
              {p.art === 'mountain' ? <MountainArt /> : null}
            </div>
            <span className="dk-poster-index">{`·${String(i + 1).padStart(2, '0')}`}</span>
            {p.label ? <span className="dk-poster-label">{p.label}</span> : null}
            {isActive
              ? <span className="dk-poster-arrow">→</span>
              : <span className="dk-poster-teaser">soon</span>}
          </>
        )

        const handlers = { onPointerMove: onMove(i), onPointerLeave: onLeave(i) }

        if (p.href) {
          if (LinkComponent) {
            return (
              <LinkComponent key={i} href={p.href} className={cls} {...handlers}>
                {inner}
              </LinkComponent>
            )
          }
          return (
            <a key={i} href={p.href} className={cls} {...handlers}>
              {inner}
            </a>
          )
        }

        return (
          <div key={i} className={cls} {...handlers}>
            {inner}
          </div>
        )
      })}
    </div>
  )
}

/** Mountain curve + NOW dot — used by the 'mountain' art variant. */
export function MountainArt() {
  return (
    <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="dk-mtn-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#6EE7B7" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#6EE7B7" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#6EE7B7" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="dk-mtn-glow" cx="63%" cy="55%" r="20%">
          <stop offset="0%" stopColor="#6EE7B7" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#6EE7B7" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="760" cy="440" rx="240" ry="120" fill="url(#dk-mtn-glow)" />
      <path
        d="M 120 600 C 250 360, 360 320, 460 380 S 640 600, 760 420 S 980 280, 1080 360 L 1080 660 L 120 660 Z"
        fill="url(#dk-mtn-fill)"
      />
      <path
        d="M 120 600 C 250 360, 360 320, 460 380 S 640 600, 760 420 S 980 280, 1080 360"
        fill="none" stroke="#6EE7B7" strokeWidth="3" strokeLinecap="round"
      />
      <circle cx="760" cy="420" r="22" fill="#6EE7B7" fillOpacity="0.2" />
      <circle cx="760" cy="420" r="8" fill="#6EE7B7" />
    </svg>
  )
}

/** Concentric circles + crossing diagonals — used by the 'lines' art variant. */
export function LinesArt() {
  return (
    <svg viewBox="-100 -100 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <g stroke="rgba(110, 231, 183, 0.18)" strokeWidth="0.5" fill="none">
        <circle cx="0" cy="0" r="20" /><circle cx="0" cy="0" r="35" />
        <circle cx="0" cy="0" r="55" /><circle cx="0" cy="0" r="80" />
      </g>
      <g stroke="rgba(110, 231, 183, 0.25)" strokeWidth="0.4" fill="none">
        <line x1="-90" y1="0" x2="90" y2="0" /><line x1="0" y1="-90" x2="0" y2="90" />
        <line x1="-64" y1="-64" x2="64" y2="64" /><line x1="-64" y1="64" x2="64" y2="-64" />
      </g>
      <g fill="rgba(110, 231, 183, 0.6)">
        <circle cx="0" cy="0" r="1.5" /><circle cx="35" cy="0" r="1" /><circle cx="-35" cy="0" r="1" />
        <circle cx="0" cy="35" r="1" /><circle cx="0" cy="-35" r="1" />
      </g>
    </svg>
  )
}
