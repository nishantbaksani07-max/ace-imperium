import 'server-only'

import type { ConnectorDef } from './types'
import { stripeConnector } from './providers/stripe'
import { shopifyConnector } from './providers/shopify'
import { youtubeConnector } from './providers/youtube'
import { amazonConnector } from './providers/amazon'
import { websiteConnector } from './providers/website'
import { gumroadConnector } from './providers/gumroad'
import { plausibleConnector } from './providers/plausible'
import { patreonConnector } from './providers/patreon'
import { twitchConnector } from './providers/twitch'

/**
 * The connector registry. Adding a new business integration is one adapter file
 * + one line here. Order is the display order in the Connections card.
 */
export const CONNECTORS: ConnectorDef[] = [
  stripeConnector,
  shopifyConnector,
  gumroadConnector,
  youtubeConnector,
  twitchConnector,
  patreonConnector,
  amazonConnector,
  plausibleConnector,
  websiteConnector,
]

export function getConnector(id: string): ConnectorDef | null {
  return CONNECTORS.find((c) => c.id === id) ?? null
}

/** A connector is "configured" once the admin has set all its required env vars. */
export function isConfigured(def: ConnectorDef): boolean {
  return def.requiredEnv.every((v) => !!process.env[v])
}
