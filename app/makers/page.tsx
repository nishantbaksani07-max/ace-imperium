import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import styles from './makers.module.css'

// Public directory: always render fresh (no maker gets stale) and never
// pre-render at build time (the tables may not exist in every environment).
export const dynamic = 'force-dynamic'

const TITLE = 'Makers · Vitality'
const DESCRIPTION =
  'The people building tiles for Vitality. Each maker has a page and a link, and every tile they publish is free to add to your own dashboard.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
  },
}

interface CreatorRow {
  user_id: string
  username: string
  bio: string | null
  link_url: string | null
}

interface Maker {
  username: string
  bio: string | null
  link: string | null
  tileCount: number
}

/**
 * Every maker's public profile. RLS on creator_profiles is public-read (select
 * using true), so the anon server client sees them all. A missing table or any
 * error degrades to [] so the page renders a calm empty state, never a crash.
 */
async function loadCreators(): Promise<CreatorRow[]> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('creator_profiles')
      .select('user_id, username, bio, link_url')
    if (error || !data) return []
    return data as CreatorRow[]
  } catch {
    return []
  }
}

/**
 * A map of creator_id -> approved-tile count. RLS on published_tiles lets anon
 * read APPROVED rows only, so selecting creator_id under status='approved' is
 * inherently the public, approved-only set. We tally in memory (one read, not
 * one query per maker). A missing table or any error degrades to an empty map.
 */
async function loadApprovedCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('published_tiles')
      .select('creator_id')
      .eq('status', 'approved')
    if (error || !data) return counts
    for (const row of data as { creator_id: string }[]) {
      counts.set(row.creator_id, (counts.get(row.creator_id) ?? 0) + 1)
    }
    return counts
  } catch {
    return counts
  }
}

/** A normalized, safe external link, or null if it does not look like a URL. */
function safeLink(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

/** The bare host of a link, for a quiet, readable label. */
function linkLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Link'
  }
}

export default async function MakersPage() {
  const [creators, counts] = await Promise.all([loadCreators(), loadApprovedCounts()])

  const makers: Maker[] = creators
    .map((c) => ({
      username: c.username,
      bio: c.bio?.trim() || null,
      link: safeLink(c.link_url),
      tileCount: counts.get(c.user_id) ?? 0,
    }))
    // Most-published first, then alphabetical by handle for a stable order.
    .sort((a, b) => b.tileCount - a.tileCount || a.username.localeCompare(b.username))

  return (
    <div className={styles.page}>
      <div className={styles.glow} aria-hidden />

      <div className={styles.bar}>
        <Link href="/" className={styles.mark} aria-label="Vitality">V</Link>
        <span className={styles.barSpacer} />
        <Link href="/" className={styles.barCta}>Make your own</Link>
      </div>

      <header className={styles.head}>
        <div className={styles.kicker}>Arts District</div>
        <h1 className={styles.title}>Makers</h1>
        <p className={styles.lede}>
          The people building tiles for Vitality. Every tile they publish is free to add to your own dashboard.
        </p>
      </header>

      <main className={styles.body}>
        {makers.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyLine}>No makers yet.</div>
            <div className={styles.emptySub}>The first maker pages will appear here soon.</div>
          </div>
        ) : (
          <div className={styles.grid}>
            {makers.map((m) => (
              <Link key={m.username} href={`/u/${m.username}`} className={styles.card}>
                <div className={styles.handle}>@{m.username}</div>
                {m.bio && <p className={styles.bio}>{m.bio}</p>}
                <div className={styles.foot}>
                  <span className={styles.count}>
                    <b>{m.tileCount}</b>&nbsp;{m.tileCount === 1 ? 'tile' : 'tiles'}
                  </span>
                  {m.link && <span className={styles.link}>{linkLabel(m.link)}</span>}
                  <span className={styles.arrow} aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14" />
                      <path d="m13 6 6 6-6 6" />
                    </svg>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      <div className={styles.footer}>
        Made with <Link href="/">Vitality</Link>. Build your own dashboard.
      </div>
    </div>
  )
}
