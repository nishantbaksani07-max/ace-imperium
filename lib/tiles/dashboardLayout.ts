import type { Tile } from './types'

/**
 * dashboardLayout decides WHICH of a user's kept tiles sit on their actual home
 * dashboard, and in what order. A tile can exist in the registry (tileStore)
 * without being placed; this is the placement layer on top.
 *
 * v1 is localStorage, scoped per user, mirroring tileStore so the same Supabase
 * swap seam applies later (a `tiles.on_dashboard` flag + an order column). One
 * key per user, namespaced by userId so one user's layout can never read
 * another's.
 *
 * Key:
 *   vitality:<userId>:dashboard   -> string[]  (placed tile ids, in display order)
 */

const key = (userId: string) => `vitality:${userId}:dashboard`
const hasStorage = () => typeof window !== 'undefined' && !!window.localStorage

function read(userId: string): string[] {
  if (!hasStorage()) return []
  try {
    const raw = window.localStorage.getItem(key(userId))
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function write(userId: string, ids: string[]) {
  if (!hasStorage()) return
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(ids))
  } catch {
    /* quota / blocked. fail quiet, the session still works */
  }
}

/** The placed tile ids, in display order. */
function getPlaced(userId: string): string[] {
  return read(userId)
}

/** Place a tile on the dashboard (append, idempotent). Returns the new order. */
function add(userId: string, tileId: string): string[] {
  const ids = read(userId)
  if (!ids.includes(tileId)) ids.push(tileId)
  write(userId, ids)
  return ids
}

/** Take a tile off the dashboard. Returns the new order. */
function remove(userId: string, tileId: string): string[] {
  const ids = read(userId).filter((id) => id !== tileId)
  write(userId, ids)
  return ids
}

/** Replace the whole order (drag-to-reorder). Returns the order. */
function setPlaced(userId: string, ids: string[]): string[] {
  const clean = ids.filter((x): x is string => typeof x === 'string')
  write(userId, clean)
  return clean
}

/**
 * Resolve the placed ids to real tiles, in layout order, dropping any id whose
 * tile no longer exists (deleted from the registry). The dashboard renders this.
 */
function placed(userId: string, tiles: Tile[]): Tile[] {
  const byId = new Map(tiles.map((t) => [t.id, t]))
  return read(userId)
    .map((id) => byId.get(id))
    .filter((t): t is Tile => !!t)
}

export const dashboardLayout = { getPlaced, add, remove, setPlaced, placed }
