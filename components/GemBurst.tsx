'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import styles from './GemBurst.module.css'

/**
 * GemBurst — reusable particle-burst overlay for any Vitality gem, so a page
 * can fire celebratory pulses (rings / particles / sparkles / confetti) without
 * re-implementing the DOM + CSS each time. Pair with HeroCrystal's onHappyStart
 * (ambient warmth) or trigger directly on a real event (a save, a win).
 *
 *   const { burst, fire } = useGemBurst()
 *   <div style={{ position: 'relative' }}>
 *     <GemBurst burst={burst} />
 *     <HeroCrystal mode="character" controlRef={ctrl} />
 *   </div>
 *   // on a win: ctrl.current?.('celebrate'); fire('confetti')
 *
 * The stage element MUST be position:relative so the burst layer overlays it.
 */

export type BurstKind = 'rings' | 'particles' | 'sparkles' | 'confetti' | 'rays' | 'orbit' | 'bloom' | 'spiral' | 'ripple'

export interface BurstState {
  tick: number
  kind: BurstKind
}

const DEFAULT_POOL: BurstKind[] = ['rings', 'particles', 'sparkles']

export function useGemBurst() {
  const [burst, setBurst] = useState<BurstState>({ tick: 0, kind: 'rings' })
  const last = useRef<BurstKind | null>(null)

  /** Fire a burst. Pass a kind, or omit to pick a random one from `pool`. */
  const fire = useCallback((kind?: BurstKind, pool: BurstKind[] = DEFAULT_POOL) => {
    let pick = kind ?? pool[Math.floor(Math.random() * pool.length)]
    if (!kind) {
      let guard = 0
      while (pick === last.current && pool.length > 1 && guard++ < 8) {
        pick = pool[Math.floor(Math.random() * pool.length)]
      }
    }
    last.current = pick
    setBurst((b) => ({ tick: b.tick + 1, kind: pick }))
  }, [])

  return { burst, fire }
}

export function GemBurst({ burst }: { burst: BurstState }) {
  // Random sparkle/confetti placements, re-rolled each fire.
  const sparkles = useMemo(
    () =>
      Array.from({ length: 14 }).map(() => {
        const a = Math.random() * Math.PI * 2
        const r = 32 + Math.random() * 16
        return { x: 50 + Math.cos(a) * r, y: 50 + Math.sin(a) * r, delay: Math.random() * 0.35 }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [burst.tick],
  )

  if (burst.tick === 0) return null

  return (
    <div key={`${burst.kind}-${burst.tick}`} className={styles.layer} aria-hidden>
      {burst.kind === 'rings' && (
        <>
          <span className={`${styles.ring} ${styles.ring1}`} />
          <span className={`${styles.ring} ${styles.ring2}`} />
          <span className={`${styles.ring} ${styles.ring3}`} />
        </>
      )}
      {burst.kind === 'particles' &&
        Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className={styles.particle} style={{ ['--angle' as string]: `${(360 / 14) * i}deg` }} />
        ))}
      {burst.kind === 'sparkles' &&
        sparkles.map((s, i) => (
          <span
            key={i}
            className={styles.sparkle}
            style={{ left: `${s.x}%`, top: `${s.y}%`, animationDelay: `${s.delay}s` }}
          />
        ))}
      {burst.kind === 'confetti' &&
        Array.from({ length: 22 }).map((_, i) => (
          <span
            key={i}
            className={styles.confetti}
            style={{
              ['--angle' as string]: `${(360 / 22) * i + (i % 3) * 5}deg`,
              ['--dist' as string]: `${104 + (i % 5) * 26}px`,
              ['--spin' as string]: `${(i % 2 ? 1 : -1) * (480 + (i % 3) * 200)}deg`,
              animationDelay: `${(i % 5) * 0.03}s`,
              opacity: i % 2 ? 1 : 0.82,
            }}
          />
        ))}
      {burst.kind === 'rays' &&
        Array.from({ length: 16 }).map((_, i) => (
          <span
            key={i}
            className={styles.ray}
            style={{
              ['--angle' as string]: `${(360 / 16) * i}deg`,
              ['--len' as string]: i % 2 ? '1.35' : '0.8',
              animationDelay: `${(i % 2) * 0.05}s`,
            }}
          />
        ))}
      {burst.kind === 'orbit' &&
        Array.from({ length: 13 }).map((_, i) => (
          <span
            key={i}
            className={styles.orbit}
            style={{
              ['--start' as string]: `${(360 / 13) * i}deg`,
              ['--sweep' as string]: `${i % 2 ? 300 : -300}deg`,
              animationDelay: `${i * 0.04}s`,
            }}
          />
        ))}
      {burst.kind === 'bloom' &&
        Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            className={styles.bloom}
            style={{
              ['--angle' as string]: `${(360 / 6) * i}deg`,
              animationDelay: `${(i % 2) * 0.06}s`,
            }}
          />
        ))}
      {burst.kind === 'spiral' &&
        Array.from({ length: 16 }).map((_, i) => (
          <span
            key={i}
            className={styles.spiral}
            style={{
              ['--angle' as string]: `${(360 / 16) * i}deg`,
              ['--spin' as string]: `${140 + (i % 4) * 30}deg`,
              animationDelay: `${i * 0.03}s`,
            }}
          />
        ))}
      {burst.kind === 'ripple' && (
        <>
          <span className={`${styles.ripple} ${styles.ripple1}`} />
          <span className={`${styles.ripple} ${styles.ripple2}`} />
          <span className={`${styles.ripple} ${styles.ripple3}`} />
        </>
      )}
    </div>
  )
}
