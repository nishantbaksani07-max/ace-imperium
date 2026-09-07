'use client'

import { useCallback, useEffect, useState } from 'react'
import styles from './brand.module.css'
import type { BrandAccount } from './types'

/**
 * YouTubeVideos — a compact, collapsed-by-default strip of a channel's recent
 * uploads. Tap to expand: a left-to-right scroll of video cards (thumbnail,
 * title, views, likes, comments, duration) pulled live from /api/brand/videos
 * (YouTube Data API). A "Best" toggle re-sorts by views so the top performers
 * jump to the front.
 *
 * Only PUBLIC metrics exist without OAuth — views / likes / comments. CTR,
 * average-view-duration and retention are private; we say so and point at the
 * master prompt (Top/flop section), which reads them from the user's own Studio.
 *
 * Generic + multi-user: keyed entirely off the passed account, no hardcoded
 * channel. Renders nothing for non-YouTube accounts.
 */

interface BrandVideo {
  id: string
  title: string
  thumbnail: string
  url: string
  publishedAt: string
  views: number | null
  likes: number | null
  comments: number | null
  duration: string | null
}

type Sort = 'recent' | 'best'

function compact(n: number | null): string {
  if (typeof n !== 'number') return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`
  return String(n)
}

function shortDate(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function YouTubeVideos({ account }: { account: BrandAccount }) {
  const isYouTube = account.platform === 'youtube' || account.platform === 'youtube_long'

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [videos, setVideos] = useState<BrandVideo[] | null>(null)
  const [sort, setSort] = useState<Sort>('recent')

  const load = useCallback(async () => {
    if (!account.handle.trim()) { setError('Add the channel handle first.'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/brand/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: account.platform, handle: account.handle }),
      })
      const data = await res.json().catch(() => ({})) as { videos?: BrandVideo[]; error?: string }
      if (!res.ok) throw new Error(data.error || `request failed (${res.status})`)
      setVideos(data.videos ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your videos.')
    } finally {
      setLoading(false)
    }
  }, [account.platform, account.handle])

  // Fetch once, the first time the strip is opened. Re-fetch if the account
  // changes underneath an already-open strip.
  useEffect(() => { setVideos(null); setError(null) }, [account.id])
  useEffect(() => { if (open && videos === null && !loading && !error) void load() }, [open, videos, loading, error, load])

  if (!isYouTube) return null

  const sorted = videos
    ? [...videos].sort((a, b) =>
        sort === 'best' ? (b.views ?? -1) - (a.views ?? -1) : (a.publishedAt < b.publishedAt ? 1 : -1))
    : []

  return (
    <section className={styles.ytStrip}>
      <button type="button" className={styles.ytStripToggle} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={styles.ytStripChev} aria-hidden>{open ? '▾' : '▸'}</span>
        <span className={styles.ytStripTitle}>Recent videos</span>
        <span className={styles.ytStripSub}>thumbnails · views · likes · comments</span>
      </button>

      {open && (
        <div className={styles.ytStripBody}>
          <div className={styles.ytStripBar}>
            <div className={styles.scPills}>
              <button type="button" className={sort === 'recent' ? styles.scPillActive : styles.scPill} onClick={() => setSort('recent')}>Recent</button>
              <button type="button" className={sort === 'best' ? styles.scPillActive : styles.scPill} onClick={() => setSort('best')}>Best performing</button>
            </div>
            <button type="button" className={styles.ytRefresh} onClick={() => { setVideos(null); void load() }} disabled={loading} title="Reload videos">
              {loading ? '↻ Loading…' : '↻ Reload'}
            </button>
          </div>

          {error && <p className={styles.ytNote}>{error}</p>}

          {!error && loading && videos === null && <p className={styles.ytNote}>Pulling your recent videos…</p>}

          {!error && videos && videos.length === 0 && <p className={styles.ytNote}>No public videos found on this channel.</p>}

          {sorted.length > 0 && (
            <div className={styles.ytRow}>
              {sorted.map((v) => (
                <a key={v.id} className={styles.ytCard} href={v.url} target="_blank" rel="noopener noreferrer" title={v.title}>
                  <div className={styles.ytThumbWrap}>
                    {v.thumbnail
                      ? <img className={styles.ytThumb} src={v.thumbnail} alt="" loading="lazy" />
                      : <div className={styles.ytThumbFallback} aria-hidden>▶</div>}
                    {v.duration && <span className={styles.ytDur}>{v.duration}</span>}
                  </div>
                  <span className={styles.ytTitle}>{v.title}</span>
                  <div className={styles.ytStats}>
                    <span className={styles.ytStat} title="Views">▶ {compact(v.views)}</span>
                    <span className={styles.ytStat} title="Likes">♥ {compact(v.likes)}</span>
                    <span className={styles.ytStat} title="Comments">💬 {compact(v.comments)}</span>
                  </div>
                  <span className={styles.ytWhen}>{shortDate(v.publishedAt)}</span>
                </a>
              ))}
            </div>
          )}

          {sorted.length > 0 && (
            <p className={styles.ytNote}>
              CTR, watch time &amp; retention are private — pull them with the master prompt (Top/flop) below.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
