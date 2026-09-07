'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { addNote, deleteNote, saveMood } from '@/app/app/mentor/actions'
import { MOOD_LEVELS, buildMoodStrip, localDateKey, type MoodPoint, type RawMoodFact } from '@/app/app/mentor/moodData'
import type { Note } from '@/app/app/mentor/types'
import { claudeHandoffHref, quickQuestions, type ClaudeHandoffContext } from '@/lib/vee/claudeHandoff'
import styles from './veeBottomStrip.module.css'

/**
 * The kept bottom strip from the live mentor remodel, split (v1.2) into two
 * named sections the page mounts under its own numbered heads:
 *
 *   VeeAsk  - ·03, refocused entirely on CLAUDE: the mint-sparkle "Ask Vee
 *             anything about your week..." composer front and center, the
 *             OPEN IN CLAUDE affordance beside it, and the quick questions
 *             demoted to small chips underneath. One section, one destination.
 *   VeeKeep - ·04: the "throw a thought in" glass void (alive, never greyed)
 *             with its thoughts disclose, and the "How are you, really?" mood
 *             faces with the 7-day strip.
 *
 * Claude handoff: the quick questions are built from the modules the user
 * ACTUALLY tracks (claudeContext.activeModules), and every hop to claude.ai
 * carries the server-assembled context block, so Claude arrives knowing the
 * user. No context = the bare question, exactly as before.
 *
 * Writes reuse the mentor's RLS-scoped server actions. Success UI is gated on
 * the ACTUAL action result: a note input is never cleared before res.ok, and a
 * mood tap reverts if the save fails. readOnly (the preview harness) keeps
 * every action local.
 */

const FACES: Record<number, ReactNode> = {
  1: <><circle cx={12} cy={12} r={9.2} /><path d="M8 16c1.2-1.6 6.8-1.6 8 0" /><path d="M8.5 9.5h.01M15.5 9.5h.01" /></>,
  2: <><circle cx={12} cy={12} r={9.2} /><path d="M8.5 15c1-.7 6-.7 7 0" /><path d="M8.5 9.5h.01M15.5 9.5h.01" /></>,
  3: <><circle cx={12} cy={12} r={9.2} /><path d="M8.5 15h7" /><path d="M8.5 9.5h.01M15.5 9.5h.01" /></>,
  4: <><circle cx={12} cy={12} r={9.2} /><path d="M8 14c1.2 1.6 6.8 1.6 8 0" /><path d="M8.5 9.5h.01M15.5 9.5h.01" /></>,
  5: <><circle cx={12} cy={12} r={9.2} /><path d="M7.5 13.5c1.6 2.4 7.4 2.4 9 0" /><path d="M8.5 9.5h.01M15.5 9.5h.01" /></>,
}
const DOW_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
function dayLetter(dayKey: string): string {
  const d = new Date(`${dayKey}T12:00:00`)
  return DOW_LETTER[d.getDay()] ?? ''
}

function formatNoteDate(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export interface VeeAskProps {
  /** Server-assembled handoff context: drives the quick-question chips and
   *  rides along on every hop to Claude. Null = generic questions, bare hops. */
  claudeContext?: ClaudeHandoffContext | null
}

/** ·03 - the Claude section: composer first, OPEN IN CLAUDE beside it, the
 *  module-aware quick questions as small chips under it. */
export function VeeAsk({ claudeContext = null }: VeeAskProps) {
  const [askDraft, setAskDraft] = useState('')
  const suggestions = quickQuestions(claudeContext?.activeModules)

  // Ask Vee: the composer hands the question to Claude (the real Vee brain),
  // context block attached so Claude already knows the user's real state.
  function handleAsk(e: FormEvent) {
    e.preventDefault()
    const q = askDraft.trim()
    if (!q) return
    window.open(claudeHandoffHref(q, claudeContext), '_blank', 'noopener,noreferrer')
    setAskDraft('')
  }

  return (
    <div className={`${styles.strip} ${styles.work}`}>
      <form className={styles.composer} onSubmit={handleAsk}>
        <svg className={styles.composerSpark} viewBox="0 0 24 24"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" /></svg>
        <input
          type="text"
          placeholder="Ask Vee anything about your week..."
          aria-label="Ask Vee"
          value={askDraft}
          onChange={e => setAskDraft(e.target.value)}
          maxLength={600}
        />
        <button type="submit" className={styles.send} disabled={!askDraft.trim()} aria-label="Ask in Claude">
          <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
      </form>

      {/* the quick questions, demoted to small chips; the OPEN IN CLAUDE
          affordance closes the row (iris = the Claude accent) */}
      <div className={styles.chips}>
        {suggestions.map((sug, i) => (
          <a
            key={sug.prompt}
            className={styles.chip}
            style={{ animationDelay: `${0.2 + i * 0.06}s` }}
            href={claudeHandoffHref(sug.prompt, claudeContext)}
            target="_blank"
            rel="noreferrer"
          >
            <svg viewBox="0 0 24 24"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" /></svg>
            {sug.title}
          </a>
        ))}
        <Link className={styles.claudeCorner} href="/connect" aria-label="Open Vee in Claude">
          <svg viewBox="0 0 24 24"><path d="M7 17L17 7M9 7h8v8" /></svg>
          OPEN IN CLAUDE
        </Link>
      </div>
    </div>
  )
}

export interface VeeKeepProps {
  notes: Note[]
  /** SSR initial strip (server-clock day keys, corrected client-side). */
  moodHistory: MoodPoint[]
  /** Raw mood facts (newest first): when present, the strip is rebuilt in the
   *  browser so day boundaries use the USER'S timezone, not the server's. */
  moodFacts?: RawMoodFact[]
  readOnly?: boolean
}

/** ·04 - the thoughts void + the mood check-in. */
export function VeeKeep({ notes: initialNotes, moodHistory, moodFacts, readOnly = false }: VeeKeepProps) {
  return (
    <div className={styles.strip}>
      <NotesVoid initialNotes={initialNotes} readOnly={readOnly} />
      <MoodRow history={moodHistory} facts={moodFacts} readOnly={readOnly} />
    </div>
  )
}

/* ---- the void: throw a thought in + N THOUGHTS. The input clears ONLY after
   the server said ok (the addNote data-loss rule). ---- */
function NotesVoid({ initialNotes, readOnly }: { initialNotes: Note[]; readOnly: boolean }) {
  const [notes, setNotes] = useState<Note[]>(initialNotes)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const body = draft.trim()
    if (!body || saving) return
    if (readOnly) {
      setNotes(prev => [{ id: `preview-${Date.now()}`, body, created_at: new Date().toISOString() }, ...prev])
      setDraft('')
      return
    }
    setSaving(true)
    setError(null)
    const result = await addNote(body)
    setSaving(false)
    if (result.ok) {
      setNotes(prev => [result.note, ...prev])
      setDraft('')
    } else if (result.error === 'too_long') {
      setError('too long. keep it under 4000 chars')
    } else {
      setError('could not save. your words are still here, try again')
    }
  }

  async function handleDelete(id: string) {
    // Surgical revert: keep ONLY the removed note aside, so a slow failed delete
    // can never wipe a thought that was added (and saved) while it was in flight.
    const removed = notes.find(n => n.id === id)
    setNotes(cur => cur.filter(n => n.id !== id))
    if (readOnly || !removed) return
    const result = await deleteNote(id)
    if (!result.ok) {
      setNotes(cur => {
        if (cur.some(n => n.id === removed.id)) return cur
        const next = [...cur, removed]
        next.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        return next
      })
    }
  }

  return (
    <section className={styles.void} aria-label="The void">
      <p className={styles.voidLede}>whatever is in your head, leave it here. I keep it.</p>
      <form className={styles.voidBar} onSubmit={handleAdd}>
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 8.4v7.2M8.4 12h7.2" /></svg>
        <input
          type="text"
          placeholder="Throw a thought in..."
          aria-label="Throw a thought in"
          value={draft}
          onChange={e => { setDraft(e.target.value); if (error) setError(null) }}
          maxLength={4000}
        />
      </form>
      {error && <span className={styles.voidError}>{error}</span>}

      <button
        type="button"
        className={`${styles.voidDisclose} ${open ? styles.open : ''}`}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        {notes.length} {notes.length === 1 ? 'thought' : 'thoughts'}
        <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </button>

      {open && (
        notes.length === 0 ? (
          <p className={styles.voidEmpty}>empty. nothing has been thrown in yet.</p>
        ) : (
          <div className={styles.voidList}>
            {notes.map((n, i) => (
              <div key={n.id} className={styles.voidItem} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                <p className={styles.voidItemBody}>{n.body}</p>
                <span className={styles.voidItemMeta}>{formatNoteDate(n.created_at)}</span>
                <button
                  type="button"
                  className={styles.voidDelete}
                  onClick={() => handleDelete(n.id)}
                  aria-label="delete thought"
                >
                  <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
            ))}
          </div>
        )
      )}
    </section>
  )
}

/* ---- mood: 5 line-art faces + the 7-day strip. Optimistic tap, but the
   selection reverts if the save actually failed. The strip and "today" are
   rebuilt in the BROWSER from the raw facts, so the day boundary is the
   user's timezone, never the UTC server's. ---- */
function MoodRow({ history, facts, readOnly }: { history: MoodPoint[]; facts?: RawMoodFact[]; readOnly: boolean }) {
  const todayScore = history.length ? history[history.length - 1].score : null
  const [selected, setSelected] = useState<number | null>(todayScore)
  const [strip, setStrip] = useState<MoodPoint[]>(history)
  const [open, setOpen] = useState(false)
  // Latest-wins: a slow failed tap must never revert a newer successful one.
  const pickSeq = useRef(0)

  // After hydration, re-key the strip by the browser's local days.
  useEffect(() => {
    if (!facts) return
    const local = buildMoodStrip(facts, localDateKey(), 7)
    setStrip(local)
    setSelected(local.length ? local[local.length - 1].score : null)
  }, [facts])

  async function pick(score: number) {
    const prevSelected = selected
    const prevStrip = strip
    const seq = ++pickSeq.current
    setSelected(score)
    setStrip(prev => prev.map((p, i) => (i === prev.length - 1 ? { ...p, score } : p)))
    if (readOnly) return
    const res = await saveMood(score, { dayKey: localDateKey(), tzOffsetMin: new Date().getTimezoneOffset() })
    if (pickSeq.current !== seq) return // a newer tap owns the UI now
    if (!res.ok) {
      // the save failed: put the honest state back, never a fake checkmark
      setSelected(prevSelected)
      setStrip(prevStrip)
    }
  }

  return (
    <section className={styles.mood} aria-label="How are you">
      <span className={styles.moodLede}>How are you, really?</span>
      <div className={styles.faces}>
        {MOOD_LEVELS.map((lvl, i) => (
          <button
            key={lvl.score}
            type="button"
            className={`${styles.face} ${selected === lvl.score ? styles.sel : ''}`}
            style={{ animationDelay: `${0.3 + i * 0.05}s` }}
            onClick={() => pick(lvl.score)}
            aria-pressed={selected === lvl.score}
            aria-label={lvl.label}
          >
            <svg viewBox="0 0 24 24">{FACES[lvl.score]}</svg>
          </button>
        ))}
      </div>
      {strip.length > 0 && (
        <>
          <button
            type="button"
            className={`${styles.moodStrip} ${open ? styles.open : ''}`}
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
          >
            7-day mood
            <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
          <div className={`${styles.weekStrip} ${open ? styles.open : ''}`} aria-hidden={!open}>
            {strip.map((p, i) => (
              <div key={p.dayKey} className={styles.col}>
                <div
                  className={`${styles.bar} ${p.score ? '' : styles.barEmpty}`}
                  style={{ height: p.score ? `${16 + p.score * 7}px` : '6px' }}
                />
                <div className={styles.d}>{i === strip.length - 1 ? '·' : dayLetter(p.dayKey)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
