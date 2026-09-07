'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getLocalDateKey } from '@/lib/dates'

const COOKIE_NAME = 'vitality_local_date'
const COOKIE_MAX_AGE_DAYS = 1
const RESYNC_INTERVAL_MS = 60_000

/**
 * Mounted once in app/app/layout.tsx. Writes the browser's real local
 * date (YYYY-MM-DD) to the `vitality_local_date` cookie so server-rendered
 * pages can compute "today" against the user's timezone, not Vercel's UTC.
 *
 * Why this matters: a US East Coast user logging a workout at 9pm local
 * sees a server date of "tomorrow" (UTC midnight has passed). Without
 * this cookie, every workouts row keys against the wrong date.
 *
 * The cookie is refreshed every minute so midnight rollover (and any
 * timezone change from travel) gets picked up mid-session. If the cookie
 * value actually changes, `router.refresh()` re-runs Server Components
 * with the correct date.
 */
export default function LocalDateSync() {
  const router = useRouter()
  useEffect(() => {
    function syncCookie() {
      const todayLocal = getLocalDateKey()
      const current = readCookie(COOKIE_NAME)
      if (current === todayLocal) return
      document.cookie = `${COOKIE_NAME}=${todayLocal}; path=/; max-age=${COOKIE_MAX_AGE_DAYS * 24 * 60 * 60}; SameSite=Lax`
      router.refresh()
    }
    syncCookie()
    const interval = setInterval(syncCookie, RESYNC_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [router])
  return null
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escapeRegex(name)}=([^;]+)`))
  return match ? decodeURIComponent(match[1]) : null
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
