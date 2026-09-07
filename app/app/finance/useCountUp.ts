'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Animate a number from its previous value to `value` (easeOutCubic).
 * Respects prefers-reduced-motion (snaps instantly). Used for the headline
 * money figures so they tick up instead of hard-cutting.
 */
export function useCountUp(value: number, duration = 650): number {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)
  const rafRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const from = fromRef.current
    const to = value
    if (reduce || from === to) {
      setDisplay(to)
      fromRef.current = to
      return
    }

    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(from + (to - from) * eased)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = to
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [value, duration])

  return display
}
