'use client'

import { useEffect, useRef } from 'react'
import styles from '../app/landing.module.css'

/**
 * Drifting pinpoints across the landing hero. Procedurally generated client-
 * side (no hydration mismatch — server renders an empty wrapper, the spans
 * appear after mount).
 *
 * Direct port of the IIFE block in `design-iterations/v1/project/index.html`.
 * Each span gets a random x position, start altitude, drift duration, delay,
 * size, and horizontal sway via the `--dx` / `--dy` CSS custom properties
 * which the .particles span @keyframes drift animation reads.
 */
export default function LandingParticles() {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return

    const N = window.innerWidth < 640 ? 10 : 18
    const created: HTMLSpanElement[] = []

    for (let i = 0; i < N; i++) {
      const s = document.createElement('span')
      const x = Math.random() * 100
      const startY = 60 + Math.random() * 40
      const dur = 18 + Math.random() * 22
      const delay = -Math.random() * dur
      const dx = (Math.random() * 30 - 15) + 'px'
      const dy = (-(60 + Math.random() * 50)) + 'vh'
      const size = 1 + Math.random() * 1.2
      s.style.left = x + '%'
      s.style.top = startY + 'vh'
      s.style.width = s.style.height = size + 'px'
      s.style.animationDuration = dur + 's'
      s.style.animationDelay = delay + 's'
      s.style.setProperty('--dx', dx)
      s.style.setProperty('--dy', dy)
      root.appendChild(s)
      created.push(s)
    }

    return () => {
      created.forEach(s => s.remove())
    }
  }, [])

  return <div className={styles.particles} ref={ref} aria-hidden />
}
