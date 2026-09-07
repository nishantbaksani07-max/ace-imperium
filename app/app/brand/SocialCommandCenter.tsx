'use client'

import { useEffect, useState } from 'react'
import styles from './brand.module.css'
import type { Brand, BrandAccount, Platform } from './types'
import { PLATFORM_LABELS, PLATFORM_SHORT } from './types'
import type { BrandActions } from './state'
import type { SocialPlatform } from '@/lib/social/types'
import { SOCIAL_PLATFORMS } from '@/lib/social/types'
import { PROMPT_PACKS, analyticsUrl, buildMasterPrompt, parseMasterReply } from '@/lib/social/prompts'
import type { PromptPackId, MasterTag } from '@/lib/social/prompts'

/**
 * Master-pull routing — which feature-button packReads each master section fills.
 * NUMBERS is handled separately (it goes through /api/social/ingest into the
 * graph). TIMES feeds both the "Audience & Times" and "When to post" buttons.
 */
const MASTER_ROUTE: Array<[Exclude<MasterTag, 'NUMBERS'>, string[]]> = [
  ['WORKING', ['whatsworking']],
  ['AUDIENCE', ['audience_feed']],
  ['TIMES', ['times_feed', 'posting_times']],
  ['COMMENTS', ['comment_feed']],
  ['DMS', ['dm_feed']],
  ['NICHE', ['niche']],
  ['TOPFLOP', ['topflop']],
  ['RETENTION', ['retention']],
]

/**
 * Social Command Center — the Claude Chrome data loop, stripped to its essence.
 *
 * Pick a data pack → one tap opens the channel's analytics and copies a tailored
 * read-only prompt → run it in the Claude extension → paste the answer back.
 * The numbers pack saves into the account's graph; the qualitative packs
 * (audience, what's working, comments…) save their text read onto the brand.
 */

/** Map a brand Platform to its Social Command Center platform (youtube_long → youtube). */
const SP_BY_PLATFORM: Partial<Record<Platform, SocialPlatform>> = {
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

export default function SocialCommandCenter({
  brand, actions, focusAccount, onSaved, hasNumbers,
}: {
  brand: Brand
  actions: BrandActions
  focusAccount?: BrandAccount | null
  onSaved?: () => void
  hasNumbers?: boolean
}) {
  const [packId, setPackId] = useState<PromptPackId>('numbers')
  const [fallbackPlatform, setFallbackPlatform] = useState<SocialPlatform>('instagram')
  const [copied, setCopied] = useState<string | null>(null)
  const [pastePlatform, setPastePlatform] = useState<SocialPlatform>('instagram')
  const [pasteText, setPasteText] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [masterText, setMasterText] = useState('')
  const [savingMaster, setSavingMaster] = useState(false)

  const focusSp: SocialPlatform | null = focusAccount ? SP_BY_PLATFORM[focusAccount.platform] ?? null : null
  useEffect(() => {
    if (focusSp) { setPastePlatform(focusSp); setFallbackPlatform(focusSp) }
  }, [focusSp])

  const allTargets = brand.accounts
    .map((a) => {
      const sp = SP_BY_PLATFORM[a.platform]
      return sp ? { id: a.id, sp, handle: a.handle, platform: a.platform } : null
    })
    .filter((t): t is { id: string; sp: SocialPlatform; handle: string; platform: Platform } => t !== null)
  const launchTargets = focusAccount ? allTargets.filter((t) => t.id === focusAccount.id) : allTargets

  const activePack = PROMPT_PACKS.find((p) => p.id === packId) ?? PROMPT_PACKS[0]
  // A pack is "done" once its data is saved: numbers → a saved snapshot exists;
  // qualitative packs → a saved read on the brand.
  const packDone = (id: PromptPackId) => (id === 'numbers' ? !!hasNumbers : !!brand.packReads?.[id])
  const doneCount = PROMPT_PACKS.filter((p) => packDone(p.id)).length
  const previewSp: SocialPlatform = launchTargets[0]?.sp ?? fallbackPlatform
  const previewHandle = launchTargets[0]?.handle
  const previewPrompt = activePack.build(previewSp, previewHandle || undefined)
  const masterPrompt = buildMasterPrompt(previewSp, previewHandle || undefined)
  const savedRead = brand.packReads?.[packId] ?? null

  async function copyText(text: string, tag: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(tag)
      setTimeout(() => setCopied((c) => (c === tag ? null : c)), 1800)
    } catch {
      setNotice('Could not copy. Open Preview and copy manually.')
    }
  }

  function openAndCopy(sp: SocialPlatform, handle: string, tag: string) {
    void copyText(activePack.build(sp, handle || undefined), tag)
    const url = analyticsUrl(sp, handle)
    if (url) window.open(url, '_blank', 'noopener')
  }

  /** Master pull: copy the everything-prompt and open the focus channel's analytics. */
  function openMaster() {
    const t = launchTargets[0]
    const sp = t?.sp ?? fallbackPlatform
    const handle = t?.handle ?? ''
    void copyText(buildMasterPrompt(sp, handle || undefined), 'master')
    const url = analyticsUrl(sp, handle)
    if (url) window.open(url, '_blank', 'noopener')
  }

  /** Parse one master reply and fan it out: numbers → graph, the rest → each
   *  feature button's saved read. One paste fills everything. */
  async function saveMaster() {
    if (!masterText.trim()) return
    setSavingMaster(true)
    setNotice(null)
    try {
      const parsed = parseMasterReply(masterText)
      const filled: string[] = []
      if (parsed.NUMBERS) {
        try {
          const res = await fetch('/api/social/ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brand: brand.id, platform: pastePlatform, text: parsed.NUMBERS }),
          })
          if (res.ok) { filled.push('numbers'); onSaved?.() }
        } catch { /* a partial paste without numbers is still worth saving */ }
      }
      for (const [tag, keys] of MASTER_ROUTE) {
        const body = parsed[tag]
        if (!body) continue
        for (const k of keys) actions.setPackRead(brand.id, k, body)
        filled.push(tag.toLowerCase())
      }
      if (filled.length) {
        setMasterText('')
        setNotice(`Saved ${filled.length} section${filled.length > 1 ? 's' : ''} — your buttons are filling in.`)
      } else {
        setNotice('No sections found. Paste the whole master reply (it has ===NUMBERS=== … markers).')
      }
    } finally {
      setSavingMaster(false)
    }
  }

  async function savePaste() {
    if (!pasteText.trim()) return
    setSaving(true)
    setNotice(null)
    try {
      if (activePack.saves) {
        // Numbers pack → parse + store into the account's graph.
        const res = await fetch('/api/social/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brand: brand.id, platform: pastePlatform, text: pasteText }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not save')
        onSaved?.()
        setNotice('Saved. Your graph updated.')
      } else {
        // Qualitative pack → keep the AI read on the brand to view later.
        actions.setPackRead(brand.id, packId, pasteText)
        setNotice('Saved this read.')
      }
      setPasteText('')
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={styles.scCard}>
      <header className={styles.kpisHead}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowMark}>✦</span>
          <span className={styles.eyebrowRule} />
          Get the data
        </span>
        {focusAccount && (
          <span className={styles.connSynced}>{focusAccount.handle || PLATFORM_LABELS[focusAccount.platform]}</span>
        )}
      </header>

      {notice && <p className={styles.connNotice}>{notice}</p>}

      {/* Master pull — the fast path: one prompt returns everything, one paste
          fills every feature button so the playbook has all of its inputs. */}
      <div className={styles.scMaster}>
        <div className={styles.scMasterHead}>
          <span className={styles.scMasterTitle}>✦ Pull everything in one go</span>
          <span className={styles.scMasterSub}>One prompt fills every button — the fast way to feed your playbook.</span>
        </div>
        <div className={styles.packLaunch}>
          <button type="button" className={styles.packLaunchBtn} onClick={openMaster}>
            {copied === 'master' ? 'Copied ✓ — opening analytics' : 'Master pull — copy + open analytics'}
          </button>
          <button type="button" className={styles.scCopy} onClick={() => copyText(masterPrompt, 'master')}>
            {copied === 'master' ? 'Copied ✓' : 'Copy prompt'}
          </button>
        </div>
        <textarea
          className={styles.scTextarea}
          placeholder="Paste the WHOLE master reply here — it fills numbers + every button at once…"
          value={masterText}
          onChange={(e) => setMasterText(e.target.value)}
          rows={4}
        />
        <button type="button" className={styles.connConnect} disabled={savingMaster || !masterText.trim()} onClick={saveMaster}>
          {savingMaster ? 'Saving everything…' : 'Save everything'}
        </button>
      </div>

      <p className={styles.scMasterOr}>Or pull one at a time:</p>

      {/* pack picker — a ✓ marks each pack whose data you've saved */}
      <div className={styles.scPills}>
        {PROMPT_PACKS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={p.id === packId ? styles.scPillActive : styles.scPill}
            onClick={() => setPackId(p.id)}
          >
            {packDone(p.id) && <span className={styles.packDone} aria-hidden>✓ </span>}{p.label}
          </button>
        ))}
      </div>
      <p className={styles.packProgress}>
        <b>{doneCount}/{PROMPT_PACKS.length}</b> saved
        {doneCount === PROMPT_PACKS.length ? ' · all set — build your playbook below ↓' : ''}
      </p>
      <p className={styles.emptyText}>{activePack.blurb}</p>

      {/* one-tap: open analytics + copy the prompt */}
      {launchTargets.length > 0 ? (
        <div className={styles.packLaunch}>
          {launchTargets.map((t) => (
            <button
              key={t.id}
              type="button"
              className={styles.packLaunchBtn}
              onClick={() => openAndCopy(t.sp, t.handle, t.id)}
              title={`Open ${PLATFORM_LABELS[t.platform]} analytics and copy the "${activePack.label}" prompt`}
            >
              <span className={styles.scLinkShort}>{PLATFORM_SHORT[t.platform]}</span>
              {copied === t.id ? 'Copied ✓ — opening' : `Open ${t.handle || PLATFORM_LABELS[t.platform]} + Copy`}
            </button>
          ))}
        </div>
      ) : (
        <div className={styles.packLaunch}>
          <select className={styles.scSelect} value={fallbackPlatform} onChange={(e) => setFallbackPlatform(e.target.value as SocialPlatform)}>
            {SOCIAL_PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <button type="button" className={styles.packLaunchBtn} onClick={() => openAndCopy(fallbackPlatform, '', 'fallback')}>
            {copied === 'fallback' ? 'Copied ✓ — opening' : 'Open analytics + Copy'}
          </button>
        </div>
      )}

      <details className={styles.packPreview}>
        <summary className={styles.packPreviewSum}>Preview / copy the prompt</summary>
        <div className={styles.scPromptBox}>
          <button type="button" className={styles.scCopy} onClick={() => copyText(previewPrompt, 'preview')}>{copied === 'preview' ? 'Copied ✓' : 'Copy'}</button>
          <pre className={styles.scPromptText}>{previewPrompt}</pre>
        </div>
      </details>

      {/* paste the answer back — every pack */}
      <div className={styles.scPasteHead}>
        <span className={styles.scToolsHead}>Paste the result</span>
        {activePack.saves ? (
          focusAccount ? (
            <span className={styles.connSynced}>{PLATFORM_LABELS[focusAccount.platform]}</span>
          ) : (
            <select className={styles.scSelect} value={pastePlatform} onChange={(e) => setPastePlatform(e.target.value as SocialPlatform)}>
              {SOCIAL_PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          )
        ) : (
          <span className={styles.connSynced}>saves the read</span>
        )}
      </div>
      <textarea
        className={styles.scTextarea}
        placeholder="Paste what the Claude extension gave back here…"
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
        rows={5}
      />
      <button type="button" className={styles.connConnect} disabled={saving || !pasteText.trim()} onClick={savePaste}>
        {saving ? 'Saving…' : activePack.saves ? 'Save numbers' : 'Save read'}
      </button>

      {/* the last saved read for this qualitative pack */}
      {!activePack.saves && savedRead && (
        <div className={styles.packRead}>
          <span className={styles.packReadStamp}>{activePack.label} · saved {ago(savedRead.at)}</span>
          <pre className={styles.packReadText}>{savedRead.text}</pre>
        </div>
      )}
    </section>
  )
}
