'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './water.module.css'
import WhyBreakdown from './WhyBreakdown'
import { unitLabel } from './state'
import type { WaterActions } from './state'
import type { AccountProfile, TargetBreakdown, WaterState } from './types'

interface Props {
  state: WaterState
  profile: AccountProfile
  todayCount: number
  targetUnits: number
  target: TargetBreakdown
  actions: WaterActions
}

// SVG ring geometry — radius drives both the visible ring and the
// dasharray progress math.
const RING_RADIUS = 112
const RING_CIRC = 2 * Math.PI * RING_RADIUS

/**
 * Hero card — the centerpiece of the water module.
 *
 * Visual language mirrors the landing/pricing canon:
 *   - Circular ring gauge (mint progress arc) with aurora glow behind
 *   - Drifting mint particles (matches LandingParticles)
 *   - Huge Instrument Serif italic count in the center
 *   - Tap-ripple animation on log + number scale-punch
 *
 * Past 100% the ring saturates into a brighter mint and a "healthy zone"
 * pill drops in beneath the visual.
 */
export default function HeroCard({ state, profile, todayCount, targetUnits, target, actions }: Props) {
  const pctRaw = targetUnits > 0 ? (todayCount / targetUnits) * 100 : 0
  const ringPct = Math.min(100, pctRaw)
  const isOver = pctRaw > 100
  const hitTarget = pctRaw >= 100

  // Tap effects — ripple emanates from the ring center; number does a quick
  // scale-punch animation. Each tap appends a unique id so two rapid taps
  // animate independently instead of resetting one another.
  const [ripples, setRipples] = useState<number[]>([])
  const [punch, setPunch] = useState(false)
  const rippleIdRef = useRef(0)
  const punchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (punchTimerRef.current) clearTimeout(punchTimerRef.current)
  }, [])

  function handleDrink() {
    actions.drank()
    const id = ++rippleIdRef.current
    setRipples(prev => [...prev, id])
    setTimeout(() => setRipples(prev => prev.filter(x => x !== id)), 1200)
    setPunch(true)
    if (punchTimerRef.current) clearTimeout(punchTimerRef.current)
    punchTimerRef.current = setTimeout(() => setPunch(false), 360)
  }

  const labelPlural = unitLabel(state, true)
  const labelSingular = unitLabel(state, false)

  let helper: string
  let helperGood = false
  if (todayCount === 0) {
    helper = 'Start the day. First one in.'
  } else if (pctRaw < 50) {
    helper = 'Behind pace. Drink one in the next hour.'
  } else if (pctRaw < 100) {
    helper = `${targetUnits - todayCount} to go. Pacing well.`
  } else if (pctRaw < 130) {
    helper = 'Target hit. Top up if you train this evening.'
    helperGood = true
  } else {
    helper = 'Strong. Way past target.'
    helperGood = true
  }

  const progressOffset = RING_CIRC - (ringPct / 100) * RING_CIRC

  return (
    <section className={styles.heroCard}>
      <span className={styles.heroEyebrow}>
        <span className={styles.heroEyebrowMark}>·02</span>
        <span className={styles.heroEyebrowRule} />
        Hydration
      </span>

      <div className={styles.heroVisual}>
        {/* Aurora glow background */}
        <div className={styles.heroAurora} aria-hidden />

        {/* Drifting mint particles — purely decorative */}
        <div className={styles.heroParticles} aria-hidden>
          {Array.from({ length: 8 }).map((_, i) => (
            <span
              key={i}
              className={styles.heroParticle}
              style={{
                left: `${8 + i * 11}%`,
                animationDelay: `${i * 0.9}s`,
                animationDuration: `${5.5 + (i % 3) * 1.2}s`,
              }}
            />
          ))}
        </div>

        {/* Tap ripples — one per recent tap */}
        {ripples.map(id => (
          <span key={id} className={styles.heroRipple} aria-hidden />
        ))}

        {/* Circular ring gauge */}
        <svg
          className={styles.heroRingSvg}
          viewBox="-130 -130 260 260"
          aria-hidden
        >
          <defs>
            <linearGradient id="waterRingGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%"   stopColor="#a7f3d0" />
              <stop offset="100%" stopColor="#6ee7b7" />
            </linearGradient>
            <filter id="ringGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Track */}
          <circle
            cx="0" cy="0"
            r={RING_RADIUS}
            stroke="rgba(255, 255, 255, 0.06)"
            strokeWidth={3}
            fill="none"
          />
          {/* Progress arc */}
          <circle
            cx="0" cy="0"
            r={RING_RADIUS}
            stroke={isOver ? '#a7f3d0' : 'url(#waterRingGrad)'}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={RING_CIRC}
            strokeDashoffset={progressOffset}
            transform="rotate(-90)"
            filter="url(#ringGlow)"
            className={styles.heroRingArc}
          />
          {/* Dot at the head of the progress arc — only when there's progress */}
          {ringPct > 0 && (
            <circle
              cx="0"
              cy={-RING_RADIUS}
              r={4}
              fill="var(--mint)"
              transform={`rotate(${(ringPct / 100) * 360})`}
              className={styles.heroRingDot}
            />
          )}
        </svg>

        {/* Center number */}
        <div className={`${styles.heroNumWrap} ${punch ? styles.heroNumPunch : ''}`}>
          <span className={styles.heroNum}>{todayCount}</span>
          <span className={styles.heroTarget}>
            of {targetUnits} {labelPlural}
          </span>
        </div>
      </div>

      {hitTarget && (
        <div className={styles.zonePill}>
          <span className={styles.zonePillCheck}>✓</span> healthy zone
        </div>
      )}

      <p className={`${styles.helper} ${helperGood ? styles.helperGood : ''}`}>
        {helper}
      </p>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.undoBtn}
          onClick={actions.undo}
          disabled={todayCount <= 0}
          aria-label="Undo last serving"
        >
          −
        </button>
        <button
          type="button"
          className={styles.drinkBtn}
          onClick={handleDrink}
        >
          <span>Drank a {labelSingular}</span>
          <span className={styles.drinkArrow}>↑</span>
        </button>
      </div>

      <WhyBreakdown state={state} profile={profile} target={target} targetUnits={targetUnits} />
    </section>
  )
}
