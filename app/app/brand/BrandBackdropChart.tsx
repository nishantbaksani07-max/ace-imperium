'use client'

import { useMemo } from 'react'
import styles from './brand.module.css'
import type { Brand } from './types'

/**
 * Ambient backdrop graph behind the account cards. Draws each account's follower
 * history as a faint, animated line (draws in on mount, then drifts slowly). When
 * there isn't real multi-point history yet, it falls back to a few gentle decorative
 * waves so the space still feels alive. Purely decorative — aria-hidden.
 */

const W = 1000
const H = 240

function linePath(values: number[]): string {
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const pad = 18
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * W
      const y = H - pad - ((v - min) / range) * (H - pad * 2)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

/** Deterministic sine wave (no randomness → no hydration drift), trending up. */
function wavePath(amp: number, phase: number, freq: number): string {
  const N = 64
  const mid = H * 0.62
  const pts: string[] = []
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const x = t * W
    const y = mid + Math.sin(t * Math.PI * 2 * freq + phase) * amp - t * 46 // gentle upward trend
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
  }
  return pts.join(' ')
}

export default function BrandBackdropChart({ brand }: { brand: Brand }) {
  const lines = useMemo(() => {
    const real = brand.accounts
      .map((a) => (a.history ?? []).map((s) => s.count).filter((v): v is number => typeof v === 'number'))
      .filter((s) => s.length >= 2)
      .map(linePath)
      .filter(Boolean)
    if (real.length) return real
    return [wavePath(20, 0, 1.3), wavePath(26, 2.1, 1.7), wavePath(16, 4.0, 2.2)]
  }, [brand.accounts])

  return (
    <svg
      className={styles.acctBackdropSvg}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <g className={styles.acctBackdropDrift}>
        {lines.map((d, i) => (
          <path key={i} d={d} className={styles.acctBackdropLine} style={{ animationDelay: `${i * 0.35}s` }} />
        ))}
      </g>
    </svg>
  )
}
