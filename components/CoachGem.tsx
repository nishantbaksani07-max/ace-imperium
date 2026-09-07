'use client'

import { useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import type { GemTint } from '@/components/HeroCrystal'
import styles from './coachGem.module.css'

/**
 * CoachGem — a reusable Vitality coach gem, built 1:1 on the real gem-library
 * gem (character-mode HeroCrystal). Each coach is a preset of shape + colorway
 * + signature personality. Drop one next to an AI surface and it plays its
 * signature move on a loop so the coach feels alive.
 *
 *   <CoachGem preset="echo" />                  // macro AI recommender coach
 *   <CoachGem preset="echo" size={160} />       // fixed size
 *   <CoachGem preset="echo" controlRef={ref} signature={null} />  // you drive moves
 *
 * Real gems only — never a flat substitute. Size the parent (or pass `size`)
 * to >=280px; gems read muddy smaller.
 */

const HeroCrystal = dynamic(() => import('@/components/HeroCrystal'), {
  ssr: false,
  loading: () => <div className={styles.fallback} aria-hidden />,
})

type Shape = 'icosahedron' | 'dodecahedron' | 'tetrahedron' | 'octahedron'
export type CoachPreset = 'sage' | 'spark' | 'echo'

// The coach family. echo is the macro AI recommender coach (thoughtful,
// curious — asks the right questions, finds the pattern in your meals).
export const COACH_PRESETS: Record<CoachPreset, {
  shape: Shape
  tint: GemTint
  signature: string
  every: number
  delay: number
  /** Coaching-flavored idle pool — the gem plays these on its own between
   *  reactions, so each coach feels alive and inherits new moves automatically. */
  ambient: string[]
}> = {
  sage:  { shape: 'icosahedron',  tint: 'mint',  signature: 'focus',   every: 8000, delay: 1200, ambient: ['focus', 'nod', 'idea', 'happyHello'] },
  spark: { shape: 'octahedron',   tint: 'amber', signature: 'excited', every: 7000, delay: 2600, ambient: ['idea', 'focus', 'groove', 'happyHello'] },
  echo:  { shape: 'dodecahedron', tint: 'iris',  signature: 'curious', every: 9000, delay: 4000, ambient: ['curious', 'listening', 'nod', 'consider', 'idea', 'focus', 'happyHello'] },
}

interface CoachGemProps {
  /** Coach personality preset. Default 'echo' (the macro AI recommender coach). */
  preset?: CoachPreset
  /** Square px size; omit to fill the parent (size the parent >=280px). */
  size?: number
  /** Looped signature move. Defaults to the preset's. Pass `null` to disable the
   *  auto-loop (e.g. when you drive reactions yourself via controlRef). */
  signature?: string | null
  /** Optional handle to trigger moves imperatively (e.g. fire 'proud' when a
   *  recommendation lands). When provided, the auto-loop is OFF — you drive it. */
  controlRef?: { current: ((move: string) => void) | null }
  /** Looping "thinking" state — calm breath + emissive swell (host renders the
   *  sonar ring on the beat callbacks). Forwarded to HeroCrystal. */
  loading?: boolean
  /** Fires when an autonomous/moved happy event starts — host fires a burst. */
  onHappyStart?: () => void
  /** Fires on each loading beat ('beat') and once on completion ('resolve'). */
  onLoadingBeat?: (phase: 'beat' | 'resolve') => void
  /** Fires once as a move's mood glyph lands (curious '?', sleepy 'z' sleep/wake). */
  onMoveGlyph?: (move: string, phase?: string) => void
  className?: string
}

export default function CoachGem({
  preset = 'echo',
  size,
  signature,
  controlRef,
  loading,
  onHappyStart,
  onLoadingBeat,
  onMoveGlyph,
  className = '',
}: CoachGemProps) {
  const p = COACH_PRESETS[preset]
  const move = signature === undefined ? p.signature : signature
  const internalCtrl = useRef<((move: string) => void) | null>(null)
  const ctrl = controlRef ?? internalCtrl

  // Greet once on mount with the signature move (unless the parent drives moves
  // or signature is null). Ongoing "life" now comes from the ambient pool below,
  // so the coach varies its idle and inherits new moves automatically.
  useEffect(() => {
    if (controlRef || !move) return
    const start = setTimeout(() => internalCtrl.current?.(move), p.delay)
    return () => clearTimeout(start)
  }, [controlRef, move, p.delay])

  return (
    <div
      className={`${styles.wrap} ${className}`.trim()}
      style={size ? { width: size, height: size } : undefined}
    >
      <HeroCrystal
        mode="character"
        shape={p.shape}
        tint={p.tint}
        controlRef={ctrl}
        loading={loading}
        onHappyStart={onHappyStart}
        onLoadingBeat={onLoadingBeat}
        onMoveGlyph={onMoveGlyph}
        ambient={p.ambient}
      />
    </div>
  )
}
