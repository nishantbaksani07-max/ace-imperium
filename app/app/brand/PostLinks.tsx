'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './brand.module.css'
import type { Brand, BrandAccount, BrandLink, Platform } from './types'
import { PLATFORM_LABELS, platformProfileUrl } from './types'
import type { BrandActions } from './state'

/**
 * Post links — an ordered, editable row of launch buttons (name + URL), scoped
 * to the focused account. Post links are PER-SOCIAL: each linked account keeps
 * its own ordered set (the places you go to post differ per platform), so
 * switching accounts swaps the links. The order IS the posting order (1, 2, 3…).
 *
 * Each account seeds itself once with that platform's posting destination (e.g.
 * YouTube → YouTube Studio, TikTok → TikTok Studio) so there's a relevant button
 * to click on day one; after that the user adds, renames, reorders, and removes
 * their own, all scoped to that account.
 */

/** Prepend https:// when the user pastes a bare host. */
function normalizeUrl(url: string): string {
  const t = url.trim()
  if (!t) return ''
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

/**
 * Where you go to post on each platform — seeded as the first quick link for a
 * freshly-focused account so the links are tailored to that social, not shared
 * across all of them.
 */
const POST_DESTINATIONS: Partial<Record<Platform, { label: string; url: string }[]>> = {
  youtube:      [{ label: 'YouTube Studio', url: 'https://studio.youtube.com' }],
  youtube_long: [{ label: 'YouTube Studio', url: 'https://studio.youtube.com' }],
  tiktok:       [{ label: 'TikTok Studio', url: 'https://www.tiktok.com/tiktokstudio/upload' }],
  instagram:    [{ label: 'Instagram', url: 'https://www.instagram.com' }],
  x:            [{ label: 'Post on X', url: 'https://x.com/compose/post' }],
  threads:      [{ label: 'Threads', url: 'https://www.threads.net' }],
}

function defaultPostLinks(account: BrandAccount): { label: string; url: string }[] {
  const preset = POST_DESTINATIONS[account.platform]
  if (preset) return preset
  const url = platformProfileUrl(account.platform, account.handle)
  return url ? [{ label: account.handle || PLATFORM_LABELS[account.platform], url }] : []
}

export default function PostLinks({
  brand, actions, focusAccount,
}: {
  brand: Brand
  actions: BrandActions
  focusAccount: BrandAccount | null
}) {
  const [editing, setEditing] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  // Only this account's links — post links are per-social.
  const links = focusAccount ? brand.links.filter((l) => l.accountId === focusAccount.id) : []

  // Drag-to-reorder in place. A real drag suppresses the click, so dragging
  // reorders and a plain click still opens the link.
  function dragProps(l: BrandLink, i: number) {
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        setDragId(l.id)
        e.dataTransfer.effectAllowed = 'move'
        try { e.dataTransfer.setData('text/plain', l.id) } catch { /* some browsers block setData */ }
      },
      onDragOver: (e: React.DragEvent) => {
        if (!dragId || dragId === l.id) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (overId !== l.id) setOverId(l.id)
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault()
        if (dragId && dragId !== l.id) actions.reorderLink(brand.id, dragId, i)
        setDragId(null)
        setOverId(null)
      },
      onDragEnd: () => { setDragId(null); setOverId(null) },
      'data-drag': dragId === l.id ? 'src' : overId === l.id ? 'over' : undefined,
    }
  }

  // Seed each account's post links once, with that platform's posting
  // destination(s), the first time it's focused with none saved. The ref tracks
  // which accounts we've already seeded so deleting their links doesn't re-add.
  const seededRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!focusAccount) return
    if (seededRef.current.has(focusAccount.id)) return
    seededRef.current.add(focusAccount.id)
    const scoped = brand.links.filter((l) => l.accountId === focusAccount.id)
    if (scoped.length > 0) return
    for (const d of defaultPostLinks(focusAccount)) {
      actions.addLink(brand.id, d.label, d.url, focusAccount.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusAccount?.id])

  return (
    <section className={styles.plWrap}>
      <header className={styles.plHead}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowMark}>🔗</span>
          <span className={styles.eyebrowRule} />
          Post links
        </span>
        {links.length > 0 && (
          <button type="button" className={styles.editToggle} onClick={() => setEditing((v) => !v)} aria-pressed={editing}>
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </header>

      {!editing ? (
        <div className={styles.plRow}>
          {links.map((l, i) => {
            const href = normalizeUrl(l.url)
            return href ? (
              <a
                key={l.id}
                {...dragProps(l, i)}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.plBtn}
                title="Drag to reorder · click to open"
              >
                <span className={styles.plNum}>{i + 1}</span>
                <span className={styles.plName}>{l.label || 'Untitled'}</span>
                <span className={styles.plGo} aria-hidden>↗</span>
              </a>
            ) : (
              <button
                key={l.id}
                {...dragProps(l, i)}
                type="button"
                className={styles.plBtnEmpty}
                onClick={() => setEditing(true)}
                title="Drag to reorder"
              >
                <span className={styles.plNum}>{i + 1}</span>
                <span className={styles.plName}>{l.label || 'Add a URL'}</span>
              </button>
            )
          })}
          <button type="button" className={styles.plAdd} onClick={() => { actions.addLink(brand.id, `Link ${links.length + 1}`, '', focusAccount?.id); setEditing(true) }}>
            + Add link
          </button>
        </div>
      ) : (
        <div className={styles.plEdit}>
          {links.map((l, i) => (
            <div key={l.id} className={styles.plEditRow}>
              <span className={styles.plNum}>{i + 1}</span>
              <input
                className={styles.plInputName}
                value={l.label}
                placeholder="Name"
                onChange={(e) => actions.updateLink(brand.id, l.id, { label: e.target.value })}
                aria-label={`Link ${i + 1} name`}
              />
              <input
                className={styles.plInputUrl}
                value={l.url}
                placeholder="Paste URL"
                inputMode="url"
                autoComplete="off"
                onChange={(e) => actions.updateLink(brand.id, l.id, { url: e.target.value })}
                aria-label={`Link ${i + 1} URL`}
              />
              <div className={styles.plMoveGroup}>
                <button type="button" className={styles.plMove} onClick={() => actions.moveLink(brand.id, l.id, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                <button type="button" className={styles.plMove} onClick={() => actions.moveLink(brand.id, l.id, 1)} disabled={i === links.length - 1} aria-label="Move down">↓</button>
              </div>
              <button type="button" className={styles.plRemove} onClick={() => actions.removeLink(brand.id, l.id)} aria-label="Remove link">✕</button>
            </div>
          ))}
          <button type="button" className={styles.plAdd} onClick={() => actions.addLink(brand.id, `Link ${links.length + 1}`, '', focusAccount?.id)}>
            + Add link
          </button>
        </div>
      )}
    </section>
  )
}
