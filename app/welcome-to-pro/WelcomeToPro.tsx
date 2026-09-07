'use client'

import confetti from 'canvas-confetti'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

import styles from './welcomeToPro.module.css'

interface WelcomeToProProps {
  firstName: string | null
}

// Warm celebration palette — mint (brand anchor) joined by peach, cream,
// soft amber, and gold. Deliberately NOT party-store rainbow; the warmth
// is tasteful. Each color is hand-picked to feel like morning light.
const CONFETTI_COLORS = [
  '#6EE7B7', // mint
  '#FBBF24', // amber
  '#FDE68A', // soft amber
  '#FECACA', // peach
  '#FFE4C4', // bisque
  '#FFFFFF', // cream
]

/**
 * The single highest-emotion moment in the user's lifetime with the
 * product: they just paid. This screen exists to honour that moment.
 *
 * See memory:vitality-as-character — Vitality is a made-up character
 * that loves the user. The voice is first-person ("I'm so glad you're
 * here"), not corporate ("Welcome to Pro!"). Confetti is real, colours
 * are warm, copy is intimate.
 */
export default function WelcomeToPro({ firstName }: WelcomeToProProps) {
  const router = useRouter()
  const firedRef = useRef(false)

  // Fire the confetti once on mount. Two staggered bursts from the
  // bottom corners + one center pop, then a slower trickle for 1.5s
  // so the screen feels alive but not chaotic.
  useEffect(() => {
    if (firedRef.current) return
    firedRef.current = true

    // Respect reduced-motion users — skip the animation entirely.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    const fire = (originX: number, particleCount = 80, spread = 70) =>
      confetti({
        particleCount,
        startVelocity: 45,
        spread,
        ticks: 220,
        gravity: 0.9,
        scalar: 1.0,
        origin: { x: originX, y: 0.85 },
        colors: CONFETTI_COLORS,
        shapes: ['square', 'circle'],
        disableForReducedMotion: true,
      })

    // Two corner bursts that arc toward the center.
    fire(0.1, 110, 80)
    setTimeout(() => fire(0.9, 110, 80), 120)
    // One celebratory pop straight up the middle, slightly delayed.
    setTimeout(
      () =>
        confetti({
          particleCount: 140,
          startVelocity: 55,
          spread: 360,
          ticks: 260,
          gravity: 0.8,
          scalar: 1.1,
          origin: { x: 0.5, y: 0.6 },
          colors: CONFETTI_COLORS,
          shapes: ['square', 'circle'],
          disableForReducedMotion: true,
        }),
      280
    )
    // Trickle: small bursts every 250ms for 1.5s so the joy lingers.
    const trickle = window.setInterval(() => {
      confetti({
        particleCount: 25,
        startVelocity: 25,
        spread: 60,
        ticks: 200,
        gravity: 0.9,
        origin: { x: Math.random(), y: Math.random() * 0.3 },
        colors: CONFETTI_COLORS,
        shapes: ['square', 'circle'],
        disableForReducedMotion: true,
      })
    }, 250)
    const stop = window.setTimeout(() => window.clearInterval(trickle), 1800)
    return () => {
      window.clearInterval(trickle)
      window.clearTimeout(stop)
    }
  }, [])

  return (
    <main className={styles.page}>
      {/* Warm atmosphere — peach + amber + soft gold radial washes. The
          mint stays only as a quiet underglow so brand continuity holds. */}
      <div className={styles.atmosphere} aria-hidden />
      <div className={styles.glow} aria-hidden />

      <div className={styles.shell}>
        <p className={styles.eyebrow}>
          <span className={styles.eyebrowRule} aria-hidden />
          You&apos;re in
        </p>

        <h1 className={styles.headline}>
          <em>
            {firstName ? `So glad you're here, ${firstName}.` : "I'm so glad you're here."}
          </em>
        </h1>

        <p className={styles.subhead}>
          Vitality is yours now. Your dashboard, your data, your morning ritual.
          <br />
          Let&apos;s get your life sorted.
        </p>

        <section className={styles.unlocked} aria-labelledby="unlocked-heading">
          <h2 id="unlocked-heading" className={styles.unlockedHeading}>
            <em>What you just unlocked</em>
          </h2>
          <ul className={styles.unlockedList}>
            <li>
              <span className={styles.unlockedDot} aria-hidden>·</span>
              <span><strong>Workout logger</strong> — every set tracked, tailored starting weights</span>
            </li>
            <li>
              <span className={styles.unlockedDot} aria-hidden>·</span>
              <span><strong>Finance</strong> — net worth, subs, orders, wishlist, live FX</span>
            </li>
            <li>
              <span className={styles.unlockedDot} aria-hidden>·</span>
              <span><strong>Mentor</strong> — your AI co-pilot, tailored to you</span>
            </li>
            <li>
              <span className={styles.unlockedDot} aria-hidden>·</span>
              <span><strong>Peak</strong> — recovery + readiness tracking</span>
            </li>
            <li>
              <span className={styles.unlockedDot} aria-hidden>·</span>
              <span><strong>Every future module</strong>, the moment it ships, free for you</span>
            </li>
            <li>
              <span className={styles.unlockedDot} aria-hidden>·</span>
              <span>Your data exports as JSON, anytime</span>
            </li>
          </ul>
        </section>

        <button
          type="button"
          className={styles.cta}
          onClick={() => router.push('/app')}
        >
          Take me home
          <span className={styles.ctaArrow} aria-hidden>→</span>
        </button>

        <p className={styles.founderNote}>
          <em>From Alex + Sam — the brothers who built this for themselves first. Thanks for trusting us with your mornings.</em>
        </p>
      </div>
    </main>
  )
}
