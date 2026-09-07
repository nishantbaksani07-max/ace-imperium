'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import styles from '../brand.module.css'
import AnalyticsCard from '../AnalyticsCard'
import AnimatedNumber from '../AnimatedNumber'
import AskMentor from '../AskMentor'
import BusinessGoals from '../BusinessGoals'
import ConnectionsCard from '../ConnectionsCard'
import DataPullPanel from '../DataPullPanel'
import MasterPullPanel from '../MasterPullPanel'
import BrandTicker from '../BrandTicker'
import BrandBackdropChart from '../BrandBackdropChart'
import VideoWorkshop from '../VideoWorkshop'
import SocialChart, { type Snap } from '../SocialChart'
import PostPlanBar from '../PostPlanBar'
import FeatureModal from '../FeatureModal'
import InboxPanel from '../InboxPanel'
import PlaybookCard from '../PlaybookCard'
import FeedPanel from '../FeedPanel'
import NichePanel from '../NichePanel'
import BestTimesCard from '../BestTimesCard'
import MoneyPanel from '../MoneyPanel'
import PatreonPanel from '../PatreonPanel'
import PostLinks from '../PostLinks'
import CoworkPanel from '../CoworkPanel'
import BusinessHome from '../BusinessHome'
import CopyFromBrand from '../CopyFromBrand'
import DescriptionBuilder from '../DescriptionBuilder'
import BrandAvatar from '../BrandAvatar'
import PostCalendar, { lastPostedInfo } from '../PostCalendar'
import PlatformIcon from '../PlatformIcon'
import YouTubeVideos from '../YouTubeVideos'
import type { SocialPlatform } from '@/lib/social/types'
import { analyticsUrl, buildMasterPrompt } from '@/lib/social/prompts'
import KpiChart from '../KpiChart'
import Sparkline from '../Sparkline'
import { buildInsightPayload } from '../insightPayload'
import { accentVars, ARCHETYPE_ACCENTS } from '../archetypes'
import {
  deadlineUrgency,
  formatCountdown,
  nextDeadline,
  periodFraction,
  urgencyColor,
  urgencyDeepColor,
  useNow,
} from '../deadlines'
import {
  ARCHETYPE_LABELS,
  CADENCE_UNIT_LABELS,
  PLATFORM_LABELS,
  PLATFORM_SHORT,
  platformProfileUrl,
} from '../types'
import type { Brand, BrandAccount, BrandKpi, CadencePeriod, CadenceUnit, Platform, Schedule } from '../types'
import type { BrandActions } from '../state'

/**
 * Platforms with a working "live refresh" backend. See
 * /app/api/brand/refresh — youtube uses the official API, tiktok
 * scrapes the public profile page. Everything else is manual entry
 * for now (no free, reliable read path).
 */
const LIVE_PLATFORMS = new Set<Platform>(['youtube', 'youtube_long', 'tiktok'])

/**
 * Platforms that show a ↻ refresh on their account card. YouTube + TikTok
 * refresh live; Instagram has no free API, so its ↻ nudges the user to pull
 * their numbers via the master prompt instead of silently doing nothing.
 */
const REFRESHABLE = new Set<Platform>(['youtube', 'youtube_long', 'tiktok', 'instagram'])
import {
  dailyTarget, deltaSinceDays, kpiDeltaSince, kpiSeries, scheduleProgress, totalFollowers,
  trailingStreak, useBrandState,
} from '../state'
import { getLocalDateKey } from '@/lib/dates'

/** Popup titles for each feature panel, keyed by the `active` panel id. */
const PANEL_TITLES: Record<string, string> = {
  numbers: 'Numbers',
  inbox: 'Comments & DMs',
  aud: 'Audience & Times',
  topflop: 'Best & worst videos',
  retention: 'Retention & traffic',
  working: "What's working",
  niche: 'Niche',
  post: 'When to post',
  money: 'Money',
  msgs: 'Inbox',
}

const SOCIAL_OF: Partial<Record<Platform, SocialPlatform>> = {
  instagram: 'instagram', tiktok: 'tiktok', youtube: 'youtube', youtube_long: 'youtube',
}
const ADD_PLATFORMS: Platform[] = ['patreon', 'instagram', 'tiktok', 'youtube', 'x', 'threads', 'substack', 'website', 'other']

/** Fill/freshness status for a feature button, from its saved packRead keys.
 *  empty → red (no data), stale → amber (>14d old, update due), filled → green. */
function featureStatus(brand: Brand, keys: string[]): { state: 'filled' | 'stale' | 'empty'; short: string; full: string } {
  let latest = 0
  for (const k of keys) {
    const r = brand.packReads?.[k]
    if (r) { const t = Date.parse(r.at); if (Number.isFinite(t)) latest = Math.max(latest, t) }
  }
  if (!latest) return { state: 'empty', short: 'needs data', full: 'No data yet — pull it' }
  const days = Math.floor((Date.now() - latest) / 86_400_000)
  const ago = days <= 0 ? 'today' : days === 1 ? '1d ago' : `${days}d ago`
  if (days >= 14) return { state: 'stale', short: 'update due', full: `Last updated ${ago} — time to refresh` }
  return { state: 'filled', short: ago, full: `Updated ${ago}` }
}
const NULL_SNAP_METRICS = {
  reach: null, pct_non_followers: null, likes: null, comments: null,
  saves: null, shares: null, follows: null, engagement_rate: null,
} as const

/**
 * Build a chart series for one account: its saved follower history plus any
 * pasted snapshots for that platform, oldest → newest. So a graph appears off
 * the bat from whatever past data we already have.
 */
function accountSnaps(account: BrandAccount, snapshots: Snap[]): Snap[] {
  const sp = SOCIAL_OF[account.platform]
  if (!sp) return []
  const hist: Snap[] = (account.history ?? []).map((h) => ({
    platform: sp,
    captured_at: h.at,
    followers: typeof h.count === 'number' ? h.count : null,
    views: typeof h.views === 'number' ? h.views : null,
    ...NULL_SNAP_METRICS,
  }))
  const snaps = snapshots.filter((s) => s.platform === sp)
  return [...hist, ...snaps].sort((a, b) => (a.captured_at < b.captured_at ? -1 : 1))
}

interface Props {
  id: string
}

const ALL_PLATFORMS: Platform[] = [
  'tiktok', 'instagram', 'youtube', 'youtube_long',
  'x', 'linkedin', 'threads', 'substack', 'patreon',
  'etsy', 'shopify', 'website',
  'google_business', 'yelp', 'opentable', 'zillow', 'github',
  'other',
]

const ALL_UNITS: CadenceUnit[] = [
  'posts', 'videos', 'shorts', 'episodes', 'newsletters',
  'listings', 'commits', 'sales', 'outreach', 'shipments',
  'jobs', 'leads', 'bookings', 'showings', 'features',
]

/**
 * Single-brand detail page.
 *
 * Four blocks stacked top-to-bottom:
 *   1. Hero — emoji + name + archetype chip + blurb
 *   2. Cadence card — today's count, big +/− buttons, streak chip,
 *      progress bar, inline editable target
 *   3. Accounts card — list of linked accounts with editable follower
 *      counts, add-account row at the bottom
 *   4. Reflection card — single textarea, saves on blur; shows the
 *      last-edited timestamp
 *
 * Missing brand id (typo'd URL, deleted from another tab) bounces back
 * to the index with a soft notice.
 */
export default function BrandDetail({ id }: Props) {
  const router = useRouter()
  const { ready, state, actions } = useBrandState()
  const [mounted, setMounted] = useState(false)
  const [view, setView] = useState<'business' | 'social'>('social')
  useEffect(() => setMounted(true), [])

  const brand = useMemo(() => state.brands.find(b => b.id === id), [state.brands, id])

  if (!mounted || !ready) {
    return (
      <main className={`${styles.page} grain-overlay`}>
        <div className={styles.shell} />
      </main>
    )
  }

  if (!brand) {
    return (
      <main className={`${styles.page} grain-overlay`}>
        <div className={styles.shell}>
          <header className={styles.header}>
            <div className={styles.headerLeft}>
              <Link href="/app/brand" className={styles.back}>
                <span className={styles.backArrow}>←</span> Brand
              </Link>
              <h1 className={styles.title}>Not found</h1>
            </div>
          </header>
          <p className={styles.notFoundText}>
            That brand isn’t in your list anymore. It may have been
            deleted on another device.
          </p>
        </div>
      </main>
    )
  }

  // Distinct platforms this brand has linked — shown as logos in the header so
  // you can see at a glance which socials are connected.
  const socialPlatforms = Array.from(new Set(brand.accounts.map((a) => a.platform)))
  const heroAccount = brand.accounts.find((a) => a.id === brand.heroAvatarAccountId) ?? null
  const heroAvatarUrl = heroAccount?.avatarUrl || null

  return (
    <main className={`${styles.page} grain-overlay`} style={accentVars(brand.archetype)}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerBar}>
            <Link href="/app/brand" className={styles.back}>
              <span className={styles.backArrow}>←</span> Brand
            </Link>
            <div className={styles.headerBarRight}>
              {socialPlatforms.length > 0 && (
                <div className={styles.socialIcons} aria-label="Linked socials">
                  {socialPlatforms.map((p) => <PlatformIcon key={p} platform={p} />)}
                </div>
              )}
              <button
                type="button"
                className={styles.dangerBtn}
                onClick={() => {
                  if (confirm(`Delete "${brand.name}"? This can't be undone.`)) {
                    actions.deleteBrand(brand.id)
                    router.push('/app/brand')
                  }
                }}
                title="Delete brand"
                aria-label={`Delete ${brand.name}`}
              >
                Delete
              </button>
            </div>
          </div>

          <div className={styles.detailHeroCenter}>
            {brand.heroGraph ? (
              <HeroGraph brand={brand} />
            ) : heroAvatarUrl ? (
              <div
                className={styles.heroBg}
                style={{ backgroundImage: `url("${heroAvatarUrl}")` }}
                aria-hidden
              />
            ) : null}
            <div className={styles.detailHero}>
              {!brand.heroGraph && heroAvatarUrl && heroAccount ? (
                <span className={styles.detailHeroPic}>
                  <BrandAvatar platform={heroAccount.platform} avatarUrl={heroAccount.avatarUrl} size={60} />
                </span>
              ) : (
                <span className={styles.detailEmoji} aria-hidden>{brand.heroGraph ? '📈' : brand.emoji}</span>
              )}
              <div className={styles.detailHeroText}>
                <h1 className={styles.title}>{brand.name}</h1>
                <span className={styles.detailChip}>{ARCHETYPE_LABELS[brand.archetype]}</span>
              </div>
            </div>
            {brand.blurb && <p className={styles.detailBlurb}>{brand.blurb}</p>}
            <HeroBgPicker brand={brand} actions={actions} />
          </div>
        </header>

        <div className={styles.brandTabs} role="tablist" aria-label="Brand view">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'business'}
            className={view === 'business' ? styles.brandTabActive : styles.brandTab}
            onClick={() => setView('business')}
          >
            Business
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'social'}
            className={view === 'social' ? styles.brandTabActive : styles.brandTab}
            onClick={() => setView('social')}
          >
            Social media
          </button>
        </div>

        {view === 'social' ? (
          <>
            <BrandHome brand={brand} actions={actions} brands={state.brands} />
          </>
        ) : (
          <BusinessHome brand={brand} actions={actions} />
        )}
      </div>
    </main>
  )
}

/**
 * Hero background picker — choose what fills the hero backdrop:
 *   · a linked account's profile picture (faded behind the title), or
 *   · an animated combined-growth graph (how you're moving up on all socials), or
 *   · the plain emoji.
 * Avatar options only appear for accounts that actually have a pulled avatar;
 * the graph appears once any account has followers.
 */
function HeroBgPicker({ brand, actions }: { brand: Brand; actions: BrandActions }) {
  const [open, setOpen] = useState(false)
  const choices = brand.accounts.filter((a) => a.avatarUrl)
  const canGraph = brand.accounts.some((a) => typeof a.followers === 'number' && a.followers > 0)
  if (choices.length === 0 && !canGraph) return null

  const label = brand.heroGraph
    ? '◐ Change hero background'
    : brand.heroAvatarAccountId
      ? '◐ Change hero background'
      : '◐ Set a hero background'

  return (
    <div className={styles.heroPick}>
      <button type="button" className={styles.heroPickBtn} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {label}
      </button>
      {open && (
        <div className={styles.heroPickRow}>
          {choices.map((a) => (
            <button
              key={a.id}
              type="button"
              className={!brand.heroGraph && brand.heroAvatarAccountId === a.id ? styles.heroPickItemActive : styles.heroPickItem}
              onClick={() => { actions.setHeroAvatar(brand.id, a.id); setOpen(false) }}
              title={`Use ${PLATFORM_LABELS[a.platform]} picture`}
              aria-label={`Use ${PLATFORM_LABELS[a.platform]} picture`}
            >
              <BrandAvatar platform={a.platform} avatarUrl={a.avatarUrl} size={30} />
            </button>
          ))}
          {canGraph && (
            <button
              type="button"
              className={brand.heroGraph ? styles.heroPickPillActive : styles.heroPickPill}
              onClick={() => { actions.setHeroGraph(brand.id, true); setOpen(false) }}
            >
              📈 Growth graph
            </button>
          )}
          <button
            type="button"
            className={!brand.heroGraph && !brand.heroAvatarAccountId ? styles.heroPickPillActive : styles.heroPickPill}
            onClick={() => { actions.setHeroAvatar(brand.id, null); actions.setHeroGraph(brand.id, false); setOpen(false) }}
          >
            {brand.emoji} Emoji
          </button>
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// HeroGraph — an animated "going up on all socials" backdrop. Builds a combined
// total-followers-over-time series from every account's history (forward-filled
// so each social's latest count carries forward), then draws a rising area that
// animates in with a glowing dot travelling the line. Falls back to a smooth
// synthesized rise to today's total when history is thin, so it always reads as
// momentum. Decorative only.
// -----------------------------------------------------------------------------

/** Evenly sample a series down to at most `max` points. */
function downsample(values: number[], max: number): number[] {
  if (values.length <= max) return values
  const out: number[] = []
  const step = (values.length - 1) / (max - 1)
  for (let i = 0; i < max; i++) out.push(values[Math.round(i * step)])
  return out
}

/** Combined total-followers trajectory across all accounts (forward-filled). */
function combinedGrowthSeries(brand: Brand): number[] {
  const perAccount = brand.accounts
    .map((a) => (a.history ?? [])
      .map((h) => ({ t: Date.parse(h.at), c: h.count }))
      .filter((p): p is { t: number; c: number } => Number.isFinite(p.t) && typeof p.c === 'number')
      .sort((x, y) => x.t - y.t))
    .filter((s) => s.length > 0)

  const times = Array.from(new Set(perAccount.flat().map((p) => p.t))).sort((a, b) => a - b)
  if (times.length >= 2) {
    const totals = times.map((t) =>
      perAccount.reduce((sum, s) => {
        let v = 0
        for (const p of s) { if (p.t <= t) v = p.c; else break }
        return sum + v
      }, 0))
    const ds = downsample(totals, 48)
    if (ds.length >= 2 && Math.max(...ds) > Math.min(...ds)) return ds
  }

  // Thin/flat history → synthesize a smooth rise to today's total.
  const total = brand.accounts.reduce((s, a) => s + (typeof a.followers === 'number' ? a.followers : 0), 0)
  if (total <= 0) return []
  return [0.46, 0.55, 0.62, 0.7, 0.77, 0.84, 0.9, 0.95, 1].map((f) => Math.round(total * f))
}

function HeroGraph({ brand }: { brand: Brand }) {
  const uid = useId().replace(/:/g, '')
  const series = useMemo(() => combinedGrowthSeries(brand), [brand])
  if (series.length < 2) return null

  const W = 1000, H = 320, pad = 10
  const min = Math.min(...series)
  const max = Math.max(...series)
  const range = max - min || 1
  const pts = series.map((v, i) => {
    const x = (i / (series.length - 1)) * W
    const y = H - pad - ((v - min) / range) * (H - pad * 2)
    return [x, y] as const
  })
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const area = `${line} L${W} ${H} L0 ${H} Z`
  const lineId = `hgl-${uid}`
  const fillId = `hgf-${uid}`

  return (
    <div className={styles.heroGraph} aria-hidden>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={styles.heroGraphSvg}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${fillId})`} className={styles.heroGraphArea} />
        <path id={lineId} d={line} pathLength={1} fill="none" className={styles.heroGraphLine} />
        <circle r="5" className={styles.heroGraphDot}>
          <animateMotion dur="7s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
            <mpath href={`#${lineId}`} />
          </animateMotion>
        </circle>
      </svg>
    </div>
  )
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function timeToMinutes(v: string): number {
  const [h, m] = v.split(':').map(n => parseInt(n, 10))
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return Math.max(0, Math.min(1439, h * 60 + m))
}

// -----------------------------------------------------------------------------
// Command center — the brand's main surface. Schedules (what to ship, by
// when) sit on top; accounts (who's watching) sit below. Replaces the
// old separate Today + Accounts + Stats cards.
// -----------------------------------------------------------------------------

type BrandTabId = 'ship' | 'audience' | 'business'

/**
 * Archetype-driven tab nav for the brand detail.
 *
 *   · Ship      — everyone. The cadence + deadline-clock tracker. Unit-
 *                 agnostic, so it reads as videos / jobs / leads / sales.
 *   · Audience  — social-first archetypes (or any brand with linked
 *                 accounts). Follower accounts + live analytics.
 *   · Business  — custom metrics (revenue, leads, MRR, review score) + tool
 *                 links. Where a non-social "Other" brand lives.
 *
 * All three tabs show for every brand (so an Other brand can still add
 * marketing socials, and a creator can track revenue). Archetype only sets
 * the order after Ship: social-first → [Ship, Audience, Business]; the rest
 * → [Ship, Business, Audience]. Ship is always the default tab (the primary
 * action is "ship today" for everyone).
 */
/**
 * Two tabs at the top of every brand:
 *   · Studio   — the analytics page. Momentum + your numbers + the social
 *                command center (charts, metrics, upload markers, AI advice).
 *                This is where you SEE how things are going.
 *   · Workshop — the factory. The script → edit → upload pipeline, the upload
 *                log that feeds the chart markers, the schedule, business
 *                goals, and the AI coach. This is where you MAKE things.
 * Advanced extras on each tab live behind a single "More" toggle so the
 * default view stays minimal.
 */
function BrandHome({ brand, actions, brands }: { brand: Brand; actions: BrandActions; brands: Brand[] }) {
  // Deliberately minimal: just your linked channels. Tap one → its graph (built
  // from saved history + pasted numbers) + the Claude Chrome data packs. Default
  // to the first account so a graph/data shows off the bat. No tabs, no extras.
  const [activeAcctId, setActiveAcctId] = useState<string | null>(brand.accounts[0]?.id ?? null)
  // Honor a ?account=<id> deep link (e.g. clicking a tile on the Socials grid)
  // so we land focused on that specific account.
  useEffect(() => {
    const acc = new URLSearchParams(window.location.search).get('account')
    if (acc && brand.accounts.some((a) => a.id === acc)) setActiveAcctId(acc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [snapshots, setSnapshots] = useState<Snap[]>([])
  // One feature panel open at a time, shown in a popup (FeatureModal). null = none.
  const [active, setActive] = useState<string | null>(null)
  const [inboxKind, setInboxKind] = useState<'comments' | 'dms'>('comments')
  const [audKind, setAudKind] = useState<'audience' | 'times'>('audience')
  const [masterOpen, setMasterOpen] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newPlatform, setNewPlatform] = useState<Platform>('patreon')
  const [newHandle, setNewHandle] = useState('')
  const [newFollowers, setNewFollowers] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const addFileRef = useRef<HTMLInputElement>(null)

  // Read a screenshot (any social/dashboard view) with Claude vision to pre-fill
  // the new account's handle + follower count. Shares the /api/brand/import-stats
  // path the per-account edit row uses.
  async function importNewAccountShot(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file || importing) return
    setImporting(true)
    setImportMsg(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('platform', newPlatform)
      const res = await fetch('/api/brand/import-stats', { method: 'POST', body: fd })
      const data = (await res.json().catch(() => ({}))) as { followers?: number | null; handle?: string | null; error?: string }
      if (!res.ok) throw new Error(data.error || 'Could not read that screenshot')
      if (typeof data.followers === 'number') setNewFollowers(data.followers)
      if (data.handle && !newHandle.trim()) setNewHandle(data.handle)
      const bits: string[] = []
      if (data.handle) bits.push(data.handle)
      if (typeof data.followers === 'number') bits.push(`${data.followers.toLocaleString()} followers`)
      setImportMsg(bits.length ? `Read ${bits.join(' · ')}` : 'No numbers found in that image.')
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [refreshNote, setRefreshNote] = useState<string | null>(null)
  const [calendarAcctId, setCalendarAcctId] = useState<string | null>(null)
  const focusAccount = brand.accounts.find((a) => a.id === activeAcctId) ?? brand.accounts[0] ?? null
  const calendarAccount = calendarAcctId ? (brand.accounts.find((a) => a.id === calendarAcctId) ?? null) : null
  // Patreon is a money platform, not a reach one — its tile shows only the API
  // data (patrons + pledge), none of the social pull/graph sections.
  const isPatreon = focusAccount?.platform === 'patreon'

  /** Refresh one account's numbers. YouTube/TikTok pull live from their APIs.
   *  Platforms with no free API (Instagram, etc.) instead kick off the Claude
   *  Chrome pull — copy the master prompt + open the analytics page — so the
   *  user's paste-back flows every metric through /api/social/ingest into
   *  Supabase and onto the graph, exactly like the live platforms. */
  async function refreshAccount(a: BrandAccount) {
    if (refreshingId) return
    if (!LIVE_PLATFORMS.has(a.platform)) {
      const sp = SOCIAL_OF[a.platform]
      if (!sp) { setRefreshNote(`${PLATFORM_LABELS[a.platform]} can’t auto-refresh — enter its numbers manually.`); return }
      try { await navigator.clipboard.writeText(buildMasterPrompt(sp, a.handle || undefined)) } catch { /* the tab still opens */ }
      const url = analyticsUrl(sp, a.handle)
      if (url) window.open(url, '_blank', 'noopener')
      setRefreshNote(null)
      return
    }
    if (!a.handle.trim()) { setRefreshNote('Add the channel handle first.'); return }
    setRefreshingId(a.id)
    setRefreshNote(null)
    try {
      const patch = await fetchAccountStats(a.platform, a.handle)
      actions.updateAccount(brand.id, a.id, patch)
    } catch (e) {
      setRefreshNote(e instanceof Error ? e.message : 'Could not refresh.')
    } finally {
      setRefreshingId(null)
    }
  }

  const refetchSnapshots = useCallback(async () => {
    try {
      const res = await fetch(`/api/social/snapshots?brand=${encodeURIComponent(brand.id)}`)
      const data = await res.json()
      setSnapshots(Array.isArray(data.snapshots) ? data.snapshots : [])
    } catch {
      /* keep what we have */
    }
  }, [brand.id])
  useEffect(() => { void refetchSnapshots() }, [refetchSnapshots])

  const series = focusAccount ? accountSnaps(focusAccount, snapshots) : []
  const focusSp = focusAccount ? SOCIAL_OF[focusAccount.platform] : null
  const hasNumbers = focusSp ? snapshots.some((s) => s.platform === focusSp) : false
  const inboxStatus = featureStatus(brand, ['comment_feed', 'dm_feed'])
  const audStatus = featureStatus(brand, ['audience_feed', 'times_feed'])
  const nicheStatus = featureStatus(brand, ['niche'])
  const postStatus = featureStatus(brand, ['posting_times'])
  const workingStatus = featureStatus(brand, ['whatsworking'])
  const topflopStatus = featureStatus(brand, ['topflop'])
  const retentionStatus = featureStatus(brand, ['retention'])
  const isYouTube = !!focusAccount && (focusAccount.platform === 'youtube' || focusAccount.platform === 'youtube_long')

  // The master button IS the launcher: copy the everything-prompt + open the
  // channel's analytics in one user gesture (so the tab isn't popup-blocked),
  // then reveal the paste-back panel. Clicking again just closes it.
  const launchMaster = useCallback(() => {
    if (masterOpen) { setMasterOpen(false); return }
    if (focusAccount) {
      const sp = focusSp ?? 'other'
      const handle = focusAccount.handle
      try { void navigator.clipboard.writeText(buildMasterPrompt(sp, handle || undefined)) } catch { /* panel still opens */ }
      const url = analyticsUrl(sp, handle)
      if (url) window.open(url, '_blank', 'noopener')
    }
    setMasterOpen(true)
  }, [masterOpen, focusAccount, focusSp])

  const moneyStatus = (brand.finance?.entries?.length ?? 0) > 0
    ? { state: 'filled' as const, short: 'tracked', full: 'Money is being tracked' }
    : { state: 'empty' as const, short: 'needs data', full: 'No money tracked yet' }

  // Feature buttons grouped by purpose — PULL (raw Claude-Chrome data) vs READ
  // (AI strategy syntheses), each sorted so "needs data" surfaces first. No
  // emojis; the status dot/check carries the state. Money sits on its own.
  type Feat = { key: string; label: string; state: 'filled' | 'stale' | 'empty'; full: string; active: boolean; toggle: () => void }
  const RANK = { empty: 0, stale: 1, filled: 2 } as const
  const byNeed = (a: Feat, b: Feat) => RANK[a.state] - RANK[b.state]
  // Open this panel in the popup (toggles closed if it's already the open one).
  const panel = (k: string) => ({ active: active === k, toggle: () => setActive((cur) => (cur === k ? null : k)) })

  const pullFeats: Feat[] = ([
    { key: 'numbers', label: 'Numbers', state: (hasNumbers ? 'filled' : 'empty') as Feat['state'], full: 'Pull your follower / view numbers', ...panel('numbers') },
    { key: 'inbox', label: 'Comments & DMs', state: inboxStatus.state, full: inboxStatus.full, ...panel('inbox') },
    { key: 'aud', label: 'Audience & Times', state: audStatus.state, full: audStatus.full, ...panel('aud') },
    ...(isYouTube ? [
      { key: 'topflop', label: 'Best & worst videos', state: topflopStatus.state, full: topflopStatus.full, ...panel('topflop') },
      { key: 'retention', label: 'Retention & traffic', state: retentionStatus.state, full: retentionStatus.full, ...panel('retention') },
    ] : []),
  ] as Feat[]).sort(byNeed)

  const readFeats: Feat[] = ([
    { key: 'working', label: "What's working", state: workingStatus.state, full: workingStatus.full, ...panel('working') },
    { key: 'niche', label: 'Niche', state: nicheStatus.state, full: nicheStatus.full, ...panel('niche') },
    { key: 'post', label: 'When to post', state: postStatus.state, full: postStatus.full, ...panel('post') },
  ] as Feat[]).sort(byNeed)

  const renderFeat = (f: Feat) => {
    // Red = no data yet. It's not "active" — you activate it with the master
    // "Fill it all with Claude" pull above, so the button is non-clickable and
    // grayed, with a hint pointing up to it.
    const locked = f.state === 'empty'
    return (
      <button
        key={f.key}
        type="button"
        className={`${f.active ? styles.featBtnActive : styles.featBtn}${locked ? ` ${styles.featBtnLocked}` : ''}`}
        onClick={locked ? undefined : f.toggle}
        disabled={locked}
        title={locked ? 'No data yet — pull it with “Fill it all with Claude” above' : f.full}
      >
        {f.state === 'filled'
          ? <span className={styles.featCheck} aria-hidden>✓</span>
          : <span className={styles.featureDot} data-state={f.state} aria-hidden />}
        <span className={styles.featLabel}>{f.label}</span>
        {locked && <span className={styles.featLockedHint}>Fill it all ↑</span>}
      </button>
    )
  }

  // Empty brand → one focused "add your first channel" card. Everything else
  // (feature buttons, graph, playbook) needs an account, so we don't scatter
  // empty modules across the page; we guide to the single action that matters.
  if (brand.accounts.length === 0) {
    return (
      <div className={styles.brandHome}>
        <div className={styles.emptyStage}>
          <span className={styles.emptyIcon} aria-hidden>📡</span>
          <h2 className={styles.emptyTitle}>Add your first channel</h2>
          <p className={styles.emptyLead}>
            Link a TikTok, Instagram or YouTube to start pulling its data. Paste a screenshot and Claude reads the numbers for you.
          </p>
          <form
            className={styles.emptyAddForm}
            onSubmit={(e) => {
              e.preventDefault()
              const h = newHandle.trim()
              if (!h) return
              actions.addAccount(brand.id, newPlatform, h, newFollowers)
              setNewHandle(''); setNewFollowers(null); setImportMsg(null)
            }}
          >
            <select className={styles.scSelect} value={newPlatform} onChange={(e) => setNewPlatform(e.target.value as Platform)} aria-label="Platform">
              {ADD_PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
            </select>
            <input className={styles.connInput} value={newHandle} onChange={(e) => setNewHandle(e.target.value)} placeholder="@handle or url" autoFocus />
            <input ref={addFileRef} type="file" accept="image/*" hidden onChange={importNewAccountShot} />
            <button type="button" className={styles.acctImportBtn} onClick={() => addFileRef.current?.click()} disabled={importing}>
              {importing ? 'Reading screenshot…' : '📷 Upload screenshot / data'}
            </button>
            {importMsg && <p className={styles.acctImportMsg}>{importMsg}</p>}
            <button type="submit" className={styles.connConnect} disabled={!newHandle.trim()}>Add channel</button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.brandHome}>
      <BrandTicker brand={brand} snapshots={snapshots} />

      <div className={styles.acctStage}>
        <BrandBackdropChart brand={brand} />
        <div className={styles.acctCards} role="tablist" aria-label="Your accounts">
        {brand.accounts.map((a) => {
          const isYouTube = a.platform === 'youtube' || a.platform === 'youtube_long'
          const series = (a.history ?? []).map((h) => h.count).filter((v): v is number => typeof v === 'number')
          const posted = lastPostedInfo(a)
          const calOpen = calendarAcctId === a.id
          return (
            <div key={a.id} className={styles.acctCardWrap}>
              <button
                type="button"
                role="tab"
                aria-selected={focusAccount?.id === a.id}
                className={focusAccount?.id === a.id ? styles.acctCardActive : styles.acctCard}
                onClick={() => setActiveAcctId(a.id)}
              >
                <div className={styles.acctCardTop}>
                  <BrandAvatar platform={a.platform} avatarUrl={a.avatarUrl} size={34} />
                  <div className={styles.acctCardId}>
                    <span className={styles.acctCardPlatform}>{PLATFORM_LABELS[a.platform]}</span>
                    <span className={styles.acctCardHandle}>{a.handle || '—'}</span>
                  </div>
                </div>
                <div className={styles.acctCardNumRow}>
                  <span className={styles.acctCardNum}>{typeof a.followers === 'number' ? a.followers.toLocaleString() : '—'}</span>
                  <span className={styles.acctCardLabel}>{isYouTube ? 'subs' : 'followers'}</span>
                </div>
                {series.length >= 2
                  ? <Sparkline values={series} color="var(--accent)" height={30} className={styles.acctCardSpark} />
                  : <span className={styles.acctCardHint}>refresh to see the trend</span>}
              </button>
              {REFRESHABLE.has(a.platform) && (
                <button
                  type="button"
                  className={styles.acctCardRefresh}
                  onClick={() => void refreshAccount(a)}
                  disabled={refreshingId === a.id}
                  aria-label={LIVE_PLATFORMS.has(a.platform) ? `Refresh ${PLATFORM_LABELS[a.platform]}` : `Pull ${PLATFORM_LABELS[a.platform]} via Claude Chrome`}
                  title={LIVE_PLATFORMS.has(a.platform) ? `Refresh ${PLATFORM_LABELS[a.platform]}` : `Pull ${PLATFORM_LABELS[a.platform]} via Claude Chrome`}
                >
                  <span className={refreshingId === a.id ? styles.acctCardRefreshSpin : undefined} aria-hidden>↻</span>
                </button>
              )}
              <div className={styles.acctCardFoot}>
                <span className={`${styles.acctCardPosted} ${styles[`acctCardPosted_${posted.tone}`]}`} title="Most recent post on this account">
                  <span className={styles.acctCardPostedDot} aria-hidden>●</span>
                  {posted.tone === 'none' ? 'No posts yet' : `Posted ${posted.label}`}
                </span>
                <button
                  type="button"
                  className={calOpen ? styles.acctCardCalActive : styles.acctCardCal}
                  aria-expanded={calOpen}
                  onClick={() => setCalendarAcctId((id) => (id === a.id ? null : a.id))}
                >
                  📅 Calendar
                </button>
              </div>
            </div>
          )
        })}

        {showAdd ? (
          <form
            className={styles.acctCardAddForm}
            onSubmit={(e) => {
              e.preventDefault()
              const h = newHandle.trim()
              if (!h) return
              actions.addAccount(brand.id, newPlatform, h, newFollowers)
              setNewHandle(''); setNewFollowers(null); setImportMsg(null)
              setShowAdd(false)
            }}
          >
            <select className={styles.scSelect} value={newPlatform} onChange={(e) => setNewPlatform(e.target.value as Platform)} aria-label="Platform">
              {ADD_PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
            </select>
            <input className={styles.connInput} value={newHandle} onChange={(e) => setNewHandle(e.target.value)} placeholder="@handle or url" autoFocus />
            <input ref={addFileRef} type="file" accept="image/*" hidden onChange={importNewAccountShot} />
            <button
              type="button"
              className={styles.acctImportBtn}
              onClick={() => addFileRef.current?.click()}
              disabled={importing}
              title="Upload a screenshot of your profile or dashboard and Claude reads the numbers"
            >
              {importing ? 'Reading screenshot…' : '📷 Upload screenshot / data'}
            </button>
            {importMsg && <p className={styles.acctImportMsg}>{importMsg}</p>}
            <div className={styles.acctCardAddBtns}>
              <button type="submit" className={styles.connConnect} disabled={!newHandle.trim()}>Add</button>
              <button type="button" className={styles.playbookSecondary} onClick={() => { setShowAdd(false); setNewFollowers(null); setImportMsg(null) }}>Cancel</button>
            </div>
          </form>
        ) : (
          <button type="button" className={styles.acctCardAdd} onClick={() => setShowAdd(true)} aria-label="Add account">
            <span className={styles.acctCardPlus} aria-hidden>+</span>
            <span className={styles.acctCardAddLabel}>Add account</span>
          </button>
        )}
        </div>
      </div>

      {calendarAccount && <PostCalendar brand={brand} account={calendarAccount} actions={actions} />}

      <div className={styles.topRow}>
        <button
          type="button"
          className={active === 'msgs' ? styles.inboxSquareActive : styles.inboxSquare}
          onClick={() => setActive((cur) => (cur === 'msgs' ? null : 'msgs'))}
          title="Pull comments / DMs / email from every source + triage who to reply to"
          aria-label="Inbox"
        >
          <span className={styles.inboxSquareIcon} aria-hidden>📥</span>
          <span className={styles.inboxSquareLabel}>Inbox</span>
        </button>
        {focusAccount && <CoworkPanel brand={brand} focusAccount={focusAccount} snapshots={snapshots} />}
        <CopyFromBrand targetBrand={brand} brands={brands} actions={actions} />
      </div>

      {refreshNote && <p className={styles.connNotice}>{refreshNote}</p>}

      {focusAccount && isPatreon && <PatreonPanel brandId={brand.id} />}

      {focusAccount && !isPatreon && (
        <div className={styles.pullSection}>
          <div className={styles.masterWrap}>
            <button
              type="button"
              className={masterOpen ? styles.masterBtnActive : styles.masterBtn}
              onClick={launchMaster}
              title="Copies the everything-prompt + opens your analytics, then paste the reply back"
            >
              🪄 Fill it all with Claude
              <span className={styles.masterBtnSub}>opens your analytics + copies the master prompt</span>
            </button>
            {masterOpen && (
              <MasterPullPanel
                brand={brand}
                actions={actions}
                focusAccount={focusAccount}
                onSaved={refetchSnapshots}
                onDone={() => setMasterOpen(false)}
              />
            )}
          </div>

          <div className={styles.featCols}>
            <div className={styles.featCol}>
              <span className={styles.featColHead}>Pull data</span>
              <div className={styles.featColList}>{pullFeats.map(renderFeat)}</div>
            </div>
            <div className={styles.featCol}>
              <span className={styles.featColHead}>Reads</span>
              <div className={styles.featColList}>{readFeats.map(renderFeat)}</div>
            </div>
          </div>
        </div>
      )}

      <div className={styles.featMoneyRow}>
        <button
          type="button"
          className={active === 'money' ? styles.featBtnActive : styles.featBtn}
          onClick={() => setActive((cur) => (cur === 'money' ? null : 'money'))}
          title={moneyStatus.full}
        >
          {moneyStatus.state === 'filled'
            ? <span className={styles.featCheck} aria-hidden>✓</span>
            : <span className={styles.featureDot} data-state={moneyStatus.state} aria-hidden />}
          <span className={styles.featLabel}>Money</span>
        </button>
      </div>

      <PostLinks brand={brand} actions={actions} focusAccount={focusAccount} />

      {!isPatreon && <DescriptionBuilder brand={brand} actions={actions} />}

      {active && focusAccount && (
        <FeatureModal title={PANEL_TITLES[active] ?? ''} onClose={() => setActive(null)} style={accentVars(brand.archetype)}>
          {active === 'inbox' && (
            <>
              <div className={styles.scPills}>
                <button type="button" className={inboxKind === 'comments' ? styles.scPillActive : styles.scPill} onClick={() => setInboxKind('comments')}>Comments</button>
                <button type="button" className={inboxKind === 'dms' ? styles.scPillActive : styles.scPill} onClick={() => setInboxKind('dms')}>DMs</button>
              </div>
              <FeedPanel kind={inboxKind} brand={brand} actions={actions} focusAccount={focusAccount} />
            </>
          )}

          {active === 'niche' && (
            <NichePanel brand={brand} actions={actions} focusAccount={focusAccount} snapshots={snapshots} />
          )}

          {active === 'aud' && (
            <>
              <div className={styles.scPills}>
                <button type="button" className={audKind === 'audience' ? styles.scPillActive : styles.scPill} onClick={() => setAudKind('audience')}>Audience</button>
                <button type="button" className={audKind === 'times' ? styles.scPillActive : styles.scPill} onClick={() => setAudKind('times')}>Posting times</button>
              </div>
              <FeedPanel kind={audKind} brand={brand} actions={actions} focusAccount={focusAccount} />
            </>
          )}

          {active === 'post' && (
            <>
              <BestTimesCard brand={brand} actions={actions} focusAccount={focusAccount} snapshots={snapshots} />
              <SchedulePanel brand={brand} actions={actions} />
            </>
          )}

          {active === 'money' && (
            <>
              <MoneyPanel brand={brand} actions={actions} focusAccount={focusAccount} />
              <ConnectionsCard brandId={brand.id} />
            </>
          )}

          {active === 'msgs' && <InboxPanel brand={brand} actions={actions} />}

          {active === 'numbers' && (
            <DataPullPanel brand={brand} actions={actions} focusAccount={focusAccount} packId="numbers" icon="📊" onSaved={refetchSnapshots} />
          )}
          {active === 'working' && (
            <DataPullPanel brand={brand} actions={actions} focusAccount={focusAccount} packId="whatsworking" icon="✨" />
          )}
          {active === 'topflop' && (
            <DataPullPanel brand={brand} actions={actions} focusAccount={focusAccount} packId="topflop" icon="🎬" />
          )}
          {active === 'retention' && (
            <DataPullPanel brand={brand} actions={actions} focusAccount={focusAccount} packId="retention" icon="🎯" />
          )}
        </FeatureModal>
      )}

      {focusAccount && !isPatreon && (
        <div className={styles.graphCard}>
          <PostPlanBar brand={brand} actions={actions} focusAccount={focusAccount} />
          <YouTubeVideos account={focusAccount} />
          {series.length >= 2 ? (
            <SocialChart snapshots={series} uploads={brand.uploads} />
          ) : (
            <p className={styles.graphHint}>
              Only one data point so far. Tap <b>📊 Numbers</b> above to pull {focusAccount.handle || 'this channel'}’s stats and your graph builds here.
            </p>
          )}
        </div>
      )}

      <PlaybookCard brand={brand} actions={actions} focusAccount={focusAccount} snapshots={snapshots} />
    </div>
  )
}

/**
 * Overall card — a one-glance summary band across all three tabs, at the very
 * top of the brand: ship streak + last-7d ships (from the log), total audience
 * (with weekly delta), and the headline business number (a money metric synced
 * from a connector, else the brand's top manual KPI). Reads local brand state
 * instantly; fetches the connector headline async so it never blocks render.
 */
function OverallCard({ brand }: { brand: Brand }) {
  const [headline, setHeadline] = useState<{ label: string; text: string } | null>(null)

  const { streak, last7, followers } = useMemo(() => {
    const today = new Date()
    const ids = Object.keys(brand.log)
    let ships = 0
    for (let i = 0; i < 7; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const key = getLocalDateKey(d)
      for (const sid of ids) ships += brand.log[sid]?.[key] || 0
    }
    return { streak: trailingStreak(brand), last7: ships, followers: totalFollowers(brand) }
  }, [brand])

  // Prefer a real synced money metric; fall back to the brand's top manual KPI.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/connectors?brand=${encodeURIComponent(brand.id)}`)
        if (res.ok) {
          const data = await res.json()
          const order = ['mrr', 'revenue_30d', 'sales_30d', 'balance', 'subscribers']
          type M = { metric: string; label: string; value: number; unit?: string }
          const all: M[] = (data.connectors ?? []).flatMap((c: { connected: boolean; metrics?: M[] }) => (c.connected ? c.metrics ?? [] : []))
          let pick: M | undefined
          for (const key of order) { pick = all.find((m) => m.metric === key); if (pick) break }
          if (!pick && all.length) pick = all[0]
          if (pick && !cancelled) { setHeadline({ label: pick.label, text: fmtMoney(pick.value, pick.unit) }); return }
        }
      } catch { /* fall through to KPI */ }
      const k = brand.kpis[0]
      if (k && !cancelled) setHeadline({ label: k.label, text: fmtMoney(k.value, k.unit) })
    })()
    return () => { cancelled = true }
  }, [brand.id, brand.kpis])

  const hasAny = streak > 0 || last7 > 0 || followers > 0 || headline
  if (!hasAny) return null

  return (
    <section className={styles.overallCard}>
      {streak > 0 && <span className={styles.overallStat}><b>{streak}</b> day streak</span>}
      <span className={styles.overallStat}><b>{last7}</b> ships / 7d</span>
      {followers > 0 && <span className={styles.overallStat}><b>{followers.toLocaleString()}</b> reach</span>}
      {headline && <span className={styles.overallStat}><b>{headline.text}</b> {headline.label.toLowerCase()}</span>}
    </section>
  )
}

/** Format a value with a free-text unit (mirrors formatKpi). */
function fmtMoney(value: number, unit?: string): string {
  const n = value.toLocaleString()
  const u = (unit ?? '').trim()
  if (!u) return n
  if (/^[$£€¥]/.test(u)) return `${u}${n}`
  if (u === '%') return `${n}%`
  if (u.startsWith('/')) return `${n}${u}`
  return `${n} ${u}`
}

/**
 * Ship momentum — the "how are we doing overall" graph at the top of the Ship
 * tab. Reads the brand's per-schedule ship log: total ships per day over the
 * last 30 days (line) against the combined daily target (dashed line), plus
 * headline stats (streak, last 7 days, 30-day total, % of days on cadence).
 */
function ShipMomentum({ brand }: { brand: Brand }) {
  const DAYS = 30
  const { perDay, total30, last7, target, consistency, streak, remainingToday } = useMemo(() => {
    const today = new Date()
    const keys: string[] = []
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      keys.push(getLocalDateKey(d))
    }
    const scheduleIds = Object.keys(brand.log)
    const dailyIds = brand.schedules.filter(s => s.period === 'daily').map(s => s.id)
    const tgt = dailyTarget(brand)

    const perDay = keys.map(key =>
      scheduleIds.reduce((sum, sid) => sum + (brand.log[sid]?.[key] || 0), 0),
    )
    // Consistency uses daily-schedule counts vs the daily target only.
    let hit = 0
    if (tgt > 0) {
      for (const key of keys) {
        const dailySum = dailyIds.reduce((sum, sid) => sum + (brand.log[sid]?.[key] || 0), 0)
        if (dailySum >= tgt) hit++
      }
    }
    const todayKey = keys[keys.length - 1]
    const todayDaily = dailyIds.reduce((sum, sid) => sum + (brand.log[sid]?.[todayKey] || 0), 0)
    return {
      perDay,
      total30: perDay.reduce((a, b) => a + b, 0),
      last7: perDay.slice(-7).reduce((a, b) => a + b, 0),
      target: tgt,
      consistency: tgt > 0 ? Math.round((hit / DAYS) * 100) : null,
      streak: trailingStreak(brand),
      remainingToday: tgt > 0 ? Math.max(0, tgt - todayDaily) : 0,
    }
  }, [brand])

  return (
    <section className={styles.momentumCard}>
      <header className={styles.kpisHead}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowMark}>✦</span>
          <span className={styles.eyebrowRule} />
          Momentum
        </span>
        <div className={styles.momentumStats}>
          {streak > 0 && <span className={styles.momentumStat}><b>{streak}</b> day streak</span>}
          <span className={styles.momentumStat}><b>{last7}</b> last 7d</span>
          <span className={styles.momentumStat}><b>{total30}</b> ships / 30d</span>
          {consistency != null && <span className={styles.momentumStat}><b>{consistency}%</b> on cadence</span>}
        </div>
      </header>
      {remainingToday > 0 && (
        <p className={styles.cadenceBanner}>
          {streak > 0
            ? <>🔥 <b>{remainingToday}</b> more today to keep your <b>{streak}-day</b> streak alive.</>
            : <><b>{remainingToday}</b> more to hit today’s cadence.</>}
        </p>
      )}
      {total30 === 0 ? (
        <p className={styles.emptyText}>
          Log your first ship with the <b>+ shipped</b> button below and your momentum graph builds here.
        </p>
      ) : (
        <KpiChart values={perDay} target={target > 0 ? target : undefined} width={560} height={120} />
      )}
    </section>
  )
}

/** Schedule — the cadence + deadline-clock tracker. Lives on the Workshop tab. */
function SchedulePanel({ brand, actions }: { brand: Brand; actions: BrandActions }) {
  // 1s tick so the deadline clocks animate smoothly. Safe: the detail body
  // only mounts client-side (behind the `mounted` gate).
  const now = useNow(1000)
  const accentRgb = ARCHETYPE_ACCENTS[brand.archetype].rgb
  const streak = trailingStreak(brand)

  return (
    <div className={styles.shipPanel}>
      <header className={styles.ccHead}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowMark}>·01</span>
          <span className={styles.eyebrowRule} />
          Schedule
        </span>
        {streak > 0 && (
          <span className={`${styles.statChip} ${styles.streakChip}`}>
            {streak}d <span className={styles.statChipLabel}>streak</span>
          </span>
        )}
      </header>

      <div className={styles.scheduleList}>
        {brand.schedules.map(s => (
          <ScheduleRow
            key={s.id}
            brand={brand}
            schedule={s}
            now={now}
            accentRgb={accentRgb}
            actions={actions}
          />
        ))}
      </div>

      {/* Pick the cadence up front rather than adding a default daily one
          and making the user open the gear to change it. */}
      <div className={styles.addScheduleRow}>
        <button
          type="button"
          className={styles.addScheduleBtn}
          onClick={() => actions.addSchedule(brand.id, { period: 'daily' })}
        >
          + Daily
        </button>
        <button
          type="button"
          className={styles.addScheduleBtn}
          onClick={() => actions.addSchedule(brand.id, { period: 'weekly' })}
        >
          + Recurring
        </button>
      </div>
    </div>
  )
}

/** Audience tab — follower accounts + live analytics. Social-first surface. */
/** Prepend https:// when the user pastes a bare host. */
function normalizeUrl(url: string): string {
  const t = url.trim()
  if (!t) return ''
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

/**
 * Business tab — the brand's business dashboard. Top to bottom:
 *   · Overview banner — the seat for the AI business read (Phase 4); for now
 *     a real computed one-liner from the brand's metrics.
 *   · Website button — paste a URL once, it becomes a launch button.
 *   · Custom metrics + tool links.
 * The non-social-first surface; rendered in the brand's --accent.
 */

/** Split a line on **bold** spans into JSX. */
function renderInline(text: string, keyBase: string): JSX.Element[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(part)
    return m
      ? <strong key={`${keyBase}-${i}`}>{m[1]}</strong>
      : <span key={`${keyBase}-${i}`}>{part}</span>
  })
}

/** Render the mentor's "lead line + '- ' bullets + **bold**" format. */
function renderRead(text: string): JSX.Element[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const out: JSX.Element[] = []
  let bullets: string[] = []
  let key = 0
  const flush = () => {
    if (bullets.length === 0) return
    const items = bullets
    const k = key++
    out.push(
      <ul key={`ul-${k}`} className={styles.insightBullets}>
        {items.map((b, i) => <li key={i}>{renderInline(b, `b${k}-${i}`)}</li>)}
      </ul>
    )
    bullets = []
  }
  for (const line of lines) {
    if (line.startsWith('- ')) {
      bullets.push(line.slice(2))
    } else {
      flush()
      const k = key++
      out.push(<p key={`p-${k}`} className={styles.insightLead}>{renderInline(line, `p${k}`)}</p>)
    }
  }
  flush()
  return out
}

/**
 * Business mentor — the AI read of a single venture. Sends the brand's metrics,
 * cadence, and links to /api/brand/insight, which uses Claude + the server-side
 * web_fetch tool to READ the public links and return a short business read.
 * The read is cached on the brand (lastInsight) so it survives navigation; a
 * computed baseline shows until the first read. 402 → Pro upsell.
 */
function InsightBanner({ brand, actions }: { brand: Brand; actions: BrandActions }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsPro, setNeedsPro] = useState(false)

  const read = brand.lastInsight?.trim() || ''
  const generatedAt = brand.lastInsightAt
    ? new Date(brand.lastInsightAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null

  // Computed baseline, shown until the first AI read exists.
  const baseline = useMemo(() => {
    const metricCount = brand.kpis.length
    const revenue = brand.kpis.find(k => /revenue|mrr/i.test(k.label) && k.value > 0)
    const bits: string[] = []
    if (revenue) bits.push(`${formatKpi(revenue.value, revenue.unit)} ${revenue.label.toLowerCase()}`)
    bits.push(metricCount > 0 ? `${metricCount} metric${metricCount === 1 ? '' : 's'} tracked` : 'no metrics yet')
    const linkCount = brand.links.filter(l => l.url.trim()).length
    if (linkCount > 0) bits.push(`${linkCount} link${linkCount === 1 ? '' : 's'}`)
    return bits.join(' · ')
  }, [brand.kpis, brand.links])

  async function generate() {
    if (loading) return
    setLoading(true)
    setError(null)
    setNeedsPro(false)
    try {
      const res = await fetch('/api/brand/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: buildInsightPayload(brand) }),
      })
      if (res.status === 402) { setNeedsPro(true); return }
      const data = await res.json().catch(() => ({})) as { read?: string; error?: string }
      if (!res.ok || !data.read) throw new Error(data.error || `request failed (${res.status})`)
      actions.setInsight(brand.id, data.read)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the mentor.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.insightBanner}>
      <div className={styles.insightHead}>
        <span className={styles.insightSpark} aria-hidden>✦</span>
        <span className={styles.insightEyebrow}>Business mentor</span>
        {generatedAt && !loading && <span className={styles.insightStamp}>read · {generatedAt}</span>}
      </div>

      {loading ? (
        <p className={styles.insightLoading}>
          <span className={styles.insightLoadingDot} aria-hidden />
          Reading your links and numbers…
        </p>
      ) : read ? (
        <div className={styles.insightRead}>{renderRead(read)}</div>
      ) : (
        <p className={styles.insightBody}>
          {baseline}. Generate an AI read of your links and numbers below.
        </p>
      )}

      {needsPro && (
        <p className={styles.insightUpsell}>
          The business mentor is a Pro feature.{' '}
          <Link href="/pricing" className={styles.insightUpsellLink}>See Pro →</Link>
        </p>
      )}
      {error && <p className={styles.insightError}>{error}</p>}

      <div className={styles.insightActions}>
        <button type="button" className={styles.insightBtn} onClick={generate} disabled={loading}>
          {loading ? 'Thinking…' : read ? 'Refresh read' : 'Generate AI read'}
        </button>
      </div>
    </div>
  )
}

/**
 * Website launch button — paste a URL once and it becomes a clickable button
 * (with the host shown). Backed by the brand's "Website" link, so it persists
 * and is editable via "Change". Empty → a paste field.
 */
function WebsiteButton({
  brand, siteLink, actions,
}: {
  brand: Brand
  siteLink: import('../types').BrandLink | null
  actions: BrandActions
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const url = siteLink?.url ? normalizeUrl(siteLink.url) : ''

  function save(e?: React.FormEvent) {
    e?.preventDefault()
    const v = draft.trim()
    if (!v) return
    if (siteLink) actions.updateLink(brand.id, siteLink.id, { url: v })
    else actions.addLink(brand.id, 'Website', v)
    setDraft('')
    setEditing(false)
  }

  if (url && !editing) {
    return (
      <div className={styles.siteRow}>
        <a href={url} target="_blank" rel="noopener noreferrer" className={styles.siteButton}>
          <span className={styles.siteButtonIcon} aria-hidden>↗</span>
          <span className={styles.siteButtonText}>
            <span className={styles.siteButtonLabel}>Visit site</span>
            <span className={styles.siteButtonHost}>{hostOf(url)}</span>
          </span>
        </a>
        <button
          type="button"
          className={styles.siteChangeBtn}
          onClick={() => { setDraft(siteLink?.url ?? ''); setEditing(true) }}
        >
          Change
        </button>
      </div>
    )
  }

  return (
    <form className={styles.sitePasteRow} onSubmit={save}>
      <input
        className={styles.sitePasteInput}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder="Paste your website or business URL"
        inputMode="url"
        autoComplete="off"
        autoFocus={editing}
      />
      <button type="submit" className={styles.sitePasteBtn} disabled={!draft.trim()}>
        {siteLink?.url ? 'Save' : 'Add'}
      </button>
      {editing && (
        <button type="button" className={styles.siteChangeBtn} onClick={() => setEditing(false)}>
          Cancel
        </button>
      )}
    </form>
  )
}

interface ScheduleRowProps {
  brand: Brand
  schedule: Schedule
  now: Date
  accentRgb: string
  actions: BrandActions
}

function ScheduleRow({ brand, schedule, now, accentRgb, actions }: ScheduleRowProps) {
  const [editing, setEditing] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const hasNotes = !!(schedule.goals?.trim() || schedule.script?.trim())
  const { done, target } = scheduleProgress(brand, schedule, now)
  const hit = target > 0 && done >= target
  const pct = target > 0 ? Math.min(100, (done / target) * 100) : 0

  const deadline = nextDeadline(schedule, now)
  const remaining = deadline ? deadline.getTime() - now.getTime() : null
  const urgency = remaining !== null ? deadlineUrgency(remaining, schedule.period) : 0
  const colorRgb = urgencyColor(accentRgb, urgency)
  const fillRgb = urgencyDeepColor(accentRgb, urgency)
  const fraction = remaining !== null ? periodFraction(remaining, schedule.period) : 0

  const actionLabel = schedule.actionLabel || brand.dailyActionLabel || 'shipped'
  const periodWord = schedule.period === 'weekly' ? '/ wk' : '/ day'

  return (
    <div className={`${styles.scheduleRow} ${hit ? styles.scheduleRowHit : ''}`}>
      <div className={styles.scheduleInfo}>
        <div className={styles.scheduleTitleRow}>
          {schedule.platform && (
            <span className={styles.schedulePlatform} title={PLATFORM_LABELS[schedule.platform]}>
              {PLATFORM_SHORT[schedule.platform]}
            </span>
          )}
          <span className={styles.scheduleLabel}>{schedule.label}</span>
          <span className={styles.scheduleSpec}>
            {schedule.target} {CADENCE_UNIT_LABELS[schedule.unit]} {periodWord}
          </span>
          <button
            type="button"
            className={styles.scheduleGear}
            onClick={() => setEditing(v => !v)}
            aria-label="Edit schedule"
            aria-expanded={editing}
          >
            ⚙
          </button>
        </div>

        <div className={styles.scheduleProgressRow}>
          <span className={styles.scheduleCount}>
            <span className={styles.scheduleCountNum}>{done}</span>
            <span className={styles.scheduleCountSlash}>/</span>
            <span className={styles.scheduleCountTarget}>{target}</span>
          </span>
          <div className={styles.scheduleBar} aria-hidden>
            <div
              className={`${styles.progressFill} ${hit ? styles.progressFillDone : ''}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <div className={styles.scheduleControls}>
        {remaining !== null && (
          <DeadlineClock
            remaining={remaining}
            fraction={fraction}
            colorRgb={colorRgb}
            fillRgb={fillRgb}
            overdue={remaining <= 0}
          />
        )}
        <div className={styles.scheduleLogGroup}>
          <button
            type="button"
            className={styles.scheduleMinus}
            onClick={() => actions.logScheduled(brand.id, schedule.id, -1)}
            disabled={done <= 0}
            aria-label="Decrement"
          >
            −
          </button>
          <button
            type="button"
            className={styles.scheduleLogBtn}
            onClick={() => actions.logScheduled(brand.id, schedule.id, 1)}
          >
            + {actionLabel}
          </button>
        </div>
      </div>

      <button
        type="button"
        className={styles.scheduleNotesToggle}
        onClick={() => setNotesOpen(v => !v)}
        aria-expanded={notesOpen}
      >
        <span className={styles.scheduleNotesChevron} data-open={notesOpen} aria-hidden>›</span>
        Goals &amp; script
        {hasNotes && !notesOpen && <span className={styles.scheduleNotesDot} aria-hidden />}
      </button>

      {notesOpen && <ScheduleNotes brand={brand} schedule={schedule} actions={actions} />}

      {editing && (
        <ScheduleEditor
          brand={brand}
          schedule={schedule}
          actions={actions}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  )
}

/**
 * Per-schedule goals + script — a simple collapsible under each schedule row.
 * Local drafts so typing stays snappy; commits to the schedule (localStorage
 * via updateSchedule) on blur.
 */
function ScheduleNotes({
  brand, schedule, actions,
}: {
  brand: Brand
  schedule: Schedule
  actions: BrandActions
}) {
  const [goals, setGoals] = useState(schedule.goals ?? '')
  const [script, setScript] = useState(schedule.script ?? '')
  useEffect(() => setGoals(schedule.goals ?? ''), [schedule.goals])
  useEffect(() => setScript(schedule.script ?? ''), [schedule.script])

  const commitGoals = () => { if (goals !== (schedule.goals ?? '')) actions.updateSchedule(brand.id, schedule.id, { goals }) }
  const commitScript = () => { if (script !== (schedule.script ?? '')) actions.updateSchedule(brand.id, schedule.id, { script }) }

  return (
    <div className={styles.scheduleNotes}>
      <label className={styles.scheduleNotesField}>
        <span className={styles.scheduleNotesLabel}>Goals</span>
        <textarea
          className={styles.scheduleNotesInput}
          rows={2}
          value={goals}
          placeholder="What's this one for? The hook, the angle, the goal…"
          onChange={e => setGoals(e.target.value)}
          onBlur={commitGoals}
        />
      </label>
      <label className={styles.scheduleNotesField}>
        <span className={styles.scheduleNotesLabel}>Script &amp; notes</span>
        <textarea
          className={styles.scheduleNotesInput}
          rows={5}
          value={script}
          placeholder="Outline, script, shot list, links…"
          onChange={e => setScript(e.target.value)}
          onBlur={commitScript}
        />
      </label>
    </div>
  )
}

/**
 * Deadline clock — a ring that fills across the cadence period (empty just
 * after the last deadline, full at the next) and darkens toward deep red as
 * it comes due (`fillRgb`). The countdown text stays readable in the brighter
 * `colorRgb` so the exact time-left is never color-only. Overdue → full ring
 * + the chip's pulse.
 */
function DeadlineClock({
  remaining, fraction, colorRgb, fillRgb, overdue,
}: {
  remaining: number
  fraction: number
  colorRgb: string
  fillRgb: string
  overdue: boolean
}) {
  const R = 6.5
  const C = 2 * Math.PI * R
  const dash = overdue ? C : C * Math.max(0, Math.min(1, fraction))

  return (
    <span
      className={`${styles.countdownChip} ${overdue ? styles.countdownChipOverdue : ''}`}
      style={{
        color: `rgb(${colorRgb})`,
        borderColor: `rgba(${colorRgb}, 0.4)`,
        background: `rgba(${colorRgb}, 0.08)`,
      }}
      title="Time until posting deadline"
    >
      <svg width="16" height="16" viewBox="0 0 18 18" className={styles.countdownClock} aria-hidden>
        <circle cx="9" cy="9" r={R} fill="none" stroke={`rgba(${colorRgb}, 0.2)`} strokeWidth="2.5" />
        <circle
          cx="9"
          cy="9"
          r={R}
          fill="none"
          stroke={`rgb(${fillRgb})`}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${C}`}
          transform="rotate(-90 9 9)"
          style={{ transition: 'stroke-dasharray 600ms var(--ease-premium), stroke 600ms linear' }}
        />
      </svg>
      {overdue ? 'overdue' : formatCountdown(remaining)}
    </span>
  )
}

function ScheduleEditor({
  brand, schedule, actions, onClose,
}: {
  brand: Brand
  schedule: Schedule
  actions: BrandActions
  onClose: () => void
}) {
  const u = (patch: Partial<Omit<Schedule, 'id'>>) => actions.updateSchedule(brand.id, schedule.id, patch)
  const hasDeadline = !!schedule.deadline

  return (
    <div className={styles.scheduleEdit}>
      <div className={styles.scheduleEditGrid}>
        <label className={styles.scheduleEditField}>
          <span className={styles.scheduleEditLabel}>Label</span>
          <input
            className={styles.scheduleEditInput}
            value={schedule.label}
            onChange={e => u({ label: e.target.value })}
          />
        </label>
        <label className={styles.scheduleEditField}>
          <span className={styles.scheduleEditLabel}>Target</span>
          <input
            type="number"
            min={1}
            max={99}
            className={styles.scheduleEditInput}
            value={schedule.target}
            onChange={e => u({ target: Math.max(1, parseInt(e.target.value, 10) || 1) })}
          />
        </label>
        <label className={styles.scheduleEditField}>
          <span className={styles.scheduleEditLabel}>Unit</span>
          <select
            className={styles.scheduleEditSelect}
            value={schedule.unit}
            onChange={e => u({ unit: e.target.value as CadenceUnit })}
          >
            {ALL_UNITS.map(unit => (
              <option key={unit} value={unit}>{CADENCE_UNIT_LABELS[unit]}</option>
            ))}
          </select>
        </label>
        <label className={styles.scheduleEditField}>
          <span className={styles.scheduleEditLabel}>Period</span>
          <select
            className={styles.scheduleEditSelect}
            value={schedule.period}
            onChange={e => {
              const period = e.target.value as CadencePeriod
              const patch: Partial<Omit<Schedule, 'id'>> = { period }
              if (period === 'weekly' && schedule.deadline && schedule.deadline.weekday === undefined) {
                patch.deadline = { ...schedule.deadline, weekday: 0 }
              }
              u(patch)
            }}
          >
            <option value="daily">per day</option>
            <option value="weekly">per week</option>
          </select>
        </label>
      </div>

      <div className={styles.scheduleDeadlineRow}>
        <label className={styles.scheduleDeadlineToggle}>
          <input
            type="checkbox"
            checked={hasDeadline}
            onChange={e => {
              if (e.target.checked) {
                u({ deadline: { minutes: 1080, ...(schedule.period === 'weekly' ? { weekday: 0 } : {}) } })
              } else {
                u({ deadline: undefined })
              }
            }}
          />
          Posting deadline
        </label>
        {hasDeadline && schedule.deadline && (
          <>
            {schedule.period === 'weekly' && (
              <select
                className={styles.scheduleEditSelect}
                value={schedule.deadline.weekday ?? 0}
                onChange={e => u({ deadline: { ...schedule.deadline!, weekday: parseInt(e.target.value, 10) } })}
                aria-label="Day of week"
              >
                {WEEKDAYS.map((w, i) => (
                  <option key={i} value={i}>{w}</option>
                ))}
              </select>
            )}
            <input
              type="time"
              className={styles.scheduleEditInput}
              value={minutesToTime(schedule.deadline.minutes)}
              onChange={e => u({ deadline: { ...schedule.deadline!, minutes: timeToMinutes(e.target.value) } })}
              aria-label="Posting time"
            />
          </>
        )}
      </div>

      <div className={styles.scheduleEditActions}>
        {brand.schedules.length > 1 && (
          <button
            type="button"
            className={styles.scheduleRemoveBtn}
            onClick={() => { actions.removeSchedule(brand.id, schedule.id); onClose() }}
          >
            Remove
          </button>
        )}
        <button type="button" className={styles.scheduleDoneBtn} onClick={onClose}>Done</button>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Accounts panel (inside the command center) — clean compact metric cards
// by default; an Edit toggle flips to the editable rows + add form.
// -----------------------------------------------------------------------------

/**
 * Shared live-refresh call used by both the compact card and the
 * editable AccountRow. Throws on failure with a usable message.
 */
async function fetchAccountStats(platform: Platform, handle: string) {
  const res = await fetch('/api/brand/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform, handle }),
  })
  const data = await res.json() as {
    followers?: number
    avatarUrl?: string
    lifetimeViews?: number
    videoCount?: number
    error?: string
  }
  if (!res.ok || typeof data.followers !== 'number') {
    throw new Error(data.error || `request failed (${res.status})`)
  }
  return {
    followers: data.followers,
    ...(typeof data.avatarUrl === 'string' && data.avatarUrl ? { avatarUrl: data.avatarUrl } : {}),
    ...(typeof data.lifetimeViews === 'number' ? { lifetimeViews: data.lifetimeViews } : {}),
    ...(typeof data.videoCount === 'number' ? { videoCount: data.videoCount } : {}),
  }
}

function AccountsPanel({
  brand, actions, editing, onToggleEdit,
}: {
  brand: Brand
  actions: BrandActions
  editing: boolean
  onToggleEdit: () => void
}) {
  const [newPlatform, setNewPlatform] = useState<Platform>('tiktok')
  const [newHandle, setNewHandle] = useState('')
  const accounts = brand.accounts
  const reach = totalFollowers(brand)

  // Auto-pull live counts when the page opens, so the cards + history stay fresh
  // without a manual tap. Throttled to once every 6h per account (YouTube has a
  // daily quota and TikTok rate-limits scrapes, so we don't refetch on every
  // open). Only the live-refresh platforms qualify; failures stay silent (the
  // manual ↻ button surfaces errors). updateAccount appends the history point.
  const autoPulledRef = useRef(false)
  useEffect(() => {
    if (autoPulledRef.current) return
    autoPulledRef.current = true
    const THROTTLE_MS = 6 * 60 * 60 * 1000
    const now = Date.now()
    const stale = brand.accounts.filter(
      (a) =>
        LIVE_PLATFORMS.has(a.platform) &&
        a.handle.trim() &&
        (!a.lastUpdated || now - Date.parse(a.lastUpdated) > THROTTLE_MS),
    )
    if (!stale.length) return
    let cancelled = false
    ;(async () => {
      for (const a of stale) {
        if (cancelled) return
        try {
          const patch = await fetchAccountStats(a.platform, a.handle.trim())
          actions.updateAccount(brand.id, a.id, patch)
        } catch {
          /* silent: an auto-pull failure shouldn't nag; the manual button reports errors */
        }
        await new Promise((r) => setTimeout(r, 400)) // gentle spacing between calls
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleAddAccount(e?: React.FormEvent) {
    e?.preventDefault()
    if (!newHandle.trim()) return
    actions.addAccount(brand.id, newPlatform, newHandle.trim())
    setNewHandle('')
  }

  return (
    <div className={styles.ccAccounts}>
      <header className={styles.ccAccountsHead}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowMark}>·02</span>
          <span className={styles.eyebrowRule} />
          Accounts
        </span>
        <div className={styles.ccAccountsHeadRight}>
          {reach > 0 && (
            <span className={styles.ccReach}>
              <AnimatedNumber value={reach} /> <span className={styles.ccReachLabel}>reach</span>
            </span>
          )}
          {accounts.length > 0 && (
            <button type="button" className={styles.editToggle} onClick={onToggleEdit} aria-pressed={editing}>
              {editing ? 'Done' : 'Edit'}
            </button>
          )}
        </div>
      </header>

      {accounts.length === 0 ? (
        <p className={styles.emptyText}>
          No accounts linked yet. Add the platforms where this brand lives
          below so you can track followers in one place.
        </p>
      ) : editing ? (
        <ul className={styles.accountList}>
          {accounts.map(a => (
            <AccountRow
              key={a.id}
              account={a}
              onUpdate={(patch) => actions.updateAccount(brand.id, a.id, patch)}
              onRemove={() => actions.removeAccount(brand.id, a.id)}
            />
          ))}
        </ul>
      ) : (
        <div className={styles.accountCompactGrid}>
          {accounts.map(a => (
            <AccountCardCompact
              key={a.id}
              account={a}
              onUpdate={(patch) => actions.updateAccount(brand.id, a.id, patch)}
            />
          ))}
        </div>
      )}

      {/* Show the add form whenever editing OR there are no accounts yet —
          otherwise the empty state is a dead end (the Edit button that
          reveals this form is itself hidden until ≥1 account exists). */}
      {(editing || accounts.length === 0) && (
        <form className={styles.accountAddForm} onSubmit={handleAddAccount}>
          <select
            className={styles.accountPlatformSelect}
            value={newPlatform}
            onChange={e => setNewPlatform(e.target.value as Platform)}
            aria-label="Platform"
          >
            {ALL_PLATFORMS.map(p => (
              <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>
            ))}
          </select>
          <input
            type="text"
            className={styles.accountHandle}
            value={newHandle}
            onChange={e => setNewHandle(e.target.value)}
            placeholder="@handle or url"
          />
          <button type="submit" className={styles.accountAddBtn} disabled={!newHandle.trim()}>
            + Add
          </button>
        </form>
      )}
    </div>
  )
}

/** Compact, read-only account card: avatar · handle · count · spark · delta. */
function AccountCardCompact({
  account, onUpdate,
}: {
  account: BrandAccount
  onUpdate: (patch: Partial<Pick<BrandAccount, 'followers' | 'avatarUrl' | 'lifetimeViews' | 'videoCount'>>) => void
}) {
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canRefresh = LIVE_PLATFORMS.has(account.platform)
  const profileUrl = platformProfileUrl(account.platform, account.handle)
  const isYouTube = account.platform === 'youtube' || account.platform === 'youtube_long'
  const followers = account.followers
  const delta = deltaSinceDays(account.history, 'count', 7)
  const series = (account.history ?? [])
    .map(s => s.count)
    .filter((v): v is number => typeof v === 'number')

  async function refresh() {
    if (!canRefresh || !account.handle.trim() || refreshing) return
    setRefreshing(true)
    setError(null)
    try {
      onUpdate(await fetchAccountStats(account.platform, account.handle))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <article className={styles.accountCardCompact}>
      {profileUrl ? (
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.accountCompactAvatarLink}
          title={`Open ${PLATFORM_LABELS[account.platform]} profile`}
          aria-label={`Open ${PLATFORM_LABELS[account.platform]} profile`}
        >
          <BrandAvatar platform={account.platform} avatarUrl={account.avatarUrl} size={44} />
        </a>
      ) : (
        <BrandAvatar platform={account.platform} avatarUrl={account.avatarUrl} size={44} />
      )}
      <div className={styles.accountCompactBody}>
        <div className={styles.accountCompactTop}>
          {profileUrl ? (
            <a
              className={styles.accountCompactHandle}
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open ${account.handle}`}
            >
              {account.handle || '—'}
            </a>
          ) : (
            <span className={styles.accountCompactHandle} title={account.handle}>{account.handle || '—'}</span>
          )}
          {canRefresh && (
            <button
              type="button"
              className={styles.accountRefreshBtn}
              onClick={refresh}
              disabled={refreshing || !account.handle.trim()}
              aria-label="Refresh follower count"
              title="Refresh"
            >
              {refreshing ? <span className={styles.accountRefreshSpin} aria-hidden>↻</span> : <span aria-hidden>↻</span>}
            </button>
          )}
        </div>
        <div className={styles.accountCompactNumRow}>
          <span className={styles.accountCompactNum}>
            {typeof followers === 'number' ? <AnimatedNumber value={followers} /> : '—'}
          </span>
          <span className={styles.accountCompactLabel}>{isYouTube ? 'subs' : 'followers'}</span>
          {delta !== null && (
            <span className={`${styles.socialDelta} ${delta >= 0 ? styles.socialDeltaUp : styles.socialDeltaDown}`}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toLocaleString()}
            </span>
          )}
        </div>
        {series.length >= 2 && (
          <div className={styles.accountCompactSpark}>
            <Sparkline values={series} height={28} color="var(--accent)" />
          </div>
        )}
        {error && <span className={styles.accountError}>{error}</span>}
      </div>
    </article>
  )
}

// -----------------------------------------------------------------------------
// Account row — own component so each row can hold its own refresh
// loading + error state without dragging a per-id map into the parent.
// -----------------------------------------------------------------------------

/** Small camera glyph for the "fill from screenshot" action. */
function CameraGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  )
}

interface AccountRowProps {
  account: BrandAccount
  onUpdate: (patch: Partial<Pick<BrandAccount, 'platform' | 'handle' | 'followers' | 'avatarUrl' | 'lifetimeViews' | 'videoCount'>>) => void
  onRemove: () => void
}

function AccountRow({ account, onUpdate, onRemove }: AccountRowProps) {
  const [refreshing, setRefreshing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const canRefresh = LIVE_PLATFORMS.has(account.platform)
  const handleReady = account.handle.trim().length > 0
  const profileUrl = platformProfileUrl(account.platform, account.handle)

  async function refresh() {
    if (!canRefresh || !handleReady || refreshing) return
    setRefreshing(true)
    setError(null)
    try {
      // Patch in one shot — updateAccount handles lastUpdated + history
      // append in state.ts. Shares the fetch path with the compact card.
      onUpdate(await fetchAccountStats(account.platform, account.handle))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown error')
    } finally {
      setRefreshing(false)
    }
  }

  // Manual platforms (everything but TikTok/YouTube): read the follower
  // count off an uploaded screenshot via Claude vision, then patch the
  // count through the SAME path a refresh uses (stamps history + lastUpdated).
  async function handleScreenshot(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file later
    if (!file || importing) return
    setImporting(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('platform', account.platform)
      const res = await fetch('/api/brand/import-stats', { method: 'POST', body: fd })
      const data = (await res.json().catch(() => ({}))) as { followers?: number; error?: string }
      if (!res.ok || typeof data.followers !== 'number') {
        throw new Error(data.error || 'Could not read that screenshot')
      }
      onUpdate({ followers: data.followers })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'import failed')
    } finally {
      setImporting(false)
    }
  }

  const lastUpdatedLabel = account.lastUpdated ? formatRelative(account.lastUpdated) : null

  return (
    <li className={styles.accountRow}>
      <select
        className={styles.accountPlatformSelect}
        value={account.platform}
        onChange={e => onUpdate({ platform: e.target.value as Platform })}
        aria-label="Platform"
        title={PLATFORM_LABELS[account.platform]}
      >
        {ALL_PLATFORMS.map(p => (
          <option key={p} value={p}>{PLATFORM_SHORT[p]} · {PLATFORM_LABELS[p]}</option>
        ))}
      </select>
      <input
        type="text"
        className={styles.accountHandle}
        value={account.handle}
        onChange={e => onUpdate({ handle: e.target.value })}
        placeholder="@handle or url"
      />
      <input
        type="number"
        min={0}
        step={1}
        className={styles.accountFollowers}
        value={account.followers ?? ''}
        placeholder="followers"
        onChange={e => {
          const v = e.target.value.trim()
          onUpdate({ followers: v === '' ? null : Math.max(0, parseInt(v, 10) || 0) })
        }}
        aria-label="Follower count"
      />
      {profileUrl ? (
        <a
          className={styles.accountOpenBtn}
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`Open ${PLATFORM_LABELS[account.platform]} profile`}
          aria-label={`Open ${PLATFORM_LABELS[account.platform]} profile`}
        >
          <span aria-hidden>↗</span>
        </a>
      ) : (
        <span className={styles.accountOpenSlot} aria-hidden />
      )}
      {canRefresh ? (
        <button
          type="button"
          className={styles.accountRefreshBtn}
          onClick={refresh}
          disabled={!handleReady || refreshing}
          title={handleReady ? 'Fetch current follower count' : 'Add a handle first'}
          aria-label="Refresh follower count"
        >
          {refreshing ? (
            <span className={styles.accountRefreshSpin} aria-hidden>↻</span>
          ) : (
            <span aria-hidden>↻</span>
          )}
        </button>
      ) : (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={handleScreenshot}
          />
          <button
            type="button"
            className={styles.accountShotBtn}
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            title="Fill follower count from a screenshot"
            aria-label="Fill follower count from a screenshot"
          >
            {importing ? (
              <span className={styles.accountRefreshSpin} aria-hidden>↻</span>
            ) : (
              <CameraGlyph />
            )}
          </button>
        </>
      )}
      <button
        type="button"
        className={styles.accountDelBtn}
        onClick={onRemove}
        aria-label={`Remove ${account.handle || 'account'}`}
        title="Remove"
      >
        ×
      </button>
      {(lastUpdatedLabel || error) && (
        <div className={styles.accountRowStatus}>
          {error ? (
            <span className={styles.accountError}>{error}</span>
          ) : (
            <span className={styles.accountStamp}>Updated {lastUpdatedLabel}</span>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * Compact relative-time formatter. "just now", "12m ago", "3h ago",
 * "yesterday", or a date for older. Kept inline since this is the only
 * place it's used in the brand module.
 */
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return 'recently'
  const diffSec = Math.round((Date.now() - then) / 1000)
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`
  if (diffSec < 86400 * 2) return 'yesterday'
  if (diffSec < 86400 * 7) return `${Math.round(diffSec / 86400)}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// -----------------------------------------------------------------------------
// Reflection
// -----------------------------------------------------------------------------

function ReflectionCard({
  text, updatedAt, onCommit,
}: {
  text: string
  updatedAt: string | null
  onCommit: (text: string) => void
}) {
  // Local draft so the textarea is responsive without writing on every
  // keystroke. Commit on blur or Cmd/Ctrl+Enter.
  const [draft, setDraft] = useState(text)
  useEffect(() => setDraft(text), [text])

  const lastEdited = updatedAt
    ? new Date(updatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null

  function commit() {
    if (draft !== text) onCommit(draft)
  }

  return (
    <section className={styles.reflectionCard}>
      <header className={styles.reflectionHead}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowMark}>·06</span>
          <span className={styles.eyebrowRule} />
          Reflection
        </span>
        {lastEdited && <span className={styles.reflectionStamp}>Last edit · {lastEdited}</span>}
      </header>
      <textarea
        className={styles.reflectionInput}
        placeholder="What’s working? What’s failing? What to do next?"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            ;(e.target as HTMLTextAreaElement).blur()
          }
        }}
      />
      <p className={styles.reflectionHint}>
        One paragraph max. Auto-saves on blur. ⌘/Ctrl+Enter to commit now.
      </p>
    </section>
  )
}

// -----------------------------------------------------------------------------
// Links — labeled URLs (Google Sheets, Stripe dashboards, Calendly, etc.)
// -----------------------------------------------------------------------------

interface LinksCardProps {
  links: import('../types').BrandLink[]
  onAdd: (label: string, url: string) => void
  onUpdate: (linkId: string, patch: Partial<Pick<import('../types').BrandLink, 'label' | 'url'>>) => void
  onRemove: (linkId: string) => void
}

function hostOf(url: string): string {
  if (!url) return ''
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function LinksCard({ links, onAdd, onUpdate, onRemove }: LinksCardProps) {
  const [newLabel, setNewLabel] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [editing, setEditing] = useState(false)
  const isEmpty = links.length === 0

  function handleAdd(e?: React.FormEvent) {
    e?.preventDefault()
    if (!newUrl.trim() && !newLabel.trim()) return
    onAdd(newLabel.trim() || 'Link', newUrl.trim())
    setNewLabel('')
    setNewUrl('')
  }

  return (
    <section className={styles.linksCard}>
      <header className={styles.linksHead}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowMark}>·04</span>
          <span className={styles.eyebrowRule} />
          Links
        </span>
        {!isEmpty && (
          <button type="button" className={styles.editToggle} onClick={() => setEditing(v => !v)} aria-pressed={editing}>
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </header>

      {isEmpty ? (
        <p className={styles.emptyText}>
          Dashboards, sheets, Calendly, anything. Add one below and it’s one
          tap away from here.
        </p>
      ) : editing ? (
        <ul className={styles.linkList}>
          {links.map(l => (
            <li key={l.id} className={styles.linkRow}>
              <input
                type="text"
                className={styles.linkLabel}
                value={l.label}
                onChange={e => onUpdate(l.id, { label: e.target.value })}
                placeholder="Label"
              />
              <input
                type="url"
                className={styles.linkUrl}
                value={l.url}
                onChange={e => onUpdate(l.id, { url: e.target.value })}
                placeholder="https://..."
              />
              <button
                type="button"
                className={styles.accountDelBtn}
                onClick={() => onRemove(l.id)}
                aria-label={`Remove ${l.label}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className={styles.linkReadList}>
          {links.map(l => {
            const host = hostOf(l.url)
            const inner = (
              <>
                <span className={styles.linkReadIcon} aria-hidden>↗</span>
                <span className={styles.linkReadLabel}>{l.label || 'Link'}</span>
                {host && <span className={styles.linkReadHost}>{host}</span>}
              </>
            )
            return (
              <li key={l.id}>
                {l.url ? (
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.linkReadRow}
                    aria-label={`Open ${l.label || 'link'}`}
                  >
                    {inner}
                  </a>
                ) : (
                  <span className={`${styles.linkReadRow} ${styles.linkReadRowEmpty}`}>{inner}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {(editing || isEmpty) && (
        <form className={styles.linkAddForm} onSubmit={handleAdd}>
          <input
            type="text"
            className={styles.linkLabel}
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="Label (e.g. Job sheet)"
          />
          <input
            type="url"
            className={styles.linkUrl}
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            placeholder="https://..."
          />
          <button
            type="submit"
            className={styles.accountAddBtn}
            disabled={!newUrl.trim() && !newLabel.trim()}
          >
            + Add
          </button>
        </form>
      )}
    </section>
  )
}

// -----------------------------------------------------------------------------
// KPIs — manually-tracked metrics (revenue, leads, MRR, anything).
// -----------------------------------------------------------------------------

interface KpisCardProps {
  kpis: BrandKpi[]
  onAdd: (label: string, unit?: string) => void
  onUpdate: (kpiId: string, patch: Partial<Pick<BrandKpi, 'label' | 'value' | 'unit' | 'target'>>) => void
  onRemove: (kpiId: string) => void
  onImport: (metrics: PulledMetric[]) => void
  /** Brand's website URL (if any) — prefilled into the auto-pull field. */
  siteUrl: string
}

/** One number Claude read off a public page via /api/brand/pull-metrics. */
interface PulledMetric { label: string; value: number; unit?: string }

/** "$12,400" · "92%" · "4.8/5" · "7 leads" — formats a KPI for read mode. */
function formatKpi(value: number, unit: string): string {
  const n = value.toLocaleString()
  if (!unit) return n
  if (/^[$£€¥]/.test(unit)) return `${unit}${n}`
  if (unit === '%') return `${n}%`
  if (unit.startsWith('/')) return `${n}${unit}`
  return `${n} ${unit}`
}

/**
 * Read-mode metric card: label + delta · current value (vs goal) · the
 * trend chart (with a dashed target line when a goal is set) · a progress
 * bar + pace caption toward the goal. With <2 datapoints the chart slot
 * shows a "log it over time" hint instead so the card isn't empty.
 * Editing is via the section's Edit toggle (matches Links/Accounts).
 */
function KpiCard({ kpi }: { kpi: BrandKpi }) {
  const series = kpiSeries(kpi)
  const delta = kpiDeltaSince(kpi, 7)
  const hasTarget = typeof kpi.target === 'number' && kpi.target > 0
  const goal = hasTarget ? (kpi.target as number) : 0
  const pct = hasTarget ? Math.max(0, Math.min(100, (kpi.value / goal) * 100)) : 0
  const remaining = hasTarget ? Math.max(0, goal - kpi.value) : 0

  return (
    <article className={styles.kpiChartCard}>
      <header className={styles.kpiChartHead}>
        <span className={styles.kpiChartLabel}>{kpi.label}</span>
        {delta !== null && delta !== 0 && (
          <span className={`${styles.deltaChip} ${delta > 0 ? styles.deltaChipUp : styles.deltaChipDown}`}>
            {delta > 0 ? '↑' : '↓'} {formatKpi(Math.abs(delta), kpi.unit)}
          </span>
        )}
      </header>

      <div className={styles.kpiChartValueRow}>
        <span className={styles.kpiChartValue}>{formatKpi(kpi.value, kpi.unit)}</span>
        {hasTarget && (
          <span className={styles.kpiChartGoal}>goal {formatKpi(goal, kpi.unit)}</span>
        )}
      </div>

      {series.length >= 2 ? (
        <div className={styles.kpiChartPlot}>
          <KpiChart values={series} target={hasTarget ? goal : undefined} height={64} />
        </div>
      ) : (
        <p className={styles.kpiChartHint}>Update this number over time and the trend draws here.</p>
      )}

      {hasTarget && (
        <div className={styles.kpiPace}>
          <div className={styles.progressTrack} aria-hidden>
            <div
              className={`${styles.progressFill} ${pct >= 100 ? styles.progressFillDone : ''}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className={styles.kpiPaceText}>
            {pct >= 100 ? 'Goal hit ✓' : `${Math.round(pct)}% · ${formatKpi(remaining, kpi.unit)} to go`}
          </span>
        </div>
      )}
    </article>
  )
}

/**
 * Edit-mode KPI row: label (live) · value · goal · remove. The value
 * input commits on blur (local draft) rather than on every keystroke —
 * that's what keeps the history series clean, since each commit appends a
 * single snapshot in `updateKpi`. The goal commits on blur too; clearing
 * it removes the target line.
 */
function KpiEditRow({
  kpi, onUpdate, onRemove,
}: {
  kpi: BrandKpi
  onUpdate: (patch: Partial<Pick<BrandKpi, 'label' | 'value' | 'unit' | 'target'>>) => void
  onRemove: () => void
}) {
  const [valDraft, setValDraft] = useState(String(kpi.value))
  const [tgtDraft, setTgtDraft] = useState(kpi.target != null ? String(kpi.target) : '')
  useEffect(() => setValDraft(String(kpi.value)), [kpi.value])
  useEffect(() => setTgtDraft(kpi.target != null ? String(kpi.target) : ''), [kpi.target])

  const isCurrency = !!kpi.unit && /^[$£€¥]/.test(kpi.unit)

  function commitValue() {
    const parsed = parseFloat(valDraft)
    const num = Number.isFinite(parsed) ? parsed : 0
    if (num !== kpi.value) onUpdate({ value: num })
    else setValDraft(String(kpi.value)) // normalize "5." / "" back to the stored value
  }

  function commitTarget() {
    const t = tgtDraft.trim()
    if (t === '') {
      if (kpi.target !== undefined) onUpdate({ target: undefined })
      return
    }
    const parsed = parseFloat(t)
    if (Number.isFinite(parsed)) {
      if (parsed !== kpi.target) onUpdate({ target: parsed })
    } else {
      setTgtDraft(kpi.target != null ? String(kpi.target) : '')
    }
  }

  return (
    <li className={styles.kpiEditRow}>
      <input
        type="text"
        className={styles.kpiLabel}
        value={kpi.label}
        onChange={e => onUpdate({ label: e.target.value })}
        placeholder="Label"
      />
      <div className={styles.kpiValueWrap}>
        {isCurrency && <span className={styles.kpiUnitPre}>{kpi.unit}</span>}
        <input
          type="number"
          className={styles.kpiValue}
          value={valDraft}
          onChange={e => setValDraft(e.target.value)}
          onBlur={commitValue}
          step={kpi.unit === '$' ? 0.01 : 1}
          aria-label={`${kpi.label} value`}
        />
        {kpi.unit && !isCurrency && <span className={styles.kpiUnitPost}>{kpi.unit}</span>}
      </div>
      <input
        type="number"
        className={styles.kpiTarget}
        value={tgtDraft}
        onChange={e => setTgtDraft(e.target.value)}
        onBlur={commitTarget}
        step={kpi.unit === '$' ? 0.01 : 1}
        placeholder="Goal"
        aria-label={`${kpi.label} goal`}
      />
      <button
        type="button"
        className={styles.accountDelBtn}
        onClick={onRemove}
        aria-label={`Remove ${kpi.label}`}
      >
        ×
      </button>
    </li>
  )
}

/**
 * Auto-pull metrics — paste a PUBLIC url (prefilled with the brand's site) and
 * Claude reads the page server-side (/api/brand/pull-metrics, web_fetch) and
 * returns the hard numbers on it. The user ticks which to keep; chosen metrics
 * are merged into the brand's KPIs (new label → created, existing → updated +
 * charted). Private dashboards (Stripe/PostHog) can't be read — that's Phase B.
 */
function PullMetrics({ siteUrl, onImport }: { siteUrl: string; onImport: (metrics: PulledMetric[]) => void }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(siteUrl)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsPro, setNeedsPro] = useState(false)
  const [result, setResult] = useState<{ summary: string; metrics: PulledMetric[] } | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  function reset() {
    setOpen(false); setResult(null); setSelected(new Set()); setError(null); setNeedsPro(false)
  }

  async function pull(e?: React.FormEvent) {
    e?.preventDefault()
    const u = url.trim()
    if (!u || loading) return
    setLoading(true); setError(null); setNeedsPro(false); setResult(null)
    try {
      const res = await fetch('/api/brand/pull-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u }),
      })
      if (res.status === 402) { setNeedsPro(true); return }
      const data = await res.json().catch(() => ({})) as { summary?: string; metrics?: PulledMetric[]; error?: string }
      if (!res.ok) throw new Error(data.error || `request failed (${res.status})`)
      const metrics = Array.isArray(data.metrics) ? data.metrics : []
      setResult({ summary: data.summary ?? '', metrics })
      setSelected(new Set(metrics.map((_, i) => i)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that page.')
    } finally {
      setLoading(false)
    }
  }

  function toggle(i: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  function add() {
    if (!result) return
    const chosen = result.metrics.filter((_, i) => selected.has(i))
    if (chosen.length) onImport(chosen)
    reset()
  }

  if (!open) {
    return (
      <div className={styles.pullWrap}>
        <button type="button" className={styles.pullToggle} onClick={() => { setUrl(siteUrl); setOpen(true) }}>
          <span aria-hidden>✦</span> Auto-pull from a URL
        </button>
      </div>
    )
  }

  return (
    <div className={styles.pullWrap}>
      <div className={styles.pullPanel}>
        <p className={styles.pullHint}>
          Paste a public page — your store, site, or listing. Claude reads it and
          pulls the numbers on it. Private dashboards can’t be read.
        </p>
        <form className={styles.sitePasteRow} onSubmit={pull}>
          <input
            className={styles.sitePasteInput}
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://your-site.com"
            inputMode="url"
            autoComplete="off"
            autoFocus
          />
          <button type="submit" className={styles.sitePasteBtn} disabled={!url.trim() || loading}>
            {loading ? 'Reading…' : 'Pull'}
          </button>
        </form>

        {needsPro && (
          <p className={styles.insightUpsell}>
            Auto-pull is a Pro feature.{' '}
            <Link href="/pricing" className={styles.insightUpsellLink}>See Pro →</Link>
          </p>
        )}
        {error && <p className={styles.insightError}>{error}</p>}

        {result && (
          result.metrics.length > 0 ? (
            <>
              {result.summary && <p className={styles.pullSummary}>{result.summary}</p>}
              <ul className={styles.pullList}>
                {result.metrics.map((m, i) => (
                  <li key={i}>
                    <label className={styles.pullItem}>
                      <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                      <span className={styles.pullItemLabel}>{m.label}</span>
                      <span className={styles.pullItemVal}>{formatKpi(m.value, m.unit ?? '')}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className={styles.pullEmpty}>
              No public numbers found on that page{result.summary ? ` — ${result.summary}` : ''}.
            </p>
          )
        )}

        <div className={styles.pullActions}>
          {result && result.metrics.length > 0 && (
            <button type="button" className={styles.insightBtn} onClick={add} disabled={selected.size === 0}>
              Add {selected.size} metric{selected.size === 1 ? '' : 's'}
            </button>
          )}
          <button type="button" className={styles.pullCancel} onClick={reset}>
            {result ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}

function KpisCard({ kpis, siteUrl, onAdd, onUpdate, onRemove, onImport }: KpisCardProps) {
  const [newLabel, setNewLabel] = useState('')
  const [newUnit, setNewUnit] = useState('')
  const [editing, setEditing] = useState(false)
  const isEmpty = kpis.length === 0

  function handleAdd(e?: React.FormEvent) {
    e?.preventDefault()
    if (!newLabel.trim()) return
    onAdd(newLabel.trim(), newUnit.trim())
    setNewLabel('')
    setNewUnit('')
  }

  return (
    <section className={styles.kpisCard}>
      <header className={styles.kpisHead}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowMark}>·05</span>
          <span className={styles.eyebrowRule} />
          Custom metrics
        </span>
        {!isEmpty && (
          <button type="button" className={styles.editToggle} onClick={() => setEditing(v => !v)} aria-pressed={editing}>
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </header>

      <PullMetrics siteUrl={siteUrl} onImport={onImport} />

      {isEmpty ? (
        <p className={styles.emptyText}>
          Anything you can’t auto-pull: revenue, leads, MRR, reviews. Add one
          below, then set a goal to track it against.
        </p>
      ) : editing ? (
        <ul className={styles.kpiEditList}>
          {kpis.map(k => (
            <KpiEditRow
              key={k.id}
              kpi={k}
              onUpdate={(patch) => onUpdate(k.id, patch)}
              onRemove={() => onRemove(k.id)}
            />
          ))}
        </ul>
      ) : (
        <div className={styles.kpiChartGrid}>
          {kpis.map(k => <KpiCard key={k.id} kpi={k} />)}
        </div>
      )}

      {(editing || isEmpty) && (
        <form className={styles.kpiAddForm} onSubmit={handleAdd}>
          <input
            type="text"
            className={styles.kpiLabel}
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="Label (e.g. Revenue this month)"
          />
          <input
            type="text"
            className={styles.kpiUnit}
            value={newUnit}
            onChange={e => setNewUnit(e.target.value)}
            placeholder="Unit ($, %, /5...)"
            maxLength={6}
          />
          <button
            type="submit"
            className={styles.accountAddBtn}
            disabled={!newLabel.trim()}
          >
            + Add
          </button>
        </form>
      )}
    </section>
  )
}
