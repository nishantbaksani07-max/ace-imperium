'use client'

import { useState } from 'react'
import styles from './brand.module.css'
import type { Brand, BrandAccount, Platform } from './types'
import { PLATFORM_LABELS } from './types'
import type { BrandActions } from './state'
import type { SocialPlatform } from '@/lib/social/types'
import { analyticsUrl } from '@/lib/social/prompts'

/**
 * Comments — pull every comment with the Claude extension, show them organized
 * in a dropdown, and surface a one-sentence read of what they mean.
 *
 * Stored on the brand under packReads['comment_feed'] (mirrored to Supabase),
 * separate from the SCC "Comments" themes pack. The extension returns a MEANING
 * line + a verbatim COMMENTS list; we parse and display both.
 */

const KEY = 'comment_feed'

const SP: Partial<Record<Platform, SocialPlatform>> = {
  instagram: 'instagram', tiktok: 'tiktok', youtube: 'youtube', youtube_long: 'youtube',
}

function buildPrompt(platform: string, handle?: string): string {
  const who = handle ? ` for ${handle}` : ''
  return `You are a READ-ONLY reader. Open my recent ${platform} posts${who} and read the comments (top + recent). Do not reply, like, follow, or interact — only read what is on screen.

Return EXACTLY this, nothing else:
MEANING: <one simple sentence on what my audience wants or is telling me>
COMMENTS:
- <a real comment, verbatim>
- <another real comment>
(list as many as you can read, grouped loosely by theme, the most useful first)`
}

function parse(text: string): { meaning: string; comments: string[] } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  let meaning = ''
  const comments: string[] = []
  for (const l of lines) {
    const m = /^meaning:\s*(.+)$/i.exec(l)
    if (m) { meaning = m[1].trim(); continue }
    if (/^comments:?$/i.test(l)) continue
    if (/^[-*]\s+/.test(l)) comments.push(l.replace(/^[-*]\s+/, '').trim())
  }
  // Fallback: no bullets → treat remaining non-label lines as comments.
  if (!comments.length) {
    for (const l of lines) {
      if (/^meaning:/i.test(l) || /^comments:?$/i.test(l)) continue
      comments.push(l)
    }
  }
  return { meaning, comments }
}

export default function CommentsPanel({
  brand, actions, focusAccount,
}: {
  brand: Brand
  actions: BrandActions
  focusAccount: BrandAccount
}) {
  const [paste, setPaste] = useState('')
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)

  const platform = SP[focusAccount.platform] ?? 'instagram'
  const handle = focusAccount.handle
  const saved = brand.packReads?.[KEY] ?? null
  const { meaning, comments } = saved ? parse(saved.text) : { meaning: '', comments: [] }
  const showTools = editing || !saved

  async function openAndCopy() {
    try {
      await navigator.clipboard.writeText(buildPrompt(platform, handle))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* the tab still opens */ }
    const url = analyticsUrl(platform, handle)
    if (url) window.open(url, '_blank', 'noopener')
  }

  function save() {
    if (!paste.trim()) return
    actions.setPackRead(brand.id, KEY, paste)
    setPaste('')
    setEditing(false)
  }

  return (
    <section className={styles.commentsPanel}>
      <header className={styles.kpisHead}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowMark}>💬</span>
          <span className={styles.eyebrowRule} />
          Comments
        </span>
        {saved && (
          <button type="button" className={styles.editToggle} onClick={() => setEditing((v) => !v)}>
            {editing ? 'Done' : 'Update'}
          </button>
        )}
      </header>

      {meaning && <p className={styles.commentsMeaning}>“{meaning}”</p>}

      {comments.length > 0 && (
        <details className={styles.commentsDrop}>
          <summary className={styles.commentsSum}>Show all {comments.length} comments</summary>
          <ul className={styles.commentsList}>
            {comments.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </details>
      )}

      {showTools && (
        <div className={styles.commentsTools}>
          <button type="button" className={styles.packLaunchBtn} onClick={openAndCopy}>
            <span className={styles.scLinkShort}>{PLATFORM_LABELS[focusAccount.platform].slice(0, 2).toUpperCase()}</span>
            {copied ? 'Copied ✓ — opening' : `Pull ${handle || 'comments'} + Copy`}
          </button>
          <textarea
            className={styles.scTextarea}
            placeholder="Paste every comment the Claude extension gave back here…"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={5}
          />
          <button type="button" className={styles.connConnect} disabled={!paste.trim()} onClick={save}>
            Save comments
          </button>
        </div>
      )}
    </section>
  )
}
