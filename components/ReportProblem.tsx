'use client'

import { useState } from 'react'
import styles from './ReportProblem.module.css'

/**
 * "Report a problem" — a clear, always-visible button in the corner of every
 * app page. Opens a tiny form, sends the message + current page to /api/report,
 * and confirms. Lets users flag bugs instantly so launch-with-bugs is safe:
 * they report, you fix, everyone gets the fix on the next deploy.
 */
type State = 'idle' | 'sending' | 'sent' | 'error'

export default function ReportProblem() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [state, setState] = useState<State>('idle')

  async function send() {
    const text = message.trim()
    if (!text || state === 'sending') return
    setState('sending')
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          page: typeof window !== 'undefined' ? window.location.pathname : '',
        }),
      })
      if (!res.ok) throw new Error('failed')
      setState('sent')
      setMessage('')
      setTimeout(() => {
        setOpen(false)
        setState('idle')
      }, 1800)
    } catch {
      setState('error')
    }
  }

  if (!open) {
    return (
      <button type="button" className={styles.fab} onClick={() => setOpen(true)} aria-label="Report a problem">
        <span className={styles.fabIcon} aria-hidden>!</span>
        Report a problem
      </button>
    )
  }

  return (
    <div className={styles.panel} role="dialog" aria-label="Report a problem">
      <div className={styles.head}>
        <span className={styles.title}>Something broken?</span>
        <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close">
          ×
        </button>
      </div>

      {state === 'sent' ? (
        <p className={styles.thanks}>Thanks — we got it. We&apos;ll fix it fast. 🙌</p>
      ) : (
        <>
          <p className={styles.hint}>Tell us what went wrong — even one line helps. We&apos;ll see the page you&apos;re on.</p>
          <textarea
            className={styles.textarea}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. the water button didn't save…"
            rows={4}
            maxLength={2000}
            autoFocus
          />
          {state === 'error' && <p className={styles.error}>Couldn&apos;t send — try again in a moment.</p>}
          <button type="button" className={styles.send} onClick={send} disabled={!message.trim() || state === 'sending'}>
            {state === 'sending' ? 'Sending…' : 'Send report'}
          </button>
        </>
      )}
    </div>
  )
}
