'use client'

/**
 * The client half of /district/[id]: a big, share-worthy poster preview of ONE
 * tile plus its Add button. It drives the SAME one-tap funnel the gallery uses
 * (app/district/DistrictGallery.tsx):
 *
 *  - Logged IN  → import INLINE with tileStore.importTile + pushTile(uid, tile,
 *    'hub'), flip the button to the "Added" ghost, and show a toast that offers a
 *    small "View on your dashboard" link. No redirect.
 *  - Logged OUT → stash ONLY the opaque id in localStorage
 *    ('vitality:pending-tile' = { t, id }) and route to /signup?next=/app. The
 *    consume effect already living on /app lands the tile post-auth by resolving
 *    the envelope first-party (catalog / RLS-filtered published_tiles), never the
 *    stash. We never re-implement that consume here.
 *
 * The poster is the recolored design SVG handed down from the server (via
 * designByKey). The sealed envelope.html is never rendered: no iframe, no
 * srcdoc. Arbitrary HTML is never installed from the URL: on a logged-in Add the
 * envelope came from the compiled catalog or an RLS-approved row; on a logged-out
 * Add only the id travels.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { tileStore } from '@/lib/tiles/tileStore'
import { pushTile } from '@/lib/tiles/tileSync'
import type { TileEnvelope } from '@/lib/tiles/types'
import type { DetailTile } from './page'
import styles from './detail.module.css'

const SIGNUP_NEXT = '/signup?next=/app'

interface TileDetailProps {
  tile: DetailTile
  /** The recolorable design poster SVG (from designByKey), or null. */
  svg: string | null
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 13 4 4L19 7" />
    </svg>
  )
}

export default function TileDetail({ tile, svg }: TileDetailProps) {
  const router = useRouter()
  const [added, setAdded] = useState(false)
  const [toast, setToast] = useState<{ text: string; deep: boolean } | null>(null)
  // null = session not yet resolved; string = signed-in user id; '' = signed out.
  const [userId, setUserId] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)

  // Resolve the current session once. Decides inline-add vs stash-and-signup.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase.auth.getUser()
        if (alive) setUserId(data.user?.id ?? '')
      } catch {
        if (alive) setUserId('')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimer.current != null) window.clearTimeout(toastTimer.current)
    }
  }, [])

  function showToast(text: string, deep: boolean) {
    setToast({ text, deep })
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }

  // Logged OUT: stash the opaque id only (never HTML) and route to signup. The
  // envelope is resolved first-party on consume; ?next=/app is re-validated by
  // safeNextPath on the auth page, so no open redirect.
  function stashAndSignup(t: 'featured' | 'published', id: string) {
    try {
      localStorage.setItem('vitality:pending-tile', JSON.stringify({ t, id }))
    } catch {
      /* private mode / storage full: signup still happens, the tile just won't ride */
    }
    router.push(SIGNUP_NEXT)
  }

  // Logged IN: import inline, staying on the page (mirrors the gallery's pipe).
  function importInline(uid: string, envelope: TileEnvelope): boolean {
    const created = tileStore.importTile(uid, envelope)
    if (!created) return false
    void pushTile(uid, created, 'hub') // mirror up so it persists + crosses devices
    return true
  }

  function add() {
    if (added) return
    if (userId) {
      if (!importInline(userId, tile.envelope)) return
      setAdded(true)
      showToast(`${tile.name} added to your dashboard`, true)
      return
    }
    // Signed out (or session still resolving): flip for instant feedback, then funnel.
    setAdded(true)
    showToast(`${tile.name} is on the way`, false)
    stashAndSignup(tile.source, tile.id)
  }

  return (
    <div className={styles.page}>
      <div className={styles.horizon} aria-hidden />
      <div className={styles.grain} aria-hidden />

      <div className={styles.shell}>
        <div className={styles.bar}>
          <Link href="/" className={styles.mark} aria-label="Vitality">
            V
          </Link>
          <Link href="/district" className={styles.crumb}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m15 18-6-6 6-6" />
            </svg>
            Arts District
          </Link>
          <span className={styles.barSpacer} />
          <Link href={SIGNUP_NEXT} className={styles.barCta}>
            Make your own
          </Link>
        </div>

        <div className={styles.detail}>
          <div className={styles.poster} style={{ color: tile.accent }}>
            {svg && <span className={styles.art} dangerouslySetInnerHTML={{ __html: svg }} />}
            <div className={styles.posterScrim} aria-hidden />
            <span className={styles.posterTag}>
              <span className={styles.posterDot} />
              {tile.category}
            </span>
          </div>

          <div className={styles.info}>
            <div className={styles.eyebrow}>
              <span className={styles.eyebrowNum} aria-hidden>
                &middot;
              </span>
              <span className={styles.eyebrowLbl}>A Tile</span>
            </div>
            <h1 className={styles.title}>{tile.name}</h1>
            <p className={styles.byline}>By {tile.byline}</p>
            <p className={styles.tagline}>{tile.tagline}</p>

            <div className={styles.actions}>
              <button
                type="button"
                className={`${styles.add} ${added ? styles.done : ''}`}
                onClick={add}
                disabled={added}
              >
                {added ? (
                  <>
                    <CheckIcon />
                    Added
                  </>
                ) : (
                  <>
                    <PlusIcon />
                    Add to your dashboard
                  </>
                )}
              </button>
              <span className={styles.note}>
                <span className={styles.noteDot} />
                Free to add. No setup.
              </span>
            </div>
          </div>
        </div>

        <div className={styles.circle}>
          <span className={styles.circleIcon} aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9" />
              <path d="M3 4v5h5" />
            </svg>
          </span>
          <div className={styles.circleBody}>
            <p>
              Make a Vitality and this tile lands on <b>your dashboard</b>, alongside every other one you pick.
            </p>
            <span className={styles.circleSmall}>No credit card. Your tiles, your dashboard, always yours.</span>
          </div>
          <Link href="/district" className={styles.circleCta}>
            Browse the gallery
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m9 18 6-6-6-6" />
            </svg>
          </Link>
        </div>
      </div>

      <div className={`${styles.toast} ${toast ? styles.show : ''}`} role="status" aria-live="polite">
        <span className={styles.toastGlyph}>
          <CheckIcon />
        </span>
        {toast?.text}
        {toast?.deep && (
          <Link href="/app" className={styles.toastLink}>
            View on your dashboard
          </Link>
        )}
      </div>
    </div>
  )
}
