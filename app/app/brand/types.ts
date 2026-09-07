/**
 * Brand module — types for the multi-venture portfolio model.
 *
 * The unit is a Brand: any one thing a user is building outside their
 * day job. The set covers content channels, side shops, freelance
 * practices, indie products, hobby brands, anything in that bucket.
 *
 * Each Brand carries:
 *  - identity (name, archetype, description, accent color)
 *  - linked accounts on platforms (each with a manually-entered follower
 *    count, since live fetching is a later BUILD)
 *  - one or more posting schedules (e.g. "1 short/day" + "1 video/week"),
 *    each with an optional posting-time deadline
 *  - a per-schedule, per-date log of how many "ships" happened that day
 *  - optional latest reflection text + timestamp
 *
 * Stored in localStorage under `vitality_brand_v1`. Supabase migration
 * lands in a later BUILD alongside the water/supplements migration.
 *
 * Archetypes steer smart defaults at create-time only; everything is
 * editable afterwards so the model doesn't trap a user whose "Etsy shop"
 * is really half-shop / half-newsletter.
 */

/**
 * Brand archetypes. The first five are content/product/service brands;
 * the last two are local-business presets (construction/trades and
 * hospitality) so non-creator users get sensible defaults.
 *
 * AI intake picks the best fit from this list when the user types a
 * free-text description; everything stays editable afterwards.
 */
export type Archetype =
  | 'creator'      // social-first: TikTok / IG / YouTube
  | 'shop'         // selling product: Etsy, ecom, resell
  | 'service'      // freelance, agency, coaching
  | 'channel'      // long-form: newsletter, podcast, blog
  | 'product'      // indie SaaS, app, game
  | 'construction' // trades, contractors, local service
  | 'restaurant'   // hospitality, food, bars
  | 'other'

export type Platform =
  | 'tiktok'
  | 'instagram'
  | 'youtube'
  | 'youtube_long'
  | 'x'
  | 'linkedin'
  | 'threads'
  | 'substack'
  | 'patreon'
  | 'etsy'
  | 'shopify'
  | 'website'
  | 'google_business'
  | 'yelp'
  | 'opentable'
  | 'zillow'
  | 'github'
  | 'other'

export type CadenceUnit =
  | 'posts'
  | 'videos'
  | 'shorts'
  | 'episodes'
  | 'newsletters'
  | 'listings'
  | 'commits'
  | 'sales'
  | 'outreach'
  | 'shipments'
  | 'jobs'          // construction / trades: jobs booked
  | 'leads'         // service / real estate: lead pipeline
  | 'bookings'      // restaurant / hospitality
  | 'showings'      // real estate
  | 'features'      // indie product

export type CadencePeriod = 'daily' | 'weekly'

export interface CadenceTarget {
  target: number
  unit: CadenceUnit
  period: CadencePeriod
}

/**
 * Optional posting deadline for a schedule. Drives the live countdown
 * chip on the brand detail page (calm → red as it approaches).
 *
 *   - `minutes`  — minutes after local midnight, 0–1439 (18:00 = 1080).
 *   - `weekday`  — 0 (Sun) – 6 (Sat). Only meaningful for weekly
 *                  schedules; ignored for daily ones.
 */
export interface ScheduleDeadline {
  minutes: number
  weekday?: number
}

/**
 * One posting cadence stream within a brand. A brand can run several at
 * once — e.g. a creator ships "1 short / day" AND "1 video / week" — so
 * the old single `cadence` field is replaced by a list of these.
 *
 * Each schedule logs independently (see Brand.log, keyed by schedule
 * id) and can carry its own posting-time `deadline` and `+button` verb.
 */
export interface Schedule {
  id: string
  /** Human label, e.g. "Daily short", "Weekly video". */
  label: string
  unit: CadenceUnit
  target: number
  period: CadencePeriod
  /** Optional platform association — used for the row icon/context. */
  platform?: Platform
  /** Optional posting time → live countdown. Omit for no deadline. */
  deadline?: ScheduleDeadline
  /** Per-schedule +button verb; falls back to brand.dailyActionLabel. */
  actionLabel?: string
  /** Free-text goal/angle for this stream ("what's this video for?"). */
  goals?: string
  /** Script, outline, shot list, links — the working notes for the next ship. */
  script?: string
}

/**
 * Single datapoint in an account's stat history. Appended on every
 * refresh (or manual edit of the follower count).
 *
 *   - `count`  — follower / subscriber count. Kept on the same field
 *                name for back-compat with v1-shape snapshots that
 *                only stored followers.
 *   - `views`  — lifetime channel views (YouTube) or hearts (TikTok).
 *                Optional; populated when the refresh returns it.
 *   - `videos` — uploaded video count.
 *
 * These power the Stats card on the brand detail page: hero sparkline,
 * per-platform sparkline, and the "this week" / "this month" deltas
 * are all derived from this single history array.
 */
export interface FollowerSnapshot {
  /** ISO timestamp when this snapshot was recorded. */
  at: string
  count: number
  views?: number
  videos?: number
}

export interface BrandAccount {
  id: string
  platform: Platform
  handle: string
  /** Latest follower/subscriber count. */
  followers: number | null
  /** ISO date of the last update — drives the "stale" badge. */
  lastUpdated: string | null
  /**
   * Optional profile picture URL returned by /api/brand/refresh
   * (YouTube via Data API, TikTok via page scrape). Plain URL — we
   * render with <img> rather than next/image so we don't need to
   * whitelist CDN domains in next.config.
   */
  avatarUrl?: string
  /**
   * Lifetime total content views — YouTube channel views (from the
   * Data API `statistics.viewCount`) or TikTok total hearts (sum of
   * likes across all videos, scraped from the profile page).
   *
   * "Monthly views" would need OAuth + the YouTube Analytics API or
   * TikTok's creator API; lifetime is what's available from free
   * public endpoints. Rendered as an auto-KPI on the brand detail.
   */
  lifetimeViews?: number
  /** Total uploaded videos / shorts on the account, when available. */
  videoCount?: number
  /**
   * Time series of follower counts. Appended on every refresh (or
   * manual edit that changes the number). Capped to MAX_HISTORY in
   * state.ts so localStorage doesn't bloat indefinitely.
   */
  history?: FollowerSnapshot[]
  /**
   * ISO timestamp of the most recent post on this account. Drives the
   * "Last posted" chip on the account card — so you can see at a glance how
   * long it's been since you shipped, even if you never log a post manually.
   * Populated by the Chrome post-dates pull (see lib/social/prompts
   * buildPostDatesPrompt) and, for YouTube, the live refresh.
   */
  lastPostedAt?: string | null
  /**
   * Recent post dates (local `YYYY-MM-DD`), newest-first, deduped + capped in
   * state.ts. Powers the per-account content calendar — each date is a dot on
   * the month grid. Read from the platform via the Chrome extension, so it
   * reflects what you actually posted, not just what you logged.
   */
  postDates?: string[]
}

/**
 * A labeled URL pointing somewhere outside Vitality — a Google Sheet,
 * a Stripe dashboard, a Calendly link, a project folder. Lets
 * non-creator brands keep their daily-driver tools one tap away.
 */
export interface BrandLink {
  id: string
  label: string
  url: string
  /**
   * The linked account these post-links belong to. Post links are per-social —
   * each account (YouTube, TikTok, Instagram…) keeps its own ordered set, since
   * the places you go to post differ per platform. Legacy brand-wide links
   * without one are migrated onto the brand's first account on load.
   */
  accountId?: string
}

/**
 * Single datapoint in a KPI's value history. Appended whenever the user
 * commits a new value (on blur), deduped against the previous one and
 * capped to MAX_HISTORY in state.ts. Powers the per-metric line chart.
 */
export interface KpiSnapshot {
  /** ISO timestamp when this value was recorded. */
  at: string
  value: number
}

/**
 * A manually-tracked metric. Designed for things that don't have a
 * free API: monthly revenue, leads in pipeline, jobs closed, MRR, etc.
 * Users edit the number inline; each committed change appends a
 * `history` snapshot so the metric charts over time, and an optional
 * `target` draws a goal line + pace caption.
 */
export interface BrandKpi {
  id: string
  label: string
  value: number
  /** Optional display unit ("$", "%", "/wk"). Empty string is fine. */
  unit: string
  /**
   * Optional goal value. When set, the metric card draws a dashed target
   * line on its chart and a progress bar + "X to go" pace caption.
   */
  target?: number
  /**
   * Time-series of committed values. Appended on each value change (see
   * updateKpi in state.ts), deduped + capped. Absent on metrics that
   * predate this field (BUILD).
   */
  history?: KpiSnapshot[]
}

/**
 * A business goal with an optional due-date timer. Bigger and slower-moving
 * than a Schedule (which is a recurring daily/weekly cadence) or a KPI (a single
 * tracked number): a goal is a milestone like "hit $10k MRR" or "ship the new
 * site", optionally with a deadline that drives a live days-left countdown on
 * the Business tab.
 */
export interface BrandGoal {
  id: string
  /** The milestone, in the user's words. */
  title: string
  /** Optional detail — the why, the target number, the plan. */
  note?: string
  /** Optional due date as a local `YYYY-MM-DD` key. Drives the countdown. */
  due?: string
  done: boolean
  createdAt: string
  /** ISO timestamp the goal was marked done. */
  completedAt?: string | null
}

export type UploadRating = 'green' | 'yellow' | 'red'

/**
 * A single piece of content the user shipped — a video, reel, short, post.
 * Logged from the Workshop after uploading, so its timing can be overlaid on
 * the social analytics chart and you can SEE how each one moved the line.
 *
 *  - `postedAt` — ISO timestamp it went live (drives the marker's x-position).
 *  - `rating`   — optional manual "how'd it do" override. When absent, the
 *                 chart auto-rates it from the trend right after it posted
 *                 (line lifted → green, flat → yellow, dipped → red).
 */
export interface BrandUpload {
  id: string
  platform: Platform
  title: string
  url?: string
  postedAt: string
  rating?: UploadRating
  note?: string
}

/**
 * The three-step content pipeline links: write the script, edit the cut,
 * upload it. Each is a quick-launch URL set once (a Google Doc, CapCut, the
 * YouTube/TikTok upload page). Empty steps just show a "set link" prompt.
 */
export interface ProductionLinks {
  scriptUrl?: string
  editUrl?: string
  uploadUrl?: string
}

/**
 * Brand money — a tiny per-brand P&L. Mirrors the Finance module's
 * subscription shape (name · amount · period) but scoped to one venture and
 * split by direction: `out` is what the brand costs (subs, tools, ad spend),
 * `in` is what it earns (sales, sponsorships, ad revenue). Recurring entries
 * (monthly/yearly) feed the steady monthly profit number; `once` entries are
 * one-off spikes that land on their dated month in the chart.
 */
export type BrandMoneyKind = 'in' | 'out'
export type BrandMoneyPeriod = 'once' | 'monthly' | 'yearly'

export interface BrandMoneyEntry {
  id: string
  /** What it is — "Netflix", "Sponsorship", "AdSense". */
  name: string
  /** Raw amount in the brand's display currency (no FX; plain number). */
  amount: number
  kind: BrandMoneyKind
  period: BrandMoneyPeriod
  /** ISO date (YYYY-MM-DD). For `once` entries, the month it lands on. */
  at: string
  /**
   * When set, this entry is mirrored to a Finance-module subscription with this
   * id (a bare uuid). Two-way sync: adding/editing/deleting it here writes
   * through to Finance, and the "Pull from Finance" button skips subs already
   * linked. Only recurring money-OUT entries carry one.
   */
  financeId?: string
}

export interface BrandFinance {
  /** Currency symbol shown in front of amounts. Defaults to "$". */
  currency: string
  entries: BrandMoneyEntry[]
}

export interface Brand {
  id: string
  name: string
  archetype: Archetype
  /** One-line description / pitch — the business's "one-liner". Optional. */
  blurb: string
  /**
   * Business identity (the "What is this business?" card on the Business tab).
   * Generic + reusable for any brand: `offer` = what you sell, `customer` = who
   * it's for. The one-liner is `blurb`. All optional — a clean slate by default.
   */
  offer?: string
  customer?: string
  /** Optional emoji as a stand-in for a logo. */
  emoji: string
  /** When set, this account's avatar is shown faded behind the hero, in place of the emoji. */
  heroAvatarAccountId?: string
  /** When true, an animated combined-growth graph is shown behind the hero. */
  heroGraph?: boolean
  accounts: BrandAccount[]
  /** Labeled external URLs — dashboards, sheets, calendars, etc. */
  links: BrandLink[]
  /** Manually-tracked metrics — revenue, leads, MRR, anything. */
  kpis: BrandKpi[]
  /** Business goals / milestones, each with an optional due-date timer. */
  goals: BrandGoal[]
  /**
   * Shipped content, each timestamped + optionally rated. Powers the upload
   * markers on the social chart and the Workshop's upload log.
   */
  uploads: BrandUpload[]
  /** Three-step content pipeline quick-links (script · edit · upload). */
  production?: ProductionLinks
  /**
   * Latest saved AI "read" per data pack (audience, what's working, comments…),
   * keyed by pack id. Lets a qualitative pack's answer be saved and viewed later.
   */
  packReads?: Record<string, { text: string; at: string }>
  /** Per-brand money in/out — the tiny P&L behind the Money button. */
  finance?: BrandFinance
  /**
   * One or more posting cadence streams. Migrated from the old single
   * `cadence` field — a pre-schedules brand becomes a one-entry list.
   */
  schedules: Schedule[]
  /**
   * Per-category verb that replaces "shipped" on the +1 button.
   * Creator → "shipped", Shop → "made a sale", Construction → "closed a job".
   * Falls back to "shipped" if missing. A schedule may override it.
   */
  dailyActionLabel?: string
  /**
   * Per-schedule daily log: scheduleId → (YYYY-MM-DD local → count).
   * Migrated from the old flat `Record<dateKey, number>` (which becomes
   * the first schedule's bucket).
   */
  log: Record<string, Record<string, number>>
  /** Most recent reflection text — overwrites the previous each day. */
  lastReflection: string
  /** ISO timestamp of last reflection edit. */
  lastReflectionAt: string | null
  /**
   * Most recent AI business read (from /api/brand/insight). Cached so it
   * persists across navigation; refreshed on demand. Absent until generated.
   */
  lastInsight?: string
  /** ISO timestamp the AI read was generated. */
  lastInsightAt?: string | null
  archived: boolean
  createdAt: string
}

export interface BrandState {
  version: 1
  brands: Brand[]
}

// -----------------------------------------------------------------------------
// Display helpers (label tables) — kept here so types + labels stay in sync.
// -----------------------------------------------------------------------------

export const ARCHETYPE_LABELS: Record<Archetype, string> = {
  creator:      'Creator',
  shop:         'Shop',
  service:      'Service',
  channel:      'Channel',
  product:      'Product',
  construction: 'Construction',
  restaurant:   'Restaurant',
  other:        'Other',
}

export const ARCHETYPE_BLURBS: Record<Archetype, string> = {
  creator:      'Social-first. TikTok, Reels, Shorts, YouTube.',
  shop:         'Selling product. Etsy, ecom, resell, prints.',
  service:      'Freelance, agency, coaching. Selling time and craft.',
  channel:      'Long-form. Newsletter, podcast, blog.',
  product:      'Indie product. SaaS, app, game, tool.',
  construction: 'Trades and local service. Contractors, builders, fixers.',
  restaurant:   'Hospitality. Restaurants, cafés, bars, food trucks.',
  other:        'Anything else you’re building.',
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok:          'TikTok',
  instagram:       'Instagram',
  youtube:         'YouTube',
  youtube_long:    'YouTube (long-form)',
  x:               'X',
  linkedin:        'LinkedIn',
  threads:         'Threads',
  substack:        'Substack',
  patreon:         'Patreon',
  etsy:            'Etsy',
  shopify:         'Shopify',
  website:         'Website',
  google_business: 'Google Business',
  yelp:            'Yelp',
  opentable:       'OpenTable',
  zillow:          'Zillow',
  github:          'GitHub',
  other:           'Other',
}

/**
 * Best-effort public profile URL for a platform + handle, so a tap on an
 * account jumps straight there — in the user's browser, where they're
 * already signed in. Returns '' when we can't build a sensible URL (the
 * caller then hides the quick-link).
 *
 * Handles are stored loosely ("@name", "name", or a full pasted URL): a
 * URL is used as-is, otherwise we strip a leading @ and slot the handle
 * into the platform's profile path.
 */
export function platformProfileUrl(platform: Platform, handle: string): string {
  const raw = (handle || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  if (/^www\./i.test(raw)) return `https://${raw}`
  const h = raw.replace(/^@/, '').trim()
  if (!h) return ''
  const enc = encodeURIComponent(h)
  switch (platform) {
    case 'tiktok':          return `https://www.tiktok.com/@${enc}`
    case 'instagram':       return `https://www.instagram.com/${enc}`
    case 'youtube':
    case 'youtube_long':    return `https://www.youtube.com/@${enc}`
    case 'x':               return `https://x.com/${enc}`
    case 'linkedin':        return `https://www.linkedin.com/in/${enc}`
    case 'threads':         return `https://www.threads.net/@${enc}`
    case 'substack':        return `https://${enc}.substack.com`
    case 'patreon':         return `https://www.patreon.com/${enc}`
    case 'etsy':            return `https://www.etsy.com/shop/${enc}`
    case 'github':          return `https://github.com/${enc}`
    case 'yelp':            return `https://www.yelp.com/biz/${enc}`
    case 'opentable':       return `https://www.opentable.com/r/${enc}`
    case 'zillow':          return `https://www.zillow.com/profile/${enc}`
    case 'google_business': return `https://www.google.com/search?q=${enc}`
    case 'shopify':         return /\./.test(h) ? `https://${h}` : `https://${enc}.myshopify.com`
    case 'website':
    case 'other':           return /\./.test(h) ? `https://${h}` : ''
    default:                return ''
  }
}

export const PLATFORM_SHORT: Record<Platform, string> = {
  tiktok:          'TT',
  instagram:       'IG',
  youtube:         'YT',
  youtube_long:    'YTL',
  x:               'X',
  linkedin:        'LI',
  threads:         'TH',
  substack:        'SS',
  patreon:         'PA',
  etsy:            'ET',
  shopify:         'SH',
  website:         'WB',
  google_business: 'GB',
  yelp:            'YP',
  opentable:       'OT',
  zillow:          'ZL',
  github:          'GH',
  other:           '··',
}

export const CADENCE_UNIT_LABELS: Record<CadenceUnit, string> = {
  posts:       'posts',
  videos:      'videos',
  shorts:      'shorts',
  episodes:    'episodes',
  newsletters: 'newsletters',
  listings:    'listings',
  commits:     'commits',
  sales:       'sales',
  outreach:    'outreach',
  shipments:   'shipments',
  jobs:        'jobs',
  leads:       'leads',
  bookings:    'bookings',
  showings:    'showings',
  features:    'features',
}

/**
 * Best-effort PUBLIC profile URL for a linked account, so the Audience view can
 * link straight out to the channel (open YouTube / Instagram / TikTok / etc.
 * in one tap). Returns null when no sensible URL can be formed (e.g. an "Other"
 * platform with a bare handle, where we'd only be guessing).
 *
 * Rules:
 *   - A handle that's already a full URL is used as-is.
 *   - A bare domain ("my-store.com", "name.substack.com/p/x") becomes https://it.
 *   - Otherwise the leading @ is stripped and the platform's canonical profile
 *     pattern is applied.
 */
export function profileUrl(platform: Platform, handleRaw: string): string | null {
  const handle = (handleRaw ?? '').trim()
  if (!handle) return null
  if (/^https?:\/\//i.test(handle)) return handle

  // Heuristic: a dotted token that reads like a domain (optionally with a path).
  const looksLikeDomain = /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(handle)

  const h = handle.replace(/^@/, '').replace(/\/+$/, '')
  const enc = encodeURIComponent(h)

  switch (platform) {
    case 'tiktok':          return `https://www.tiktok.com/@${enc}`
    case 'instagram':       return `https://www.instagram.com/${enc}`
    case 'threads':         return `https://www.threads.net/@${enc}`
    case 'youtube':
    case 'youtube_long':    return `https://www.youtube.com/@${enc}`
    case 'x':               return `https://x.com/${enc}`
    case 'patreon':         return `https://www.patreon.com/${enc}`
    case 'github':          return looksLikeDomain ? `https://${h}` : `https://github.com/${enc}`
    case 'linkedin':        return looksLikeDomain ? `https://${h}` : `https://www.linkedin.com/in/${enc}`
    case 'substack':        return looksLikeDomain ? `https://${h}` : `https://${enc}.substack.com`
    case 'etsy':            return looksLikeDomain ? `https://${h}` : `https://www.etsy.com/shop/${enc}`
    case 'shopify':
    case 'website':         return looksLikeDomain ? `https://${h}` : null
    case 'google_business':
    case 'yelp':
    case 'opentable':
    case 'zillow':
    case 'other':           return looksLikeDomain ? `https://${h}` : null
    default:                return null
  }
}
