'use client'

import { Component, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import styles from './vitalityIntro.module.css'

/**
 * "The Swipe" app-open splash, ported from the approved
 * public/vitality-intro-a.html. A fixed full-screen black overlay: the V mark
 * streaks in from the right trailing mint motion lines, the VITALITY letters
 * settle right to left in its wake, then the whole splash fades out to reveal
 * the dashboard.
 *
 * Show-once: plays ONCE per browser session (sessionStorage guard), so
 * internal navigations never replay it; a fresh tab or session plays again.
 * First-paint cover: the overlay is part of the server-rendered HTML (initial
 * phase is 'splash'), so on a cold open it covers the dashboard from the very
 * first streamed paint - long before hydration. A tiny inline script right
 * after it runs during HTML parse and hides it synchronously when the session
 * has already played (or storage is unavailable), so the cover is either up
 * from frame one or never visible. On client-side navigations the script does
 * not execute (React-inserted scripts are inert), but useLayoutEffect settles
 * the phase BEFORE paint, so nothing flashes there either.
 *
 * Timing: the splash covers real boot (it releases at
 * max(MIN_BOOT_MS, window 'load'), hard-capped so it can never hang). It is a
 * cover for real work, not an artificial delay.
 *
 * Fail open: every storage/window access is guarded, an error boundary
 * swallows any render crash, and onReveal is ALWAYS called exactly once
 * (skip, release, unmount, or crash), so the dashboard is never blocked.
 */

const SESSION_KEY = 'vitality:intro-played'
const MIN_BOOT_MS = 1800
const REDUCED_BOOT_MS = 900
const HARD_CAP_MS = 4000
const FADE_MS = 560

/* The play/skip decision lives at module scope so React StrictMode's dev
 * double-mount reuses the first answer (the sessionStorage guard alone would
 * make the second mount skip). consume() flips it to skip once the splash has
 * actually run, so client-side navigations back to the dashboard never replay. */
let decision: 'play' | 'skip' | null = null

function decide(): 'play' | 'skip' {
  if (decision) return decision
  try {
    if (window.sessionStorage.getItem(SESSION_KEY)) {
      decision = 'skip'
    } else {
      window.sessionStorage.setItem(SESSION_KEY, String(Date.now()))
      decision = 'play'
    }
  } catch {
    /* storage unavailable (private mode etc): fail open, no splash */
    decision = 'skip'
  }
  return decision
}

function consume() {
  decision = 'skip'
}

type Phase = 'idle' | 'splash' | 'fading' | 'done'

interface IntroProps {
  /** Called exactly once, when the splash starts fading (or immediately when
   *  it skips or fails). The dashboard uses it to arm its own entrance. */
  onReveal: () => void
}

export default function VitalityIntro({ onReveal }: IntroProps) {
  return (
    <IntroBoundary onReveal={onReveal}>
      <IntroInner onReveal={onReveal} />
    </IntroBoundary>
  )
}

/** Any crash inside the splash reveals the dashboard instead of breaking it. */
class IntroBoundary extends Component<IntroProps & { children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    consume()
    try {
      this.props.onReveal()
    } catch {
      /* nothing left to do: the dashboard is already rendered beneath */
    }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

function IntroInner({ onReveal }: IntroProps) {
  // Start at 'splash' so SSR + first client render both emit the overlay:
  // the cover is in the HTML before hydration, never popping in late.
  const [phase, setPhase] = useState<Phase>('splash')
  const revealSent = useRef(false)

  const send = () => {
    if (revealSent.current) return
    revealSent.current = true
    try {
      onReveal()
    } catch {
      /* reveal callback failed: dashboard is visible anyway (fail open) */
    }
  }

  // Decide before first client paint: keep playing, or unmount the overlay
  // (the inline script below already hid it pre-paint on a hydrated skip).
  useLayoutEffect(() => {
    if (decide() === 'skip') {
      send()
      setPhase('done')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (phase !== 'splash') return
    const started = Date.now()
    const timers: number[] = []
    let minDone = false
    let loadDone = typeof document !== 'undefined' && document.readyState === 'complete'
    let released = false

    const release = () => {
      if (released || !minDone || !loadDone) return
      released = true
      consume()
      send()
      setPhase('fading')
      timers.push(window.setTimeout(() => setPhase('done'), FADE_MS))
    }

    let reduced = false
    try {
      reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      /* matchMedia unavailable: use the full duration */
    }
    timers.push(
      window.setTimeout(() => {
        minDone = true
        release()
      }, reduced ? REDUCED_BOOT_MS : MIN_BOOT_MS),
    )
    const onLoad = () => {
      loadDone = true
      release()
    }
    if (!loadDone) window.addEventListener('load', onLoad)
    // Never hold the app hostage: force-release even if 'load' stalls.
    timers.push(
      window.setTimeout(() => {
        minDone = true
        loadDone = true
        release()
      }, HARD_CAP_MS),
    )

    return () => {
      timers.forEach((t) => window.clearTimeout(t))
      window.removeEventListener('load', onLoad)
      // A real unmount mid-splash (navigation) must not replay later and must
      // still reveal. StrictMode's instant dev remount (< 250ms) is exempt so
      // the splash survives it.
      if (Date.now() - started > 250) {
        consume()
        send()
      }
    }
  }, [phase])

  if (phase === 'idle' || phase === 'done') return null

  const letters = 'VITALITY'.split('')
  return (
    <>
    {/* suppressHydrationWarning: the parse-time script below may have stamped
        style="display:none" on the server HTML before React hydrates. */}
    <div
      id="vitality-intro"
      suppressHydrationWarning
      className={`${styles.overlay}${phase === 'fading' ? ` ${styles.hide}` : ''}`}
      aria-hidden="true"
    >
      <div className={styles.lockup}>
        <div className={styles.vWrap}>
          <div className={styles.vGlow} />
          <div className={`${styles.streak} ${styles.s1}`} />
          <div className={`${styles.streak} ${styles.s2}`} />
          <svg className={styles.vSvg} viewBox="0 0 100 100" aria-label="Vitality mark">
            <defs>
              <linearGradient id="vitality-intro-vg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#9be7b8" />
                <stop offset="1" stopColor="#6EE7B7" />
              </linearGradient>
            </defs>
            <path d="M20 10 L50 90" stroke="url(#vitality-intro-vg)" strokeWidth="11" strokeLinecap="round" fill="none" />
            <path d="M50 90 L76 34" stroke="url(#vitality-intro-vg)" strokeWidth="9" strokeLinecap="round" fill="none" />
          </svg>
        </div>
        <div className={styles.word}>
          {letters.map((ch, i) => (
            <span
              key={i}
              className={styles.lt}
              style={{ ['--d' as string]: `${(0.12 + (letters.length - 1 - i) * 0.075).toFixed(3)}s` }}
            >
              {ch}
            </span>
          ))}
        </div>
      </div>
    </div>
    {/* Runs during HTML parse, BEFORE first paint: hides the SSR'd cover when
        this session already played (or storage is unavailable - fail open). */}
    <script
      dangerouslySetInnerHTML={{
        __html:
          "try{if(sessionStorage.getItem('vitality:intro-played'))document.getElementById('vitality-intro').style.display='none'}catch(e){document.getElementById('vitality-intro').style.display='none'}",
      }}
    />
    </>
  )
}
