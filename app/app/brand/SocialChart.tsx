'use client'

import { useMemo, useRef, useState } from 'react'
import sc from '../vitals/scoreHistory.module.css'
import bs from './brand.module.css'
import type { BrandUpload } from './types'

/**
 * SocialChart — the big "see everything" graph for the Social Command Center.
 *
 * Mirrors the Vitals ScoreHistory chart (range toggle, scrub tag, trend / best
 * / logged, area+line) so the social view feels like the rest of Vitality, but
 * driven by saved social_snapshots. Pick any platform and any metric; every
 * data point a snapshot holds is plottable. Auto-renders from whatever the
 * parent loaded on open (the Command Center re-fetches snapshots on mount).
 */

type MetricKey =
  | 'followers' | 'views' | 'reach' | 'engagement_rate'
  | 'likes' | 'comments' | 'saves' | 'shares' | 'pct_non_followers' | 'follows'

export interface Snap {
  platform: string
  captured_at: string
  followers: number | null
  views: number | null
  reach: number | null
  pct_non_followers: number | null
  likes: number | null
  comments: number | null
  saves: number | null
  shares: number | null
  follows: number | null
  engagement_rate: number | null
}

const METRICS: { key: MetricKey; label: string; pct?: boolean }[] = [
  { key: 'followers', label: 'Followers' },
  { key: 'views', label: 'Views' },
  { key: 'reach', label: 'Reach' },
  { key: 'engagement_rate', label: 'Engagement', pct: true },
  { key: 'pct_non_followers', label: 'Non-followers', pct: true },
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Comments' },
  { key: 'saves', label: 'Saves' },
  { key: 'shares', label: 'Shares' },
  { key: 'follows', label: 'Follows' },
]

const WINS = [
  { k: '7', label: '7D', n: 7 },
  { k: '30', label: '30D', n: 30 },
  { k: '90', label: '3M', n: 90 },
  { k: 'all', label: 'All', n: Infinity },
]
const RANGE_LABEL: Record<string, string> = { '7': '7 days', '30': '30 days', '90': '3 months', all: 'all time' }

const GW = 320, GH = 88, GP = 12

function fmtDay(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  if (!y || !m || !day) return d
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
function fmtCompact(n: number) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}
function fmtVal(v: number, pct?: boolean) {
  return pct ? `${Math.round(v * 10) / 10}%` : fmtCompact(v)
}
function fmtSigned(v: number, pct?: boolean) {
  const s = fmtVal(Math.abs(v), pct)
  return v > 0 ? `▲ +${s}` : v < 0 ? `▼ ${s}` : `— ${s}`
}

export default function SocialChart({ snapshots, uploads }: { snapshots: Snap[]; uploads?: BrandUpload[] }) {
  const platforms = useMemo(
    () => Array.from(new Set(snapshots.map((s) => s.platform))),
    [snapshots],
  )
  const [platform, setPlatform] = useState('')
  const [metricKey, setMetricKey] = useState<MetricKey>('followers')
  const [winK, setWinK] = useState('30')
  const [scrub, setScrub] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const activePlatform = platforms.includes(platform) ? platform : (platforms[0] ?? '')
  const metric = METRICS.find((m) => m.key === metricKey)!

  const rows = useMemo(
    () => snapshots
      .filter((s) => s.platform === activePlatform)
      .sort((a, b) => (a.captured_at < b.captured_at ? -1 : 1)),
    [snapshots, activePlatform],
  )

  const n = WINS.find((w) => w.k === winK)!.n
  const windowed = n === Infinity ? rows : rows.slice(-n)
  const pts = windowed
    .map((r) => ({ date: r.captured_at.slice(0, 10), v: r[metricKey] }))
    .filter((p): p is { date: string; v: number } => typeof p.v === 'number' && Number.isFinite(p.v))

  const vals = pts.map((p) => p.v)
  const mn = vals.length ? Math.min(...vals) : 0
  const mx = vals.length ? Math.max(...vals) : 1
  const pad = (mx - mn) * 0.12 || Math.max(1, Math.abs(mx) * 0.1)
  const lo = metric.pct ? Math.max(0, mn - pad) : Math.max(0, mn - pad)
  const hi = Math.max(lo + 1, mx + pad)
  const mid = (lo + hi) / 2

  const xF = (i: number) => (pts.length < 2 ? GW / 2 : GP + (GW - 2 * GP) * (i / (pts.length - 1)))
  const yF = (v: number) => GP + (GH - 2 * GP) * (1 - (v - lo) / (hi - lo || 1))
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${xF(i).toFixed(1)} ${yF(p.v).toFixed(1)}`).join(' ')
  const areaD = pts.length ? `${line} L${xF(pts.length - 1).toFixed(1)} ${GH} L${xF(0).toFixed(1)} ${GH} Z` : ''

  const latest = pts.length ? pts[pts.length - 1].v : null
  const best = pts.length ? mx : 0
  const trend = pts.length > 1 ? pts[pts.length - 1].v - pts[0].v : 0

  // Upload markers — overlay each shipped piece on the timeline, colored by how
  // the *currently-viewed* metric moved right after it posted. A manual rating
  // wins; otherwise auto: lifted → green, flat → amber, dipped → red. This is
  // the "see how the timing of an upload impacts the graph" view.
  const markers = (() => {
    if (pts.length < 2 || !uploads?.length) return [] as { x: number; color: string; label: string; verdict: string }[]
    const canon = (p: string) => (p === 'youtube_long' ? 'youtube' : p)
    const ap = canon(activePlatform)
    const days = pts.map((p) => Date.parse(p.date))
    const span = (hi - lo) || 1
    const out: { x: number; color: string; label: string; verdict: string }[] = []
    for (const u of uploads) {
      if (canon(u.platform) !== ap) continue
      const t = Date.parse(u.postedAt.slice(0, 10))
      if (Number.isNaN(t)) continue
      let idx = -1, bestD = Infinity
      for (let i = 0; i < days.length; i++) {
        const d = Math.abs(days[i] - t)
        if (d < bestD) { bestD = d; idx = i }
      }
      if (idx < 0 || bestD > 3 * 86_400_000) continue // outside the visible window
      const after = pts[Math.min(idx + 2, pts.length - 1)].v
      const rel = (after - pts[idx].v) / span
      const rating = u.rating ?? (rel > 0.02 ? 'green' : rel < -0.02 ? 'red' : 'yellow')
      const color = rating === 'green' ? 'var(--mint)' : rating === 'red' ? 'var(--red)' : 'var(--amber)'
      const verdict = rating === 'green' ? 'lifted' : rating === 'red' ? 'dipped' : 'flat'
      out.push({ x: xF(idx), color, label: u.title || 'Upload', verdict })
    }
    return out
  })()

  const activeI = scrub != null ? scrub : pts.length - 1
  const cur = pts[activeI]
  const prev = activeI > 0 ? pts[activeI - 1] : null
  const delta = cur && prev ? cur.v - prev.v : null

  const onMove = (clientX: number) => {
    const el = ref.current
    if (!el || pts.length < 2) return
    const r = el.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    setScrub(Math.round(f * (pts.length - 1)))
  }

  const showTag = scrub != null && cur != null
  const tagLeft = cur ? Math.max(13, Math.min(87, (xF(activeI) / GW) * 100)) : 50

  return (
    <div className={sc.card}>
      <div className={sc.top}>
        <div className={sc.lead}>
          <span className={sc.eyb}>Latest</span>
          <span className={sc.big}>{latest == null ? '—' : fmtVal(latest, metric.pct)}</span>
          <span className={sc.sub}>{metric.label.toLowerCase()} · <b>{RANGE_LABEL[winK]}</b></span>
        </div>
        <div className={sc.range}>
          {WINS.map((w) => (
            <button key={w.k} type="button" className={winK === w.k ? sc.on : ''} onClick={() => { setWinK(w.k); setScrub(null) }}>{w.label}</button>
          ))}
        </div>
      </div>

      {/* platform + metric switchers — see every metric we hold */}
      {platforms.length > 1 && (
        <div className={bs.scPills}>
          {platforms.map((p) => (
            <button key={p} type="button" className={p === activePlatform ? bs.scPillActive : bs.scPill} onClick={() => { setPlatform(p); setScrub(null) }}>{p}</button>
          ))}
        </div>
      )}
      <div className={bs.scPills}>
        <select
          className={bs.scSelect}
          value={metricKey}
          onChange={(e) => { setMetricKey(e.target.value as MetricKey); setScrub(null) }}
          aria-label="Metric"
        >
          {METRICS.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
      </div>

      {pts.length < 2 ? (
        <div className={sc.empty}>Paste a couple more snapshots and your {metric.label.toLowerCase()} line starts here.</div>
      ) : (
        <>
          <div
            className={sc.graph}
            ref={ref}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onMove(e.clientX) }}
            onPointerMove={(e) => { if (e.buttons || e.pointerType === 'mouse') onMove(e.clientX) }}
            onPointerLeave={() => setScrub(null)}
            onPointerUp={() => setScrub(null)}
          >
            <svg viewBox="0 0 320 88" preserveAspectRatio="none">
              <defs>
                <linearGradient id="socg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[hi, mid, lo].map((v) => (
                <line key={v} x1="0" y1={yF(v).toFixed(1)} x2="320" y2={yF(v).toFixed(1)} stroke="rgba(255,255,255,.07)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              ))}
              <path d={areaD} fill="url(#socg)" />
              <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              {markers.map((m, k) => (
                <line key={`ml-${k}`} x1={m.x.toFixed(1)} y1="0" x2={m.x.toFixed(1)} y2={GH} stroke={m.color} strokeWidth="1.5" strokeDasharray="2 3" strokeOpacity="0.55" vectorEffect="non-scaling-stroke" />
              ))}
            </svg>
            {[hi, mid, lo].map((v) => (
              <span key={v} className={sc.gridLabel} style={{ top: `${(yF(v) / GH) * 100}%` }}>{fmtVal(v, metric.pct)}</span>
            ))}
            <span className={sc.scrubLine} style={{ left: `${(xF(activeI) / GW) * 100}%`, opacity: showTag ? 1 : 0 }} />
            {cur && (
              <span className={sc.scrubDot} style={{ left: `${(xF(activeI) / GW) * 100}%`, top: `${(yF(cur.v) / GH) * 100}%`, background: 'var(--accent)' }} />
            )}
            {cur && (
              <span className={`${sc.scrubTag} ${showTag ? sc.show : ''}`} style={{ left: `${tagLeft}%`, top: `${(yF(cur.v) / GH) * 100}%` }}>
                <span className={sc.stDate}>{fmtDay(cur.date)}</span>
                <span className={sc.stRow}>
                  <span className={sc.stScore} style={{ color: 'var(--accent)' }}>{fmtVal(cur.v, metric.pct)}</span>
                </span>
                {delta != null && (
                  <span className={sc.stDelta} style={{ color: delta > 0 ? 'var(--accent)' : delta < 0 ? 'var(--amber)' : 'var(--muted)' }}>
                    {fmtSigned(delta, metric.pct)} from last
                  </span>
                )}
              </span>
            )}
            {markers.map((m, k) => (
              <span key={`md-${k}`} className={bs.chartMarker} title={`${m.label} · ${m.verdict}`} style={{ left: `${(m.x / GW) * 100}%`, background: m.color }} />
            ))}
          </div>

          {markers.length > 0 && (
            <div className={bs.uploadLegend}>
              <span><i style={{ background: 'var(--mint)' }} /> lifted</span>
              <span><i style={{ background: 'var(--amber)' }} /> flat</span>
              <span><i style={{ background: 'var(--red)' }} /> dipped</span>
              <span className={bs.uploadLegendNote}>● marks your uploads</span>
            </div>
          )}

          <div className={sc.stats}>
            <div className={sc.stat}><span className={sc.lbl}>Trend</span><span className={sc.val} style={{ color: trend > 0 ? 'var(--accent)' : trend < 0 ? 'var(--amber)' : 'var(--muted-strong)' }}>{fmtSigned(trend, metric.pct)}</span></div>
            <div className={sc.stat}><span className={sc.lbl}>Best</span><span className={sc.val} style={{ color: 'var(--mint)' }}>{fmtVal(best, metric.pct)}</span></div>
            <div className={sc.stat}><span className={sc.lbl}>Logged</span><span className={sc.val}>{pts.length}{n === Infinity ? '' : ` / ${n}`}</span></div>
          </div>
        </>
      )}
    </div>
  )
}
