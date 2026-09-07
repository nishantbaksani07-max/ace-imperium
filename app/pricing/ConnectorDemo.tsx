'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'

import styles from './pricing.module.css'

/**
 * ConnectorDemo — the "what the connectors actually do" moment on Pricing.
 *
 * A phone (same titanium-chassis frame as the landing's HeroPhones) running
 * the real Claude app with Vitality connected. A scripted exchange plays: you
 * ask a vague question, Claude reads your connector data and answers. It
 * cycles between two fully-honest examples — money and recovery.
 *
 * Honesty rules (verified against the live MCP tools):
 *  - Subscriptions expose name + price + RENEWAL DATE only. No usage data,
 *    so Claude never claims "you haven't opened it" — it just flags the renewal.
 *  - finance_overview exposes holdings (tickers + shares). Claude knows you
 *    HOLD DIS/MO; it then *researches* the earnings itself (its own capability).
 *  - Sleep / training days / supplements are all real MCP reads.
 *
 * The phone rises in on scroll, then the chat builds: question → typing →
 * answer, line by line. SSR renders the full first exchange for no-JS.
 */

// Two honest scripts. Each: a question + up to three answer lines (mint <em>
// marks the real data entities pulled from the connector).
const SCRIPTS: { q: string; lines: ReactNode[] }[] = [
  {
    // The "Vee" moment — ask your life a question, get a reasoned answer
    // from your real data. Non-diagnostic, with a sensible safety line.
    q: 'I feel really off today. Why?',
    lines: [
      <>
        A few things line up. You slept <em>5h</em> the last two nights and
        your recovery&apos;s low.
      </>,
      <>
        You trained hard <em>3 days running</em> and barely drank water
        yesterday — <em>2 of 8</em>.
      </>,
      <>
        Looks like you&apos;re run-down and dehydrated. Easy day, water, early
        night. If it&apos;s more than that, see a doctor.
      </>,
    ],
  },
  {
    q: 'Any money slipping this week?',
    lines: [
      <>A couple of things from your connected accounts.</>,
      <>
        Your <em>CapCut</em> subscription renews Thursday — CHF&nbsp;9.99/mo.
        Nothing urgent, unless you&apos;d rather drop it.
      </>,
      <>
        And you hold <em>DIS</em> and <em>MO</em> — both report earnings next
        week. Want me to pull the numbers and weigh hold vs sell?
      </>,
    ],
  },
]

// One frame = a snapshot. `ai` = how many answer lines are shown. `hold` = ms
// before advancing. Frame 0 is the full state (SSR + final line reveal); the
// loop runs 0 → 1(clear, swaps script) → build → back to 0.
const FRAMES = [
  { user: true, typing: false, ai: 3, hold: 4200 },
  { user: false, typing: false, ai: 0, hold: 360 },
  { user: true, typing: false, ai: 0, hold: 520 },
  { user: true, typing: true, ai: 0, hold: 760 },
  { user: true, typing: false, ai: 1, hold: 380 },
  { user: true, typing: false, ai: 2, hold: 400 },
] as const

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function ConnectorDemo() {
  const stageRef = useRef<HTMLDivElement>(null)
  const [revealed, setRevealed] = useState(false)
  const [idx, setIdx] = useState(0)
  const [scriptIdx, setScriptIdx] = useState(0)

  // Reveal on scroll-in, then kick off the build (unless reduced motion).
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setRevealed(true)
            if (!prefersReduced()) setIdx(1)
            io.disconnect()
          }
        }
      },
      { threshold: 0.25 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Advance the script while revealed; swap to the next example each loop.
  useEffect(() => {
    if (!revealed || prefersReduced()) return
    const id = setTimeout(() => {
      const next = (idx + 1) % FRAMES.length
      if (next === 1) setScriptIdx((s) => (s + 1) % SCRIPTS.length)
      setIdx(next)
    }, FRAMES[idx].hold)
    return () => clearTimeout(id)
  }, [idx, revealed])

  const frame = FRAMES[idx]
  const script = SCRIPTS[scriptIdx]

  return (
    <div
      ref={stageRef}
      className={`${styles.demoStage} ${revealed ? styles.revealed : ''}`}
    >
      <div className={styles.phoneReveal}>
        <div className={styles.phoneFloat}>
          <div className={styles.phone}>
            <span className={styles.screenGlare} aria-hidden />
            <div className={styles.phoneScreen}>
              <div className={styles.island} aria-hidden />

              {/* Status bar */}
              <div className={styles.statusBar} aria-hidden>
                <span className={styles.statusTime}>9:41</span>
                <span className={styles.statusIcons}>
                  <SignalIcon />
                  <WifiIcon />
                  <BatteryIcon />
                </span>
              </div>

              {/* Claude app header */}
              <div className={styles.appHead}>
                <span className={styles.appBack} aria-hidden>
                  ‹
                </span>
                <span className={styles.appName}>
                  Claude <span className={styles.appCaret}>⌄</span>
                </span>
                <span className={styles.appGem} aria-hidden>
                  V
                </span>
              </div>
              <div className={styles.connectorBar}>
                <span className={styles.connectorPill}>
                  <span className={styles.connectorDot} aria-hidden />
                  Vitality connected
                </span>
                <span className={styles.connectorScope}>
                  subscriptions · portfolio · fitness
                </span>
              </div>

              {/* Chat — bottom-anchored, newest pushes up */}
              <div className={styles.chat} aria-live="polite">
                {frame.user && (
                  <div className={styles.userMsg}>{script.q}</div>
                )}

                {(frame.typing || frame.ai >= 1) && (
                  <div className={styles.aiMsg}>
                    <span className={styles.aiAvatar} aria-hidden>
                      <ClaudeStar />
                    </span>
                    <div className={styles.aiBody}>
                      {frame.typing ? (
                        <span className={styles.typing} aria-hidden>
                          <span />
                          <span />
                          <span />
                        </span>
                      ) : (
                        script.lines.map(
                          (line, i) =>
                            frame.ai >= i + 1 && (
                              <p key={i} className={styles.aiLine}>
                                {line}
                              </p>
                            ),
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Decorative composer */}
              <div className={styles.composer} aria-hidden>
                <span className={styles.composerInput}>Reply to Claude…</span>
                <span className={styles.composerSend}>↑</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Official Claude sparkle mark + status-bar glyphs ─────────────── */

function ClaudeStar() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.6 2.4l1.7 5.4 5.4 1.7-5.4 1.7-1.7 5.4-1.7-5.4-5.4-1.7 5.4-1.7z" />
      <path d="M18.7 13.6l.8 2.5 2.5.8-2.5.8-.8 2.5-.8-2.5-2.5-.8 2.5-.8z" />
    </svg>
  )
}

function SignalIcon() {
  return (
    <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor" aria-hidden>
      <rect x="0" y="7" width="3" height="4" rx="0.6" />
      <rect x="4.5" y="5" width="3" height="6" rx="0.6" />
      <rect x="9" y="2.5" width="3" height="8.5" rx="0.6" />
      <rect x="13.5" y="0" width="3" height="11" rx="0.6" />
    </svg>
  )
}

function WifiIcon() {
  return (
    <svg width="16" height="11" viewBox="0 0 16 11" fill="none" aria-hidden>
      <path d="M1 3.2A11 11 0 0 1 15 3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3.4 5.8A7 7 0 0 1 12.6 5.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M5.8 8.4A3.2 3.2 0 0 1 10.2 8.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="10.4" r="0.9" fill="currentColor" />
    </svg>
  )
}

function BatteryIcon() {
  return (
    <svg width="25" height="12" viewBox="0 0 25 12" fill="none" aria-hidden>
      <rect x="0.6" y="0.6" width="21" height="10.8" rx="2.8" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1" />
      <rect x="2.2" y="2.2" width="16" height="7.6" rx="1.6" fill="currentColor" />
      <path d="M23.4 4v4a2 2 0 0 0 1-1.7v-.6A2 2 0 0 0 23.4 4Z" fill="currentColor" fillOpacity="0.5" />
    </svg>
  )
}
