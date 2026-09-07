'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import styles from './brand.module.css'
import { buildInsightPayload } from './insightPayload'
import type { Brand } from './types'

/**
 * Ask the business mentor — the conversational sibling of InsightBanner.
 *
 * InsightBanner gives a one-shot formatted "read". This lets the user actually
 * ASK things ("should I raise my price?", "what's my best growth lever?",
 * "is this listing any good?") and get a direct answer grounded in their tracked
 * numbers + public links. Hits /api/brand/ask (Claude + server-side web_fetch).
 *
 * The thread is ephemeral (component state) — it's a working conversation, not
 * a saved log. The brand's cached one-shot read (lastInsight) is the durable
 * artifact; this is for digging in. 402 -> Pro upsell, matching the rest of the
 * business surface.
 */

interface Turn { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'What should I focus on this week?',
  'Is my pricing right?',
  'What’s my biggest growth lever?',
]

/** Split a line on **bold** spans into JSX (shared shape with InsightBanner). */
function renderInline(text: string, keyBase: string): JSX.Element[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(part)
    return m
      ? <strong key={`${keyBase}-${i}`}>{m[1]}</strong>
      : <span key={`${keyBase}-${i}`}>{part}</span>
  })
}

/** Render the mentor's "lines + '- ' bullets + **bold**" answer format. */
function renderAnswer(text: string): JSX.Element[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const out: JSX.Element[] = []
  let bullets: string[] = []
  let key = 0
  const flush = () => {
    if (bullets.length === 0) return
    const items = bullets
    const k = key++
    out.push(
      <ul key={`ul-${k}`} className={styles.insightBullets}>
        {items.map((b, i) => <li key={i}>{renderInline(b, `b${k}-${i}`)}</li>)}
      </ul>
    )
    bullets = []
  }
  for (const line of lines) {
    if (line.startsWith('- ')) {
      bullets.push(line.slice(2))
    } else {
      flush()
      const k = key++
      out.push(<p key={`p-${k}`} className={styles.askAnswerLine}>{renderInline(line, `p${k}`)}</p>)
    }
  }
  flush()
  return out
}

export default function AskMentor({ brand }: { brand: Brand }) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsPro, setNeedsPro] = useState(false)
  const threadRef = useRef<HTMLDivElement>(null)

  // Keep the latest turn in view as the conversation grows.
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns, loading])

  async function ask(questionRaw: string) {
    const question = questionRaw.trim()
    if (!question || loading) return
    setError(null)
    setNeedsPro(false)
    setDraft('')
    // History sent to the server is the conversation BEFORE this question.
    const history = turns
    setTurns(prev => [...prev, { role: 'user', content: question }])
    setLoading(true)
    try {
      const res = await fetch('/api/brand/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: buildInsightPayload(brand), question, history }),
      })
      if (res.status === 402) { setNeedsPro(true); return }
      const data = await res.json().catch(() => ({})) as { answer?: string; error?: string }
      if (!res.ok || !data.answer) throw new Error(data.error || `request failed (${res.status})`)
      setTurns(prev => [...prev, { role: 'assistant', content: data.answer as string }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the mentor.')
    } finally {
      setLoading(false)
    }
  }

  const empty = turns.length === 0

  return (
    <div className={styles.askCard}>
      <div className={styles.insightHead}>
        <span className={styles.insightSpark} aria-hidden>✦</span>
        <span className={styles.insightEyebrow}>Ask the mentor</span>
      </div>

      {!empty && (
        <div className={styles.askThread} ref={threadRef}>
          {turns.map((t, i) => (
            t.role === 'user' ? (
              <div key={i} className={styles.askUser}>{t.content}</div>
            ) : (
              <div key={i} className={styles.askAnswer}>{renderAnswer(t.content)}</div>
            )
          ))}
          {loading && (
            <p className={styles.insightLoading}>
              <span className={styles.insightLoadingDot} aria-hidden />
              Thinking…
            </p>
          )}
        </div>
      )}

      {empty && (
        <p className={styles.insightBody}>
          Ask anything about this venture. The mentor sees your numbers and can read your public links.
        </p>
      )}

      {empty && (
        <div className={styles.askChips}>
          {SUGGESTIONS.map(s => (
            <button key={s} type="button" className={styles.askChip} onClick={() => ask(s)} disabled={loading}>
              {s}
            </button>
          ))}
        </div>
      )}

      {needsPro && (
        <p className={styles.insightUpsell}>
          The business mentor is a Pro feature.{' '}
          <Link href="/pricing" className={styles.insightUpsellLink}>See Pro →</Link>
        </p>
      )}
      {error && <p className={styles.insightError}>{error}</p>}

      <form
        className={styles.askForm}
        onSubmit={(e) => { e.preventDefault(); ask(draft) }}
      >
        <input
          className={styles.askInput}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={empty ? 'Ask a question…' : 'Ask a follow-up…'}
          autoComplete="off"
          disabled={loading}
        />
        <button type="submit" className={styles.askSend} disabled={loading || !draft.trim()}>
          {loading ? '…' : 'Ask'}
        </button>
      </form>
    </div>
  )
}
