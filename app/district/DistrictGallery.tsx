'use client'

/**
 * The public Arts District gallery (Pillar 3 front door). A client component that
 * renders the featured wall + the approved community wall, owns the filter state,
 * and drives the one-tap Add flow for BOTH a logged-in and a logged-out visitor.
 *
 * On mount it reads the current session with the anon browser client:
 *  - Logged IN: Add imports INLINE and stays on /district. It runs the same
 *    tileStore.importTile + pushTile(userId, tile, 'hub') pipe the gated overlay
 *    uses, flips the button to the "Added" ghost state, and shows a toast that
 *    offers a small "View on your dashboard" link. No redirect.
 *  - Logged OUT: Add stashes ONLY the opaque tile id in localStorage
 *    ('vitality:pending-tile' = { t, id }) and routes to /signup?next=/app. The
 *    consume effect in DashboardGrid lands the tile post-auth, always resolving
 *    the envelope from the first-party catalog / RLS-filtered published_tiles,
 *    never from the stash. Arbitrary HTML is never installed.
 *
 * The cards are static recolorable design SVG posters. The sealed envelope.html
 * is never rendered here; it only travels inside the envelope to importTile on a
 * logged-in Add. No iframe, no srcdoc, no sandbox.
 *
 * Clicking a featured card (or the hero cover) opens DistrictDetailModal, the
 * Netflix-style centered overlay approved in public/district-detail-modal.html:
 * the shell behind blurs + dims, the modal plays the tile's sample week and its
 * Add button calls straight back into addFeatured here, so the add pipe lives in
 * exactly one place. /district/[id] stays the shareable deep-link route; the
 * modal is only the in-page experience.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { tileStore } from '@/lib/tiles/tileStore'
import { pushTile } from '@/lib/tiles/tileSync'
import { designByKey } from '@/lib/tiles/designs'
import type { FeaturedTile } from '@/lib/tiles/featured'
import { FEATURED_COLLECTIONS, tilesForCollection } from '@/lib/tiles/featured'
import type { TileEnvelope } from '@/lib/tiles/types'
import type { CommunityTile } from './page'
import DistrictDetailModal from './DistrictDetailModal'
import styles from './district.module.css'

interface DistrictGalleryProps {
  featured: FeaturedTile[]
  categories: string[]
  community: CommunityTile[]
}

const SIGNUP_NEXT = '/signup?next=/app'

/** A small plus glyph for the Add buttons and CTA. */
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

/** A check glyph for the "Added" state and the toast. */
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 13 4 4L19 7" />
    </svg>
  )
}

export default function DistrictGallery({ featured, categories, community }: DistrictGalleryProps) {
  const router = useRouter()
  const [cat, setCat] = useState<string>('all')
  const [added, setAdded] = useState<Set<string>>(new Set())
  // The featured tile whose detail modal is open (null = closed). The gallery
  // owns this so the modal's Add can call straight back into addFeatured.
  const [openTile, setOpenTile] = useState<FeaturedTile | null>(null)
  const [toast, setToast] = useState<{ text: string; deep: boolean } | null>(null)
  // null = session not yet resolved; string = signed-in user id; '' = signed out.
  const [userId, setUserId] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)

  // Resolve the current session once. This decides inline-add vs stash-and-signup.
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

  // Logged IN: import inline, staying on /district (mirrors the gated overlay's
  // add pipe). Returns true when the tile landed so the button can flip.
  function importInline(uid: string, envelope: TileEnvelope): boolean {
    const tile = tileStore.importTile(uid, envelope)
    if (!tile) return false
    void pushTile(uid, tile, 'hub') // mirror up so it persists + crosses devices
    return true
  }

  function addFeatured(f: FeaturedTile) {
    const key = `f:${f.id}`
    if (added.has(key)) return
    if (userId) {
      if (!importInline(userId, f.envelope)) return
      setAdded((prev) => new Set(prev).add(key))
      showToast(`${f.envelope.name} added to your dashboard`, true)
      return
    }
    // Signed out (or session still resolving): flip for instant feedback, then funnel.
    setAdded((prev) => new Set(prev).add(key))
    showToast(`${f.envelope.name} is on the way`, false)
    stashAndSignup('featured', f.id)
  }

  function addCommunity(t: CommunityTile) {
    const key = `c:${t.id}`
    if (added.has(key)) return
    if (userId) {
      if (!importInline(userId, t.envelope)) return
      setAdded((prev) => new Set(prev).add(key))
      showToast(`${t.name} added to your dashboard`, true)
      return
    }
    setAdded((prev) => new Set(prev).add(key))
    showToast(`${t.name} is on the way`, false)
    stashAndSignup('published', t.id)
  }

  // The one featured poster + Add card. Shared by the wall AND the collections
  // so both reuse the exact same recolorable poster and one-tap Add funnel.
  // Clicking anywhere on the card opens the detail modal; the cover is a real
  // <button> so keyboard users reach it too. Add stays its own button
  // (stopPropagation keeps it from also opening the modal).
  function renderFeaturedCard(f: FeaturedTile, i: number) {
    const d = designByKey(f.envelope.design || '')
    const isAdded = added.has(`f:${f.id}`)
    return (
      <div
        key={f.id}
        className={`${styles.card} ${styles.openable}`}
        style={{ ['--i' as string]: i }}
        onClick={() => setOpenTile(f)}
      >
        <button
          type="button"
          className={`${styles.cover} ${styles.coverBtn}`}
          style={{ color: f.accent }}
          aria-haspopup="dialog"
          aria-label={`See ${f.envelope.name} up close`}
        >
          {d && <span className={styles.art} dangerouslySetInnerHTML={{ __html: d.svg }} />}
          <div className={styles.scrim} />
          {f.fresh && (
            <span className={styles.fresh}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
              </svg>
              New
            </span>
          )}
          <span className={styles.ctitle}>{f.envelope.name}</span>
          <span className={styles.ctag}>
            <span className={styles.ctagDot} />
            {f.envelope.category}
          </span>
        </button>
        <div className={styles.foot}>
          <div className={styles.footStack}>
            <p className={styles.tagline}>{f.tagline}</p>
          </div>
          <button
            type="button"
            className={`${styles.add} ${isAdded ? styles.added : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              addFeatured(f)
            }}
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
  }

  const shown = cat === 'all' ? featured : featured.filter((f) => f.envelope.category === cat)
  // The hero is this week's drop: the fresh entry if present, else the first tile.
  const hero = featured.find((f) => f.fresh) ?? featured[0]
  const heroDesign = hero ? designByKey(hero.envelope.design || '') : undefined
  const heroAdded = hero ? added.has(`f:${hero.id}`) : false

  // Curated bundles: each resolves to the SAME featured tiles, only if non-empty.
  // A calm editorial view, independent of the filter (collections always show).
  const collections = FEATURED_COLLECTIONS.map((c) => ({
    ...c,
    tiles: tilesForCollection(c.id),
  })).filter((c) => c.tiles.length > 0)

  return (
    <div className={styles.page}>
      <div className={styles.horizon} aria-hidden />
      <div className={styles.grain} aria-hidden />
      <div className={styles.motes} aria-hidden>
        {Array.from({ length: 14 }).map((_, i) => (
          <span
            key={i}
            className={styles.mote}
            style={{
              left: `${(i * 6.7 + 4) % 100}%`,
              animationDuration: `${14 + (i % 5) * 2.4}s`,
              animationDelay: `${-i * 1.6}s`,
            }}
          />
        ))}
      </div>

      <div
        className={`${styles.shell} ${styles.dimmable} ${openTile ? styles.dimmed : ''}`}
        aria-hidden={openTile ? true : undefined}
      >
        <div className={styles.bar}>
          <Link href="/" className={styles.mark} aria-label="Vitality">
            V
          </Link>
          <span className={styles.barSpacer} />
          <Link href={SIGNUP_NEXT} className={styles.barCta}>
            Make your own
          </Link>
        </div>

        <div className={styles.head}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowNum} aria-hidden>
              &middot;
            </span>
            <span className={styles.eyebrowLbl}>The Gallery</span>
          </div>
          <h1 className={styles.title}>Arts District</h1>
          <p className={styles.sub}>
            Tiles, ready to add. <span className={styles.hl}>One tap, no building.</span> A new drop every week.
          </p>
        </div>

        {hero && (
          <div className={styles.hero}>
            {/* The hero cover opens the same detail modal as a wall card. Safe
                as role="button": the Add button lives in heroBody, not here. */}
            <div
              className={`${styles.heroCover} ${styles.openable}`}
              style={{ color: hero.accent }}
              role="button"
              tabIndex={0}
              aria-haspopup="dialog"
              aria-label={`See ${hero.envelope.name} up close`}
              onClick={() => setOpenTile(hero)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setOpenTile(hero)
                }
              }}
            >
              {heroDesign && (
                <span className={styles.heroArt} dangerouslySetInnerHTML={{ __html: heroDesign.svg }} />
              )}
              <div className={styles.scrim} />
              <span className={styles.ctitle}>{hero.envelope.name}</span>
              <span className={styles.ctag}>
                <span className={styles.ctagDot} />
                {hero.envelope.category}
              </span>
            </div>
            <div className={styles.heroBody}>
              <span className={styles.drop}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                  <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
                </svg>
                This week&rsquo;s drop
              </span>
              <h2 className={styles.heroTitle}>{hero.envelope.name}</h2>
              <p className={styles.heroText}>
                {hero.tagline} <span className={styles.hl}>Free to add, yours in a tap.</span>
              </p>
              <div className={styles.heroMeta}>
                <button
                  type="button"
                  className={`${styles.add} ${heroAdded ? styles.added : ''}`}
                  onClick={() => addFeatured(hero)}
                  disabled={heroAdded}
                >
                  {heroAdded ? (
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
          </div>
        )}

        <div className={styles.filters}>
          <button
            type="button"
            className={`${styles.fil} ${cat === 'all' ? styles.on : ''}`}
            onClick={() => setCat('all')}
          >
            <span className={styles.filDot} />
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={`${styles.fil} ${cat === c ? styles.on : ''}`}
              onClick={() => setCat(c)}
            >
              <span className={styles.filDot} />
              {c}
            </button>
          ))}
        </div>

        <div className={styles.wall}>{shown.map((f, i) => renderFeaturedCard(f, i))}</div>

        {collections.length > 0 && (
          <section className={styles.collections}>
            <div className={styles.sectionLabel}>Collections</div>
            <div className={styles.collectionList}>
              {collections.map((c) => (
                <div key={c.id} className={styles.collection}>
                  {/* The header links to the set's own shareable page
                      (/district/set/[slug]): the whole bundle behind one URL. */}
                  <Link
                    href={`/district/set/${c.id}`}
                    className={`${styles.collHead} ${styles.collHeadLink}`}
                    aria-label={`Open the ${c.title} set`}
                  >
                    <h3 className={styles.collTitle}>
                      {c.title}
                      <svg
                        className={styles.collArrow}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </h3>
                    <p className={styles.collBlurb}>{c.blurb}</p>
                  </Link>
                  <div className={styles.wall}>{c.tiles.map((f, i) => renderFeaturedCard(f, i))}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {community.length > 0 && (
          <>
            <div className={styles.sectionLabel}>From the community</div>
            <div className={styles.wall}>
              {community.map((t, i) => {
                const d = designByKey(t.envelope.design || '')
                const isAdded = added.has(`c:${t.id}`)
                return (
                  <div key={t.id} className={styles.card} style={{ ['--i' as string]: i }}>
                    <div className={styles.cover} style={{ color: t.envelope.color || undefined }}>
                      {d && <span className={styles.art} dangerouslySetInnerHTML={{ __html: d.svg }} />}
                      <div className={styles.scrim} />
                      <span className={styles.ctitle}>{t.name}</span>
                      <span className={styles.ctag}>
                        <span className={styles.ctagDot} />
                        {t.envelope.category}
                      </span>
                    </div>
                    <div className={styles.foot}>
                      <div className={styles.footStack}>
                        {t.handle ? (
                          <Link href={`/u/${t.handle}`} className={styles.byline}>
                            by @{t.handle}
                          </Link>
                        ) : (
                          <span className={styles.byline}>a Vitality maker</span>
                        )}
                      </div>
                      <button
                        type="button"
                        className={`${styles.add} ${isAdded ? styles.added : ''}`}
                        onClick={() => addCommunity(t)}
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
          </>
        )}

        <div className={styles.circle}>
          <span className={styles.circleIcon} aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9" />
              <path d="M3 4v5h5" />
            </svg>
          </span>
          <div className={styles.circleBody}>
            <p>
              Every tile here is <b>free to add</b>. Make a Vitality and your dashboard fills with the ones you pick.
            </p>
            <span className={styles.circleSmall}>No credit card. Your tiles, your dashboard, always yours.</span>
          </div>
          <Link href={SIGNUP_NEXT} className={styles.circleCta}>
            <PlusIcon />
            Add to your dashboard
          </Link>
        </div>
      </div>

      {openTile && (
        <DistrictDetailModal
          tile={openTile}
          added={added.has(`f:${openTile.id}`)}
          onAdd={() => addFeatured(openTile)}
          onClose={() => setOpenTile(null)}
        />
      )}

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
