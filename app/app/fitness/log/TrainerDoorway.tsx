'use client'

/**
 * TrainerDoorway — the "Ask Claude, mid-set" sheet inside the workout logger.
 *
 * The user taps "ask Claude" in the logger header, this slides up with a text
 * box. They type their question (their words lead), the live session is
 * attached automatically as context, and "Open in Claude" opens a fresh Claude
 * chat pre-filled with both via claude.ai/new?q= — the same zero-cost-to-us
 * pattern Finance uses. If they have the Vitality MCP connector set up, Claude
 * can also pull their history, sleep, and readiness live. No new API route, no
 * Anthropic spend on our side.
 *
 * Look is mint (logger-native); it mirrors the Vee "open in Claude" doorway.
 */

import { useEffect, useRef, useState } from 'react'
import styles from './trainerDoorway.module.css'
import {
  buildTrainerPrompt,
  trainerContextLines,
  type TrainerSnapshot,
} from '@/lib/workouts/trainerPrompt'

export default function TrainerDoorway({
  open,
  onClose,
  snapshot,
  onBeforeOpen,
}: {
  open: boolean
  onClose: () => void
  snapshot: TrainerSnapshot
  /** Fired right before we hand off to Claude — flush the latest set to the DB. */
  onBeforeOpen?: () => void
}) {
  const [msg, setMsg] = useState('')
  const [showCtx, setShowCtx] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // On open: focus the box (caret only, no select), reset to a clean slate.
  useEffect(() => {
    if (!open) return
    setShowCtx(false)
    const t = setTimeout(() => inputRef.current?.focus(), 220)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  function openInClaude() {
    onBeforeOpen?.()
    const prompt = buildTrainerPrompt(snapshot, msg)
    // Copy too, so it can be pasted into Claude Desktop if needed.
    try {
      navigator.clipboard?.writeText(prompt)
    } catch {
      /* clipboard is best-effort */
    }
    window.open(
      `https://claude.ai/new?q=${encodeURIComponent(prompt)}`,
      '_blank',
      'noopener,noreferrer',
    )
    setMsg('')
    onClose()
  }

  // Cmd/Ctrl+Enter sends, like a chat box.
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      openInClaude()
    }
  }

  const lines = trainerContextLines(snapshot).filter(Boolean)

  return (
    <div
      className={styles.wrap}
      data-open={open ? 'true' : 'false'}
      aria-hidden={!open}
    >
      <div className={styles.scrim} onClick={onClose} />
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label="Ask Claude about this session"
      >
        <div className={styles.door}>
          <div className={styles.grab} aria-hidden />
          <div className={styles.secHead}>
            <span className={styles.eyebrow}>trainer</span>
            <span className={styles.secRule} aria-hidden />
          </div>
          <div className={styles.doorHead}>Ask Claude, mid-set</div>

          <textarea
            ref={inputRef}
            className={styles.input}
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            onKeyDown={onKeyDown}
            rows={3}
            placeholder="What do you want to ask? e.g. I failed my 2nd set, should I push or back off?"
            aria-label="Your question for Claude"
          />

          {/* Live session is attached automatically; collapsed by default. */}
          <button
            type="button"
            className={styles.ctxToggle}
            onClick={() => setShowCtx((v) => !v)}
            aria-expanded={showCtx}
          >
            <svg
              className={`${styles.ctxToggleIcon} ${showCtx ? styles.ctxToggleIconOpen : ''}`}
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Your live {snapshot.dayName} session is attached
          </button>
          {showCtx && (
            <div className={styles.ctx}>
              {lines.length > 0 ? (
                <ul className={styles.ctxList}>
                  {lines.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              ) : (
                <div className={styles.ctxEmpty}>
                  No sets logged yet. Claude will help you start.
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            className={styles.openBtn}
            onClick={openInClaude}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
            Open in Claude
          </button>

          <div className={styles.trust}>
            <span className={styles.trustItem}>
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M5 12h14M12 5v14" />
              </svg>
              Free in Claude
            </span>
            <span className={styles.trustItem}>
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M12 3l7 4v5c0 4-3 7-7 8-4-1-7-4-7-8V7z" />
              </svg>
              Private
            </span>
            <span className={styles.trustItem}>
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M4 12h4l3 7 4-14 3 7h2" />
              </svg>
              Live session
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
