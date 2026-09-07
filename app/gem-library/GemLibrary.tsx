'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import styles from './gemLibrary.module.css'

/**
 * Gem Library v2 — the canonical-gem design lab.
 *
 * Clean-slate home for THE gem: the exact character-mode HeroCrystal that
 * lives on /welcome (mint glass icosahedron, engraved V with micro-flicker,
 * Destiny-Ghost jolts + nod + bob, happy eyebrows + synchronized burst).
 * We mount the REAL component — not a re-port — so the gem here is byte-for-
 * byte the /welcome gem. Everything we build (new flickers, movements,
 * rotations, pulse bursts, mood + behavior moves) gets layered on top of
 * this base, one move at a time, and previewed here before it ships.
 *
 * The happy-burst wiring (rings / particles / sparkles fired via
 * onHappyStart) is copied verbatim from WelcomeScreen so the celebration
 * reads identically to production. The library additionally lets us fire
 * each burst on demand so we can study a single pulse without waiting out
 * the gem's 9–16s autonomous happy timer.
 */

// Three.js is client-only; SSR-disabled exactly like the landing + welcome.
const HeroCrystal = dynamic(() => import('@/components/HeroCrystal'), {
  ssr: false,
  loading: () => <div className={styles.gemFallback} aria-hidden />,
})

// SectionGem hosts the engraved per-section marks, including the animated
// LINK loop (wearable-pairing congrats). Mounted here to preview the link
// riding the real gem.
const SectionGem = dynamic(() => import('@/components/SectionGem'), {
  ssr: false,
  loading: () => <div className={styles.gemFallback} aria-hidden />,
})

// 'ponder' is the soft, "?"-themed burst for the curious mood: a gentle
// light-bloom + a slow soft puff of motes. It's NOT in the random happy pool
// (PULSE_KINDS) — it only fires from the curious move or its own lab button.
type PulseKind = 'rings' | 'particles' | 'sparkles' | 'ponder' | 'rays' | 'confetti' | 'orbit' | 'bloom' | 'spiral' | 'ripple'
// Random-happy pool — ponder is excluded (curious-only); the rest are all
// general celebratory bursts the autonomous happy event can pick from.
const PULSE_KINDS: PulseKind[] = ['rings', 'particles', 'sparkles', 'rays', 'confetti', 'orbit']

// Shape variants for the "shapes" section — same canonical character gem,
// only the geometry differs.
const SHAPES: { shape: 'icosahedron' | 'dodecahedron' | 'octahedron' | 'tetrahedron'; label: string }[] = [
  { shape: 'icosahedron', label: 'icosahedron' },
  { shape: 'dodecahedron', label: 'dodecahedron' },
  { shape: 'octahedron', label: 'octahedron' },
  { shape: 'tetrahedron', label: 'tetrahedron' },
]

export default function GemLibrary() {
  // Counter + chosen effect for each burst. The counter keys the effect
  // elements so React remounts them on every fire (restarting the CSS
  // animation). Identical mechanism to WelcomeScreen.
  const [pulse, setPulse] = useState<{ tick: number; kind: PulseKind }>({ tick: 0, kind: 'rings' })
  const lastKindRef = useRef<PulseKind | null>(null)
  const particlesRef = useRef<HTMLDivElement | null>(null)
  // True while the gem is asleep (between sleepy's 'sleep' and 'wake' phases)
  // — drives the floating "z" sleep animation above the gem.
  const [sleeping, setSleeping] = useState(false)
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startSleep = () => {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current)
    setSleeping(true)
    // Fallback: clear the z's after the full choreography in case the 'wake'
    // phase never arrives (e.g. another move interrupts sleepy).
    sleepTimerRef.current = setTimeout(() => setSleeping(false), 8200)
  }
  const endSleep = () => {
    if (sleepTimerRef.current) { clearTimeout(sleepTimerRef.current); sleepTimerRef.current = null }
    setSleeping(false)
  }
  // Imperative handle into the gem — HeroCrystal assigns its move-trigger
  // here on mount, so the lab can play named scripted moves on demand.
  const gemControl = useRef<((move: string) => void) | null>(null)

  // Loading / thinking state. `loading` toggles the gem's calm breath; each
  // beat (and the final resolve) bumps a keyed tick so the sonar-ring DOM
  // remounts and restarts its CSS animation — same trick as the bursts.
  const [loading, setLoading] = useState(false)
  const [loadBeat, setLoadBeat] = useState<{ tick: number; phase: 'beat' | 'resolve' }>({ tick: 0, phase: 'beat' })

  // Fire a specific burst (library control), or a random-but-different one
  // when the gem's own happy event calls back via onHappyStart.
  function firePulse(kind?: PulseKind) {
    let pick: PulseKind = kind ?? PULSE_KINDS[Math.floor(Math.random() * PULSE_KINDS.length)]
    if (!kind) {
      while (pick === lastKindRef.current) {
        pick = PULSE_KINDS[Math.floor(Math.random() * PULSE_KINDS.length)]
      }
    }
    lastKindRef.current = pick
    setPulse(p => ({ tick: p.tick + 1, kind: pick }))
  }

  // Celebration moves fire a random pulse burst alongside the choreography.
  const MOVE_BURST_KINDS: PulseKind[] = ['rings', 'particles', 'sparkles', 'rays', 'confetti', 'orbit', 'bloom', 'spiral', 'ripple']
  function moveBurst(move: string) {
    gemControl.current?.(move)
    firePulse(MOVE_BURST_KINDS[Math.floor(Math.random() * MOVE_BURST_KINDS.length)])
  }

  // Random sparkle positions around the gem perimeter, re-rolled each fire.
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulse.tick])

  // Drifting mint particle field — same recipe as landing / welcome / setup
  // so the lab canvas feels of-a-piece with the rest of the app.
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

  return (
    <main className={`${styles.page} grain-overlay`}>
      <div className={styles.atmosphere} aria-hidden />
      <div className={styles.mountainsLayer} aria-hidden>
        <svg viewBox="0 0 1600 420" preserveAspectRatio="none">
          <defs>
            <linearGradient id="gemlib-mt-far" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d1a17" stopOpacity="0" />
              <stop offset="55%" stopColor="#0d1a17" stopOpacity=".55" />
              <stop offset="100%" stopColor="#0d1a17" stopOpacity=".95" />
            </linearGradient>
            <linearGradient id="gemlib-mt-near" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#050a09" stopOpacity=".4" />
              <stop offset="60%" stopColor="#050a09" stopOpacity=".95" />
              <stop offset="100%" stopColor="#050a09" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path d="M0,300 L120,230 L210,260 L320,180 L430,220 L560,150 L680,210 L820,170 L960,220 L1100,180 L1240,240 L1380,200 L1500,250 L1600,220 L1600,420 L0,420 Z" fill="url(#gemlib-mt-far)" />
          <path d="M0,360 L100,320 L220,340 L340,290 L460,330 L590,300 L720,340 L860,310 L1000,350 L1140,310 L1280,355 L1420,320 L1540,360 L1600,340 L1600,420 L0,420 Z" fill="url(#gemlib-mt-near)" />
        </svg>
      </div>
      <div className={styles.particles} ref={particlesRef} aria-hidden />

      <header className={styles.libLabel}>
        <span className={styles.libEyebrow}>gem library</span>
        <span className={styles.libVersion}>v2</span>
      </header>

      <div className={styles.shell}>
        <div className={styles.gemStage}>
          {/* Happy-burst layers — identical to WelcomeScreen. One of three
              CSS bursts mounts per fire, keyed by tick so the animation
              restarts each time. */}
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
                  style={{ left: `${s.x}%`, top: `${s.y}%`, animationDelay: `${s.delay}s` }}
                />
              ))}
            </div>
          )}
          {pulse.tick > 0 && pulse.kind === 'ponder' && (
            <div key={`ponder-${pulse.tick}`} className={styles.pulseLayer} aria-hidden>
              {/* Soft expanding ring + light-bloom + a slow puff of motes. */}
              <span className={styles.ponderRing} />
              <span className={styles.ponderGlow} />
              {Array.from({ length: 14 }).map((_, i) => (
                <span
                  key={i}
                  className={styles.ponderMote}
                  style={{
                    ['--angle' as string]: `${(360 / 14) * i + 10}deg`,
                    animationDelay: `${(i % 3) * 0.05}s`,
                  }}
                />
              ))}
            </div>
          )}

          {pulse.tick > 0 && pulse.kind === 'rays' && (
            <div key={`rays-${pulse.tick}`} className={styles.pulseLayer} aria-hidden>
              {Array.from({ length: 16 }).map((_, i) => (
                <span
                  key={i}
                  className={styles.rayLine}
                  style={{
                    ['--angle' as string]: `${(360 / 16) * i}deg`,
                    // Alternate long/short shards for a sharp star-burst.
                    ['--len' as string]: i % 2 ? '1.35' : '0.8',
                    animationDelay: `${(i % 2) * 0.05}s`,
                  }}
                />
              ))}
            </div>
          )}
          {pulse.tick > 0 && pulse.kind === 'confetti' && (
            <div key={`confetti-${pulse.tick}`} className={styles.pulseLayer} aria-hidden>
              {Array.from({ length: 22 }).map((_, i) => (
                <span
                  key={i}
                  className={styles.confettiBit}
                  style={{
                    ['--angle' as string]: `${(360 / 22) * i + (i % 3) * 6}deg`,
                    ['--dist' as string]: `${196 + (i % 5) * 30}px`,
                    ['--spin' as string]: `${(i % 2 ? 1 : -1) * (540 + (i % 3) * 220)}deg`,
                    animationDelay: `${(i % 5) * 0.035}s`,
                    opacity: i % 2 ? 1 : 0.8,
                  }}
                />
              ))}
            </div>
          )}
          {pulse.tick > 0 && pulse.kind === 'orbit' && (
            <div key={`orbit-${pulse.tick}`} className={styles.pulseLayer} aria-hidden>
              {Array.from({ length: 13 }).map((_, i) => (
                <span
                  key={i}
                  className={styles.orbitDot}
                  style={{
                    ['--start' as string]: `${(360 / 13) * i}deg`,
                    // Alternate sweep direction so the dots cross into a swirl.
                    ['--sweep' as string]: `${i % 2 ? 300 : -300}deg`,
                    animationDelay: `${i * 0.04}s`,
                  }}
                />
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

          {/* Floating "z"s while the gem sleeps — a soft stream rising off
              the top-right, classic cartoon Zzz. */}
          {sleeping && (
            <div className={styles.sleepZs} aria-hidden>
              {Array.from({ length: 3 }).map((_, i) => (
                <span
                  key={i}
                  className={styles.sleepZ}
                  style={{ animationDelay: `${i * 1.55}s`, left: `${i * 5}px` }}
                >z</span>
              ))}
            </div>
          )}

          {/* Loading sonar ring — one soft mint ring emanates per breath beat
              (slow sonar ping); the final 'resolve' beat snaps a brighter,
              faster ring. Keyed by tick so each beat restarts the animation.
              Rendered behind the gem like the bursts, so it starts at the rim
              and ripples outward past the silhouette. */}
          {loadBeat.tick > 0 && (
            <div key={`load-${loadBeat.tick}`} className={styles.pulseLayer} aria-hidden>
              <span
                className={
                  loadBeat.phase === 'resolve'
                    ? `${styles.loadRing} ${styles.loadRingResolve}`
                    : styles.loadRing
                }
              />
            </div>
          )}

          <HeroCrystal
            mode="character"
            loading={loading}
            onLoadingBeat={(phase) => setLoadBeat(b => ({ tick: b.tick + 1, phase }))}
            onHappyStart={() => firePulse()}
            onMoveGlyph={(move, phase) => {
              if (move === 'sleepy' && phase === 'sleep') startSleep()
              else if (move === 'sleepy' && phase === 'wake') { endSleep(); firePulse('particles') }
              else { if (move === 'curious') firePulse('ponder'); endSleep() }
            }}
            controlRef={gemControl}
          />
        </div>

        {/* Control deck — grows one category at a time as we build moves. */}
        <div className={styles.controlDeck}>
          {/* States — looping gem states (vs the one-shot moods/bursts). The
              loading "breath" runs until you click done, which plays the
              resolve and settles back to idle. */}
          <section className={styles.controls}>
            <span className={styles.controlsEyebrow}>states</span>
            <div className={styles.controlRow}>
              <button
                type="button"
                className={`${styles.controlBtn} ${loading ? styles.controlBtnActive : ''}`}
                onClick={() => setLoading(true)}
              >thinking</button>
              <button
                type="button"
                className={styles.controlBtn}
                onClick={() => setLoading(false)}
              >done</button>
            </div>
          </section>

          {/* Moods + behaviors — full scripted choreographies on the gem. */}
          <section className={styles.controls}>
            <span className={styles.controlsEyebrow}>moods</span>
            <div className={styles.controlRow}>
              <button type="button" className={styles.controlBtn} onClick={() => gemControl.current?.('happyHello')}>happy hello</button>
              <button type="button" className={styles.controlBtn} onClick={() => gemControl.current?.('curious')}>curious</button>
              <button type="button" className={styles.controlBtn} onClick={() => gemControl.current?.('sleepy')}>sleepy</button>
              <button type="button" className={styles.controlBtn} onClick={() => gemControl.current?.('excited')}>excited</button>
              <button type="button" className={styles.controlBtn} onClick={() => gemControl.current?.('love')}>love</button>
              <button type="button" className={styles.controlBtn} onClick={() => gemControl.current?.('proud')}>proud</button>
              <button type="button" className={styles.controlBtn} onClick={() => gemControl.current?.('spin')}>spin</button>
              <button type="button" className={styles.controlBtn} onClick={() => gemControl.current?.('focus')}>focus</button>
              <button type="button" className={styles.controlBtn} onClick={() => gemControl.current?.('loading')}>loading</button>
              <button type="button" className={styles.controlBtn} onClick={() => gemControl.current?.('loadSpin')}>load spin</button>
              <button type="button" className={styles.controlBtn} onClick={() => gemControl.current?.('loadPulse')}>load pulse</button>
              <button type="button" className={styles.controlBtn} onClick={() => gemControl.current?.('loadJump1')}>jump wave</button>
              <button type="button" className={styles.controlBtn} onClick={() => gemControl.current?.('loadJump2')}>jump hop</button>
              <button type="button" className={styles.controlBtn} onClick={() => gemControl.current?.('loadJump3')}>jump flow</button>
            </div>
          </section>

          {/* Coaching — Echo's coach-specific, conversational moves (faceless, keep the V). */}
          <section className={styles.controls}>
            <span className={styles.controlsEyebrow}>coaching</span>
            <div className={styles.controlRow}>
              <button type="button" className={styles.controlBtn} onClick={() => gemControl.current?.('nod')}>nod</button>
              <button type="button" className={styles.controlBtn} onClick={() => gemControl.current?.('encourage')}>encourage</button>
              <button type="button" className={styles.controlBtn} onClick={() => gemControl.current?.('explain')}>explain</button>
              <button type="button" className={styles.controlBtn} onClick={() => gemControl.current?.('consider')}>consider</button>
              <button type="button" className={styles.controlBtn} onClick={() => gemControl.current?.('listening')}>listening</button>
              <button type="button" className={styles.controlBtn} onClick={() => gemControl.current?.('concern')}>concern</button>
              <button type="button" className={styles.controlBtn} onClick={() => gemControl.current?.('idea')}>idea</button>
            </div>
          </section>

          {/* Celebration — wins + hype. Each also fires a random pulse burst. */}
          <section className={styles.controls}>
            <span className={styles.controlsEyebrow}>celebration</span>
            <div className={styles.controlRow}>
              <button type="button" className={styles.controlBtn} onClick={() => moveBurst('highfive')}>high five</button>
              <button type="button" className={styles.controlBtn} onClick={() => moveBurst('pumpUp')}>let&rsquo;s go</button>
              <button type="button" className={styles.controlBtn} onClick={() => moveBurst('levelup')}>level up</button>
              <button type="button" className={styles.controlBtn} onClick={() => moveBurst('lift')}>lift</button>
              <button type="button" className={styles.controlBtn} onClick={() => moveBurst('celebrate')}>celebrate</button>
              <button type="button" className={styles.controlBtn} onClick={() => moveBurst('cheer')}>cheer</button>
              <button type="button" className={styles.controlBtn} onClick={() => moveBurst('win')}>win</button>
              <button type="button" className={styles.controlBtn} onClick={() => moveBurst('twinkle')}>twinkle</button>
            </div>
          </section>

          {/* Expressions — personality / come-alive beats. */}
          <section className={styles.controls}>
            <span className={styles.controlsEyebrow}>expressions</span>
            <div className={styles.controlRow}>
              <button type="button" className={styles.controlBtn} onClick={() => gemControl.current?.('wobble')}>wobble</button>
              <button type="button" className={styles.controlBtn} onClick={() => gemControl.current?.('glitch')}>glitch</button>
              <button type="button" className={styles.controlBtn} onClick={() => gemControl.current?.('groove')}>groove</button>
            </div>
          </section>

          {/* Pulse bursts — fire each on demand to study a single pulse
              without waiting out the gem's autonomous happy timer. */}
          <section className={styles.controls}>
            <span className={styles.controlsEyebrow}>pulse bursts</span>
            <div className={styles.controlRow}>
              <button type="button" className={styles.controlBtn} onClick={() => firePulse('rings')}>rings</button>
              <button type="button" className={styles.controlBtn} onClick={() => firePulse('particles')}>particles</button>
              <button type="button" className={styles.controlBtn} onClick={() => firePulse('sparkles')}>sparkles</button>
              <button type="button" className={styles.controlBtn} onClick={() => firePulse('ponder')}>ponder</button>
              <button type="button" className={styles.controlBtn} onClick={() => firePulse('rays')}>rays</button>
              <button type="button" className={styles.controlBtn} onClick={() => firePulse('confetti')}>confetti</button>
              <button type="button" className={styles.controlBtn} onClick={() => firePulse('orbit')}>orbit</button>
              <button type="button" className={styles.controlBtn} onClick={() => firePulse('bloom')}>bloom</button>
              <button type="button" className={styles.controlBtn} onClick={() => firePulse('spiral')}>spiral</button>
              <button type="button" className={styles.controlBtn} onClick={() => firePulse('ripple')}>ripple</button>
            </div>
          </section>
        </div>

        {/* Shapes — the exact same character gem rendered as a few different
            polyhedra so we can compare silhouettes. Same glass, same engraved
            face + brows + moves; only the geometry changes. */}
        <section className={styles.shapesSection}>
          <span className={styles.controlsEyebrow}>shapes</span>
          <div className={styles.shapesRow}>
            {SHAPES.map((s) => (
              <div key={s.shape} className={styles.shapeCell}>
                <div className={styles.shapeGem}>
                  <HeroCrystal mode="character" shape={s.shape} />
                </div>
                <span className={styles.shapeLabel}>{s.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Engraved marks — the SectionGem variant of the gem, carrying a
            per-section glyph. The link is the animated wearable-pairing mark:
            a pulse charges, glides the wire, lands, and a check draws inside
            the node, then loops (flicking to V ~20% of the time). */}
        <section className={styles.shapesSection}>
          <span className={styles.controlsEyebrow}>engraved marks</span>
          <div className={styles.shapesRow}>
            <div className={styles.shapeCell}>
              <SectionGem glyph="LINK" shape="dodecahedron" glyphScale={1.5} position="inline" size={440} />
              <span className={styles.shapeLabel}>the link</span>
            </div>
            <div className={styles.shapeCell}>
              <SectionGem glyph="RADIAL" shape="dodecahedron" glyphScale={1.5} position="inline" size={440} />
              <span className={styles.shapeLabel}>the quiz</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
