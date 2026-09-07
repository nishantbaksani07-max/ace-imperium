import type { Tile, TileEnvelope } from './types'
import type { Skin } from './tileSkin'

/**
 * Tile sharing (Arts District v1). A tile is already a self-contained TileEnvelope,
 * so "share with a friend" is pure client work: pack the envelope into one opaque,
 * paste-safe code. The friend pastes it into "Add a tile" and it installs through
 * the LOCKED tileStore.importTile, exactly like a built or uploaded tile. No
 * backend, no accounts, and it cannot break the locked contract (it only consumes
 * it). See docs/superpowers/specs/2026-06-30-arts-district-social-platform-design.md.
 *
 * Hardening rule: NOTHING in this module throws on user input. A pasted code is
 * attacker-controlled text (a friend can paste anything), so every parse path
 * returns a typed failure the "Add a tile" door can show as a friendly line,
 * never a stack trace. The two public entry points keep their old signatures:
 *   - parseTileCode -> TileEnvelope | null  (null == "not a usable code")
 *   - isTileCode    -> boolean              (cheap prefix check)
 * parseTileCodeResult is the new helper that also hands back WHY it failed.
 */

const PREFIX = 'vitality:tile:'

/**
 * Max decoded html a share code may carry, mirroring tileStore.MAX_TILE_HTML and
 * publish.MAX_PUBLISH_HTML (1MB). A shared tile MUST stay importable, and this
 * stops a giant paste from being decoded/parsed at all. We also cap the raw code
 * itself well above that (base64 is ~4/3 the byte size, plus the envelope's other
 * fields) so a hostile multi-megabyte paste is rejected before any base64 work.
 */
export const MAX_SHARE_HTML = 1024 * 1024
const MAX_CODE_LENGTH = Math.ceil((MAX_SHARE_HTML * 4) / 3) + 4096

/** Every reason parseTileCodeResult can fail with, so callers can map to copy. */
export type ShareCodeFailReason =
  | 'not_a_code' // no vitality:tile: prefix (caller should try plain JSON / raw HTML)
  | 'too_large' // the pasted code (or its decoded payload) exceeds the size we will accept
  | 'bad_base64' // the payload after the prefix is not decodable base64url
  | 'bad_json' // decoded fine but is not valid JSON
  | 'bad_shape' // valid JSON but not a usable envelope (missing/blank name or html)

/** Discriminated result the friendly "Add a tile" path can branch on. */
export type ShareCodeResult =
  | { ok: true; envelope: TileEnvelope }
  | { ok: false; reason: ShareCodeFailReason }

/**
 * UTF-8 safe base64url (a tile's html is arbitrary text incl. non-latin1), with
 * padding stripped. We percent-encode to UTF-8 bytes first so raw btoa is never
 * handed a multi-byte character (which would throw); the reverse un-does it.
 */
function b64urlEncode(s: string): string {
  const b64 = btoa(unescape(encodeURIComponent(s)))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Decode a base64url string back to its UTF-8 text, or null if the input is not
 * valid base64url. Never throws: atob throws on malformed base64 and
 * decodeURIComponent throws on a truncated multi-byte tail, so both are caught.
 */
function b64urlDecode(s: string): string | null {
  try {
    // Reject any character outside the base64url alphabet up front, so a paste
    // like "!!! not base64 !!!" fails cleanly rather than relying on atob's
    // (looser, environment-dependent) validation of stray characters.
    if (!/^[A-Za-z0-9_-]*$/.test(s)) return null
    const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad
    return decodeURIComponent(escape(atob(b64)))
  } catch {
    return null
  }
}

/** True when a value is a non-empty, non-blank string (envelope name/html gate). */
function isNonBlankString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

/**
 * Fold a Kept tile + its current skin into a TileEnvelope (the canonical payload
 * importTile consumes). Single source of truth so sharing (v1) and publishing
 * (v3) build the exact same shape and can never diverge.
 */
export function tileToEnvelope(tile: Tile, skin: Skin): TileEnvelope {
  const env: TileEnvelope = {
    name: (skin.name || tile.name).trim(),
    html: tile.html,
  }
  if (tile.category) env.category = tile.category
  // The tile's declared stream (report contract) travels WITH the tile: a
  // shared/published beer tile must keep kind:'intake' + goalDirection:'down',
  // or the installer's copy silently flips scoring mode (PATCH21).
  if (tile.key) env.key = tile.key
  if (tile.label) env.label = tile.label
  if (tile.kind) env.kind = tile.kind
  if (tile.goalDirection) env.goalDirection = tile.goalDirection
  if (skin.design) env.design = skin.design
  if (skin.color) env.color = skin.color
  if (skin.size) env.size = skin.size
  return env
}

/** Pack a Kept tile (its current skin folded in) into a shareable code. */
export function exportTileCode(tile: Tile, skin: Skin): string {
  return PREFIX + b64urlEncode(JSON.stringify(tileToEnvelope(tile, skin)))
}

/**
 * Parse a pasted share code into a typed result. Never throws: every failure
 * mode (no prefix, oversized paste, malformed base64, non-JSON, wrong shape)
 * comes back as { ok: false, reason } so the "Add a tile" door can show a
 * friendly line. On success the envelope is validated to the same minimum
 * importTile needs: a non-empty name and html.
 */
export function parseTileCodeResult(text: string): ShareCodeResult {
  const t = (typeof text === 'string' ? text : '').trim()
  if (!t.startsWith(PREFIX)) return { ok: false, reason: 'not_a_code' }

  // Reject a hostile multi-megabyte paste before doing any base64 / JSON work.
  if (t.length > MAX_CODE_LENGTH) return { ok: false, reason: 'too_large' }

  const decoded = b64urlDecode(t.slice(PREFIX.length))
  if (decoded === null) return { ok: false, reason: 'bad_base64' }

  // A short code can still decode to an oversized string; cap the decoded bytes
  // (its html is the bulk) so we never hand importTile something un-addable.
  if (decoded.length > MAX_SHARE_HTML) return { ok: false, reason: 'too_large' }

  let parsed: unknown
  try {
    parsed = JSON.parse(decoded)
  } catch {
    return { ok: false, reason: 'bad_json' }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'bad_shape' }
  }
  const e = parsed as TileEnvelope
  if (!isNonBlankString(e.name) || !isNonBlankString(e.html)) {
    return { ok: false, reason: 'bad_shape' }
  }
  if (e.html.length > MAX_SHARE_HTML) return { ok: false, reason: 'too_large' }

  return { ok: true, envelope: e }
}

/**
 * Parse a pasted share code back into an envelope, or null if it is not a usable
 * one (so the caller can fall through to plain JSON / raw HTML). Thin wrapper
 * over parseTileCodeResult that keeps the original TileEnvelope | null contract
 * every existing caller relies on. Never throws.
 */
export function parseTileCode(text: string): TileEnvelope | null {
  const r = parseTileCodeResult(text)
  return r.ok ? r.envelope : null
}

/** True when a pasted string looks like a tile share code (cheap prefix check, never throws). */
export function isTileCode(text: string): boolean {
  return typeof text === 'string' && text.trim().startsWith(PREFIX)
}
