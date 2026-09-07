import { DEFAULT_HOME_ORDER, LIBRARY_TILE, FORGE_TILE } from './coreTiles'

/**
 * homeLayout is the single ordered list of EVERY tile on a user's home
 * dashboard: the pre-installed core tiles, the optional Vee tile, and the user's
 * own built tiles, all interleaved in one order. The dashboard renders this list
 * into one grid, so core tiles, Vee, and user tiles drag, resize, re-order, and
 * can be removed as equals. Nothing is locked — Vee is just one optional tile now
 * (Aikido pivot), re-addable from the Add-tile gallery if removed.
 *
 * A fresh dashboard seeds with DEFAULT_HOME_ORDER (which reproduces the loved old
 * composition once the seeded sizes + dense flow resolve).
 *
 * v1 is localStorage, per user, mirroring tileStore / tileSkin so the same
 * Supabase swap seam applies later.
 *
 * Key:
 *   vitality:<userId>:home  -> string[]  (all home tile ids, in display order)
 */

const key = (userId: string) => `vitality:${userId}:home`
const hasStorage = () => typeof window !== 'undefined' && !!window.localStorage

function readRaw(userId: string): string[] | null {
  if (!hasStorage()) return null
  try {
    const raw = window.localStorage.getItem(key(userId))
    if (!raw) return null
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : null
  } catch {
    return null
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

/** Where Library sits in the seeded default: the prominent second-row slot. */
const LIBRARY_DEFAULT_INDEX = Math.max(0, DEFAULT_HOME_ORDER.indexOf(LIBRARY_TILE.id))

/** Where Forge sits in the seeded default: beside Library (the storefront). */
const FORGE_DEFAULT_INDEX = Math.max(0, DEFAULT_HOME_ORDER.indexOf(FORGE_TILE.id))

/**
 * The full home order. A fresh dashboard seeds from DEFAULT_HOME_ORDER (the
 * launch spine, which includes the locked Library + Forge). For a returning
 * user whose stored order predates a locked tile, we backfill it at its
 * prominent default slot rather than dumping it last. Create is deliberately
 * NOT backfilled anymore (launch strip, 2026-07-11): users who have it keep
 * it (their stored order already lists it) and may now remove it; new users
 * meet it in the Library, not on the board.
 */
function getOrder(userId: string): string[] {
  const stored = readRaw(userId)
  if (!stored) {
    // Fresh dashboard: persist the seeded default so storage and the rendered
    // order never diverge.
    const seeded = [...DEFAULT_HOME_ORDER]
    write(userId, seeded)
    return [...seeded]
  }
  let changed = false
  if (!stored.includes(LIBRARY_TILE.id)) {
    stored.splice(Math.min(LIBRARY_DEFAULT_INDEX, stored.length), 0, LIBRARY_TILE.id)
    changed = true
  }
  if (!stored.includes(FORGE_TILE.id)) {
    stored.splice(Math.min(FORGE_DEFAULT_INDEX, stored.length), 0, FORGE_TILE.id)
    changed = true
  }
  if (changed) write(userId, stored)
  return stored
}

/** Place a tile on the dashboard (append, idempotent). Returns the new order. */
function add(userId: string, id: string): string[] {
  const ids = getOrder(userId)
  if (!ids.includes(id)) ids.push(id)
  write(userId, ids)
  return ids
}

/** Take a tile off the dashboard (incl. Vee — nothing is locked). Returns the order. */
function remove(userId: string, id: string): string[] {
  const ids = getOrder(userId).filter((x) => x !== id)
  write(userId, ids)
  return ids
}

/** Replace the whole order (drag-to-reorder). Returns the order. */
function setOrder(userId: string, ids: string[]): string[] {
  const clean = ids.filter((x): x is string => typeof x === 'string')
  write(userId, clean)
  return clean
}

/** Wipe customization back to the default arrangement. */
function reset(userId: string): string[] {
  if (hasStorage()) {
    try {
      window.localStorage.removeItem(key(userId))
    } catch {
      /* fail quiet */
    }
  }
  // Re-seed the persisted default (with the locked Library tile) so the next
  // read returns the same order that is now in storage. Return a fresh copy.
  const seeded = [...DEFAULT_HOME_ORDER]
  write(userId, seeded)
  return [...seeded]
}

export const homeLayout = { getOrder, add, remove, setOrder, reset }
