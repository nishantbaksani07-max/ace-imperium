'use client'

import { useEffect, useMemo, useState } from 'react'
import styles from './brand.module.css'
import type { Brand } from './types'
import { PLATFORM_LABELS } from './types'
import type { BrandActions } from './state'

/**
 * Video description builder — assembles a YouTube (or any) video description
 * instead of re-typing it every upload. Three layers:
 *   · Base      — the evergreen boilerplate, saved on the brand (reused every video).
 *   · Links     — pulled straight from Post-links (brand.links), so changing a URL
 *                 once updates every future description. No copy-paste drift.
 *   · This video — per-upload intro, timestamps, hashtags (not saved; they change).
 * One Copy button outputs the finished, paste-ready description. Generic, so any
 * creator can use it.
 */

const BASE_KEY = 'yt_base'

/** Prepend https:// when a link is a bare host. */
function normalizeUrl(url: string): string {
  const t = url.trim()
  if (!t) return ''
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

export default function DescriptionBuilder({ brand, actions }: { brand: Brand; actions: BrandActions }) {
  const [open, setOpen] = useState(false)
  const savedBase = brand.packReads?.[BASE_KEY]?.text ?? ''
  const [base, setBase] = useState(savedBase)
  useEffect(() => setBase(savedBase), [savedBase])

  const [intro, setIntro] = useState('')
  const [timestamps, setTimestamps] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [includeLinks, setIncludeLinks] = useState(true)
  const [copied, setCopied] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genErr, setGenErr] = useState<string | null>(null)

  const linkCount = brand.links.filter((l) => l.url.trim()).length

  const output = useMemo(() => {
    const parts: string[] = []
    if (intro.trim()) parts.push(intro.trim())
    if (base.trim()) parts.push(base.trim())
    if (timestamps.trim()) parts.push(`⏱ Timestamps\n${timestamps.trim()}`)
    if (includeLinks) {
      const lines = brand.links
        .filter((l) => l.url.trim())
        .map((l) => `${l.label || 'Link'}: ${normalizeUrl(l.url)}`)
      if (lines.length) parts.push(lines.join('\n'))
    }
    if (hashtags.trim()) parts.push(hashtags.trim())
    return parts.join('\n\n')
  }, [intro, base, timestamps, hashtags, includeLinks, brand.links])

  function commitBase() {
    if (base !== savedBase) actions.setPackRead(brand.id, BASE_KEY, base)
  }

  /**
   * Draft the base description from the brand data we already hold (mirrored to
   * Supabase): blurb, niche / audience / what's-working reads, and Post-links.
   * Saves to the same yt_base read so it persists + the master pull can reuse it.
   */
  async function generateFromData() {
    if (generating) return
    setGenerating(true)
    setGenErr(null)
    try {
      const acct = brand.accounts.find((a) => a.platform === 'youtube' || a.platform === 'youtube_long') ?? brand.accounts[0]
      const notes: Record<string, string> = {}
      for (const k of ['niche', 'audience_feed', 'whatsworking', 'comment_feed']) {
        const t = brand.packReads?.[k]?.text
        if (t && t.trim()) notes[k] = t
      }
      const res = await fetch('/api/brand/description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: {
            name: brand.name,
            archetype: brand.archetype,
            blurb: brand.blurb,
            platform: acct ? PLATFORM_LABELS[acct.platform] : undefined,
            handle: acct?.handle,
            links: brand.links.map((l) => ({ label: l.label, url: l.url })).filter((l) => l.url?.trim()),
            notes,
          },
        }),
      })
      if (res.status === 402) { setGenErr('Generating from your data is a Pro feature.'); return }
      const data = await res.json().catch(() => ({})) as { base?: string; error?: string }
      if (!res.ok || !data.base) throw new Error(data.error || `request failed (${res.status})`)
      setBase(data.base)
      actions.setPackRead(brand.id, BASE_KEY, data.base)
    } catch (e) {
      setGenErr(e instanceof Error ? e.message : 'Could not generate from your data.')
    } finally {
      setGenerating(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(output)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked; the text is still selectable */ }
  }

  return (
    <section className={styles.descWrap}>
      <button type="button" className={styles.descToggle} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowMark}>📝</span>
          <span className={styles.eyebrowRule} />
          Video description
        </span>
        <span className={styles.descChevron} data-open={open} aria-hidden>›</span>
      </button>

      {open && (
        <div className={styles.descBody}>
          <p className={styles.descHint}>
            Your base description plus your Post-links, assembled and ready to paste. Change a link once and every
            description uses the new URL.
          </p>

          <div className={styles.descField}>
            <div className={styles.descLabelRow}>
              <span className={styles.descLabel}>Base description · reused every video</span>
              <button
                type="button"
                className={styles.descGenBtn}
                onClick={generateFromData}
                disabled={generating}
                title="Draft this from your saved brand data (blurb, niche, audience, links)"
              >
                {generating ? 'Writing…' : '✨ Generate from my data'}
              </button>
            </div>
            <textarea
              className={styles.scTextarea}
              rows={5}
              value={base}
              placeholder="Your evergreen boilerplate: who you are, what the channel is, sponsor line, etc."
              onChange={(e) => setBase(e.target.value)}
              onBlur={commitBase}
            />
            {genErr && <span className={styles.descGenErr}>{genErr}</span>}
          </div>

          <label className={styles.descField}>
            <span className={styles.descLabel}>This video · intro line (optional)</span>
            <textarea
              className={styles.scTextarea}
              rows={2}
              value={intro}
              placeholder="One or two lines about THIS video."
              onChange={(e) => setIntro(e.target.value)}
            />
          </label>

          <label className={styles.descField}>
            <span className={styles.descLabel}>Timestamps</span>
            <textarea
              className={styles.scTextarea}
              rows={4}
              value={timestamps}
              placeholder={'0:00 Intro\n1:24 The setup\n4:30 ...'}
              onChange={(e) => setTimestamps(e.target.value)}
            />
          </label>

          <label className={styles.descField}>
            <span className={styles.descLabel}>Hashtags</span>
            <input
              className={styles.connInput}
              value={hashtags}
              placeholder="#devlog #indiegame"
              onChange={(e) => setHashtags(e.target.value)}
            />
          </label>

          <label className={styles.descCheck}>
            <input type="checkbox" checked={includeLinks} onChange={(e) => setIncludeLinks(e.target.checked)} />
            Include my Post-links ({linkCount})
          </label>

          <div className={styles.descOutWrap}>
            <div className={styles.descOutHead}>
              <span className={styles.descLabel}>Ready to paste</span>
              <button type="button" className={styles.descCopy} onClick={copy} disabled={!output.trim()}>
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
            <pre className={styles.descOut}>{output || 'Fill in the fields above and your description builds here.'}</pre>
          </div>
        </div>
      )}
    </section>
  )
}
