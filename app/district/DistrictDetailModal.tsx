'use client'

/**
 * The Netflix-style detail overlay for ONE featured Arts District tile, ported
 * 1:1 from the approved mock public/district-detail-modal.html. Clicking a card
 * in DistrictGallery opens this centered modal while the gallery behind blurs +
 * dims (an overlay, never a nav; /district/[id] stays the shareable deep link
 * and the share button copies that URL).
 *
 * Left = a slow, cinematic showcase of the tile living with one honest sample
 * week (lib/tiles/featured.ts preview.showcase): the mint ring draws in over
 * ~1.6s (stroke-dashoffset only), the big serif number counts up, the 7-day
 * bars rise staggered ~0.1s apart, the streak line fades in last. Right = the
 * minimal pitch + the SAME one-tap Add funnel the gallery owns: the gallery
 * passes onAdd (its addFeatured), so import / stash logic lives in exactly one
 * place and is never duplicated here.
 *
 * All motion is opacity / transform / stroke only (phone safe), timed on
 * --ease-premium; under prefers-reduced-motion every transition dies (CSS) and
 * the count-up jumps straight to its final value. Accessible: role="dialog" +
 * aria-modal, focus moves into the modal on open (and back on close), Tab is
 * trapped, Escape / backdrop / the close button all dismiss it.
 */

import { useEffect, useRef, useState } from 'react'
import type { FeaturedTile, TileShowcase } from '@/lib/tiles/featured'
import styles from './district.module.css'

const RING_R = 74
const RING_C = 2 * Math.PI * RING_R
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

type RingShow = Extract<TileShowcase, { variant: 'ring' }>
type WeekShow = Extract<TileShowcase, { variant: 'week' }>
type ScaleShow = Extract<TileShowcase, { variant: 'scale' }>
type JournalShow = Extract<TileShowcase, { variant: 'journal' }>

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Eases a number from 0 to `to` once `play` flips true (ease-out cubic, rAF).
 *  Returns the formatted value: one decimal when the target has one, thousands
 *  separators otherwise. Reduced motion jumps straight to the final value. */
function useCountUp(to: number, play: boolean, delay = 260, duration = 1400): string {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!play) return
    if (prefersReducedMotion()) {
      setVal(to)
      return
    }
    let raf = 0
    let t0: number | null = null
    const timer = window.setTimeout(() => {
      const step = (ts: number) => {
        if (t0 === null) t0 = ts
        const p = Math.min(1, (ts - t0) / duration)
        const e = 1 - Math.pow(1 - p, 3)
        setVal(to * e)
        if (p < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }, delay)
    return () => {
      window.clearTimeout(timer)
      cancelAnimationFrame(raf)
    }
  }, [to, play, delay, duration])
  const decimals = Number.isInteger(to) ? 0 : 1
  return val.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 13 4 4L19 7" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
      <path d="M12 3v13M8 7l4-4 4 4" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

/** intake / count / duration: the mint goal ring + count-up + 7 rising bars. */
function RingShowcase({ s, play }: { s: RingShow; play: boolean }) {
  const num = useCountUp(s.value, play)
  const frac = Math.min(1, s.value / s.goal)
  const max = Math.max(...s.chart)
  return (
    <>
      <div className={styles.ringWrap}>
        <div className={styles.ringBox}>
          <svg width="176" height="176" viewBox="0 0 176 176" aria-hidden>
            <circle className={styles.ringTrack} cx="88" cy="88" r={RING_R} fill="none" strokeWidth="9" />
            <circle
              className={styles.ringArc}
              cx="88"
              cy="88"
              r={RING_R}
              fill="none"
              strokeWidth="9"
              strokeDasharray={RING_C}
              transform="rotate(-90 88 88)"
              style={{ strokeDashoffset: play ? RING_C * (1 - frac) : RING_C }}
            />
          </svg>
          <div className={styles.ringNum}>
            <b className={styles.bigNum}>{num}</b>
            <span className={styles.ringSub}>{s.sub}</span>
          </div>
        </div>
      </div>
      <div className={styles.chart} aria-hidden>
        {s.chart.map((v, i) => (
          <div
            key={i}
            className={`${styles.mbar} ${i === s.chart.length - 1 ? styles.today : ''} ${v < max ? styles.miss : ''}`}
          >
            <div
              className={styles.mcol}
              style={{
                height: play ? `${Math.round((v / max) * 100)}%` : '0%',
                transitionDelay: `${0.35 + i * 0.1}s`,
              }}
            />
            <span className={styles.mday} style={{ transitionDelay: `${0.5 + i * 0.1}s` }}>
              {DAYS[i]}
            </span>
          </div>
        ))}
      </div>
      <div className={styles.streakline}>
        <b>{s.streak}</b> day streak &middot; best {s.best}
      </div>
    </>
  )
}

/** done: the big streak count + a 7-box week grid. */
function WeekShowcase({ s, play }: { s: WeekShow; play: boolean }) {
  const num = useCountUp(s.streak, play)
  return (
    <>
      <div className={styles.numHold}>
        <b className={styles.bigNum}>{num}</b>
        <span className={styles.ringSub}>day streak</span>
      </div>
      <div className={styles.grid7} aria-hidden>
        {s.week.map((d, i) => (
          <span
            key={i}
            className={`${styles.mbox} ${d ? styles.boxOn : ''}`}
            style={{ transitionDelay: `${0.3 + i * 0.09}s` }}
          />
        ))}
      </div>
      <div className={styles.streakline}>
        best <b>{s.best}</b> days &middot; kept {s.kept}
      </div>
    </>
  )
}

/** rating: the big value counting up + a small filled dot scale. */
function ScaleShowcase({ s, play }: { s: ScaleShow; play: boolean }) {
  const num = useCountUp(s.value, play)
  return (
    <>
      <div className={styles.numHold}>
        <b className={styles.bigNum}>{num}</b>
        <span className={styles.ringSub}>{s.sub}</span>
      </div>
      <div className={styles.mdots} aria-hidden>
        {Array.from({ length: s.outOf }).map((_, i) => (
          <span
            key={i}
            className={`${styles.mdot} ${i < s.value ? styles.mdotOn : ''}`}
            style={{ transitionDelay: `${0.3 + i * 0.09}s` }}
          />
        ))}
      </div>
      <div className={styles.streakline}>
        <b>{s.streak}</b> day streak &middot; best {s.best}
      </div>
    </>
  )
}

/** the text journal: a few quiet sample lines, never a fake numeric chart. */
function JournalShowcase({ s }: { s: JournalShow }) {
  return (
    <>
      <div className={styles.jlines}>
        {s.lines.map((l, i) => (
          <div key={i} className={`${styles.jline} ${styles.rev}`} style={{ transitionDelay: `${0.25 + i * 0.16}s` }}>
            <span className={styles.jday}>{l.day}</span>
            <span className={styles.jtext}>{l.text}</span>
          </div>
        ))}
      </div>
      <div className={styles.streakline}>
        <b>{s.streak}</b> day streak &middot; best {s.best}
      </div>
    </>
  )
}

function Showcase({ s, play }: { s: TileShowcase; play: boolean }) {
  switch (s.variant) {
    case 'ring':
      return <RingShowcase s={s} play={play} />
    case 'week':
      return <WeekShowcase s={s} play={play} />
    case 'scale':
      return <ScaleShowcase s={s} play={play} />
    case 'journal':
      return <JournalShowcase s={s} />
  }
}

interface DistrictDetailModalProps {
  tile: FeaturedTile
  /** Whether the gallery already imported this tile (flips the Add button). */
  added: boolean
  /** The gallery's OWN add path (addFeatured): importTile + pushTile inline for
   *  a signed-in user, stash-and-signup otherwise. Never reimplemented here. */
  onAdd: () => void
  onClose: () => void
}

export default function DistrictDetailModal({ tile, added, onAdd, onClose }: DistrictDetailModalProps) {
  // One flag drives everything: the scrim fade, the modal rise, the ring draw,
  // the bar stagger and every .rev reveal all key off `playing` flipping true.
  const [playing, setPlaying] = useState(false)
  const [copied, setCopied] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const closingRef = useRef(false)
  const pressOnScrim = useRef(false)
  const copyTimer = useRef<number | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Open: remember focus, focus the dialog, lock the page scroll, then (double
  // rAF so the closed state paints first) start playing. Close restores both.
  useEffect(() => {
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    modalRef.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPlaying(true))
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      document.body.style.overflow = prevOverflow
      restoreRef.current?.focus()
    }
  }, [])

  useEffect(() => {
    return () => {
      if (copyTimer.current != null) window.clearTimeout(copyTimer.current)
    }
  }, [])

  // Reverse the transitions, then unmount once the exit has visibly started.
  function requestClose() {
    if (closingRef.current) return
    closingRef.current = true
    setPlaying(false)
    window.setTimeout(() => onCloseRef.current(), prefersReducedMotion() ? 0 : 280)
  }

  // Escape closes; Tab stays inside the dialog (a small, dependency-free trap).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        requestClose()
        return
      }
      if (e.key !== 'Tab') return
      const root = modalRef.current
      if (!root) return
      const focusables = root.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === root)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The share button copies the tile's OWN deep link (/district/[id] stays the
  // shareable route; this modal is only the in-page experience).
  async function share() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/district/${tile.id}`)
      setCopied(true)
      if (copyTimer.current != null) window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable: the deep link still exists at /district/[id] */
    }
  }

  const kind = tile.envelope.kind ?? 'tile'
  const p = tile.preview

  return (
    <div
      className={`${styles.overlay} ${playing ? styles.overlayOpen : ''}`}
      onMouseDown={(e) => {
        pressOnScrim.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressOnScrim.current) requestClose()
      }}
    >
      <div
        ref={modalRef}
        className={`${styles.modal} ${playing ? styles.playing : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="district-detail-name"
        tabIndex={-1}
      >
        <div className={styles.mhead}>
          <span className={styles.mcrumb}>
            Studio <b>/ Tile</b>
          </span>
          <button type="button" className={styles.mclose} onClick={requestClose} aria-label="Close">
            <XIcon />
          </button>
        </div>

        <div className={styles.mbody}>
          <div className={styles.showcase}>
            <div className={styles.showEyebrow}>Studio / a week in</div>
            <Showcase s={p.showcase} play={playing} />
          </div>

          <div className={styles.pitch}>
            <div className={`${styles.pEyebrow} ${styles.rev}`} style={{ transitionDelay: '0.15s' }}>
              {kind} &middot; reports to Vee
            </div>
            <h2 id="district-detail-name" className={`${styles.pName} ${styles.rev}`} style={{ transitionDelay: '0.28s' }}>
              {tile.envelope.name}
            </h2>
            <div className={`${styles.pBy} ${styles.rev}`} style={{ transitionDelay: '0.4s' }}>
              by <b>{tile.author}</b>
            </div>
            <p className={`${styles.pSum} ${styles.rev}`} style={{ transitionDelay: '0.52s' }}>
              {p.summary}
            </p>
            <div className={`${styles.mtags} ${styles.rev}`} style={{ transitionDelay: '0.66s' }}>
              {p.tags.map((t) => (
                <span key={t} className={styles.mtag}>
                  {t}
                </span>
              ))}
            </div>
            <div className={styles.mspacer} />
            <div className={`${styles.mcta} ${styles.rev}`} style={{ transitionDelay: '0.8s' }}>
              <button
                type="button"
                className={`${styles.mAdd} ${added ? styles.mAdded : ''}`}
                onClick={onAdd}
                disabled={added}
              >
                {added ? (
                  <>
                    <CheckIcon />
                    Added
                  </>
                ) : (
                  <>
                    <PlusIcon />
                    Add
                  </>
                )}
              </button>
              <button
                type="button"
                className={styles.mshare}
                onClick={share}
                title={copied ? 'Link copied' : 'Share'}
                aria-label={copied ? 'Link copied' : 'Copy the share link'}
              >
                {copied ? <CheckIcon /> : <ShareIcon />}
              </button>
            </div>
            <div className={`${styles.mnote} ${styles.rev}`} style={{ transitionDelay: '0.9s' }}>
              {added ? 'On your dashboard.' : 'Yours in one tap.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
