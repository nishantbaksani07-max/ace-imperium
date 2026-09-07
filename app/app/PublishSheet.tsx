'use client'

/**
 * Publish sheet (Arts District v3). Confirms publishing a Kept tile to the public
 * gallery, credited to the maker's @handle. Gates warmly on having a handle
 * (links to /account to claim one). On confirm it calls the publishTile server
 * action, which snapshots the tile into published_tiles as 'pending' (curated
 * approval). The cover reuses the tile's own design art (never sealed HTML), and
 * a small swatch row lets the maker recolor the poster live before publishing.
 * The chosen color rides on the same skin.color the envelope already carries, so
 * the publish CONTRACT is untouched (a recolored tile is just a re-skinned tile).
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { designByKey, DESIGN_COLORS } from '@/lib/tiles/designs'
import { MAX_PUBLISH_HTML } from '@/lib/tiles/publish'
import { publishTile } from './publishActions'
import type { Tile } from '@/lib/tiles/types'
import type { Skin } from '@/lib/tiles/tileSkin'
import styles from './publishSheet.module.css'

export interface PublishSheetProps {
  tile: Tile
  skin: Skin
  onClose: () => void
}

type Phase = 'loading' | 'ready' | 'no-handle' | 'submitting' | 'done'

export default function PublishSheet({ tile, skin, onClose }: PublishSheetProps) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [handle, setHandle] = useState<string | null>(null)
  const [optInReuse, setOptInReuse] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const name = (skin.name || tile.name).trim()
  const design = skin.design ? designByKey(skin.design) : undefined

  // Live poster color. Seeds from the tile's own accent (falls back to Mint), and
  // the maker can recolor it before publishing. It only ever sets skin.color, so
  // what publishes is the same tile wearing the color they see here.
  const [color, setColor] = useState<string>(skin.color || DESIGN_COLORS[0].hex)

  // The tile is too big to ever be re-addable. Surface it up front (friendly),
  // not as a failure only after they press Publish.
  const oversized = useMemo(
    () => (tile.html?.length ?? 0) > MAX_PUBLISH_HTML,
    [tile.html]
  )

  // On open, look up the maker's handle (credit requires one).
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { if (alive) setPhase('no-handle'); return }
        const { data } = await supabase
          .from('creator_profiles')
          .select('username')
          .eq('user_id', user.id)
          .maybeSingle()
        if (!alive) return
        if (data?.username) { setHandle(data.username); setPhase('ready') }
        else setPhase('no-handle')
      } catch {
        if (alive) setPhase('no-handle')
      }
    })()
    return () => { alive = false }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit() {
    if (oversized) return
    setError(null)
    setPhase('submitting')
    // Publish the tile wearing the color the maker picked. skin.color is part of
    // the existing skin shape (tileToEnvelope already carries it), so the
    // publishTile action + payload are unchanged.
    const res = await publishTile({ tile, skin: { ...skin, color }, optInReuse })
    if (!res.ok) {
      if (res.needsHandle) { setPhase('no-handle'); return }
      setError(res.error ?? 'Could not publish. Give it another go in a moment.')
      setPhase('ready')
      return
    }
    setPhase('done')
  }

  // The recolorable poster face: same design art the dashboard and shop render.
  const poster = (
    <div className={styles.cover} style={{ color }}>
      {design
        ? <span className={styles.art} dangerouslySetInnerHTML={{ __html: design.svg }} />
        : <span className={styles.artFallback} aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <path d="M8 14l3-3 2 2 3-4" />
            </svg>
          </span>}
      <span className={styles.coverName}>{name}</span>
      {phase !== 'no-handle' && handle && (
        <span className={styles.coverBy}>@{handle}</span>
      )}
    </div>
  )

  return (
    <div className={styles.scrim} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.win} role="dialog" aria-modal="true" aria-label="Publish tile">
        <button type="button" className={styles.x} aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>

        {poster}

        {phase === 'done' ? (
          <div className={styles.body}>
            <span className={styles.doneMark} aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 13 4 4L19 7" />
              </svg>
            </span>
            <h2 className={styles.title}>On its way</h2>
            <p className={styles.lede}>
              Nice work. <b>{name}</b> is submitted for review. Once it is approved
              it appears in the Arts District for anyone to add in one tap, credited
              to <b>@{handle}</b>.
            </p>
            <p className={styles.fine}>You and Sam approve every public tile before it goes live.</p>
            <button type="button" className={styles.primary} onClick={onClose}>Done</button>
          </div>
        ) : phase === 'no-handle' ? (
          <div className={styles.body}>
            <h2 className={styles.title}>Claim your maker name</h2>
            <p className={styles.lede}>
              Every published tile is credited to your <b>@handle</b>, so people can
              find everything you make. Pick yours, then come back and publish
              {name && <> <b>{name}</b></>}.
            </p>
            <Link
              href="/account?from=/app"
              className={styles.primary}
            >
              Claim your handle
            </Link>
            <button type="button" className={styles.ghost} onClick={onClose}>Maybe later</button>
          </div>
        ) : (
          <div className={styles.body}>
            <h2 className={styles.title}>Publish to the Arts District</h2>
            <p className={styles.lede}>
              Share <b>{name}</b> with everyone. It stays yours, credited
              {handle && <> to <b>@{handle}</b></>}, and is free for others to add.
            </p>

            <div className={styles.swatchGroup} role="group" aria-label="Poster color">
              {DESIGN_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  className={`${styles.swatch} ${color === c.hex ? styles.swatchOn : ''}`}
                  style={{ color: c.hex }}
                  aria-label={c.name}
                  aria-pressed={color === c.hex}
                  onClick={() => setColor(c.hex)}
                >
                  <span className={styles.swatchDot} />
                </button>
              ))}
            </div>

            <button
              type="button"
              className={styles.toggle}
              role="switch"
              aria-checked={optInReuse}
              onClick={() => setOptInReuse((v) => !v)}
            >
              <span className={`${styles.track} ${optInReuse ? styles.on : ''}`}>
                <span className={styles.knob} />
              </span>
              <span className={styles.toggleLabel}>Let others add this tile</span>
            </button>

            {oversized ? (
              <p className={styles.error}>
                This tile is a little too big to publish (over the 1&nbsp;MB limit).
                Trim it down and it is good to go.
              </p>
            ) : error ? (
              <p className={styles.error}>{error}</p>
            ) : null}

            <button
              type="button"
              className={styles.primary}
              onClick={submit}
              disabled={phase === 'submitting' || phase === 'loading' || oversized}
            >
              {phase === 'submitting' ? 'Sending…' : 'Publish'}
            </button>
            <p className={styles.fine}>You and Sam approve every public tile before it goes live.</p>
          </div>
        )}
      </div>
    </div>
  )
}
