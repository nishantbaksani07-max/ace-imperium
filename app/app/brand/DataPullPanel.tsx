'use client'

import { useState } from 'react'
import styles from './brand.module.css'
import type { Brand, BrandAccount, Platform } from './types'
import { PLATFORM_LABELS, PLATFORM_SHORT } from './types'
import type { BrandActions } from './state'
import type { SocialPlatform } from '@/lib/social/types'
import { PROMPT_PACKS, analyticsUrl } from '@/lib/social/prompts'
import type { PromptPackId } from '@/lib/social/prompts'

/**
 * DataPullPanel — one Claude-extension data pull, scoped to a single prompt pack
 * + the focused account. The same loop as the other feature buttons: tap to open
 * the channel's analytics + copy a read-only prompt → run it in the extension →
 * paste the answer back.
 *
 * Replaces the old multi-pack "Get the data" command center: each pack that
 * wasn't already a top-row button (numbers → updates the chart; what's-working →
 * a saved read) now gets its own focused button that renders this panel.
 *
 *   · saves:true  (numbers) → POST /api/social/ingest, then onSaved() refreshes
 *     the graph.
 *   · saves:false (reads)   → stored on the brand under packReads[packId].
 */

const SP: Partial<Record<Platform, SocialPlatform>> = {
  instagram: 'instagram', tiktok: 'tiktok', youtube: 'youtube', youtube_long: 'youtube',
}

function ago(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function DataPullPanel({
  brand, actions, focusAccount, packId, icon, onSaved,
}: {
  brand: Brand
  actions: BrandActions
  focusAccount: BrandAccount
  packId: PromptPackId
  icon: string
  onSaved?: () => void
}) {
  const pack = PROMPT_PACKS.find((p) => p.id === packId) ?? PROMPT_PACKS[0]
  const sp = SP[focusAccount.platform] ?? 'instagram'
  const handle = focusAccount.handle

  const [copied, setCopied] = useState(false)
  const [paste, setPaste] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const saved = !pack.saves ? brand.packReads?.[packId] ?? null : null
  const prompt = pack.build(sp, handle || undefined)

  async function launch() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* the tab still opens */ }
    const url = analyticsUrl(sp, handle)
    if (url) window.open(url, '_blank', 'noopener')
  }

  async function save() {
    if (!paste.trim()) return
    setSaving(true)
    setNotice(null)
    try {
      if (pack.saves) {
        const res = await fetch('/api/social/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brand: brand.id, platform: sp, text: paste }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Could not save')
        onSaved?.()
        setNotice('Saved — your graph updated.')
      } else {
        actions.setPackRead(brand.id, packId, paste)
        setNotice('Saved this read.')
      }
      setPaste('')
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={styles.commentsPanel}>
      <header className={styles.kpisHead}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowMark}>{icon}</span>
          <span className={styles.eyebrowRule} />
          {pack.label}
        </span>
        {saved && <span className={styles.insightStamp}>saved {ago(saved.at)}</span>}
      </header>

      <p className={styles.emptyText}>{pack.blurb}</p>
      {notice && <p className={styles.connNotice}>{notice}</p>}

      {!pack.saves && saved && (
        <div className={styles.packRead}>
          <pre className={styles.packReadText}>{saved.text}</pre>
        </div>
      )}

      <div className={styles.commentsTools}>
        <button type="button" className={styles.packLaunchBtn} onClick={launch}>
          <span className={styles.scLinkShort}>{PLATFORM_SHORT[focusAccount.platform]}</span>
          {copied ? 'Copied ✓ — opening' : `Open ${handle || PLATFORM_LABELS[focusAccount.platform]} + Copy`}
        </button>
        <details className={styles.packPreview}>
          <summary className={styles.packPreviewSum}>Preview / copy the prompt</summary>
          <pre className={styles.scPromptText}>{prompt}</pre>
        </details>
        <textarea
          className={styles.scTextarea}
          placeholder="Paste what the Claude extension gave back here…"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={5}
        />
        <button type="button" className={styles.connConnect} disabled={saving || !paste.trim()} onClick={save}>
          {saving ? 'Saving…' : pack.saves ? 'Save numbers' : 'Save read'}
        </button>
      </div>
    </section>
  )
}
