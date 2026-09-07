import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { PUBLIC_FEATURED_TILES, FEATURED_CATEGORIES } from '@/lib/tiles/featured'
import type { TileEnvelope } from '@/lib/tiles/types'
import DistrictGallery from './DistrictGallery'

/**
 * The public Arts District front door (Pillar 3). A routable, linkable gallery a
 * logged-OUT visitor can browse and one-tap-add. It is NOT under app/app/, so it
 * does not inherit the dashboard auth wall; the middleware allowlist is a
 * protected list (/app, /account, /welcome, /onboarding) that /district is not
 * on, so it renders logged out by default. Same public-read mechanism as
 * app/u/[username]/page.tsx.
 *
 * Featured is the compiled-in FEATURED_TILES catalog (always present). Community
 * is the approved slice of published_tiles, read with the anon client under RLS.
 * That table is not on prod yet, so loadCommunity() swallows every error to [] and
 * the community section is simply hidden when empty. The page must be perfect
 * without it.
 */

export const metadata: Metadata = {
  title: 'Arts District | Vitality',
  description:
    'Browse the Vitality Arts District. Add beautiful, useful dashboard tiles built by us and the community in one tap. No setup.',
  openGraph: {
    title: 'Arts District | Vitality',
    description:
      'A gallery of dashboard tiles you can add to your Vitality in one tap. Built by us and the community.',
    url: '/district',
    siteName: 'Vitality',
    type: 'website',
  },
}

/** A community-published tile (Arts District v3), credited to its maker. */
export interface CommunityTile {
  id: string
  name: string
  envelope: TileEnvelope
  handle: string | null
}

/**
 * The approved community drops for the public gallery. Read with the anon server
 * client under RLS (status='approved' only). Two queries joined app-side via a
 * Map, exactly like the gated overlay, never a SQL join. A missing table, an RLS
 * reject, or any thrown error all resolve to [] so the page degrades to
 * featured-only with no error and no console noise. This is the graceful-degrade
 * gate: published_tiles is not on prod yet.
 */
async function loadCommunity(): Promise<CommunityTile[]> {
  try {
    const supabase = createClient()
    const { data: rows, error } = await supabase
      .from('published_tiles')
      .select('id, name, envelope, creator_id')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(60)
    if (error || !rows) return []
    const creatorIds = [...new Set(rows.map((r) => r.creator_id as string))]
    const { data: profs } = creatorIds.length
      ? await supabase
          .from('creator_profiles')
          .select('user_id, username')
          .in('user_id', creatorIds)
      : { data: [] as { user_id: string; username: string }[] }
    const handleByUser = new Map((profs ?? []).map((p) => [p.user_id, p.username]))
    return rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      envelope: r.envelope as TileEnvelope,
      handle: handleByUser.get(r.creator_id as string) ?? null,
    }))
  } catch {
    // Table absent / anything unexpected: featured-only, page still perfect.
    return []
  }
}

export default async function DistrictPage() {
  const community = await loadCommunity()

  return (
    <DistrictGallery
      featured={PUBLIC_FEATURED_TILES}
      categories={FEATURED_CATEGORIES}
      community={community}
    />
  )
}
