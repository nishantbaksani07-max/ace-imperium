'use client'

import { useState } from 'react'
import Link from 'next/link'
import styles from './brand.module.css'
import type { Brand, BrandAccount, Platform } from './types'
import type { BrandActions } from './state'
import type { Snap } from './SocialChart'

/**
 * Playbook card — the bottom-of-brand mentor CTA and the payoff of the whole
 * loop. The user pastes their Claude-Chrome reads into the packs above (saved
 * on the brand); this stitches those reads + their saved numbers into one
 * personalized 7-section content playbook via /api/brand/playbook (server-side
 * Claude). The generated playbook is saved back on the brand so it persists.
 *
 * Secondary path: hand the same job to Claude cowork (Desktop) via the Vitality
 * connector, for users who want the agentic version.
 */

const SP: Partial<Record<Platform, string>> = {
  instagram: 'instagram', tiktok: 'tiktok', youtube: 'youtube', youtube_long: 'youtube',
}

/** Minimal markdown → JSX: ## headings, - bullets, **bold**, paragraphs. */
function renderInline(text: string, base: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(part)
    return m ? <strong key={`${base}-${i}`}>{m[1]}</strong> : <span key={`${base}-${i}`}>{part}</span>
  })
}
function renderPlaybook(md: string): JSX.Element[] {
  const out: JSX.Element[] = []
  let bullets: string[] = []
  let key = 0
  const flush = () => {
    if (!bullets.length) return
    const items = bullets
    const k = key++
    out.push(<ul key={`ul-${k}`} className={styles.pbList}>{items.map((b, i) => <li key={i}>{renderInline(b, `b${k}-${i}`)}</li>)}</ul>)
    bullets = []
  }
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd()
    if (/^#{1,6}\s/.test(line)) {
      flush()
      out.push(<h4 key={`h-${key++}`} className={styles.pbHeading}>{line.replace(/^#{1,6}\s/, '')}</h4>)
    } else if (/^[-*]\s/.test(line.trim())) {
      bullets.push(line.trim().replace(/^[-*]\s/, ''))
    } else if (line.trim()) {
      flush()
      out.push(<p key={`p-${key++}`} className={styles.pbPara}>{renderInline(line.trim(), `p${key}`)}</p>)
    }
  }
  flush()
  return out
}

const PACK_LABEL: Record<string, string> = {
  numbers: 'Latest numbers', whatsworking: "What's working", audience: 'Audience',
  demographics: 'Age & gender', locations: 'Top locations', besttimes: 'Best times', comments: 'Comments',
  comment_feed: 'Comments (verbatim)', dm_feed: 'DMs',
  audience_feed: 'Audience', times_feed: 'Posting times',
}

/** A self-contained cowork prompt: instructions + ALL the saved data embedded,
 *  so Claude cowork can build the playbook straight from it (no connector needed). */
function coworkPrompt(brand: Brand, snapshots: Snap[], platform: string): string {
  const lines: string[] = []
  lines.push(`You are a content strategist. Below is all of my ${platform} data from Vitality. Build me a content playbook in 7 simple, easy-to-read sections: 1) What's working, 2) The ONE metric driving my reach on ${platform}, 3) My bottleneck, 4) Hook formulas from my best posts, 5) Best cadence and times, 6) Content backlog from my comments, 7) Action plan: 5 post ideas, title and thumbnail concepts, one full script, and a weekly goal. Cite my real numbers. No generic advice. Keep it simple to read.`)

  const mine = snapshots.filter((s) => s.platform === platform)
  if (mine.length) {
    const latest = mine[mine.length - 1]
    const bits: string[] = []
    const push = (l: string, v: number | null, u = '') => { if (typeof v === 'number') bits.push(`${l} ${v.toLocaleString()}${u}`) }
    push('followers', latest.followers); push('views', latest.views); push('reach', latest.reach)
    push('non-follower', latest.pct_non_followers, '%'); push('likes', latest.likes); push('comments', latest.comments)
    push('saves', latest.saves); push('shares', latest.shares); push('eng', latest.engagement_rate, '%')
    lines.push(`\nLATEST NUMBERS (${latest.captured_at.slice(0, 10)}): ${bits.join(' · ')}`)
  }

  for (const [k, v] of Object.entries(brand.packReads ?? {})) {
    if (k === 'playbook') continue
    lines.push(`\n[${PACK_LABEL[k] ?? k}]\n${v.text}`)
  }
  return lines.join('\n')
}

export default function PlaybookCard({
  brand, actions, focusAccount, snapshots,
}: {
  brand: Brand
  actions: BrandActions
  focusAccount?: BrandAccount | null
  snapshots?: Snap[]
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const saved = brand.packReads?.playbook ?? null
  const platform = focusAccount ? SP[focusAccount.platform] ?? 'instagram' : 'instagram'

  async function generate() {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const reads: Record<string, string> = {}
      for (const [k, v] of Object.entries(brand.packReads ?? {})) {
        if (k !== 'playbook') reads[k] = v.text
      }
      const res = await fetch('/api/brand/playbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: brand.id, platform, reads }),
      })
      if (res.status === 402) { setError('The playbook is a Pro feature.'); return }
      const data = await res.json().catch(() => ({})) as { playbook?: string; error?: string }
      if (!res.ok || !data.playbook) throw new Error(data.error || `request failed (${res.status})`)
      actions.setPackRead(brand.id, 'playbook', data.playbook)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the playbook.')
    } finally {
      setLoading(false)
    }
  }

  async function openInClaude() {
    try {
      await navigator.clipboard.writeText(coworkPrompt(brand, snapshots ?? [], platform))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* the tab still opens */ }
    window.open('https://claude.ai/new', '_blank', 'noopener')
  }

  return (
    <section className={styles.playbook}>
      <div className={styles.playbookGlow} aria-hidden />

      <div className={styles.playbookMentor}>
        <span className={styles.playbookMark} aria-hidden>✦</span>
        <span className={styles.playbookWho}>Vitality mentor</span>
      </div>

      <p className={styles.playbookQuote}>
        “Make a <em>playbook</em> with your data. One of the best strategies out there.”
      </p>
      <p className={styles.playbookBody}>
        It reads everything you’ve saved here — your numbers and your pulled reads — and turns it into a
        content playbook: what’s working, the one metric driving your reach, your hooks, your cadence, and
        exactly what to make next.
      </p>

      <div className={styles.playbookActions}>
        <button type="button" className={styles.playbookBtn} onClick={openInClaude}>
          <span aria-hidden>◆</span>
          {copied ? 'Copied your data ✓ — opening Claude' : saved ? 'Rebuild in Claude cowork' : 'Build my playbook in Claude'}
          {!copied && <span className={styles.playbookArrow} aria-hidden>→</span>}
        </button>
        <button type="button" className={styles.playbookSecondary} onClick={generate} disabled={loading}>
          {loading ? 'Writing your playbook…' : 'Or build it here (uses Vitality AI credits)'}
        </button>
      </div>
      <p className={styles.playbookHint}>
        Cowork builds it in your own Claude — no Vitality AI credits used.
      </p>

      {error && (
        <p className={styles.playbookError}>
          {error}
          {error.includes('Pro') && <> <Link href="/pricing" className={styles.insightUpsellLink}>See Pro →</Link></>}
        </p>
      )}

      {saved && !loading && (
        <details className={styles.pbDetails}>
          <summary className={styles.pbSummary}>
            <span className={styles.pbSummaryChev} aria-hidden>▸</span>
            Your playbook · saved {new Date(saved.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </summary>
          <article className={styles.pbDoc}>
            {renderPlaybook(saved.text)}
          </article>
        </details>
      )}
    </section>
  )
}
