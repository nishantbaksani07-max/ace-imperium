import 'server-only'

/**
 * Connector framework types.
 *
 * A connector is one third-party business integration (Stripe, Shopify, Amazon,
 * YouTube, a website…). Every provider is described by a single `ConnectorDef`
 * registered in `registry.ts`; adding a new integration is one adapter file.
 *
 * Two auth shapes:
 *   - 'api_key' — the user pastes a credential (a Stripe restricted key, a
 *     Shopify admin token, a site URL). We verify + store it.
 *   - 'oauth'   — a redirect/callback dance (Google for YouTube, Shopify OAuth,
 *     Amazon LWA). We store the token set and refresh it on demand.
 *
 * `sync(ctx)` is the one method every connector must implement: given live
 * credentials, return the current business metrics. The framework persists
 * those into `brand_metrics` and the MCP briefing reads them back.
 */

export type AuthType = 'oauth' | 'api_key'

export type MetricPeriod = 'snapshot' | 'day' | 'month' | 'lifetime'

/** One pulled number. `metric` is a stable key; `label` is for display. */
export interface SyncedMetric {
  metric: string
  label: string
  value: number
  unit?: string
  period?: MetricPeriod
  raw?: unknown
}

/** OAuth token set, normalized across providers. */
export interface OAuthTokens {
  accessToken: string
  refreshToken?: string
  /** Seconds until the access token expires (from the token response). */
  expiresInSeconds?: number
  scope?: string
  /** Provider-specific extras worth persisting (e.g. Shopify shop, Amazon region). */
  extra?: Record<string, unknown>
}

/** A field in an api_key connector's paste form. */
export interface ApiKeyField {
  key: string
  label: string
  placeholder?: string
  /** Render as a password input + never echo back to the client. */
  secret?: boolean
  optional?: boolean
}

export interface ConnectorContext {
  /** Decrypted credentials for this connection. */
  credentials: Record<string, unknown>
  /** The brand this connection feeds ('' = account-wide). */
  brandRef: string
  /**
   * OAuth connectors call this when a refresh produced new tokens, so the
   * framework can persist them. No-op for api_key connectors.
   */
  persistTokens?: (tokens: OAuthTokens) => Promise<void>
}

export interface SyncResult {
  /** Updated human label for the connection (shop name, channel title…). */
  accountLabel?: string
  /**
   * Provider-side account/campaign id, persisted to `brand_connections.external_id`
   * (plaintext) so server-to-server webhooks can map an event back to this
   * connection without a user session. Optional — most connectors don't need it.
   */
  externalId?: string
  metrics: SyncedMetric[]
}

export interface ConnectorDef {
  id: string
  label: string
  /** One-line description shown in the connect UI. */
  blurb: string
  authType: AuthType
  /** Env vars the admin must set for this connector to be usable at all. */
  requiredEnv: string[]

  // ── api_key connectors ──
  apiKey?: {
    fields: ApiKeyField[]
    /**
     * Validate a freshly-pasted credential by making a cheap live call.
     * Returns a display label on success; throws a user-facing Error on failure.
     */
    verify: (creds: Record<string, string>) => Promise<{ accountLabel: string }>
  }

  // ── oauth connectors ──
  oauth?: {
    scopes: string
    buildAuthUrl: (state: string, redirectUri: string) => string
    exchangeCode: (code: string, redirectUri: string) => Promise<OAuthTokens>
    refresh?: (refreshToken: string) => Promise<OAuthTokens>
  }

  /** Pull current metrics given live credentials. */
  sync: (ctx: ConnectorContext) => Promise<SyncResult>
}

/** Status of a provider for the current user, returned by GET /api/connectors. */
export interface ConnectorStatus {
  id: string
  label: string
  blurb: string
  authType: AuthType
  /** False when the admin hasn't set the connector's requiredEnv yet. */
  configured: boolean
  /** api_key field descriptors (no secrets) so the UI can render the form. */
  fields?: Omit<ApiKeyField, never>[]
  connected: boolean
  status?: string
  accountLabel?: string | null
  lastError?: string | null
  lastSyncedAt?: string | null
  /** Latest synced metrics for the connection, newest value per metric. */
  metrics?: SyncedMetric[]
}
