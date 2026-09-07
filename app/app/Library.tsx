'use client'

/**
 * Library: the full-screen app-manager overlay. The port of the approved
 * "Quiet Finder" demo (public/library-demo.html) to React, wired to REAL
 * per-user tile data. It is presentational: it reads the core registries
 * (CORE_TILES, VEE_TILE, LIBRARY_TILE) directly to render core rows alongside
 * the user's own built tiles, and it computes On-dashboard vs In-library from
 * the `order` prop. There is ONE "Add a tile" door: it opens the build flow as a
 * drawer over this panel (CreateTile mounted on top). That drawer accepts both a
 * raw HTML tile and a TileEnvelope, so build and upload are the same door now;
 * an envelope still installs through tileStore.importTile (the MCP / Arts
 * District socket), it just runs inside the drawer.
 *
 * Nothing in here writes storage; all mutations go up through the handlers so
 * DashboardGrid stays the single owner of layout + tile state.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  CORE_TILES,
  VEE_TILE,
  LIBRARY_TILE,
  CREATE_TILE,
  isLibraryId,
  isCoreId,
  isSideProjectId,
  type CoreTileId,
} from '@/lib/tiles/coreTiles'
import type { Tile, TileEnvelope } from '@/lib/tiles/types'
import CreateTile from './create/CreateTile'
import styles from './library.module.css'

export interface LibraryProps {
  userId: string
  /** Current home order (what is placed). */
  order: string[]
  /** tileStore.listTiles(userId). */
  tiles: Tile[]
  /** Add a tile to the dashboard. */
  onPlace: (id: string) => void
  /** Take a tile off the dashboard (keep in library). */
  onRemove: (id: string) => void
  /** Permanently delete a user-built tile (Library confirms first). */
  onDelete: (id: string) => void
  /** Install a pasted envelope; returns the tile or null on invalid. Kept on the
   *  contract so DashboardGrid stays the single owner of the importTile pipe; the
   *  "Add a tile" drawer installs envelopes directly through tileStore now. */
  onImport: (env: TileEnvelope) => Tile | null
  /** Open the design/customize sheet for a tile. */
  onCustomize: (id: string) => void
  /** Re-read the user's tiles after the build drawer keeps one (drawer mode). */
  onRefresh?: () => void
  /** Open the Arts District tile shop (Pillar 3). When omitted, the Gallery
   *  button is hidden. */
  onOpenGallery?: () => void
  /** Copy a shareable code for a user-built tile to the clipboard. Returns true
   *  on success. When omitted, the Share action is hidden. */
  onShare?: (id: string) => boolean
  /** Open the publish-to-Arts-District sheet for a user-built tile. When omitted,
   *  the Publish action is hidden. */
  onPublish?: (id: string) => void
  /** Close the panel. */
  onClose: () => void
}

/* The one-line kicker under each core tile's name in the rail. */
const CORE_KICKER: Record<CoreTileId, string> = {
  train: 'Workout logger',
  fuel: 'Macros and water',
  vitals: 'Daily signal',
  peak: 'Periodization',
  brand: 'Your brand',
  finance: 'Net worth and subs',
}

/** 'all' / 'dash' / 'lib' are views; any other value is a category catKey
 *  (lowercased), which is free text for a user tile, so this stays a string. */
type Filter = 'all' | 'dash' | 'lib' | (string & {})
type View = 'list' | 'gallery'

/** The always-shown categories in the approved demo, in order. The rest
 *  (rating / money / done / any custom text) only appear when they have a tile. */
const ALWAYS_CATEGORIES: { key: string; label: string; swatch: 'core' | 'side' | 'mine' }[] = [
  { key: 'core', label: 'Core', swatch: 'core' },
  { key: 'side', label: 'Side projects', swatch: 'side' },
  { key: 'intake', label: 'Intake', swatch: 'mine' },
  { key: 'count', label: 'Count', swatch: 'mine' },
  { key: 'duration', label: 'Duration', swatch: 'mine' },
  { key: 'measure', label: 'Measure', swatch: 'mine' },
]
/** Friendly labels for the optional categories that surface only when populated. */
const EXTRA_LABELS: Record<string, string> = {
  rating: 'Rating',
  money: 'Money',
  done: 'Done',
}
function categoryLabel(key: string): string {
  return EXTRA_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1)
}
/** One-line, plain-English meaning per category so "Data" / "Measure" are
 *  self-explanatory (shown as a tooltip on each sidebar category). */
const CATEGORY_DESC: Record<string, string> = {
  core: 'Built-in Vitality modules',
  side: 'Extra apps, kept off your core dashboard until you place them',
  intake: 'Things you take in, like water, food or supplements',
  count: 'Tallies and streaks you add up',
  duration: 'Time you spend, like focus, sleep or a workout',
  measure: 'Numbers you track, like weight or mood',
  data: 'Any value you want to log',
  rating: 'How you scored something',
  money: 'Amounts and finances',
  done: 'Did it or not',
}
function categoryDesc(key: string): string {
  return CATEGORY_DESC[key] || 'Tiles you built'
}

/** A normalized row the list renders, built from a core descriptor or a user tile. */
interface Row {
  id: string
  name: string
  sublabel: string
  /** 'core' for pre-installed tiles + Vee + Library, else the lowercased category. */
  catKey: string
  /** The chip text. */
  chip: string
  /** True for the gold "Core" styling, false for mint user-tile styling. */
  isCore: boolean
  /** Visual tone: 'core' (gold built-ins), 'side' (slate de-cored side projects),
   *  'mine' (mint user-built tiles). Drives the icon + chip color. */
  tone: 'core' | 'side' | 'mine'
  /** 'dash' when placed, 'lib' when only in the library. */
  state: 'dash' | 'lib'
  /** The "Added" cell text. */
  date: string
  glyph: React.ReactNode
  /** The always-on Library row carries no remove / delete / customize. */
  locked?: boolean
  /** A user-built tile gets Delete + Open-in-Create; a core tile does not. */
  user?: boolean
  /** True when the tile declares a report kind: Vee can read its stream.
   *  Rendered as the small iris "Vee" chip beside the category chip. */
  veeRead?: boolean
}

function formatDate(ts: number): string {
  try {
    return 'Added ' + new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return 'Added'
  }
}

function catKeyFromCategory(category?: string): string {
  return (category || 'Custom').toLowerCase()
}

/** Map a row's tone to its icon + chip variant class. Note: the side-project
 *  variant is `.extra`, NOT `.side` (which is the sidebar nav's own class). */
function toneClass(tone: 'core' | 'side' | 'mine'): string {
  return tone === 'core' ? styles.core : tone === 'side' ? styles.extra : styles.mine
}

export default function Library({
  userId,
  order,
  tiles,
  onPlace,
  onRemove,
  onDelete,
  onImport,
  onCustomize,
  onRefresh,
  onOpenGallery,
  onShare,
  onPublish,
  onClose,
}: LibraryProps) {
  const [view, setView] = useState<View>('list')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [buildOpen, setBuildOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [sharedId, setSharedId] = useState<string | null>(null)

  const closeTimer = useRef<number | null>(null)
  const shareTimer = useRef<number | null>(null)

  function shareRow(id: string) {
    if (!onShare) return
    if (onShare(id)) {
      setSharedId(id)
      if (shareTimer.current != null) window.clearTimeout(shareTimer.current)
      shareTimer.current = window.setTimeout(() => setSharedId(null), 1600)
    }
  }
  const mainRef = useRef<HTMLDivElement>(null)

  // onImport stays on the contract (DashboardGrid owns the importTile pipe), but
  // the "Add a tile" drawer installs envelopes directly now, so reference it here
  // to keep the socket type-checked against this panel.
  void onImport

  const placed = useMemo(() => new Set(order), [order])

  /* Build every row from the real registries + the user's tiles. */
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []

    // Library first: always on, locked.
    out.push({
      id: LIBRARY_TILE.id,
      name: LIBRARY_TILE.label,
      sublabel: 'Your app manager',
      catKey: 'core',
      chip: 'Core',
      isCore: true,
      tone: 'core',
      state: placed.has(LIBRARY_TILE.id) ? 'dash' : 'lib',
      date: 'Always on',
      glyph: LIBRARY_TILE.glyph,
      locked: true,
    })

    // Vee.
    out.push({
      id: VEE_TILE.id,
      name: VEE_TILE.label,
      sublabel: VEE_TILE.kicker,
      catKey: 'core',
      chip: 'Core',
      isCore: true,
      tone: 'core',
      state: placed.has(VEE_TILE.id) ? 'dash' : 'lib',
      date: 'Built in',
      glyph: veeGlyph,
    })

    // The pre-installed tiles, in registry order. The de-cored side projects
    // (Peak / Brand, launch strip 2026-07-12; Finance stayed core) land on the
    // "Side projects" shelf with a slate chip so the Library visibly holds more
    // than the core apps; they still place + remove like any core tile.
    ;(Object.keys(CORE_TILES) as CoreTileId[]).forEach((id) => {
      const t = CORE_TILES[id]
      const side = isSideProjectId(t.id)
      out.push({
        id: t.id,
        name: t.label,
        sublabel: CORE_KICKER[id],
        catKey: side ? 'side' : 'core',
        chip: side ? 'Side project' : 'Core',
        isCore: !side,
        tone: side ? 'side' : 'core',
        state: placed.has(t.id) ? 'dash' : 'lib',
        date: 'Built in',
        glyph: t.glyph,
      })
    })

    // Create (de-cored at launch): the no-AI quick builder rides the side-
    // projects shelf too, placeable and removable like any core, never seeded.
    out.push({
      id: CREATE_TILE.id,
      name: CREATE_TILE.label,
      sublabel: 'Quick tile builder',
      catKey: 'side',
      chip: 'Side project',
      isCore: false,
      tone: 'side',
      state: placed.has(CREATE_TILE.id) ? 'dash' : 'lib',
      date: 'Built in',
      glyph: CREATE_TILE.glyph,
    })

    // The user's own built tiles (newest first, already sorted by tileStore).
    tiles.forEach((tile) => {
      const category = tile.category || 'Custom'
      const catKey = catKeyFromCategory(category)
      const catLabel = categoryLabel(catKey)
      out.push({
        id: tile.id,
        name: tile.name,
        sublabel: catLabel,
        catKey,
        chip: catLabel,
        isCore: false,
        tone: 'mine',
        state: placed.has(tile.id) ? 'dash' : 'lib',
        date: formatDate(tile.createdAt),
        glyph: tileGlyph,
        user: true,
        veeRead: Boolean(tile.kind),
      })
    })

    return out
  }, [tiles, placed])

  /* Live counts for the sidebar + mobile pills, computed from the real rows.
   * Seed only the views; every state + catKey is incremented dynamically so no
   * category bucket is ever orphaned (rating / money / done / any custom text). */
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, dash: 0, lib: 0 }
    rows.forEach((r) => {
      c[r.state] = (c[r.state] || 0) + 1
      c[r.catKey] = (c[r.catKey] || 0) + 1
    })
    return c
  }, [rows])

  /* The optional categories (rating / money / done / any custom text) that are
   * NOT always shown but have at least one tile, so nothing is unreachable. */
  const extraCategories = useMemo(() => {
    const always = new Set(ALWAYS_CATEGORIES.map((c) => c.key))
    const seen: string[] = []
    rows.forEach((r) => {
      if (!always.has(r.catKey) && !seen.includes(r.catKey) && (counts[r.catKey] ?? 0) > 0) {
        seen.push(r.catKey)
      }
    })
    return seen
  }, [rows, counts])

  function rowMatches(r: Row): boolean {
    let ok = true
    if (filter === 'dash') ok = r.state === 'dash'
    else if (filter === 'lib') ok = r.state === 'lib'
    else if (filter !== 'all') ok = r.catKey === filter
    if (ok && query.trim()) {
      const q = query.trim().toLowerCase()
      ok = r.name.toLowerCase().includes(q) || r.sublabel.toLowerCase().includes(q)
    }
    return ok
  }

  const visible = rows.filter(rowMatches)
  const dashRows = visible.filter((r) => r.state === 'dash')
  const libRows = visible.filter((r) => r.state === 'lib')

  function startClose() {
    setClosing(true)
    // Match the 400ms CSS close transition so the fade/scale tail is not clipped.
    closeTimer.current = window.setTimeout(onClose, 400)
  }

  function placeRow(id: string) {
    // Any other action disarms a pending delete confirm.
    setConfirmId(null)
    onPlace(id)
  }
  function removeRow(id: string) {
    setConfirmId(null)
    onRemove(id)
  }
  function deleteRow(id: string) {
    if (confirmId === id) {
      setConfirmId(null)
      onDelete(id)
    } else {
      setConfirmId(id)
    }
  }

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All tiles' },
    { key: 'dash', label: 'On dashboard' },
    { key: 'lib', label: 'In library' },
    ...ALWAYS_CATEGORIES.map((c) => ({ key: c.key as Filter, label: c.label })),
    ...extraCategories.map((k) => ({ key: k as Filter, label: categoryLabel(k) })),
  ]

  // Escape is bound at the document so it works no matter where focus sits (the
  // panel opens with focus outside it). Priority: if the build drawer is open let
  // it own Escape (it closes its own full-view first), else close the panel.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (buildOpen) return
      setConfirmId(null)
      startClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // startClose is stable enough for this overlay's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildOpen])

  // A pending delete confirm must never survive a context switch.
  useEffect(() => {
    setConfirmId(null)
  }, [filter, query])

  // Never let the close timer fire after the panel unmounts.
  useEffect(() => {
    return () => {
      if (closeTimer.current != null) window.clearTimeout(closeTimer.current)
      if (shareTimer.current != null) window.clearTimeout(shareTimer.current)
    }
  }, [])

  return (
    <div className={styles.root}>
      <div className={`${styles.scrim} ${closing ? styles.closing : ''}`} onMouseDown={(e) => {
        if (e.target === e.currentTarget) startClose()
      }}>
        <div className={styles.win} role="dialog" aria-label="Library" aria-modal="true">
          {/* top chrome */}
          <div className={styles.chrome}>
            <div className={styles.brand}>
              <div className={styles.title}>
                <span className={styles.lock} title="Always on your dashboard">
                  <Icon.Lock />
                </span>
                Library
              </div>
            </div>
            <div className={styles.toolbar}>
              <div className={styles.seg} role="tablist" aria-label="View">
                <button
                  className={view === 'list' ? styles.on : ''}
                  role="tab"
                  aria-selected={view === 'list'}
                  onClick={() => setView('list')}
                >
                  <Icon.List />
                  List
                </button>
                <button
                  className={view === 'gallery' ? styles.on : ''}
                  role="tab"
                  aria-selected={view === 'gallery'}
                  onClick={() => setView('gallery')}
                >
                  <Icon.Grid />
                  Gallery
                </button>
              </div>
              <div className={styles.search}>
                <Icon.Search />
                <input
                  type="text"
                  placeholder="Search tiles"
                  spellCheck={false}
                  aria-label="Search tiles"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className={styles.toolspacer} />
              {onOpenGallery && (
                <button className={styles.galleryBtn} onClick={onOpenGallery}>
                  <Icon.Grid />
                  Gallery
                </button>
              )}
              <button className={styles.buildBtn} onClick={() => setBuildOpen(true)}>
                <Icon.Plus />
                Add a tile
              </button>
              <button className={styles.x} aria-label="Close" onClick={startClose}>
                <Icon.Close />
              </button>
            </div>
          </div>

          {/* body */}
          <div className={styles.body}>
            {/* sidebar */}
            <nav className={styles.side} aria-label="Collections">
              <div className={styles.sgroup}>
                <div className={styles.sglabel}>Views</div>
                <SideNav filter="all" active={filter} count={counts.all} onPick={setFilter} icon={<Icon.Grid17 />}>
                  All tiles
                </SideNav>
                <SideNav filter="dash" active={filter} count={counts.dash} onPick={setFilter} icon={<Icon.Check />}>
                  On dashboard
                </SideNav>
                <SideNav filter="lib" active={filter} count={counts.lib} onPick={setFilter} icon={<Icon.Folder />}>
                  In library
                </SideNav>
              </div>
              <div className={styles.sgroup}>
                <div className={styles.sglabel}>Categories</div>
                {ALWAYS_CATEGORIES.map((c) => (
                  <SideNav
                    key={c.key}
                    filter={c.key}
                    active={filter}
                    count={counts[c.key] ?? 0}
                    onPick={setFilter}
                    swatch={c.swatch}
                    title={categoryDesc(c.key)}
                  >
                    {c.label}
                  </SideNav>
                ))}
                {extraCategories.map((k) => (
                  <SideNav
                    key={k}
                    filter={k}
                    active={filter}
                    count={counts[k] ?? 0}
                    onPick={setFilter}
                    swatch="mine"
                    title={categoryDesc(k)}
                  >
                    {categoryLabel(k)}
                  </SideNav>
                ))}
              </div>
            </nav>

            {/* main */}
            <div className={styles.main} data-view={view} ref={mainRef}>
              {/* mobile collections row */}
              <div className={styles.mside} aria-label="Collections">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    className={`${styles.pill} ${filter === f.key ? styles.on : ''}`}
                    onClick={() => setFilter(f.key)}
                  >
                    {f.label} <span className={styles.cnt}>{counts[f.key] ?? 0}</span>
                  </button>
                ))}
              </div>

              <div className={styles.scroller}>
                <div className={styles.cols}>
                  <span>Name</span>
                  <span>Category</span>
                  <span>Added</span>
                  <span className={styles.right}>Actions</span>
                </div>

                {/* ON DASHBOARD */}
                {dashRows.length > 0 && (
                  <>
                    <div className={styles.seclabel}>
                      <span className={styles.pip} />
                      On your dashboard <span className={styles.c}>{dashRows.length}</span>
                    </div>
                    <div className={styles.list}>
                      {dashRows.map((r) => (
                        <RowItem
                          key={r.id}
                          row={r}
                          confirming={confirmId === r.id}
                          shared={sharedId === r.id}
                          onShare={onShare ? shareRow : undefined}
                          onPublish={onPublish}
                          onPlace={placeRow}
                          onRemove={removeRow}
                          onDelete={deleteRow}
                          onCustomize={onCustomize}
                          onClose={onClose}
                        />
                      ))}
                    </div>
                  </>
                )}

                {/* IN LIBRARY */}
                {libRows.length > 0 && (
                  <>
                    <div className={styles.seclabel}>
                      <span className={`${styles.pip} ${styles.dim}`} />
                      In your library <span className={styles.c}>{libRows.length}</span>
                    </div>
                    <div className={styles.list}>
                      {libRows.map((r) => (
                        <RowItem
                          key={r.id}
                          row={r}
                          confirming={confirmId === r.id}
                          shared={sharedId === r.id}
                          onShare={onShare ? shareRow : undefined}
                          onPublish={onPublish}
                          onPlace={placeRow}
                          onRemove={removeRow}
                          onDelete={deleteRow}
                          onCustomize={onCustomize}
                          onClose={onClose}
                        />
                      ))}
                    </div>
                  </>
                )}

                {/* empty state */}
                {visible.length === 0 && (
                  <div className={styles.empty}>
                    <div className={styles.ei}>
                      <Icon.Folder />
                    </div>
                    <div className={styles.et}>No tiles here yet</div>
                    <div className={styles.eb}>Add a tile to get started.</div>
                  </div>
                )}

                <div className={styles.foot}>
                  <button className={styles.done} onClick={startClose}>
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* The one "Add a tile" door: the build flow as a drawer over the Library.
          CreateTile is a full-screen scrim+win overlay, so it sits on top. It
          accepts both raw HTML (build) and a TileEnvelope (upload), and on Keep
          we re-read the tile list so the new tile shows in "In your library". */}
      {buildOpen && (
        <CreateTile
          userId={userId}
          onClose={() => setBuildOpen(false)}
          onKept={() => onRefresh?.()}
        />
      )}
    </div>
  )
}

/* ---- one list / gallery row ---- */
function RowItem({
  row,
  confirming,
  shared,
  onShare,
  onPublish,
  onPlace,
  onRemove,
  onDelete,
  onCustomize,
  onClose,
}: {
  row: Row
  confirming: boolean
  shared: boolean
  onShare?: (id: string) => void
  onPublish?: (id: string) => void
  onPlace: (id: string) => void
  onRemove: (id: string) => void
  onDelete: (id: string) => void
  onCustomize: (id: string) => void
  onClose: () => void
}) {
  return (
    <div
      className={`${styles.item} ${styles.fade}`}
      data-state={row.state}
      data-cat={row.catKey}
      data-locked={row.locked ? '1' : undefined}
    >
      <div className={styles.cellName}>
        <div className={styles.art}>
          <span className={`${styles.tileicon} ${toneClass(row.tone)}`}>{row.glyph}</span>
        </div>
        <div className={styles.namewrap}>
          <div className={styles.nm}>
            {row.name}
            {row.locked && (
              <span className={styles.lockmini} title="Always on your dashboard">
                <Icon.Lock />
              </span>
            )}
          </div>
          <div className={styles.sublabel}>{row.sublabel}</div>
        </div>
      </div>
      <div className={styles.chipCell}>
        <span className={`${styles.chip} ${toneClass(row.tone)}`}>{row.chip}</span>
        {row.veeRead && (
          <span className={`${styles.chip} ${styles.vee}`} title="Vee can read this tile's numbers">
            Vee
          </span>
        )}
      </div>
      <div className={styles.metaRow}>
        <div className={styles.cellDate}>{row.date}</div>
        <div className={styles.acts}>
          {row.locked ? (
            <span className={styles.lockedtag}>
              <Icon.Lock />
              Locked
            </span>
          ) : (
            <>
              {row.user && (
                <Link
                  className={`${styles.a} ${styles.icon}`}
                  title="Edit tile"
                  aria-label="Edit tile"
                  href={`/app/create?tile=${encodeURIComponent(row.id)}`}
                  onClick={onClose}
                >
                  <Icon.Pencil />
                </Link>
              )}
              {row.user && onShare && (
                <button
                  className={`${styles.a} ${styles.icon}`}
                  title={shared ? 'Link copied' : 'Share'}
                  aria-label={shared ? 'Link copied' : 'Share'}
                  onClick={() => onShare(row.id)}
                >
                  {shared ? <Icon.Check /> : <Icon.Share />}
                </button>
              )}
              {/* Publish is OFF for launch (Alex, 2026-07-11): community =
                  the Library only, and the claim-your-handle gate it opened
                  is retired with it. The Arts District pipeline stays intact
                  underneath; restore by rendering this button again. */}
              {false && row.user && onPublish && (
                <button
                  className={`${styles.a} ${styles.icon}`}
                  title="Publish to the Arts District"
                  aria-label="Publish"
                  onClick={() => onPublish!(row.id)}
                >
                  <Icon.Upload />
                </button>
              )}
              {row.user && (
                <button
                  className={`${styles.a} ${styles.icon} ${styles.del}${confirming ? ' ' + styles.confirming : ''}`}
                  title={confirming ? 'Tap again to confirm' : 'Delete'}
                  aria-label={confirming ? 'Tap again to confirm delete' : 'Delete'}
                  onClick={() => onDelete(row.id)}
                >
                  <Icon.Trash />
                </button>
              )}
              {row.state === 'dash' ? (
                <button className={`${styles.a} ${styles.sub}`} onClick={() => onRemove(row.id)}>
                  Remove
                </button>
              ) : (
                <button className={`${styles.a} ${styles.add}`} onClick={() => onPlace(row.id)}>
                  Add to dashboard
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---- one sidebar nav button ---- */
function SideNav({
  filter,
  active,
  count,
  onPick,
  icon,
  swatch,
  title,
  children,
}: {
  filter: Filter
  active: Filter
  count: number
  onPick: (f: Filter) => void
  icon?: React.ReactNode
  swatch?: 'core' | 'side' | 'mine'
  title?: string
  children: React.ReactNode
}) {
  const swatchClass =
    swatch === 'core' ? styles.swatchCore : swatch === 'side' ? styles.swatchExtra : styles.swatchMine
  return (
    <button className={`${styles.nav} ${active === filter ? styles.on : ''}`} onClick={() => onPick(filter)} title={title}>
      <span className={styles.gi}>
        {swatch ? (
          <span className={`${styles.swatch} ${swatchClass}`} />
        ) : (
          icon
        )}
      </span>
      <span className={styles.lab}>{children}</span>
      <span className={styles.cnt}>{count}</span>
    </button>
  )
}

/* The Vee glyph (mint chat orb) and the default user-tile glyph, kept inline so
 * Library has no dependency on the live Vee tile component. */
const veeGlyph = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4c4 0 7 2.7 7 6.3 0 3.6-3 6.3-7 6.3-.8 0-1.5-.1-2.2-.3L6 18l.7-2.8C5.6 14 5 12.2 5 10.3 5 6.7 8 4 12 4Z" />
    <circle cx="9.6" cy="10.3" r=".7" fill="currentColor" />
    <circle cx="14.4" cy="10.3" r=".7" fill="currentColor" />
  </svg>
)
const tileGlyph = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" />
  </svg>
)

/* ---- inline line glyphs (no emoji, matching the demo strokes) ---- */
const Icon = {
  Lock: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  ),
  List: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <circle cx="4.5" cy="6" r=".6" />
      <circle cx="4.5" cy="12" r=".6" />
      <circle cx="4.5" cy="18" r=".6" />
    </svg>
  ),
  Grid: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="7" height="7" rx="1.8" />
      <rect x="13" y="4" width="7" height="7" rx="1.8" />
      <rect x="4" y="13" width="7" height="7" rx="1.8" />
      <rect x="13" y="13" width="7" height="7" rx="1.8" />
    </svg>
  ),
  Grid17: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" />
    </svg>
  ),
  Check: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
  ),
  Folder: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19V6a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
    </svg>
  ),
  Search: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  ),
  Close: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  ),
  Plus: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Pencil: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  ),
  Share: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6" />
    </svg>
  ),
  Upload: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  ),
  Trash: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M10 4h4M9 7l.6 12a1 1 0 0 0 1 1h2.8a1 1 0 0 0 1-1L15 7" />
    </svg>
  ),
}

/* isLibraryId / isCoreId are part of the locked contract; referenced here so a
 * future change to either is type-checked against this panel. */
void isLibraryId
void isCoreId
