'use client'

/**
 * Read-only bridge (BUILD69) that pulls the Brand module's posting schedules
 * into Peak — the same localStorage pattern as useLifeSignals. A brand
 * `Schedule` can carry a posting-time `deadline` (minutes after local midnight +
 * optional weekday); those become today's "things you've committed to ship",
 * shown alongside your day on the Peak schedule. Peak never writes brand state —
 * it only reflects what the Brand tab already holds. Live-updates on cross-tab
 * edits via the `storage` event and on remount.
 */

import { useEffect, useState } from 'react'

const BRAND_LS_KEY = 'vitality_brand_v1'

export interface PostingDeadline {
  /** Schedule id (stable key). */
  id: string
  /** Human label, e.g. "Daily short". */
  label: string
  /** Optional platform association (instagram/tiktok/youtube…). */
  platform?: string
  /** Owning brand's name, for context when several brands run. */
  brand: string
  /** Minutes after local midnight (18:00 = 1080). */
  minutes: number
}

interface RawSchedule {
  id?: string
  label?: string
  platform?: string
  period?: string
  deadline?: { minutes?: number; weekday?: number }
}
interface RawBrand {
  name?: string
  schedules?: RawSchedule[]
}

function readDeadlines(): PostingDeadline[] {
  try {
    const raw = localStorage.getItem(BRAND_LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { brands?: RawBrand[] }
    const today = new Date().getDay()
    const out: PostingDeadline[] = []
    for (const b of parsed.brands ?? []) {
      for (const s of b.schedules ?? []) {
        const minutes = s.deadline?.minutes
        if (minutes == null || !Number.isFinite(minutes)) continue
        // Daily → every day. Weekly → only on its weekday (or any day if none set).
        const appliesToday =
          s.period === 'daily' || s.deadline?.weekday == null || s.deadline.weekday === today
        if (!appliesToday) continue
        out.push({
          id: s.id ?? `${b.name ?? 'brand'}-${minutes}`,
          label: s.label ?? 'Post',
          platform: s.platform,
          brand: b.name ?? 'Brand',
          minutes,
        })
      }
    }
    return out.sort((a, b) => a.minutes - b.minutes)
  } catch {
    return []
  }
}

/** Today's brand posting deadlines, newest-cadence first. */
export function usePostingDeadlines(): PostingDeadline[] {
  const [deadlines, setDeadlines] = useState<PostingDeadline[]>([])

  useEffect(() => {
    const refresh = () => setDeadlines(readDeadlines())
    refresh()
    const onStorage = (e: StorageEvent) => {
      if (e.key === BRAND_LS_KEY || e.key == null) refresh()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return deadlines
}
