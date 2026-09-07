import { SIZE_PRESETS, clampSpanToCols, type TileSize } from './tileSkin'

/**
 * The dashboard's tile layout, computed as a PURE FUNCTION of (order, sizes, cols).
 *
 * This is the whole reason edit-mode drag can be bulletproof: positions are never
 * stored and never guessed — they are derived by first-fit packing, which only ever
 * places a tile in cells that are already free. Two tiles overlapping, or a tile
 * escaping the grid, is therefore impossible by construction, for any user, ever.
 * `__tests__/packLayout.test.ts` proves exactly that with property tests.
 */

export type Footprint = { id: string; w: number; h: number }
export type PackedPos = { x: number; y: number; w: number; h: number }
export type PackResult = { positions: Map<string, PackedPos>; rows: number }

/** The safe floor a degenerate size falls back to: the 1x1 utility tile. Using the
 *  real preset (not a literal) keeps one source of truth if the small size changes. */
const FALLBACK_SPAN = SIZE_PRESETS.s

/** Coerce anything to a positive integer >= min, defaulting when NaN / Infinity /
 *  fractional / negative. This is what keeps the packer from ever hanging on a
 *  degenerate width, height, or column count (a non-positive span makes the
 *  first-fit scan `x + w <= cols` unsatisfiable, which would loop forever). */
function posInt(v: number, fallback: number, min = 1): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  const n = Math.floor(v)
  return n >= min ? n : fallback
}

/**
 * A tile id + its size → the footprint the packer places, width clamped to cols.
 *
 * Robust to an unknown / degenerate size (a stale persisted token, a hand-edited
 * board, a future size not yet in SIZE_PRESETS): rather than throw on a missing
 * preset, it falls back to the 1x1 utility footprint so the tile always lands.
 * `cols` is likewise coerced to a sane column count.
 */
export function footprintFor(id: string, size: TileSize, cols: number): Footprint {
  const safeCols = posInt(cols, 1)
  const preset = SIZE_PRESETS[size] ?? FALLBACK_SPAN
  const span = clampSpanToCols(preset, safeCols)
  return { id, w: span.cols, h: span.rows }
}

/**
 * Pack tiles top-left into a `cols`-wide grid, in order, with no gaps left behind
 * (dense first-fit). Returns each tile's cell rect plus the total row count.
 */
export function packTiles(tiles: Footprint[], cols: number): PackResult {
  // Coerce the column count to at least 1 so a bad `cols` (0, NaN, fractional,
  // negative) can never make the first-fit scan unsatisfiable and hang.
  const gridCols = posInt(cols, 1)
  const occupied: boolean[][] = [] // occupied[y][x]
  const ensureRow = (y: number) => {
    while (occupied.length <= y) occupied.push(new Array(gridCols).fill(false))
  }
  const fits = (x: number, y: number, w: number, h: number): boolean => {
    if (x < 0 || x + w > gridCols) return false
    for (let dy = 0; dy < h; dy++) {
      ensureRow(y + dy)
      for (let dx = 0; dx < w; dx++) if (occupied[y + dy][x + dx]) return false
    }
    return true
  }
  const occupy = (x: number, y: number, w: number, h: number) => {
    for (let dy = 0; dy < h; dy++) {
      ensureRow(y + dy)
      for (let dx = 0; dx < w; dx++) occupied[y + dy][x + dx] = true
    }
  }

  const positions = new Map<string, PackedPos>()
  for (const t of tiles) {
    // A missing / duplicate id would clobber a Map entry; skip anything without a
    // usable id so the returned positions always align 1:1 with real tiles.
    if (!t || typeof t.id !== 'string') continue
    // Sanitize the footprint to positive integers, width capped to the grid, so
    // every tile is placeable and the scan always terminates. Valid inputs are
    // unchanged (a clean 1..cols x >=1 footprint coerces to itself).
    const w = Math.min(posInt(t.w, 1), gridCols)
    const h = posInt(t.h, 1)
    let placed = false
    // The first free cell for a `w`-wide tile is at most a couple of rows below
    // the tallest occupied row, so `occupied.length + h + 1` is a generous ceiling
    // that can never be hit by a real pack yet guarantees the loop is bounded.
    const maxY = occupied.length + h + 1
    for (let y = 0; !placed && y <= maxY; y++) {
      ensureRow(y)
      for (let x = 0; x + w <= gridCols; x++) {
        if (fits(x, y, w, h)) {
          occupy(x, y, w, h)
          positions.set(t.id, { x, y, w, h })
          placed = true
          break
        }
      }
    }
  }
  return { positions, rows: occupied.length }
}
