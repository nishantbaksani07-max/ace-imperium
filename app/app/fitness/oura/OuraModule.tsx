'use client'

import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dashboardStyles from '../../dashboard.module.css'
import fitnessStyles from '../fitness.module.css'
import styles from '../whoop/whoop.module.css'
import TickerBar from '../whoop/TickerBar'

/**
 * Public view shape — computed server-side in page.tsx from
 * `wearable_data`. `data` is null when the user has zero rows yet.
 */
export interface OuraView {
  connected: boolean
  // The user has saved their own Oura app's client_id + client_secret, but
  // may not have completed the OAuth authorize step yet.
  hasCredentials: boolean
  // Vitality's callback URL — the user registers this in their own Oura app.
  redirectUri: string
  data: OuraData | null
}

export interface OuraData {
  date: string
  recovery: number | null
  hrv: number | null
  rhr: number | null
  sleepPerf: number | null
  sleepHours: number | null
  strain: number | null
  hrvBaseline: number | null
  rhrBaseline: number | null
  sleepPerfBaseline: number | null
  strainWeeklyAvg: number | null
  hrvAnomalous: boolean
  recoveryTrend: number[]
  sleepDebt7d: { day: string; hours: number }[]
  sleepTargetHours: number
  vitalityScore: number | null
  vitalityTier: string
  lastSyncedMinutes: number | null
  daysAvailable: number
}

interface Props { view: OuraView }

// Where to continue after keys are saved + Oura authorizes. Mirrors the
// server's safeReturn: only same-origin /app/* paths, so a stray ?return can't
// bounce the user off-site. Defaults back to this module.
function safeReturnClient(raw: string | null): string {
  if (raw && raw.startsWith('/app/') && !raw.startsWith('/app//') && !raw.includes('://')) return raw
  return '/app/fitness/oura'
}

// Map the OAuth/connect error codes we redirect with onto human copy.
function friendlyError(code: string): string {
  switch (code) {
    case 'missing_credentials':
      return 'Add your Oura app keys first, then connect.'
    case 'invalid_state':
      return 'That connect attempt expired. Please try again.'
    case 'access_denied':
      return 'Oura access was declined. You can try connecting again.'
    default:
      return code
  }
}

function recoveryTone(r: number | null): 'good' | 'watch' | 'low' | 'muted' {
  if (r == null) return 'muted'
  if (r >= 67) return 'good'
  if (r >= 34) return 'watch'
  return 'low'
}

function formatHM(decimalHours: number | null): string {
  if (decimalHours == null) return '—'
  const h = Math.floor(decimalHours)
  const m = Math.round((decimalHours - h) * 60)
  return `${h}h ${String(m).padStart(2, '0')}m`
}

function formatDebt(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `${sign}${h}h ${String(m).padStart(2, '0')}m`
}

export default function OuraModule({ view }: Props) {
  const router = useRouter()
  const search = useSearchParams()
  const [syncing, setSyncing] = useState(false)
  const [banner, setBanner] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    const err = search.get('error')
    const ok = search.get('connected')
    if (err) setBanner({ tone: 'error', text: friendlyError(decodeURIComponent(err)) })
    else if (ok) setBanner({ tone: 'ok', text: 'Oura connected' })
  }, [search])

  // Mirror the live WHOOP figures into localStorage so cross-module
  // consumers (the Peak module, the supplement recommender, etc.) can read
  // recovery / sleep / strain without round-tripping the server.
  useEffect(() => {
    if (typeof window === 'undefined' || !view.data) return
    try {
      const d = view.data
      localStorage.setItem('vitality_oura_v1', JSON.stringify({
        recovery: d.recovery,
        hrv: d.hrv,
        hrvBaseline: d.hrvBaseline,
        sleepPerf: d.sleepPerf,
        sleepHours: d.sleepHours,
        strain: d.strain,
        strainWeeklyAvg: d.strainWeeklyAvg,
      }))
    } catch {}
  }, [view.data])

  const onSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/oura/sync', { method: 'POST' })
      if (res.ok) router.refresh()
      else {
        const j = await res.json().catch(() => null)
        setBanner({ tone: 'error', text: j?.error ?? 'Sync failed' })
      }
    } finally {
      setSyncing(false)
    }
  }

  const onDisconnect = async () => {
    if (!confirm('Disconnect your Oura account? Vitality will stop pulling new data.')) return
    await fetch('/api/oura/disconnect', { method: 'POST' })
    router.refresh()
  }

  return (
    <main className={`${dashboardStyles.page} grain-overlay`}>
      <div className={dashboardStyles.shell}>
        <div className={fitnessStyles.header}>
          <Link href="/app/vitals" className={fitnessStyles.back}>
            <span className={fitnessStyles.backArrow}>←</span> Vitals
          </Link>
          <div className={styles.titleRow}>
            <div>
              <h1 className={fitnessStyles.title}>Oura</h1>
              <p className={fitnessStyles.subtitle}>Recovery · sleep · strain · HRV</p>
            </div>
            {view.connected && view.data && view.data.vitalityScore != null && (
              <VitalityScoreBadge score={view.data.vitalityScore} tier={view.data.vitalityTier} />
            )}
          </div>
        </div>

        {banner && (
          <div className={`${styles.banner} ${banner.tone === 'error' ? styles.bannerError : styles.bannerOk}`}>
            {banner.text}
          </div>
        )}

        {view.connected && view.data && <TickerBar d={view.data} />}

        {!view.connected ? (
          <ConnectPanel
            hasCredentials={view.hasCredentials}
            redirectUri={view.redirectUri}
            returnTo={safeReturnClient(search.get('return'))}
          />
        ) : !view.data ? (
          <NoDataPanel syncing={syncing} onSync={onSync} onDisconnect={onDisconnect} />
        ) : (
          <DataPanel d={view.data} syncing={syncing} onSync={onSync} onDisconnect={onDisconnect} />
        )}
      </div>
    </main>
  )
}

const OURA_DASHBOARD_URL = 'https://cloud.ouraring.com/oauth/applications'

/**
 * BYO-credentials connect flow. Oura's shared app is capped to a handful of
 * authorized users while it waits on Oura's approval, so each user creates
 * their own free Oura developer app (its owner can authorize their own Oura
 * account without waiting on review) and pastes its keys here.
 *
 * Two states:
 *  · keys already saved → straight "Connect Oura" CTA (+ a way to swap keys)
 *  · no keys yet → the guided 3-step form below
 */
function ConnectPanel({
  hasCredentials,
  redirectUri,
  returnTo,
}: {
  hasCredentials: boolean
  redirectUri: string
  returnTo: string
}) {
  const [showForm, setShowForm] = useState(!hasCredentials)
  const connectHref = `/api/oura/connect?return=${encodeURIComponent(returnTo)}`

  if (hasCredentials && !showForm) {
    return (
      <section className={styles.connectPanel}>
        <p className={styles.connectIntro}>
          Your Oura app keys are saved. One tap to authorize — sign in with Oura,
          allow access, you&rsquo;re back here.
        </p>
        <p className={styles.connectSub}>We never see your Oura password. You can disconnect anytime.</p>
        <a href={connectHref} className={`btn btn-primary ${styles.connectCta}`}>
          Connect Oura
        </a>
        <button type="button" onClick={() => setShowForm(true)} className="btn btn-link">
          use different keys
        </button>
      </section>
    )
  }

  return <CredentialsForm redirectUri={redirectUri} connectHref={connectHref} />
}

function CredentialsForm({ redirectUri, connectHref }: { redirectUri: string; connectHref: string }) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const copyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!clientId.trim() || !clientSecret.trim()) {
      setError('Enter both your Client ID and Client Secret.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/oura/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        setError(j?.error ?? 'Could not save your keys.')
        setSaving(false)
        return
      }
      // Keys saved — kick straight into the OAuth authorize step, continuing to
      // wherever the user was originally headed (carried in connectHref).
      window.location.href = connectHref
    } catch {
      setError('Could not save your keys.')
      setSaving(false)
    }
  }

  return (
    <section className={styles.connectPanel}>
      <p className={styles.connectIntro}>
        Connect Oura with <em>your own</em> developer keys. It takes about two minutes,
        and your <em>readiness</em>, <em>sleep</em>, and <em>HRV</em> flow into Vitality from then on.
      </p>

      <ol className={styles.credSteps}>
        <li>
          Open the{' '}
          <a href={OURA_DASHBOARD_URL} target="_blank" rel="noopener noreferrer" className={styles.credLink}>
            Oura Developer Dashboard ↗
          </a>{' '}
          and create a new app (any name).
        </li>
        <li>
          In that app, add this <strong>Redirect URI</strong> exactly:
          <div className={styles.credUriRow}>
            <input className={styles.credUri} value={redirectUri} readOnly onFocus={(e) => e.currentTarget.select()} />
            <button type="button" onClick={copyRedirect} className="btn btn-ghost">
              {copied ? 'copied' : 'copy'}
            </button>
          </div>
        </li>
        <li>Copy the app&rsquo;s <strong>Client ID</strong> and <strong>Client Secret</strong> and paste them below.</li>
      </ol>

      <form onSubmit={onSubmit} className={styles.credForm}>
        <label className={styles.credLabel}>
          Client ID
          <input
            className={styles.credInput}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. 1a2b3c4d-…"
          />
        </label>
        <label className={styles.credLabel}>
          Client Secret
          <input
            className={styles.credInput}
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="paste your secret"
          />
        </label>
        {error && <p className={styles.credError}>{error}</p>}
        <button type="submit" disabled={saving} className={`btn btn-primary ${styles.connectCta}`}>
          {saving ? 'saving…' : 'Save & connect'}
        </button>
      </form>

      <p className={styles.connectSub}>
        Your keys are stored server-side and used only to talk to Oura on your behalf.
        We never see your Oura password, and you can disconnect anytime.
      </p>
    </section>
  )
}

function NoDataPanel({
  syncing,
  onSync,
  onDisconnect,
}: {
  syncing: boolean
  onSync: () => void
  onDisconnect: () => void
}) {
  return (
    <section className={styles.connectPanel}>
      <p className={styles.connectIntro}>
        Connected, but no data has synced yet. Hit <em>sync now</em> below. Your last 24h
        of recovery, sleep, and strain will populate on the next refresh.
      </p>
      <div className={styles.footerActions} style={{ marginTop: '1rem' }}>
        <button onClick={onSync} disabled={syncing} className="btn btn-primary">
          {syncing ? 'syncing…' : 'sync now'}
        </button>
        <button onClick={onDisconnect} className="btn btn-link">disconnect</button>
      </div>
    </section>
  )
}

function VitalityScoreBadge({ score, tier }: { score: number; tier: string }) {
  return (
    <aside className={styles.scoreBadge} aria-label="Vitality Score">
      <div className={styles.scoreNumber}>{score}</div>
      <div className={styles.scoreCol}>
        <div className={styles.scoreLabel}>Vitality Score</div>
        <div className={styles.scoreTier}>{tier}</div>
      </div>
    </aside>
  )
}

function DataPanel({
  d,
  syncing,
  onSync,
  onDisconnect,
}: {
  d: OuraData
  syncing: boolean
  onSync: () => void
  onDisconnect: () => void
}) {
  const tone = recoveryTone(d.recovery)
  const hrvDelta = d.hrv != null && d.hrvBaseline != null ? Math.round(d.hrv - d.hrvBaseline) : null
  const rhrDelta = d.rhr != null && d.rhrBaseline != null ? Math.round(d.rhr - d.rhrBaseline) : null
  const sleepDelta =
    d.sleepPerf != null && d.sleepPerfBaseline != null
      ? Math.round((d.sleepPerf - d.sleepPerfBaseline) * 10) / 10
      : null
  const debtTotalMin = d.sleepDebt7d.reduce((acc, x) => acc + (x.hours - d.sleepTargetHours), 0) * 60

  return (
    <section className={styles.panel}>
      <RecoveryHero tone={tone} recovery={d.recovery} trend={d.recoveryTrend} />

      <div className={styles.grid}>
        <Stat
          label="Sleep"
          value={formatHM(d.sleepHours)}
          sub={d.sleepPerf != null ? `${Math.round(d.sleepPerf)}% efficiency` : '—'}
          delta={
            sleepDelta != null
              ? sleepDelta >= 0
                ? `↗ +${sleepDelta}%`
                : `↘ ${sleepDelta}%`
              : undefined
          }
          deltaTone={sleepDelta != null && sleepDelta >= 0 ? 'good' : 'watch'}
        />
        <Stat
          label="Strain"
          value={d.strain != null ? d.strain.toFixed(1) : '—'}
          sub="today"
          delta={d.strainWeeklyAvg != null ? `wk avg ${d.strainWeeklyAvg.toFixed(1)}` : undefined}
          deltaTone={d.strainWeeklyAvg != null && d.strain != null && d.strain > d.strainWeeklyAvg + 1 ? 'watch' : 'neutral'}
        />
        <Stat
          label="HRV"
          value={d.hrv != null ? String(Math.round(d.hrv)) : '—'}
          unit="ms"
          sub={d.hrvAnomalous ? 'reading flagged' : 'rmssd'}
          delta={
            hrvDelta != null
              ? hrvDelta >= 0
                ? `↑ +${hrvDelta} ms`
                : `↓ ${hrvDelta} ms`
              : undefined
          }
          deltaTone={hrvDelta != null && hrvDelta >= 0 ? 'good' : 'watch'}
        />
        <Stat
          label="RHR"
          value={d.rhr != null ? String(Math.round(d.rhr)) : '—'}
          unit="bpm"
          sub="resting"
          delta={
            rhrDelta != null
              ? rhrDelta <= 0
                ? `↓ ${rhrDelta} bpm`
                : `↑ +${rhrDelta} bpm`
              : undefined
          }
          deltaTone={rhrDelta != null && rhrDelta <= 0 ? 'good' : 'watch'}
        />
      </div>

      {d.sleepDebt7d.length > 0 && (
        <SleepDebtCard nights={d.sleepDebt7d} target={d.sleepTargetHours} totalMinutes={debtTotalMin} />
      )}

      <CoachCard d={d} />

      <div className={styles.footer}>
        <div className={styles.legend}>
          <span className={styles.legendDot} data-tone="good" /> Good
          <span className={styles.legendDot} data-tone="watch" /> Watch
          <span className={styles.legendDot} data-tone="low" /> Low
        </div>
        <div className={styles.footerActions}>
          <span className={styles.synced}>
            {d.lastSyncedMinutes != null ? `last synced ${d.lastSyncedMinutes}m ago` : 'sync time unknown'}
          </span>
          <button onClick={onSync} disabled={syncing} className="btn btn-ghost">
            {syncing ? 'syncing…' : 'sync now'}
          </button>
          <button onClick={onDisconnect} className="btn btn-link">disconnect</button>
        </div>
      </div>
    </section>
  )
}

function RecoveryHero({
  tone,
  recovery,
  trend,
}: {
  tone: 'good' | 'watch' | 'low' | 'muted'
  recovery: number | null
  trend: number[]
}) {
  const r = recovery
  const hasTrend = trend.length >= 2
  const min = hasTrend ? Math.min(...trend) : 0
  const max = hasTrend ? Math.max(...trend) : 100
  const range = Math.max(1, max - min)
  const w = 220
  const h = 60
  const stepX = hasTrend ? w / (trend.length - 1) : 0
  const pts = trend
    .map((v, i) => {
      const x = i * stepX
      const y = h - ((v - min) / range) * h * 0.85 - h * 0.075
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const trendDelta = hasTrend ? trend[trend.length - 1] - trend[0] : 0
  const recoveryTier = r != null
    ? r >= 67 ? 'Recovered' : r >= 34 ? 'Building' : 'Drained'
    : '—'

  return (
    <div className={styles.heroCard} data-tone={tone}>
      <div className={styles.recoveryWrap}>
        <div className={styles.recoveryRing} data-tone={tone}>
          <svg viewBox="0 0 200 200" className={styles.ringSvg} aria-hidden="true">
            <circle cx="100" cy="100" r="92" className={styles.ringTrack} />
            {r != null && (
              <circle
                cx="100"
                cy="100"
                r="92"
                className={styles.ringFill}
                style={{
                  strokeDasharray: `${2 * Math.PI * 92}`,
                  strokeDashoffset: `${2 * Math.PI * 92 * (1 - r / 100)}`,
                }}
              />
            )}
          </svg>
          <div className={styles.recoveryInner}>
            <div className={styles.recoveryValue}>{r != null ? Math.round(r) : '—'}</div>
            <div className={styles.recoveryUnit}>{r != null ? '%' : ''}</div>
            <div className={styles.recoveryLabel}>Recovery</div>
            <div className={styles.recoveryTier}>{recoveryTier}</div>
          </div>
        </div>
      </div>

      <div className={styles.trendWrap}>
        <div className={styles.trendHead}>
          <span className={styles.serifTitle}>{trend.length}-day trend</span>
          {hasTrend && (
            <span className={`${styles.trendDelta} ${trendDelta >= 0 ? styles.trendUp : styles.trendDown}`}>
              {trendDelta >= 0 ? '↑' : '↓'} {Math.abs(Math.round(trendDelta))}
            </span>
          )}
        </div>
        {hasTrend ? (
          <svg viewBox={`0 0 ${w} ${h}`} className={styles.trendSvg} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--mint)" stopOpacity="0.32" />
                <stop offset="100%" stopColor="var(--mint)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polyline className={styles.trendArea} points={`0,${h} ${pts} ${w},${h}`} fill="url(#trendFill)" />
            <polyline className={styles.trendLine} points={pts} />
            {trend.map((v, i) => {
              const x = i * stepX
              const y = h - ((v - min) / range) * h * 0.85 - h * 0.075
              const isLast = i === trend.length - 1
              return <circle key={i} cx={x} cy={y} r={isLast ? 3.2 : 1.6} className={isLast ? styles.trendDotLast : styles.trendDot} />
            })}
          </svg>
        ) : (
          <div style={{ color: 'var(--muted)', fontSize: '13px' }}>
            Need a few more days of data for the trend.
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  unit,
  sub,
  delta,
  deltaTone,
}: {
  label: string
  value: string
  unit?: string
  sub: string
  delta?: string
  deltaTone?: 'good' | 'watch' | 'low' | 'neutral'
}) {
  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValueRow}>
        <span className={styles.statValue}>{value}</span>
        {unit && <span className={styles.statUnit}>{unit}</span>}
      </div>
      <div className={styles.statSub}>{sub}</div>
      {delta && <div className={styles.statDelta} data-tone={deltaTone}>{delta}</div>}
    </div>
  )
}

function SleepDebtCard({
  nights,
  target,
  totalMinutes,
}: {
  nights: { day: string; hours: number }[]
  target: number
  totalMinutes: number
}) {
  const maxAbs = 1.5
  return (
    <div className={styles.debtCard}>
      <div className={styles.cardHead}>
        <span className={styles.serifTitle}>Sleep debt</span>
        <span className={styles.debtTotal} data-tone={totalMinutes < 0 ? 'watch' : 'good'}>
          {formatDebt(Math.round(totalMinutes))} <em>last {nights.length} nights</em>
        </span>
      </div>
      <div className={styles.debtBars}>
        {nights.map((d, i) => {
          const delta = d.hours - target
          const pct = Math.min(Math.abs(delta) / maxAbs, 1) * 100
          const surplus = delta >= 0
          return (
            <div key={`${d.day}-${i}`} className={styles.debtCol}>
              <div className={styles.debtTrack}>
                <div className={styles.debtBaseline} />
                {surplus ? (
                  <div
                    className={styles.debtBarSurplus}
                    style={{ height: `${pct}%` }}
                    title={`${d.day}: ${d.hours.toFixed(1)}h (+${delta.toFixed(1)}h)`}
                  />
                ) : (
                  <div
                    className={styles.debtBarDeficit}
                    style={{ height: `${pct}%` }}
                    title={`${d.day}: ${d.hours.toFixed(1)}h (${delta.toFixed(1)}h)`}
                  />
                )}
              </div>
              <div className={styles.debtLabel}>{d.day}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Data-driven coach: each card only fires when its underlying signal is
 * present. Falls back to a single "keep collecting data" line when nothing
 * has crossed a threshold.
 */
function CoachCard({ d }: { d: OuraData }) {
  const tips: { strong: string; rest: string }[] = []

  if (d.hrv != null && d.hrvBaseline != null && !d.hrvAnomalous) {
    const delta = Math.round(d.hrv - d.hrvBaseline)
    if (delta <= -5) {
      tips.push({
        strong: `Your HRV is ${Math.round(d.hrv)}ms, ${Math.abs(delta)}ms under your ${Math.round(d.hrvBaseline)}ms baseline.`,
        rest: ' Aim for 8h sleep tonight and skip caffeine after 2pm. HRV usually rebounds inside 48h once the inputs reset.',
      })
    } else if (delta >= 5) {
      tips.push({
        strong: `HRV is ${Math.round(d.hrv)}ms, ${delta}ms above baseline.`,
        rest: ' Strong recovery signal. This is a green-light day to push the hardest session.',
      })
    }
  }

  if (d.strain != null && d.strainWeeklyAvg != null && d.strain > d.strainWeeklyAvg + 2) {
    tips.push({
      strong: `Strain ${d.strain.toFixed(1)} today, above your ${d.strainWeeklyAvg.toFixed(1)} weekly avg.`,
      rest: ' One recovery day (Z2 only, target under 10 strain) lets HRV climb back without sacrificing the block.',
    })
  }

  if (d.sleepDebt7d.length > 0) {
    const debtMin = d.sleepDebt7d.reduce((acc, x) => acc + (x.hours - d.sleepTargetHours), 0) * 60
    if (debtMin < -90) {
      tips.push({
        strong: `Sleep debt ${formatDebt(Math.round(debtMin))} across the week.`,
        rest: ' Add 30 minutes tonight to stay ahead of the cognitive cost. The cheapest training intervention you can make is going to bed earlier.',
      })
    }
  }

  if (d.recovery != null && d.recovery < 34) {
    tips.unshift({
      strong: `Recovery ${Math.round(d.recovery)}%. Your ceiling is lower today.`,
      rest: ' Cut caffeine ~30% and skip a second hard session. Trying to brute-force a red day costs you tomorrow.',
    })
  } else if (d.recovery != null && d.recovery >= 80) {
    tips.unshift({
      strong: `Recovery ${Math.round(d.recovery)}%. Green light to push.`,
      rest: ' Stack the hardest training or cognitive session inside the peak window.',
    })
  }

  if (tips.length === 0) {
    tips.push({
      strong: 'Building your baseline.',
      rest: ` Need 7+ days of valid readings before personalized coaching kicks in. You're at ${d.daysAvailable} now.`,
    })
  }

  return (
    <div className={styles.coachCard}>
      <div className={styles.cardHead}>
        <span className={styles.serifTitle}>How to improve today</span>
      </div>
      <ul className={styles.coachList}>
        {tips.slice(0, 3).map((t, i) => (
          <li key={i}>
            <span className={styles.coachMark} aria-hidden>✦</span>
            <div>
              <strong>{t.strong}</strong>
              <span>{t.rest}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
