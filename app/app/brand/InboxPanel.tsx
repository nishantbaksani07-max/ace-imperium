'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import styles from './brand.module.css'
import type { Brand } from './types'
import type { BrandActions } from './state'

/**
 * Inbox — one place to pull every incoming message (comments, DMs, email) and
 * triage who actually needs a reply.
 *
 * Multi-user by design: each source is a read-only Claude-Chrome loop — the user
 * opens that site in THEIR logged-in browser, copies the prompt, and pastes what
 * Claude reads back. Nothing is hard-wired to one account. Each paste is saved on
 * the brand under packReads['inbox_<src>']. The Triage button sends all of them
 * to /api/brand/triage, which sorts them into Reply-now / Worth-a-reply / Skip.
 *
 * (Gmail + YouTube can later become hands-off via their APIs + the nightly cron;
 * v1 is the universal Chrome path that works for everyone with no setup.)
 */

interface Source {
  id: string
  label: string
  icon: string
  url: string
  /** What Claude should read on that page. */
  what: string
}

const SOURCES: Source[] = [
  { id: 'gmail', label: 'Gmail', icon: '✉️', url: 'https://mail.google.com/', what: 'my unread emails (inbox + Primary)' },
  { id: 'youtube', label: 'YouTube', icon: '▶️', url: 'https://studio.youtube.com/', what: 'the recent comments on my videos (Content → Comments)' },
  { id: 'tiktok', label: 'TikTok', icon: '🎵', url: 'https://www.tiktok.com/tiktokstudio/comment', what: 'my recent comments and my DM inbox' },
  { id: 'instagram', label: 'Instagram', icon: '📸', url: 'https://www.instagram.com/direct/inbox/', what: 'my DM inbox and recent post comments' },
  { id: 'patreon', label: 'Patreon', icon: '🅿️', url: 'https://www.patreon.com/messages', what: 'my Patreon messages and recent post comments' },
  { id: 'discord', label: 'Discord', icon: '💬', url: 'https://discord.com/channels/@me', what: 'my Discord DMs and any @-mentions in my servers' },
]

const KEY = (id: string) => `inbox_${id}`
const TRIAGE_KEY = 'inbox_triage'

/** A single triaged message, as returned by /api/brand/triage. */
interface TriageItem {
  source: string
  who: string
  meaning: string
  reply?: string
  tag?: string
}
interface Triage {
  replyNow: TriageItem[]
  worth: TriageItem[]
  skip: string
}

/** Per-source chip styling — icon + a brand-tinted accent for scannability. */
const SOURCE_META: Record<string, { icon: string; color: string }> = {
  Gmail: { icon: '✉', color: '#ea4335' },
  YouTube: { icon: '▶', color: '#ff4e45' },
  TikTok: { icon: '♪', color: '#25f4ee' },
  Instagram: { icon: '◍', color: '#e1306c' },
  Patreon: { icon: 'P', color: '#ff6b5a' },
  Discord: { icon: '◈', color: '#7b86f4' },
}
function sourceMeta(src: string) {
  return SOURCE_META[src] || { icon: '•', color: 'var(--muted)' }
}

/** Per-tag label + accent for the "what it means" read. */
const TAG_META: Record<string, { label: string; color: string }> = {
  opportunity: { label: 'Opportunity', color: 'var(--accent)' },
  urgent: { label: 'Urgent', color: '#ff6b5a' },
  question: { label: 'Question', color: '#6ba8ff' },
  complaint: { label: 'Problem', color: '#ffb347' },
  feedback: { label: 'Feedback', color: '#9c8bff' },
  fan: { label: 'Fan', color: '#5bd1a0' },
}
function tagMeta(tag?: string) {
  return (tag && TAG_META[tag]) || { label: '', color: 'var(--border)' }
}

/** Parse the stored triage string into structured buckets, or null if it's the
 *  old plain-text format (which we still render as a <pre>). */
function parseTriage(raw: string): Triage | null {
  if (!raw || raw[0] !== '{') return null
  try {
    const obj = JSON.parse(raw) as Partial<Triage>
    if (!Array.isArray(obj.replyNow) && !Array.isArray(obj.worth)) return null
    return {
      replyNow: Array.isArray(obj.replyNow) ? obj.replyNow : [],
      worth: Array.isArray(obj.worth) ? obj.worth : [],
      skip: typeof obj.skip === 'string' ? obj.skip : '',
    }
  } catch {
    return null
  }
}

function buildPrompt(s: Source): string {
  return `You are a READ-ONLY reader inside this page. Open ${s.what}. Do NOT reply, like, send, or change anything — only read what is on screen. Scroll and read thoroughly; do not stop after the first few.

List EVERY message you can see, one per line, the most important first, as:
- <who> : <what they said, a short but complete gist> [TYPE] (<unread/new if shown>)

TYPE is one of: [$] opportunity (collab, sponsor, paid, business), [?] question, [-] complaint or problem, [+] fan / positive, [!] urgent and needs a reply, [spam]. Use [!] on anything that genuinely needs a response from me. Capture the good AND the bad — never skip the complaints or awkward ones, and list spam too (tagged [spam]). After the list, add nothing else.`
}

export default function InboxPanel({ brand, actions }: { brand: Brand; actions: BrandActions }) {
  const [copied, setCopied] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [triaging, setTriaging] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [autoPulling, setAutoPulling] = useState(false)
  const [autoMsg, setAutoMsg] = useState<string | null>(null)
  const ytAccount = brand.accounts.find((a) => a.platform === 'youtube' || a.platform === 'youtube_long')

  // The one auto path that actually works (no Chrome paste): YouTube's public
  // comments via the Data API. Saves the analyzed result into the Comments feed.
  async function autoPullYouTube() {
    if (!ytAccount || autoPulling) return
    setAutoPulling(true)
    setAutoMsg(null)
    try {
      const res = await fetch('/api/brand/youtube-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: ytAccount.handle }),
      })
      const data = await res.json().catch(() => ({})) as { read?: string; count?: number; error?: string }
      if (!res.ok || !data.read) throw new Error(data.error || `request failed (${res.status})`)
      actions.setPackRead(brand.id, 'comment_feed', data.read)
      setAutoMsg(`Pulled ${data.count ?? ''} comments and saved them to Comments ✓`)
    } catch (e) {
      setAutoMsg(e instanceof Error ? e.message : 'Auto-pull failed')
    } finally {
      setAutoPulling(false)
    }
  }

  // Gmail connection status (per-user OAuth). Drives Connect vs Auto-pull.
  const [gmail, setGmail] = useState<{ configured: boolean; connected: boolean; email: string | null } | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/gmail/status')
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setGmail({ configured: !!d.configured, connected: !!d.connected, email: d.email ?? null }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  async function autoPullGmail() {
    if (autoPulling) return
    setAutoPulling(true)
    setAutoMsg(null)
    try {
      const res = await fetch('/api/gmail/pull', { method: 'POST' })
      const data = await res.json().catch(() => ({})) as { read?: string; count?: number; error?: string }
      if (!res.ok || !data.read) throw new Error(data.error || `request failed (${res.status})`)
      actions.setPackRead(brand.id, KEY('gmail'), data.read)
      setAutoMsg(`Pulled ${data.count ?? ''} emails into your inbox ✓`)
    } catch (e) {
      setAutoMsg(e instanceof Error ? e.message : 'Gmail pull failed')
    } finally {
      setAutoPulling(false)
    }
  }

  const [copiedReply, setCopiedReply] = useState<string | null>(null)
  const triage = brand.packReads?.[TRIAGE_KEY]?.text?.trim() || ''
  const parsed = parseTriage(triage)
  const savedCount = SOURCES.filter((s) => brand.packReads?.[KEY(s.id)]?.text?.trim()).length

  async function copyReply(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedReply(key)
      setTimeout(() => setCopiedReply((c) => (c === key ? null : c)), 1800)
    } catch { /* clipboard blocked — no-op */ }
  }

  async function open(s: Source) {
    try {
      await navigator.clipboard.writeText(buildPrompt(s))
      setCopied(s.id)
      setTimeout(() => setCopied((c) => (c === s.id ? null : c)), 1800)
    } catch { /* tab still opens */ }
    window.open(s.url, '_blank', 'noopener')
  }

  function save(s: Source) {
    const v = (drafts[s.id] ?? '').trim()
    if (!v) return
    actions.setPackRead(brand.id, KEY(s.id), v)
    setDrafts((d) => ({ ...d, [s.id]: '' }))
  }

  async function runTriage() {
    if (triaging) return
    setTriaging(true)
    setErr(null)
    try {
      const sources = SOURCES
        .map((s) => ({ source: s.label, text: brand.packReads?.[KEY(s.id)]?.text ?? '' }))
        .filter((s) => s.text.trim())
      if (!sources.length) { setErr('Pull at least one source first.'); return }
      const res = await fetch('/api/brand/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources }),
      })
      if (res.status === 402) { setErr('Triage is a Pro feature.'); return }
      const data = await res.json().catch(() => ({})) as { triage?: string; error?: string }
      if (!res.ok || !data.triage) throw new Error(data.error || `request failed (${res.status})`)
      actions.setPackRead(brand.id, TRIAGE_KEY, data.triage)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not triage.')
    } finally {
      setTriaging(false)
    }
  }

  return (
    <div className={styles.inbox}>
      {ytAccount && (
        <div className={styles.inboxAuto}>
          <div className={styles.inboxAutoText}>
            <b>Auto-pull YouTube comments</b>
            <span>Reads {ytAccount.handle || 'your channel'}’s recent comments straight from the API. No Chrome paste.</span>
          </div>
          <button type="button" className={styles.postPlanRecBtn} onClick={autoPullYouTube} disabled={autoPulling}>
            {autoPulling ? 'Pulling…' : '⚡ Auto-pull'}
          </button>
        </div>
      )}
      {autoMsg && <p className={styles.postPlanRecHint}>{autoMsg}</p>}

      {/* Triage — the answer, pinned at the top */}
      <div className={styles.inboxTriage}>
        <div className={styles.inboxTriageHead}>
          <span className={styles.postPlanEyebrow}>✦ Who to reply to</span>
          <button type="button" className={styles.postPlanRecBtn} onClick={runTriage} disabled={triaging}>
            {triaging ? 'Sorting…' : triage ? 'Re-run triage' : `Triage ${savedCount || ''} source${savedCount === 1 ? '' : 's'}`}
          </button>
        </div>
        {err && <p className={styles.postPlanErr}>{err}</p>}
        {parsed ? (
          <div className={styles.triSections}>
            {parsed.replyNow.length > 0 && (
              <section className={styles.triSection}>
                <div className={styles.triSectionHead}>
                  <span className={styles.triSectionTitle}>🔥 Reply now</span>
                  <span className={styles.triCount}>{parsed.replyNow.length}</span>
                </div>
                <div className={styles.triGrid}>
                  {parsed.replyNow.map((it, i) => {
                    const sm = sourceMeta(it.source)
                    const tm = tagMeta(it.tag)
                    const rk = `r${i}`
                    return (
                      <article key={rk} className={styles.triCard} style={{ '--tag': tm.color } as CSSProperties}>
                        <div className={styles.triCardTop}>
                          <span className={styles.triSrc} style={{ color: sm.color }}>
                            <span className={styles.triSrcIcon} aria-hidden>{sm.icon}</span>{it.source}
                          </span>
                          {tm.label && <span className={styles.triTag}>{tm.label}</span>}
                        </div>
                        <div className={styles.triWho}>{it.who}</div>
                        <p className={styles.triMeaning}>{it.meaning}</p>
                        {it.reply && (
                          <div className={styles.triReply}>
                            <div className={styles.triReplyHead}>
                              <span className={styles.triReplyLabel}>Suggested reply</span>
                              <button type="button" className={styles.triCopy} onClick={() => copyReply(rk, it.reply!)}>
                                {copiedReply === rk ? 'Copied ✓' : 'Copy'}
                              </button>
                            </div>
                            <p className={styles.triReplyText}>{it.reply}</p>
                          </div>
                        )}
                      </article>
                    )
                  })}
                </div>
              </section>
            )}
            {parsed.worth.length > 0 && (
              <section className={styles.triSection}>
                <div className={styles.triSectionHead}>
                  <span className={styles.triSectionTitle}>💬 Worth a reply</span>
                  <span className={styles.triCount}>{parsed.worth.length}</span>
                </div>
                <div className={styles.triGrid}>
                  {parsed.worth.map((it, i) => {
                    const sm = sourceMeta(it.source)
                    const tm = tagMeta(it.tag)
                    return (
                      <article key={`w${i}`} className={`${styles.triCard} ${styles.triCardSlim}`} style={{ '--tag': tm.color } as CSSProperties}>
                        <div className={styles.triCardTop}>
                          <span className={styles.triSrc} style={{ color: sm.color }}>
                            <span className={styles.triSrcIcon} aria-hidden>{sm.icon}</span>{it.source}
                          </span>
                          <span className={styles.triWhoInline}>{it.who}</span>
                        </div>
                        <p className={styles.triMeaning}>{it.meaning}</p>
                      </article>
                    )
                  })}
                </div>
              </section>
            )}
            {parsed.skip && (
              <div className={styles.triSkip}><span aria-hidden>🗑</span> {parsed.skip}</div>
            )}
            {parsed.replyNow.length === 0 && parsed.worth.length === 0 && (
              <p className={styles.postPlanRecHint}>Nothing needs a reply right now — all clear.</p>
            )}
          </div>
        ) : triage ? (
          <pre className={styles.inboxTriageText}>{triage}</pre>
        ) : (
          <p className={styles.postPlanRecHint}>Pull your messages below, then hit Triage — Claude sorts them into reply‑now, worth‑a‑reply, and skip.</p>
        )}
      </div>

      {/* Sources */}
      <div className={styles.inboxSources}>
        {SOURCES.map((s) => {
          const saved = brand.packReads?.[KEY(s.id)]?.text?.trim() || ''
          return (
            <div key={s.id} className={styles.inboxRow}>
              <div className={styles.inboxRowTop}>
                <span className={styles.inboxRowName}>
                  <span aria-hidden>{s.icon}</span> {s.label}
                  {saved && <span className={styles.inboxDot} title="Pulled" aria-hidden> ●</span>}
                </span>
                {s.id === 'gmail' && gmail?.configured ? (
                  gmail.connected ? (
                    <button type="button" className={styles.inboxOpenBtn} onClick={autoPullGmail} disabled={autoPulling}>
                      {autoPulling ? 'Pulling…' : '⚡ Auto-pull'}
                    </button>
                  ) : (
                    <a
                      className={styles.inboxOpenBtn}
                      href={`/api/gmail/connect?return=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/app/brand')}`}
                    >
                      Connect Gmail
                    </a>
                  )
                ) : (
                  <button type="button" className={styles.inboxOpenBtn} onClick={() => open(s)}>
                    {copied === s.id ? 'Copied ✓ — opening' : 'Open + copy prompt'}
                  </button>
                )}
              </div>
              <textarea
                className={styles.scTextarea}
                rows={2}
                placeholder={saved ? 'Saved — paste again to refresh' : `Paste what Claude read from ${s.label}…`}
                value={drafts[s.id] ?? ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
              />
              <button type="button" className={styles.connConnect} disabled={!(drafts[s.id] ?? '').trim()} onClick={() => save(s)}>
                {saved ? 'Update' : 'Save'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
