'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react'
import AskCard from '@/components/vee/AskCard'
import styles from './mentorRemodel.module.css'
import { addNote, deleteNote, saveMood } from './actions'
import { logNoticedShown } from './noticedActions'
import { MOOD_LEVELS, localDateKey, type MoodPoint } from './moodData'
import { readMentorSeed } from '@/lib/vitals/mentorSeed'
import { makeCardStyle, type LayoutKind } from '@/lib/vee/askLayout'
import type { FeedNotice } from '@/lib/insights/feed'
import type { TickerRow } from '@/lib/insights/ticker'
import type { GuideItem } from '@/lib/insights/goalGuide'
import type { LifeChip } from '@/lib/insights/lifeChips'
import type { VentTeaser } from './ventTeaser'
import type { ChatMessage, ContextFact, MemoryFact, MentorTickerItem, Note, TrainingDayProps, VeeAsk, VeeAskOption } from './types'

// Props stay identical so page.tsx keeps compiling. The remodel simply stops
// rendering ticker / facts / trainingDay / contextFacts / ventTeaser and the
// heavier veeNoticed surfaces (rows / guides / lifeChips) — only feed[] is used.
interface MentorModuleProps {
  firstName: string | null
  initialNotes: Note[]
  ticker: MentorTickerItem[]
  facts: MemoryFact[]
  trainingDay: TrainingDayProps | null
  contextFacts: ContextFact[]
  moodHistory: MoodPoint[]
  veeNoticed: { rows: TickerRow[]; guides?: Record<string, GuideItem[]>; lifeChips: LifeChip[]; feed: FeedNotice[] }
  ventTeaser: VentTeaser
}

const SUGGESTIONS: { title: string; prompt: string }[] = [
  { title: 'How is my week looking?',       prompt: "how's my week looking?" },
  { title: 'What should I focus on today?', prompt: 'what should i focus on today?' },
  { title: 'How is my recovery trending?',  prompt: 'how is my recovery trending?' },
  { title: 'Am I drinking enough water?',   prompt: 'am i drinking enough water?' },
]

export default function MentorModule({ firstName, initialNotes, moodHistory, veeNoticed }: MentorModuleProps) {
  const [notes, setNotes] = useState<Note[]>(initialNotes)
  const [noteDraft, setNoteDraft] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)
  const [voidOpen, setVoidOpen] = useState(false)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatDraft, setChatDraft] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  // Time-of-day greeting is set after mount so SSR and client never disagree.
  const [greeting, setGreeting] = useState('Hello')
  useEffect(() => {
    const h = new Date().getHours()
    setGreeting(h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening')
  }, [])

  // Drifting particles — the client atmosphere effect from the preview. Built on
  // mount only (random values) so SSR renders none and hydration stays clean.
  const [particles, setParticles] = useState<Particle[]>([])
  useEffect(() => {
    const N = window.innerWidth < 640 ? 16 : 24
    setParticles(Array.from({ length: N }, () => {
      const dur = 22 + Math.random() * 28
      return {
        left: Math.random() * 100,
        top: 60 + Math.random() * 40,
        size: Number((1.2 + Math.random() * 1.2).toFixed(2)),
        dur,
        delay: -Math.random() * dur,
        dx: Math.round(Math.random() * 30 - 15),
        dy: Math.round(60 + Math.random() * 50),
      }
    }))
  }, [])

  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null)

  // Both "talk deeper" affordances land the user in the chat composer, the real
  // in-app Vee. (The "OPEN IN CLAUDE" pill routes to /account, the MCP setup.)
  const toChat = () => {
    chatInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    chatInputRef.current?.focus({ preventScroll: true })
  }
  // Last few layouts used, so consecutive ask cards never repeat a shape.
  const recentLayouts = useRef<LayoutKind[]>([])

  useEffect(() => {
    // Instant, NOT smooth — a smooth scroll under the fixed grain overlay forces a
    // full-page re-composite each frame (the "card blanks" flash). One jump = one paint.
    chatEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, chatSending])

  // Bridged from a vitals metric ("talk about this") — open with the generated
  // question so the user's first reply runs the normal full-context chat flow.
  useEffect(() => {
    const seed = readMentorSeed()
    if (seed?.opener) setMessages([{ role: 'assistant', content: seed.opener }])
  }, [])

  async function handleAddNote(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const body = noteDraft.trim()
    if (!body || noteSaving) return
    setNoteSaving(true)
    setNoteError(null)
    const result = await addNote(body)
    setNoteSaving(false)
    if (result.ok) {
      setNotes(prev => [result.note, ...prev])
      setNoteDraft('')
    } else if (result.error === 'too_long') {
      setNoteError('too long. keep it under 4000 chars')
    } else if (result.error === 'notes_table_missing') {
      setNoteError('notes table not set up yet. ask Alex to run the BUILD16 migration')
    } else {
      setNoteError('could not save')
    }
  }

  async function handleDeleteNote(id: string) {
    const prev = notes
    setNotes(notes.filter(n => n.id !== id))
    const result = await deleteNote(id)
    if (!result.ok) setNotes(prev)
  }

  // One chat turn: optimistically show `next`, post it, append Vee's reply
  // (which may carry an `ask` card). Shared by free-text sends and card answers.
  async function runTurn(next: ChatMessage[]) {
    setMessages(next)
    setChatDraft('')
    setChatSending(true)
    setChatError(null)
    try {
      const res = await fetch('/api/mentor/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) }),
      })
      const data = await res.json().catch(() => null) as { reply?: string; ask?: VeeAsk | null; error?: string } | null
      // A card-only reply (empty text) is valid — the question lives in the card.
      if (!res.ok || (!data?.reply && !data?.ask)) {
        setChatError(data?.error ?? 'Vee failed to reply')
        setChatSending(false)
        return
      }
      let cardStyle
      if (data.ask) {
        cardStyle = makeCardStyle(data.ask, recentLayouts.current)
        recentLayouts.current = [...recentLayouts.current, cardStyle.layout].slice(-3)
      }
      setMessages([...next, { role: 'assistant', content: data.reply ?? '', ask: data.ask ?? undefined, cardStyle }])
    } catch {
      setChatError('network error')
    } finally {
      setChatSending(false)
    }
  }

  function sendMessage(content: string) {
    if (!content || chatSending) return
    runTurn([...messages, { role: 'user', content }])
  }

  // Tapping an option locks that card (chosen chip lit) and sends the option's
  // natural-language value as the next turn, so the conversation flows on.
  function answerAsk(index: number, option: VeeAskOption) {
    if (chatSending) return
    const base = messages.map((m, i) => (i === index ? { ...m, askAnswered: option.value } : m))
    runTurn([...base, { role: 'user', content: option.value }])
  }

  // "say it in my own words" — just drop focus into the box; the card stays.
  function sayOwnWords() {
    chatInputRef.current?.focus()
  }

  function handleSend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    sendMessage(chatDraft.trim())
  }

  function handleChatKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter (without shift) submits — feels like a chat app, not a textarea.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(chatDraft.trim())
    }
  }

  return (
    <div className={styles.root}>
      {/* the world / atmosphere — aurora, mountains, drifting particles, grain */}
      <div className={styles.atmosphere} aria-hidden />
      <div className={styles.mountains} aria-hidden>
        <svg viewBox="0 0 1600 420" preserveAspectRatio="none">
          <defs>
            <linearGradient id="mtFar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d1a17" stopOpacity="0" />
              <stop offset="55%" stopColor="#0d1a17" stopOpacity=".55" />
              <stop offset="100%" stopColor="#0d1a17" stopOpacity=".95" />
            </linearGradient>
            <linearGradient id="mtNear" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#050a09" stopOpacity=".4" />
              <stop offset="60%" stopColor="#050a09" stopOpacity=".95" />
              <stop offset="100%" stopColor="#050a09" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path d="M0,300 L120,230 L210,260 L320,180 L430,220 L560,150 L680,210 L820,170 L960,220 L1100,180 L1240,240 L1380,200 L1500,250 L1600,220 L1600,420 L0,420 Z" fill="url(#mtFar)" />
          <path d="M0,360 L100,320 L220,340 L340,290 L460,330 L590,300 L720,340 L860,310 L1000,350 L1140,310 L1280,355 L1420,320 L1540,360 L1600,340 L1600,420 L0,420 Z" fill="url(#mtNear)" />
        </svg>
      </div>
      <div className={styles.particles} aria-hidden>
        {particles.map((p, i) => (
          <span
            key={i}
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: p.size,
              height: p.size,
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
              '--dx': `${p.dx}px`,
              '--dy': `-${p.dy}vh`,
            } as CSSProperties}
          />
        ))}
      </div>
      <div className={styles.grain} aria-hidden />

      <main className={styles.page}>
        {/* 1 · slim header */}
        <header className={styles.head}>
          <Link className={styles.back} href="/app" aria-label="Back to dashboard">
            <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
            DASHBOARD
          </Link>
          <div className={styles.greetWrap}>
            <div className={styles.greetText}>
              <span className={styles.greetLabel}>VITALITY · VEE</span>
              <span className={styles.greetLine} suppressHydrationWarning>
                {greeting}{firstName ? `, ${firstName}` : ''}.
              </span>
            </div>
            <div className={styles.mark} aria-hidden>V</div>
          </div>
        </header>

        {/* 2 · the one "Vitality noticed" card */}
        <NoticedCard feed={veeNoticed.feed} onDeeper={toChat} />

        {/* 3 · chat, the visual center */}
        <section className={styles.chat} aria-label="Ask Vee">
          <div className={styles.chatHead}>
            <h2 className={styles.chatIntro}>What do you want to work through?</h2>
            <Link className={styles.claudeCorner} href="/account" aria-label="Open Vee in Claude">
              <svg viewBox="0 0 24 24"><path d="M7 17L17 7M9 7h8v8" /></svg>
              OPEN IN CLAUDE
            </Link>
          </div>

          {messages.length === 0 ? (
            <div className={styles.chips}>
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={s.prompt}
                  type="button"
                  className={styles.chip}
                  style={{ animationDelay: `${0.34 + i * 0.06}s` }}
                  onClick={() => sendMessage(s.prompt)}
                >
                  <svg viewBox="0 0 24 24"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" /></svg>
                  {s.title}
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.thread}>
              {messages.map((m, i) => {
                if (m.role === 'user') {
                  return <div key={i} className={styles.bubUser}>{m.content}</div>
                }
                if (m.ask) {
                  const isFollowUp = !m.content.trim() && i > 0
                  return (
                    <div key={i} className={styles.askWrap}>
                      {m.content.trim()
                        ? <div className={styles.bubVee}>{renderAssistantMarkdown(m.content)}</div>
                        : isFollowUp ? <FollowLink /> : null}
                      <AskCard
                        ask={m.ask}
                        answered={m.askAnswered}
                        cardStyle={m.cardStyle}
                        onPick={(o) => answerAsk(i, o)}
                        onSayOwnWords={sayOwnWords}
                      />
                    </div>
                  )
                }
                return <div key={i} className={styles.bubVee}>{renderAssistantMarkdown(m.content)}</div>
              })}
              {chatSending && (
                <div className={styles.bubThink}>
                  <span className={styles.dots}><i /><i /><i /></span>
                  <span className={styles.thinkLabel}>Vee is thinking</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}

          {chatError && <p className={styles.chatError}>{chatError}</p>}

          <form className={styles.composer} onSubmit={handleSend}>
            <svg className={styles.composerSpark} viewBox="0 0 24 24"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" /></svg>
            <textarea
              ref={chatInputRef}
              placeholder="Ask Vee anything about your week..."
              aria-label="Ask Vee"
              value={chatDraft}
              onChange={e => setChatDraft(e.target.value)}
              onKeyDown={handleChatKeyDown}
              rows={1}
              disabled={chatSending}
            />
            <button
              type="submit"
              className={styles.send}
              disabled={!chatDraft.trim() || chatSending}
              aria-label="Send"
            >
              <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </form>
        </section>

        {/* 4 · the void */}
        <section className={styles.void} aria-label="The void">
          <form className={styles.voidBar} onSubmit={handleAddNote}>
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 8.4v7.2M8.4 12h7.2" /></svg>
            <input
              type="text"
              placeholder="Throw a thought in..."
              aria-label="Throw a thought in"
              value={noteDraft}
              onChange={e => { setNoteDraft(e.target.value); if (noteError) setNoteError(null) }}
              maxLength={4000}
            />
          </form>
          {noteError && <span className={styles.voidError}>{noteError}</span>}

          <button
            type="button"
            className={`${styles.voidDisclose} ${voidOpen ? styles.open : ''}`}
            onClick={() => setVoidOpen(v => !v)}
            aria-expanded={voidOpen}
          >
            {notes.length} {notes.length === 1 ? 'thought' : 'thoughts'}
            <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>

          {voidOpen && (
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
                      onClick={() => handleDeleteNote(n.id)}
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

        {/* 5 · mood row */}
        <MoodRow history={moodHistory} />
      </main>
    </div>
  )
}

interface Particle { left: number; top: number; size: number; dur: number; delay: number; dx: number; dy: number }

/* ================================================================
   The "Vitality noticed" card — feed[0] with a "show me another" cycle,
   the one-shot mint bloom, and the whisper-rarity marker.
   ================================================================ */
function NoticedCard({ feed, onDeeper }: { feed: FeedNotice[]; onDeeper: () => void }) {
  const [idx, setIdx] = useState(0)
  const notice = feed[idx] ?? feed[0]

  // A fusion seam show is logged so its pattern rests on cooldown (gift pacing).
  useEffect(() => {
    if (notice?.patternKey) void logNoticedShown(notice.patternKey)
  }, [notice?.patternKey])

  if (!notice) return null

  const whisper = rarityWhisper(notice.rarity)
  const impact = impactLine(notice)
  const dotTone = notice.impact === 'dn' ? styles.warn : styles.good

  return (
    <section className={styles.noticed} aria-label="Vitality noticed">
      {/* absolutely-positioned + clipped by overflow:hidden so it never inflates the card */}
      <div className={styles.bloom} key={`bloom-${idx}`} aria-hidden />

      <div className={styles.noticedLabel}>
        <svg viewBox="0 0 24 24"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" /></svg>
        VITALITY NOTICED
        {whisper && <span className={styles.rarityWhisper}>{whisper}</span>}
      </div>

      <h2 className={styles.finding} key={`finding-${idx}`}>{renderLead(notice.lead, notice.goalTitle)}</h2>

      {notice.receipts.length > 0 && (
        <div className={styles.receipts} key={`receipts-${idx}`}>
          {notice.receipts.map((r, i) => (
            <span key={i} className={styles.receipt} style={{ animationDelay: `${0.32 + i * 0.06}s` }}>
              <span className={`${styles.dot} ${dotTone}`} />
              {r}
            </span>
          ))}
        </div>
      )}

      {impact && <p className={styles.impact}>{impact}</p>}

      <div className={styles.noticedFoot}>
        {feed.length > 1 ? (
          <button type="button" className={styles.another} onClick={() => setIdx(v => (v + 1) % feed.length)}>
            Show me another
          </button>
        ) : <span />}
        <button type="button" className={styles.deepLink} onClick={onDeeper}>
          Talk deeper in Claude
          <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
      </div>
    </section>
  )
}

/* Whisper rarity: only a genuinely rare cross-domain find earns two quiet mint
   words. common / uncommon / null show nothing at all — that scarcity is the point. */
function rarityWhisper(rarity: FeedNotice['rarity']): string | null {
  if (rarity === 'legendary' || rarity === 'mythic') return 'a rare one'
  if (rarity === 'rare' || rarity === 'epic') return 'rare find'
  return null
}

/* The serif lead, with the goal it touches lifted into mint italic when it
   appears verbatim (the preview's <em> gift beat). Otherwise plain — "if easy". */
function renderLead(lead: string, goalTitle: string | null): ReactNode {
  if (!goalTitle) return lead
  const i = lead.toLowerCase().indexOf(goalTitle.toLowerCase())
  if (i < 0) return lead
  return (
    <>
      {lead.slice(0, i)}
      <em>{lead.slice(i, i + goalTitle.length)}</em>
      {lead.slice(i + goalTitle.length)}
    </>
  )
}

/* A quiet impact line, only when the notice touches a goal in a known direction. */
function impactLine(notice: FeedNotice): string | null {
  if (!notice.goalTitle || !notice.impact) return null
  return notice.impact === 'up'
    ? `This is moving ${notice.goalTitle} the right way. Keep it going.`
    : `This is quietly pulling ${notice.goalTitle} off pace. A small change protects it.`
}

/* ================================================================
   Mood row — the preview's 5 line-art faces + 7-day strip behind a tap,
   on the real saveMood logic (optimistic, fire-and-forget daily tap).
   ================================================================ */
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

function MoodRow({ history }: { history: MoodPoint[] }) {
  const todayScore = history.length ? history[history.length - 1].score : null
  const [selected, setSelected] = useState<number | null>(todayScore)
  const [strip, setStrip] = useState<MoodPoint[]>(history)
  const [open, setOpen] = useState(false)

  function pick(score: number) {
    setSelected(score)
    setStrip(prev => prev.map((p, i) => (i === prev.length - 1 ? { ...p, score } : p)))
    // fire-and-forget; UI is optimistic, low-stakes daily tap. The client day +
    // tz offset keep "today" the USER'S day, not the UTC server's.
    saveMood(score, { dayKey: localDateKey(), tzOffsetMin: new Date().getTimezoneOffset() })
  }

  return (
    <section className={styles.mood} aria-label="How are you">
      <span className={styles.moodLabel}>How are you, really?</span>
      <div className={styles.faces}>
        {MOOD_LEVELS.map((lvl, i) => (
          <button
            key={lvl.score}
            type="button"
            className={`${styles.face} ${selected === lvl.score ? styles.sel : ''}`}
            style={{ animationDelay: `${0.5 + i * 0.05}s` }}
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

/** Small threading connector shown above a follow-up card (no preamble text). */
function FollowLink() {
  return (
    <span className={styles.followLink} aria-hidden>
      <svg viewBox="0 0 24 24">
        <polyline points="5 4 5 11" />
        <path d="M5 11a4 4 0 0 0 4 4h7" />
        <polyline points="13 12 17 15 13 18" />
      </svg>
      follow up
    </span>
  )
}

/**
 * Tiny markdown renderer scoped to what Vee produces: paragraphs, blank-line
 * separators, "- "/"* " bullets, "1. " numbers, **bold** inline. No HTML — every
 * node is a real React element, so no dangerouslySetInnerHTML risk.
 */
function renderAssistantMarkdown(text: string): ReactNode {
  const lines = text.replace(/\r\n/g, '\n').trim().split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0

  const isBullet = (l: string) => /^\s*[-*•]\s+/.test(l)
  const isNumbered = (l: string) => /^\s*\d+[.)]\s+/.test(l)

  while (i < lines.length) {
    if (lines[i].trim() === '') { i++; continue }

    if (isBullet(lines[i])) {
      const items: string[] = []
      while (i < lines.length && isBullet(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s+/, ''))
        i++
      }
      blocks.push(
        <ul key={key++} className={styles.mdList}>
          {items.map((it, j) => <li key={j}>{renderInlineMarkdown(it)}</li>)}
        </ul>
      )
      continue
    }

    if (isNumbered(lines[i])) {
      const items: string[] = []
      while (i < lines.length && isNumbered(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''))
        i++
      }
      blocks.push(
        <ol key={key++} className={`${styles.mdList} ${styles.mdListOrdered}`}>
          {items.map((it, j) => <li key={j}>{renderInlineMarkdown(it)}</li>)}
        </ol>
      )
      continue
    }

    const paraLines: string[] = []
    while (i < lines.length && lines[i].trim() !== '' && !isBullet(lines[i]) && !isNumbered(lines[i])) {
      paraLines.push(lines[i])
      i++
    }
    blocks.push(
      <p key={key++} className={styles.mdPara}>{renderInlineMarkdown(paraLines.join(' '))}</p>
    )
  }

  return blocks
}

function renderInlineMarkdown(text: string): ReactNode {
  const out: ReactNode[] = []
  let lastIdx = 0
  let key = 0
  const re = /\*\*(.+?)\*\*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) out.push(text.slice(lastIdx, m.index))
    out.push(<strong key={key++} className={styles.mdBold}>{m[1]}</strong>)
    lastIdx = m.index + m[0].length
  }
  if (lastIdx < text.length) out.push(text.slice(lastIdx))
  return out.length === 1 ? out[0] : out
}

function formatNoteDate(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    if (sameDay) {
      return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}
