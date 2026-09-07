import 'server-only'

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'

/**
 * At-rest encryption for connector credentials (OAuth tokens, API keys).
 *
 * Credentials are stored in `brand_connections.credentials` as a JSON envelope.
 * When `CONNECTOR_ENCRYPTION_KEY` is set we AES-256-GCM the plaintext; when it
 * isn't (local dev / early dogfood) we store plaintext in the same envelope so
 * the flow still works. RLS scopes every row to its owner either way — the
 * encryption is defence-in-depth on top of that, mirroring the wearable
 * "plaintext-for-v1, encrypt later" stance but giving us the later for free.
 *
 * Envelope:
 *   { v: 1, iv, tag, data }  — AES-256-GCM, all base64
 *   { v: 0, data }           — plaintext (no key configured)
 *
 * `data` is always the UTF-8 JSON-stringified credential object. Callers pass
 * and receive plain objects; the envelope shape never leaks past this module.
 */

export type Envelope =
  | { v: 1; iv: string; tag: string; data: string }
  | { v: 0; data: string }

function keyOrNull(): Buffer | null {
  const raw = process.env.CONNECTOR_ENCRYPTION_KEY
  if (!raw) return null
  // Accept a 32-byte key as hex, base64, or any string (hashed to 32 bytes).
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex')
  const b64 = Buffer.from(raw, 'base64')
  if (b64.length === 32) return b64
  return createHash('sha256').update(raw).digest()
}

/** True when credentials will be encrypted at rest. Surfaced in admin/debug only. */
export function encryptionEnabled(): boolean {
  return keyOrNull() !== null
}

export function sealCredentials(creds: Record<string, unknown>): Envelope {
  const plain = JSON.stringify(creds)
  const key = keyOrNull()
  if (!key) return { v: 0, data: plain }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return {
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: enc.toString('base64'),
  }
}

export function openCredentials(envelope: unknown): Record<string, unknown> {
  const e = envelope as Envelope | null
  if (!e || typeof e !== 'object' || !('v' in e)) {
    throw new Error('Malformed credential envelope')
  }
  if (e.v === 0) return JSON.parse(e.data)
  if (e.v === 1) {
    const key = keyOrNull()
    if (!key) {
      throw new Error('Credential is encrypted but CONNECTOR_ENCRYPTION_KEY is not set')
    }
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(e.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(e.tag, 'base64'))
    const dec = Buffer.concat([decipher.update(Buffer.from(e.data, 'base64')), decipher.final()])
    return JSON.parse(dec.toString('utf8'))
  }
  throw new Error('Unknown credential envelope version')
}
