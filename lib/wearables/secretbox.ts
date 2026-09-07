import 'server-only'

import { sealCredentials, openCredentials, type Envelope } from '@/lib/connectors/crypto'

/**
 * At-rest sealing for a single wearable secret (client_secret, OAuth
 * access/refresh token) stored in a `wearable_connections` text column.
 *
 * We reuse the connector AES-256-GCM helper (`lib/connectors/crypto`): the raw
 * secret is wrapped in a `{ s }` record, sealed to an envelope, and JSON-encoded
 * into the column. When `CONNECTOR_ENCRYPTION_KEY` is unset the helper no-ops to
 * a `v:0` plaintext envelope, so local/dogfood flows still work; setting the key
 * upgrades every subsequent write to real encryption with no schema change.
 *
 * Backward-compatible on read: rows written before this change hold the raw
 * secret (not an envelope), so anything that isn't a well-formed sealed envelope
 * is returned verbatim. WHOOP/Oura secrets and tokens are opaque strings (or
 * dotted JWTs) that never parse as a `{ v, data }` object, so the detection
 * never mistakes a legacy plaintext secret for an envelope.
 *
 * Only `client_secret` and the token columns are sealed. `client_id` is not a
 * secret (it rides in the OAuth redirect URL) and stays plaintext so the
 * "has this user saved keys?" checks keep working.
 */

function isEnvelope(x: unknown): x is Envelope {
  if (!x || typeof x !== 'object') return false
  const e = x as Record<string, unknown>
  if (e.v === 0) return typeof e.data === 'string'
  if (e.v === 1) return typeof e.iv === 'string' && typeof e.tag === 'string' && typeof e.data === 'string'
  return false
}

/** Seal a secret for storage in a text column. Returns the JSON-encoded envelope. */
export function sealSecret(value: string): string {
  return JSON.stringify(sealCredentials({ s: value }))
}

/**
 * Read a stored secret back. Returns null for null/empty input. Legacy plaintext
 * values (and any string that isn't our envelope) are returned verbatim.
 */
export function openSecret(stored: string | null | undefined): string | null {
  if (stored == null || stored === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(stored)
  } catch {
    return stored // legacy plaintext secret
  }
  if (!isEnvelope(parsed)) return stored // some other string that isn't our envelope
  const opened = openCredentials(parsed)
  const s = (opened as { s?: unknown }).s
  return typeof s === 'string' ? s : null
}
