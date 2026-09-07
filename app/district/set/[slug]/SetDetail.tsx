'use client'

/**
 * The client half of /district/set/[slug]: a whole curated set of featured tiles
 * behind one shareable URL, with a hero "Add all" plus the proven per-tile Add
 * pipe. Both drive the SAME one-tap funnel the gallery and /district/[id] use:
 *
 *  - Logged IN  -> import INLINE with tileStore.importTile + pushTile(uid, tile,
 *    'hub') per tile, flip buttons to the "Added" ghost, toast with a "View on
 *    your dashboard" link. No redirect.
 *  - Logged OUT, "Add all" -> stash ONLY the set's FIRST tile id in localStorage
 *    ('vitality:pending-tile' = { t:'featured', id }) as the backstop that rides
 *    the existing DashboardGrid consume, then route to
 *    /signup?next=/district/set/[slug]?add=all. Sign-in and Google OAuth carry
 *    ?next back here (AuthForm + /auth/callback both run safeNextPath), the page
 *    sees add=all while signed in, auto-adds the whole set ONCE, clears the
 *    stash (so the backstop can't duplicate the first tile later), and
 *    router.replace()s the param away.
 *  - Logged OUT, single Add -> exactly the /district/[id] pattern: stash that
 *    tile's id, route to /signup?next=/app.
 *
 * Known honest limitation (flagged, out of this lane): a fresh EMAIL signup
 * drops ?next (AuthForm pushes /onboarding), so only the stashed first tile
 * rides; the rest land on the visitor's first revisit of this link.
 *
 * The posters are recolored design SVGs handed down from the server (via
 * designByKey). The sealed envelope.html is never rendered: no iframe, no
 * srcdoc. Arbitrary HTML is never installed from the URL: envelopes come from
 * the compiled catalog; on a logged-out Add only an opaque id travels.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { tileStore } from '@/lib/tiles/tileStore'
import { pushTile } from '@/lib/tiles/tileSync'
import type { TileEnvelope } from '@/lib/tiles/types'
import type { SetTile } from './page'
import styles from './set.module.css'

const SIGNUP_NEXT = '/signup?next=/app'
const PENDING_KEY = 'vitality:pending-tile'
/** Same-device proof that the user themselves tapped Add all before signup;
 *  the ?add=all return leg only fires when this stamp matches the slug. */
const INTENT_KEY = 'vitality:set-add-intent'

interface SetDetailProps {
  slug: string
  title: string
  blurb: string
  tiles: SetTile[]
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

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

export default function SetDetail({ slug, title, blurb, tiles }: SetDetailProps) {
  const router = useRouter()
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<{ text: string; deep: boolean } | null>(null)
  const [copied, setCopied] = useState(false)
  // null = session not yet resolved; string = signed-in user id; '' = signed out.
  const [userId, setUserId] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)
  const copyTimer = useRef<number | null>(null)
  // The ?add=all return leg must fire exactly once per page load.
  const consumedAddAll = useRef(false)

  const allAdded = tiles.length > 0 && tiles.every((t) => added.has(t.id))

  // Resolve the current session once. Decides inline-add vs stash-and-signup.
  // If this device already landed the whole set for this user, pre-fill the
  // added state so a revisit shows "on your dashboard" instead of quietly
  // importing four duplicates (verify LOW-3).
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase.auth.getUser()
        if (!alive) return
        const uid = data.user?.id ?? ''
        setUserId(uid)
        if (uid) {
          try {
            if (localStorage.getItem(`vitality:set-added:${slug}:${uid}`)) {
              setAdded(new Set(tiles.map((t) => t.id)))
            }
          } catch {
            /* storage blocked: revisit just shows the normal Add state */
          }
        }
      } catch {
        if (alive) setUserId('')
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimer.current != null) window.clearTimeout(toastTimer.current)
      if (copyTimer.current != null) window.clearTimeout(copyTimer.current)
    }
  }, [])

  // The post-auth return leg: signed in + ?add=all -> land the whole set once,
  // then strip the param so refresh / share of the address bar can't re-add.
  // The add only fires when THIS device stamped the intent at the moment the
  // user tapped Add all while signed out - so a crafted ?add=all link shared
  // to a signed-in user is a plain set page, never a drive-by install
  // (verify LOW-2). The stamp is consumed either way.
  useEffect(() => {
    if (!userId || consumedAddAll.current) return
    if (new URLSearchParams(window.location.search).get('add') !== 'all') {
      consumedAddAll.current = true
      return
    }
    consumedAddAll.current = true
    let intended = false
    try {
      intended = sessionStorage.getItem(INTENT_KEY) === slug
      sessionStorage.removeItem(INTENT_KEY)
    } catch {
      /* storage blocked: treat as unintended, the user can tap Add all */
    }
    if (intended) addAllInline(userId)
    router.replace(`/district/set/${slug}`, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  function showToast(text: string, deep: boolean) {
    setToast({ text, deep })
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }

  // Logged IN: import one envelope inline (mirrors the gallery's pipe).
  function importInline(uid: string, envelope: TileEnvelope): boolean {
    const created = tileStore.importTile(uid, envelope)
    if (!created) return false
    void pushTile(uid, created, 'hub') // mirror up so it persists + crosses devices
    return true
  }

  // Logged IN: land every not-yet-added tile of the set, then clear the
  // pending-tile stash so the signup backstop can't re-add the first tile when
  // /app's consume effect runs later.
  function addAllInline(uid: string) {
    const next = new Set(added)
    let landed = 0
    for (const t of tiles) {
      if (next.has(t.id)) continue
      if (importInline(uid, t.envelope)) {
        next.add(t.id)
        landed++
      }
    }
    if (landed === 0) {
      if (tiles.every((t) => next.has(t.id))) {
        showToast(`${title} is already on your dashboard`, true)
      } else {
        showToast('Could not save right now. Nothing was added.', false)
      }
      return
    }
    setAdded(next)
    try {
      localStorage.removeItem(PENDING_KEY)
      // Remember the landing per user+set so a revisit shows "on your
      // dashboard" instead of importing duplicates (verify LOW-3).
      localStorage.setItem(`vitality:set-added:${slug}:${uid}`, '1')
    } catch {
      /* storage blocked: worst case the first tile arrives twice via /app */
    }
    showToast(`${title} is on your dashboard`, true)
  }

  // Logged OUT: stash the opaque id only (never HTML) and route to signup. The
  // envelope is resolved first-party on consume; ?next is re-validated by
  // safeNextPath on the auth page, so no open redirect.
  function stashAndSignup(id: string, next: string) {
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify({ t: 'featured', id }))
    } catch {
      /* private mode / storage full: signup still happens, the tile just won't ride */
    }
    router.push(next)
  }

  function addAll() {
    if (allAdded) return
    if (userId) {
      addAllInline(userId)
      return
    }
    // Signed out (or session still resolving): stash the first tile as the
    // backstop, stamp the add-all intent for the return leg (the ?add=all
    // param alone is never trusted), carry the set through ?next, and funnel
    // to signup.
    try {
      sessionStorage.setItem(INTENT_KEY, slug)
    } catch {
      /* storage blocked: the first tile still rides the pending stash */
    }
    showToast(`${title} is on the way`, false)
    stashAndSignup(tiles[0].id, `/signup?next=${encodeURIComponent(`/district/set/${slug}?add=all`)}`)
  }

  function addOne(t: SetTile) {
    if (added.has(t.id)) return
    if (userId) {
      if (!importInline(userId, t.envelope)) return
      setAdded((prev) => new Set(prev).add(t.id))
      showToast(`${t.name} added to your dashboard`, true)
      return
    }
    setAdded((prev) => new Set(prev).add(t.id))
    showToast(`${t.name} is on the way`, false)
    stashAndSignup(t.id, SIGNUP_NEXT)
  }

  // Copies this set's own deep link; the page IS the shareable unit.
  async function share() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/district/set/${slug}`)
      setCopied(true)
      if (copyTimer.current != null) window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable: the link still exists in the address bar */
    }
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

        <header className={styles.head}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowNum} aria-hidden>
              &middot;
            </span>
            <span className={styles.eyebrowLbl}>A Set</span>
          </div>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.blurb}>{blurb}</p>
          <span className={styles.meta}>
            <span className={styles.metaDot} />
            {tiles.length} tiles, one tap
          </span>

          <div className={styles.actions}>
            <button
              type="button"
              className={`${styles.addAll} ${allAdded ? styles.done : ''}`}
              onClick={addAll}
              disabled={allAdded}
            >
              {allAdded ? (
                <>
                  <CheckIcon />
                  On your dashboard
                </>
              ) : (
                <>
                  <PlusIcon />
                  Add all {tiles.length}
                </>
              )}
            </button>
            <button
              type="button"
              className={`${styles.share} ${copied ? styles.copied : ''}`}
              onClick={share}
            >
              {copied ? <CheckIcon /> : <LinkIcon />}
              {copied ? 'Link copied' : 'Copy link'}
            </button>
            <span className={styles.note}>
              <span className={styles.noteDot} />
              Free to add. No setup.
            </span>
          </div>
        </header>

        <div className={styles.wall}>
          {tiles.map((t, i) => {
            const isAdded = added.has(t.id)
            return (
              <div key={t.id} className={styles.card} style={{ ['--i' as string]: i }}>
                <Link
                  href={`/district/${t.id}`}
                  className={styles.cover}
                  style={{ color: t.accent }}
                  aria-label={`See ${t.name} up close`}
                >
                  {t.svg && <span className={styles.art} dangerouslySetInnerHTML={{ __html: t.svg }} />}
                  <div className={styles.scrim} aria-hidden />
                  <span className={styles.ctitle}>{t.name}</span>
                  <span className={styles.ctag}>
                    <span className={styles.ctagDot} />
                    {t.category}
                  </span>
                </Link>
                <div className={styles.foot}>
                  <p className={styles.tagline}>{t.tagline}</p>
                  <button
                    type="button"
                    className={`${styles.add} ${isAdded ? styles.added : ''}`}
                    onClick={() => addOne(t)}
                    disabled={isAdded}
                  >
                    {isAdded ? (
                      <>
                        <CheckIcon />
                        Added
                      </>
                    ) : (
                      <>
                        <PlusIcon />
                        Add
                      </>
                    )}
                  </button>
                </div>
              </div>
            )
          })}
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
              Make a Vitality and this whole set lands on <b>your dashboard</b>, ready on day one.
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
