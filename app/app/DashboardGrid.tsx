'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, arrayMove, defaultAnimateLayoutChanges, type AnimateLayoutChanges } from '@dnd-kit/sortable'
import type { Tile, TileEnvelope } from '@/lib/tiles/types'
import { createClient } from '@/lib/supabase/client'
import { REPORT_KEY as STUDIO_REPORT_KEY } from '@/lib/studio/types'
import { tileStore } from '@/lib/tiles/tileStore'
import { pullAndMerge, pushTile, deleteServerTile } from '@/lib/tiles/tileSync'
import { tileDataSync } from '@/lib/tiles/tileDataSync'
import { pullLayout, pushLayout } from '@/lib/tiles/boardSync'
import { exportTileCode } from '@/lib/tiles/share'
import { homeLayout } from '@/lib/tiles/homeLayout'
import { tileSkin, nextSize, SIZE_LABELS, TILE_SIZES, type TileSize, type Skin } from '@/lib/tiles/tileSkin'
import { footprintFor, packTiles, type PackedPos } from '@/lib/tiles/packLayout'
import { TILE_DESIGNS, DESIGN_COLORS, DESIGN_CATEGORIES, designByKey } from '@/lib/tiles/designs'
import { useTileHost } from '@/lib/tiles/useTileHost'
import { reportStream } from './create/reportActions'
import { CORE_TILES, VEE_TILE, LIBRARY_TILE, CREATE_TILE, FORGE_TILE, isCoreId, isLibraryId, isCreateId, isForgeId, coreDefaultSize, type CoreTile, type CoreStat } from '@/lib/tiles/coreTiles'
import Library from './Library'
import ArtsDistrict from './ArtsDistrict'
import PublishSheet from './PublishSheet'
import { FEATURED_TILES, isFirstPartyAiHtml, type FeaturedTile } from '@/lib/tiles/featured'
import { getPublishedEnvelope } from './publishActions'
import { initVeeTiles } from '@/components/veeTilesAnim'
import { animate } from '@/components/widgetMotion'
import {
  DEFAULT_CHROME,
  WALLPAPER_ACCENTS,
  GRADIENT_PRESETS,
  type Background,
  type DashboardChrome,
  type Greeting,
  type DateConfig,
  type GemConfig,
} from '@/lib/tiles/dashboardChrome'
import type { ScoreState } from '@/lib/vitality/score'
import type { DashboardTileStats } from '@/lib/vitality/dashboardStats'
import sheets from './customizableDashboard.module.css'

/** Dark solids for the Solid wallpaper mode (kept dark so labels stay legible). */
const SOLID_COLORS = ['#000000', '#070b0a', '#0a0f14', '#100a16', '#140d06', '#0c0c0e']

const MINT = '#6EE7B7'

/** A placed user tile is a POSTER on the grid (like a core tile): its design-art is
 *  its face. A freshly Kept tile has no chosen design, so it falls back to this
 *  clean, brand-neutral data design until the user picks one in the design sheet. */
const DEFAULT_USER_DESIGN = 'sparkline-end-dot'

/** The default face per report kind, so an unpicked custom tile's art matches
 *  what it tracks instead of every tile wearing the same weight-like line.
 *  The user can still pick any design in the sheet; this is only the floor. */
const KIND_DEFAULT_DESIGN: Record<string, string> = {
  count: 'streak-row',
  done: 'streak-row',
  intake: 'rep-bars',
  duration: 'focus-orbit',
  rating: 'mood-wave',
  measure: 'weight-trend',
  money: 'savings-stack',
}

/** A chosen widget design, rendered in a positioned parent and brought to life by
 *  the ported animate() — identical motion in the live tile, the picker gallery
 *  card, and the live preview. Recolors live via currentColor; living dots toggle
 *  via the .dots-off class (no re-animate needed). */
function DesignArt({
  dkey,
  svg,
  color,
  livingDots,
}: {
  dkey: string
  svg: string
  color: string | null
  livingDots: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) animate(ref.current, dkey)
  }, [dkey, svg])
  return (
    <div
      ref={ref}
      className={`wmArt${livingDots ? '' : ' dots-off'}`}
      style={{ color: color || MINT }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

interface DashboardGridProps {
  userId: string
  score: number | null
  scoreState: ScoreState
  tileStats: DashboardTileStats
  /** Founder viewer: the Arts District also shows founderOnly dogfood tiles. */
  isFounder?: boolean
  /** The themed chrome (wallpaper + greeting + date + gem), owned by Dashboard so
   *  the backdrop, header, and pickers all share one source. */
  chrome?: DashboardChrome
  onChromeChange?: (patch: Partial<DashboardChrome>) => void
}

/** The Vee centre art — wire feeds, ring pulse, the serif score. Animated by the
 *  .vee selectors in veeTilesAnim. Rendered inside an ordinary sortable tile now,
 *  so Vee drags, resizes, and can be removed like any other tile. */
function VeeArt() {
  return (
    <>
      <div className="disc" />
      <svg className="art" viewBox="0 0 434 250">
        <path className="wire" style={{ stroke: 'rgba(167,243,208,.2)' }} d="M216 66 V2" />
        <path className="wire" style={{ stroke: 'rgba(185,163,255,.2)' }} d="M262 96 H300 V40 H760" />
        <path className="wire" style={{ stroke: 'rgba(232,200,120,.2)' }} d="M262 140 H320 V192 H760" />
        <path className="wire" style={{ stroke: 'rgba(167,243,208,.2)' }} d="M190 158 V248" />
        <path className="wire" style={{ stroke: 'rgba(185,163,255,.2)' }} d="M170 140 H114 V192 H-326" />
        <path className="wire" style={{ stroke: 'rgba(232,200,120,.2)' }} d="M170 96 H134 V56 H-326" />
        <g className="feedgrp">
          <path className="feed" pathLength="100" d="M216 2 V66" />
          <path className="feed" pathLength="100" d="M760 40 H300 V96 H262" />
          <path className="feed" pathLength="100" d="M760 192 H320 V140 H262" />
          <path className="feed" pathLength="100" d="M190 248 V158" />
          <path className="feed" pathLength="100" d="M-326 192 H114 V140 H170" />
          <path className="feed" pathLength="100" d="M-326 56 H134 V96 H170" />
        </g>
        <rect className="chip" x="170" y="66" width="92" height="92" rx="24" />
        <g className="ringgrp">
          <rect className="ring-soft" x="170" y="66" width="92" height="92" rx="24" />
          <rect className="ring-line" x="170" y="66" width="92" height="92" rx="24" />
        </g>
        <g className="vgrp">
          <path className="v-base" d="M201 96 L216 129 L231 96" />
          <path className="vm" d="M201 96 L216 129 L231 96" />
        </g>
      </svg>
      <div className="scrim" />
    </>
  )
}

/* ───────────────────────── one sortable tile (core | user | vee) ───────────── */

type TileKind =
  | { kind: 'core'; core: CoreTile; stat: CoreStat | null }
  | {
      kind: 'user'
      tile: Tile
      /** Tapping the poster opens the tile full (its live sealed iframe runs only in
       *  the overlay, never in the grid cell), like a core tile navigating to its
       *  module. */
      onOpen: () => void
    }
  | { kind: 'vee'; score: number | null; scoreState: ScoreState }
  | { kind: 'library'; onOpen: () => void }
  /** The locked Create tile: taps navigate to the builder (via href), like a core tile. */
  | { kind: 'create' }
  /** The locked Forge tile: taps navigate to /app/forge, the Claude-builds-it storefront. */
  | { kind: 'forge' }

/* iOS-home-screen feel: always animate a tile settling into its new slot (and
   springing back when a drag is released without reordering), not just on drop.
   `wasDragging: true` tells dnd-kit to run the layout transition during the drag,
   so neighbours glide out of the way and back instead of snapping. */
const animateLayoutChanges: AnimateLayoutChanges = (args) =>
  defaultAnimateLayoutChanges({ ...args, wasDragging: true })

type SortableBits = {
  setNodeRef: (el: HTMLElement | null) => void
  attributes: ReturnType<typeof useSortable>['attributes']
  listeners: ReturnType<typeof useSortable>['listeners']
  style: CSSProperties
  isDragging: boolean
}

/** The Studio tile's live "shipped" hero number for its bespoke dashboard poster
 *  (Task 7b), read straight from the SAME tile_streams / tile_reports rows every
 *  sealed tile writes through Vitality.report({ key: 'videos_published' }); see
 *  lib/studio/report.ts + lib/tiles/reportWrites.ts. Scoped to the signed-in user
 *  via auth.getUser() (never trusted from props), matching every other client
 *  read in this file (tileSync.ts, tileDataSync.ts). Returns null while loading
 *  AND when the tile has never reported, so the poster never shows a fake count;
 *  callers must treat null as "omit the number", not "zero". */
function useStudioCount(tileId: string | null): number | null {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    if (!tileId) return
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || cancelled) return
      const { data: stream } = await supabase
        .from('tile_streams')
        .select('id')
        .eq('user_id', user.id)
        .eq('tile_id', tileId)
        .eq('key', STUDIO_REPORT_KEY)
        .maybeSingle()
      if (cancelled || !stream?.id) return
      const { data: report } = await supabase
        .from('tile_reports')
        .select('value')
        .eq('user_id', user.id)
        .eq('stream_id', stream.id)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle()
      const value = Number(report?.value)
      if (!cancelled && report && Number.isFinite(value)) setCount(value)
    })()
    return () => {
      cancelled = true
    }
  }, [tileId])
  return count
}

/* The tile's visual face. Rendered BOTH in the grid (SortableHomeTile feeds it the
   dnd-kit `sortable` bits) AND inside the DragOverlay (overlay = true, no sortable
   wiring) — so the lifted tile is pixel-identical to the slot it left behind. */
export function HomeTileFace(
  props: {
    id: string
    skin: Skin
    editing: boolean
    onResize: () => void
    onEdit: () => void
    onRemove: () => void
    overlay?: boolean
    sortable?: SortableBits
  } & TileKind,
) {
  const { skin, editing, onResize, onEdit, onRemove, overlay = false, sortable } = props
  const isDragging = sortable?.isDragging ?? false
  const design = designByKey(skin.design)
  // A user tile's poster face is its chosen design, or a KIND-MATCHED default
  // until picked. One shared line-chart default made every custom tile read as
  // "the weight tracker" on the board (Alex, 2026-07-11) - a habit tile now
  // wears streak dots, a money tile the savings stack, and only a true
  // measure wears the trend line.
  const userArt =
    props.kind === 'user'
      ? design ??
        designByKey(
          (props.tile.kind && KIND_DEFAULT_DESIGN[props.tile.kind]) ||
            (props.tile.kind ? DEFAULT_USER_DESIGN : 'journal-lines'),
        )
      : null

  // A custom widget design replaces a tile's own art. Core tiles default to their
  // bespoke animated orb art (and keep the living orb); user tiles to a
  // transparent iframe; Vee to its wire-feed centre.
  const isVee = props.kind === 'vee'
  const isLibrary = props.kind === 'library'
  const isCreate = props.kind === 'create'
  const isForge = props.kind === 'forge'
  // Task 7b: the Studio tile gets a bespoke poster gated ONLY on its design key;
  // every other tile (core/vee/library/user with any other design) is untouched.
  const isStudio = props.kind === 'user' && skin.design === 'studio-spark'
  const studioCount = useStudioCount(isStudio && props.kind === 'user' ? props.tile.id : null)
  const name =
    skin.name ||
    (props.kind === 'core'
      ? props.core.label
      : props.kind === 'vee'
        ? VEE_TILE.label
        : props.kind === 'library'
          ? LIBRARY_TILE.label
          : props.kind === 'create'
            ? CREATE_TILE.label
            : props.kind === 'forge'
              ? FORGE_TILE.label
              : props.tile.name)

  // A chosen accent recolors the whole tile (orb art retints via --mint).
  const tint = skin.color ? ({ ['--mint' as string]: skin.color }) : undefined

  // The lifted tile rides in the DragOverlay (see SortableHomeTile); this in-grid
  // face just recolors and composes whatever sortable style it is handed.

  const variant =
    (props.kind === 'core' ? props.core.variant : undefined) || (isVee ? 'vee' : undefined)
  // The living orb belongs to a core tile OR the Library tile (same animated art),
  // as long as no custom design has replaced the art. Emitting data-orb here is
  // what lets veeTilesAnim find + position the orb — without it the Library orb
  // was stranded at viewBox (0,0), a stray light clipped at the tile's top edge.
  const orb: { mode?: string; roam?: string; pt?: string } | undefined = design
    ? undefined
    : props.kind === 'core'
      ? props.core.orb
      : isLibrary
        ? LIBRARY_TILE.orb
        : isCreate
          ? CREATE_TILE.orb
          : isForge
            ? FORGE_TILE.orb
            : undefined
  const href = props.kind === 'core'
    ? props.core.href
    : isVee
      ? VEE_TILE.href
      : isCreate
        ? CREATE_TILE.href
        : isForge
          ? FORGE_TILE.href
          : undefined

  return (
    <div
      ref={sortable?.setNodeRef}
      data-size={skin.size}
      data-tid={overlay ? undefined : props.id}
      data-orb={overlay ? undefined : orb?.mode}
      data-roam={overlay ? undefined : orb?.roam}
      data-pt={overlay ? undefined : orb?.pt}
      className={`tile${variant ? ' ' + variant : ''}${overlay ? ' overlay' : ' editable'}${isDragging ? ' dragging' : ''}${isStudio ? ' is-studio' : ''}`}
      style={{ ...tint, ...(sortable?.style) }}
      {...(editing && sortable ? sortable.attributes : {})}
      {...(editing && sortable ? sortable.listeners : {})}
    >
      <div className="aurora" />

      {/* A user tile is a poster: its design-art is its face (its live app opens full
          on tap). Core/Library/Vee keep their bespoke art. */}
      {props.kind === 'user' ? (
        userArt && <DesignArt dkey={userArt.key} svg={userArt.svg} color={skin.color} livingDots={skin.livingDots} />
      ) : design ? (
        <DesignArt dkey={design.key} svg={design.svg} color={skin.color} livingDots={skin.livingDots} />
      ) : props.kind === 'core' ? (
        props.core.art
      ) : isLibrary ? (
        LIBRARY_TILE.art
      ) : isCreate ? (
        CREATE_TILE.art
      ) : isForge ? (
        FORGE_TILE.art
      ) : isVee ? (
        <VeeArt />
      ) : null}

      <span className="index">{props.kind === 'core' ? props.core.index : isVee ? VEE_TILE.index : isLibrary ? LIBRARY_TILE.index : isCreate ? CREATE_TILE.index : isForge ? FORGE_TILE.index : ''}</span>
      {props.kind === 'core' && <span className="glyph">{props.core.glyph}</span>}
      {isLibrary && <span className="glyph">{LIBRARY_TILE.glyph}</span>}
      {isCreate && <span className="glyph">{CREATE_TILE.glyph}</span>}
      {isForge && <span className="glyph">{FORGE_TILE.glyph}</span>}
      {isVee && <span className="kicker">{VEE_TILE.kicker}</span>}

      {isVee ? (
        <span className="label">{name}</span>
      ) : isStudio ? null : (
        <div className="cap">
          <span className="label">{name}</span>
          {props.kind === 'core' && props.stat && (
            <span className="stat">
              {props.stat.value}
              <i>{props.stat.unit}</i>
            </span>
          )}
          {isForge && <span className="forgeSub">{FORGE_TILE.sub}</span>}
        </div>
      )}
      {!isStudio && <span className="arrow">→</span>}

      {/* Task 7b: the Studio tile's bespoke small/dashboard face, matching Alex's
          canonical public/studio-tile-smallface.html: a mono kicker row, a live
          "shipped" hero number (Instrument Serif, real videos_published data,
          omitted entirely while loading or unreported, never a fake count), and a
          ghost-mint open glyph. Purely decorative (pointer-events:none in CSS);
          the actual tap target stays the existing full-cover .hit button below, so
          opening the tile is never broken by this overlay. Gated on isStudio, so
          no other tile's markup changes at all. */}
      {isStudio && (
        <div className="studioFace">
          <div className="spTop">
            <span className="spKicker">
              <span className="spDot" />
              STUDIO
            </span>
            <span className="spBadge">TRACKING</span>
          </div>
          {studioCount != null && (
            <div className="spHero">
              <b>{studioCount}</b>
              <span>shipped</span>
            </div>
          )}
          <span className="spOpen" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17L17 7" />
              <path d="M8 7h9v9" />
            </svg>
          </span>
        </div>
      )}

      {/* Click layer: navigate (core + Vee) when NOT editing. The locked Library
          tile opens the app-manager overlay instead of navigating. A user tile
          gets a tap target that opens it full (the locked "small on the grid,
          opens full" model), so long as NOT editing (so drag / resize / remove
          still work). */}
      {!overlay && !editing && href && <Link className="hit" href={href} aria-label={name} />}
      {!overlay && !editing && isLibrary && (
        <button type="button" className="hit" aria-label={name} onClick={props.onOpen} />
      )}
      {!overlay && !editing && props.kind === 'user' && (
        <button type="button" className="hit" aria-label={`Open ${name}`} onClick={props.onOpen} />
      )}

      {/* Controls stop BOTH pointerdown AND touchstart: the TouchSensor activates
          from touchstart, so without the touch stop a held control would lift
          the whole tile instead of pressing the button. */}
      {!overlay && editing && (
        <div className="ctrls">
          <button type="button" className="size" title="Resize" onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onClick={onResize}>
            {SIZE_LABELS[skin.size]}
          </button>
          <button type="button" className="edit" title="Design" aria-label="Design this tile" onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onClick={onEdit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
          </button>
          {/* The Library + Create + Forge tiles are always on: they drag, resize, and
              re-design in edit mode, but carry no remove control. */}
          {!isLibrary && !isCreate && !isForge && (
            <button type="button" className="del" title="Remove" aria-label="Remove this tile" onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onClick={onRemove}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* The in-grid tile: wires dnd-kit's sortable and hands the bits to HomeTileFace.
   With a DragOverlay carrying the lifted tile, the in-grid source just holds its
   slot as a calm dimmed placeholder (no translate/scale on it) while neighbours
   glide to open the drop gap — so the mixed-size dense grid no longer morphs,
   floats, or overlaps mid-drag. */
function SortableHomeTile(
  props: {
    id: string
    skin: Skin
    editing: boolean
    pos?: PackedPos
    onResize: () => void
    onEdit: () => void
    onRemove: () => void
  } & TileKind,
) {
  const { id, editing, pos } = props
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id,
    disabled: !editing,
    animateLayoutChanges,
    transition: null,
  })
  // Position comes from the pure packer (absolute cell placement via CSS calc on
  // these four vars); dnd-kit applies no transform of its own (strategy is a no-op).
  // The lifted tile rides in the DragOverlay while this in-grid source stays a
  // dimmed placeholder that glides to wherever it will land.
  const style: CSSProperties = {
    ['--x' as string]: pos?.x ?? 0,
    ['--y' as string]: pos?.y ?? 0,
    ['--w' as string]: pos?.w ?? 1,
    ['--h' as string]: pos?.h ?? 1,
    ...(isDragging ? { opacity: 0.32 } : null),
  }
  return (
    <HomeTileFace
      {...props}
      sortable={{ setNodeRef, attributes, listeners: editing ? listeners : undefined, style, isDragging }}
    />
  )
}

/* ───────────────────── open a user tile full (sealed overlay) ──────────────── */

/**
 * A user tile opened full: a scrim + a large centred frame holding the tile's
 * own sealed iframe, running live. This iframe is the ONLY registered window for
 * the tile while it is open (its grid cell renders a frozen placeholder), so
 * save / load / report keep working with no double host registration. The frame
 * captures its own tileId via the same register / unregister bridge, and
 * unregisters on unmount, exactly like the build preview.
 *
 * Esc, the backdrop, and the X all close it. The sandbox stays allow-scripts with
 * NO allow-same-origin, so the opened tile still cannot read the app or its keys.
 *
 * Trust for the host's gated AI verbs is decided HERE, host-side, by byte
 * comparison of the tile's html against the compiled-in first-party blobs
 * (isFirstPartyAiHtml). It is never derived from anything the tile claims:
 * a marker on the tile record would live in user-editable storage, but the
 * only way to pass byte-equality is to be our unmodified tile, which carries
 * no extra authority. The server routes re-check the session either way.
 */
function OpenTileOverlay({
  tile,
  register,
  unregister,
  onClose,
}: {
  tile: Tile
  register: (w: Window | null, id: string, opts?: { trusted?: boolean }) => void
  unregister: (w: Window | null) => void
  onClose: () => void
}) {
  const winRef = useRef<Window | null>(null)
  // One comparison per overlay open; tile.html is stable for the mount.
  const aiTrusted = useMemo(() => isFirstPartyAiHtml(tile.html), [tile.html])
  return (
    <div
      className="openOverlay"
      role="dialog"
      aria-modal="true"
      aria-label={tile.name}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Always full-page (Alex, 2026-07-11): a tile is its own page, never a
          note card. The fullPage flag is now moot but harmless on old rows. */}
      <div className="openCard full">
        <div className="openTop">
          <span className="openTitle">{tile.name}</span>
          <button type="button" className="openClose" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
        <div className="openStage">
          <iframe
            ref={(el) => {
              if (el) {
                winRef.current = el.contentWindow
                register(el.contentWindow, tile.id, { trusted: aiTrusted })
              } else if (winRef.current) {
                unregister(winRef.current)
                winRef.current = null
              }
            }}
            onLoad={(e) => {
              winRef.current = e.currentTarget.contentWindow
              register(e.currentTarget.contentWindow, tile.id, { trusted: aiTrusted })
            }}
            className="openFrame"
            srcDoc={tile.html}
            sandbox="allow-scripts"
            title={tile.name}
          />
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────── the design editor sheet ───────────────────────── */

function DesignSheet({
  title,
  skin,
  onApply,
  onClose,
  lockName = false,
}: {
  title: string
  skin: Skin
  onApply: (patch: Partial<Skin>) => void
  onClose: () => void
  /** The locked Create tile: its name control is hidden and never applied
   *  (the door must always read "Create"); design/size/color stay free. */
  lockName?: boolean
}) {
  const [cat, setCat] = useState<(typeof DESIGN_CATEGORIES)[number]>('all')
  // Default to the tile's current design, or the first one, so the live preview
  // always shows a real animated design (never a blank, cut-off-looking card).
  const [design, setDesign] = useState<string | null>(skin.design ?? TILE_DESIGNS[0].key)
  const [color, setColor] = useState<string | null>(skin.color)
  const [size, setSize] = useState<TileSize>(skin.size)
  const [name, setName] = useState<string>(skin.name || title)
  const [livingDots, setLivingDots] = useState<boolean>(skin.livingDots)
  const shown = cat === 'all' ? TILE_DESIGNS : TILE_DESIGNS.filter((d) => d.category === cat)
  const chosen = designByKey(design)

  return (
    <div className={sheets.scrim} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={sheets.sheet}>
        <h3>Design your tile</h3>
        <p className={sheets.lede}>Pick a look on the left. Recolor it, flick the living dots, and size it on the right, and watch it land on your tile.</p>

        <div className={sheets.chips}>
          {DESIGN_CATEGORIES.map((c) => (
            <button key={c} type="button" className={`${sheets.chip} ${c === cat ? sheets.on : ''}`} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>

        <div className={sheets.layout}>
          {/* left: the gallery to choose from (scrolls on its own) */}
          <div className={sheets.gallery}>
            {shown.map((d) => (
              <div key={d.key} className={`${sheets.dcard} ${d.key === design ? sheets.sel : ''}`} onClick={() => setDesign(d.key)}>
                <div className={sheets.dart}>
                  <DesignArt dkey={d.key} svg={d.svg} color={color} livingDots={livingDots} />
                </div>
                <div className={sheets.dname}>{d.name}</div>
              </div>
            ))}
          </div>

          {/* right: the live preview + every control, pinned + always visible */}
          <div className={sheets.panel}>
            <div className={sheets.preview} data-size={size}>
              {chosen ? (
                <DesignArt key={`${chosen.key}:${livingDots}`} dkey={chosen.key} svg={chosen.svg} color={color} livingDots={livingDots} />
              ) : null}
              <span className={sheets.pnum}>01</span>
              <div className={sheets.pfoot}>
                <span className={sheets.ptitle}>{name || 'My tile'}</span>
                <span className={sheets.parrow}>&#8594;</span>
              </div>
            </div>

            <div className={sheets.ctl}>
              <div className={sheets.k}>Color</div>
              <div className={sheets.swatches}>
                {DESIGN_COLORS.map((c) => (
                  <div
                    key={c.hex}
                    className={`${sheets.sw} ${(color || MINT) === c.hex ? sheets.on : ''}`}
                    style={{ background: c.hex }}
                    title={c.name}
                    onClick={() => setColor(c.hex)}
                  />
                ))}
              </div>
            </div>

            <div className={sheets.ctl}>
              <div className={sheets.k}>Living dots</div>
              <div className={sheets.sizes}>
                <button type="button" className={`${sheets.seg} ${livingDots ? sheets.on : ''}`} onClick={() => setLivingDots(true)}>
                  On
                </button>
                <button type="button" className={`${sheets.seg} ${!livingDots ? sheets.on : ''}`} onClick={() => setLivingDots(false)}>
                  Off
                </button>
              </div>
            </div>

            <div className={sheets.ctl}>
              <div className={sheets.k}>Size</div>
              <div className={sheets.sizes}>
                {TILE_SIZES.map((s) => (
                  <button key={s} type="button" className={`${sheets.seg} ${s === size ? sheets.on : ''}`} onClick={() => setSize(s)}>
                    {SIZE_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            {!lockName && (
              <div className={sheets.ctl}>
                <div className={sheets.k}>Name</div>
                <input className={sheets.nameInput} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
              </div>
            )}

            <div className={sheets.foot}>
              <button type="button" className={sheets.ghost} onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className={sheets.go}
                onClick={() => onApply({ design, color, size, name: lockName ? null : (name.trim() || null), livingDots })}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────── the wallpaper picker ───────────────────────── */

function WallpaperSheet({
  background,
  onChange,
  onClose,
}: {
  background: Background
  onChange: (bg: Background) => void
  onClose: () => void
}) {
  const mode = background.mode
  const toWorld = () => onChange(background.mode === 'world' ? background : { ...DEFAULT_CHROME.background })
  const toGradient = () => onChange(background.mode === 'gradient' ? background : { mode: 'gradient', ...GRADIENT_PRESETS[0] })
  const toSolid = () => onChange(background.mode === 'solid' ? background : { mode: 'solid', color: SOLID_COLORS[1] })

  // A light scrim (not the heavy modal one) so the real dashboard re-themes live
  // behind the panel as you change the wallpaper.
  return (
    <div className={sheets.wallScrim} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={sheets.wallPanel}>
        <div className={sheets.wallHead}>
          <h3>Your wallpaper</h3>
          <button type="button" className={sheets.wallClose} onClick={onClose}>Done</button>
        </div>
        <div className={sheets.chips}>
          <button type="button" className={`${sheets.chip} ${mode === 'world' ? sheets.on : ''}`} onClick={toWorld}>World</button>
          <button type="button" className={`${sheets.chip} ${mode === 'gradient' ? sheets.on : ''}`} onClick={toGradient}>Gradient</button>
          <button type="button" className={`${sheets.chip} ${mode === 'solid' ? sheets.on : ''}`} onClick={toSolid}>Solid</button>
        </div>

        {background.mode === 'world' && (
          <>
            <div className={sheets.ctl}>
              <div className={sheets.k}>Accent</div>
              <div className={sheets.swatches}>
                {WALLPAPER_ACCENTS.map((c) => (
                  <div
                    key={c.hex}
                    className={`${sheets.sw} ${background.accent === c.hex ? sheets.on : ''}`}
                    style={{ background: c.hex }}
                    title={c.name}
                    onClick={() => onChange({ ...background, accent: c.hex })}
                  />
                ))}
              </div>
            </div>
            <div className={sheets.ctl}>
              <div className={sheets.k}>Particles · {background.particles}</div>
              <input
                className={sheets.range}
                type="range"
                min={0}
                max={50}
                value={background.particles}
                onChange={(e) => onChange({ ...background, particles: Number(e.target.value) })}
              />
            </div>
            <div className={sheets.ctl}>
              <div className={sheets.k}>Mountains</div>
              <div className={sheets.sizes}>
                <button type="button" className={`${sheets.seg} ${background.mountains ? sheets.on : ''}`} onClick={() => onChange({ ...background, mountains: true })}>On</button>
                <button type="button" className={`${sheets.seg} ${!background.mountains ? sheets.on : ''}`} onClick={() => onChange({ ...background, mountains: false })}>Off</button>
              </div>
            </div>
            <div className={sheets.ctl}>
              <div className={sheets.k}>Drift</div>
              <div className={sheets.sizes}>
                {([['Calm', 0.5], ['Normal', 1], ['Lively', 2]] as const).map(([lbl, v]) => (
                  <button key={lbl} type="button" className={`${sheets.seg} ${background.speed === v ? sheets.on : ''}`} onClick={() => onChange({ ...background, speed: v })}>{lbl}</button>
                ))}
              </div>
            </div>
          </>
        )}

        {background.mode === 'gradient' && (
          <div className={sheets.ctl}>
            <div className={sheets.k}>Gradient</div>
            <div className={sheets.gradRow}>
              {GRADIENT_PRESETS.map((p) => {
                const on = background.c1 === p.c1 && background.c2 === p.c2
                return (
                  <button
                    key={p.name}
                    type="button"
                    title={p.name}
                    className={`${sheets.gradChip} ${on ? sheets.on : ''}`}
                    style={{ background: `linear-gradient(${p.angle}deg, ${p.c1}, ${p.c2})` }}
                    onClick={() => onChange({ mode: 'gradient', c1: p.c1, c2: p.c2, angle: p.angle })}
                  />
                )
              })}
            </div>
          </div>
        )}

        {background.mode === 'solid' && (
          <div className={sheets.ctl}>
            <div className={sheets.k}>Color</div>
            <div className={sheets.swatches}>
              {SOLID_COLORS.map((hex) => (
                <div
                  key={hex}
                  className={`${sheets.sw} ${background.color === hex ? sheets.on : ''}`}
                  style={{ background: hex, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.18)' }}
                  onClick={() => onChange({ mode: 'solid', color: hex })}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ───────────────────────── the header editor ───────────────────────── */

function HeaderSheet({
  chrome,
  onChange,
  onClose,
}: {
  chrome: DashboardChrome
  onChange: (patch: Partial<DashboardChrome>) => void
  onClose: () => void
}) {
  const g = chrome.greeting
  const d = chrome.date
  const gem = chrome.gem
  const setG = (p: Partial<Greeting>) => onChange({ greeting: { ...g, ...p } })
  const setD = (p: Partial<DateConfig>) => onChange({ date: { ...d, ...p } })
  const setGem = (p: Partial<GemConfig>) => onChange({ gem: { ...gem, ...p } })

  return (
    <div className={sheets.wallScrim} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={sheets.wallPanel}>
        <div className={sheets.wallHead}>
          <h3>Your header</h3>
          <button type="button" className={sheets.wallClose} onClick={onClose}>Done</button>
        </div>

        <div className={sheets.ctl}>
          <div className={sheets.k}>Greeting</div>
          <div className={sheets.sizes}>
            <button type="button" className={`${sheets.seg} ${g.mode === 'auto' ? sheets.on : ''}`} onClick={() => setG({ mode: 'auto' })}>Auto</button>
            <button type="button" className={`${sheets.seg} ${g.mode === 'custom' ? sheets.on : ''}`} onClick={() => setG({ mode: 'custom' })}>Custom</button>
          </div>
        </div>
        {g.mode === 'custom' && (
          <div className={sheets.ctl}>
            <input className={sheets.nameInput} placeholder="Good evening" value={g.text} maxLength={48} onChange={(e) => setG({ text: e.target.value })} />
          </div>
        )}

        <div className={sheets.ctl}>
          <div className={sheets.k}>Your name</div>
          <div className={sheets.sizes}>
            <button type="button" className={`${sheets.seg} ${g.showName ? sheets.on : ''}`} onClick={() => setG({ showName: true })}>Show</button>
            <button type="button" className={`${sheets.seg} ${!g.showName ? sheets.on : ''}`} onClick={() => setG({ showName: false })}>Hide</button>
            <button type="button" className={`${sheets.seg} ${g.accentName ? sheets.on : ''}`} onClick={() => setG({ accentName: !g.accentName })}>Accent</button>
          </div>
        </div>

        <div className={sheets.ctl}>
          <div className={sheets.k}>Size</div>
          <input className={sheets.range} type="range" min={0.8} max={1.3} step={0.05} value={g.scale} onChange={(e) => setG({ scale: Number(e.target.value) })} />
        </div>

        <div className={sheets.ctl}>
          <div className={sheets.k}>Date</div>
          <div className={sheets.sizes}>
            <button type="button" className={`${sheets.seg} ${d.show && d.format === 'today' ? sheets.on : ''}`} onClick={() => setD({ show: true, format: 'today' })}>Today</button>
            <button type="button" className={`${sheets.seg} ${d.show && d.format === 'full' ? sheets.on : ''}`} onClick={() => setD({ show: true, format: 'full' })}>Full</button>
            <button type="button" className={`${sheets.seg} ${!d.show ? sheets.on : ''}`} onClick={() => setD({ show: false })}>Hidden</button>
          </div>
        </div>

        <div className={sheets.ctl}>
          <div className={sheets.k}>Character gem</div>
          <div className={sheets.sizes}>
            <button type="button" className={`${sheets.seg} ${gem.show ? sheets.on : ''}`} onClick={() => setGem({ show: true })}>On</button>
            <button type="button" className={`${sheets.seg} ${!gem.show ? sheets.on : ''}`} onClick={() => setGem({ show: false })}>Off</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────── the fused dashboard grid ───────────────────────── */

export default function DashboardGrid({ userId, score, scoreState, tileStats, chrome, onChromeChange, isFounder }: DashboardGridProps) {
  const ref = useRef<HTMLDivElement>(null)
  // Tile positions are applied as a compositor-friendly translate() (see
  // veeTiles.css), and translate can't use %-of-container - so this ref mirrors
  // the grid's real px width into --gridw. Set synchronously on attach (before
  // first paint, no flash) and then only when the grid actually resizes: never
  // per frame, no React state, no re-render.
  const gridRO = useRef<ResizeObserver | null>(null)
  const gridRef = useCallback((el: HTMLDivElement | null) => {
    gridRO.current?.disconnect()
    gridRO.current = null
    if (!el) return
    el.style.setProperty('--gridw', `${el.clientWidth}px`)
    const ro = new ResizeObserver(() => el.style.setProperty('--gridw', `${el.clientWidth}px`))
    ro.observe(el)
    gridRO.current = ro
  }, [])
  const [mounted, setMounted] = useState(false)
  const [editing, setEditing] = useState(false)
  // The id of the tile currently lifted in a drag, so the board can recede around
  // it (calm "pickup" feedback). Cleared on drop / cancel.
  const [activeId, setActiveId] = useState<string | null>(null)
  // While a tile is lifted, the order it WOULD become if dropped now. Drives the
  // live packer so neighbours flow around the finger; committed on drop.
  const [previewOrder, setPreviewOrder] = useState<string[] | null>(null)
  // Column count for the packer: 4 on desktop, 2 on phone (matches the CSS --cols).
  const [cols, setCols] = useState(4)
  const [order, setOrder] = useState<string[]>([])
  const [tiles, setTiles] = useState<Tile[]>([])
  const [skinV, setSkinV] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [wallOpen, setWallOpen] = useState(false)
  const [headerOpen, setHeaderOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [artsOpen, setArtsOpen] = useState(false)
  const [publishId, setPublishId] = useState<string | null>(null)
  // The user tile currently opened full (its sealed iframe runs in the overlay),
  // or null. Tapping a user tile sets it; Esc / the X / the backdrop clear it.
  const [openTileId, setOpenTileId] = useState<string | null>(null)

  // Deep link: /app?open=library opens the Library panel on arrival. This is
  // the copyable finish line the MCP's add_tile reply hands out ("your tile is
  // in the Library, open it here"), so landing a tile ends in one click, not
  // homework. The param is cleaned after use so a refresh stays home.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search)
      if (q.get('open') === 'library') {
        setLibraryOpen(true)
        q.delete('open')
        const rest = q.toString()
        window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''))
      }
    } catch {
      /* a malformed query string never blocks the board */
    }
  }, [])

  const refresh = useCallback(() => {
    setTiles(tileStore.listTiles(userId))
    setOrder(homeLayout.getOrder(userId))
  }, [userId])

  // Latest compiled-in html for each first-party featured tile, keyed by its
  // unique design. Lets an installed featured tile self-update to the newest
  // version on load (below) instead of freezing at whatever html it was added
  // with — so a Studio improvement reaches an existing install with zero
  // remove+re-add. User-built tiles (design not in this map) are never touched.
  const featuredHtmlByDesign = useMemo(() => {
    const m = new Map<string, string>()
    for (const f of FEATURED_TILES) {
      const d = f.envelope.design
      if (f.author === 'Vitality' && d && f.envelope.html) m.set(d, f.envelope.html)
    }
    return m
  }, [])

  useEffect(() => {
    setMounted(true)
    // Self-heal stale featured installs to the current build BEFORE first render,
    // so the freshest html (and its AI-trust byte-equality) is what mounts. Only
    // rewrites when the stored html actually differs; idempotent on every load.
    try {
      for (const t of tileStore.listTiles(userId)) {
        const design = tileSkin.get(userId, t.id).design
        if (!design) continue
        const latest = featuredHtmlByDesign.get(design)
        if (latest && t.html !== latest) {
          const updated = tileStore.updateHtml(userId, t.id, latest)
          if (updated) void pushTile(userId, updated, 'hub')
        }
      }
    } catch {
      /* a reconcile hiccup must never block the dashboard from loading */
    }
    refresh()
  }, [refresh, userId, featuredHtmlByDesign])

  // Consume a tile stashed by the public Arts District (/district) before signup.
  // The stash carries an OPAQUE id only, never HTML: we read it, remove it once so
  // a consume can never loop, then resolve the envelope first-party (the
  // compiled-in FEATURED_TILES for a featured id, or the RLS-filtered approved
  // published_tiles row for a community uuid). importTile is the final gate. An
  // unknown or malformed id silently drops. Runs once on mount.
  useEffect(() => {
    let raw: string | null = null
    try {
      raw = localStorage.getItem('vitality:pending-tile')
      if (raw) localStorage.removeItem('vitality:pending-tile') // consume once, always
    } catch {
      return
    }
    if (!raw) return
    let pending: { t?: string; id?: string }
    try {
      pending = JSON.parse(raw)
    } catch {
      return
    }
    const id = typeof pending?.id === 'string' ? pending.id : ''
    if (!id) return

    if (pending.t === 'featured') {
      const f = FEATURED_TILES.find((x) => x.id === id) // envelope from the compiled-in catalog
      if (f) addFeatured(f)
      return
    }
    if (pending.t === 'published') {
      // uuid shape gate before hitting the DB
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return
      void (async () => {
        const r = await getPublishedEnvelope(id) // RLS-filtered: approved or caller-owned only
        if (r?.ok && r.envelope) addPublishedEnvelope(r.envelope)
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Track the grid width bucket so the packer uses the same column count the CSS
  // does (4 desktop / 2 phone). Re-packs on rotate / resize across the breakpoint.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)')
    const apply = () => setCols(mq.matches ? 2 : 4)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  // Pull server tiles (built by the MCP in Claude Code, or on another device)
  // and refresh. LIBRARY-FIRST (Alex, 2026-07-11): a brand-new tile is NOT
  // auto-placed on the board - it lands in the Library ("In your library")
  // and the user places it with the Library's Place action. A tile appearing
  // on the home grid uninvited read as a security hole in the taste test,
  // even with the gate green. (A tile already placed on another device still
  // shows placed here: placement rides homeLayout, not this pull.)
  const syncNow = useCallback(async () => {
    const res = await pullAndMerge(userId)
    if (res.merged > 0 || res.newIds.length > 0) refresh()
  }, [userId, refresh])

  // Server sync on mount + live "watch it land": a tile the MCP adds while you're
  // looking at the dashboard appears, placed, on window focus / tab becoming
  // visible — and via a gentle poll while the tab stays visible (claude.ai in a
  // separate window never fires our focus/visibility events, so without the poll
  // "watch it land" only worked after a tab switch). One small RLS-scoped select
  // per tick; skipped entirely while hidden. Additive + best-effort; offline no-op.
  useEffect(() => {
    let alive = true
    const run = () => { if (alive) void syncNow() }
    run()
    const onVis = () => { if (document.visibilityState === 'visible') run() }
    window.addEventListener('focus', run)
    document.addEventListener('visibilitychange', onVis)
    const iv = window.setInterval(() => {
      if (document.visibilityState === 'visible') run()
    }, 25_000)
    return () => {
      alive = false
      window.removeEventListener('focus', run)
      document.removeEventListener('visibilitychange', onVis)
      window.clearInterval(iv)
    }
  }, [syncNow])

  // Fresh-device pre-warm: pull this user's tile_data from the server into
  // localStorage once on mount, so an opened tile shows its saved data even on a
  // device that has never held it. Best-effort; localStorage stays the source.
  useEffect(() => {
    let alive = true
    void tileDataSync.pullAll(userId).then((rows) => {
      if (!alive) return
      for (const r of rows) tileStore.hydrateData(userId, r.tileId, r.data)
    })
    return () => { alive = false }
  }, [userId])

  // Board sync on mount: pull the arrangement (tile order + each tile's skin)
  // saved on another device and apply it locally, so a dashboard laid out
  // elsewhere reappears here. Additive + best-effort; a missing table / offline
  // leaves the local board exactly as it was. Bumps skinV so re-skinned tiles
  // re-render, and refreshes so a pulled order shows.
  useEffect(() => {
    let alive = true
    void pullLayout(userId).then((res) => {
      if (alive && res.applied) {
        refresh()
        setSkinV((v) => v + 1)
      }
    })
    return () => { alive = false }
  }, [userId, refresh])

  // Return the write's promise so the host gates the report activity on the
  // ACTUAL result (and posts report:error back to the tile when it fails) —
  // a failed Vitality.report() must never be counted as a success.
  const { register, unregister } = useTileHost(userId, undefined, (stream, tileId) =>
    reportStream(tileId, stream),
  )

  // iOS-home-screen touch model: mouse drags arm after a 6px slip (clicks stay
  // clicks); touch drags arm after a 180ms hold with an 8px wobble allowance, so
  // a quick flick scrolls the page and a held tile lifts - the two never fight.
  // (Tiles keep touch-action:pan-y in edit mode; once the TouchSensor activates
  // it preventDefaults the page for the rest of the drag.)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  )

  const byId = useMemo(() => new Map(tiles.map((t) => [t.id, t])), [tiles])

  // Resolve the order into renderable items, dropping any user tile whose source
  // was deleted. Vee is an ordinary item now (kind 'vee'), no longer pinned.
  type HomeItem =
    | { id: string; kind: 'core' }
    | { id: string; kind: 'vee' }
    | { id: string; kind: 'library' }
    | { id: string; kind: 'create' }
    | { id: string; kind: 'forge' }
    | { id: string; kind: 'user'; tile: Tile }
  const items: HomeItem[] = []
  for (const id of order) {
    if (id === VEE_TILE.id) items.push({ id, kind: 'vee' })
    else if (isLibraryId(id)) items.push({ id, kind: 'library' })
    else if (isCreateId(id)) items.push({ id, kind: 'create' })
    else if (isForgeId(id)) items.push({ id, kind: 'forge' })
    else if (isCoreId(id)) items.push({ id, kind: 'core' })
    else {
      const t = byId.get(id)
      if (t) items.push({ id, kind: 'user', tile: t })
    }
  }

  const sortableIds = items.map((i) => i.id)
  const skinFor = useCallback(
    (id: string): Skin => {
      const stored = tileSkin.get(userId, id)
      // A core tile (incl. Vee + Library) that has never been customized falls
      // back to its registry default size, so a fresh dashboard matches the
      // seeded layout.
      if ((isCoreId(id) || isLibraryId(id) || isCreateId(id) || isForgeId(id)) && tileSkin.all(userId)[id] === undefined) {
        return { ...stored, size: coreDefaultSize(id as Parameters<typeof coreDefaultSize>[0]) }
      }
      return stored
    },
    [userId, skinV], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Re-run the orb / Vee animation whenever the rendered layout changes (tiles
  // added, removed, reordered, resized, designed, or edit toggled) so every
  // tile's living orb is re-bound to its fresh DOM node. The animation reads
  // path geometry in viewBox space, so it survives any tile size.
  const layoutSig = `${sortableIds.join(',')}|${sortableIds.map((id) => skinFor(id).size + (skinFor(id).design || '')).join(',')}|${editing}`
  useEffect(() => {
    if (!ref.current || !mounted) return
    // The Vitality score number was removed from the Vee tile, so never run the
    // count-up. The wire-feed + ring pulse (the mentor animation) still play.
    return initVeeTiles(ref.current, { score: null, showNumber: false })
  }, [mounted, layoutSig])

  // Esc closes the opened tile, mirroring backing out of a full module.
  useEffect(() => {
    if (!openTileId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenTileId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openTileId])

  // Entering edit mode, or the open tile leaving the registry / layout, closes
  // the overlay so it can never strand over a tile that is no longer there.
  useEffect(() => {
    if (!openTileId) return
    if (editing || !order.includes(openTileId) || !byId.has(openTileId)) setOpenTileId(null)
  }, [editing, openTileId, order, byId])

  if (!mounted) return null

  const addable = tiles.filter((t) => !order.includes(t.id))
  const removedCore = (Object.keys(CORE_TILES) as (keyof typeof CORE_TILES)[]).filter((id) => !order.includes(id))
  const veeRemoved = !order.includes(VEE_TILE.id)

  // Layout as a pure function of (order, sizes, cols). During a drag we pack the
  // PREVIEW order so tiles glide around the lifted one; the tiles render in their
  // stable DOM order and just animate to the new packed cells (no remount).
  const packOrder = previewOrder ?? sortableIds
  const { positions, rows: packRows } = packTiles(
    packOrder.map((id) => footprintFor(id, skinFor(id).size, cols)),
    cols,
  )
  const addPos: PackedPos = { x: 0, y: packRows, w: 1, h: 1 }
  const gridRows = packRows + (editing ? 1 : 0)

  // Hovering another tile mid-drag moves the lifted id next to it in the preview
  // order and re-packs live. Order is the single source of truth; positions derive.
  function onDragOver(e: DragOverEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    // Recompute the preview from the STABLE committed order every event, never
    // by mutating the evolving preview. dnd-kit's `over.id` comes from droppable
    // rects measured once at drag start (tiles then glide via --x/--y and are
    // never re-measured), so those rects match `sortableIds`, not the glided
    // preview. Using `sortableIds` as the indexOf basis keeps the two aligned;
    // basing it on `prev` diverges and a back-and-forth drag lands the tile at
    // the wrong slot.
    const from = sortableIds.indexOf(String(active.id))
    const to = sortableIds.indexOf(String(over.id))
    if (from < 0 || to < 0 || from === to) return
    const next = arrayMove(sortableIds, from, to)
    setPreviewOrder((prev) => (prev && prev.join() === next.join() ? prev : next))
  }
  /** After a drop, pulse the landed tile (1 → .985 → 1; .landing in veeTiles.css,
   *  delayed to fire as the overlay's drop flight touches down). Pure DOM class
   *  with animationend cleanup - zero extra React renders on the drop path. */
  function pulseLanding(id: string) {
    const root = ref.current
    if (!root) return
    // Double rAF: let React commit the drop re-render first (so the class can't
    // be wiped), and guarantee a restart if the same tile lands twice quickly.
    requestAnimationFrame(() => {
      const el = root.querySelector<HTMLElement>(`[data-tid="${CSS.escape(id)}"]`)
      if (!el) return
      el.classList.remove('landing')
      requestAnimationFrame(() => {
        el.classList.add('landing')
        const done = (ev: AnimationEvent) => {
          if (ev.animationName !== 'veeSettle') return
          el.classList.remove('landing')
          el.removeEventListener('animationend', done)
        }
        el.addEventListener('animationend', done)
      })
    })
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const final = previewOrder
    setPreviewOrder(null)
    if (final && final.join() !== sortableIds.join()) {
      setOrder(final)
      homeLayout.setOrder(userId, final)
      void pushLayout(userId) // mirror the new order up so it crosses devices
    }
    pulseLanding(String(e.active.id)) // settle pulse, even on a spring-back drop
  }
  function place(id: string) {
    const next = homeLayout.add(userId, id)
    setOrder(next)
    setAddOpen(false)
    void pushLayout(userId) // mirror the placement up
  }
  function remove(id: string) {
    // The Library + Forge tiles are always on: they can never be removed.
    // Create is UNLOCKED (launch strip, 2026-07-11): de-cored for new users
    // and removable for anyone who still has it.
    if (isLibraryId(id) || isForgeId(id)) return
    const next = homeLayout.remove(userId, id)
    setOrder(next)
    void pushLayout(userId) // mirror the removal up
  }
  /**
   * Permanently destroy a user tile (Library "delete"), everywhere it lives.
   * `deleteTile` alone left the id in the persisted home order, its skin behind,
   * and the mirrored server row intact — so `pullAndMerge` re-adopted it on the
   * next mount and it resurrected, placed, with its old look. Delete all four:
   * home order, skin, local registry, and server row. Never a core/Library tile.
   */
  function destroyTile(id: string) {
    if (isCoreId(id) || isLibraryId(id) || isCreateId(id) || isForgeId(id)) return
    homeLayout.remove(userId, id) // drop from the persisted order (no re-placement)
    tileSkin.remove(userId, id) // drop the skin (no restored look on re-adopt)
    tileStore.deleteTile(userId, id) // drop the local registry entry
    void deleteServerTile(userId, id) // delete the mirror so pullAndMerge can't re-adopt
    void pushLayout(userId) // mirror the board (order + skins) minus this tile
    refresh() // re-read tiles + order from storage
  }
  function resize(id: string) {
    tileSkin.set(userId, id, { size: nextSize(skinFor(id).size) })
    setSkinV((v) => v + 1)
    void pushLayout(userId) // mirror the new size up
  }
  function applyDesign(id: string, patch: Partial<Skin>) {
    tileSkin.set(userId, id, patch)
    setEditId(null)
    setSkinV((v) => v + 1)
    void pushLayout(userId) // mirror the new design (size + color + name) up
  }
  function restore() {
    const next = homeLayout.reset(userId)
    setOrder(next)
    setSkinV((v) => v + 1)
    void pushLayout(userId) // mirror the reset arrangement up
  }
  /** Install a curated Arts District tile through the shared importTile socket,
   *  then re-read so it shows in the Library. Returns false if the envelope is
   *  rejected so the shop can keep the card un-added. */
  function addFeatured(f: FeaturedTile): boolean {
    const tile = tileStore.importTile(userId, f.envelope)
    if (!tile) return false
    void pushTile(userId, tile, 'hub') // mirror up so it persists + crosses devices
    refresh()
    return true
  }
  /** Install a published tile's envelope (Arts District v3 community drops).
   *  Same LOCKED importTile socket as featured + paste. Returns false on reject. */
  function addPublishedEnvelope(env: TileEnvelope): boolean {
    const tile = tileStore.importTile(userId, env)
    if (!tile) return false
    void pushTile(userId, tile, 'hub')
    refresh()
    return true
  }
  /** Copy a shareable code for one of the user's tiles to the clipboard (Arts
   *  District v1, peer-to-peer share). Returns false if the tile is gone. */
  function shareTile(id: string): boolean {
    const tile = byId.get(id)
    if (!tile) return false
    const code = exportTileCode(tile, skinFor(id))
    try {
      void navigator.clipboard?.writeText(code)
    } catch {
      return false
    }
    return true
  }

  const editName = editId
    ? skinFor(editId).name ||
      (editId === VEE_TILE.id
        ? VEE_TILE.label
        : isLibraryId(editId)
          ? LIBRARY_TILE.label
          : isCreateId(editId)
            ? CREATE_TILE.label
            : isForgeId(editId)
              ? FORGE_TILE.label
              : isCoreId(editId)
                ? CORE_TILES[editId as keyof typeof CORE_TILES]?.label
                : byId.get(editId)?.name) ||
      ''
    : ''

  return (
    <div className={`veeTiles${editing ? ' editing' : ''}${activeId ? ' lifting' : ''}`} ref={ref}>
      {/* shared gem-sprite endpoint gradients (used by the tile orb markers) */}
      <svg width="0" height="0" aria-hidden style={{ position: 'absolute' }}>
        <defs>
          <radialGradient id="vEndpt">
            <stop offset="0%" stopColor="#dcffeb" stopOpacity=".95" />
            <stop offset="40%" stopColor="#a7f3d0" stopOpacity=".4" />
            <stop offset="100%" stopColor="#6EE7B7" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="vEndptA">
            <stop offset="0%" stopColor="#ffe9cf" stopOpacity=".95" />
            <stop offset="40%" stopColor="#e8964a" stopOpacity=".4" />
            <stop offset="100%" stopColor="#e8964a" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>

      <div className="editBar">
        {editing && (
          <div className="editTools" role="toolbar" aria-label="Customize your dashboard">
            {onChromeChange && (
              <button type="button" className="editTool" style={{ ['--i' as string]: 0 }} onClick={() => setHeaderOpen(true)} title="Edit your greeting + gem">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V5h16v2M9 19h6M12 5v14" /></svg>
                Header
              </button>
            )}
            {onChromeChange && (
              <button type="button" className="editTool" style={{ ['--i' as string]: 1 }} onClick={() => setWallOpen(true)} title="Change your wallpaper">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m4 18 5-5 4 4 3-3 4 4" /></svg>
                Wallpaper
              </button>
            )}
            <button type="button" className="editTool" style={{ ['--i' as string]: 2 }} onClick={restore} title="Restore the default layout">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
              Reset
            </button>
          </div>
        )}
        <button type="button" className={`editToggle${editing ? ' on' : ''}`} onClick={() => setEditing((e) => !e)}>
          {editing ? (
            'Done'
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8h7M17 8h2M5 16h2M12 16h7" /><circle cx="14.5" cy="8" r="2.2" /><circle cx="9.5" cy="16" r="2.2" /></svg>
              Customize
            </>
          )}
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e) => {
          setActiveId(String(e.active.id))
          setPreviewOrder(null)
        }}
        onDragOver={onDragOver}
        onDragCancel={() => {
          setActiveId(null)
          setPreviewOrder(null)
        }}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={sortableIds} strategy={() => null}>
          <div ref={gridRef} className={`grid${activeId ? ' dragging' : ''}`} style={{ ['--rows' as string]: gridRows }}>
            {items.map((item) => {
              const skin = skinFor(item.id)
              if (item.kind === 'vee') {
                return (
                  <SortableHomeTile
                    key={`${item.id}:${skinV}`}
                    id={item.id}
                    pos={positions.get(item.id)}
                    kind="vee"
                    score={score}
                    scoreState={scoreState}
                    skin={skin}
                    editing={editing}
                    onResize={() => resize(item.id)}
                    onEdit={() => setEditId(item.id)}
                    onRemove={() => remove(item.id)}
                  />
                )
              }
              if (item.kind === 'library') {
                return (
                  <SortableHomeTile
                    key={`${item.id}:${skinV}`}
                    id={item.id}
                    pos={positions.get(item.id)}
                    kind="library"
                    onOpen={() => setLibraryOpen(true)}
                    skin={skin}
                    editing={editing}
                    onResize={() => resize(item.id)}
                    onEdit={() => setEditId(item.id)}
                    onRemove={() => remove(item.id)}
                  />
                )
              }
              if (item.kind === 'create') {
                return (
                  <SortableHomeTile
                    key={`${item.id}:${skinV}`}
                    id={item.id}
                    pos={positions.get(item.id)}
                    kind="create"
                    skin={skin}
                    editing={editing}
                    onResize={() => resize(item.id)}
                    onEdit={() => setEditId(item.id)}
                    onRemove={() => remove(item.id)}
                  />
                )
              }
              if (item.kind === 'forge') {
                return (
                  <SortableHomeTile
                    key={`${item.id}:${skinV}`}
                    id={item.id}
                    pos={positions.get(item.id)}
                    kind="forge"
                    skin={skin}
                    editing={editing}
                    onResize={() => resize(item.id)}
                    onEdit={() => setEditId(item.id)}
                    onRemove={() => remove(item.id)}
                  />
                )
              }
              if (item.kind === 'core') {
                const core = CORE_TILES[item.id as keyof typeof CORE_TILES]
                return (
                  <SortableHomeTile
                    key={`${item.id}:${skinV}`}
                    id={item.id}
                    pos={positions.get(item.id)}
                    kind="core"
                    core={core}
                    stat={core.stat ? core.stat(tileStats) : null}
                    skin={skin}
                    editing={editing}
                    onResize={() => resize(item.id)}
                    onEdit={() => setEditId(item.id)}
                    onRemove={() => remove(item.id)}
                  />
                )
              }
              return (
                <SortableHomeTile
                  key={`${item.id}:${skinV}`}
                  id={item.id}
                  pos={positions.get(item.id)}
                  kind="user"
                  tile={item.tile}
                  onOpen={() => setOpenTileId(item.id)}
                  skin={skin}
                  editing={editing}
                  onResize={() => resize(item.id)}
                  onEdit={() => setEditId(item.id)}
                  onRemove={() => remove(item.id)}
                />
              )
            })}
            {editing && (
              <button
                type="button"
                className="addtile"
                style={{
                  ['--x' as string]: addPos.x,
                  ['--y' as string]: addPos.y,
                  ['--w' as string]: addPos.w,
                  ['--h' as string]: addPos.h,
                }}
                onClick={() => setAddOpen(true)}
              >
                <span className="plus">+</span>
                <span className="lbl">Add a tile</span>
              </button>
            )}
          </div>
        </SortableContext>
        {/* Drop flight: 260ms with a gentle overshoot (eases a hair past the slot,
            then settles) while the overlay's scale/rotate transition back to 1:1
            over the same 260ms - see .tile.overlay in veeTiles.css. */}
        <DragOverlay dropAnimation={{ duration: 260, easing: 'cubic-bezier(.22,1.2,.36,1)' }}>
          {(() => {
            const it = activeId ? items.find((i) => i.id === activeId) : null
            if (!it) return null
            const skin = skinFor(it.id)
            const base = {
              id: it.id,
              skin,
              editing: true,
              overlay: true as const,
              onResize: () => {},
              onEdit: () => {},
              onRemove: () => {},
            }
            if (it.kind === 'vee') return <HomeTileFace {...base} kind="vee" score={score} scoreState={scoreState} />
            if (it.kind === 'library') return <HomeTileFace {...base} kind="library" onOpen={() => {}} />
            if (it.kind === 'create') return <HomeTileFace {...base} kind="create" />
            if (it.kind === 'forge') return <HomeTileFace {...base} kind="forge" />
            if (it.kind === 'core') {
              const core = CORE_TILES[it.id as keyof typeof CORE_TILES]
              return <HomeTileFace {...base} kind="core" core={core} stat={core.stat ? core.stat(tileStats) : null} />
            }
            return <HomeTileFace {...base} kind="user" tile={it.tile} onOpen={() => {}} />
          })()}
        </DragOverlay>
      </DndContext>

      {addOpen && (
        <div className={sheets.scrim} onClick={(e) => e.target === e.currentTarget && setAddOpen(false)}>
          <div className={sheets.sheet}>
            <h3>Add a tile</h3>
            <p className={sheets.lede}>Place a tile back on your dashboard, or build a new one. Then design it any way you like.</p>

            {(removedCore.length > 0 || veeRemoved) && (
              <>
                <div className={sheets.k} style={{ marginBottom: 9 }}>Core tiles</div>
                <div className={sheets.pickRow}>
                  {veeRemoved && (
                    <button type="button" className={sheets.pick} onClick={() => place(VEE_TILE.id)}>
                      {VEE_TILE.label}
                    </button>
                  )}
                  {removedCore.map((id) => (
                    <button key={id} type="button" className={sheets.pick} onClick={() => place(id)}>
                      {CORE_TILES[id].label}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className={sheets.k} style={{ margin: '16px 0 9px' }}>Your tiles</div>
            {addable.length === 0 ? (
              <Link href="/app/create" className={sheets.empty}>
                You have placed all your tiles. Build a new one.
              </Link>
            ) : (
              <div className={sheets.pickRow}>
                {addable.map((t) => (
                  <button key={t.id} type="button" className={sheets.pick} onClick={() => place(t.id)}>
                    {t.name}
                  </button>
                ))}
              </div>
            )}

            <div className={sheets.foot}>
              <Link href="/app/create" className={sheets.ghost}>
                Build a new tile
              </Link>
              <button
                type="button"
                className={sheets.ghost}
                onClick={() => {
                  setAddOpen(false)
                  setArtsOpen(true)
                }}
              >
                Browse the gallery
              </button>
              <button type="button" className={sheets.go} onClick={() => setAddOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {editId && (
        <DesignSheet
          title={editName}
          skin={skinFor(editId)}
          onApply={(patch) => applyDesign(editId, patch)}
          onClose={() => setEditId(null)}
          lockName={isCreateId(editId)}
        />
      )}

      {wallOpen && onChromeChange && (
        <WallpaperSheet
          background={chrome?.background ?? DEFAULT_CHROME.background}
          onChange={(bg) => onChromeChange({ background: bg })}
          onClose={() => setWallOpen(false)}
        />
      )}

      {headerOpen && onChromeChange && (
        <HeaderSheet chrome={chrome ?? DEFAULT_CHROME} onChange={onChromeChange} onClose={() => setHeaderOpen(false)} />
      )}

      {libraryOpen && (
        <Library
          userId={userId}
          order={order}
          tiles={tiles}
          onPlace={place}
          onRemove={remove}
          onDelete={destroyTile}
          onImport={(env: TileEnvelope) => {
            const t = tileStore.importTile(userId, env)
            if (t) void pushTile(userId, t, 'paste')
            refresh()
            return t
          }}
          onCustomize={(id) => setEditId(id)}
          onRefresh={refresh}
          onOpenGallery={() => {
            setLibraryOpen(false)
            setArtsOpen(true)
          }}
          onShare={shareTile}
          onPublish={(id) => {
            setLibraryOpen(false)
            setPublishId(id)
          }}
          onClose={() => setLibraryOpen(false)}
        />
      )}

      {artsOpen && (
        <ArtsDistrict
          onAdd={addFeatured}
          onAddPublished={addPublishedEnvelope}
          onClose={() => setArtsOpen(false)}
          showFounderTiles={!!isFounder}
        />
      )}

      {publishId && byId.get(publishId) && (
        <PublishSheet
          tile={byId.get(publishId)!}
          skin={skinFor(publishId)}
          onClose={() => setPublishId(null)}
        />
      )}

      {openTileId && byId.get(openTileId) && (
        <OpenTileOverlay
          key={openTileId}
          tile={byId.get(openTileId)!}
          register={register}
          unregister={unregister}
          onClose={() => setOpenTileId(null)}
        />
      )}
    </div>
  )
}
