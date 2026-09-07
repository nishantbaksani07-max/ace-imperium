'use client'

import Link from 'next/link'
import { useRef } from 'react'
import styles from './PosterGrid.module.css'

/**
 * Configuration for a single poster tile.
 * - `art`: which built-in art variant to render (or 'lines' for the SVG variant)
 * - `grid`: bento placement
 * - `label`: serif italic label (always visible). Omit for "concept" posters.
 * - `href`: makes the poster a navigable Link. Combined with `label` to indicate an active section.
 */
export type PosterArt = 'aurora' | 'grid' | 'dots' | 'duotone' | 'frosted' | 'lines' | 'mountain' | 'plate'
export type PosterGridSlot = 'hero' | 'wideTop' | 'tall' | 'square' | 'wideBot'

export interface PosterConfig {
  art: PosterArt
  grid: PosterGridSlot
  label?: string
  href?: string
}

interface PosterGridProps {
  posters: PosterConfig[]
}

const artClassMap: Record<PosterArt, string> = {
  aurora:   styles.artAurora,
  grid:     styles.artGrid,
  dots:     styles.artDots,
  duotone:  styles.artDuotone,
  frosted:  styles.artFrosted,
  lines:    styles.artLines,
  mountain: styles.artMountain,
  // 'plate' was added to the PosterArt union but no matching CSS class
  // exists in PosterGrid.module.css yet — fall back to the frosted
  // treatment so the type is satisfied and the tile renders cleanly.
  plate:    styles.artFrosted,
}

const gridClassMap: Record<PosterGridSlot, string> = {
  hero:    styles.hero,
  wideTop: styles.wideTop,
  tall:    styles.tall,
  square:  styles.square,
  wideBot: styles.wideBot,
}

/**
 * Bento grid of concept-poster tiles with cursor-tracking parallax.
 * Used by both /app and /app/fitness dashboards. Pass any number of posters;
 * the bento CSS handles up to ~6-8 tiles gracefully on desktop and stacks
 * to a single column on mobile.
 */
export default function PosterGrid({ posters }: PosterGridProps) {
  // Refs are indexed by poster position so each tile's pointer-move handler
  // can write transform directly without React state churn.
  const artRefs = useRef<Array<HTMLDivElement | null>>([])

  function handlePointerMove(index: number) {
    return (e: React.PointerEvent<HTMLElement>) => {
      const el = e.currentTarget
      const art = artRefs.current[index]
      if (!art) return
      const rect = el.getBoundingClientRect()
      const dx = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2)
      const dy = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2)
      const tx = dx * 8
      const ty = dy * 8
      art.style.transform = `translate3d(${tx}px, ${ty}px, 0)`
    }
  }

  function handlePointerLeave(index: number) {
    return () => {
      const art = artRefs.current[index]
      if (art) art.style.transform = 'translate3d(0, 0, 0)'
    }
  }

  return (
    <div className={styles.grid}>
      {posters.map((p, i) => {
        const indexLabel = `·${String(i + 1).padStart(2, '0')}`
        const isActive = !!p.href
        const className = [
          styles.poster,
          gridClassMap[p.grid],
          isActive ? styles.posterActive : '',
        ].filter(Boolean).join(' ')

        const inner = (
          <>
            <div
              ref={el => { artRefs.current[i] = el }}
              className={`${styles.posterArt} ${artClassMap[p.art]}`}
            >
              {p.art === 'lines' ? <LinesArt /> : null}
              {p.art === 'mountain' ? <MountainArt /> : null}
            </div>
            <span className={styles.posterIndex}>{indexLabel}</span>
            {p.label ? <span className={styles.posterLabel}>{p.label}</span> : null}
            {isActive ? (
              <span className={styles.posterArrow}>→</span>
            ) : (
              <span className={styles.posterTeaser}>soon</span>
            )}
          </>
        )

        if (p.href) {
          return (
            <Link
              key={i}
              href={p.href}
              className={className}
              onPointerMove={handlePointerMove(i)}
              onPointerLeave={handlePointerLeave(i)}
            >
              {inner}
            </Link>
          )
        }

        return (
          <div
            key={i}
            className={className}
            onPointerMove={handlePointerMove(i)}
            onPointerLeave={handlePointerLeave(i)}
          >
            {inner}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Mini "Today" thumbnail — mountain curve + NOW dot, ported from the
 * Today.html design bundle thumbnail. Used by the Peak Tracker dashboard
 * tile so the poster mirrors the page it links to.
 */
export function MountainArt() {
  return (
    <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="poster-mtn-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"  stopColor="#6EE7B7" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#6EE7B7" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#6EE7B7" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="poster-mtn-glow" cx="63%" cy="55%" r="20%">
          <stop offset="0%"  stopColor="#6EE7B7" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#6EE7B7" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="760" cy="440" rx="240" ry="120" fill="url(#poster-mtn-glow)" />
      <path
        d="M 120 600 C 250 360, 360 320, 460 380 S 640 600, 760 420 S 980 280, 1080 360 L 1080 660 L 120 660 Z"
        fill="url(#poster-mtn-fill)"
      />
      <path
        d="M 120 600 C 250 360, 360 320, 460 380 S 640 600, 760 420 S 980 280, 1080 360"
        fill="none" stroke="#6EE7B7" strokeWidth="3" strokeLinecap="round"
      />
      <circle cx="760" cy="420" r="22" fill="#6EE7B7" fillOpacity="0.2" />
      <circle cx="760" cy="420" r="8" fill="#6EE7B7" />
      <text
        x="120" y="200"
        fontFamily="'JetBrains Mono', ui-monospace, monospace"
        fontSize="22" fill="#6EE7B7" letterSpacing="6"
        opacity="0.85"
      >PEAKING · 4 PM</text>
    </svg>
  )
}

/**
 * Concentric circles + crossing diagonals at low opacity in mint.
 * Slowly rotates as a group via the parent .artLines svg keyframes.
 */
export function LinesArt() {
  return (
    <svg viewBox="-100 -100 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <g stroke="rgba(110, 231, 183, 0.18)" strokeWidth="0.5" fill="none">
        <circle cx="0" cy="0" r="20" />
        <circle cx="0" cy="0" r="35" />
        <circle cx="0" cy="0" r="55" />
        <circle cx="0" cy="0" r="80" />
      </g>
      <g stroke="rgba(110, 231, 183, 0.25)" strokeWidth="0.4" fill="none">
        <line x1="-90" y1="0" x2="90" y2="0" />
        <line x1="0" y1="-90" x2="0" y2="90" />
        <line x1="-64" y1="-64" x2="64" y2="64" />
        <line x1="-64" y1="64" x2="64" y2="-64" />
      </g>
      <g fill="rgba(110, 231, 183, 0.6)">
        <circle cx="0" cy="0" r="1.5" />
        <circle cx="35" cy="0" r="1" />
        <circle cx="-35" cy="0" r="1" />
        <circle cx="0" cy="35" r="1" />
        <circle cx="0" cy="-35" r="1" />
      </g>
    </svg>
  )
}
