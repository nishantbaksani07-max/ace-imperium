import type { CSSProperties } from 'react'
import type {
  Archetype,
  BrandKpi,
  BrandLink,
  Platform,
  Schedule,
} from './types'

/**
 * Per-archetype defaults applied when a new brand is created.
 *
 * Each archetype seeds:
 *
 *   - emoji            — quick visual identity
 *   - schedules        — one or more daily/weekly ship targets with
 *                        archetype-fitting units (creator ships a daily
 *                        short AND a weekly video); each may carry an
 *                        optional posting-time deadline
 *   - dailyActionLabel — what the +1 button says (creator → "shipped",
 *                        shop → "made a sale", construction → "closed a job")
 *   - suggestedAccounts — platforms most useful for this kind of brand,
 *                         each with a placeholder hint for the handle field
 *   - suggestedLinks    — labeled URL slots (Google Sheets, Stripe, Calendly)
 *                         with empty url for the user to fill in
 *   - suggestedKpis     — manually-tracked metrics with sensible labels +
 *                         display units; value defaults to 0
 *
 * Numbers are starting points, not targets. Everything is editable
 * after creation; this just removes the blank-page problem.
 *
 * Used by:
 *   - state.createBrand (seeds new brands from these defaults)
 *   - IntakeFlow modal (renders the template grid)
 *   - /api/brand/intake (the AI is given this schema to fit into)
 */

interface ArchetypeTemplate {
  emoji: string
  /** One or more posting schedules seeded at create-time (ids assigned later). */
  schedules: Array<Omit<Schedule, 'id'>>
  dailyActionLabel: string
  suggestedAccounts: Array<{ platform: Platform; placeholder: string }>
  suggestedLinks: Array<Pick<BrandLink, 'label'> & { url?: string }>
  suggestedKpis: Array<Pick<BrandKpi, 'label' | 'unit'> & { value?: number }>
}

export const ARCHETYPE_DEFAULTS: Record<Archetype, ArchetypeTemplate> = {
  // ---------------------------------------------------------------------------
  creator: {
    emoji: '🎥',
    // The two-stream example: a daily short (evening deadline) AND a
    // weekly long-form video (Sunday noon).
    schedules: [
      { label: 'Daily short', unit: 'shorts', target: 1, period: 'daily', platform: 'tiktok', deadline: { minutes: 1080 }, actionLabel: 'shipped' },
      { label: 'Weekly video', unit: 'videos', target: 1, period: 'weekly', platform: 'youtube', deadline: { weekday: 0, minutes: 720 }, actionLabel: 'uploaded' },
    ],
    dailyActionLabel: 'shipped',
    suggestedAccounts: [
      { platform: 'tiktok',    placeholder: '@handle' },
      { platform: 'instagram', placeholder: '@handle' },
      { platform: 'youtube',   placeholder: '@handle' },
    ],
    suggestedLinks: [
      { label: 'Content calendar (Notion / Sheets)' },
      { label: 'Idea bank' },
    ],
    // Live follower / view / video counts come from the Stats card, not
    // the manual KPIs section — so these defaults focus on numbers a
    // creator can't pull from a public API.
    suggestedKpis: [
      { label: 'Best video views this month', unit: '' },
      { label: 'Brand deal revenue',          unit: '$' },
    ],
  },

  // ---------------------------------------------------------------------------
  shop: {
    emoji: '🛍️',
    schedules: [
      { label: 'Weekly listings', unit: 'listings', target: 3, period: 'weekly', platform: 'etsy', actionLabel: 'listed' },
    ],
    dailyActionLabel: 'made a sale',
    suggestedAccounts: [
      { platform: 'etsy',      placeholder: 'shop url or name' },
      { platform: 'shopify',   placeholder: 'my-store.myshopify.com' },
      { platform: 'instagram', placeholder: '@handle' },
    ],
    suggestedLinks: [
      { label: 'Stripe dashboard' },
      { label: 'Inventory sheet' },
      { label: 'Printful / supplier' },
    ],
    suggestedKpis: [
      { label: 'Revenue this month', unit: '$' },
      { label: 'Orders this month',  unit: '' },
      { label: 'Conversion rate',    unit: '%' },
    ],
  },

  // ---------------------------------------------------------------------------
  service: {
    emoji: '💼',
    schedules: [
      { label: 'Daily outreach', unit: 'outreach', target: 1, period: 'daily', platform: 'linkedin', actionLabel: 'sent outreach' },
    ],
    dailyActionLabel: 'sent outreach',
    suggestedAccounts: [
      { platform: 'linkedin', placeholder: 'linkedin.com/in/you' },
      { platform: 'website',  placeholder: 'your-site.com' },
    ],
    suggestedLinks: [
      { label: 'Calendly / bookings' },
      { label: 'Client CRM (Sheets / Notion)' },
      { label: 'Proposal template' },
    ],
    suggestedKpis: [
      { label: 'Leads in pipeline',  unit: '' },
      { label: 'Proposals out',      unit: '' },
      { label: 'Revenue this month', unit: '$' },
    ],
  },

  // ---------------------------------------------------------------------------
  channel: {
    emoji: '📡',
    schedules: [
      { label: 'Weekly issue', unit: 'newsletters', target: 1, period: 'weekly', platform: 'substack', actionLabel: 'shipped an issue' },
    ],
    dailyActionLabel: 'shipped an issue',
    suggestedAccounts: [
      { platform: 'substack', placeholder: 'your-name.substack.com' },
      { platform: 'patreon',  placeholder: 'patreon.com/you' },
      { platform: 'x',        placeholder: '@handle' },
    ],
    suggestedLinks: [
      { label: 'Ghost / ConvertKit dashboard' },
      { label: 'Episode / issue outline' },
    ],
    suggestedKpis: [
      { label: 'Subscribers',  unit: '' },
      { label: 'Open rate',    unit: '%' },
      { label: 'MRR',          unit: '$' },
    ],
  },

  // ---------------------------------------------------------------------------
  product: {
    emoji: '🛠️',
    schedules: [
      { label: 'Daily commit', unit: 'commits', target: 1, period: 'daily', platform: 'github', actionLabel: 'shipped' },
    ],
    dailyActionLabel: 'shipped',
    suggestedAccounts: [
      { platform: 'github',  placeholder: 'github.com/you/repo' },
      { platform: 'website', placeholder: 'app-url.com' },
      { platform: 'x',       placeholder: '@handle' },
    ],
    suggestedLinks: [
      { label: 'Stripe / MRR dashboard' },
      { label: 'PostHog / analytics' },
      { label: 'Linear / roadmap' },
    ],
    suggestedKpis: [
      { label: 'MRR',                unit: '$' },
      { label: 'Active users',       unit: '' },
      { label: 'Signups this month', unit: '' },
    ],
  },

  // ---------------------------------------------------------------------------
  construction: {
    emoji: '🏗️',
    schedules: [
      { label: 'Daily leads', unit: 'leads', target: 1, period: 'daily', platform: 'google_business', actionLabel: 'closed a job' },
    ],
    dailyActionLabel: 'closed a job',
    suggestedAccounts: [
      { platform: 'google_business', placeholder: 'Google Business profile' },
      { platform: 'yelp',            placeholder: 'yelp.com/biz/...' },
      { platform: 'website',         placeholder: 'your-site.com' },
      { platform: 'instagram',       placeholder: '@handle (job photos)' },
    ],
    suggestedLinks: [
      { label: 'Job list (Google Sheets)' },
      { label: 'QuickBooks / invoicing' },
      { label: 'Lead form / inquiries' },
      { label: 'Supplier order sheet' },
    ],
    suggestedKpis: [
      { label: 'Revenue this month', unit: '$' },
      { label: 'Jobs in progress',   unit: '' },
      { label: 'Leads this week',    unit: '' },
      { label: 'Avg job size',       unit: '$' },
    ],
  },

  // ---------------------------------------------------------------------------
  restaurant: {
    emoji: '🍽️',
    schedules: [
      { label: 'Daily post', unit: 'posts', target: 1, period: 'daily', platform: 'instagram', actionLabel: 'posted' },
    ],
    dailyActionLabel: 'posted',
    suggestedAccounts: [
      { platform: 'google_business', placeholder: 'Google Business profile' },
      { platform: 'yelp',            placeholder: 'yelp.com/biz/...' },
      { platform: 'opentable',       placeholder: 'OpenTable URL' },
      { platform: 'instagram',       placeholder: '@handle' },
      { platform: 'tiktok',          placeholder: '@handle' },
    ],
    suggestedLinks: [
      { label: 'Square / POS dashboard' },
      { label: 'Menu (Notion / Sheets)' },
      { label: 'Reservation system' },
      { label: 'Supplier orders' },
    ],
    suggestedKpis: [
      { label: 'Revenue this week',  unit: '$' },
      { label: 'Reservations today', unit: '' },
      { label: 'Avg review score',   unit: '/5' },
      { label: 'Reviews this month', unit: '' },
    ],
  },

  // ---------------------------------------------------------------------------
  // The everything-else catch-all. Seeds the surfaces any project needs:
  // a daily progress cadence, marketing socials, the website + working
  // docs as links, and goal/revenue KPIs. Reflection is always present on
  // the detail page, so it isn't seeded here.
  other: {
    emoji: '✦',
    schedules: [
      { label: 'Daily progress', unit: 'posts', target: 1, period: 'daily', actionLabel: 'made progress' },
    ],
    dailyActionLabel: 'made progress',
    suggestedAccounts: [
      { platform: 'website',   placeholder: 'your-site.com' },
      { platform: 'instagram', placeholder: '@handle (marketing)' },
      { platform: 'x',         placeholder: '@handle (marketing)' },
    ],
    suggestedLinks: [
      { label: 'Website' },
      { label: 'Main dashboard / sheet' },
      { label: 'Notes & ideas' },
    ],
    suggestedKpis: [
      { label: 'Goal this month',    unit: '' },
      { label: 'Revenue this month', unit: '$' },
    ],
  },
}

/**
 * "Brand Spectrum" — each archetype gets its own accent hue so the
 * brand grid reads as a living roster of distinct identities instead
 * of a uniform mint wall. Creator keeps the Vitality house mint (it's
 * the highest-volume user); the rest each get a hue that's bright
 * enough to clear ~4.5:1 contrast on pure black.
 *
 *   - `hex` — solid colour for text, sparkline strokes, progress fills
 *   - `rgb` — the same colour as an "r, g, b" triplet, so CSS can
 *             compose any alpha via rgba(var(--accent-rgb), α)
 *
 * Surfaces consume these through two custom properties (`--accent`,
 * `--accent-rgb`) set once per brand-scoped element; everything inside
 * inherits them. See `accentVars()` and brand.module.css. Brand-
 * agnostic chrome (new-brand button, modal, tab nav) stays on mint.
 */
export const ARCHETYPE_ACCENTS: Record<Archetype, { hex: string; rgb: string }> = {
  creator:      { hex: '#6EE7B7', rgb: '110, 231, 183' }, // mint — house colour
  shop:         { hex: '#FB923C', rgb: '251, 146, 60'  }, // orange
  service:      { hex: '#38BDF8', rgb: '56, 189, 248'  }, // sky
  channel:      { hex: '#A78BFA', rgb: '167, 139, 250' }, // violet
  product:      { hex: '#818CF8', rgb: '129, 140, 248' }, // indigo
  construction: { hex: '#FACC15', rgb: '250, 204, 21'  }, // amber/yellow
  restaurant:   { hex: '#FB7185', rgb: '251, 113, 133' }, // rose
  other:        { hex: '#94A3B8', rgb: '148, 163, 184' }, // slate
}

/**
 * Inline-style helper that maps a brand's archetype to the two accent
 * custom properties. Spread onto any brand-scoped element (a grid card,
 * the detail page, a social tile) and every themed surface beneath it
 * picks up the hue automatically:
 *
 *   <article style={accentVars(brand.archetype)} … />
 */
export function accentVars(a: Archetype): CSSProperties {
  const { hex, rgb } = ARCHETYPE_ACCENTS[a]
  return { '--accent': hex, '--accent-rgb': rgb } as CSSProperties
}

/**
 * Social-first archetypes lead with the **Audience** surface (linked
 * accounts + follower analytics). Everything else leads with **Business**
 * (KPIs + tools/links), because followers aren't the point for a contractor,
 * shop, or indie product. Drives the brand detail's archetype-aware tabs.
 */
const SOCIAL_FIRST = new Set<Archetype>(['creator', 'channel'])

export function isSocialFirst(a: Archetype): boolean {
  return SOCIAL_FIRST.has(a)
}

/**
 * Display order for the template grid in the intake flow. Creator
 * goes first (the highest-volume Vitality user); Other goes last
 * (the AI-fallback option).
 */
/**
 * Templates surfaced in the intake picker. Deliberately just two —
 * **Creator** (the social-first flagship) and **Other** (the
 * everything-else catch-all). The full archetype union still exists for
 * back-compat with brands created before this simplification, and the AI
 * intake clamps its result into one of these two.
 */
export const PICKER_ARCHETYPES: Archetype[] = ['creator', 'other']

export const ARCHETYPE_ORDER: Archetype[] = [
  'creator',
  'shop',
  'service',
  'channel',
  'product',
  'construction',
  'restaurant',
  'other',
]
