'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import styles from './welcome.module.css'
import OnboardingChecklist from '@/components/OnboardingChecklist'
import type { OnboardingTask } from '@/lib/onboardingTasks'

// Same dynamic import strategy as the landing page — Three.js is
// client-only, SSR-disabled to keep it out of the server bundle.
const HeroCrystal = dynamic(() => import('@/components/HeroCrystal'), {
  ssr: false,
  loading: () => <div className={styles.gemFallback} aria-hidden />,
})

interface WelcomeScreenProps {
  firstName: string
  tasks: OnboardingTask[]
  /** Current user id — forwarded to the checklist so its localStorage
   *  dismiss-set is scoped per account. */
  userId: string
}

// localStorage key marking that THIS USER has already seen the "Hi, <name>"
// fullscreen greeting. Set the first time they get past the intro (via
// "take me in" or continue-to-dashboard). On subsequent visits to /welcome
// — e.g. tapping the "Finish setup · N left" pill from the dashboard — we
// skip the greeting entirely and land them directly on the checklist
// phase. The full intro is a once-in-an-account-lifetime moment.
//
// Scoped per user id so that back-testing with new accounts (or any user
// signing in on a shared browser) gets a fresh greeting per account
// rather than inheriting the previous tester's "welcomed" flag.
function welcomedKey(userId: string): string {
  return `vitality.welcomed:${userId}`
}

/**
 * The greeting itself. The Ghost gem appears front-and-center in
 * `mode="character"`, doing sporadic jolts + high-duty V flicker. Copy
 * scripts a short, warm three-beat intro that fades in as the user
 * reads — no clutter, no "tour" with five popups. One screen, one
 * personality, one button.
 */
type PulseKind = 'rings' | 'particles' | 'sparkles'
const PULSE_KINDS: PulseKind[] = ['rings', 'particles', 'sparkles']

export default function WelcomeScreen({ firstName, tasks, userId }: WelcomeScreenProps) {
  const router = useRouter()
  // Three-phase flow:
  //   'loading'   — pre-hydration, before we've consulted localStorage.
  //                 Renders only the atmosphere (no gem, no panels) so
  //                 the first paint doesn't show the greeting in the
  //                 wrong position for a returning user.
  //   'greeting'  — original 3-beat reveal + "take me in" CTA. Only
  //                 first-time visitors land here.
  //   'checklist' — gem floated left, checklist on the right. Returning
  //                 visitors land here directly (no greeting), and
  //                 first-time visitors transition into it on "take me
  //                 in" with the slide animation intact.
  const [phase, setPhase] = useState<'loading' | 'greeting' | 'checklist'>('loading')
  const [reveal, setReveal] = useState(0) // 0 → 3, each beat fades in

  // Read the WELCOMED_KEY flag on mount. localStorage isn't available
  // server-side, so SSR + initial hydration both return 'loading';
  // useEffect then resolves to the right phase one frame later.
  useEffect(() => {
    let welcomed = false
    try { welcomed = !!window.localStorage.getItem(welcomedKey(userId)) } catch {}
    setPhase(welcomed ? 'checklist' : 'greeting')
  }, [])
  // Counter + chosen effect for each happy event. Counter keys the
  // effect elements so React remounts them on each pulse (restarting
  // the CSS animation). pulseKind cycles randomly between three
  // effect types so the gem feels varied, never the same pulse twice
  // in a row.
  const [pulse, setPulse] = useState<{ tick: number; kind: PulseKind }>({ tick: 0, kind: 'rings' })
  const lastKindRef = useRef<PulseKind | null>(null)
  const particlesRef = useRef<HTMLDivElement | null>(null)

  function triggerPulse() {
    // Pick a kind different from the last one, so consecutive pulses
    // visibly differ. Three kinds in the pool means at least 1
    // candidate is always available.
    let pick: PulseKind = PULSE_KINDS[Math.floor(Math.random() * PULSE_KINDS.length)]
    while (pick === lastKindRef.current) {
      pick = PULSE_KINDS[Math.floor(Math.random() * PULSE_KINDS.length)]
    }
    lastKindRef.current = pick
    setPulse(p => ({ tick: p.tick + 1, kind: pick }))
  }

  // Pre-compute sparkle positions per pulse — random points around the
  // gem's perimeter (radial offset 32-48% from center). Recomputed each
  // pulse so the sparkle pattern is always different.
  const sparkleDots = useMemo(() => {
    return Array.from({ length: 14 }).map(() => {
      const angle = Math.random() * Math.PI * 2
      const radius = 32 + Math.random() * 16
      return {
        x: 50 + Math.cos(angle) * radius,
        y: 50 + Math.sin(angle) * radius,
        delay: Math.random() * 0.35,
      }
    })
    // re-roll on every tick — using pulse.tick as the dependency
    // forces useMemo to regenerate. eslint-disable-next-line is
    // explicit because the linter doesn't know pulse.tick matters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulse.tick])

  // Three-beat copy reveal, staggered to feel like the gem is
  // "thinking" through each line.
  useEffect(() => {
    const beats = [600, 2100, 3600]
    const timers = beats.map((delay, i) =>
      setTimeout(() => setReveal(i + 1), delay),
    )
    return () => { timers.forEach(clearTimeout) }
  }, [])

  // Drifting mint particle field — same recipe as the landing /
  // session-menu / setup-wizard so the welcome canvas feels of-a-piece
  // with the rest of the app's editorial atmosphere.
  useEffect(() => {
    const root = particlesRef.current
    if (!root) return
    const N = window.innerWidth < 640 ? 14 : 24
    const created: HTMLSpanElement[] = []
    for (let i = 0; i < N; i++) {
      const s = document.createElement('span')
      s.style.left = (Math.random() * 100) + '%'
      s.style.top = (60 + Math.random() * 40) + '%'
      const size = 1.2 + Math.random() * 1.2
      s.style.width = s.style.height = size + 'px'
      const dur = 22 + Math.random() * 28
      s.style.animationDuration = dur + 's'
      s.style.animationDelay = -Math.random() * dur + 's'
      s.style.setProperty('--dx', (Math.random() * 30 - 15) + 'px')
      s.style.setProperty('--dy', -(60 + Math.random() * 50) + 'vh')
      root.appendChild(s)
      created.push(s)
    }
    return () => { created.forEach(s => s.remove()) }
  }, [])

  function handleTakeMeIn() {
    // Mark that the user has seen the greeting so subsequent visits to
    // /welcome skip straight to the checklist phase. Also written in
    // handleContinueToDashboard as a backup for the very-quick-exit path.
    try { window.localStorage.setItem(welcomedKey(userId), '1') } catch {}
    setPhase('checklist')
  }

  function handleContinueToDashboard() {
    try {
      window.localStorage.setItem(welcomedKey(userId), '1')
    } catch {
      // localStorage unavailable (private mode etc.) — harmless.
    }
    router.push('/app')
  }

  const isChecklist = phase === 'checklist'
  const isLoading = phase === 'loading'

  return (
    <main className={`${styles.page} grain-overlay`}>
      <div className={styles.atmosphere} aria-hidden />
      <div className={styles.mountainsLayer} aria-hidden>
        <svg viewBox="0 0 1600 420" preserveAspectRatio="none">
          <defs>
            <linearGradient id="welcome-mt-far" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d1a17" stopOpacity="0" />
              <stop offset="55%" stopColor="#0d1a17" stopOpacity=".55" />
              <stop offset="100%" stopColor="#0d1a17" stopOpacity=".95" />
            </linearGradient>
            <linearGradient id="welcome-mt-near" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#050a09" stopOpacity=".4" />
              <stop offset="60%" stopColor="#050a09" stopOpacity=".95" />
              <stop offset="100%" stopColor="#050a09" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path d="M0,300 L120,230 L210,260 L320,180 L430,220 L560,150 L680,210 L820,170 L960,220 L1100,180 L1240,240 L1380,200 L1500,250 L1600,220 L1600,420 L0,420 Z" fill="url(#welcome-mt-far)" />
          <path d="M0,360 L100,320 L220,340 L340,290 L460,330 L590,300 L720,340 L860,310 L1000,350 L1140,310 L1280,355 L1420,320 L1540,360 L1600,340 L1600,420 L0,420 Z" fill="url(#welcome-mt-near)" />
        </svg>
      </div>
      <div className={styles.particles} ref={particlesRef} aria-hidden />

      <div className={`${styles.shell} ${isChecklist ? styles.shellChecklist : ''}`}>
        {/* While `phase === 'loading'`, render only the atmosphere. This
            avoids the gem flashing in the wrong position (center → left)
            for returning visitors who should land directly on the
            checklist phase. The localStorage check resolves in the very
            next frame after hydration. */}
        {!isLoading && (
        <>
        <div className={`${styles.gemStage} ${isChecklist ? styles.gemStageFloated : ''}`}>
          {/* Happy-pulse effects — one of three CSS-driven bursts
              fires per happy event. The effect type rotates so it
              never repeats twice in a row. Each is keyed by the
              pulse tick so React remounts and restarts the animation.

                rings     — three staggered expanding mint rings
                particles — 14 mint dots radiating outward
                sparkles  — 14 twinkling sparkles around the perimeter
          */}
          {pulse.tick > 0 && pulse.kind === 'rings' && (
            <div key={`rings-${pulse.tick}`} className={styles.pulseLayer} aria-hidden>
              <span className={`${styles.pulseRing} ${styles.pulseRing1}`} />
              <span className={`${styles.pulseRing} ${styles.pulseRing2}`} />
              <span className={`${styles.pulseRing} ${styles.pulseRing3}`} />
            </div>
          )}
          {pulse.tick > 0 && pulse.kind === 'particles' && (
            <div key={`particles-${pulse.tick}`} className={styles.pulseLayer} aria-hidden>
              {Array.from({ length: 14 }).map((_, i) => (
                <span
                  key={i}
                  className={styles.particleDot}
                  style={{ ['--angle' as string]: `${(360 / 14) * i}deg` }}
                />
              ))}
            </div>
          )}
          {pulse.tick > 0 && pulse.kind === 'sparkles' && (
            <div key={`sparkles-${pulse.tick}`} className={styles.pulseLayer} aria-hidden>
              {sparkleDots.map((s, i) => (
                <span
                  key={i}
                  className={styles.sparkleDot}
                  style={{
                    left: `${s.x}%`,
                    top: `${s.y}%`,
                    animationDelay: `${s.delay}s`,
                  }}
                />
              ))}
            </div>
          )}
          <HeroCrystal
            mode="character"
            onHappyStart={triggerPulse}
          />
        </div>

        {/* BOTH panels are always mounted — visibility flips via CSS
            opacity, so there's no layout reflow between phases. The gem
            stays where it is in the column; we only animate transforms
            and fades. This is what makes the transition feel seamless
            instead of "the gem glitches over to the left." */}
        <div className={`${styles.greetingPanel} ${isChecklist ? styles.greetingPanelHidden : ''}`}>
          <div className={styles.copyStack}>
            <p className={`${styles.line} ${reveal >= 1 ? styles.lineIn : ''}`}>
              <span className={styles.muted}>Hi,</span> <em>{firstName}</em>.
            </p>
            <p className={`${styles.line} ${reveal >= 2 ? styles.lineIn : ''}`}>
              I&apos;m your <em>Vitality</em>.
            </p>
            <p className={`${styles.lineSub} ${reveal >= 3 ? styles.lineIn : ''}`}>
              Two quick things and I&apos;ve got your back. Let&apos;s get you set up.
            </p>
          </div>

          <button
            type="button"
            className={`${styles.cta} ${reveal >= 3 ? styles.ctaIn : ''}`}
            onClick={handleTakeMeIn}
            disabled={isChecklist}
          >
            take me in <span aria-hidden>→</span>
          </button>
        </div>

        <div className={`${styles.checklistPanel} ${isChecklist ? styles.checklistPanelVisible : ''}`}>
          {/* Quiet eyebrow gives the cluster a defined header without
              competing with the gem's own GemPrompt line. */}
          <span className={styles.panelEyebrow}>your setup</span>
          <OnboardingChecklist
            tasks={tasks}
            userId={userId}
            appear={isChecklist}
            emptyState={
              <div className={styles.allSet}>
                <span className={styles.allSetEyebrow}>welcome back, {firstName}</span>
                <p className={styles.allSetLine}>
                  <em>You&apos;re all set.</em> I&apos;ve got your training and
                  your numbers. Let&apos;s head into the dashboard.
                </p>
              </div>
            }
          />
          <button
            type="button"
            className={styles.continueBtn}
            onClick={handleContinueToDashboard}
          >
            continue to dashboard <span aria-hidden>→</span>
          </button>
        </div>
        </>
        )}
      </div>
    </main>
  )
}
