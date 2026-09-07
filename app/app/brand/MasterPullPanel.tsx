'use client'

import { useRef, useState } from 'react'
import styles from './brand.module.css'
import type { Brand, BrandAccount, Platform } from './types'
import type { BrandActions } from './state'
import type { SocialPlatform } from '@/lib/social/types'
import { parseMasterReply, type MasterTag } from '@/lib/social/prompts'

/**
 * MasterPullPanel — the paste-back drop-down under "Fill it all with Claude".
 *
 * The master button already did the launch (copied the everything-prompt + opened
 * the channel's analytics). This drop-down just catches the reply: the moment you
 * paste it, it parses + fans every section out to its storage and collapses — no
 * save button, no giant blob left in the box.
 *
 *   NUMBERS  → POST /api/social/ingest (updates the graph)
 *   the rest → packReads[<key>], so each top-row button lights up + has data.
 */

const SP: Partial<Record<Platform, SocialPlatform>> = {
  instagram: 'instagram', tiktok: 'tiktok', youtube: 'youtube', youtube_long: 'youtube',
}

/** Where each non-NUMBERS master section is saved (the keys feature buttons read). */
const ROUTE: Array<[Exclude<MasterTag, 'NUMBERS'>, string[]]> = [
  ['WORKING', ['whatsworking']],
  ['AUDIENCE', ['audience_feed']],
  ['TIMES', ['times_feed', 'posting_times']],
  ['COMMENTS', ['comment_feed']],
  ['DMS', ['dm_feed']],
  ['NICHE', ['niche']],
  ['DESCRIPTION', ['yt_base']],
  ['TOPFLOP', ['topflop']],
  ['RETENTION', ['retention']],
]

export default function MasterPullPanel({
  brand, actions, focusAccount, onSaved, onDone,
}: {
  brand: Brand
  actions: BrandActions
  focusAccount: BrandAccount
  onSaved?: () => void
  /** Called shortly after a successful fill so the parent can collapse the drop. */
  onDone?: () => void
}) {
  const sp = SP[focusAccount.platform] ?? 'instagram'

  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'empty'>('idle')
  const [count, setCount] = useState(0)
  const busy = useRef(false)

  async function fill(text: string) {
    if (busy.current || !text.trim()) return
    busy.current = true
    setStatus('saving')
    try {
      const parsed = parseMasterReply(text)
      const filled: string[] = []

      if (parsed.NUMBERS) {
        try {
          const res = await fetch('/api/social/ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brand: brand.id, platform: sp, text: parsed.NUMBERS }),
          })
          if (res.ok) { filled.push('numbers'); onSaved?.() }
        } catch { /* a partial paste without numbers is still worth saving */ }
      }
      for (const [tag, keys] of ROUTE) {
        const body = parsed[tag]
        if (!body) continue
        for (const k of keys) actions.setPackRead(brand.id, k, body)
        filled.push(tag.toLowerCase())
      }

      if (filled.length) {
        setCount(filled.length)
        setStatus('done')
        // Right after a fill, draft the next-video recommendation off the data we
        // just pulled — built from `parsed` so it doesn't wait on state. Best-effort.
        void autoRecommend(parsed)
        // Let them see the confirmation, then collapse on its own.
        setTimeout(() => onDone?.(), 1400)
      } else {
        setStatus('empty')
        busy.current = false
      }
    } catch {
      setStatus('empty')
      busy.current = false
    }
  }

  /** Auto-fill the PostPlanBar recommendation from the freshly-pulled sections. */
  async function autoRecommend(parsed: Partial<Record<MasterTag, string>>) {
    const notes: Record<string, string> = {}
    if (parsed.WORKING) notes.whatsworking = parsed.WORKING
    if (parsed.NICHE) notes.niche = parsed.NICHE
    if (parsed.AUDIENCE) notes.audience_feed = parsed.AUDIENCE
    if (parsed.TIMES) notes.times_feed = parsed.TIMES
    if (parsed.TOPFLOP) notes.topflop = parsed.TOPFLOP
    if (Object.keys(notes).length === 0) return
    const wk = brand.schedules.find((s) => s.period === 'weekly') ?? brand.schedules[0]
    try {
      const res = await fetch('/api/brand/next-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: {
            name: brand.name, archetype: brand.archetype, blurb: brand.blurb,
            platform: focusAccount.platform, handle: focusAccount.handle,
            cadence: wk ? `${wk.target} ${wk.unit} / ${wk.period === 'weekly' ? 'week' : 'day'}` : undefined,
            notes,
          },
        }),
      })
      const data = await res.json().catch(() => ({})) as { recommendation?: string }
      if (res.ok && data.recommendation) actions.setPackRead(brand.id, 'next_video', data.recommendation)
    } catch { /* best-effort — the PostPlanBar button is still there */ }
  }

  // Auto-fill the instant the reply is pasted. preventDefault keeps the big blob
  // out of the box — you paste, it fills, done.
  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const text = e.clipboardData?.getData('text') ?? ''
    if (!text.trim()) return
    e.preventDefault()
    void fill(text)
  }

  return (
    <div className={styles.masterDrop}>
      {status === 'done' ? (
        <p className={styles.masterDropDone}>✓ Filled {count} section{count === 1 ? '' : 's'} — your buttons updated.</p>
      ) : status === 'saving' ? (
        <p className={styles.masterDropHint}>Filling everything…</p>
      ) : (
        <>
          <p className={styles.masterDropHint}>
            Run the prompt in the Claude extension, then <b>paste the reply here</b> — it fills everything automatically.
          </p>
          <textarea
            className={styles.masterDropInput}
            placeholder="Paste the reply…"
            onPaste={onPaste}
            // Fallback for typed / programmatic input that didn't fire onPaste.
            onChange={(e) => { if (e.target.value.includes('===')) void fill(e.target.value) }}
            rows={2}
            autoFocus
          />
          {status === 'empty' && (
            <p className={styles.masterDropErr}>No sections found — paste the whole reply (it has ===NUMBERS=== … markers).</p>
          )}
        </>
      )}
    </div>
  )
}
