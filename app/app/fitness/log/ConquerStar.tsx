'use client'

import type React from 'react'
import { useEffect, useState } from 'react'
import styles from './conquerStar.module.css'

/**
 * Lift-conquered celebration overlay. Bump `token` (a counter) to fire a
 * momentary star burst that auto-dismisses. Each fire rolls a RANDOM star
 * shape so the reward stays fresh. Self-contained + pointer-events:none, so it
 * never blocks taps and never clips at a phone edge. token 0 renders nothing.
 */

// Crisp, premium star shapes. The first path carries the edge stroke; extra
// paths (e.g. the twin spark's companion) are fill-only.
const SHAPES: string[][] = [
  // sparkle — 4-point with concave sides
  ['M50 3 C54 33 67 46 97 50 C67 54 54 67 50 97 C46 67 33 54 3 50 C33 46 46 33 50 3 Z'],
  // classic crisp 5-point
  ['M50 4 L61.8 34.8 L94.7 36.5 L68.9 57.4 L77.9 89.6 L50 71 L22.1 89.6 L31.1 57.4 L5.3 36.5 L38.2 34.8 Z'],
  // sharp slim 4-point
  ['M50 2 L57 43 L98 50 L57 57 L50 98 L43 57 L2 50 L43 43 Z'],
  // twin spark — a main spark plus a small companion
  [
    'M42 16 C45 41 56 51 79 54 C56 57 45 67 42 92 C39 67 28 57 5 54 C28 51 39 41 42 16 Z',
    'M82 8 C83 20 87 24 97 25 C87 26 83 30 82 42 C81 30 77 26 67 25 C77 24 81 20 82 8 Z',
  ],
]

// Nine sparkles flung around a bounded circle (matches conquerStar.module.css).
const SPARKS = Array.from({ length: 9 }, (_, i) => {
  const a = (i / 9) * Math.PI * 2 + (i % 2 ? 0.32 : 0)
  const dist = 78 * (0.72 + (i % 3) * 0.14)
  return {
    tx: `${(Math.cos(a) * dist).toFixed(1)}px`,
    ty: `${(Math.sin(a) * dist).toFixed(1)}px`,
    s: (0.35 + (i % 3) * 0.18).toFixed(2),
    d: `${560 + (i % 4) * 70}ms`,
  }
})

export default function ConquerStar({ token }: { token: number }) {
  const [shot, setShot] = useState<{ id: number; shape: number } | null>(null)

  useEffect(() => {
    if (!token) return
    // Random shape per fire (client-only effect, so no SSR hydration mismatch).
    setShot({ id: token, shape: Math.floor(Math.random() * SHAPES.length) })
    const t = setTimeout(() => setShot(null), 1350)
    return () => clearTimeout(t)
  }, [token])

  if (!shot) return null
  const paths = SHAPES[shot.shape]
  const gid = `cqGrad${shot.id}`

  return (
    <div className={styles.scrim} aria-hidden="true">
      {/* key remounts the field so the CSS animations restart on every fire */}
      <div className={styles.field} key={shot.id}>
        <span className={styles.glow} />
        <span className={styles.ring} />
        <span className={`${styles.ring} ${styles.ring2}`} />
        {SPARKS.map((p, i) => (
          <span
            key={i}
            className={styles.spark}
            style={{ '--tx': p.tx, '--ty': p.ty, '--s': p.s, '--d': p.d } as React.CSSProperties}
          >
            <svg viewBox="0 0 24 24">
              <path d="M12 0c.6 6 5.4 10.8 12 11.4-6.6.6-11.4 5.4-12 12-.6-6.6-5.4-11.4-12-12C6.6 10.8 11.4 6 12 0z" />
            </svg>
          </span>
        ))}
        <span className={styles.star}>
          <svg viewBox="0 0 100 100">
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#e6fff4" />
                <stop offset="48%" stopColor="#6EE7B7" />
                <stop offset="100%" stopColor="#2fb583" />
              </linearGradient>
            </defs>
            {paths.map((d, i) => (
              <path
                key={i}
                d={d}
                fill={`url(#${gid})`}
                stroke={i === 0 ? '#d6ffe9' : 'none'}
                strokeWidth={i === 0 ? 1.1 : 0}
                strokeLinejoin="round"
              />
            ))}
          </svg>
        </span>
      </div>
      <span className={styles.tag}>Conquered</span>
    </div>
  )
}
