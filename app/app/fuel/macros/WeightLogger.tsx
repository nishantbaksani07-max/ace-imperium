'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { computeTrendRate } from '@/lib/nutrition/adaptive'
import { kgToDisplay, displayToKg, unitLabel, type Units } from '@/lib/units'
import { getLocalDateKey } from '@/lib/dates'
import { saveWeight, listProgressPhotos, saveProgressPhoto, deleteProgressPhoto, updateProgressPhotoNote, type ProgressPhotoRow } from './actions'
import { makeProgressPhoto } from './image'
import VitalityIcon from '@/components/VitalityIcon'
import type { WeightEntry } from './serialize'
import WeightImportSheet from './WeightImportSheet'
import styles from '../fuelSections.module.css'

interface Props {
  /** Newest-first, as loaded by the Fuel page (public.weights). */
  initialWeights: WeightEntry[]
  units: Units
}

const Eyebrow = (
  <div className={styles.wlEy}>
    <span className={styles.wlEyNum}>·03</span>
    <span className={styles.wlEyTitle}>Weight</span>
    <span className={styles.wlEyRule} />
  </div>
)

// timeframe toggle (matches the Vitals Score History system)
type RangeId = '7' | '30' | '90' | 'all'
const RANGES: { id: RangeId; label: string; days: number; word: string }[] = [
  { id: '7', label: '7D', days: 7, word: '7 day' },
  { id: '30', label: '30D', days: 30, word: '30 day' },
  { id: '90', label: '3M', days: 90, word: '3 month' },
  { id: 'all', label: 'ALL', days: 100000, word: 'all time' },
]

/** Smooth (Catmull-Rom -> cubic bezier) so the glow line reads as a calm trend,
 *  not a jagged daily plot. Points are already 7-day-smoothed upstream. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`
  let d = `M${pts[0].x},${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
  }
  return d
}

/** Consecutive morning weigh-ins ending today or yesterday. */
function computeStreak(weights: WeightEntry[]): number {
  if (weights.length === 0) return 0
  const days = new Set(weights.map((w) => w.dayKey))
  const today = getLocalDateKey()
  const cursor = new Date()
  // allow the streak to be "alive" if they logged today OR yesterday
  if (!days.has(today)) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  for (;;) {
    if (!days.has(getLocalDateKey(cursor))) break
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

const ArrowGlyph = ({ down }: { down: boolean }) => (
  <svg viewBox="0 0 24 24" style={down ? undefined : { transform: 'rotate(180deg)' }}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </svg>
)

const FlameGlyph = () => (
  <svg viewBox="0 0 24 24">
    <path d="M12 3c1 3-1 4-1 6a3 3 0 0 0 6 0c0-1 0-2-1-3 2 1 4 4 4 7a8 8 0 0 1-16 0c0-4 4-6 5-10 1 1 3 2 4 3z" />
  </svg>
)

export default function WeightLogger({ initialWeights, units }: Props) {
  const router = useRouter()
  const [weights, setWeights] = useState<WeightEntry[]>(initialWeights)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<RangeId>('30')
  const [showImport, setShowImport] = useState(false)
  const [imported, setImported] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const unit = unitLabel(units)
  const todayKey = getLocalDateKey()
  const latest = weights[0] ?? null
  const loggedToday = latest?.dayKey === todayKey

  // ── progress photos (durable, per-user) ──
  const [photos, setPhotos] = useState<ProgressPhotoRow[]>([])
  const [viewer, setViewer] = useState<ProgressPhotoRow | null>(null)
  const [uploading, setUploading] = useState(false)
  const [photoErr, setPhotoErr] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const photoInput = useRef<HTMLInputElement>(null)
  useEffect(() => { listProgressPhotos().then(setPhotos).catch(() => {}) }, [])

  function openViewer(p: ProgressPhotoRow) {
    setViewer(p)
    setNoteDraft(p.note ?? '')
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotoErr(null)
    setUploading(true)
    try {
      const image = await makeProgressPhoto(file)
      if (!image) { setPhotoErr('Could not read that photo. Try a different one.'); return }
      // Hard timeout so the upload can never hang the spinner forever (e.g. an
      // old cached build). After 20s we fail loud with a fix.
      const timeout = new Promise<{ ok: false; error: string }>((resolve) =>
        setTimeout(() => resolve({ ok: false, error: 'That is taking too long. If you are on the desktop app, click "Relaunch to update" at the top, then try again.' }), 20000),
      )
      const res = await Promise.race([
        saveProgressPhoto({ dayKey: todayKey, image, weightKg: latest?.kg ?? null }),
        timeout,
      ])
      if (res.ok) setPhotos((prev) => [res.data, ...prev])
      else setPhotoErr(res.error || 'Could not save your photo. Please try again.')
    } catch {
      setPhotoErr('Something went wrong adding that photo. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  async function saveNote() {
    if (!viewer) return
    setSavingNote(true)
    const note = noteDraft.trim()
    const res = await updateProgressPhotoNote(viewer.id, note)
    setSavingNote(false)
    if (res.ok) {
      setPhotos((prev) => prev.map((p) => (p.id === viewer.id ? { ...p, note: note || null } : p)))
      setViewer((v) => (v ? { ...v, note: note || null } : v))
    }
  }

  async function removePhoto(id: string) {
    const prev = photos
    setPhotos((p) => p.filter((x) => x.id !== id))
    setViewer(null)
    const res = await deleteProgressPhoto(id)
    if (!res.ok) setPhotos(prev)
  }

  function photoDate(p: ProgressPhotoRow): string {
    const [y, m, d] = p.dayKey.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  function photoDateLong(p: ProgressPhotoRow): string {
    const [y, m, d] = p.dayKey.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
  }

  const weighIns = useMemo(
    () => weights.map((w) => ({ date: w.dayKey, weightKg: w.kg })),
    [weights],
  )
  const smoothed = useMemo(() => computeTrendRate(weighIns).smoothed, [weighIns])
  const streak = useMemo(() => computeStreak(weights), [weights])

  // 7-day move off the smoothed line (warm, never red; arrow follows the data)
  const trend = useMemo(() => {
    if (smoothed.length < 2) return null
    const last = smoothed[smoothed.length - 1]
    const parse = (k: string) => {
      const [y, m, d] = k.split('-').map(Number)
      return new Date(y, m - 1, d).getTime()
    }
    const lastT = parse(last.date)
    // nearest smoothed point at/just before 7 days ago
    let ref = smoothed[0]
    for (const p of smoothed) {
      if (lastT - parse(p.date) >= 6 * 86_400_000) ref = p
    }
    const deltaKg = last.avgKg - ref.avgKg
    if (Math.abs(deltaKg) < 0.05) return null
    const deltaDisp = Math.abs(kgToDisplay(last.avgKg, units) - kgToDisplay(ref.avgKg, units))
    return { down: deltaKg < 0, amount: deltaDisp }
  }, [smoothed, units])

  const rangeDef = RANGES.find((r) => r.id === range)!

  // smoothed points within the selected timeframe
  const windowed = useMemo(() => {
    if (smoothed.length === 0) return []
    const parse = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime() }
    const last = parse(smoothed[smoothed.length - 1].date)
    const cutoff = last - rangeDef.days * 86_400_000
    return smoothed.filter((p) => parse(p.date) >= cutoff)
  }, [smoothed, rangeDef.days])

  // header + stats-row numbers for the windowed data
  const stats = useMemo(() => {
    if (windowed.length === 0) return null
    const ys = windowed.map((p) => p.avgKg)
    const avgKg = ys.reduce((a, b) => a + b, 0) / ys.length
    const changeKg = windowed[windowed.length - 1].avgKg - windowed[0].avgKg
    const changeDisp = Math.abs(kgToDisplay(windowed[windowed.length - 1].avgKg, units) - kgToDisplay(windowed[0].avgKg, units))
    const parse = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime() }
    const last = parse(smoothed[smoothed.length - 1].date)
    const cutoff = last - rangeDef.days * 86_400_000
    const logged = weights.filter((w) => parse(w.dayKey) >= cutoff).length
    const windowDays = range === 'all'
      ? Math.max(1, Math.round((last - parse(weights[weights.length - 1]?.dayKey ?? smoothed[0].date)) / 86_400_000) + 1)
      : rangeDef.days
    return {
      avgDisp: kgToDisplay(avgKg, units).toFixed(1),
      changeDisp: changeDisp.toFixed(1),
      changeDown: changeKg < 0,
      flat: Math.abs(changeKg) < 0.05,
      logged,
      windowDays,
    }
  }, [windowed, smoothed, weights, units, range, rangeDef.days])

  // chart geometry — ALWAYS returns a chart so the section always reads as a
  // weight grapher. With <2 windowed points we draw a ghosted sample trend.
  const chart = useMemo(() => {
    const W = 660
    const H = 200
    const padTop = 14
    const padBot = 26
    const padX = 6

    if (windowed.length < 2) {
      const sample = [0.6, 0.64, 0.57, 0.62, 0.52, 0.56, 0.47, 0.5, 0.42, 0.46, 0.38]
      const pts = sample.map((v, i) => ({
        x: padX + (i / (sample.length - 1)) * (W - padX * 2),
        y: padTop + (1 - v) * (H - padTop - padBot),
      }))
      const line = smoothPath(pts)
      const fill = `${line} L${pts[pts.length - 1].x.toFixed(1)},${H} L${pts[0].x.toFixed(1)},${H} Z`
      const grid = [padTop, padTop + (H - padTop - padBot) / 2, H - padBot]
      return { W, H, line, fill, end: pts[pts.length - 1], grid, demo: true, hi: '', mid: '', lo: '' }
    }

    const ys = windowed.map((p) => p.avgKg)
    const dataLo = Math.min(...ys)
    const dataHi = Math.max(...ys)
    const mid = (dataLo + dataHi) / 2
    // Floor the visible band so a near-flat trend reads as a calm flat line, not a
    // dramatic cliff from auto-scaling a sub-kg wobble to the full chart height
    // (the old `hi - lo || 1` made a 0.1 kg week look like a 10 kg drop, and all
    // three axis labels rounded to the same number). The band is centered on the
    // data's midpoint and only grows past the floor when the real range does.
    const MIN_SPAN_KG = 3
    const span = Math.max(dataHi - dataLo, MIN_SPAN_KG)
    const bot = mid - span / 2
    const pts = windowed.map((p, i) => ({
      x: padX + (i / (windowed.length - 1)) * (W - padX * 2),
      y: padTop + (1 - (p.avgKg - bot) / span) * (H - padTop - padBot),
    }))
    const line = smoothPath(pts)
    const fill = `${line} L${pts[pts.length - 1].x.toFixed(1)},${H} L${pts[0].x.toFixed(1)},${H} Z`
    const grid = [padTop, padTop + (H - padTop - padBot) / 2, H - padBot]
    return {
      W, H, line, fill, end: pts[pts.length - 1], grid, demo: false,
      hi: kgToDisplay(mid + span / 2, units).toFixed(1),
      mid: kgToDisplay(mid, units).toFixed(1),
      lo: kgToDisplay(mid - span / 2, units).toFixed(1),
    }
  }, [windowed, units])

  function beginLog() {
    setError(null)
    setDraft(latest ? String(kgToDisplay(latest.kg, units)) : '')
    setEditing(true)
  }

  // Open the logger when another section (e.g. the Maintenance nudge) asks for
  // it. A ref keeps the handler stable while always calling the latest beginLog.
  const beginLogRef = useRef(beginLog)
  beginLogRef.current = beginLog
  useEffect(() => {
    const open = () => beginLogRef.current()
    window.addEventListener('vitality:log-weight', open)
    return () => window.removeEventListener('vitality:log-weight', open)
  }, [])

  function save() {
    const value = parseFloat(draft)
    if (!Number.isFinite(value) || value <= 0 || value > 1000) {
      setError('Enter a real number.')
      return
    }
    const kg = displayToKg(value, units)
    setError(null)
    setEditing(false)

    const prev = weights
    const optimistic: WeightEntry = { dayKey: todayKey, kg, loggedAt: new Date().toISOString() }
    setWeights([optimistic, ...prev.filter((w) => w.dayKey !== todayKey)])

    startTransition(async () => {
      const res = await saveWeight(todayKey, kg)
      if (!res.ok) {
        setWeights(prev)
        setError('Could not save. Try again.')
        return
      }
      // let the maintenance coach / Vitals pick up the new weigh-in
      router.refresh()
    })
  }

  // Imported history merges in fill-gaps-only (never clobbers a logged day),
  // then refresh so the maintenance coach + Vitals pick up the new trend.
  function handleImported(entries: { dayKey: string; kg: number }[], saved: number) {
    setShowImport(false)
    setError(null)
    setWeights((prev) => {
      const have = new Set(prev.map((w) => w.dayKey))
      const nowIso = new Date().toISOString()
      const added: WeightEntry[] = entries
        .filter((e) => !have.has(e.dayKey))
        .map((e) => ({ dayKey: e.dayKey, kg: e.kg, loggedAt: nowIso }))
      if (added.length === 0) return prev
      return [...prev, ...added].sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1))
    })
    setImported(
      saved > 0
        ? `Added ${saved} weigh-in${saved === 1 ? '' : 's'} — your trend just got richer.`
        : 'Those days were already logged — nothing to add.',
    )
    startTransition(() => router.refresh())
    window.setTimeout(() => setImported(null), 4500)
  }

  const bigValue = latest ? kgToDisplay(latest.kg, units).toFixed(1) : null

  return (
    <section className={styles.section} id="weight-logger">
      {Eyebrow}
      {/* one unified weight card — hero · trend · chart · stats · actions */}
      <div className={`${styles.card} ${styles.wlUnified}`}>
        <div className={styles.wlTopRow}>
          <span className={styles.wlLabel}>Weight</span>
          <div className={styles.wlRange} role="group" aria-label="Timeframe">
            {RANGES.map((r) => (
              <button key={r.id} className={range === r.id ? styles.wlRangeOn : ''} onClick={() => setRange(r.id)}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {bigValue ? (
          <div className={styles.wlHeroRow}>
            <div className={styles.wlBig}>
              {bigValue}
              <small>{unit}</small>
            </div>
            {(trend || streak > 1) && (
              <div className={styles.wlChips}>
                {trend && (
                  <span className={styles.wlChip}>
                    <ArrowGlyph down={trend.down} />
                    {trend.amount.toFixed(1)} {unit} · 7d
                  </span>
                )}
                {streak > 1 && (
                  <span className={`${styles.wlChip} ${styles.wlStreak}`}>
                    <FlameGlyph />
                    {streak}d streak
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className={styles.wlEmpty}>
            <span className={styles.wlEmptyTitle}>Let&apos;s find your line.</span>
            <span className={styles.wlEmptyText}>
              Weigh in each morning — or bring your history in below — and your trend appears here, smoothed past the daily noise.
            </span>
          </div>
        )}

        <div className={styles.wlChartRow}>
          <svg className={styles.wlChart} viewBox={`0 0 ${chart.W} ${chart.H}`} preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient id="wlFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="rgba(110,231,183,0.22)" />
                <stop offset="1" stopColor="rgba(110,231,183,0)" />
              </linearGradient>
              <filter id="wlGlow" x="-10%" y="-40%" width="120%" height="180%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {chart.grid.map((gy, i) => (
              <line key={i} x1="0" y1={gy} x2={chart.W} y2={gy} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            ))}
            {chart.demo ? (
              <>
                <path d={chart.fill} fill="url(#wlFill)" stroke="none" opacity="0.3" />
                <path d={chart.line} fill="none" stroke="var(--mint)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 9" opacity="0.4" />
                <circle cx={chart.end.x} cy={chart.end.y} r="4" fill="var(--mint)" opacity="0.5" />
              </>
            ) : (
              <>
                <path d={chart.fill} fill="url(#wlFill)" stroke="none" />
                <path d={chart.line} fill="none" stroke="var(--mint)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" filter="url(#wlGlow)" />
                <circle cx={chart.end.x} cy={chart.end.y} r="9" fill="rgba(110,231,183,0.25)" />
                <circle cx={chart.end.x} cy={chart.end.y} r="4.5" fill="var(--mint)" />
                <circle cx={chart.end.x} cy={chart.end.y} r="4.5" fill="none" stroke="#fff" strokeWidth="1.5" />
              </>
            )}
          </svg>
          {!chart.demo && (
            <div className={styles.wlYAxis}>
              <span>{chart.hi}</span>
              <span>{chart.mid}</span>
              <span>{chart.lo}</span>
            </div>
          )}
        </div>

        {stats ? (
          <div className={styles.wlStats}>
            <div className={styles.wlStat}>
              <span className={styles.wlStatLbl}>Average</span>
              <span className={styles.wlStatNum}>{stats.avgDisp} <i>{unit}</i></span>
            </div>
            <div className={styles.wlStat}>
              <span className={styles.wlStatLbl}>Change</span>
              <span className={styles.wlStatNum}>
                {stats.flat ? '~ 0.0' : <>{<ArrowGlyph down={stats.changeDown} />}{stats.changeDisp}</>} <i>{unit}</i>
              </span>
              <span className={styles.wlStatSub}>{rangeDef.word}</span>
            </div>
            <div className={styles.wlStat}>
              <span className={styles.wlStatLbl}>Logged</span>
              <span className={styles.wlStatNum}>{stats.logged}/{stats.windowDays}</span>
              <span className={styles.wlStatSub}>mornings</span>
            </div>
          </div>
        ) : (
          <div className={styles.wlCaption}>
            Your weight trend draws here. Weigh in a few mornings — or bring your history in — to see your line.
          </div>
        )}

        <div className={styles.wlActions}>
          {editing ? (
            <div className={styles.wlLog}>
              <input
                className={styles.wlInput}
                type="number"
                inputMode="decimal"
                step="0.1"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save()
                  if (e.key === 'Escape') setEditing(false)
                }}
              />
              <span className={styles.wlInputUnit}>{unit}</span>
              <button className={styles.wlSave} onClick={save} disabled={!draft.trim()}>
                Save
              </button>
              <button className={styles.wlCancel} onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          ) : loggedToday ? (
            <div className={styles.wlLogged}>
              <span className={styles.wlTick}>
                <svg viewBox="0 0 24 24">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <span className={styles.wlLt}>
                <b>Logged this morning</b>
                <span>
                  {bigValue} {unit}
                </span>
              </span>
              <button className={styles.wlEdit} onClick={beginLog}>
                Edit
              </button>
            </div>
          ) : (
            <button className={styles.wlLogBtn} onClick={beginLog}>
              <svg viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Log this morning
            </button>
          )}
          {!editing && (
            <button className={styles.wlImportBtn} onClick={() => setShowImport(true)}>
              <svg viewBox="0 0 24 24">
                <path d="M12 15V3M7 8l5-5 5 5M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
              </svg>
              Bring your history
            </button>
          )}
        </div>

        {error && <div className={styles.wlError}>{error}</div>}
        {imported && <div className={styles.wlOk}>{imported}</div>}

        <div className={styles.wlTie}>
          <svg viewBox="0 0 24 24">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
          Feeds your <b>maintenance coach</b> and Vitals
        </div>
      </div>

      {/* progress photos — durable, in your account */}
      <div className={`${styles.card} ${styles.wlPhotoCard}`}>
        <div className={styles.wlPhotoHead}>
          <div className={styles.wlPhotoHeadLeft}>
            <span className={styles.wlPhotoChip} aria-hidden>
              <VitalityIcon name="camera" size={19} />
            </span>
            <div className={styles.wlPhotoTitle}>
              <span className={styles.wlPhotoLabel}>Progress photos</span>
              <span className={styles.wlPhotoSub}>Saved to your account. Watch the change the scale hides.</span>
            </div>
          </div>
          <input ref={photoInput} type="file" accept="image/*" hidden onChange={onPickPhoto} />
          <button className={styles.wlPhotoAdd} onClick={() => photoInput.current?.click()} disabled={uploading}>
            <VitalityIcon name={uploading ? 'sparkles' : 'camera'} size={15} />
            {uploading ? 'Adding…' : 'Add photo'}
          </button>
        </div>

        {photoErr && <p className={styles.wlPhotoErr} role="alert">{photoErr}</p>}

        {photos.length > 0 ? (
          <div className={styles.wlPhotoStrip}>
            {photos.map((p, i) => (
              <button
                key={p.id}
                className={`${styles.wlPhotoThumb} ${i === 0 ? styles.wlPhotoThumbLatest : ''}`}
                style={{ '--i': i } as React.CSSProperties}
                onClick={() => openViewer(p)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image} alt={photoDate(p)} />
                {i === 0 && <span className={styles.wlPhotoLatestTag}>Latest</span>}
                <span className={styles.wlPhotoMeta}>{photoDate(p)}</span>
                {p.note && <span className={styles.wlPhotoDot} aria-label="Has a note" />}
              </button>
            ))}
          </div>
        ) : (
          <button className={styles.wlPhotoEmpty} onClick={() => photoInput.current?.click()} disabled={uploading}>
            <VitalityIcon name="camera" size={20} />
            <span>{uploading ? 'Adding your photo…' : 'Add your first progress photo'}</span>
          </button>
        )}
      </div>

      {viewer && (
        <div className={styles.wlViewer} onClick={() => setViewer(null)} role="dialog" aria-modal="true">
          <div className={styles.wlViewerInner} onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viewer.image} alt={photoDate(viewer)} className={styles.wlViewerImg} />
            <div className={styles.wlViewerBody}>
              <div className={styles.wlViewerMetaRow}>
                <span className={styles.wlViewerDate}>{photoDateLong(viewer)}</span>
                {viewer.weightKg != null && (
                  <span className={styles.wlViewerWeight}>{kgToDisplay(viewer.weightKg, units).toFixed(1)} {unit}</span>
                )}
              </div>
              <textarea
                className={styles.wlNoteInput}
                placeholder="Add a note (how you felt, what changed)…"
                value={noteDraft}
                maxLength={280}
                rows={2}
                onChange={(e) => setNoteDraft(e.target.value)}
              />
              <div className={styles.wlViewerActions}>
                <button className={styles.wlViewerDel} onClick={() => removePhoto(viewer.id)}>
                  <VitalityIcon name="trash" size={15} /> Delete
                </button>
                <button
                  className={styles.wlNoteSave}
                  onClick={saveNote}
                  disabled={savingNote || noteDraft.trim() === (viewer.note ?? '')}
                >
                  {savingNote ? 'Saving…' : 'Save note'}
                </button>
              </div>
            </div>
            <button className={styles.wlViewerClose} onClick={() => setViewer(null)} aria-label="Close">
              <VitalityIcon name="close" size={18} />
            </button>
          </div>
        </div>
      )}

      {showImport && (
        <WeightImportSheet
          units={units}
          onClose={() => setShowImport(false)}
          onImported={handleImported}
        />
      )}
    </section>
  )
}
