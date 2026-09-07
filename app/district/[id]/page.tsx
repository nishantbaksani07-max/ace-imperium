import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PUBLIC_FEATURED_TILES } from '@/lib/tiles/featured'
import { designByKey } from '@/lib/tiles/designs'
import type { TileEnvelope } from '@/lib/tiles/types'
import TileDetail from './TileDetail'

/**
 * A public, linkable detail page for a SINGLE Arts District tile: /district/[id].
 * Built so one tile can be shared on its own URL (YouTube, X, a link in bio) with
 * a proper title + OpenGraph card, then added in one tap. NOT under app/app/, so
 * it inherits no dashboard auth wall (same public-read precedent as
 * app/u/[username] and app/district). Anon server client only, RLS-safe.
 *
 * The [id] resolves two ways:
 *   1. A FEATURED_TILES entry by its stable shop id (always compiled in).
 *   2. If it looks like a uuid, an APPROVED published_tiles row read with the
 *      anon server client under RLS (status='approved' only). creator_profiles is
 *      joined app-side (a Map), never a SQL join, mirroring app/district/page.tsx.
 *
 * If neither resolves, or published_tiles is absent (not on prod yet), the
 * loader swallows the error and the page notFound()s. The poster SVG comes ONLY
 * from designByKey (a recolorable design face); envelope.html is NEVER rendered
 * here, it only travels to importTile on a logged-in Add.
 */

/** The resolved subject of a detail page, normalized across both sources. */
export interface DetailTile {
  /** 'featured' = compiled-in shop id; 'published' = a published_tiles uuid. */
  source: 'featured' | 'published'
  /** The stable id used by the Add funnel + the pending-tile stash. */
  id: string
  name: string
  tagline: string
  /** Byline: 'Vitality' for first-party, '@handle' (or a fallback) for community. */
  byline: string
  category: string
  /** Card accent hex (mint by default). Recolors the design SVG. */
  accent?: string
  /** The design key whose SVG poster we render (via designByKey). */
  design?: string
  /** The install envelope handed to tileStore.importTile on a logged-in Add. */
  envelope: TileEnvelope
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A featured shop entry as a DetailTile, or null if this id is not featured. */
function featuredById(id: string): DetailTile | null {
  const f = PUBLIC_FEATURED_TILES.find((t) => t.id === id)
  if (!f) return null
  return {
    source: 'featured',
    id: f.id,
    name: f.envelope.name,
    tagline: f.tagline,
    byline: f.author,
    category: f.envelope.category ?? 'Tile',
    accent: f.accent,
    design: f.envelope.design,
    envelope: f.envelope,
  }
}

/**
 * An approved community tile as a DetailTile. Anon server client under RLS
 * (status='approved' only). The creator handle is a second query, joined
 * app-side via a Map (never a SQL join), exactly like app/district/page.tsx.
 * A missing table, an RLS reject, or any thrown error resolves to null so the
 * page degrades to notFound() rather than surfacing an error. This is the
 * graceful-degrade gate: published_tiles is not on prod yet.
 */
async function publishedById(id: string): Promise<DetailTile | null> {
  try {
    const supabase = createClient()
    const { data: row, error } = await supabase
      .from('published_tiles')
      .select('id, name, envelope, creator_id')
      .eq('id', id)
      .eq('status', 'approved')
      .maybeSingle()
    if (error || !row) return null

    let handle: string | null = null
    if (row.creator_id) {
      const { data: prof } = await supabase
        .from('creator_profiles')
        .select('username')
        .eq('user_id', row.creator_id as string)
        .maybeSingle()
      handle = (prof?.username as string | undefined) ?? null
    }

    const envelope = row.envelope as TileEnvelope
    return {
      source: 'published',
      id: row.id as string,
      name: row.name as string,
      tagline: 'A tile from the Vitality community, free to add.',
      byline: handle ? `@${handle}` : 'a Vitality maker',
      category: envelope.category ?? 'Tile',
      accent: envelope.color || undefined,
      design: envelope.design,
      envelope,
    }
  } catch {
    // Table absent / anything unexpected: resolve to null → notFound().
    return null
  }
}

/** Resolve an id to its DetailTile: featured first, then (if uuid) published. */
async function resolveTile(id: string): Promise<DetailTile | null> {
  const decoded = decodeURIComponent(id)
  const featured = featuredById(decoded)
  if (featured) return featured
  if (UUID_RE.test(decoded)) return publishedById(decoded)
  return null
}

interface Props {
  params: { id: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tile = await resolveTile(params.id)
  if (!tile) return { title: 'Tile not found | Vitality' }

  const title = `${tile.name} | Vitality Arts District`
  const description = `${tile.tagline} Add ${tile.name} to your Vitality dashboard in one tap. By ${tile.byline}.`
  return {
    title,
    description,
    openGraph: {
      title: `${tile.name} | Vitality`,
      description: tile.tagline,
      url: `/district/${tile.id}`,
      siteName: 'Vitality',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${tile.name} | Vitality`,
      description: tile.tagline,
    },
  }
}

export default async function TileDetailPage({ params }: Props) {
  const tile = await resolveTile(params.id)
  if (!tile) notFound()

  const design = designByKey(tile.design)
  return <TileDetail tile={tile} svg={design?.svg ?? null} />
}
