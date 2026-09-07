import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FEATURED_COLLECTIONS, tilesForCollection } from '@/lib/tiles/featured'
import { designByKey } from '@/lib/tiles/designs'
import type { TileEnvelope } from '@/lib/tiles/types'
import SetDetail from './SetDetail'

/**
 * A public, linkable page for ONE curated collection: /district/set/[slug].
 * The shareable "starter dashboard in a box": a whole themed set of featured
 * tiles behind a single URL (YouTube description, X, link in bio), added in one
 * tap. NOT under app/app/, so it inherits no dashboard auth wall (same public
 * precedent as /district and /district/[id]).
 *
 * 100 percent compiled-in: the slug resolves against FEATURED_COLLECTIONS and
 * tilesForCollection (lib/tiles/featured.ts). No Supabase read anywhere on this
 * route, so it renders for logged-out visitors and works on prod regardless of
 * which tables exist. Poster SVGs come ONLY from designByKey (recolorable design
 * faces); envelope.html is NEVER rendered here, it only travels to importTile on
 * a logged-in Add.
 *
 * The static `set/` segment outranks the sibling /district/[id] dynamic route in
 * Next, so there is no collision (bare /district/set falls into [id] and
 * notFound()s, which is fine).
 */

/** One tile of the set, flattened for the client: display fields + the resolved
 *  poster SVG + the install envelope the Add funnel hands to importTile. */
export interface SetTile {
  /** The stable featured shop id (also the pending-tile stash id). */
  id: string
  name: string
  tagline: string
  category: string
  /** Card accent hex (mint by default). Recolors the design SVG via CSS color. */
  accent?: string
  /** The recolorable design poster SVG (from designByKey), or null. */
  svg: string | null
  envelope: TileEnvelope
}

interface Props {
  params: { slug: string }
}

function collectionBySlug(slug: string) {
  const decoded = decodeURIComponent(slug)
  return FEATURED_COLLECTIONS.find((c) => c.id === decoded) ?? null
}

/** The four curated sets are known at build time; prerender them. Unknown slugs
 *  still resolve at request time and notFound(). */
export function generateStaticParams() {
  return FEATURED_COLLECTIONS.map((c) => ({ slug: c.id }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = collectionBySlug(params.slug)
  if (!c) return { title: 'Set not found | Vitality' }
  const n = tilesForCollection(c.id).length
  const title = `${c.title} | Vitality Arts District`
  const description = `${c.blurb} ${n} tiles, one tap.`
  return {
    title,
    description,
    openGraph: {
      title: `${c.title} | Vitality`,
      description: `${c.blurb} ${n} tiles, one tap.`,
      url: `/district/set/${c.id}`,
      siteName: 'Vitality',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${c.title} | Vitality`,
      description: `${c.blurb} ${n} tiles, one tap.`,
    },
  }
}

export default function SetPage({ params }: Props) {
  const c = collectionBySlug(params.slug)
  if (!c) notFound()
  const featured = tilesForCollection(c.id)
  if (featured.length === 0) notFound()

  const tiles: SetTile[] = featured.map((f) => ({
    id: f.id,
    name: f.envelope.name,
    tagline: f.tagline,
    category: f.envelope.category ?? 'Tile',
    accent: f.accent,
    svg: designByKey(f.envelope.design)?.svg ?? null,
    envelope: f.envelope,
  }))

  return <SetDetail slug={c.id} title={c.title} blurb={c.blurb} tiles={tiles} />
}
