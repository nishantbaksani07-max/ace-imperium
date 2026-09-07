import { createHmac, timingSafeEqual } from 'crypto'

export const WHOOP_SYNC_EVENT_TYPES = new Set([
  'recovery.updated',
  'sleep.updated',
])

export interface WhoopWebhookEvent {
  user_id: number
  id: number | string
  type: string
  trace_id: string
}

export function parseWhoopWebhookEvent(rawBody: string): WhoopWebhookEvent | null {
  let value: unknown
  try {
    value = JSON.parse(rawBody)
  } catch {
    return null
  }

  if (!value || typeof value !== 'object') return null
  const event = value as Record<string, unknown>
  if (
    typeof event.user_id !== 'number' ||
    !Number.isSafeInteger(event.user_id) ||
    (typeof event.id !== 'number' && typeof event.id !== 'string') ||
    typeof event.type !== 'string' ||
    typeof event.trace_id !== 'string'
  ) {
    return null
  }

  return event as unknown as WhoopWebhookEvent
}

/** WHOOP signs `timestamp + raw request body` with the app client secret. */
export function verifyWhoopSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  clientSecret: string,
): boolean {
  if (!timestamp || !signature || !clientSecret) return false

  const expected = createHmac('sha256', clientSecret)
    .update(timestamp + rawBody)
    .digest()

  let received: Buffer
  try {
    received = Buffer.from(signature, 'base64')
  } catch {
    return false
  }

  return received.length === expected.length && timingSafeEqual(received, expected)
}
