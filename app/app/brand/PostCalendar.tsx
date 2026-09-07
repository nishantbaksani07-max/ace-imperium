'use client'

import { useMemo, useState } from 'react'
import styles from './brand.module.css'
import type { Brand, BrandAccount, Platform } from './types'
import type { BrandActions } from './state'
import type { SocialPlatform } from '@/lib/social/types'
import { buildPostDatesPrompt, parsePostDates, analyticsUrl } from '@/lib/social/prompts'
import { getLocalDateKey } from '@/lib/dates'

/**
 * Per-account content calendar (BUILD69+) — "when did I last post, and how
 * consistent have I been?" at a glance.
 *
 * It reads `account.postDates` (local YYYY-MM-DD, newest-first), which the user
 * fills straight from the platform via the Claude Chrome extension — so the
 * calendar reflects what they ACTUALLY posted, not just what they remembered to
 * log. The "Last posted" chip on the card and this month grid both come from
 * that one list. Nothing here writes anywhere except through `actions`.
 */

const SOCIAL_OF: Partial<Record<Platform, SocialPlatform>> = {
  instagram: 'instagram', tiktok: 'tiktok', youtube: 'youtube', youtube_long: 'youtube',
}
function socialOf(p: Platform): SocialPlatform {
  return SOCIAL_OF[p] ?? 'other'
}

export type PostedTone = 'fresh' | 'due' | 'cold' | 'none'

/** "Last posted" label + tone for an account, shared by the card chip and the
 *  calendar header. Reads lastPostedAt, falling back to the newest postDate. */
export function lastPostedInfo(account: BrandAccount): { label: string; tone: PostedTone } {
  const iso = account.lastPostedAt || account.postDates?.[0]
  const t = iso ? Date.parse(iso.length === 10 ? `${iso}T12:00:00` : iso) : NaN
  if (!Number.isFinite(t)) return { label: 'No posts yet', tone: 'none' }
  const days = Math.floor((Date.now() - t) / 86_400_000)
  const label = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`
  const tone: PostedTone = days <= 2 ? 'fresh' : days <= 6 ? 'due' : 'cold'
  return { label, tone }
}

export default function PostCalendar({ brand, account, actions }: { brand: Brand; account: BrandAccount; actions: BrandActions }) {
  const sp = socialOf(account.platform)
  const posted = useMemo(() => new Set(account.postDates ?? []), [account.postDates])
  const todayKey = getLocalDateKey()

  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const { label, tone } = lastPostedInfo(account)
  const total = account.postDates?.length ?? 0
  const postedToday = posted.has(todayKey)

  // A horizontal strip of the last 28 days (oldest → today). Reads the past;
  // today's cell flashes when it hasn't been filled yet.
  const rowDays = useMemo(() => {
    const base = new Date()
    const out: { key: string; day: number }[] = []
    for (let i = 27; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i)
      out.push({ key: getLocalDateKey(d), day: d.getDate() })
    }
    return out
  }, [])

  async function openAndCopy() {
    try {
      await navigator.clipboard.writeText(buildPostDatesPrompt(sp, account.handle))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* tab still opens */ }
    const url = analyticsUrl(sp, account.handle)
    if (url) window.open(url, '_blank', 'noopener')
    setPulling(true)
  }

  function save() {
    const dates = parsePostDates(draft)
    if (!dates.length) { setNote('No dates found in that paste — make sure it has the YYYY-MM-DD lines.'); return }
    actions.setAccountPosts(brand.id, account.id, dates)
    setDraft('')
    setPulling(false)
    setNote(`Saved ${dates.length} post date${dates.length === 1 ? '' : 's'} ✓`)
    setTimeout(() => setNote((n) => (n?.startsWith('Saved') ? null : n)), 2600)
  }

  return (
    <div className={styles.postCal}>
      <div className={styles.postCalHead}>
        <div className={styles.postCalLast}>
          <span className={styles.postCalEyebrow}>Last posted</span>
          <span className={`${styles.postCalLastVal} ${styles[`postCalTone_${tone}`]}`}>{label}</span>
        </div>
        <div className={styles.postCalMeta}>
          {!postedToday && <span className={styles.postCalTodo}>● log today</span>}
          {total > 0 && <span>{total} tracked</span>}
        </div>
      </div>

      <div className={styles.postCalRow}>
        {rowDays.map((c) => {
          const on = posted.has(c.key)
          const isToday = c.key === todayKey
          return (
            <span
              key={c.key}
              className={`${styles.postCalRowCell}${on ? ` ${styles.postCalCellOn}` : ''}${isToday ? ` ${styles.postCalCellToday}` : ''}${isToday && !on ? ` ${styles.postCalFlash}` : ''}`}
              title={on ? `Posted ${c.key}` : c.key}
            >
              {c.day}
            </span>
          )
        })}
      </div>

      {/* Pull post dates from the platform via the Chrome extension. */}
      {!pulling ? (
        <div className={styles.postCalActions}>
          <button type="button" className={styles.postCalPullBtn} onClick={openAndCopy}>
            {copied ? 'Copied ✓ — opening' : total ? '↻ Update from Chrome' : '📅 Pull post dates from Chrome'}
          </button>
          {note && <span className={styles.postCalNote}>{note}</span>}
        </div>
      ) : (
        <div className={styles.postCalPull}>
          <p className={styles.postCalPullHint}>
            {copied ? 'Pasted the prompt? ' : ''}Run it in the Claude Chrome extension on your {sp} page, then paste what it gives back:
          </p>
          <textarea
            className={styles.scTextarea}
            rows={3}
            placeholder={'===POSTDATES===\n2026-06-20\n2026-06-18\n…'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className={styles.postCalPullBtns}>
            <button type="button" className={styles.connConnect} disabled={!draft.trim()} onClick={save}>Save dates</button>
            <button type="button" className={styles.playbookSecondary} onClick={() => { setPulling(false); setDraft('') }}>Cancel</button>
          </div>
          {note && <span className={styles.postCalNote}>{note}</span>}
        </div>
      )}
    </div>
  )
}
