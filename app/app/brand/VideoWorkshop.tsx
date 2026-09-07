'use client'

import { useEffect, useState } from 'react'
import styles from './brand.module.css'
import { getLocalDateKey } from '@/lib/dates'
import { PLATFORM_LABELS, PLATFORM_SHORT } from './types'
import type { Brand, BrandAccount, Platform, ProductionLinks, UploadRating } from './types'
import type { BrandActions } from './state'

/** Collapse the two YouTube platforms so uploads filter cleanly by channel. */
const canonPlatform = (p: Platform): Platform => (p === 'youtube_long' ? 'youtube' : p)

/**
 * VideoWorkshop — the "make videos" surface on the brand Workshop tab.
 *
 * Two halves:
 *  1. The production pipeline — three quick-launch steps (write the script,
 *     edit the cut, upload it). Each link is set once and becomes a launch
 *     button, so the whole make-a-video flow is one organized place.
 *  2. The upload log — every shipped piece, timestamped. Each one is overlaid
 *     on the social chart (Studio tab) by its posting date, colored by how the
 *     line moved after it, so you can see exactly what's working.
 *
 * All state lives on the brand (localStorage + Supabase mirror + MCP-readable);
 * no new store.
 */

const STEPS: { key: keyof ProductionLinks; n: string; label: string; hint: string; placeholder: string }[] = [
  { key: 'scriptUrl', n: '01', label: 'Script', hint: 'Write it', placeholder: 'Google Doc, Notion, script tool…' },
  { key: 'editUrl',   n: '02', label: 'Edit',   hint: 'Cut it',   placeholder: 'capcut.com' },
  { key: 'uploadUrl', n: '03', label: 'Upload', hint: 'Ship it',  placeholder: 'YouTube / TikTok / Reels upload' },
]

const UPLOAD_PLATFORMS: Platform[] = ['youtube', 'youtube_long', 'tiktok', 'instagram', 'x']

const RATINGS: { key: UploadRating; color: string; label: string }[] = [
  { key: 'green',  color: 'var(--mint)',  label: 'Lifted' },
  { key: 'yellow', color: 'var(--amber)', label: 'Flat' },
  { key: 'red',    color: 'var(--red)',   label: 'Dipped' },
]

function normalizeUrl(u: string): string {
  const t = u.trim()
  if (!t) return ''
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}
function hostOf(url: string): string {
  try { return new URL(normalizeUrl(url)).host.replace(/^www\./, '') } catch { return '' }
}
function fmtDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function VideoWorkshop({ brand, actions, focusAccount }: { brand: Brand; actions: BrandActions; focusAccount?: BrandAccount | null }) {
  return (
    <section className={styles.workshop}>
      <header className={styles.ccHead}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowMark}>·01</span>
          <span className={styles.eyebrowRule} />
          Make a video
        </span>
      </header>

      <div className={styles.pipeline}>
        {STEPS.map((step) => (
          <PipelineStep
            key={step.key}
            step={step}
            url={brand.production?.[step.key] ?? ''}
            onSave={(url) => actions.setProductionLink(brand.id, step.key, url)}
          />
        ))}
      </div>

      <UploadLog brand={brand} actions={actions} focusAccount={focusAccount} />
    </section>
  )
}

function PipelineStep({
  step, url, onSave,
}: {
  step: { key: keyof ProductionLinks; n: string; label: string; hint: string; placeholder: string }
  url: string
  onSave: (url: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const live = url ? normalizeUrl(url) : ''

  function save(e?: React.FormEvent) {
    e?.preventDefault()
    onSave(draft)
    setDraft('')
    setEditing(false)
  }

  return (
    <div className={styles.pipeStep}>
      <div className={styles.pipeTop}>
        <span className={styles.pipeNum}>{step.n}</span>
        <span className={styles.pipeLabel}>{step.label}</span>
        <span className={styles.pipeHint}>{step.hint}</span>
      </div>

      {live && !editing ? (
        <>
          <a className={styles.pipeLaunch} href={live} target="_blank" rel="noopener noreferrer">
            <span aria-hidden>↗</span> Open
            <span className={styles.pipeLaunchHost}>{hostOf(live)}</span>
          </a>
          <button type="button" className={styles.pipeChange} onClick={() => { setDraft(url); setEditing(true) }}>
            Change link
          </button>
        </>
      ) : (
        <form className={styles.pipePaste} onSubmit={save}>
          <input
            className={styles.connInput}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={step.placeholder}
            inputMode="url"
            autoComplete="off"
            autoFocus={editing}
          />
          <button type="submit" className={styles.connConnect} disabled={!draft.trim()}>Set</button>
        </form>
      )}
    </div>
  )
}

function UploadLog({ brand, actions, focusAccount }: { brand: Brand; actions: BrandActions; focusAccount?: BrandAccount | null }) {
  const [platform, setPlatform] = useState<Platform>('youtube')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [date, setDate] = useState(getLocalDateKey())

  // When a channel is focused, scope the log to it and default new uploads to it.
  const focusCanon = focusAccount ? canonPlatform(focusAccount.platform) : null
  useEffect(() => { if (focusAccount) setPlatform(focusAccount.platform) }, [focusAccount])

  const uploads = [...(brand.uploads ?? [])]
    .filter((u) => !focusCanon || canonPlatform(u.platform) === focusCanon)
    .sort((a, b) => (a.postedAt < b.postedAt ? 1 : -1))

  // Tiny recap from manually-rated uploads in the last 30 days.
  const recent = uploads.filter((u) => u.rating && Date.parse(u.postedAt) > Date.now() - 30 * 86_400_000)
  const greens = recent.filter((u) => u.rating === 'green').length
  const reds = recent.filter((u) => u.rating === 'red').length

  function add(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    actions.addUpload(brand.id, {
      platform,
      title: title.trim(),
      url: url.trim() || undefined,
      postedAt: date ? new Date(`${date}T12:00:00`).toISOString() : undefined,
    })
    setTitle('')
    setUrl('')
    setDate(getLocalDateKey())
  }

  return (
    <div className={styles.uploadBlock}>
      <header className={styles.ccHead}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowMark}>·02</span>
          <span className={styles.eyebrowRule} />
          What you shipped
        </span>
        {focusAccount && (
          <span className={styles.uploadMeta}>{focusAccount.handle || PLATFORM_LABELS[focusAccount.platform]}</span>
        )}
      </header>

      {recent.length > 0 && (
        <p className={styles.workshopRecap}>
          Last 30 days: <b>{greens}</b> lifted, <b>{reds}</b> dipped. Each upload shows on your Studio chart at its date.
        </p>
      )}

      <form className={styles.uploadAdd} onSubmit={add}>
        <select className={styles.scSelect} value={platform} onChange={(e) => setPlatform(e.target.value as Platform)} aria-label="Platform">
          {UPLOAD_PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
        </select>
        <input className={styles.connInput} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What did you post?" />
        <input className={styles.connInput} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link (optional)" inputMode="url" />
        <input className={styles.scSelect} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Posted date" />
        <button type="submit" className={styles.connConnect} disabled={!title.trim()}>+ Log</button>
      </form>

      {uploads.length === 0 ? (
        <p className={styles.emptyText}>
          Log each video or reel here after you post it. They line up on your social chart by date, so you can see which ones moved the numbers.
        </p>
      ) : (
        <ul className={styles.uploadList}>
          {uploads.map((u) => {
            const color = u.rating === 'green' ? 'var(--mint)' : u.rating === 'red' ? 'var(--red)' : u.rating === 'yellow' ? 'var(--amber)' : 'var(--border-strong)'
            return (
              <li key={u.id} className={styles.uploadRow}>
                <span className={styles.uploadDot} style={{ background: color }} title={u.rating ? `Rated ${u.rating}` : 'Auto-rated on the chart'} />
                <span className={styles.uploadTitle}>{u.title || 'Untitled'}</span>
                <span className={styles.uploadMeta}>{PLATFORM_SHORT[u.platform]} · {fmtDay(u.postedAt)}</span>
                <span className={styles.uploadSpacer} />
                <span className={styles.uploadRate}>
                  {RATINGS.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      className={`${styles.uploadRateBtn} ${u.rating === r.key ? styles.uploadRateOn : ''}`}
                      style={{ background: r.color }}
                      onClick={() => actions.updateUpload(brand.id, u.id, { rating: u.rating === r.key ? undefined : r.key })}
                      title={r.label}
                      aria-label={`Mark ${r.label}`}
                    />
                  ))}
                </span>
                {u.url && (
                  <a className={styles.uploadOpen} href={normalizeUrl(u.url)} target="_blank" rel="noopener noreferrer" aria-label="Open post" title="Open post">↗</a>
                )}
                <button type="button" className={styles.uploadDel} onClick={() => actions.removeUpload(brand.id, u.id)} aria-label="Remove" title="Remove">×</button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
