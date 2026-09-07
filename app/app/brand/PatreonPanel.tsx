'use client'

import { useCallback, useEffect, useState } from 'react'
import styles from './brand.module.css'
import PlatformIcon from './PlatformIcon'
import Sparkline from './Sparkline'

/** Metrics worth charting, in preferred toggle order. */
const GRAPHABLE = ['patrons', 'pledge_sum', 'paid_patrons', 'avg_pledge']
interface Series { label: string; unit: string; points: { at: string; value: number }[] }

/**
 * PatreonPanel — the Patreon tile's view. Patreon isn't a reach platform, so it
 * shows none of the social sections (numbers / comments / graph). It shows only
 * what the Patreon API fetches: patron count + monthly pledge, pulled by the
 * connector and read back from /api/connectors. Not connected yet → a Connect
 * button; connected → the live numbers + a Sync.
 *
 * Generic + multi-user: keyed off brandId only; each user connects their own
 * Patreon, RLS-scoped server-side.
 */

interface Metric { label: string; value: number; unit?: string }
interface PatreonStatus {
  connected: boolean
  configured: boolean
  accountLabel?: string | null
  lastSyncedAt?: string | null
  lastError?: string | null
  status?: string
  metrics?: Metric[]
}

function fmt(value: number, unit?: string): string {
  const n = value.toLocaleString()
  if (!unit) return n
  if (/^[$£€¥]/.test(unit)) return `${unit}${n}`
  if (unit === '%') return `${n}%`
  if (unit.startsWith('/')) return `${n}${unit}`
  return `${n} ${unit}`
}

function ago(iso?: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms)) return 'recently'
  const mins = Math.round(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

export default function PatreonPanel({ brandId }: { brandId: string }) {
  const [status, setStatus] = useState<PatreonStatus | null>(null)
  const [series, setSeries] = useState<Record<string, Series>>({})
  const [graphMetric, setGraphMetric] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/connectors?brand=${encodeURIComponent(brandId)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not load')
      const p = (data.connectors ?? []).find((c: { id?: string }) => c.id === 'patreon')
      setStatus(p ?? { connected: false, configured: false })
      if (p?.connected) {
        const hr = await fetch(`/api/connectors/patreon/history?brand=${encodeURIComponent(brandId)}`)
        const hd = await hr.json().catch(() => ({}))
        if (hr.ok) setSeries(hd.series ?? {})
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load Patreon')
    }
  }, [brandId])

  useEffect(() => { void load() }, [load])

  async function sync() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/connectors/patreon/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: brandId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setBusy(false)
    }
  }

  const metrics = status?.metrics ?? []

  return (
    <section className={styles.patreonPanel}>
      <header className={styles.patreonHead}>
        <span className={styles.patreonLogo} aria-hidden><PlatformIcon platform="patreon" size={18} /></span>
        <span className={styles.patreonTitle}>Patreon</span>
        {status?.connected && status.accountLabel && <span className={styles.patreonAccount}>· {status.accountLabel}</span>}
      </header>

      {error && <p className={styles.connNotice}>{error}</p>}

      {status == null ? (
        <p className={styles.emptyText}>Loading…</p>
      ) : status.connected ? (
        <>
          {metrics.length > 0 ? (
            <>
              <div className={styles.patreonStats}>
                {(showAll ? metrics : metrics.slice(0, 3)).map((m) => (
                  <div key={m.label} className={styles.patreonStat}>
                    <span className={styles.patreonStatVal}>{fmt(m.value, m.unit)}</span>
                    <span className={styles.patreonStatLabel}>{m.label}</span>
                  </div>
                ))}
              </div>
              {metrics.length > 3 && (
                <button type="button" className={styles.patreonMore} onClick={() => setShowAll((v) => !v)}>
                  {showAll ? 'Show less' : `Show all ${metrics.length} metrics`}
                </button>
              )}
            </>
          ) : (
            <p className={styles.emptyText}>Connected — tap Sync to pull your numbers.</p>
          )}

          {(() => {
            const keys = GRAPHABLE.filter((k) => series[k]?.points?.length)
            if (keys.length === 0) return null
            const active = graphMetric && keys.includes(graphMetric) ? graphMetric : keys[0]
            const s = series[active]
            const values = s.points.map((p) => p.value)
            const first = values[0]
            const last = values[values.length - 1]
            const delta = last - first
            return (
              <div className={styles.patreonChart}>
                <div className={styles.scPills}>
                  {keys.map((k) => (
                    <button key={k} type="button" className={k === active ? styles.scPillActive : styles.scPill} onClick={() => setGraphMetric(k)}>
                      {series[k].label}
                    </button>
                  ))}
                </div>
                {values.length >= 2 ? (
                  <>
                    <Sparkline values={values} height={44} color="var(--accent)" minZero />
                    <span className={styles.patreonSynced}>
                      {s.label}: {fmt(first, s.unit)} → {fmt(last, s.unit)} ({delta >= 0 ? '+' : ''}{fmt(delta, s.unit)}) over {values.length} syncs
                    </span>
                  </>
                ) : (
                  <p className={styles.emptyText}>Your trend line builds from each sync — one more and it starts drawing.</p>
                )}
              </div>
            )
          })()}

          <div className={styles.patreonFoot}>
            <span className={styles.patreonSynced}>Last synced {ago(status.lastSyncedAt)}</span>
            <button type="button" className={styles.editToggle} disabled={busy} onClick={() => void sync()}>
              {busy ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
          {status.lastError && status.status === 'error' && (
            <p className={styles.connError}>Last sync failed: {status.lastError}</p>
          )}
        </>
      ) : !status.configured ? (
        <p className={styles.emptyText}>Patreon isn’t set up yet — an admin needs to add the API keys.</p>
      ) : (
        <>
          <p className={styles.emptyText}>Connect your Patreon to pull your patron count + monthly pledge automatically.</p>
          <a className={styles.connConnect} href={`/api/connectors/patreon/connect?brand=${encodeURIComponent(brandId)}`}>
            Connect Patreon →
          </a>
        </>
      )}
    </section>
  )
}
