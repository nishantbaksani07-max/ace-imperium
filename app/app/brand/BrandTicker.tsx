'use client'

import { useMemo } from 'react'
import styles from './brand.module.css'
import type { Brand, BrandMoneyEntry } from './types'
import { PLATFORM_SHORT } from './types'
import { deltaSinceDays } from './state'
import type { Snap } from './SocialChart'

/**
 * NASDAQ-style ticker — a faded, slowly-scrolling band of every number we hold
 * for this brand: follower counts + 7-day deltas (per account), the latest
 * Claude-Chrome snapshot metrics (views / reach / engagement), the money in/out/
 * profit, and any manual KPIs. Pulls straight from the brand blob + the pasted
 * snapshots (both mirrored to Supabase). Hover to pause. Renders nothing until
 * there's at least one number to show.
 */

interface Item {
  label: string
  value: string
  delta?: number | null
  tone?: 'in' | 'out'
}

function monthly(entries: BrandMoneyEntry[], kind: 'in' | 'out'): number {
  return entries
    .filter((e) => e.kind === kind)
    .reduce((sum, e) => sum + (e.period === 'monthly' ? e.amount : e.period === 'yearly' ? e.amount / 12 : 0), 0)
}

export default function BrandTicker({ brand, snapshots }: { brand: Brand; snapshots: Snap[] }) {
  const items = useMemo<Item[]>(() => {
    const out: Item[] = []

    // Followers + 7-day delta per linked account.
    for (const a of brand.accounts) {
      if (typeof a.followers !== 'number') continue
      const label = `${PLATFORM_SHORT[a.platform]} ${a.handle || ''}`.trim()
      out.push({ label, value: a.followers.toLocaleString(), delta: deltaSinceDays(a.history, 'count', 7) })
    }

    // Latest pasted snapshot metrics, one set per platform.
    const latest = new Map<string, Snap>()
    for (const s of snapshots) {
      const cur = latest.get(s.platform)
      if (!cur || s.captured_at > cur.captured_at) latest.set(s.platform, s)
    }
    for (const [plat, s] of latest) {
      const P = plat.toUpperCase()
      if (typeof s.views === 'number') out.push({ label: `${P} views`, value: s.views.toLocaleString() })
      if (typeof s.reach === 'number') out.push({ label: `${P} reach`, value: s.reach.toLocaleString() })
      if (typeof s.engagement_rate === 'number') out.push({ label: `${P} eng`, value: `${s.engagement_rate}%` })
    }

    // Money in / out / profit.
    const fin = brand.finance
    if (fin?.entries.length) {
      const mIn = monthly(fin.entries, 'in')
      const mOut = monthly(fin.entries, 'out')
      const cur = fin.currency
      if (mIn) out.push({ label: 'IN', value: `${cur}${Math.round(mIn).toLocaleString()}/mo`, tone: 'in' })
      if (mOut) out.push({ label: 'OUT', value: `${cur}${Math.round(mOut).toLocaleString()}/mo`, tone: 'out' })
      if (mIn || mOut) {
        const p = mIn - mOut
        out.push({ label: 'PROFIT', value: `${p < 0 ? '−' : ''}${cur}${Math.round(Math.abs(p)).toLocaleString()}/mo`, tone: p >= 0 ? 'in' : 'out' })
      }
    }

    // Manual KPIs.
    for (const k of brand.kpis) {
      out.push({ label: k.label, value: `${k.unit || ''}${k.value.toLocaleString()}` })
    }

    return out
  }, [brand, snapshots])

  if (items.length === 0) return null

  const row = (dup: boolean) => (
    <div className={styles.tickerRow} aria-hidden={dup}>
      {items.map((it, i) => (
        <span className={styles.tickerItem} key={i}>
          <span className={styles.tickerLabel}>{it.label}</span>
          <span className={`${styles.tickerVal} ${it.tone === 'in' ? styles.tickerInVal : it.tone === 'out' ? styles.tickerOutVal : ''}`}>{it.value}</span>
          {typeof it.delta === 'number' && it.delta !== 0 && (
            <span className={it.delta > 0 ? styles.tickerUp : styles.tickerDown}>
              {it.delta > 0 ? '▲' : '▼'}{Math.abs(it.delta).toLocaleString()}
            </span>
          )}
          <span className={styles.tickerSep}>·</span>
        </span>
      ))}
    </div>
  )

  return (
    <div className={styles.ticker} aria-label="Live brand metrics">
      <div className={styles.tickerTrack}>
        {row(false)}
        {row(true)}
      </div>
    </div>
  )
}
