'use client'

import { useState } from 'react'
import styles from './brand.module.css'
import type { Brand, BrandAccount, Platform } from './types'
import { PLATFORM_LABELS } from './types'
import type { Snap } from './SocialChart'

/**
 * Cowork — open the account you're on in Claude cowork with EVERYTHING Vitality
 * has pulled for it as standing context: numbers, follower history, pasted
 * analytics, every saved data read (comments, audience, best times, top/flop,
 * retention, niche…), recent posts and links. You type a question; it copies the
 * full context + your question and opens Claude. Save it as a Claude Project and
 * the context is remembered for every future question.
 *
 * No API: there's no URL that creates a project folder with files, so we bundle
 * the data to the clipboard and open claude.ai — the same path as PlaybookCard's
 * cowork hand-off, scoped to the focused account.
 */

const SP: Partial<Record<Platform, string>> = {
  instagram: 'instagram', tiktok: 'tiktok', youtube: 'youtube', youtube_long: 'youtube',
}

const PACK_LABEL: Record<string, string> = {
  comment_feed: 'Comments', dm_feed: 'DMs', audience_feed: 'Audience', times_feed: 'Best posting times',
  whatsworking: "What's working", topflop: 'Best & worst videos', retention: 'Retention & traffic',
  niche: 'Niche', posting_times: 'Posting-time plan',
}

function normalizeUrl(url: string): string {
  const t = url.trim()
  if (!t) return ''
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

function buildPrompt(brand: Brand, account: BrandAccount, snapshots: Snap[], question: string): string {
  const plat = PLATFORM_LABELS[account.platform]
  const isYt = account.platform === 'youtube' || account.platform === 'youtube_long'
  const lines: string[] = []
  lines.push(
    `You are my content and growth strategist for my ${plat} account ${account.handle || ''}. ` +
    `Everything below is the data Vitality has pulled for this account. Treat it as the standing context ` +
    `for this whole project: remember it and use it for every question I ask, not just the first.`,
  )

  const acc: string[] = []
  if (typeof account.followers === 'number') acc.push(`${account.followers.toLocaleString()} ${isYt ? 'subscribers' : 'followers'}`)
  if (typeof account.lifetimeViews === 'number') acc.push(`${account.lifetimeViews.toLocaleString()} lifetime views`)
  if (typeof account.videoCount === 'number') acc.push(`${account.videoCount} videos`)
  if (acc.length) lines.push(`\nACCOUNT: ${acc.join(' · ')}`)

  const hist = (account.history ?? []).filter((h) => typeof h.count === 'number')
  if (hist.length >= 2) {
    const a = hist[0], b = hist[hist.length - 1]
    lines.push(`Follower history: ${a.count.toLocaleString()} (${a.at.slice(0, 10)}) → ${b.count.toLocaleString()} (${b.at.slice(0, 10)}) over ${hist.length} snapshots.`)
  }

  const sp = SP[account.platform]
  const mine = sp ? snapshots.filter((s) => s.platform === sp) : []
  if (mine.length) {
    const l = mine[mine.length - 1]
    const b: string[] = []
    const push = (k: string, v: number | null, u = '') => { if (typeof v === 'number') b.push(`${k} ${v.toLocaleString()}${u}`) }
    push('reach', l.reach); push('views', l.views); push('non-follower', l.pct_non_followers, '%')
    push('likes', l.likes); push('comments', l.comments); push('saves', l.saves); push('shares', l.shares)
    push('engagement', l.engagement_rate, '%')
    if (b.length) lines.push(`Latest pasted numbers (${l.captured_at.slice(0, 10)}): ${b.join(' · ')}`)
  }

  for (const [k, v] of Object.entries(brand.packReads ?? {})) {
    if (!v?.text?.trim() || k === 'playbook' || k === 'yt_base') continue
    lines.push(`\n[${PACK_LABEL[k] ?? k}]\n${v.text.trim()}`)
  }

  const ups = (brand.uploads ?? []).slice(-10).map((u) => u.title).filter((t): t is string => !!t && t.trim().length > 0)
  if (ups.length) lines.push(`\nRECENT POSTS:\n${ups.map((t) => `- ${t}`).join('\n')}`)

  const links = (brand.links ?? []).filter((l) => l.accountId === account.id && l.url.trim())
  if (links.length) lines.push(`\nLINKS:\n${links.map((l) => `- ${l.label}: ${normalizeUrl(l.url)}`).join('\n')}`)

  lines.push(question.trim()
    ? `\nMY QUESTION:\n${question.trim()}`
    : `\nStart with a 3-line read of where this account stands, then ask me what I want to dig into.`)

  return lines.join('\n')
}

export default function CoworkPanel({
  brand, focusAccount, snapshots,
}: {
  brand: Brand
  focusAccount: BrandAccount
  snapshots?: Snap[]
}) {
  const [copied, setCopied] = useState(false)

  async function openCowork() {
    try {
      await navigator.clipboard.writeText(buildPrompt(brand, focusAccount, snapshots ?? [], ''))
      setCopied(true)
      setTimeout(() => setCopied(false), 2400)
    } catch { /* the tab still opens */ }
    window.open('https://claude.ai/new', '_blank', 'noopener')
  }

  const who = focusAccount.handle || PLATFORM_LABELS[focusAccount.platform]

  return (
    <div className={styles.coworkBar}>
      <button type="button" className={styles.coworkBarBtn} onClick={openCowork} data-copied={copied}>
        <span aria-hidden>✦</span>
        <span className={styles.coworkBarText}>
          {copied ? 'Copied to clipboard ✓ — opening Claude' : `Open ${who} in Claude cowork`}
        </span>
        {!copied && <span className={styles.coworkBarArrow} aria-hidden>→</span>}
      </button>
      <span
        className={styles.coworkInfo}
        tabIndex={0}
        role="note"
        aria-label="What this does"
        data-tip="Bundles everything pulled for this account — numbers, comments, audience, best times, top videos and more — into one Claude session and copies it to your clipboard. Save it as a Claude Project and it's remembered for every question."
      >
        i
      </span>
    </div>
  )
}
