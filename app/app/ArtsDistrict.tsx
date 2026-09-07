'use client'

/**
 * Arts District: the tile shop (Pillar 3). A full-screen gallery of curated,
 * ready-made tiles a user adds in ONE tap, no Claude needed. It is the same
 * install socket the Library upload box and the MCP use: every Add hands a
 * TileEnvelope to tileStore.importTile (wired up in DashboardGrid via onAdd), so
 * an added tile lands in the Library and can be placed on the dashboard like any
 * other. Presentational only: it reads the static FEATURED_TILES catalog and
 * renders each as a poster card (its design face, name, and a one-line pitch).
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { FEATURED_TILES, FEATURED_CATEGORIES, type FeaturedTile } from '@/lib/tiles/featured'
import { designByKey } from '@/lib/tiles/designs'
import { createClient } from '@/lib/supabase/client'
import type { TileEnvelope } from '@/lib/tiles/types'
import styles from './artsDistrict.module.css'

/** A community-published tile (Arts District v3), credited to its maker. */
interface CommunityTile {
  id: string
  name: string
  envelope: TileEnvelope
  handle: string | null
}

export interface ArtsDistrictProps {
  /** Install a featured tile into the user's Library. Returns true on success.
   *  DashboardGrid wires this to tileStore.importTile + a refresh. */
  onAdd: (f: FeaturedTile) => boolean
  /** Install a community-published tile's envelope (v3). Same importTile socket. */
  onAddPublished?: (env: TileEnvelope) => boolean
  onClose: () => void
  /** Founder viewer: also show founderOnly dogfood tiles (visibility only). */
  showFounderTiles?: boolean
}

export default function ArtsDistrict({ onAdd, onAddPublished, onClose, showFounderTiles }: ArtsDistrictProps) {
  const [cat, setCat] = useState<string>('all')
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)
  const [community, setCommunity] = useState<CommunityTile[]>([])
  const toastTimer = useRef<number | null>(null)

  // founderOnly tiles are dogfood drops: everyone's app compiles them in, but
  // only founder viewers see them here until they graduate to a public launch.
  const catalog = FEATURED_TILES.filter((f) => !f.founderOnly || showFounderTiles)
  const shown = cat === 'all' ? catalog : catalog.filter((f) => f.envelope.category === cat)

  // Approved community drops (v3). Reads are public (RLS: status='approved');
  // a missing table or any error just leaves the section empty (graceful).
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const supabase = createClient()
        const { data: rows, error } = await supabase
          .from('published_tiles')
          .select('id, name, envelope, creator_id')
          .eq('status', 'approved')
          .order('created_at', { ascending: false })
          .limit(60)
        if (error || !rows || !alive) return
        const creatorIds = [...new Set(rows.map((r) => r.creator_id as string))]
        const { data: profs } = creatorIds.length
          ? await supabase.from('creator_profiles').select('user_id, username').in('user_id', creatorIds)
          : { data: [] as { user_id: string; username: string }[] }
        const handleByUser = new Map((profs ?? []).map((p) => [p.user_id, p.username]))
        if (!alive) return
        setCommunity(
          rows.map((r) => ({
            id: r.id as string,
            name: r.name as string,
            envelope: r.envelope as TileEnvelope,
            handle: handleByUser.get(r.creator_id as string) ?? null,
          }))
        )
      } catch {
        /* leave community empty */
      }
    })()
    return () => { alive = false }
  }, [])

  // Namespaced keys so a featured tile id can never collide with a community
  // tile's uuid in the shared "added" set.
  function add(f: FeaturedTile) {
    const key = `f:${f.id}`
    if (added.has(key)) return
    const ok = onAdd(f)
    if (!ok) return
    setAdded((prev) => new Set(prev).add(key))
    setToast(`${f.envelope.name} added to your Library`)
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }

  function addCommunity(t: CommunityTile) {
    const key = `c:${t.id}`
    if (added.has(key) || !onAddPublished) return
    const ok = onAddPublished(t.envelope)
    if (!ok) return
    setAdded((prev) => new Set(prev).add(key))
    setToast(`${t.name} added to your Library`)
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    return () => {
      if (toastTimer.current != null) window.clearTimeout(toastTimer.current)
    }
  }, [])

  return (
    <div className={styles.scrim} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.win} role="dialog" aria-modal="true" aria-label="Arts District">
        <div className={styles.head}>
          <div className={styles.brand}>
            <h2 className={styles.title}>Arts District</h2>
            <p className={styles.sub}>Tiles, ready to add. One tap, no building. New drops weekly.</p>
          </div>
          <button type="button" className={styles.x} aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.chips}>
          <button type="button" className={`${styles.chip} ${cat === 'all' ? styles.on : ''}`} onClick={() => setCat('all')}>
            All
          </button>
          {FEATURED_CATEGORIES.map((c) => (
            <button key={c} type="button" className={`${styles.chip} ${cat === c ? styles.on : ''}`} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>

        <div className={styles.grid}>
          {shown.map((f) => {
            const d = designByKey(f.envelope.design || '')
            const isAdded = added.has(`f:${f.id}`)
            return (
              <div key={f.id} className={styles.card}>
                <div className={styles.poster} style={{ color: f.accent }}>
                  {f.fresh && <span className={styles.fresh}>New</span>}
                  {d && <span className={styles.art} dangerouslySetInnerHTML={{ __html: d.svg }} />}
                  <span className={styles.pname}>{f.envelope.name}</span>
                  <span className={styles.parrow} aria-hidden>&#8594;</span>
                </div>
                <div className={styles.meta}>
                  <p className={styles.tagline}>{f.tagline}</p>
                  <div className={styles.row}>
                    <span className={styles.cat}>{f.envelope.category}</span>
                    <button
                      type="button"
                      className={`${styles.add} ${isAdded ? styles.done : ''}`}
                      onClick={() => add(f)}
                      disabled={isAdded}
                    >
                      {isAdded ? (
                        <>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m5 13 4 4L19 7" />
                          </svg>
                          Added
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                          Add
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {community.length > 0 && (
          <>
            <div className={styles.sectionLabel}>From the community</div>
            <div className={styles.grid}>
              {community.map((t) => {
                const d = designByKey(t.envelope.design || '')
                const isAdded = added.has(`c:${t.id}`)
                return (
                  <div key={t.id} className={styles.card}>
                    <div className={styles.poster} style={{ color: t.envelope.color || undefined }}>
                      {d && <span className={styles.art} dangerouslySetInnerHTML={{ __html: d.svg }} />}
                      <span className={styles.pname}>{t.name}</span>
                      <span className={styles.parrow} aria-hidden>&#8594;</span>
                    </div>
                    <div className={styles.meta}>
                      {t.handle ? (
                        <Link href={`/u/${t.handle}`} className={styles.byline}>by @{t.handle}</Link>
                      ) : (
                        <span className={styles.byline}>a Vitality maker</span>
                      )}
                      <div className={styles.row}>
                        <span className={styles.cat}>{t.envelope.category}</span>
                        <button
                          type="button"
                          className={`${styles.add} ${isAdded ? styles.done : ''}`}
                          onClick={() => addCommunity(t)}
                          disabled={isAdded || !onAddPublished}
                        >
                          {isAdded ? (
                            <>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m5 13 4 4L19 7" />
                              </svg>
                              Added
                            </>
                          ) : (
                            <>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 5v14M5 12h14" />
                              </svg>
                              Add
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <div className={`${styles.toast} ${toast ? styles.show : ''}`} role="status" aria-live="polite">
          {toast}
        </div>
      </div>
    </div>
  )
}
