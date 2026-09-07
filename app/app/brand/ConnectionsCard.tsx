'use client'

import { useCallback, useEffect, useState } from 'react'
import styles from './brand.module.css'

/**
 * Connections card (BUILD50) — the business "plug in your real numbers" surface.
 *
 * Lists every registered connector (Stripe, Shopify, Amazon, YouTube, Website…)
 * and its status for THIS brand. api_key connectors get an inline paste form;
 * oauth connectors get a Connect button that redirects to the provider. Once
 * connected, each shows its latest synced metrics + Sync/Disconnect.
 *
 * All credentials live server-side (the route handlers); this component only
 * ever sees status + non-secret field descriptors + synced numbers.
 */

interface SyncedMetric {
  metric: string
  label: string
  value: number
  unit?: string
  period?: string
}
interface Field {
  key: string
  label: string
  placeholder?: string
  secret?: boolean
  optional?: boolean
}
interface ConnectorStatus {
  id: string
  label: string
  blurb: string
  authType: 'oauth' | 'api_key'
  configured: boolean
  fields?: Field[]
  connected: boolean
  status?: string
  accountLabel?: string | null
  lastError?: string | null
  lastSyncedAt?: string | null
  metrics?: SyncedMetric[]
}

function fmtMetric(value: number, unit?: string): string {
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

interface ConnectionsCardProps {
  brandId: string
  /** Copy a connector's synced numbers into the brand's tracked KPIs. */
  onImport?: (metrics: { label: string; value: number; unit?: string }[]) => void
}

export default function ConnectionsCard({ brandId, onImport }: ConnectionsCardProps) {
  const [connectors, setConnectors] = useState<ConnectorStatus[] | null>(null)
  const [forms, setForms] = useState<Record<string, Record<string, string>>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<ConnectorStatus[]> => {
    try {
      const res = await fetch(`/api/connectors?brand=${encodeURIComponent(brandId)}`)
      if (!res.ok) throw new Error('Could not load connections')
      const data = await res.json()
      const list: ConnectorStatus[] = data.connectors ?? []
      setConnectors(list)
      return list
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Failed to load')
      return []
    }
  }, [brandId])

  useEffect(() => {
    refresh()
    // Surface the OAuth round-trip result, then clean the URL.
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('connected')
    const err = params.get('error')
    if (connected) setNotice(`Connected ${connected}.`)
    else if (err) setNotice(err)
    if (connected || err) {
      params.delete('connected')
      params.delete('error')
      const qs = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
    }
  }, [refresh])

  function setField(id: string, key: string, value: string) {
    setForms((f) => ({ ...f, [id]: { ...(f[id] ?? {}), [key]: value } }))
  }

  async function submitKey(c: ConnectorStatus) {
    setBusy(c.id)
    setNotice(null)
    try {
      const res = await fetch(`/api/connectors/${c.id}/key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: brandId, creds: forms[c.id] ?? {} }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not connect')
      setForms((f) => ({ ...f, [c.id]: {} }))
      await refresh()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }

  // Auto-fill KPIs: push a connector's synced numbers into the brand's tracked
  // metrics. importKpis dedupes by label, so re-syncing just updates the value.
  const importMetrics = useCallback((metrics?: SyncedMetric[]) => {
    if (!onImport || !metrics?.length) return
    onImport(metrics.map((m) => ({ label: m.label, value: m.value, unit: m.unit })))
  }, [onImport])

  async function syncAll() {
    setBusy('__all__')
    setNotice(null)
    try {
      const res = await fetch('/api/connectors/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: brandId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'sync failed')
      const fresh = await refresh()
      for (const c of fresh) if (c.connected) importMetrics(c.metrics)
      setNotice(`Synced ${data.synced}/${data.total} connection(s).`)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }

  async function act(id: string, action: 'sync' | 'disconnect') {
    setBusy(id)
    setNotice(null)
    try {
      const res = await fetch(`/api/connectors/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: brandId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `${action} failed`)
      if (action === 'sync') importMetrics(data.metrics)
      await refresh()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className={styles.kpisCard}>
      <header className={styles.kpisHead}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowMark}>·06</span>
          <span className={styles.eyebrowRule} />
          Connections
        </span>
        {connectors?.some((c) => c.connected) && (
          <button type="button" className={styles.editToggle} disabled={busy === '__all__'} onClick={syncAll}>
            {busy === '__all__' ? 'Syncing…' : 'Sync all'}
          </button>
        )}
      </header>

      {notice && <p className={styles.connNotice}>{notice}</p>}

      {connectors == null ? (
        <p className={styles.emptyText}>Loading connections…</p>
      ) : (
        <ul className={styles.connList}>
          {connectors.map((c) => (
            <li key={c.id} className={styles.connRow}>
              <div className={styles.connTop}>
                <div>
                  <span className={styles.connName}>{c.label}</span>
                  {c.connected && c.accountLabel && <span className={styles.connAccount}>· {c.accountLabel}</span>}
                </div>
                {c.connected ? (
                  <div className={styles.connActions}>
                    <button type="button" className={styles.editToggle} disabled={busy === c.id} onClick={() => act(c.id, 'sync')}>
                      {busy === c.id ? '…' : 'Sync'}
                    </button>
                    <button type="button" className={styles.connUnlink} disabled={busy === c.id} onClick={() => act(c.id, 'disconnect')}>
                      Disconnect
                    </button>
                  </div>
                ) : !c.configured ? (
                  <span className={styles.connBadge}>Set up by admin</span>
                ) : c.authType === 'oauth' ? (
                  <a className={styles.connConnect} href={`/api/connectors/${c.id}/connect?brand=${encodeURIComponent(brandId)}`}>
                    Connect
                  </a>
                ) : null}
              </div>

              <p className={styles.connBlurb}>{c.blurb}</p>

              {c.connected && c.lastError && c.status === 'error' && (
                <p className={styles.connError}>Last sync failed: {c.lastError}</p>
              )}

              {c.connected && c.metrics && c.metrics.length > 0 && (
                <>
                  <div className={styles.connMetrics}>
                    {c.metrics.map((m) => (
                      <span key={m.metric} className={styles.connChip}>
                        <span className={styles.connChipLabel}>{m.label}</span>
                        <span className={styles.connChipVal}>{fmtMetric(m.value, m.unit)}</span>
                      </span>
                    ))}
                  </div>
                  {onImport && (
                    <button
                      type="button"
                      className={styles.connImport}
                      onClick={() => {
                        onImport(c.metrics!.map((m) => ({ label: m.label, value: m.value, unit: m.unit })))
                        setNotice(`Added ${c.label} metrics to your tracked KPIs.`)
                      }}
                    >
                      + Add to tracked metrics
                    </button>
                  )}
                </>
              )}

              {c.connected && (
                <p className={styles.connSynced}>Last synced {ago(c.lastSyncedAt)}</p>
              )}

              {/* api_key connect form */}
              {!c.connected && c.configured && c.authType === 'api_key' && c.fields && (
                <form
                  className={styles.connForm}
                  onSubmit={(e) => {
                    e.preventDefault()
                    submitKey(c)
                  }}
                >
                  {c.fields.map((f) => (
                    <input
                      key={f.key}
                      className={styles.connInput}
                      type={f.secret ? 'password' : 'text'}
                      placeholder={f.placeholder || f.label}
                      value={forms[c.id]?.[f.key] ?? ''}
                      onChange={(e) => setField(c.id, f.key, e.target.value)}
                      autoComplete="off"
                    />
                  ))}
                  <button type="submit" className={styles.connConnect} disabled={busy === c.id}>
                    {busy === c.id ? 'Connecting…' : 'Connect'}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
