'use client'

/**
 * MakerGallery - the recolorable poster wall on a public maker page (Pillar 3).
 *
 * Each of the maker's approved published tiles renders as a design-SVG poster
 * (never the sealed HTML - the public page shows the recolorable *look*, tinted
 * by the tile's saved accent). Every poster has a one-tap Add that reuses the
 * ONE LOCKED install socket, exactly like the Arts District:
 *   - signed in  -> tileStore.importTile + pushTile('hub'), lands in the Library
 *   - signed out -> stash {t:'published',id} at 'vitality:pending-tile', then
 *                   /signup?next=/app so the tile is claimed right after signup
 *
 * A "Share this maker" button copies the page URL (navigator.clipboard) with a
 * toast. Presentational + client-only; the server page loads the tiles and hands
 * them down. A rejected import or a blocked clipboard fails quietly.
 */

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { tileStore } from '@/lib/tiles/tileStore'
import { pushTile } from '@/lib/tiles/tileSync'
import { designByKey } from '@/lib/tiles/designs'
import { publishedRowToEnvelope } from '@/lib/tiles/publish'
import type { TileEnvelope } from '@/lib/tiles/types'
import styles from './profile.module.css'

/** A maker's published tile as handed down from the server page. */
export interface GalleryTile {
  id: string
  name: string
  envelope: TileEnvelope
  status: 'pending' | 'approved' | 'rejected'
  /** varied cover height for the masonry rhythm (computed server-side) */
  coverHeight: number
}

interface Props {
  tiles: GalleryTile[]
  /** who the empty-state copy names, e.g. "@alexwise" or a display name */
  makerName: string
  /** true when the viewer is signed in (Add installs inline) */
  isSignedIn: boolean
  /** the absolute (or path) URL of this maker page, for the share button */
  shareUrl: string
}

export default function MakerGallery({ tiles, makerName, isSignedIn, shareUrl }: Props) {
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)

  function flash(message: string) {
    setToast(message)
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }

  useEffect(() => {
    return () => {
      if (toastTimer.current != null) window.clearTimeout(toastTimer.current)
    }
  }, [])

  /**
   * Add one published tile. Signed in -> import through the LOCKED socket and
   * mirror up. Signed out -> stash the intent and send them to signup; the tile
   * gets claimed once they land in the app.
   */
  function add(t: GalleryTile) {
    if (added.has(t.id)) return

    if (!isSignedIn) {
      try {
        window.localStorage.setItem(
          'vitality:pending-tile',
          JSON.stringify({ t: 'published', id: t.id }),
        )
      } catch {
        /* storage blocked - the signup redirect still works, just no auto-claim */
      }
      window.location.href = '/signup?next=/app'
      return
    }

    const envelope = publishedRowToEnvelope({
      envelope: t.envelope,
      name: t.name,
      html: t.envelope?.html ?? '',
    })
    if (!envelope) {
      flash('That tile could not be added.')
      return
    }

    void (async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          // Session lapsed between render and click - fall back to the stash path.
          try {
            window.localStorage.setItem(
              'vitality:pending-tile',
              JSON.stringify({ t: 'published', id: t.id }),
            )
          } catch { /* ignore */ }
          window.location.href = '/signup?next=/app'
          return
        }
        const tile = tileStore.importTile(user.id, envelope)
        if (!tile) {
          flash('That tile could not be added.')
          return
        }
        void pushTile(user.id, tile, 'hub') // persist + cross devices
        setAdded((prev) => new Set(prev).add(t.id))
        flash(`${t.name} added to your Library`)
      } catch {
        flash('That tile could not be added.')
      }
    })()
  }

  async function share() {
    const url =
      shareUrl || (typeof window !== 'undefined' ? window.location.href : '')
    try {
      await navigator.clipboard.writeText(url)
      flash('Link copied to your clipboard')
    } catch {
      flash('Could not copy - long-press the address bar to share.')
    }
  }

  return (
    <>
      <div className={styles.shareRow}>
        <button type="button" className={styles.shareBtn} onClick={share}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
            <path d="M16 6l-4-4-4 4" />
            <path d="M12 2v14" />
          </svg>
          Share this maker
        </button>
      </div>

      {tiles.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyLine}>No published tiles yet.</div>
          <div className={styles.emptySub}>
            When {makerName} publishes a tile, it lands here - free to add in one tap.
          </div>
        </div>
      ) : (
        <div className={styles.masonry}>
          {tiles.map((t) => {
            const design = t.envelope?.design ? designByKey(t.envelope.design) : undefined
            const isAdded = added.has(t.id)
            const approved = t.status === 'approved'
            return (
              <div key={t.id} className={styles.galTile}>
                <button
                  type="button"
                  className={styles.galCover}
                  style={{ height: t.coverHeight, color: t.envelope?.color || undefined }}
                  onClick={() => add(t)}
                  disabled={!approved}
                  aria-label={`Add ${t.name}`}
                >
                  {design ? (
                    <span className={styles.galArt} dangerouslySetInnerHTML={{ __html: design.svg }} />
                  ) : (
                    <span className={styles.galArtFallback} aria-hidden>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                        <rect x="4" y="4" width="16" height="16" rx="4" />
                        <path d="M9 12h6M12 9v6" />
                      </svg>
                    </span>
                  )}
                  {!approved && <span className={styles.reviewBadge}>In review</span>}
                  {approved && (
                    <span className={`${styles.addPill} ${isAdded ? styles.addPillDone : ''}`}>
                      {isAdded ? (
                        <>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m5 13 4 4L19 7" />
                          </svg>
                          Added
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                          Add
                        </>
                      )}
                    </span>
                  )}
                </button>
                <div className={styles.galMeta}>
                  <span className={styles.galName}>{t.name}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className={`${styles.toast} ${toast ? styles.toastShow : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </>
  )
}
