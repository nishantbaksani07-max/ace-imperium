'use client'

import { useMemo } from 'react'
import styles from './brand.module.css'
import AnimatedNumber from './AnimatedNumber'
import BrandAvatar from './BrandAvatar'
import Sparkline from './Sparkline'
import type { BrandAccount, Platform } from './types'
import { deltaSinceDays, latestSnapshot, nextMilestone } from './state'

/**
 * Analytics card — everything we can pull for free from the platforms,
 * aggregated and trended. Sits below the command center's accounts.
 *
 *   - Hero: total reach (subs + followers across live accounts), the
 *           weekly + monthly change, distance to the next milestone, and
 *           a merged sparkline of reach over time.
 *
 *   - Per-platform grid: subscriber/follower count + weekly delta + a
 *           sparkline, plus the deeper metrics the accounts strip doesn't
 *           show — lifetime views (YouTube) / likes (TikTok), upload
 *           count, and average views-per-video — each with its monthly
 *           change where we have the history to compute one.
 *
 * Data ceiling: this is what the YouTube Data API (one channels call) and
 * the TikTok public profile expose without OAuth. Per-video analytics or
 * watch time would need authenticated APIs + quota — a later build.
 *
 * Renders an empty hint (not nothing) when no live account has been
 * refreshed yet, so the user knows where the data will appear.
 */

const LIVE_PLATFORMS = new Set<Platform>(['youtube', 'youtube_long', 'tiktok'])

type Field = 'count' | 'views' | 'videos'

interface Props {
  accounts: BrandAccount[]
}

function metricValue(a: BrandAccount, field: Field): number | undefined {
  if (field === 'count') {
    return typeof a.followers === 'number' ? a.followers : latestSnapshot(a.history, 'count')
  }
  if (field === 'views') return latestSnapshot(a.history, 'views') ?? a.lifetimeViews
  return latestSnapshot(a.history, 'videos') ?? a.videoCount
}

/** Sum of per-account deltas over `days`; null if no account has history. */
function sumDelta(accounts: BrandAccount[], field: Field, days: number): number | null {
  let sum: number | null = null
  for (const a of accounts) {
    const d = deltaSinceDays(a.history, field, days)
    if (typeof d === 'number') sum = (sum ?? 0) + d
  }
  return sum
}

/**
 * Crude "total over time" series: at each snapshot index, sum each
 * account's value (carrying its last-known value once its history runs
 * out). Good enough for a vibe-y trend line; the delta chips carry the
 * precise magnitude.
 */
function combinedSeries(accounts: BrandAccount[], field: Field): number[] {
  const longest = accounts.reduce((m, a) => Math.max(m, a.history?.length ?? 0), 0)
  if (longest < 2) return []
  const out: number[] = []
  for (let i = 0; i < longest; i++) {
    let total = 0
    let any = false
    for (const a of accounts) {
      const hist = a.history ?? []
      if (hist.length === 0) continue
      const v = hist[Math.min(i, hist.length - 1)]?.[field]
      if (typeof v === 'number') { total += v; any = true }
    }
    if (any) out.push(total)
  }
  return out
}

export default function AnalyticsCard({ accounts }: Props) {
  const live = useMemo(() => accounts.filter(a => LIVE_PLATFORMS.has(a.platform)), [accounts])

  const reach = useMemo(
    () => accounts.reduce((s, a) => s + (typeof a.followers === 'number' ? a.followers : 0), 0),
    [accounts],
  )
  const reachWeekly = useMemo(() => sumDelta(accounts, 'count', 7), [accounts])
  const reachMonthly = useMemo(() => sumDelta(accounts, 'count', 30), [accounts])
  const reachSeries = useMemo(() => combinedSeries(accounts, 'count'), [accounts])
  const milestone = nextMilestone(reach)

  const platforms = useMemo(
    () => live.filter(a =>
      typeof a.followers === 'number'
      || typeof metricValue(a, 'views') === 'number'
      || typeof metricValue(a, 'videos') === 'number'),
    [live],
  )

  const hasData = reach > 0 || platforms.length > 0

  return (
    <section className={styles.statsCard}>
      <header className={styles.statsHead}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowMark}>·03</span>
          <span className={styles.eyebrowRule} />
          Analytics
        </span>
      </header>

      {!hasData ? (
        <p className={styles.emptyText}>
          Refresh a YouTube or TikTok account above to pull live analytics —
          reach, views, uploads, and growth trends show up here.
        </p>
      ) : (
        <>
          <div className={styles.statsHero}>
            <div className={styles.statsHeroText}>
              <span className={styles.statsHeroLabel}>Total reach</span>
              <div className={styles.statsHeroNum}>
                <AnimatedNumber value={reach} />
              </div>
              <div className={styles.statsHeroMeta}>
                <DeltaChip value={reachWeekly} suffix="this week" />
                <DeltaChip value={reachMonthly} suffix="this month" />
                {reach < milestone && (
                  <span className={styles.statsHeroMilestone}>
                    {fmtCount(milestone - reach)} to {fmtCount(milestone)}
                  </span>
                )}
              </div>
            </div>

            {reachSeries.length >= 2 && (
              <div className={styles.statsHeroSpark}>
                <Sparkline values={reachSeries} height={56} color="var(--accent)" animate />
              </div>
            )}
          </div>

          <div className={styles.platformGrid}>
            {platforms.map(a => <PlatformAnalytics key={a.id} account={a} />)}
          </div>
        </>
      )}
    </section>
  )
}

function PlatformAnalytics({ account }: { account: BrandAccount }) {
  const isYouTube = account.platform === 'youtube' || account.platform === 'youtube_long'
  const followers = account.followers ?? 0
  const weeklyDelta = deltaSinceDays(account.history, 'count', 7)
  const views = metricValue(account, 'views')
  const videos = metricValue(account, 'videos')
  const avg = typeof views === 'number' && typeof videos === 'number' && videos > 0
    ? Math.round(views / videos)
    : undefined
  const monthlyViews = deltaSinceDays(account.history, 'views', 30)
  const monthlyVideos = deltaSinceDays(account.history, 'videos', 30)

  const series = (account.history ?? [])
    .map(s => s.count)
    .filter((v): v is number => typeof v === 'number')

  const primaryLabel = isYouTube ? 'subscribers' : 'followers'
  const viewsLabel = isYouTube ? 'views' : 'likes'

  return (
    <article className={styles.platformCard}>
      <header className={styles.platformCardHead}>
        <BrandAvatar platform={account.platform} avatarUrl={account.avatarUrl} size={30} />
        <span className={styles.platformCardHandle}>{account.handle}</span>
      </header>

      <div className={styles.platformCardNumWrap}>
        <div className={styles.platformCardNum}>
          <AnimatedNumber value={followers} />
        </div>
        <span className={styles.platformCardLabel}>{primaryLabel}</span>
      </div>

      <DeltaChip value={weeklyDelta} suffix="this week" />

      {series.length >= 2 && (
        <div className={styles.platformCardSpark}>
          <Sparkline values={series} height={40} color="var(--accent)" animate />
        </div>
      )}

      <footer className={styles.platformCardFoot}>
        {typeof views === 'number' && (
          <SecondaryStat
            label={`${fmtCount(views)} ${viewsLabel}`}
            sub={typeof monthlyViews === 'number' && monthlyViews > 0 ? `+${fmtCount(monthlyViews)}/mo` : null}
          />
        )}
        {typeof videos === 'number' && (
          <SecondaryStat
            label={`${videos} videos`}
            sub={typeof monthlyVideos === 'number' && monthlyVideos > 0 ? `+${monthlyVideos}/mo` : null}
          />
        )}
        {typeof avg === 'number' && (
          <SecondaryStat label={`${fmtCount(avg)} avg ${viewsLabel}`} sub={null} />
        )}
      </footer>
    </article>
  )
}

// -----------------------------------------------------------------------------
// Small primitives (reuse the existing delta/secondary-stat styling).
// -----------------------------------------------------------------------------

function DeltaChip({ value, suffix }: { value: number | null; suffix: string }) {
  if (value === null) {
    return <span className={styles.deltaChipMuted}>refresh again later for {suffix}</span>
  }
  if (value === 0) {
    return <span className={styles.deltaChipFlat}>· flat {suffix}</span>
  }
  const isUp = value > 0
  return (
    <span className={`${styles.deltaChip} ${isUp ? styles.deltaChipUp : styles.deltaChipDown}`}>
      {isUp ? '↑' : '↓'} {Math.abs(value).toLocaleString()} {suffix}
    </span>
  )
}

function SecondaryStat({ label, sub }: { label: string; sub: string | null }) {
  return (
    <span className={styles.secondaryStat}>
      {label}
      {sub && <span className={styles.secondaryStatSub}> · {sub}</span>}
    </span>
  )
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return n.toLocaleString()
}
