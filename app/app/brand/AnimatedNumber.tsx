'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  value: number
  /** Tween length in ms. Default 900ms feels like an odometer. */
  duration?: number
  /** Locale-formatted by default — pass false for raw integers. */
  format?: (n: number) => string
}

/**
 * Tweens between its current value and the next prop value on update.
 * No animation on first mount (we already show the right number); the
 * count-up only kicks in when the prop changes, which is what makes a
 * refresh feel like a win.
 *
 * easeOutQuint matches the "snap toward target" feel of stock apps —
 * fast at first, slows into the destination.
 */
export default function AnimatedNumber({
  value,
  duration = 900,
  format = (n) => Math.round(n).toLocaleString(),
}: Props) {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (value === fromRef.current) return
    const start = performance.now()
    const from = fromRef.current
    const delta = value - from

    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration)
      // easeOutQuint — sharp at the start, glides into the destination.
      const eased = 1 - Math.pow(1 - t, 5)
      setDisplay(from + delta * eased)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = value
        rafRef.current = null
      }
    }

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [value, duration])

  return <>{format(display)}</>
}
