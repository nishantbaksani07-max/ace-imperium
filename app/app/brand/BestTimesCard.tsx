'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import styles from './brand.module.css'
import type { Brand, BrandAccount, Platform } from './types'
import { PLATFORM_LABELS } from './types'
import type { BrandActions } from './state'
import type { SocialPlatform } from '@/lib/social/types'
import type { Snap } from './SocialChart'

/**
 * Best times — the AI half of the "When to post" button. One tap reads the
 * user's saved Claude-Chrome data packs (Best times / Audience / what's working)
 * plus their numbers via /api/brand/posting-times and returns a short card:
 * the best times to post and how many per day for reach. Saved on the brand
 * under packReads['posting_times'] so it persists. The editable schedule with
 * the countdown timers sits below this (SchedulePanel). 402 → Pro upsell.
 */

const KEY = 'posting_times'

const SP: Partial<Record<Platform, SocialPlatform>> = {
  instagram: 'instagram', tiktok: 'tiktok', youtube: 'youtube', youtube_long: 'youtube',
}

/** Split a line on **bold** spans into JSX. */
function renderInline(text: string, base: string): JSX.Element[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(part)
    return m
      ? <strong key={`${base}-${i}`}>{m[1]}</strong>
      : <span key={`${base}-${i}`}>{part}</span>
  })
}

/** Render the strategist's "lead line + '- ' bullets + **bold**" format. */
function renderRead(text: string): JSX.Element[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const out: JSX.Element[] = []
  let bullets: string[] = []
  let key = 0
  const flush = () => {
    if (!bullets.length) return
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
    if (line.startsWith('- ')) bullets.push(line.slice(2))
    else {
      flush()
      const k = key++
      out.push(<p key={`p-${k}`} className={styles.insightLead}>{renderInline(line, `p${k}`)}</p>)
    }
  }
  flush()
  return out
}

export default function BestTimesCard({
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

  const saved = brand.packReads?.[KEY] ?? null
  const read = saved?.text?.trim() || ''
  const generatedAt = saved
    ? new Date(saved.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null

  const latest = useMemo(() => {
    const sp = SP[focusAccount.platform]
    if (!sp) return null
    const mine = (snapshots ?? []).filter((s) => s.platform === sp)
    return mine.length ? mine[mine.length - 1] : null
  }, [snapshots, focusAccount.platform])

  async function generate() {
    if (loading) return
    setLoading(true)
    setError(null)
    setNeedsPro(false)
    try {
      const res = await fetch('/api/brand/posting-times', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post: {
            platform: PLATFORM_LABELS[focusAccount.platform],
            handle: focusAccount.handle,
            followers: focusAccount.followers ?? null,
            reach: latest?.reach ?? null,
            engagementRate: latest?.engagement_rate ?? null,
            scheduleLabels: (brand.schedules ?? [])
              .map((s) => s.label)
              .filter((l): l is string => !!l && l.trim().length > 0),
            notes: Object.fromEntries(
              Object.entries(brand.packReads ?? {})
                .filter(([k]) => k !== 'niche' && k !== 'playbook' && k !== KEY)
                .map(([k, v]) => [k, v.text]),
            ),
          },
        }),
      })
      if (res.status === 402) { setNeedsPro(true); return }
      const data = await res.json().catch(() => ({})) as { read?: string; error?: string }
      if (!res.ok || !data.read) throw new Error(data.error || `request failed (${res.status})`)
      actions.setPackRead(brand.id, KEY, data.read)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the strategist.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className={styles.insightBanner}>
      <div className={styles.insightHead}>
        <span className={styles.insightSpark} aria-hidden>🕒</span>
        <span className={styles.insightEyebrow}>Best times</span>
        {generatedAt && !loading && <span className={styles.insightStamp}>read · {generatedAt}</span>}
      </div>

      {loading ? (
        <p className={styles.insightLoading}>
          <span className={styles.insightLoadingDot} aria-hidden />
          Reading your best posting windows…
        </p>
      ) : read ? (
        <div className={styles.insightRead}>{renderRead(read)}</div>
      ) : (
        <p className={styles.insightBody}>
          Get your best times to post and how many a day for reach. It reads the Best Times and
          Audience data you pulled with the Claude extension. Set the actual times and timers below.
        </p>
      )}

      {needsPro && (
        <p className={styles.insightUpsell}>
          The best-times read is a Pro feature.{' '}
          <Link href="/pricing" className={styles.insightUpsellLink}>See Pro →</Link>
        </p>
      )}
      {error && <p className={styles.insightError}>{error}</p>}

      <div className={styles.insightActions}>
        <button type="button" className={styles.insightBtn} onClick={generate} disabled={loading}>
          {loading ? 'Reading…' : read ? 'Refresh best times' : 'Get my best times'}
        </button>
      </div>
    </section>
  )
}
