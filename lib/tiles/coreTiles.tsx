import type { ReactNode } from 'react'
import type { TileSize } from './tileSkin'
import type { DashboardTileStats } from '@/lib/vitality/dashboardStats'

/**
 * The core tiles are Vitality's pre-installed apps (Train, Fuel, Vitals, Peak,
 * Brand, Finance). On the fused dashboard they live in the SAME grid as
 * a user's own built tiles, so they can be dragged, resized, removed, and
 * re-added from the library just like any tile. This registry is the static
 * source of truth for each one: its route, index, label, glyph, the bespoke
 * animated orb art, the animation data-attributes, and a default size.
 *
 * Vee is intentionally NOT in this list. Vee is the locked centrepiece, rendered
 * by its own component (it carries the live score, the wire feeds, the ring
 * pulse). It can never be dragged or removed. See VEE_TILE below + DashboardGrid.
 *
 * The art SVGs use the default preserveAspectRatio (meet), so they scale without
 * distortion as a tile is resized; the orb animation in veeTilesAnim.ts reads
 * path geometry in viewBox coordinates, so the living orbs keep tracking their
 * path at any tile size.
 *
 * Every orb <g> ALSO carries a static `transform="translate(cx cy)"` placing it
 * on its art at rest. This is load-bearing, not decoration: veeTilesAnim positions
 * the orb imperatively, and if that placement hasn't run at paint time (effect
 * timing) or is skipped (an error in the Vee-centre loop), an orb with no static
 * transform falls back to viewBox (0,0) — the tile's top-left corner — where
 * overflow:hidden clips it into a "glitching off the tile" sliver. The static
 * rest point makes the orb correct with zero JS; the animation just takes over
 * from there. (Library already did this on its own orb; every tile now does.)
 */

export type CoreTileId =
  | 'train'
  | 'fuel'
  | 'vitals'
  | 'peak'
  | 'brand'
  | 'finance'

/** A single live metric to surface on a tile (Train day, Fuel kcal). */
export interface CoreStat {
  value: string
  unit: string
}

export interface CoreTile {
  id: CoreTileId
  href: string
  /** Corner index label, e.g. "01". */
  index: string
  /** Bottom-left tile title. */
  label: string
  /** Extra tile classes: 'live' = graph tile (metric on the title baseline),
   *  'fin' = finance gold accent. */
  variant?: string
  /** Animation hooks consumed by veeTilesAnim.ts. */
  orb?: { mode?: string; roam?: string; pt?: string }
  /** The top-right glyph. */
  glyph: ReactNode
  /** The animated orb art layer (the .art SVG contents). */
  art: ReactNode
  /** Default size on a fresh dashboard (matches the approved customize mockup). */
  defaultSize: TileSize
  /** Resolve this tile's one glanceable live stat, or null to show none. */
  stat?: (stats: DashboardTileStats) => CoreStat | null
}

export const CORE_TILES: Record<CoreTileId, CoreTile> = {
  train: {
    id: 'train',
    href: '/app/fitness/log',
    index: '01',
    label: 'Train',
    variant: 'live',
    orb: { mode: 'wander' },
    defaultSize: 'hero',
    glyph: (
      <svg viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <rect x="-10" y="-3" width="2.8" height="6" rx="0.6" strokeWidth="1.3" />
        <rect x="7.2" y="-3" width="2.8" height="6" rx="0.6" strokeWidth="1.3" />
        <line x1="-7.2" y1="0" x2="7.2" y2="0" strokeWidth="1.3" />
      </svg>
    ),
    art: (
      <svg className="art" viewBox="0 0 658 118">
        <path className="mot" d="M44 66 L180 54 L300 60 L440 37 L530 45 L616 27" />
        <g className="orb" transform="translate(300 60)"><circle className="glow" r="10" /><circle className="node" r="3.4" /></g>
      </svg>
    ),
    stat: (s) => (s.trainDay ? { value: s.trainDay, unit: 'day' } : null),
  },
  fuel: {
    id: 'fuel',
    href: '/app/fuel',
    index: '02',
    label: 'Fuel',
    orb: { mode: 'wander' },
    defaultSize: 'tall',
    glyph: (
      <svg viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
        <path d="M0 -10 C0 -10 -7 -2 -7 3 a7 7 0 0 0 14 0 C7 -2 0 -10 0 -10 Z" />
      </svg>
    ),
    art: (
      <svg className="art" viewBox="0 0 210 250">
        <path className="mot" d="M46 110 Q82 94 106 110 T168 110" />
        <path className="motd" d="M46 132 Q82 116 106 132 T168 132" />
        <g className="orb" transform="translate(106 110)"><circle className="glow" r="10" /><circle className="node" r="3.4" /></g>
      </svg>
    ),
    stat: (s) =>
      s.fuelKcalToday != null
        ? { value: s.fuelKcalToday.toLocaleString('en-US'), unit: 'kcal' }
        : null,
  },
  vitals: {
    id: 'vitals',
    href: '/app/vitals',
    index: '04',
    label: 'Vitals',
    variant: 'live',
    orb: { mode: 'wander' },
    defaultSize: 's',
    glyph: (
      <svg viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
        <path d="M-10 0 L-5 0 L-2 -7 L2 7 L5 0 L10 0" />
      </svg>
    ),
    art: (
      <svg className="art" viewBox="0 0 210 118">
        <path className="mot" d="M38 47 L74 47 L89 27 L104 70 L119 47 L172 47" />
        <g className="orb" transform="translate(104 70)"><circle className="glow" r="8" /><circle className="node" r="3.2" /></g>
      </svg>
    ),
  },
  peak: {
    id: 'peak',
    href: '/app/peak',
    index: '03',
    label: 'Peak',
    orb: { mode: 'still', roam: 'ring', pt: '105,125' },
    defaultSize: 'tall',
    glyph: (
      <svg viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
        <path d="M2 -10 L-5 1 L0 1 L-2 10 L5 -1 L0 -1 L2 -10 Z" />
      </svg>
    ),
    art: (
      <svg className="art" viewBox="0 0 210 250">
        <circle className="mot" cx="105" cy="125" r="40" />
        <g className="orb" transform="translate(105 125)"><circle className="glow" r="12" /><circle className="node" r="3.4" /></g>
      </svg>
    ),
  },
  brand: {
    id: 'brand',
    href: '/app/brand',
    index: '05',
    label: 'Brand',
    orb: { mode: 'still', roam: 'spoke', pt: '105,112' },
    defaultSize: 'tall',
    glyph: (
      <svg viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
        <path d="M-8 -5 L0 9 L8 -5" />
      </svg>
    ),
    art: (
      <svg className="art" viewBox="0 0 210 250">
        <g style={{ opacity: 0.65 }}>
          <line className="motd" x1="105" y1="112" x2="105" y2="68" /><line className="motd" x1="105" y1="112" x2="145" y2="90" />
          <line className="motd" x1="105" y1="112" x2="145" y2="134" /><line className="motd" x1="105" y1="112" x2="65" y2="134" />
          <line className="motd" x1="105" y1="112" x2="65" y2="90" />
        </g>
        <g className="orb" transform="translate(105 112)"><circle className="glow" r="10" /><circle className="node" r="3.4" /></g>
      </svg>
    ),
  },
  finance: {
    id: 'finance',
    href: '/app/finance',
    index: '07',
    label: 'Finance',
    variant: 'fin',
    orb: { mode: 'hop' },
    defaultSize: 'm',
    glyph: (
      <svg viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
        <path d="M-9 6 L-3 0 L2 5 L9 -4" /><path d="M4 -4 L9 -4 L9 1" />
      </svg>
    ),
    art: (
      <svg className="art" viewBox="0 0 434 118">
        <g style={{ opacity: 0.8 }}>
          <line className="mot" x1="190" y1="50" x2="190" y2="88" /><rect className="candle" x="184" y="58" width="12" height="20" rx="2" />
          <line className="mot" x1="252" y1="44" x2="252" y2="84" /><rect className="candle" x="246" y="51" width="12" height="23" rx="2" />
          <line className="mot" x1="314" y1="36" x2="314" y2="78" /><rect className="candle" x="308" y="43" width="12" height="25" rx="2" />
          <line className="mot" x1="376" y1="26" x2="376" y2="70" /><rect className="candle" x="370" y="33" width="12" height="27" rx="2" />
        </g>
        <g className="orb" transform="translate(252 44)"><circle className="glow" r="9" /><circle className="node" r="3.4" /></g>
      </svg>
    ),
  },
}

/**
 * The Library descriptor. Like Vee, this is a special locked tile (NOT an href
 * CoreTile): tapping it opens the full-screen app-manager overlay, not a route.
 * It is always present on every dashboard and can never be removed. It still
 * drags, resizes, and can be re-designed in edit mode. Rendered by DashboardGrid
 * which reads this descriptor and the same glyph + animated orb art pattern as
 * the core tiles, so it sits in the grid looking native.
 */
export const LIBRARY_TILE = {
  id: 'library' as const,
  label: 'Library',
  index: '00',
  defaultSize: 'm' as TileSize,
  /** The living orb wanders the two shelf lines, exactly like the core tiles.
   *  Without this descriptor the tile emitted no `data-orb`, so veeTilesAnim never
   *  positioned the orb — it sat glowing at viewBox (0,0), a stray light clipped at
   *  the tile's top edge. With it, the orb tracks the shelf like its siblings. */
  orb: { mode: 'wander' },
  /** Top-right stacked-books glyph (open book, two facing leaves). */
  glyph: (
    <svg viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M0 -6 C-1.7 -7.4 -3.9 -8 -7 -7.5 L-7 7.5 C-3.9 8 -1.7 7.4 0 6" />
      <path d="M0 -6 C1.7 -7.4 3.9 -8 7 -7.5 L7 7.5 C3.9 8 1.7 7.4 0 6" />
      <line x1="0" y1="-6" x2="0" y2="6" />
    </svg>
  ),
  /** Animated orb art: the orb roams a gentle shelf line, matching core tiles. */
  art: (
    <svg className="art" viewBox="0 0 210 118">
      <path className="motd" d="M46 46 H164" />
      <path className="motd" d="M46 72 H164" />
      <g className="orb" transform="translate(105 59)"><circle className="glow" r="9" /><circle className="node" r="3.4" /></g>
    </svg>
  ),
}

/** Is this id the special locked Library tile? */
export const isLibraryId = (id: string) => id === LIBRARY_TILE.id

/**
 * The Create descriptor. A second always-on locked tile, the twin of Library: it
 * is the builder's front door. Where Library MANAGES your apps, Create BUILDS a
 * new one. Tapping it navigates to /app/create (the full-screen "Built by Vee"
 * tile builder) — so unlike Library it carries an `href` and rides the same
 * navigate-on-tap path as the core tiles, rather than opening an overlay. It is
 * seeded next to Library, backfilled onto any older dashboard, and can never be
 * removed. It still drags, resizes, and re-designs in edit mode. Rendered by
 * DashboardGrid from this descriptor with the same glyph + animated orb art
 * pattern as the core tiles, so it sits in the grid looking native.
 */
export const CREATE_TILE = {
  id: 'create' as const,
  href: '/app/create',
  label: 'Create',
  index: '08',
  defaultSize: 'm' as TileSize,
  /** Living orb rides a rising spark-trail, matching the core tiles' wander art. */
  orb: { mode: 'wander' },
  /** Top-right 4-point spark glyph: the "Built by Vee" build mark. */
  glyph: (
    <svg viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M0 -9 C0.7 -3.6 3.6 -0.7 9 0 C3.6 0.7 0.7 3.6 0 9 C-0.7 3.6 -3.6 0.7 -9 0 C-3.6 -0.7 -0.7 -3.6 0 -9 Z" />
    </svg>
  ),
  /** Animated orb art: the orb rides a rising spark-trail (a build / create sweep). */
  art: (
    <svg className="art" viewBox="0 0 210 118">
      <path className="mot" d="M40 88 Q104 92 128 58 T188 30" />
      <g className="orb" transform="translate(128 58)"><circle className="glow" r="9" /><circle className="node" r="3.4" /></g>
    </svg>
  ),
}

/** Is this id the special locked Create tile (the always-on builder front door)? */
export const isCreateId = (id: string) => id === CREATE_TILE.id

/**
 * The Forge descriptor. The storefront of the tile platform and the third
 * always-on locked tile beside Library (manage your apps) and Create (quick
 * bounded shapes). Forge is the BIG path: describe any idea in plain words
 * and Claude hand-builds the real thing through the Vitality MCP, landing
 * the finished tile back on this dashboard. Tapping it navigates to
 * /app/forge, so like Create it carries an `href` and rides the same
 * navigate-on-tap path as the core tiles. Seeded beside Create, backfilled
 * onto any older dashboard, never removable; still drags, resizes, and
 * re-designs in edit mode. Rendered by DashboardGrid from this descriptor
 * with the same glyph + animated orb art pattern as the core tiles.
 */
export const FORGE_TILE = {
  id: 'forge' as const,
  href: '/app/forge',
  label: 'Forge',
  /** The quiet mono line under the serif label (.forgeSub in veeTiles.css). */
  sub: 'built with Claude',
  index: '09',
  defaultSize: 'm' as TileSize,
  /** The living orb climbs the ember arc, matching the core tiles' wander art. */
  orb: { mode: 'wander' },
  /** Top-right hammer glyph: the forge strike. */
  glyph: (
    <svg viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M-3 -5 L1 -9 L9 -1 L5 3 Z" />
      <line x1="1" y1="-1" x2="-9" y2="9" />
    </svg>
  ),
  /** Animated orb art: an ember arc rising off the hearth line, with three
   *  four-point sparks that breathe (.fspark keyframes, transform/opacity
   *  only). Each spark's PLACEMENT transform lives on its wrapping <g> so the
   *  CSS breathing animation on the path can never clobber it. */
  art: (
    <svg className="art" viewBox="0 0 210 118">
      <path className="motd" d="M30 98 H96" />
      <path className="mot" d="M34 90 Q92 84 122 56 T186 26" />
      <g transform="translate(65 45) scale(0.55)">
        <path className="fspark" d="M12 3c.6 3.9 2.4 6.9 9 9c-6.6 2.1-8.4 5.1-9 9c-.6-3.9-2.4-6.9-9-9c6.6-2.1 8.4-5.1 9-9Z" />
      </g>
      <g transform="translate(123 33) scale(0.4)">
        <path className="fspark f2" d="M12 3c.6 3.9 2.4 6.9 9 9c-6.6 2.1-8.4 5.1-9 9c-.6-3.9-2.4-6.9-9-9c6.6-2.1 8.4-5.1 9-9Z" />
      </g>
      <g transform="translate(164 60) scale(0.3)">
        <path className="fspark f3" d="M12 3c.6 3.9 2.4 6.9 9 9c-6.6 2.1-8.4 5.1-9 9c-.6-3.9-2.4-6.9-9-9c6.6-2.1 8.4-5.1 9-9Z" />
      </g>
      <g className="orb" transform="translate(122 56)"><circle className="glow" r="9" /><circle className="node" r="3.4" /></g>
    </svg>
  ),
}

/** Is this id the special locked Forge tile (the Claude-builds-it storefront)? */
export const isForgeId = (id: string) => id === FORGE_TILE.id

/**
 * The "side project" tiles (launch strip, 2026-07-12). These are real, shipped
 * modules, but DE-CORED for launch: demoted off the default dashboard and
 * disconnected from Vee's proactive surfaces (the Noticed seam in lib/vee/
 * tileRefs.ts and the graph library / Core Room). They live on the Library's
 * "Side projects" shelf and re-place onto any board with one tap. Create (the
 * no-AI quick builder) rides this shelf too. The single source of truth so the
 * Library, the seam, and any future gate can never disagree about what counts
 * as core vs. a side project.
 *
 * Finance is deliberately NOT here: it is a WORKING module that fully feeds Vee
 * (seam + goal levers), so it stays a core tile on the dashboard (Alex, 2026-07-12).
 * Peak / Brand / Create are the demoted "does not work yet" trio.
 */
export const SIDE_PROJECT_IDS = new Set<string>(['peak', 'brand', 'create'])

/** Is this id a de-cored "side project" tile (Peak / Brand / Finance / Create)? */
export const isSideProjectId = (id: string) => SIDE_PROJECT_IDS.has(id)

/** The Vee centrepiece descriptor. Vee is locked: never draggable or removable. */
export const VEE_TILE = {
  id: 'vee' as const,
  href: '/app/mentor',
  index: '06',
  label: 'Vee',
  kicker: 'Your AI mentor',
}

export type HomeTileId = CoreTileId | 'vee' | 'library' | 'create' | 'forge'

/**
 * The default home order on a fresh dashboard - THE LAUNCH SPINE (Alex,
 * 2026-07-11): a health-first board a new user can hold in one look. Train the
 * wide hero, Fuel tall, Library the always-on apps shelf, Forge the storefront,
 * Vitals the daily signal, Finance the working money tile, Vee the 2x2 centre.
 * Brand / Peak / Create are DE-CORED, not deleted: they live on in the Library
 * ("In your library", the side-projects shelf) and re-place with one tap.
 * Finance stays core (2026-07-12): it fully feeds Vee, so it earns the board.
 * Existing boards are
 * untouched - getOrder never rewrites a stored order, it only backfills the
 * locked Library + Forge. Every tile drags, resizes, and can be removed
 * (except the locked Library + Forge). User-built tiles append.
 */
export const DEFAULT_HOME_ORDER: HomeTileId[] = [
  'train',
  'fuel',
  'library',
  'forge',
  'vitals',
  'finance',
  'vee',
]

/** Is this id one of the pre-installed core tiles (incl. Vee)? */
export function isCoreId(id: string): id is CoreTileId | 'vee' {
  return id === 'vee' || id in CORE_TILES
}

/** Is this id any home tile (a core tile, Vee, or the locked Library / Create / Forge)? */
export const isHomeId = (id: string): id is HomeTileId =>
  isLibraryId(id) || isCreateId(id) || isForgeId(id) || isCoreId(id)

/** Default size for any home tile id. Vee defaults to the 2x2 centrepiece. */
export function coreDefaultSize(id: HomeTileId): TileSize {
  if (id === 'vee') return 'big'
  if (id === 'library') return LIBRARY_TILE.defaultSize
  if (id === 'create') return CREATE_TILE.defaultSize
  if (id === 'forge') return FORGE_TILE.defaultSize
  return CORE_TILES[id].defaultSize
}
