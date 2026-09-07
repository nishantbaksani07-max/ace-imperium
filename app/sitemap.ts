import type { MetadataRoute } from 'next'
import { createClient } from '@/lib/supabase/server'
import { PUBLIC_FEATURED_TILES } from '@/lib/tiles/featured'

/**
 * sitemap.xml for Vitality, served by Next.js at /sitemap.xml.
 *
 * Lists the public, indexable surfaces so shared Pillar-3 links (Arts District
 * drops and maker profiles) get discovered and ranked. Two kinds of entries:
 *
 *   Static  the fixed public routes (home, district, makers, pricing, auth).
 *   Dynamic one /u/<username> per creator profile (anon read of
 *           creator_profiles) and one /district/<id> per featured tile.
 *
 * GRACEFUL DEGRADE: the dynamic reads are wrapped so any DB error, missing
 * table, or missing env just yields no extra rows. The static routes always
 * ship. This function never throws at build or request time.
 *
 * Base URL: NEXT_PUBLIC_SITE_URL when set (Vercel prod), else the known prod
 * host, so every <loc> is absolute.
 */
const BASE = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '')

/** Row shape from creator_profiles. Public read (RLS: select using true). */
interface CreatorProfileRow {
  username: string | null
  updated_at?: string | null
  created_at?: string | null
}

/**
 * Every public maker profile as a /u/<username> entry. Anon Supabase client
 * only. Any failure (missing table, RLS, no env, network) resolves to [] so
 * the sitemap still emits its static routes.
 */
async function makerProfileEntries(now: Date): Promise<MetadataRoute.Sitemap> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('creator_profiles')
      .select('username, updated_at, created_at')
    if (error || !data) return []

    return (data as CreatorProfileRow[]).flatMap((row) => {
      const username = row.username?.trim()
      if (!username) return []
      const lastModified = row.updated_at || row.created_at || now
      return [
        {
          url: `${BASE}/u/${encodeURIComponent(username)}`,
          lastModified: new Date(lastModified),
          changeFrequency: 'weekly' as const,
          priority: 0.6,
        },
      ]
    })
  } catch {
    return []
  }
}

/**
 * Every curated Arts District drop as a /district/<id> entry. Sourced from the
 * static FEATURED_TILES catalog (no DB), so this is pure and cannot throw, but
 * it is still guarded for symmetry and future-proofing.
 */
function featuredTileEntries(now: Date): MetadataRoute.Sitemap {
  try {
    return PUBLIC_FEATURED_TILES.flatMap((tile) => {
      const id = tile.id?.trim()
      if (!id) return []
      return [
        {
          url: `${BASE}/district/${encodeURIComponent(id)}`,
          lastModified: now,
          changeFrequency: 'weekly' as const,
          priority: 0.7,
        },
      ]
    })
  } catch {
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  // Fixed public routes. The home page and the two Pillar-3 galleries lead,
  // pricing and the auth doorways round it out.
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE}/district`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE}/makers`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${BASE}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/login`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/signup`, lastModified: now, changeFrequency: 'yearly', priority: 0.5 },
  ]

  // Dynamic entries degrade to none independently; a failure in one never
  // drops the other or the static routes.
  const [makers] = await Promise.all([makerProfileEntries(now)])
  const featured = featuredTileEntries(now)

  return [...staticEntries, ...featured, ...makers]
}
