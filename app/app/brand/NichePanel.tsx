'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import styles from './brand.module.css'
import type { Brand, BrandAccount, Platform } from './types'
import { PLATFORM_LABELS, platformProfileUrl } from './types'
import type { BrandActions } from './state'
import type { Snap } from './SocialChart'
import Sparkline from './Sparkline'

/**
 * Niche — classify the brand's niche in a few words, then show how that niche is
 * trending on Google Trends.
 *
 * Two steps: (1) POST /api/brand/niche classifies the niche from the brand's
 * signals into { label, keyword, summary } (saved on the brand under
 * packReads['niche'] as JSON so it persists); (2) POST /api/brand/trends pulls
 * Google Trends interest-over-time for the keyword and we graph it. Trends has
 * no official API and can be rate-limited from the server, so there is always an
 * "Open in Google Trends" fallback link. 402 → Pro upsell.
 */

const KEY = 'niche'

interface NicheData { label: string; keyword: string; summary: string }
interface TrendPoint { label: string; value: number }
type Trends =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; points: TrendPoint[] }
  | { status: 'unavailable' }

/** Parse the saved niche blob. Old reads were plain prose — treat those as a summary only. */
function parseSaved(text: string): NicheData | null {
  try {
    const o = JSON.parse(text)
    if (o && typeof o.label === 'string' && typeof o.keyword === 'string') {
      return { label: o.label, keyword: o.keyword, summary: typeof o.summary === 'string' ? o.summary : '' }
    }
  } catch { /* not JSON — legacy prose read */ }
  return null
}

/** Direction of the series: recent window vs the whole-year baseline. */
function direction(points: TrendPoint[]): { word: string; tone: 'up' | 'down' | 'flat'; current: number } {
  const vals = points.map((p) => p.value)
  const current = vals[vals.length - 1] ?? 0
  const recent = vals.slice(-6)
  const recentAvg = recent.reduce((a, b) => a + b, 0) / (recent.length || 1)
  const baseAvg = vals.reduce((a, b) => a + b, 0) / (vals.length || 1)
  const ratio = baseAvg > 0 ? recentAvg / baseAvg : 1
  if (ratio >= 1.15) return { word: 'Rising', tone: 'up', current }
  if (ratio <= 0.85) return { word: 'Cooling', tone: 'down', current }
  return { word: 'Steady', tone: 'flat', current }
}

function trendsUrl(keyword: string): string {
  return `https://trends.google.com/trends/explore?q=${encodeURIComponent(keyword)}&date=today%2012-m`
}

export default function NichePanel({
  brand, actions, focusAccount, snapshots,
}: {
  brand: Brand
  actions: BrandActions
  focusAccount: BrandAccount
  snapshots?: Snap[]
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsPro, setNeedsPro] = useState(false)
  const [trends, setTrends] = useState<Trends>({ status: 'idle' })

  const saved = brand.packReads?.[KEY] ?? null
  const niche = useMemo(() => (saved ? parseSaved(saved.text) : null), [saved])
  const generatedAt = saved
    ? new Date(saved.at).toLocaleString(undefined, { month: 'short', day: 'numeric' })
    : null

  const fetchTrends = useCallback(async (keyword: string) => {
    setTrends({ status: 'loading' })
    try {
      const res = await fetch('/api/brand/trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword }),
      })
      const data = await res.json().catch(() => ({})) as { status?: string; points?: TrendPoint[] }
      if (data.status === 'ok' && Array.isArray(data.points) && data.points.length >= 4) {
        setTrends({ status: 'ok', points: data.points })
      } else {
        setTrends({ status: 'unavailable' })
      }
    } catch {
      setTrends({ status: 'unavailable' })
    }
  }, [])

  // Pull the trend graph whenever we have a classified keyword.
  useEffect(() => {
    if (niche?.keyword) void fetchTrends(niche.keyword)
    else setTrends({ status: 'idle' })
  }, [niche?.keyword, fetchTrends])

  async function classify() {
    if (loading) return
    setLoading(true)
    setError(null)
    setNeedsPro(false)
    try {
      const res = await fetch('/api/brand/niche', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niche: {
            name: brand.name,
            archetype: brand.archetype,
            blurb: brand.blurb,
            platform: PLATFORM_LABELS[focusAccount.platform],
            handle: focusAccount.handle,
            profileUrl: platformProfileUrl(focusAccount.platform, focusAccount.handle) || undefined,
            recentTitles: (brand.uploads ?? [])
              .slice(-12)
              .map((u) => u.title)
              .filter((t): t is string => !!t && t.trim().length > 0),
            scheduleLabels: (brand.schedules ?? [])
              .map((s) => s.label)
              .filter((l): l is string => !!l && l.trim().length > 0),
            notes: Object.fromEntries(
              Object.entries(brand.packReads ?? {})
                .filter(([k]) => k !== 'niche' && k !== 'playbook' && k !== 'posting_times')
                .map(([k, v]) => [k, v.text]),
            ),
          },
        }),
      })
      if (res.status === 402) { setNeedsPro(true); return }
      const data = await res.json().catch(() => ({})) as NicheData & { error?: string }
      if (!res.ok || !data.label || !data.keyword) throw new Error(data.error || `request failed (${res.status})`)
      actions.setPackRead(brand.id, KEY, JSON.stringify({ label: data.label, keyword: data.keyword, summary: data.summary || '' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not classify the niche.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className={styles.insightBanner}>
      <div className={styles.insightHead}>
        <span className={styles.insightSpark} aria-hidden>📈</span>
        <span className={styles.insightEyebrow}>Niche</span>
        {generatedAt && !loading && <span className={styles.insightStamp}>classified · {generatedAt}</span>}
      </div>

      {loading ? (
        <p className={styles.insightLoading}>
          <span className={styles.insightLoadingDot} aria-hidden />
          Classifying your niche…
        </p>
      ) : niche ? (
        <>
          <div className={styles.nicheLabel}>{niche.label}</div>
          {niche.summary && <p className={styles.nicheSummary}>{niche.summary}</p>}

          <TrendGraph trends={trends} keyword={niche.keyword} onRetry={() => fetchTrends(niche.keyword)} />
        </>
      ) : (
        <p className={styles.insightBody}>
          Name your niche in a couple words, then see how it’s trending on Google Trends.
        </p>
      )}

      {needsPro && (
        <p className={styles.insightUpsell}>
          The niche read is a Pro feature.{' '}
          <Link href="/pricing" className={styles.insightUpsellLink}>See Pro →</Link>
        </p>
      )}
      {error && <p className={styles.insightError}>{error}</p>}

      <div className={styles.insightActions}>
        <button type="button" className={styles.insightBtn} onClick={classify} disabled={loading}>
          {loading ? 'Reading…' : niche ? 'Re-read niche' : 'Read my niche'}
        </button>
      </div>
    </section>
  )
}

function TrendGraph({ trends, keyword, onRetry }: { trends: Trends; keyword: string; onRetry: () => void }) {
  if (trends.status === 'loading') {
    return (
      <p className={styles.insightLoading}>
        <span className={styles.insightLoadingDot} aria-hidden />
        Pulling Google Trends…
      </p>
    )
  }

  if (trends.status === 'unavailable') {
    return (
      <div className={styles.nicheGraph}>
        <p className={styles.nicheGraphMiss}>
          Google Trends didn’t respond just now.
        </p>
        <div className={styles.nicheGraphLinks}>
          <button type="button" className={styles.nicheRetry} onClick={onRetry}>Retry</button>
          <a className={styles.nicheTrendLink} href={trendsUrl(keyword)} target="_blank" rel="noopener noreferrer">
            Open “{keyword}” in Google Trends ↗
          </a>
        </div>
      </div>
    )
  }

  if (trends.status === 'ok') {
    const { word, tone, current } = direction(trends.points)
    const color = tone === 'up' ? 'var(--accent)' : tone === 'down' ? 'var(--red)' : 'var(--muted-strong)'
    return (
      <div className={styles.nicheGraph}>
        <div className={styles.nicheGraphTop}>
          <span className={`${styles.nicheBadge} ${styles[`nicheBadge_${tone}`]}`}>
            {tone === 'up' ? '▲' : tone === 'down' ? '▼' : '▬'} {word}
          </span>
          <span className={styles.nicheNow}>{current}<span className={styles.nicheNowUnit}>/100 now</span></span>
        </div>
        <Sparkline values={trends.points.map((p) => p.value)} height={72} color={color} fill dot />
        <div className={styles.nicheCap}>
          <span>Google Trends · “{keyword}” · last 12 months</span>
          <a className={styles.nicheTrendLink} href={trendsUrl(keyword)} target="_blank" rel="noopener noreferrer">
            Open ↗
          </a>
        </div>
      </div>
    )
  }

  return null
}
