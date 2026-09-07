'use client'

import { useEffect, useRef, useState } from 'react'
import { fetchStamps, newerTables, applyRemote, type StampMap } from '@/lib/sync/remoteWatch'
import { syncSettled } from '@/lib/sync/syncAllModules'
import styles from './RemoteUpdateWatcher.module.css'

const POLL_MS = 15_000
const SETTLE_TIMEOUT_MS = 8_000

/**
 * "Watch it change": polls the blob tables' `updated_at` while the tab is visible
 * (and immediately on regaining focus). When a remote writer — Claude via the
 * MCP, or another device — moves a timestamp past what this tab last saw, it
 * shows a one-tap pill to pull the change in. Never auto-reloads, so the user's
 * own work is never interrupted. Best-effort; any failure is silent.
 */
export default function RemoteUpdateWatcher() {
  const baseline = useRef<StampMap | null>(null)
  const [changed, setChanged] = useState<string[]>([])
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const settled = { current: false }

    async function check() {
      if (!settled.current || document.visibilityState !== 'visible') return
      try {
        const current = await fetchStamps()
        if (!alive) return
        if (baseline.current === null) {
          // First read after load establishes the baseline (the load-time push
          // is already reflected), so only LATER remote writes show the pill.
          baseline.current = current
          return
        }
        const diff = newerTables(baseline.current, current)
        if (diff.length) setChanged(diff)
      } catch {
        /* best-effort */
      }
    }

    function loop() {
      void check()
      timer = setTimeout(loop, POLL_MS)
    }
    function onVisible() {
      if (document.visibilityState === 'visible') void check()
    }

    // Don't baseline until the load-time push has settled (or a timeout), so its
    // own updated_at bumps aren't seen as a remote write → a false pill on load.
    Promise.race([syncSettled, new Promise<void>((r) => setTimeout(r, SETTLE_TIMEOUT_MS))]).then(() => {
      if (!alive) return
      settled.current = true
      loop()
    })
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])

  async function refresh() {
    if (applying) return
    setApplying(true)
    try {
      await applyRemote(changed)
    } catch {
      /* fall through to reload regardless */
    }
    window.location.reload()
  }

  if (changed.length === 0) return null

  return (
    <div className={styles.pill} role="status" aria-live="polite">
      <span className={styles.dot} aria-hidden />
      <span className={styles.label}>Your data was updated</span>
      <button type="button" className={styles.btn} onClick={refresh} disabled={applying}>
        {applying ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  )
}
