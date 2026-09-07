import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { normalizeUsername } from '@/lib/profiles/username'
import {
  normalizeExternalUrl,
  primaryLinkLabel,
  isInstagramUrl,
} from '@/lib/profiles/links'
import { getAvatarUrl } from '@/lib/profiles/avatar'
import type { TileEnvelope } from '@/lib/tiles/types'
import MakerGallery, { type GalleryTile } from './MakerGallery'
import styles from './profile.module.css'

interface Props {
  params: { username: string }
}

interface CreatorProfile {
  user_id: string
  username: string
  display_name: string | null
  bio: string | null
  link_url: string | null
  instagram_url: string | null
  created_at: string | null
}

interface PublishedTile {
  id: string
  name: string
  envelope: TileEnvelope
  status: 'pending' | 'approved' | 'rejected'
}

/**
 * The maker's published tiles for the gallery. RLS shows the public only the
 * approved ones; the owner (signed in) also sees their own pending/rejected.
 * A missing table or any error returns [] so the page renders cleanly.
 */
async function loadPublishedTiles(userId: string): Promise<PublishedTile[]> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('published_tiles')
      .select('id, name, envelope, status')
      .eq('creator_id', userId)
      .neq('status', 'rejected')
      .order('created_at', { ascending: false })
    if (error || !data) return []
    return data as PublishedTile[]
  } catch {
    return []
  }
}

async function loadProfile(rawUsername: string): Promise<CreatorProfile | null> {
  const username = normalizeUsername(decodeURIComponent(rawUsername))
  if (!username) return null

  const supabase = createClient()
  // Public read (RLS: select using true). citext column folds case, but we
  // pass the already-normalized handle anyway.
  const { data } = await supabase
    .from('creator_profiles')
    .select('user_id, username, display_name, bio, link_url, instagram_url, created_at')
    .eq('username', username)
    .maybeSingle()

  return (data as CreatorProfile | null) ?? null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await loadProfile(params.username)
  if (!profile) return { title: 'Maker not found · Imperium' }

  const name = profile.display_name?.trim() || `@${profile.username}`
  const description = profile.bio?.trim() || `${name} on Imperium. Building tiles for getting your life in order.`
  return {
    title: `${name} (@${profile.username}) · Imperium`,
    description,
    openGraph: { title: `${name} · Imperium`, description, type: 'profile' },
  }
}

export default async function MakerProfilePage({ params }: Props) {
  const profile = await loadProfile(params.username)
  if (!profile) notFound()

  // Is the signed-in viewer the owner? Show an inline edit doorway if so.
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isOwner = user?.id === profile.user_id

  const [tiles, avatarUrl] = await Promise.all([
    loadPublishedTiles(profile.user_id),
    getAvatarUrl(supabase, profile.user_id),
  ])

  const name = profile.display_name?.trim() || `@${profile.username}`
  const initial = (name.replace(/^@/, '')[0] || '?').toUpperCase()
  const link = normalizeExternalUrl(profile.link_url)
  const instagram = normalizeExternalUrl(profile.instagram_url)
  // If the "one link" itself is an Instagram URL, don't render it twice.
  const primaryLink = link && !(instagram && isInstagramUrl(link)) ? link : null

  // Real stats only (no fake numbers). Public count = approved tiles; install
  // counts + ranking arrive with v4.
  const publishedCount = tiles.filter((t) => t.status === 'approved').length
  const makerSince = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null

  // Varied cover heights give the grid an organic, Savee-style masonry rhythm.
  // Computed here (server) so the client gallery stays purely presentational.
  const galleryTiles: GalleryTile[] = tiles.map((t, i) => ({
    id: t.id,
    name: t.name,
    envelope: t.envelope,
    status: t.status,
    coverHeight: [196, 232, 168, 212, 180][i % 5],
  }))

  // Absolute URL for the "Share this maker" button. Reconstructed from the
  // request headers so a copied link works from anywhere (client falls back to
  // window.location.href if this is empty).
  const h = headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const shareUrl = host ? `${proto}://${host}/u/${profile.username}` : `/u/${profile.username}`

  return (
    <div className={styles.page}>
      <div className={styles.glow} aria-hidden />

      <div className={styles.bar}>
        <Link href="/" className={styles.mark} aria-label="Imperium">I</Link>
        <span className={styles.barSpacer} />
        {isOwner ? (
          <Link href="/account" className={styles.barCta}>Edit profile</Link>
        ) : (
          <Link href="/" className={styles.barCta}>Make your own</Link>
        )}
      </div>

      <div className={styles.prof}>
        <div className={styles.avwrap}>
          <div className={styles.av}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={name} className={styles.avImg} />
            ) : (
              initial
            )}
          </div>
        </div>
        <div className={styles.name}>
          {name}
          <span className={styles.vf} title="Imperium maker">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <path d="m5 13 4 4L19 7" />
            </svg>
          </span>
        </div>
        <div className={styles.meta}>
          <b>@{profile.username}</b>&nbsp;·&nbsp;Maker
        </div>
        {profile.bio?.trim() && <p className={styles.bio}>{profile.bio.trim()}</p>}

        {(primaryLink || instagram) && (
          <div className={styles.links}>
            {primaryLink && (
              <a
                className={`${styles.lk} ${styles.primary}`}
                href={primaryLink}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                <LinkGlyph url={primaryLink} />
                {primaryLinkLabel(primaryLink)}
              </a>
            )}
            {instagram && (
              <a
                className={`${styles.lk} ${styles.ghost}`}
                href={instagram}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                </svg>
                Instagram
              </a>
            )}
          </div>
        )}
      </div>

      <div className={styles.stats}>
        <span className={`${styles.st} ${styles.stOn}`}>
          <b>{publishedCount}</b> {publishedCount === 1 ? 'tile' : 'tiles'}
        </span>
        {makerSince && (
          <span className={styles.st}>
            Maker since <b>{makerSince}</b>
          </span>
        )}
      </div>

      <div className={styles.gallery}>
        <MakerGallery
          tiles={galleryTiles}
          makerName={name}
          isSignedIn={!!user}
          shareUrl={shareUrl}
        />
      </div>

      <div className={styles.footer}>
        Made with <Link href="/">Imperium</Link>. Build your own dashboard.
      </div>
    </div>
  )
}

/** A YouTube glyph for YT links, a generic link glyph otherwise. */
function LinkGlyph({ url }: { url: string }) {
  const isYouTube = /youtube\.com|youtu\.be/.test(url)
  if (isYouTube) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M23 12s0-3.6-.46-5.3a2.78 2.78 0 0 0-1.94-1.96C18.88 4.27 12 4.27 12 4.27s-6.88 0-8.6.47A2.78 2.78 0 0 0 1.46 6.7C1 8.4 1 12 1 12s0 3.6.46 5.3a2.78 2.78 0 0 0 1.94 1.96c1.72.47 8.6.47 8.6.47s6.88 0 8.6-.47a2.78 2.78 0 0 0 1.94-1.96C23 15.6 23 12 23 12ZM9.8 15.3V8.7l5.7 3.3Z" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
    </svg>
  )
}
