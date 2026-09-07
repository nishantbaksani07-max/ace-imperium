'use client'

import { useEffect, useRef } from 'react'
import styles from './HeroPhones.module.css'

/**
 * HeroPhones — twin iPhone 14 Pro mockups flanking the landing icosahedron.
 *
 * v6.2: strict gem-only reveal.
 *
 * Reveal is bound to the gem itself (the canvas / SVG fallback inside
 * `[data-gem="crystal"]`, padded by GEM_PADDING for a friendlier hit edge).
 * Cursor on the gem → phones glide in and softly track cursor X/Y as
 * parallax. The moment the cursor leaves the gem → phones retreat.
 *
 * Right phone shows a minimal line chart of bench-press weight progression
 * with a PR halo at the peak.
 *
 * RAF-eased; respects prefers-reduced-motion (snaps to rest, no animation).
 */

function StatusBar({ side }: { side: 'left' | 'right' }) {
  return (
    <div className={`${styles.statusBar} ${side === 'right' ? styles.statusBarLight : ''}`}>
      <span className={styles.statusTime}>9:41</span>
      <div className={styles.dynamicIsland} />
      <div className={styles.statusIcons}>
        {/* signal — 4 ascending rectangles */}
        <svg width="17" height="10" viewBox="0 0 17 10" fill="currentColor" aria-hidden>
          <rect x="0"   y="7"   width="3" height="3"   rx="0.5" />
          <rect x="4.5" y="5"   width="3" height="5"   rx="0.5" />
          <rect x="9"   y="2.5" width="3" height="7.5" rx="0.5" />
          <rect x="13.5" y="0"  width="3" height="10"  rx="0.5" />
        </svg>
        {/* wifi — three arc segments */}
        <svg width="14" height="10" viewBox="0 0 14 10" fill="currentColor" aria-hidden>
          <path d="M7 8.4a1 1 0 100-2 1 1 0 000 2z" />
          <path d="M3.5 5.7l-.9-.9a6.36 6.36 0 018.8 0l-.9.9a5.1 5.1 0 00-7 0z" />
          <path d="M1.4 3.6L.5 2.7a9.36 9.36 0 0113 0l-.9.9a8.1 8.1 0 00-11.2 0z" />
        </svg>
        {/* battery — 80% filled rounded rect with terminal nub */}
        <svg width="24" height="11" viewBox="0 0 24 11" fill="none" aria-hidden>
          <rect x="0.5" y="0.5" width="20" height="10" rx="2.5" stroke="currentColor" strokeOpacity="0.55" />
          <rect x="22" y="3.5" width="1.6" height="4" rx="0.6" fill="currentColor" fillOpacity="0.55" />
          <rect x="2" y="2" width="15" height="7" rx="1.2" fill="currentColor" />
        </svg>
      </div>
    </div>
  )
}

/* Resting rotation (matches v4 inward-tilted composition). */
const REST_ROT = 8
/* Hidden rotation — phones tilt further outward while parked off-screen. */
const HIDDEN_ROT = 14
/* Horizontal offset for the hidden state (px). Just enough to be fully off-stage. */
const HIDDEN_OFFSET = 260
/* Max cursor-parallax travel (px) once the phones are revealed. */
const PARALLAX_X = 28
const PARALLAX_Y = 18
/* Lerp factor — higher = snappier. 0.08 ≈ ~300 ms settle. */
const LERP = 0.08
/* Padding (px) around the gem's bounding box for a friendlier hit area. */
const GEM_PADDING = 24

export default function HeroPhones() {
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stage = document.querySelector('[data-gem="crystal"]') as HTMLElement | null
    if (!stage) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let rafId = 0
    let progressTarget = reduced ? 1 : 0
    let progress = reduced ? 1 : 0
    let cursorTargetX = 0
    let cursorTargetY = 0
    let cursorX = 0
    let cursorY = 0

    /* Trigger zone = the actual gem element (canvas or fallback SVG) inside
       the stage, padded outward. Stage itself spans the full hero width, so
       using its rect would be too generous. Falls back to the stage rect
       only on the rare frames before HeroCrystal has mounted its canvas. */
    const getGemRect = (): DOMRect => {
      const gem =
        stage.querySelector('canvas') ?? stage.querySelector('svg') ?? stage
      const r = gem.getBoundingClientRect()
      return new DOMRect(
        r.left - GEM_PADDING,
        r.top - GEM_PADDING,
        r.width + GEM_PADDING * 2,
        r.height + GEM_PADDING * 2,
      )
    }

    const setFromEvent = (e: MouseEvent) => {
      const rect = getGemRect()
      const inGem =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      if (inGem) {
        progressTarget = 1
        cursorTargetX = ((e.clientX - rect.left) / rect.width - 0.5) * 2
        cursorTargetY = ((e.clientY - rect.top) / rect.height - 0.5) * 2
      } else {
        progressTarget = 0
        cursorTargetX = 0
        cursorTargetY = 0
      }
    }

    const onLeaveDoc = () => {
      progressTarget = 0
      cursorTargetX = 0
      cursorTargetY = 0
    }

    const apply = (
      el: HTMLDivElement | null,
      side: 'left' | 'right',
      p: number,
      cx: number,
      cy: number,
    ) => {
      if (!el) return
      const dir = side === 'left' ? -1 : 1
      const offX = (1 - p) * HIDDEN_OFFSET * dir
      const px = cx * PARALLAX_X * p
      const py = cy * PARALLAX_Y * p
      const rot = dir * (HIDDEN_ROT - (HIDDEN_ROT - REST_ROT) * p)
      el.style.transform =
        `translate(${(offX + px).toFixed(2)}px, calc(-50% + ${py.toFixed(2)}px)) ` +
        `rotate(${rot.toFixed(2)}deg)`
      el.style.opacity = p.toFixed(3)
    }

    const tick = () => {
      progress += (progressTarget - progress) * LERP
      cursorX += (cursorTargetX - cursorX) * LERP
      cursorY += (cursorTargetY - cursorY) * LERP
      apply(leftRef.current, 'left', progress, cursorX, cursorY)
      apply(rightRef.current, 'right', progress, cursorX, cursorY)
      rafId = requestAnimationFrame(tick)
    }

    // Initial paint already reflects the hidden state via inline style on JSX.
    // If reduced motion, snap to rest immediately.
    if (reduced) {
      apply(leftRef.current, 'left', 1, 0, 0)
      apply(rightRef.current, 'right', 1, 0, 0)
    }

    document.addEventListener('mousemove', setFromEvent)
    document.addEventListener('mouseleave', onLeaveDoc)
    rafId = requestAnimationFrame(tick)

    return () => {
      document.removeEventListener('mousemove', setFromEvent)
      document.removeEventListener('mouseleave', onLeaveDoc)
      cancelAnimationFrame(rafId)
    }
  }, [])

  /* Initial inline styles match the JS "hidden" state so there's no flash
     of phones-at-rest on first paint before useEffect runs. */
  const hiddenLeftStyle = {
    opacity: 0,
    transform: `translate(-${HIDDEN_OFFSET}px, -50%) rotate(-${HIDDEN_ROT}deg)`,
  }
  const hiddenRightStyle = {
    opacity: 0,
    transform: `translate(${HIDDEN_OFFSET}px, -50%) rotate(${HIDDEN_ROT}deg)`,
  }

  return (
    <>
      {/* ── LEFT PHONE — dashboard ────────────────────────────────── */}
      <div
        ref={leftRef}
        className={`${styles.phone} ${styles.phoneLeft}`}
        style={hiddenLeftStyle}
        aria-hidden
      >
        {/* Edge highlight stripe on the lit side */}
        <span className={`${styles.edgeHighlight} ${styles.edgeHighlightLeft}`} />
        {/* Glass screen reflection */}
        <span className={styles.screenGlare} />
        <div className={styles.screen}>
          <StatusBar side="left" />

          <div className={styles.dashHeader}>
            <div className={styles.dashWordmarkRow}>
              <span className={styles.dashGlyph}>V</span>
              <span className={styles.dashWordmark}>Vitality</span>
            </div>
            <div className={styles.dashGreeting}>
              <span className={styles.serif}>Good evening</span>
              <span className={styles.dashDot} />
            </div>
            <div className={styles.dashDate}>Tuesday · May 23</div>
          </div>

          <div className={styles.bento}>
            <span className={`${styles.bentoTile} ${styles.bentoAurora}`}>
              <span className={styles.bentoNum}>·01</span>
              <span className={`${styles.serif} ${styles.bentoLabel}`}>Today</span>
            </span>
            <span className={`${styles.bentoTile} ${styles.bentoGrid}`}>
              <span className={styles.bentoNum}>·02</span>
              <span className={`${styles.serif} ${styles.bentoLabel}`}>Water</span>
            </span>
            <span className={`${styles.bentoTile} ${styles.bentoDots}`}>
              <span className={styles.bentoNum}>·03</span>
              <span className={`${styles.serif} ${styles.bentoLabel}`}>Stack</span>
            </span>
            <span className={`${styles.bentoTile} ${styles.bentoDuotone}`}>
              <span className={styles.bentoNum}>·04</span>
              <span className={`${styles.serif} ${styles.bentoLabel}`}>Wearables</span>
            </span>
            <span className={`${styles.bentoTile} ${styles.bentoFrosted}`}>
              <span className={styles.bentoNum}>·05</span>
              <span className={`${styles.serif} ${styles.bentoLabel}`}>Recovery</span>
            </span>
            <span className={`${styles.bentoTile} ${styles.bentoLines}`}>
              <span className={styles.bentoNum}>·06</span>
              <span className={`${styles.serif} ${styles.bentoLabel}`}>Goals</span>
            </span>
          </div>
        </div>
      </div>

      {/* ── RIGHT PHONE — workout logger ──────────────────────────── */}
      <div
        ref={rightRef}
        className={`${styles.phone} ${styles.phoneRight}`}
        style={hiddenRightStyle}
        aria-hidden
      >
        <span className={`${styles.edgeHighlight} ${styles.edgeHighlightRight}`} />
        <span className={styles.screenGlare} />
        <div className={styles.screen}>
          <StatusBar side="right" />

          <div className={styles.logHeader}>
            <span className={styles.logBack}>← Fitness</span>
            <div className={styles.logTitleRow}>
              <span className={`${styles.serif} ${styles.logTitle}`}>Bench press</span>
              <span className={styles.logPill}>PR ★</span>
            </div>
            <span className={styles.logSubtitle}>Week 3 · 1RM est · 95 kg</span>
          </div>

          {/* Bench-press progress chart — six weeks of working sets, mint
              line trending up, the peak marked with a PR halo. */}
          <div className={styles.chart}>
            <div className={styles.chartHead}>
              <span className={`${styles.serif} ${styles.chartTitle}`}>Progress</span>
              <span className={styles.chartDelta}>+12.5 kg · 6 wk</span>
            </div>
            <svg
              className={styles.chartSvg}
              viewBox="0 0 220 130"
              aria-hidden
            >
              <defs>
                <linearGradient id="bp-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6EE7B7" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#6EE7B7" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="bp-line" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#6EE7B7" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#A7F3D0" stopOpacity="1" />
                </linearGradient>
              </defs>

              {/* faint baseline */}
              <line
                x1="8" y1="120" x2="212" y2="120"
                stroke="rgba(255,255,255,0.07)" strokeWidth="1"
              />

              {/* area fill under line */}
              <path
                d="M12,110 L51,99 L90,76 L130,65 L169,43 L208,20 L208,120 L12,120 Z"
                fill="url(#bp-area)"
              />

              {/* main line */}
              <polyline
                points="12,110 51,99 90,76 130,65 169,43 208,20"
                fill="none"
                stroke="url(#bp-line)"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* historical dots */}
              <circle cx="12"  cy="110" r="1.6" fill="#6EE7B7" opacity="0.45" />
              <circle cx="51"  cy="99"  r="1.6" fill="#6EE7B7" opacity="0.55" />
              <circle cx="90"  cy="76"  r="1.6" fill="#6EE7B7" opacity="0.65" />
              <circle cx="130" cy="65"  r="1.6" fill="#6EE7B7" opacity="0.7" />
              <circle cx="169" cy="43"  r="1.8" fill="#6EE7B7" opacity="0.85" />

              {/* PR peak — soft outer halo + solid dot */}
              <circle cx="208" cy="20" r="7"   fill="#6EE7B7" opacity="0.12" />
              <circle cx="208" cy="20" r="4"   fill="#6EE7B7" opacity="0.28" />
              <circle cx="208" cy="20" r="2.4" fill="#A7F3D0" />
            </svg>
            <div className={styles.chartFooter}>
              <span className={styles.chartScale}>Apr</span>
              <span className={styles.chartScale}>May</span>
            </div>
          </div>

          {/* Bottom stat row — one tasteful detail, no clutter. */}
          <div className={styles.logFooter}>
            <span className={`${styles.serif} ${styles.logFooterVal}`}>80 kg</span>
            <span className={styles.logFooterMeta}>last working set</span>
          </div>
        </div>
      </div>
    </>
  )
}
