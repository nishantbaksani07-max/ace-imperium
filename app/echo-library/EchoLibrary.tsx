'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import CoachGem from '@/components/CoachGem'
import styles from './echoLibrary.module.css'

/**
 * Echo coach lab — a /gem-library-style design surface for Echo, the macro AI
 * recommender coach (the real gem, dodecahedron · iris). Mounts the REAL Echo
 * (CoachGem preset="echo", auto-loop off so we drive it) and gives it the full
 * effect kit: coaching moods (incl. nod / encourage / explain / consider),
 * iris-tinted pulse bursts, and the thinking sonar state. New Echo moves get
 * built and previewed here, then roll into the live coach.
 */

type PulseKind = 'rings' | 'particles' | 'sparkles' | 'rays' | 'confetti' | 'orbit' | 'ponder' | 'bloom' | 'spiral' | 'ripple'
// Random happy pool — ponder is curious-only, excluded from the random picks.
const HAPPY_POOL: PulseKind[] = ['rings', 'particles', 'sparkles', 'rays', 'confetti', 'orbit']

const MOODS: { move: string; label: string }[] = [
  { move: 'happyHello', label: 'hello' },
  { move: 'proud', label: 'nice work' },
  { move: 'excited', label: 'excited' },
  { move: 'love', label: 'love' },
  { move: 'curious', label: 'hmm' },
  { move: 'focus', label: 'focus' },
  { move: 'spin', label: 'spin' },
  { move: 'sleepy', label: 'sleepy' },
]

const COACHING: { move: string; label: string }[] = [
  { move: 'nod', label: 'nod' },
  { move: 'encourage', label: 'encourage' },
  { move: 'explain', label: 'explain' },
  { move: 'consider', label: 'consider' },
  { move: 'listening', label: 'listening' },
  { move: 'concern', label: 'concern' },
  { move: 'idea', label: 'idea' },
]

const BURSTS: { kind: PulseKind; label: string }[] = [
  { kind: 'rings', label: 'rings' },
  { kind: 'particles', label: 'particles' },
  { kind: 'sparkles', label: 'sparkles' },
  { kind: 'rays', label: 'rays' },
  { kind: 'confetti', label: 'confetti' },
  { kind: 'orbit', label: 'orbit' },
  { kind: 'ponder', label: 'ponder' },
  { kind: 'bloom', label: 'bloom' },
  { kind: 'spiral', label: 'spiral' },
  { kind: 'ripple', label: 'ripple' },
]

// Celebration moves — wins + hype. Each also fires a random pulse burst.
const CELEBRATION: { move: string; label: string }[] = [
  { move: 'highfive', label: 'high five' },
  { move: 'pumpUp', label: "let's go" },
  { move: 'levelup', label: 'level up' },
  { move: 'lift', label: 'lift' },
  { move: 'celebrate', label: 'celebrate' },
  { move: 'cheer', label: 'cheer' },
  { move: 'win', label: 'win' },
  { move: 'twinkle', label: 'twinkle' },
]

// Expressions — personality / come-alive beats.
const EXPRESSIONS: { move: string; label: string }[] = [
  { move: 'wobble', label: 'wobble' },
  { move: 'glitch', label: 'glitch' },
  { move: 'groove', label: 'groove' },
]

export default function EchoLibrary() {
  const gem = useRef<((move: string) => void) | null>(null)
  const fire = (move: string) => gem.current?.(move)

  const [pulse, setPulse] = useState<{ tick: number; kind: PulseKind }>({ tick: 0, kind: 'rings' })
  const lastKind = useRef<PulseKind | null>(null)
  const [sleeping, setSleeping] = useState(false)
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadBeat, setLoadBeat] = useState<{ tick: number; phase: 'beat' | 'resolve' }>({ tick: 0, phase: 'beat' })
  const particlesRef = useRef<HTMLDivElement | null>(null)

  function firePulse(kind?: PulseKind) {
    let pick = kind ?? HAPPY_POOL[Math.floor(Math.random() * HAPPY_POOL.length)]
    if (!kind) {
      while (pick === lastKind.current) pick = HAPPY_POOL[Math.floor(Math.random() * HAPPY_POOL.length)]
    }
    lastKind.current = pick
    setPulse((p) => ({ tick: p.tick + 1, kind: pick }))
  }

  // Celebration moves fire a random pulse burst alongside the choreography.
  const MOVE_BURST_KINDS: PulseKind[] = ['rings', 'particles', 'sparkles', 'rays', 'confetti', 'orbit', 'bloom', 'spiral', 'ripple']
  const moveBurst = (move: string) => {
    gem.current?.(move)
    firePulse(MOVE_BURST_KINDS[Math.floor(Math.random() * MOVE_BURST_KINDS.length)])
  }

  function startSleep() {
    if (sleepTimer.current) clearTimeout(sleepTimer.current)
    setSleeping(true)
    sleepTimer.current = setTimeout(() => setSleeping(false), 8200)
  }
  function endSleep() {
    if (sleepTimer.current) { clearTimeout(sleepTimer.current); sleepTimer.current = null }
    setSleeping(false)
  }

  // Random sparkle positions, re-rolled per fire.
  const sparkleDots = useMemo(() => Array.from({ length: 14 }).map(() => {
    const a = Math.random() * Math.PI * 2
    const r = 32 + Math.random() * 16
    return { x: 50 + Math.cos(a) * r, y: 50 + Math.sin(a) * r, delay: Math.random() * 0.35 }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [pulse.tick])

  // Drifting iris particle field.
  useEffect(() => {
    const root = particlesRef.current
    if (!root) return
    const N = window.innerWidth < 640 ? 14 : 22
    const created: HTMLSpanElement[] = []
    for (let i = 0; i < N; i++) {
      const s = document.createElement('span')
      s.style.left = Math.random() * 100 + '%'
      s.style.top = 60 + Math.random() * 40 + '%'
      const size = 1.2 + Math.random() * 1.2
      s.style.width = s.style.height = size + 'px'
      const dur = 22 + Math.random() * 28
      s.style.animationDuration = dur + 's'
      s.style.animationDelay = -Math.random() * dur + 's'
      s.style.setProperty('--dx', Math.random() * 30 - 15 + 'px')
      s.style.setProperty('--dy', -(60 + Math.random() * 50) + 'vh')
      root.appendChild(s)
      created.push(s)
    }
    return () => { created.forEach((s) => s.remove()) }
  }, [])

  // Echo greets you when the lab opens.
  useEffect(() => {
    const t = setTimeout(() => gem.current?.('happyHello'), 1300)
    return () => clearTimeout(t)
  }, [])

  return (
    <main className={`${styles.page} grain-overlay`}>
      <div className={styles.atmosphere} aria-hidden />
      <div className={styles.particles} ref={particlesRef} aria-hidden />

      <header className={styles.head}>
        <span className={styles.eyebrow}>echo · coach lab</span>
        <h1 className={styles.title}>Echo</h1>
        <p className={styles.sub}>
          The lab for Echo, the macro AI recommender coach. The real gem from gem-library v2,
          dodecahedron · iris, with coaching moods, iris pulse bursts and a thinking state.
        </p>
      </header>

      <div className={styles.shell}>
        <div className={styles.gemStage}>
          {/* iris burst layers, keyed by tick so each fire restarts the animation */}
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
                <span key={i} className={styles.particleDot} style={{ ['--angle' as string]: `${(360 / 14) * i}deg` }} />
              ))}
            </div>
          )}
          {pulse.tick > 0 && pulse.kind === 'sparkles' && (
            <div key={`sparkles-${pulse.tick}`} className={styles.pulseLayer} aria-hidden>
              {sparkleDots.map((s, i) => (
                <span key={i} className={styles.sparkleDot} style={{ left: `${s.x}%`, top: `${s.y}%`, animationDelay: `${s.delay}s` }} />
              ))}
            </div>
          )}
          {pulse.tick > 0 && pulse.kind === 'rays' && (
            <div key={`rays-${pulse.tick}`} className={styles.pulseLayer} aria-hidden>
              {Array.from({ length: 16 }).map((_, i) => (
                <span key={i} className={styles.rayLine} style={{ ['--angle' as string]: `${(360 / 16) * i}deg`, ['--len' as string]: i % 2 ? '1.35' : '0.8', animationDelay: `${(i % 2) * 0.05}s` }} />
              ))}
            </div>
          )}
          {pulse.tick > 0 && pulse.kind === 'confetti' && (
            <div key={`confetti-${pulse.tick}`} className={styles.pulseLayer} aria-hidden>
              {Array.from({ length: 22 }).map((_, i) => (
                <span key={i} className={styles.confettiBit} style={{ ['--angle' as string]: `${(360 / 22) * i + (i % 3) * 6}deg`, ['--dist' as string]: `${196 + (i % 5) * 30}px`, ['--spin' as string]: `${(i % 2 ? 1 : -1) * (540 + (i % 3) * 220)}deg`, animationDelay: `${(i % 5) * 0.035}s`, opacity: i % 2 ? 1 : 0.8 }} />
              ))}
            </div>
          )}
          {pulse.tick > 0 && pulse.kind === 'orbit' && (
            <div key={`orbit-${pulse.tick}`} className={styles.pulseLayer} aria-hidden>
              {Array.from({ length: 13 }).map((_, i) => (
                <span key={i} className={styles.orbitDot} style={{ ['--start' as string]: `${(360 / 13) * i}deg`, ['--sweep' as string]: `${i % 2 ? 300 : -300}deg`, animationDelay: `${i * 0.04}s` }} />
              ))}
            </div>
          )}
          {pulse.tick > 0 && pulse.kind === 'ponder' && (
            <div key={`ponder-${pulse.tick}`} className={styles.pulseLayer} aria-hidden>
              <span className={styles.ponderRing} />
              <span className={styles.ponderGlow} />
              {Array.from({ length: 14 }).map((_, i) => (
                <span key={i} className={styles.ponderMote} style={{ ['--angle' as string]: `${(360 / 14) * i + 10}deg`, animationDelay: `${(i % 3) * 0.05}s` }} />
              ))}
            </div>
          )}

          {pulse.tick > 0 && pulse.kind === 'bloom' && (
            <div key={`bloom-${pulse.tick}`} className={styles.pulseLayer} aria-hidden>
              {Array.from({ length: 6 }).map((_, i) => (
                <span key={i} className={styles.bloomPetal} style={{ ['--angle' as string]: `${(360 / 6) * i}deg`, animationDelay: `${(i % 2) * 0.06}s` }} />
              ))}
            </div>
          )}
          {pulse.tick > 0 && pulse.kind === 'spiral' && (
            <div key={`spiral-${pulse.tick}`} className={styles.pulseLayer} aria-hidden>
              {Array.from({ length: 16 }).map((_, i) => (
                <span key={i} className={styles.spiralDot} style={{ ['--angle' as string]: `${(360 / 16) * i}deg`, ['--spin' as string]: `${140 + (i % 4) * 30}deg`, animationDelay: `${i * 0.03}s` }} />
              ))}
            </div>
          )}
          {pulse.tick > 0 && pulse.kind === 'ripple' && (
            <div key={`ripple-${pulse.tick}`} className={styles.pulseLayer} aria-hidden>
              <span className={`${styles.rippleRing} ${styles.rippleRing1}`} />
              <span className={`${styles.rippleRing} ${styles.rippleRing2}`} />
              <span className={`${styles.rippleRing} ${styles.rippleRing3}`} />
            </div>
          )}

          {/* thinking sonar ring */}
          {loadBeat.tick > 0 && (
            <span
              key={`lr-${loadBeat.tick}`}
              className={loadBeat.phase === 'resolve' ? `${styles.loadRing} ${styles.loadRingResolve}` : styles.loadRing}
              aria-hidden
            />
          )}

          {/* sleepy z's */}
          {sleeping && (
            <div className={styles.sleepZs} aria-hidden>
              {Array.from({ length: 3 }).map((_, i) => (
                <span key={i} className={styles.sleepZ} style={{ animationDelay: `${i * 1.5}s` }}>z</span>
              ))}
            </div>
          )}

          <CoachGem
            preset="echo"
            signature={null}
            controlRef={gem}
            loading={loading}
            onHappyStart={() => firePulse()}
            onLoadingBeat={(phase) => setLoadBeat((b) => ({ tick: b.tick + 1, phase }))}
            onMoveGlyph={(move, phase) => {
              if (move === 'curious') firePulse('ponder')
              else if (move === 'sleepy' && phase === 'sleep') startSleep()
              else if (move === 'sleepy' && phase === 'wake') { endSleep(); firePulse('rays') }
            }}
          />
        </div>

        <div className={styles.deck}>
          <section className={styles.controls}>
            <span className={styles.eyebrowSm}>coach moods</span>
            <div className={styles.row}>
              {MOODS.map((m) => (
                <button key={m.move} type="button" className={styles.btn} onClick={() => fire(m.move)}>{m.label}</button>
              ))}
            </div>
          </section>

          <section className={styles.controls}>
            <span className={styles.eyebrowSm}>coaching</span>
            <div className={styles.row}>
              {COACHING.map((m) => (
                <button key={m.move} type="button" className={styles.btn} onClick={() => fire(m.move)}>{m.label}</button>
              ))}
            </div>
          </section>

          <section className={styles.controls}>
            <span className={styles.eyebrowSm}>celebration</span>
            <div className={styles.row}>
              {CELEBRATION.map((m) => (
                <button key={m.move} type="button" className={styles.btn} onClick={() => moveBurst(m.move)}>{m.label}</button>
              ))}
            </div>
          </section>

          <section className={styles.controls}>
            <span className={styles.eyebrowSm}>expressions</span>
            <div className={styles.row}>
              {EXPRESSIONS.map((m) => (
                <button key={m.move} type="button" className={styles.btn} onClick={() => fire(m.move)}>{m.label}</button>
              ))}
            </div>
          </section>

          <section className={styles.controls}>
            <span className={styles.eyebrowSm}>pulse bursts</span>
            <div className={styles.row}>
              {BURSTS.map((b) => (
                <button key={b.kind} type="button" className={styles.btn} onClick={() => firePulse(b.kind)}>{b.label}</button>
              ))}
            </div>
          </section>

          <section className={styles.controls}>
            <span className={styles.eyebrowSm}>states</span>
            <div className={styles.row}>
              <button type="button" className={styles.btn} onClick={() => setLoading(true)}>thinking</button>
              <button type="button" className={styles.btn} onClick={() => setLoading(false)}>done</button>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
