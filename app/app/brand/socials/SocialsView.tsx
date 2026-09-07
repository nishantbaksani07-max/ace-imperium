'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import styles from '../brand.module.css'
import { accentVars } from '../archetypes'
import BrandAvatar from '../BrandAvatar'
import { accountKey, useBrandState } from '../state'
import {
  PLATFORM_LABELS,
} from '../types'
import type { Archetype, Brand, BrandAccount, FollowerSnapshot, Platform } from '../types'

/**
 * Platforms with a working refresh backend (mirrors LIVE_PLATFORMS in
 * BrandDetail). Used to show the refresh button + a "live" affordance.
 */
const LIVE_PLATFORMS = new Set<Platform>(['youtube', 'youtube_long', 'tiktok'])

interface FlatAccount extends BrandAccount {
  brandId: string
  brandName: string
  brandEmoji: string
  brandArchetype: Archetype
}

export default function SocialsView() {
  const { ready, state, actions } = useBrandState()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Flatten every account across every (non-archived) brand into one list,
  // then dedupe the same channel appearing on multiple brands — keep the
  // richest instance (most followers, then longest history) so the grid
  // never shows the same YouTube channel twice. Sorted by follower count
  // desc — your biggest stage first.
  const flat: FlatAccount[] = useMemo(() => {
    const rank = (a: FlatAccount) => (a.followers ?? -1) * 1_000_000 + (a.history?.length ?? 0)
    const byKey = new Map<string, FlatAccount>()
    for (const b of state.brands) {
      if (b.archived) continue
      for (const a of b.accounts) {
        const flatAcc: FlatAccount = {
          ...a, brandId: b.id, brandName: b.name, brandEmoji: b.emoji, brandArchetype: b.archetype,
        }
        const k = accountKey(a.platform, a.handle)
        const existing = byKey.get(k)
        if (!existing || rank(flatAcc) > rank(existing)) byKey.set(k, flatAcc)
      }
    }
    return Array.from(byKey.values()).sort((x, y) => (y.followers ?? -1) - (x.followers ?? -1))
  }, [state.brands])

  const total = flat.reduce((sum, a) => sum + (a.followers || 0), 0)

  if (!mounted || !ready) {
    return (
      <main className={`${styles.page} grain-overlay`}>
        <div className={styles.shell} />
      </main>
    )
  }

  return (
    <main className={`${styles.page} grain-overlay`}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <Link href="/app" className={styles.back}>
              <span className={styles.backArrow}>←</span> Vitality
            </Link>
            <span className={styles.countPill}>
              {flat.length === 0
                ? 'No socials yet'
                : `${flat.length} ${flat.length === 1 ? 'account' : 'accounts'} · ${fmtCount(total)} total`}
            </span>
            <h1 className={styles.title}>Brand</h1>
            <p className={styles.subtitle}>Track what you’re building</p>
          </div>
        </header>

        <TabNav active="socials" />

        {flat.length === 0 ? (
          <section className={styles.empty}>
            <div className={styles.emptyMark} aria-hidden>✦</div>
            <h2 className={styles.emptyTitle}>No socials linked yet</h2>
            <p className={styles.emptyText}>
              Add accounts to your brands. They’ll show up here with
              live follower counts and growth charts.
            </p>
            <Link href="/app/brand" className={styles.emptyBtn}>
              Go to Brands →
            </Link>
          </section>
        ) : (
          <ul className={styles.socialsGrid}>
            {flat.map(a => (
              <SocialTile
                key={a.id}
                account={a}
                onRefreshed={(patch) => actions.updateAccount(a.brandId, a.id, patch)}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}

// -----------------------------------------------------------------------------
// Tab nav — same component renders on the brand index too (it's used
// from /app/brand/page via a re-export pattern, but inlining here keeps
// the two pages independent).
// -----------------------------------------------------------------------------

export function TabNav({ active }: { active: 'brands' | 'socials' }) {
  return (
    <nav className={styles.tabNav} aria-label="Brand sections">
      <Link
        href="/app/brand"
        className={`${styles.tabLink} ${active === 'brands' ? styles.tabLinkActive : ''}`}
        aria-current={active === 'brands' ? 'page' : undefined}
      >
        Brands
      </Link>
      <Link
        href="/app/brand/socials"
        className={`${styles.tabLink} ${active === 'socials' ? styles.tabLinkActive : ''}`}
        aria-current={active === 'socials' ? 'page' : undefined}
      >
        Socials
      </Link>
    </nav>
  )
}

// -----------------------------------------------------------------------------
// Tile — one account in the socials grid.
// -----------------------------------------------------------------------------

interface TileProps {
  account: FlatAccount
  onRefreshed: (patch: Partial<Pick<BrandAccount, 'followers' | 'avatarUrl'>>) => void
}

function SocialTile({ account, onRefreshed }: TileProps) {
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canRefresh = LIVE_PLATFORMS.has(account.platform)

  async function refresh() {
    if (!canRefresh || !account.handle.trim() || refreshing) return
    setRefreshing(true)
    setError(null)
    try {
      const res = await fetch('/api/brand/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: account.platform, handle: account.handle }),
      })
      const data = await res.json() as { followers?: number; avatarUrl?: string; error?: string }
      if (!res.ok || typeof data.followers !== 'number') {
        throw new Error(data.error || `request failed (${res.status})`)
      }
      onRefreshed({
        followers: data.followers,
        ...(typeof data.avatarUrl === 'string' && data.avatarUrl ? { avatarUrl: data.avatarUrl } : {}),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown error')
    } finally {
      setRefreshing(false)
    }
  }

  const history = account.history ?? []
  const delta = computeDelta(history)
  const followersLabel = account.followers !== null && account.followers !== undefined
    ? account.followers.toLocaleString()
    : '-'

  return (
    <li className={styles.socialTile} style={accentVars(account.brandArchetype)}>
      <header className={styles.socialTileHead}>
        <BrandAvatar platform={account.platform} avatarUrl={account.avatarUrl} size={44} />

        <div className={styles.socialTileText}>
          <div className={styles.socialTilePlatform}>{PLATFORM_LABELS[account.platform]}</div>
          <div className={styles.socialTileHandle}>{account.handle || '-'}</div>
        </div>

        {canRefresh && (
          <button
            type="button"
            className={styles.accountRefreshBtn}
            onClick={refresh}
            disabled={refreshing || !account.handle.trim()}
            aria-label="Refresh follower count"
            title="Refresh"
          >
            {refreshing ? (
              <span className={styles.accountRefreshSpin} aria-hidden>↻</span>
            ) : (
              <span aria-hidden>↻</span>
            )}
          </button>
        )}
      </header>

      <Link href={`/app/brand/${account.brandId}?account=${account.id}`} className={styles.socialTileBody}>
        <div className={styles.socialFollowers}>
          <span className={styles.socialFollowersNum}>{followersLabel}</span>
          <span className={styles.socialFollowersLabel}>
            {account.platform === 'youtube' || account.platform === 'youtube_long' ? 'subscribers' : 'followers'}
          </span>
          {delta !== null && (
            <span className={`${styles.socialDelta} ${delta >= 0 ? styles.socialDeltaUp : styles.socialDeltaDown}`}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toLocaleString()}
            </span>
          )}
        </div>
        <Sparkline history={history} />
      </Link>

      <footer className={styles.socialTileFoot}>
        <Link href={`/app/brand/${account.brandId}?account=${account.id}`} className={styles.socialBrandLink}>
          <span className={styles.socialBrandEmoji} aria-hidden>{account.brandEmoji}</span>
          {account.brandName}
        </Link>
        {error && <span className={styles.accountError}>{error}</span>}
      </footer>
    </li>
  )
}

// -----------------------------------------------------------------------------
// Sparkline — tiny SVG polyline of the follower history.
//
// Renders nothing if we don't have at least 2 data points yet (single
// number wouldn't tell you anything). The chart is normalised to its
// own min/max so small movements still look meaningful — the chip with
// the absolute delta carries the magnitude.
// -----------------------------------------------------------------------------

interface SparklineProps {
  history: FollowerSnapshot[]
  width?: number
  height?: number
}

function Sparkline({ history, width = 240, height = 48 }: SparklineProps) {
  if (history.length < 2) {
    return (
      <div className={styles.sparkEmpty}>
        Refresh again later to see the trend.
      </div>
    )
  }

  const counts = history.map(h => h.count)
  const min = Math.min(...counts)
  const max = Math.max(...counts)
  const range = max - min || 1
  const padY = 4

  const points = history.map((h, i) => {
    const x = (i / (history.length - 1)) * width
    const y = height - padY - ((h.count - min) / range) * (height - padY * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  const lastX = width
  const lastY = height - padY - ((history[history.length - 1].count - min) / range) * (height - padY * 2)

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={styles.sparkSvg}
      style={{ color: 'var(--accent)' }}
      aria-hidden
    >
      {/* Area fill under the line for a fuller look. Flat currentColor
       * (driven by the tile's accent) rather than a gradient with a
       * shared <defs> id — duplicate ids across tiles would all resolve
       * to the first definition and paint every spark the same hue. */}
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill="currentColor"
        fillOpacity={0.12}
      />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={3} fill="currentColor" />
    </svg>
  )
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function computeDelta(history: FollowerSnapshot[]): number | null {
  if (history.length < 2) return null
  return history[history.length - 1].count - history[0].count
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(n)
}
