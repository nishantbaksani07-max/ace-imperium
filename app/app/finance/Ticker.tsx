'use client'

import { useEffect, useMemo, useState } from 'react'
import styles from './finance.module.css'
import type { Currency, Subscription } from './types'
import { type ExchangeRates, fmtMoney, nextRenewalDate } from './state'

interface Entry {
  id: string
  name: string
  amountCHF: number
  days: number
}

interface Props {
  subscriptions: Subscription[]
  currency: Currency
  rates: ExchangeRates
}

function buildEntries(subs: Subscription[]): Entry[] {
  const out: Entry[] = []
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  subs.forEach(s => {
    if (!s.renewal) return
    const next = nextRenewalDate(s.renewal, s.period)
    if (!next) return
    const days = Math.round((next.getTime() - today) / 86_400_000)
    out.push({ id: s.id, name: s.name, amountCHF: s.amountCHF, days })
  })
  out.sort((a, b) => a.days - b.days)
  return out
}

function daysLabel(d: number): string {
  if (d < 0) return `${Math.abs(d)}d late`
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  return `in ${d}d`
}

/**
 * Top-of-page ticker. Rotates through subscriptions that have a renewal date,
 * sorted by soonest. Hidden if no renewals. Switches the chrome to amber
 * when the currently-shown renewal is within 5 days (urgent state).
 */
export default function Ticker({ subscriptions, currency, rates }: Props) {
  const entries = useMemo(() => buildEntries(subscriptions), [subscriptions])
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)

  // Reset / clamp the rotation index when the list changes.
  useEffect(() => {
    if (idx >= entries.length) setIdx(0)
  }, [entries.length, idx])

  // Rotate every 5s. Skip entirely under prefers-reduced-motion (WCAG 2.2.2)
  // or while the user is hovering/focusing the ticker, so it never moves out
  // from under someone mid-read.
  useEffect(() => {
    if (entries.length < 2 || paused) return
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    const t = setInterval(() => setIdx(i => (i + 1) % entries.length), 5000)
    return () => clearInterval(t)
  }, [entries.length, paused])

  if (entries.length === 0) return null

  const cur = entries[idx]
  const urgent = cur && cur.days <= 5

  return (
    <div
      className={`${styles.ticker} ${urgent ? styles.urgent : ''}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <span className={styles.tickerTag}>renews</span>
      <div className={styles.tickerStream} aria-live="polite">
        {entries.map((e, i) => (
          <div
            key={e.id}
            className={`${styles.tickerItem} ${i === idx ? styles.active : ''}`}
            aria-hidden={i !== idx}
          >
            <span className={styles.tickerItemName}>{e.name}</span>
            <span className={styles.tickerItemAmt}>{fmtMoney(e.amountCHF, currency, rates)}</span>
            <span className={styles.tickerItemDays}>{daysLabel(e.days)}</span>
          </div>
        ))}
      </div>
      <div className={styles.tickerDots}>
        {entries.map((e, i) => (
          <span key={e.id} className={`${styles.tickerDot} ${i === idx ? styles.active : ''}`} />
        ))}
      </div>
    </div>
  )
}
