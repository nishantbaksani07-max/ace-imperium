'use client'

import { useEffect, useRef } from 'react'
import styles from './connect.module.css'
import { WEARABLES, type WearableProviderId, type WearableConnState } from '@/lib/vitals/wearables'

/* Vitals · connect — the front door: "how do you want to track?" Rebuilt to the
 * Vitals remodel look (vitalsRemodel.module.css): near-black + aurora/mountains/
 * particles, a serif headline with one italic mint word, mono micro-labels.
 *
 * Order is deliberate — MANUAL first (the easy, no-account option), then the two
 * real bands tailored to their own system: WHOOP speaks "recovery", Oura speaks
 * "readiness". Apple Watch / Fitbit / Garmin are quiet "soon" tiles. Each real
 * band routes by its connection state (connect / awaiting / connected).
 *
 * Props are unchanged so /app/vitals/page.tsx (and the manual/awaiting hop) keep
 * compiling: states (per-band connection), available (bands with OAuth keys), and
 * manage (came from settings → back link returns to the user's readings). */

function Spark() {
  return <svg viewBox="0 0 24 24" aria-hidden><path d="M12 2 L13.6 8.4 L20 10 L13.6 11.6 L12 18 L10.4 11.6 L4 10 L10.4 8.4 Z" /></svg>
}
function Arrow() {
  return <svg viewBox="0 0 24 24" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
}
function Pencil() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
}
function Pulse() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 12h4l2 6 4-14 2 8h6" /></svg>
}
function Ring() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.2" /></svg>
}
function Watch() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><rect x="7" y="6" width="10" height="12" rx="3" /><path d="M9 6l.5-3h5l.5 3M9 18l.5 3h5l.5-3" /></svg>
}
function Dots() {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="8" cy="8" r="1.6" /><circle cx="16" cy="8" r="1.6" /><circle cx="8" cy="16" r="1.6" /><circle cx="16" cy="16" r="1.6" /><circle cx="12" cy="12" r="1.6" /></svg>
}
function Delta() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden><path d="M12 4 L20 19 H4 Z" /></svg>
}

/** A real OAuth band (WHOOP / Oura) — the metric term reflects its own system. */
function BandRow({
  id, state, available, term,
}: { id: WearableProviderId; state: WearableConnState; available: boolean; term: string }) {
  const meta = WEARABLES[id]
  const Icon = id === 'whoop' ? Pulse : Ring
  // Central-app default (Alex, 2026-07-12): connecting is one tap, no keys.
  const keyNote = `Connect and allow, that is it.`

  // Already connected (or syncing its first day) → straight to the readings.
  if (state === 'connected' || state === 'awaiting') {
    return (
      <a className={`${styles.opt} ${styles.band} ${styles.on}`} href={meta.readingsPath}>
        <div className={styles.ic}><Icon /></div>
        <div className={styles.body}>
          <span className={styles.name}>{meta.label}</span>
          <span className={styles.note}>{state === 'awaiting' ? 'Syncing your first day.' : 'Connected. View your readings.'}</span>
        </div>
        <div className={styles.tail}>
          <span className={styles.stateDot}><i />{state === 'awaiting' ? 'syncing' : 'connected'}</span>
          <span className={styles.go}><Arrow /></span>
        </div>
      </a>
    )
  }

  // Not configured yet (no shared callback / client id) → a quiet non-link.
  if (!available) {
    return (
      <div className={`${styles.opt} ${styles.band}`}>
        <div className={styles.ic}><Icon /></div>
        <div className={styles.body}>
          <span className={styles.name}>{meta.label}</span>
          <span className={styles.note}>{term}</span>
        </div>
        <span className={styles.term}>soon</span>
      </div>
    )
  }

  return (
    <a className={`${styles.opt} ${styles.band}`} href={`/api/${id}/connect`}>
      <div className={styles.ic}><Icon /></div>
      <div className={styles.body}>
        <span className={styles.name}>{meta.label}</span>
        <span className={styles.note}>{keyNote}</span>
      </div>
      <div className={styles.tail}>
        <span className={styles.term}>{term}</span>
        <span className={styles.go}><Arrow /></span>
      </div>
    </a>
  )
}

export default function ConnectScreen({
  states = {},
  available = ['whoop', 'oura', 'manual'],
  manage = false,
}: {
  states?: Partial<Record<WearableProviderId, WearableConnState>>
  /** Bands whose OAuth app is configured (keys present). Others render "soon". */
  available?: WearableProviderId[]
  manage?: boolean
}) {
  const particlesRef = useRef<HTMLDivElement>(null)

  // Drifting particles, generated client-side so there is no hydration mismatch.
  useEffect(() => {
    const root = particlesRef.current
    if (!root) return
    root.innerHTML = ''
    const N = window.innerWidth < 640 ? 14 : 22
    for (let i = 0; i < N; i++) {
      const s = document.createElement('span')
      s.style.left = `${Math.random() * 100}%`
      s.style.top = `${60 + Math.random() * 40}%`
      const size = 1.2 + Math.random() * 1.2
      s.style.width = s.style.height = `${size}px`
      const d = 22 + Math.random() * 28
      s.style.animationDuration = `${d}s`
      s.style.animationDelay = `${-Math.random() * d}s`
      s.style.setProperty('--dx', `${Math.random() * 30 - 15}px`)
      s.style.setProperty('--dy', `${-(60 + Math.random() * 50)}vh`)
      root.appendChild(s)
    }
    return () => { root.innerHTML = '' }
  }, [])

  const backHref = manage ? '/app/vitals?manage=1' : '/app'
  const isAvail = (id: WearableProviderId) => available.includes(id)

  return (
    <main className={styles.root}>
      <div className={styles.atmosphere} aria-hidden />
      <div className={styles.mountains} aria-hidden>
        <svg viewBox="0 0 1600 420" preserveAspectRatio="none">
          <defs>
            <linearGradient id="vcMtFar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d1a17" stopOpacity="0" />
              <stop offset="55%" stopColor="#0d1a17" stopOpacity=".55" />
              <stop offset="100%" stopColor="#0d1a17" stopOpacity=".95" />
            </linearGradient>
            <linearGradient id="vcMtNear" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#050a09" stopOpacity=".4" />
              <stop offset="60%" stopColor="#050a09" stopOpacity=".95" />
              <stop offset="100%" stopColor="#050a09" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path d="M0,300 L120,230 L210,260 L320,180 L430,220 L560,150 L680,210 L820,170 L960,220 L1100,180 L1240,240 L1380,200 L1500,250 L1600,220 L1600,420 L0,420 Z" fill="url(#vcMtFar)" />
          <path d="M0,360 L100,320 L220,340 L340,290 L460,330 L590,300 L720,340 L860,310 L1000,350 L1140,310 L1280,355 L1420,320 L1540,360 L1600,340 L1600,420 L0,420 Z" fill="url(#vcMtNear)" />
        </svg>
      </div>
      <div className={styles.particles} ref={particlesRef} aria-hidden />
      <div className={styles.grain} aria-hidden />

      <div className={styles.page}>
        <header className={styles.head}>
          <a className={styles.back} href={backHref}>
            <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
            {manage ? 'readings' : 'Vitality'}
          </a>
          <span className={styles.headTitle}>Vitals</span>
          <span />
        </header>

        <section className={styles.hero}>
          <div className={styles.eyebrow}><Spark /> Choose your source</div>
          <h1 className={styles.title}>How do you want to <em>track</em>?</h1>
          <div className={styles.lede}>Pick one. You can add more later.</div>
        </section>

        <div className={styles.options}>
          {/* MANUAL — first, the loud no-wearable option */}
          <a className={`${styles.opt} ${styles.loud}`} href="/app/vitals/manual">
            <div className={styles.ic}><Pencil /></div>
            <div className={styles.body}>
              <span className={styles.name}>Log it yourself</span>
              <span className={styles.note}>No wearable? A quick daily check-in and I do the rest.</span>
            </div>
            <div className={styles.tail}>
              <span className={styles.term}>check-in</span>
              <span className={styles.go}><Arrow /></span>
            </div>
          </a>

          {/* WHOOP — recovery */}
          <BandRow id="whoop" state={states.whoop ?? 'disconnected'} available={isAvail('whoop')} term="recovery" />
          {/* Oura — readiness */}
          <BandRow id="oura" state={states.oura ?? 'disconnected'} available={isAvail('oura')} term="readiness" />
        </div>

        <div className={styles.soonWrap}>
          <div className={styles.slab}>Coming soon</div>
          <div className={styles.soonGrid}>
            <div className={styles.soon}>
              <span className={styles.sic}><Watch /></span>
              <span className={styles.sname}>Apple Watch</span>
              <span className={styles.stag}>soon</span>
            </div>
            <div className={styles.soon}>
              <span className={styles.sic}><Dots /></span>
              <span className={styles.sname}>Fitbit</span>
              <span className={styles.stag}>soon</span>
            </div>
            <div className={styles.soon}>
              <span className={styles.sic}><Delta /></span>
              <span className={styles.sname}>Garmin</span>
              <span className={styles.stag}>soon</span>
            </div>
          </div>
        </div>

        <div className={styles.foot}>Private to you <i /> Change anytime</div>
      </div>
    </main>
  )
}
