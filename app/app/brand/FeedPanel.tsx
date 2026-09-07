'use client'

import { useState } from 'react'
import styles from './brand.module.css'
import type { Brand, BrandAccount, Platform } from './types'
import { PLATFORM_LABELS } from './types'
import type { BrandActions } from './state'
import type { SocialPlatform } from '@/lib/social/types'
import { analyticsUrl } from '@/lib/social/prompts'

/**
 * FeedPanel — pull a stream of audience messages (comments OR DMs) with the
 * Claude extension, show them organized in a dropdown, and surface a one-line
 * read of what they mean. Same loop for both kinds; only the source + labels
 * change. Stored on the brand under packReads[cfg.key] (mirrored to Supabase),
 * so they also feed the playbook.
 */

export type FeedKind = 'comments' | 'dms' | 'audience' | 'times'

const SP: Partial<Record<Platform, SocialPlatform>> = {
  instagram: 'instagram', tiktok: 'tiktok', youtube: 'youtube', youtube_long: 'youtube',
}

const CONFIG: Record<FeedKind, { key: string; noun: string; label: string; icon: string; capture: string; breakdown?: boolean; source: (p: string) => string }> = {
  comments: {
    key: 'comment_feed', noun: 'comments', label: 'Comments', icon: '💬',
    source: (p) => `my recent ${p} posts (scroll through several, not just one) and read the comments — top AND most recent`,
    capture: `Run down EVERYTHING — the good and the bad, do not soften it. Capture: praise and what resonated, criticism / confusion / complaints, questions people asked, and requests or ideas for what to make next. Never skip the negative ones. Tag every line: [+] positive, [-] negative or complaint, [?] question, [>] request or content idea.`,
  },
  dms: {
    key: 'dm_feed', noun: 'DMs', label: 'DMs', icon: '✉',
    source: (p) => `my ${p} direct messages / inbox and read the recent threads`,
    capture: `Surface what actually matters and miss nothing: business opportunities (collabs, sponsorships, paid work), genuine questions, complaints or problems, and standout fans worth a reply. Include the awkward and the bad ones, not only the nice ones. Tag every line: [$] opportunity / money, [?] question, [-] complaint, [+] fan / positive.`,
  },
  audience: {
    key: 'audience_feed', noun: 'audience', label: 'Audience', icon: '👥', breakdown: true,
    source: (p) => `my ${p} audience / follower insights`,
    capture: `List the FULL breakdown — every bracket you can see, not a summary. Age ranges with their %, the gender split with %, and the top locations (countries and cities) with %. Call out the single biggest segment.`,
  },
  times: {
    key: 'times_feed', noun: 'posting times', label: 'Posting times', icon: '🕒', breakdown: true,
    source: (p) => `my ${p} analytics for when my followers are most active`,
    capture: `List the most active days and the peak hour windows for each (include the timezone if shown). Give the single best day + time to post, then 2 to 3 backup windows. Be specific, never vague.`,
  },
}

function buildPrompt(kind: FeedKind, platform: string, handle?: string): string {
  const cfg = CONFIG[kind]
  const who = handle ? ` (${handle})` : ''
  return `You are a READ-ONLY reader inside ${platform}${who}. Open ${cfg.source(platform)}. Do not reply, like, follow, send, or change anything — only read what is on screen. Read thoroughly, scroll, and do not stop early: cover everything available, not just the first few.

${cfg.capture}

Return EXACTLY this, nothing else:
MEANING: <2 to 3 sentences: the honest overall read, what is landing AND what is not>
${cfg.noun.toUpperCase()}:
- <a real, verbatim line with its tag>
- <another>
(list as many as you can read, most useful first; do not summarize away the negatives)`
}

function parse(text: string): { meaning: string; items: string[] } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  let meaning = ''
  const items: string[] = []
  for (const l of lines) {
    const m = /^meaning:\s*(.+)$/i.exec(l)
    if (m) { meaning = m[1].trim(); continue }
    if (/^(comments|dms|messages|audience|posting times|times|locations|ages?):?$/i.test(l)) continue
    if (/^[-*]\s+/.test(l)) items.push(l.replace(/^[-*]\s+/, '').trim())
  }
  if (!items.length) {
    for (const l of lines) {
      if (/^meaning:/i.test(l) || /^(comments|dms|messages|audience|posting times|times|locations|ages?):?$/i.test(l)) continue
      items.push(l)
    }
  }
  return { meaning, items }
}

export default function FeedPanel({
  kind, brand, actions, focusAccount,
}: {
  kind: FeedKind
  brand: Brand
  actions: BrandActions
  focusAccount: BrandAccount
}) {
  const cfg = CONFIG[kind]
  const [paste, setPaste] = useState('')
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)

  const platform = SP[focusAccount.platform] ?? 'instagram'
  const handle = focusAccount.handle
  const saved = brand.packReads?.[cfg.key] ?? null
  const { meaning, items } = saved ? parse(saved.text) : { meaning: '', items: [] }
  const showTools = editing || !saved

  async function openAndCopy() {
    try {
      await navigator.clipboard.writeText(buildPrompt(kind, platform, handle))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* the tab still opens */ }
    const url = analyticsUrl(platform, handle)
    if (url) window.open(url, '_blank', 'noopener')
  }

  function save() {
    if (!paste.trim()) return
    actions.setPackRead(brand.id, cfg.key, paste)
    setPaste('')
    setEditing(false)
  }

  return (
    <section className={styles.commentsPanel}>
      <header className={styles.kpisHead}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowMark}>{cfg.icon}</span>
          <span className={styles.eyebrowRule} />
          {cfg.label}
        </span>
        {saved && (
          <button type="button" className={styles.editToggle} onClick={() => setEditing((v) => !v)}>
            {editing ? 'Done' : 'Update'}
          </button>
        )}
      </header>

      {meaning && <p className={styles.commentsMeaning}>“{meaning}”</p>}

      {items.length > 0 && (
        <details className={styles.commentsDrop}>
          <summary className={styles.commentsSum}>{cfg.breakdown ? 'Show the full breakdown' : `Show all ${items.length} ${cfg.noun}`}</summary>
          <ul className={styles.commentsList}>
            {items.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </details>
      )}

      {showTools && (
        <div className={styles.commentsTools}>
          <button type="button" className={styles.packLaunchBtn} onClick={openAndCopy}>
            <span className={styles.scLinkShort}>{PLATFORM_LABELS[focusAccount.platform].slice(0, 2).toUpperCase()}</span>
            {copied ? 'Copied ✓ — opening' : `Pull ${cfg.noun} + Copy`}
          </button>
          <textarea
            className={styles.scTextarea}
            placeholder={`Paste the ${cfg.noun} the Claude extension gave back here…`}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={5}
          />
          <button type="button" className={styles.connConnect} disabled={!paste.trim()} onClick={save}>
            Save {cfg.noun}
          </button>
        </div>
      )}
    </section>
  )
}
