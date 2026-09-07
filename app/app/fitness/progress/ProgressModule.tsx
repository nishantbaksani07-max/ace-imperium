'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styles from './progress.module.css'
import { saveWeight, deleteWeight } from './actions'
import { getLocalDateKey } from '@/lib/dates'
import type { ProgressPhoto, Units, WeightEntry } from './types'
import {
  PHASE_LABEL,
  PHASE_SUBLABEL,
  type CompositionSignal,
  type LiftSignal,
} from './signals'

interface Props {
  initialEntries: WeightEntry[]
  initialUnits: Units
  liftSignals: LiftSignal[]
  composition: CompositionSignal
}

const PHOTOS_KEY = 'vitality_progress_photos_v1'
const CHART_WINDOW = 30           // days shown on the trend chart
const MOVING_AVG_WINDOW = 7

// -----------------------------------------------------------------------------
// Unit conversion helpers
// -----------------------------------------------------------------------------

function kgToDisplay(kg: number, u: Units): number {
  return u === 'lb' ? kg * 2.20462 : kg
}

function displayToKg(value: number, u: Units): number {
  return u === 'lb' ? value / 2.20462 : value
}

function formatDisplay(kg: number, u: Units): string {
  return kgToDisplay(kg, u).toFixed(1)
}

// -----------------------------------------------------------------------------
// Date helpers
// -----------------------------------------------------------------------------

function parseLocalDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function formatPhotoDate(key: string): string {
  const d = parseLocalDateKey(key)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[d.getMonth()]} ${d.getDate()}`
}

// -----------------------------------------------------------------------------
// Photo compression (matches standalone — max 1080px JPEG, fallback to 800px)
// -----------------------------------------------------------------------------

function compressDataUrl(dataUrl: string, maxDim = 1080, quality = 0.75): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      let w = img.naturalWidth || img.width
      let h = img.naturalHeight || img.height
      if (w > maxDim || h > maxDim) {
        if (w >= h) { h = Math.round(h * (maxDim / w)); w = maxDim }
        else        { w = Math.round(w * (maxDim / h)); h = maxDim }
      }
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      c.getContext('2d')?.drawImage(img, 0, 0, w, h)
      try { resolve(c.toDataURL('image/jpeg', quality)) } catch { resolve(dataUrl) }
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

// -----------------------------------------------------------------------------
// Smoothed SVG path (matches standalone Q-curve smoothing)
// -----------------------------------------------------------------------------

function smoothPath(points: { x: number; y: number }[]): string {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1], curr = points[i]
    const cx = (prev.x + curr.x) / 2
    d += ` Q ${cx.toFixed(2)} ${prev.y.toFixed(2)}, ${cx.toFixed(2)} ${((prev.y + curr.y) / 2).toFixed(2)}`
    d += ` T ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`
  }
  return d
}

// =============================================================================
// Root component
// =============================================================================

export default function ProgressModule({ initialEntries, initialUnits, liftSignals, composition }: Props) {
  const [entries, setEntries] = useState<WeightEntry[]>(initialEntries)
  const [units, setUnits] = useState<Units>(initialUnits)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const todayKey = getLocalDateKey()
  const todayEntry = entries.find(e => e.dateKey === todayKey)
  const latest = entries[entries.length - 1] ?? null
  const showInput = editing || !todayEntry

  // Seed the input with today's logged value (when editing) or the latest
  // logged value (when first-run-of-day) so the user mostly just hits save.
  useEffect(() => {
    if (!showInput) return
    const seed = todayEntry ?? latest
    if (seed && !draft) setDraft(formatDisplay(seed.weightKg, units))
  }, [showInput, todayEntry, latest, units, draft])

  // ---------- weight save / edit ----------

  async function handleSave() {
    const parsed = parseFloat(draft)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('enter a valid weight'); return
    }
    setSaving(true); setError(null)
    const result = await saveWeight({ weightKg: displayToKg(parsed, units) })
    setSaving(false)
    if (!result.ok || !result.entry) {
      setError(
        result.error === 'invalid_weight'
          ? 'weight out of range'
          : 'could not save. try again',
      )
      return
    }
    // Optimistically merge into state so the chart updates without a reload.
    setEntries(prev => {
      const without = prev.filter(e => e.dateKey !== result.entry!.dateKey)
      const next = [...without, result.entry!]
      next.sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      return next
    })
    setDraft('')
    setEditing(false)
  }

  function startEdit() {
    setEditing(true)
    setError(null)
    if (todayEntry) setDraft(formatDisplay(todayEntry.weightKg, units))
  }

  function handleInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      setEditing(false); setError(null)
    }
  }

  // ---------- progress photos (localStorage) ----------

  const [photos, setPhotos] = useState<ProgressPhoto[]>([])
  const [photosReady, setPhotosReady] = useState(false)
  const [photosOpen, setPhotosOpen] = useState(false)
  const [viewerPhoto, setViewerPhoto] = useState<ProgressPhoto | null>(null)
  const [comparePhoto, setComparePhoto] = useState<ProgressPhoto | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const fileLibraryRef = useRef<HTMLInputElement | null>(null)
  const fileCameraRef = useRef<HTMLInputElement | null>(null)

  // Hydrate from localStorage on mount only.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PHOTOS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as ProgressPhoto[]
        if (Array.isArray(parsed)) setPhotos(parsed)
      }
    } catch { /* corrupted — start empty */ }
    setPhotosReady(true)
  }, [])

  // Persist after hydration only.
  const photosHydrated = useRef(false)
  useEffect(() => {
    if (!photosReady) return
    if (!photosHydrated.current) { photosHydrated.current = true; return }
    try { window.localStorage.setItem(PHOTOS_KEY, JSON.stringify(photos)) }
    catch { /* quota exceeded — silently no-op */ }
  }, [photos, photosReady])

  const photoCount = photos.length
  // photos is stored newest-first (unshift on add). Latest = photos[0].
  // For the gallery view we render chronologically (oldest at top, newest
  // at bottom) so the user scrolls down into their own future.
  const latestPhoto = photos[0] ?? null
  const galleryPhotos = useMemo(() => [...photos].reverse(), [photos])
  const currentWeightLabel = latest ? `${formatDisplay(latest.weightKg, units)} ${units}` : null

  const addPhoto = useCallback(async (dataUrl: string) => {
    let compressed = dataUrl
    try { compressed = await compressDataUrl(dataUrl, 1080, 0.75) } catch {}
    const next: ProgressPhoto = {
      id: `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      dataUrl: compressed,
      dateKey: getLocalDateKey(),
      weightLabel: currentWeightLabel,
    }
    // Optimistic insert; if storage quota fails, retry with smaller image,
    // then drop with an alert as a last resort.
    setPhotos(prev => [next, ...prev])
    try {
      const probe = JSON.stringify([next, ...photos])
      window.localStorage.setItem(PHOTOS_KEY, probe)
    } catch {
      try {
        const smaller = await compressDataUrl(dataUrl, 800, 0.6)
        setPhotos(prev => [{ ...next, dataUrl: smaller }, ...prev.filter(p => p.id !== next.id)])
      } catch {
        setPhotos(prev => prev.filter(p => p.id !== next.id))
        alert('Phone storage is full. Delete older photos before adding a new one.')
      }
    }
  }, [currentWeightLabel, photos])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      if (typeof ev.target?.result === 'string') addPhoto(ev.target.result)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function deletePhotoNow(id: string) {
    setPhotos(prev => prev.filter(p => p.id !== id))
    setViewerPhoto(null)
    setComparePhoto(null)
    setConfirmDelete(false)
  }

  function cycleCompare() {
    if (!viewerPhoto) return
    const others = photos.filter(p => p.id !== viewerPhoto.id)
    if (!others.length) return
    const currentIdx = others.findIndex(p => p.id === comparePhoto?.id)
    const next = others[(currentIdx + 1) % others.length]
    setComparePhoto(next)
  }

  // ---------- chart ----------

  const chartData = useMemo(() => {
    const recent = entries.slice(-CHART_WINDOW)
    if (recent.length < 2) return null
    const kgs = recent.map(e => e.weightKg)
    const min = Math.min(...kgs), max = Math.max(...kgs)
    const pad = Math.max((max - min) * 0.15, 0.5)
    const yMin = min - pad, yMax = max + pad
    const W = 320, H = 130
    const xLeft = 8, xRight = W - 8, yTop = 20, yBot = H - 20
    const xRange = xRight - xLeft, yRange = yBot - yTop
    const xFor = (i: number) =>
      recent.length === 1 ? xRight : xLeft + (i / (recent.length - 1)) * xRange
    const yFor = (kg: number) => yBot - ((kg - yMin) / (yMax - yMin)) * yRange
    const points = recent.map((e, i) => ({ x: xFor(i), y: yFor(e.weightKg) }))
    const avgPoints = recent.map((_, i) => {
      const start = Math.max(0, i - (MOVING_AVG_WINDOW - 1))
      const win = recent.slice(start, i + 1)
      const avgKg = win.reduce((s, p) => s + p.weightKg, 0) / win.length
      return { x: xFor(i), y: yFor(avgKg) }
    })
    return {
      W, H, yBot,
      yMin: kgToDisplay(yMin, units),
      yMax: kgToDisplay(yMax, units),
      linePath: smoothPath(points),
      areaPath: `${smoothPath(points)} L ${points[points.length - 1].x.toFixed(2)} ${yBot} L ${points[0].x.toFixed(2)} ${yBot} Z`,
      avgPath: smoothPath(avgPoints),
      points,
      recentCount: recent.length,
      totalCount: entries.length,
    }
  }, [entries, units])

  // ---------- 7-day delta + streak ----------

  const delta = useMemo(() => {
    if (entries.length < 2 || !latest) return null
    const lastDate = parseLocalDateKey(latest.dateKey)
    const cutoff = new Date(lastDate); cutoff.setDate(cutoff.getDate() - 7)
    const baseline = entries.find(e => parseLocalDateKey(e.dateKey) >= cutoff) ?? entries[0]
    const diffKg = latest.weightKg - baseline.weightKg
    if (Math.abs(diffKg) < 0.05) return { diffKg: 0, dir: 'flat' as const }
    return { diffKg, dir: diffKg > 0 ? 'up' as const : 'down' as const }
  }, [entries, latest])

  const streak = useMemo(() => {
    if (!entries.length) return 0
    const set = new Set(entries.map(e => e.dateKey))
    const cursor = new Date()
    if (!set.has(getLocalDateKey(cursor))) cursor.setDate(cursor.getDate() - 1)
    let count = 0
    while (set.has(getLocalDateKey(cursor))) {
      count++; cursor.setDate(cursor.getDate() - 1)
    }
    return count
  }, [entries])

  // ---------- units toggle ----------

  function changeUnits(u: Units) {
    setUnits(u)
    // Convert the current draft so the input doesn't suddenly mean a different
    // number when the user is mid-edit.
    if (draft) {
      const parsed = parseFloat(draft)
      if (Number.isFinite(parsed)) {
        const asKg = displayToKg(parsed, units)
        setDraft(kgToDisplay(asKg, u).toFixed(1))
      }
    }
  }

  // =============================================================================
  // Render
  // =============================================================================

  return (
    <main className={`${styles.page} grain-overlay`}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href="/app/fuel" className={styles.back}>
            <span className={styles.backArrow}>←</span> Fuel
          </Link>
          <div className={styles.headerRow}>
            <h1 className={styles.title}>Progress</h1>
            <UnitToggle units={units} onChange={changeUnits} />
          </div>
          <p className={styles.subtitle}>weight log · progress photos</p>
        </header>

        {/* Hero card — today's number, delta, streak, chart, input */}
        <section className={styles.heroCard}>
          <div className={styles.heroNumRow}>
            <span className={styles.heroNum}>{latest ? formatDisplay(latest.weightKg, units) : '—'}</span>
            <span className={styles.heroUnit}>{units}</span>
          </div>

          <div className={styles.chipRow}>
            {delta && delta.dir !== 'flat' && (
              <span className={`${styles.deltaChip} ${delta.dir === 'down' ? styles.down : styles.up}`}>
                {delta.dir === 'down' ? '↓' : '↑'} {Math.abs(kgToDisplay(delta.diffKg, units)).toFixed(1)} {units}
                <span className={styles.chipWindow}>· 7d</span>
              </span>
            )}
            {streak >= 2 && (
              <span className={styles.streakChip}>
                <span className={styles.streakDot} aria-hidden />
                {streak} day streak
              </span>
            )}
          </div>

          {!entries.length && (
            <div className={styles.heroEmpty}>
              Log your first weight to start tracking. The chart, streak, and delta unlock from there.
            </div>
          )}

          {chartData && (
            <div className={styles.chartWrap}>
              <div className={styles.chartYAxis}>
                <span>{chartData.yMax.toFixed(1)}</span>
                <span>{chartData.yMin.toFixed(1)}</span>
              </div>
              <svg className={styles.chart} viewBox={`0 0 ${chartData.W} ${chartData.H}`} preserveAspectRatio="none" aria-hidden>
                <defs>
                  <linearGradient id="progressChartFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--mint)" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="var(--mint)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <line className={styles.chartGrid} x1="0" y1="20" x2={chartData.W} y2="20" />
                <line className={styles.chartGrid} x1="0" y1={chartData.H / 2} x2={chartData.W} y2={chartData.H / 2} />
                <line className={styles.chartGrid} x1="0" y1={chartData.H - 20} x2={chartData.W} y2={chartData.H - 20} />
                <path className={styles.chartAvg} d={chartData.avgPath} />
                <path className={styles.chartArea} d={chartData.areaPath} fill="url(#progressChartFill)" />
                <path className={styles.chartLine} d={chartData.linePath} />
                {chartData.points.map((p, i) => {
                  const isLast = i === chartData.points.length - 1
                  return (
                    <circle
                      key={i}
                      className={isLast ? styles.dotToday : styles.dot}
                      cx={p.x}
                      cy={p.y}
                      r={isLast ? 5 : 3}
                    />
                  )
                })}
              </svg>
              <div className={styles.chartMeta}>
                {chartData.totalCount} {chartData.totalCount === 1 ? 'entry' : 'entries'} · last {chartData.recentCount} days
              </div>
              <div className={styles.chartLegend}>
                <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.legendDotLine}`} />Daily</span>
                <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.legendDotAvg}`} />7-day avg</span>
              </div>
            </div>
          )}

          {todayEntry && !editing ? (
            <div className={styles.locked}>
              <div className={styles.lockedLeft}>
                <span className={styles.lockedCheck} aria-hidden>✓</span>
                <div>
                  <div className={styles.lockedLabel}>logged today</div>
                  <div className={styles.lockedValue}>{formatDisplay(todayEntry.weightKg, units)} {units}</div>
                </div>
              </div>
              <button type="button" className={styles.editBtn} onClick={startEdit}>edit</button>
            </div>
          ) : (
            <form
              className={styles.inputRow}
              onSubmit={e => { e.preventDefault(); handleSave() }}
            >
              <input
                type="number"
                step="0.1"
                inputMode="decimal"
                className={styles.input}
                value={draft}
                onChange={e => { setDraft(e.target.value); setError(null) }}
                onKeyDown={handleInputKey}
                placeholder={`weight (${units})`}
                aria-label="Today's weight"
                autoFocus={editing}
              />
              <span className={styles.inputUnit}>{units}</span>
              <button
                type="submit"
                className={styles.saveBtn}
                disabled={saving || !draft.trim()}
              >
                {saving ? 'saving…' : todayEntry ? 'update' : 'save'}
              </button>
            </form>
          )}
          {error && <p className={styles.errorText}>{error}</p>}
        </section>

        {/* Training section — rotating lift PR ticker */}
        {liftSignals.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionEyebrow}>training · last 90 days</div>
            <LiftSignalTicker signals={liftSignals} units={units} />
          </section>
        )}

        {/* Composition section */}
        <section className={styles.section}>
          <div className={styles.sectionEyebrow}>composition · last {composition.windowDays} days</div>
          <CompositionCard composition={composition} units={units} />
        </section>

        {/* Photos section — inline preview + Open / Compare actions */}
        <section className={styles.section}>
          <div className={styles.sectionEyebrowRow}>
            <span className={styles.sectionEyebrow}>
              photos{photoCount > 0 ? ` · ${photoCount}` : ''}
            </span>
            {latestPhoto && (
              <span className={styles.sectionEyebrowMeta}>latest {formatPhotoDate(latestPhoto.dateKey)}</span>
            )}
          </div>

          {!latestPhoto ? (
            <button
              type="button"
              className={styles.photosEmptyTrigger}
              onClick={() => setPhotosOpen(true)}
            >
              <span className={styles.photosTriggerIcon} aria-hidden>◐</span>
              <div className={styles.photosEmptyTriggerText}>
                <div className={styles.photosTriggerLabel}>Add your first photo</div>
                <div className={styles.photosTriggerCount}>start a private timeline of your progress</div>
              </div>
              <span className={styles.photosTriggerArrow}>→</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                className={styles.photoPreview}
                onClick={() => { setViewerPhoto(latestPhoto); setComparePhoto(null); setConfirmDelete(false) }}
                aria-label="Open latest photo"
              >
                <img src={latestPhoto.dataUrl} alt="latest progress photo" />
                <div className={styles.photoPreviewGradient} />
                <div className={styles.photoPreviewMeta}>
                  <div>
                    <div className={styles.photoPreviewDate}>{formatPhotoDate(latestPhoto.dateKey).toUpperCase()}</div>
                    {latestPhoto.weightLabel && (
                      <div className={styles.photoPreviewWeight}>{latestPhoto.weightLabel}</div>
                    )}
                  </div>
                  <span className={styles.photoPreviewArrow} aria-hidden>↗</span>
                </div>
              </button>

              <div className={styles.photoActionsRow}>
                <button
                  type="button"
                  className={`${styles.photoActionBtn} ${styles.photoActionPrimary}`}
                  onClick={() => setPhotosOpen(true)}
                >
                  Open gallery
                </button>
                <button
                  type="button"
                  className={`${styles.photoActionBtn} ${styles.photoActionSecondary}`}
                  onClick={() => {
                    if (photos.length < 2 || !latestPhoto) return
                    const other = photos.find(p => p.id !== latestPhoto.id)
                    if (!other) return
                    setViewerPhoto(latestPhoto)
                    setComparePhoto(other)
                    setConfirmDelete(false)
                  }}
                  disabled={photos.length < 2}
                  title={photos.length < 2 ? 'Add at least one more photo to compare' : 'Compare with another photo'}
                >
                  Compare
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Photos overlay */}
      {photosOpen && (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.overlayInner}>
            <div className={styles.overlayHead}>
              <button
                type="button"
                className={styles.overlayBack}
                onClick={() => setPhotosOpen(false)}
                aria-label="Close"
              >
                ←
              </button>
              <div>
                <div className={styles.overlayEyebrow}>memory</div>
                <h2 className={styles.overlayTitle}>Progress</h2>
              </div>
            </div>

            <div className={styles.overlayActions}>
              <button
                type="button"
                className={`${styles.overlayAction} ${styles.overlayPrimary}`}
                onClick={() => fileCameraRef.current?.click()}
              >
                Take photo
              </button>
              <button
                type="button"
                className={`${styles.overlayAction} ${styles.overlaySecondary}`}
                onClick={() => fileLibraryRef.current?.click()}
              >
                From library
              </button>
            </div>

            <input ref={fileCameraRef}  type="file" accept="image/*" capture="environment" className={styles.hiddenInput} onChange={handleFileChange} />
            <input ref={fileLibraryRef} type="file" accept="image/*"                       className={styles.hiddenInput} onChange={handleFileChange} />

            {photos.length === 0 ? (
              <div className={styles.photosEmpty}>
                <p className={styles.photosEmptyLine}><em>The first one is the hardest.</em></p>
                <p className={styles.photosEmptyHint}>tap take photo or from library to start a private timeline.</p>
              </div>
            ) : (
              <div className={styles.photoGrid}>
                {galleryPhotos.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    className={styles.photoCard}
                    onClick={() => { setViewerPhoto(p); setComparePhoto(null); setConfirmDelete(false) }}
                  >
                    <img src={p.dataUrl} alt="" />
                    <div className={styles.photoOverlay} />
                    <div className={styles.photoMeta}>
                      <span className={styles.photoDate}>{formatPhotoDate(p.dateKey)}</span>
                      {p.weightLabel && <span className={styles.photoWeight}>{p.weightLabel}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Photo viewer */}
      {viewerPhoto && (
        <div className={styles.viewer} role="dialog" aria-modal="true">
          {comparePhoto ? (
            <CompareView
              a={viewerPhoto}
              b={comparePhoto}
              onCycle={cycleCompare}
              onBack={() => setComparePhoto(null)}
              onClose={() => { setViewerPhoto(null); setComparePhoto(null); setConfirmDelete(false) }}
              onDelete={() => {
                if (!confirmDelete) { setConfirmDelete(true); return }
                deletePhotoNow(viewerPhoto.id)
              }}
              confirmDelete={confirmDelete}
            />
          ) : (
            <SingleView
              photo={viewerPhoto}
              canCompare={photos.length >= 2}
              onCompare={() => {
                const others = photos.filter(p => p.id !== viewerPhoto.id)
                if (others.length) setComparePhoto(others[0])
              }}
              onClose={() => { setViewerPhoto(null); setConfirmDelete(false) }}
              onDelete={() => {
                if (!confirmDelete) { setConfirmDelete(true); return }
                deletePhotoNow(viewerPhoto.id)
              }}
              confirmDelete={confirmDelete}
            />
          )}
        </div>
      )}
    </main>
  )
}

// =============================================================================
// Subcomponents
// =============================================================================

function UnitToggle({ units, onChange }: { units: Units; onChange: (u: Units) => void }) {
  return (
    <div className={styles.unitSeg} role="group" aria-label="display units">
      {(['kg', 'lb'] as Units[]).map(u => (
        <button
          key={u}
          type="button"
          className={`${styles.unitBtn} ${u === units ? styles.unitBtnActive : ''}`}
          onClick={() => onChange(u)}
        >
          {u}
        </button>
      ))}
    </div>
  )
}

function SingleView({
  photo, canCompare, onCompare, onClose, onDelete, confirmDelete,
}: {
  photo: ProgressPhoto
  canCompare: boolean
  onCompare: () => void
  onClose: () => void
  onDelete: () => void
  confirmDelete: boolean
}) {
  return (
    <>
      <div className={styles.viewerStage}>
        <img src={photo.dataUrl} alt="" />
      </div>
      <div className={styles.viewerMeta}>
        <div className={styles.viewerDate}>{formatPhotoDate(photo.dateKey).toUpperCase()}</div>
        {photo.weightLabel && <div className={styles.viewerWeight}>{photo.weightLabel}</div>}
      </div>
      <div className={styles.viewerActions}>
        <button
          type="button"
          className={`${styles.viewerBtn} ${styles.viewerCompare}`}
          onClick={onCompare}
          disabled={!canCompare}
        >
          Compare
        </button>
        <button type="button" className={styles.viewerBtn} onClick={onClose}>Close</button>
        <button
          type="button"
          className={`${styles.viewerBtn} ${styles.viewerDelete} ${confirmDelete ? styles.viewerConfirm : ''}`}
          onClick={onDelete}
        >
          {confirmDelete ? 'Confirm?' : 'Delete'}
        </button>
      </div>
    </>
  )
}

// =============================================================================
// Lift signal ticker (rotating PR / regression pill)
// =============================================================================

/**
 * NASDAQ-style horizontal ticker. Renders ALL signals in a continuously
 * scrolling track so the user can see multiple lifts at once — much
 * easier to read than the old "one at a time" rotating pill.
 *
 * Implementation: duplicate the items list so the @keyframes can translate
 * from 0 to -50% and visually loop without snapping. Pauses on hover.
 * CSS owns the animation timing; we render two identical halves.
 */
function LiftSignalTicker({ signals, units }: { signals: LiftSignal[]; units: Units }) {
  if (!signals.length) return null

  function renderItem(s: LiftSignal, keySuffix: string) {
    const isPR = s.kind === 'pr_weight' || s.kind === 'pr_reps'
    const arrow = isPR ? '↑' : '↓'
    let body: React.ReactNode
    if (s.kind === 'pr_reps') {
      body = (
        <>
          {s.previousReps} → <strong>{s.currentReps}</strong> reps
          <span className={styles.tickerAt}> @ {formatDisplay(s.currentWeightKg, units)} {units}</span>
        </>
      )
    } else {
      body = (
        <>
          {formatDisplay(s.previousWeightKg, units)} → <strong>{formatDisplay(s.currentWeightKg, units)}</strong> {units}
        </>
      )
    }
    return (
      <span
        key={`${s.id}-${keySuffix}`}
        className={`${styles.tickerItem} ${isPR ? styles.tickerItemUp : styles.tickerItemDown}`}
      >
        <span className={styles.tickerArrow} aria-hidden>{arrow}</span>
        <span className={styles.tickerName}>{s.exerciseName}</span>
        <span className={styles.tickerSep} aria-hidden>·</span>
        <span className={styles.tickerBody}>{body}</span>
      </span>
    )
  }

  return (
    <div className={styles.ticker} role="marquee" aria-label="Recent lift changes">
      <div className={styles.tickerBadge}>
        <span className={styles.tickerBadgeDot} aria-hidden />
        lifts
      </div>
      <div className={styles.tickerViewport}>
        <div className={styles.tickerTrack}>
          {signals.map(s => renderItem(s, 'a'))}
          {signals.map(s => renderItem(s, 'b'))}
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Composition card (phase + trends + lean/fat estimates)
// =============================================================================

/**
 * Simpler-for-new-users layout:
 *   - Big phase word + one sentence sublabel (this is the takeaway)
 *   - 4 inline pills, not a grid — easier to scan: weight, lifts, muscle, fat
 *   - No confidence chip in the header (just a small "?" trailing the
 *     caveat that explains low confidence is normal early on)
 *   - Numbers default to "—" until enough data is collected, which is the
 *     honest answer instead of fake zeros.
 */
function CompositionCard({ composition, units }: { composition: CompositionSignal; units: Units }) {
  const { phase, weightSlopeKgPerWeek, volumeTrendPct, estimatedLeanKgPerWeek, estimatedFatKgPerWeek, confidence } = composition

  const phaseLabel = PHASE_LABEL[phase]
  const phaseSub = PHASE_SUBLABEL[phase]

  const weightSlopeDisplay = kgToDisplay(weightSlopeKgPerWeek, units)
  const leanDisplay = estimatedLeanKgPerWeek == null ? null : kgToDisplay(estimatedLeanKgPerWeek, units)
  const fatDisplay  = estimatedFatKgPerWeek  == null ? null : kgToDisplay(estimatedFatKgPerWeek,  units)

  function fmtKg(value: number | null): string {
    if (value == null) return '—'
    if (Math.abs(value) < 0.02) return '±0'
    const sign = value > 0 ? '+' : '−'
    return `${sign}${Math.abs(value).toFixed(2)}`
  }

  function fmtPct(value: number | null): string {
    if (value == null) return '—'
    if (Math.abs(value) < 0.5) return 'flat'
    const sign = value > 0 ? '+' : '−'
    return `${sign}${Math.abs(value).toFixed(0)}%`
  }

  const pills: { label: string; value: string; tone: 'up' | 'down' | 'flat'; preferUpTone?: boolean }[] = [
    {
      label: 'weight',
      value: `${fmtKg(weightSlopeDisplay)} ${units}/wk`,
      tone: weightSlopeKgPerWeek > 0.15 ? 'up' : weightSlopeKgPerWeek < -0.15 ? 'down' : 'flat',
    },
    {
      label: 'lifts',
      value: fmtPct(volumeTrendPct),
      tone: volumeTrendPct == null ? 'flat' : volumeTrendPct > 3 ? 'up' : volumeTrendPct < -3 ? 'down' : 'flat',
      preferUpTone: true,
    },
    {
      label: 'muscle',
      value: `${fmtKg(leanDisplay)} ${units}/wk`,
      tone: leanDisplay == null ? 'flat' : leanDisplay > 0.02 ? 'up' : leanDisplay < -0.02 ? 'down' : 'flat',
      preferUpTone: true,
    },
    {
      label: 'fat',
      value: `${fmtKg(fatDisplay)} ${units}/wk`,
      tone: fatDisplay == null ? 'flat' : fatDisplay > 0.02 ? 'down' : fatDisplay < -0.02 ? 'up' : 'flat',
    },
  ]

  return (
    <div className={styles.compCard}>
      <div className={styles.compPhase}>
        <span className={styles.compPhaseWord}>{phaseLabel}</span>
      </div>
      <p className={styles.compPhaseSub}>{phaseSub}</p>

      {phase !== 'insufficient' && (
        <div className={styles.compPillRow}>
          {pills.map(p => (
            <CompPill key={p.label} {...p} />
          ))}
        </div>
      )}

      <p
        className={styles.compCaveat}
        title={
          confidence < 35
            ? 'Low confidence. Log a few more weights and workouts and these numbers settle down.'
            : 'Directional only. Real body composition needs DEXA or skinfolds.'
        }
      >
        estimate · not a body-fat measurement
        {confidence < 35 && <span className={styles.compCaveatTag}> · low data</span>}
      </p>
    </div>
  )
}

function CompPill({
  label, value, tone, preferUpTone,
}: {
  label: string
  value: string
  tone: 'up' | 'down' | 'flat'
  preferUpTone?: boolean
}) {
  // "good" = mint, "bad" = amber, neutral = muted-strong
  const good = preferUpTone ? 'up' : 'down'
  const cls =
    tone === 'flat' || value === '—' ? styles.compPillNeutral
      : tone === good ? styles.compPillGood
      : styles.compPillBad
  return (
    <div className={`${styles.compPill} ${cls}`}>
      <span className={styles.compPillLabel}>{label}</span>
      <span className={styles.compPillValue}>{value}</span>
    </div>
  )
}

function CompareView({
  a, b, onCycle, onBack, onClose, onDelete, confirmDelete,
}: {
  a: ProgressPhoto
  b: ProgressPhoto
  onCycle: () => void
  onBack: () => void
  onClose: () => void
  onDelete: () => void
  confirmDelete: boolean
}) {
  const headline = `${formatPhotoDate(a.dateKey)} → ${formatPhotoDate(b.dateKey)}`
  return (
    <>
      <div className={styles.compareStage}>
        <div className={styles.compareSide}>
          <img src={a.dataUrl} alt="" />
          <div className={styles.compareMeta}>{formatPhotoDate(a.dateKey)}{a.weightLabel ? ` · ${a.weightLabel}` : ''}</div>
        </div>
        <button type="button" className={`${styles.compareSide} ${styles.compareOther}`} onClick={onCycle} title="Tap for next">
          <img src={b.dataUrl} alt="" />
          <div className={styles.compareMeta}>{formatPhotoDate(b.dateKey)}{b.weightLabel ? ` · ${b.weightLabel}` : ''}</div>
        </button>
      </div>
      <div className={styles.compareHeadline}>{headline}</div>
      <div className={styles.viewerActions}>
        <button type="button" className={styles.viewerBtn} onClick={onBack}>← Back</button>
        <button type="button" className={styles.viewerBtn} onClick={onClose}>Close</button>
        <button
          type="button"
          className={`${styles.viewerBtn} ${styles.viewerDelete} ${confirmDelete ? styles.viewerConfirm : ''}`}
          onClick={onDelete}
        >
          {confirmDelete ? 'Confirm?' : 'Delete'}
        </button>
      </div>
    </>
  )
}
