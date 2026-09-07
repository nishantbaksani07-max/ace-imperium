'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import styles from './historyModal.module.css'
import { createClient } from '@/lib/supabase/client'
import {
  getExerciseHistory,
  saveBackfillSession,
  updateExerciseTopSet,
  deleteExerciseFromWorkout,
  type ExerciseHistoryPoint,
} from '@/lib/workouts/queries'
import { getLocalDateKey } from '@/lib/dates'
import { kgToDisplay, displayToKg, unitLabel, type Units } from '@/lib/units'
import { MAX_WEIGHT_DISPLAY, MAX_REPS } from '@/lib/workouts/backfill'

/* ──────────────────────────────────────────────────────────────────
   Faithful port of the compact-logger demo's per-lift HISTORY card
   (public/compact-logger.html → openHistory). Every plotted point and
   every stat is the user's REAL saved history (Supabase, user-scoped
   via RLS). The range tabs window those real points by date; the
   scrub line/dot/tag follow a finger across the line; edit + remove +
   "log a session" all run against the real save path.
   ────────────────────────────────────────────────────────────────── */

type RangeKey = 'W' | 'M' | '3M' | '6M' | 'Y' | 'all'
/** TFS in the demo: [['W',7],['M',30],['3M',90],['6M',180],['Y',365],['all',1e9]] */
const RANGES: ReadonlyArray<[RangeKey, string, number]> = [
  ['W', 'W', 7],
  ['M', 'M', 30],
  ['3M', '3M', 90],
  ['6M', '6M', 180],
  ['Y', 'Y', 365],
  ['all', 'All', Infinity],
]
const RANGE_LABEL: Record<RangeKey, string> = {
  W: 'this week',
  M: 'this month',
  '3M': 'in 3 months',
  '6M': 'in 6 months',
  Y: 'this year',
  all: 'all time',
}

interface HistoryModalProps {
  exerciseId: string
  exerciseName: string
  /** Current user id — required to read/edit/backfill (RLS-scoped). */
  userId?: string
  /** Display unit. Storage is kg; weights convert at the UI boundary. */
  units: Units
  onClose: () => void
}

export default function HistoryModal({
  exerciseId,
  exerciseName,
  userId,
  units,
  onClose,
}: HistoryModalProps) {
  /** null = loading. The fetched points are chrono (oldest → newest). */
  const [points, setPoints] = useState<ExerciseHistoryPoint[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<RangeKey>('all')
  /** Index (into the in-view real points) of the chart dot the user
   *  scrubbed/tapped, so the per-set rep chips follow the selection.
   *  null = show the latest session. Reset whenever the range changes. */
  const [selIdx, setSelIdx] = useState<number | null>(null)
  /** Which log row is expanded for inline edit. -1 = none. */
  const [openIdx, setOpenIdx] = useState<number>(-1)
  const [showAdd, setShowAdd] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  /** Row index awaiting delete confirmation. -1 = none. */
  const [confirmIdx, setConfirmIdx] = useState<number>(-1)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    if (!userId) { setPoints([]); return }
    const supabase = createClient()
    // History is your PAST progression. Today's session is the one you're
    // logging right now in the logger, so it never belongs in this graph —
    // exclude it. It shows up here the next time you come back to this lift
    // (next day / next time this split day comes around).
    const todayKey = getLocalDateKey()
    getExerciseHistory(supabase, exerciseId, userId, 60)
      .then(p => { if (!cancelled) setPoints(p.filter(pt => pt.date !== todayKey)) })
      .catch(e => { if (!cancelled) setError(String(e.message ?? e)) })
    return () => { cancelled = true }
  }, [exerciseId, reloadKey, userId])

  /** Chrono points inside the selected day-window (oldest → newest). */
  const windowChrono = useMemo(
    () => (points ? filterByRange(points, range) : []),
    [points, range],
  )
  /** Real training sessions in the window — off / sick days are excluded from
   *  the strength line, best, and progression so an eased day never reads as a
   *  dip or a baseline. They still appear as soft twilight markers + rows. */
  const windowReal = useMemo(() => windowChrono.filter(p => !p.offDay), [windowChrono])
  /** Off-day sessions in the window — plotted as soft grey dots off the line. */
  const windowOff = useMemo(() => windowChrono.filter(p => p.offDay), [windowChrono])
  /** Newest-first rows for the editable log list (demo iterates hist[0] = newest).
   *  Keeps off-days so they show as twilight "off day" rows, not vanished. */
  const rowsDesc = useMemo(() => [...windowChrono].reverse(), [windowChrono])

  /** Day-span of the selected window, passed to the graph so it scales the plot
   *  to the window (a year span shows recent data as a small blip on the right). */
  const rangeDays = useMemo(() => (RANGES.find(r => r[0] === range) ?? RANGES[5])[2], [range])
  /** Left axis label = window start (today minus the span); All falls back to the
   *  oldest session. Right axis label is always today. */
  const axisStart = useMemo(() => {
    if (!windowChrono.length) return getLocalDateKey()
    return Number.isFinite(rangeDays) ? dateDaysAgo(rangeDays) : windowChrono[0].date
  }, [windowChrono, rangeDays])

  /** Whole-history REAL sessions (off-days excluded) — drives every stat so an
   *  eased day never lowers best / progression / the session count. */
  const realPoints = useMemo(() => (points ? points.filter(p => !p.offDay) : []), [points])

  // Whole-history stats (demo computes these over the full set, not the window).
  const stats = useMemo(() => {
    if (realPoints.length === 0) return null
    const best = Math.max(...realPoints.map(p => p.topWeight))
    const within30 = realPoints.filter(p => daysAgo(p.date) <= 30) // chrono oldest→newest
    let d30: number | null = null
    if (within30.length >= 2) {
      d30 = round1(within30[within30.length - 1].topWeight - within30[0].topWeight)
    }
    return { sessions: realPoints.length, best, d30 }
  }, [realPoints])

  async function commitEdit(idx: number, field: 'sets' | 'reps' | 'weight', dir: 'up' | 'dn') {
    if (!userId) { setRowError('Sign in to edit'); return }
    const point = rowsDesc[idx]
    if (!point) return
    // Step in the user's display unit, then store the kg-canonical delta so a
    // lb user steps by whole pounds and a kg user by 2.5 kg (demo's weight step).
    let nextSets = point.setCount
    let nextReps = point.topReps
    let nextKg = point.topWeight
    if (field === 'sets') {
      nextSets = Math.max(1, Math.min(10, point.setCount + (dir === 'up' ? 1 : -1)))
    } else if (field === 'reps') {
      nextReps = Math.max(1, point.topReps + (dir === 'up' ? 1 : -1))
    } else {
      const deltaKg = displayToKg(units === 'imperial' ? 5 : 2.5, units)
      nextKg = Math.max(0, round1(point.topWeight + (dir === 'up' ? deltaKg : -deltaKg)))
    }
    setRowError(null)
    setBusy(true)
    try {
      const supabase = createClient()
      await updateExerciseTopSet(supabase, {
        workoutId: point.workoutId,
        userId,
        exerciseId,
        weight: nextKg,
        reps: nextReps,
        sets: nextSets,
      })
      setReloadKey(k => k + 1)
    } catch (e) {
      setRowError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function removeSession(idx: number) {
    if (!userId) { setRowError('Sign in to edit'); return }
    const point = rowsDesc[idx]
    if (!point) return
    setRowError(null)
    setBusy(true)
    try {
      const supabase = createClient()
      await deleteExerciseFromWorkout(supabase, {
        workoutId: point.workoutId,
        userId,
        exerciseId,
      })
      setOpenIdx(-1)
      setConfirmIdx(-1)
      setReloadKey(k => k + 1)
    } catch (e) {
      setRowError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function addSession(date: string, weightKg: number, reps: number) {
    if (!userId) throw new Error('Sign in to add a session')
    const supabase = createClient()
    await saveBackfillSession(supabase, {
      userId, date, exerciseId, exerciseName, weight: weightKg, reps,
    })
    setReloadKey(k => k + 1)
    setShowAdd(false)
  }

  const ready = !error && points !== null
  const hasGraph = windowReal.length >= 2
  const best = stats?.best ?? null

  // Caption delta across the windowed line (demo .hcap) — real sessions only.
  let cap: { cls: string; txt: string } | null = null
  if (hasGraph) {
    const dv = round1(windowReal[windowReal.length - 1].topWeight - windowReal[0].topWeight)
    const dispDv = round1(kgToDisplay(Math.abs(dv), units)) * (dv < 0 ? -1 : 1)
    cap = {
      cls: dv > 0 ? 'up' : dv < 0 ? 'soft' : 'flat',
      txt: dv > 0 ? `+${dispDv} ${unitLabel(units)}` : dv < 0 ? `${dispDv} ${unitLabel(units)}` : 'holding steady',
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="history-title">
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <header className={styles.head}>
          <div className={styles.headText}>
            <div className={styles.eyebrow}>history</div>
            <h2 id="history-title" className={styles.title}>{exerciseName}</h2>
          </div>
          <button type="button" className={styles.closeIcon} onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>

        {error && (
          <p className={styles.error}>
            Couldn&apos;t load history. <span className={styles.errorDetail}>{error}</span>
          </p>
        )}

        {!error && points === null && <p className={styles.loading}>Loading…</p>}

        {ready && (
          <>
            <div className={styles.rangeTabs} role="tablist" aria-label="Time range">
              {RANGES.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={range === key}
                  className={`${styles.rangeTab} ${range === key ? styles.rangeTabOn : ''}`}
                  onClick={() => { setRange(key); setSelIdx(null) }}
                >
                  {label}
                </button>
              ))}
            </div>

            {hasGraph ? (
              <div className={styles.graphCard}>
                <Sparkline points={windowReal} offPoints={windowOff} units={units} windowDays={rangeDays} onSelect={setSelIdx} />
                <div className={styles.axis}>
                  <span>{formatDay(axisStart)}</span>
                  <span>{formatDay(getLocalDateKey())}</span>
                </div>
                {cap && (
                  <div className={styles.cap}>
                    <span className={styles[capToneClass(cap.cls)]}>{cap.txt}</span> · {RANGE_LABEL[range]}
                  </div>
                )}
                {/* Per-set tally for the most recent session in view — every set's
                    reps kept (mint = hit target, amber = short / missed), so one
                    tired set is never read as the whole session. */}
                {(() => {
                  // Follow the scrubbed/tapped dot; default to the latest session.
                  const sel = (selIdx != null && selIdx < windowReal.length ? windowReal[selIdx] : null)
                    ?? windowReal[windowReal.length - 1]
                  if (!sel || sel.setReps.length === 0) return null
                  const totalReps = sel.setReps.reduce((a, s) => a + s.reps, 0)
                  return (
                    <div className={styles.setTally}>
                      <span className={styles.setTallyLabel}>{formatDay(sel.date)}</span>
                      <div className={styles.setTallyPills}>
                        {sel.setReps.map((s, k) => (
                          <span
                            key={k}
                            className={`${styles.setTallyPill} ${s.full ? styles.setTallyFull : styles.setTallyShort}`}
                          >
                            {s.reps}
                          </span>
                        ))}
                      </div>
                      <span className={styles.setTallyTotal}>{totalReps} reps</span>
                    </div>
                  )
                })()}
              </div>
            ) : (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}><TrendIcon /></div>
                <div className={styles.emptyMain}>
                  {windowReal.length === 1
                    ? `One session ${RANGE_LABEL[range]}.`
                    : `Nothing ${RANGE_LABEL[range]} yet.`}
                </div>
                <div className={styles.emptySub}>log another and your line starts here</div>
              </div>
            )}

            <div className={styles.stats}>
              <div className={styles.statCell}>
                <div className={styles.statLabel}>Sessions</div>
                <div className={styles.statValue}>{stats ? stats.sessions : 0}</div>
              </div>
              <div className={styles.statCell}>
                <div className={styles.statLabel}>Last 30 days</div>
                <div className={`${styles.statValue} ${last30Class(stats?.d30 ?? null)}`}>
                  {last30Text(stats?.d30 ?? null, units)}
                </div>
              </div>
              <div className={styles.statCell}>
                <div className={styles.statLabel}>Best</div>
                <div className={`${styles.statValue} ${styles.statValueGold}`}>
                  {best != null ? `${kgToDisplay(best, units)} ${unitLabel(units)}` : '—'}
                </div>
              </div>
            </div>

            <div className={styles.logWrap}>
              <div className={styles.cols}>
                <span>Date</span><span>Sets</span><span>Reps</span><span>Weight</span><span>Progress</span>
              </div>
              <div className={styles.log}>
                {rowsDesc.map((p, i) => {
                  const open = openIdx === i
                  // delta vs the chronologically-previous REAL session (skip
                  // off-days so an eased day never reads as a drop or a baseline).
                  const prevReal = (() => {
                    for (let j = i + 1; j < rowsDesc.length; j++) {
                      if (!rowsDesc[j].offDay) return rowsDesc[j]
                    }
                    return null
                  })()
                  const di = p.offDay
                    ? { cls: 'deltaOff', txt: 'off day' }
                    : deltaInfo(p.topWeight, prevReal ? prevReal.topWeight : null, units)
                  const isBest = !p.offDay && best != null && p.topWeight === best && i === firstBestIdx(rowsDesc, best)
                  return (
                    <div key={p.workoutId} className={`${styles.row} ${open ? styles.rowOpen : ''} ${p.offDay ? styles.rowOff : ''}`}>
                      <div
                        className={styles.rowMain}
                        onClick={() => { setRowError(null); setConfirmIdx(-1); setOpenIdx(open ? -1 : i) }}
                      >
                        <span className={styles.cDate}>
                          {p.offDay && <MoonGlyph />}
                          {formatDay(p.date)}
                        </span>
                        <span className={styles.c}>{p.setCount}</span>
                        <span className={styles.c}>{p.topReps}</span>
                        <span className={`${styles.w} ${isBest ? styles.wBest : ''}`}>
                          {isBest && <StarIcon />}
                          {kgToDisplay(p.topWeight, units)}<small>{unitLabel(units)}</small>
                        </span>
                        <span className={`${styles.delta} ${styles[di.cls]}`}>{di.txt}</span>
                      </div>
                      <div className={styles.edit}>
                        <div className={styles.editIn}>
                          <div className={styles.editRow}>
                            <Stepper
                              label="Sets"
                              value={String(p.setCount)}
                              disabled={busy || !userId}
                              onDown={() => commitEdit(i, 'sets', 'dn')}
                              onUp={() => commitEdit(i, 'sets', 'up')}
                            />
                            <Stepper
                              label="Reps"
                              value={String(p.topReps)}
                              disabled={busy || !userId}
                              onDown={() => commitEdit(i, 'reps', 'dn')}
                              onUp={() => commitEdit(i, 'reps', 'up')}
                            />
                            <Stepper
                              label="Weight"
                              value={String(kgToDisplay(p.topWeight, units))}
                              disabled={busy || !userId}
                              onDown={() => commitEdit(i, 'weight', 'dn')}
                              onUp={() => commitEdit(i, 'weight', 'up')}
                            />
                          </div>
                          {open && rowError && <p className={styles.editError}>{rowError}</p>}
                          <button
                            type="button"
                            className={styles.remove}
                            disabled={busy || !userId}
                            onClick={e => { e.stopPropagation(); setRowError(null); setConfirmIdx(i) }}
                          >
                            remove session
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {showAdd ? (
              <AddForm
                units={units}
                seed={realPoints[realPoints.length - 1] ?? points[points.length - 1]}
                disabled={!userId}
                onCancel={() => setShowAdd(false)}
                onSubmit={addSession}
              />
            ) : (
              <button type="button" className={styles.addBtn} onClick={() => setShowAdd(true)}>
                <PlusIcon /> log a session
              </button>
            )}
          </>
        )}
      </div>

      {/* Centered delete-session confirmation — a small dialog card layered on
          top of the history modal (same centered-overlay pattern as the modal
          itself), rather than an inline dropdown inside the log list. */}
      {confirmIdx >= 0 && rowsDesc[confirmIdx] && (
        <div
          className={styles.confirmOverlay}
          onClick={e => { e.stopPropagation(); if (!busy) setConfirmIdx(-1) }}
        >
          <div
            className={styles.confirmCard}
            role="alertdialog"
            aria-modal="true"
            aria-label="Remove this session"
            onClick={e => e.stopPropagation()}
          >
            <h3 className={styles.confirmTitle}>Remove this session?</h3>
            <p className={styles.confirmMsg}>
              This erases your {formatDay(rowsDesc[confirmIdx].date)} session and its logged
              weight from Vitality for good. There&apos;s no undo.
            </p>
            {rowError && <p className={styles.confirmError}>{rowError}</p>}
            <div className={styles.confirmBtns}>
              <button
                type="button"
                className={styles.confirmKeep}
                disabled={busy}
                onClick={e => { e.stopPropagation(); setConfirmIdx(-1) }}
              >
                keep it
              </button>
              <button
                type="button"
                className={styles.confirmRemove}
                disabled={busy || !userId}
                onClick={e => { e.stopPropagation(); removeSession(confirmIdx) }}
              >
                {busy ? 'removing…' : 'remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
   Sparkline + scrubber — geometry mirrors the demo (GW 320, GH 88,
   GPAD 12). Mint stroke, soft area fill, non-scaling stroke. Drag
   across to reveal the vertical line, the dot on the point, and a
   floating tag with that session's date + weight (+ delta).
   ────────────────────────────────────────────────────────────────── */

const GW = 320, GH = 88, GPAD = 12

function Sparkline({ points, offPoints, units, windowDays, onSelect }: { points: ExerciseHistoryPoint[]; offPoints: ExerciseHistoryPoint[]; units: Units; windowDays: number; onSelect?: (i: number | null) => void }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const lineRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)
  const tagRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef(false)
  // Last index sent up via onSelect — so the parent re-renders at most once per
  // dot-crossing (not every pointer-move frame), keeping the scrub imperative.
  const lastSentIdx = useRef<number | null>(null)

  // Off-day weights join the y-bounds so an eased grey dot still sits inside the
  // plot, but they never enter the line path / scrub (those stay real-only).
  const weights = [...points, ...offPoints].map(p => p.topWeight)
  const min = Math.min(...weights)
  const maxW = Math.max(...weights)
  // "Nice" rounded y-bounds (nearest 5) with a 5kg of headroom padded ABOVE and
  // BELOW the data, so the line sits mid-card with room to breathe instead of
  // pinned to the floor (a steady or low-weight lift used to read as "failing
  // at zero"). Weight stays truthful — only the framing changes. lo never goes
  // below 0; the span is kept a multiple of 10 so the mid gridline is clean.
  const lo = Math.max(0, Math.floor(min / 5) * 5 - 5)
  let hi = Math.ceil(maxW / 5) * 5 + 5
  if ((hi - lo) % 10 !== 0) hi += 5
  const mid = (lo + hi) / 2
  const yFor = (w: number) => GPAD + (GH - 2 * GPAD) * (1 - (w - lo) / (hi - lo))
  const gridVals = [hi, mid, lo]

  // X is placed by DATE inside the selected window, not evenly by index, so a
  // short run of recent sessions reads as a small blip on the right of a long
  // window (a year) and spreads wider as the window narrows (6M → 3M → M). The
  // right edge is "now"; the left edge is `windowDays` ago. For All, the window
  // is the data's own span (oldest session → now), so it fills the width.
  const oldestAgo = points.length ? daysAgo(points[0].date) : 0
  const domainDays = Number.isFinite(windowDays) ? windowDays : (oldestAgo || 1)
  const xFrac = (i: number): number => {
    if (points.length < 2) return 0.5
    const f = 1 - daysAgo(points[i].date) / domainDays
    return Math.min(1, Math.max(0, f))
  }
  // Date → x for markers that aren't on the line (off-day dots + axis ticks).
  const xPosFor = (date: string): number =>
    GPAD + (GW - 2 * GPAD) * Math.min(1, Math.max(0, 1 - daysAgo(date) / domainDays))

  const pt = (i: number): [number, number] => {
    const x = GPAD + (GW - 2 * GPAD) * xFrac(i)
    const y = yFor(points[i].topWeight)
    return [x, y]
  }
  const pts = points.map((_, i) => pt(i))
  const xs = pts.map(p => p[0])
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]
  const areaD = `${d} L${pts[pts.length - 1][0].toFixed(1)} ${GH} L${pts[0][0].toFixed(1)} ${GH} Z`

  function show(on: boolean) {
    lineRef.current?.classList.toggle(styles.scrubLineShow, on)
    dotRef.current?.classList.toggle(styles.scrubDotShow, on)
    tagRef.current?.classList.toggle(styles.scrubTagShow, on)
  }
  function move(clientX: number) {
    const box = boxRef.current
    const line = lineRef.current
    const dot = dotRef.current
    const tag = tagRef.current
    if (!box || !line || !dot || !tag) return
    const r = box.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    // Points are no longer evenly spaced, so snap to the nearest one by x.
    const pointerXv = frac * GW
    let i = 0, bestD = Infinity
    for (let k = 0; k < xs.length; k++) {
      const dd = Math.abs(xs[k] - pointerXv)
      if (dd < bestD) { bestD = dd; i = k }
    }
    // Hand the snapped index up to the parent (which moves the rep chips to this
    // session) — but only when it actually changes, so we don't re-render the
    // modal every pointer-move frame.
    if (onSelect && i !== lastSentIdx.current) { lastSentIdx.current = i; onSelect(i) }
    const [xv, yv] = pt(i)
    const xpx = (xv / GW) * r.width
    const ypx = (yv / GH) * r.height
    // Line + dot stay anchored on the actual point.
    line.style.left = `${xpx}px`
    dot.style.left = `${xpx}px`; dot.style.top = `${ypx}px`
    tag.style.top = `${ypx}px`
    const prev = points[i - 1]
    const up = prev ? points[i].topWeight >= prev.topWeight : true
    dot.style.background = up ? '#6EE7B7' : '#f08a8a'
    let deltaHtml = ''
    if (prev) {
      const dvKg = round1(points[i].topWeight - prev.topWeight)
      const dvDisp = round1(kgToDisplay(Math.abs(dvKg), units)) * (dvKg < 0 ? -1 : 1)
      const cls = dvKg >= 0 ? styles.upc : styles.downc
      deltaHtml = `<span class="${styles.scrubTagDelta} ${cls}">${dvKg >= 0 ? '▲ +' + dvDisp : '▼ ' + dvDisp}</span>`
    }
    tag.innerHTML =
      `<span class="${styles.scrubTagDate}">${formatDay(points[i].date)}</span>` +
      `<span class="${styles.scrubTagWeight}">${kgToDisplay(points[i].topWeight, units)} ${unitLabel(units)}</span>` +
      `<span class="${styles.scrubTagReps}">${points[i].setCount} × ${points[i].topReps} reps</span>` +
      deltaHtml
    // Clamp the tag inside the graph box so it never gets cropped at the edges.
    // The tag is centered on its `left` (translateX(-50%)), so keep its left
    // within [halfWidth+pad, boxWidth-halfWidth-pad]. Measured AFTER innerHTML
    // so we have the real width (it changes with the delta chip).
    const pad = 6
    const half = tag.offsetWidth / 2
    const min = half + pad
    const max = r.width - half - pad
    const tagLeft = max < min ? r.width / 2 : Math.max(min, Math.min(xpx, max))
    tag.style.left = `${tagLeft}px`
  }

  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    activeRef.current = true
    lastSentIdx.current = null // re-evaluate selection on each fresh touch
    boxRef.current?.setPointerCapture(e.pointerId)
    show(true)
    move(e.clientX)
  }
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (activeRef.current) move(e.clientX)
  }
  function end() { activeRef.current = false; show(false) }

  return (
    <div className={styles.graph}>
      <div
        ref={boxRef}
        className={styles.graphBox}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
      >
        <svg viewBox={`0 0 ${GW} ${GH}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="hg-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6EE7B7" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#6EE7B7" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* horizontal gridlines (framed-grid style) */}
          {gridVals.map((v, gi) => (
            <line
              key={`grid-${gi}`}
              x1="0" y1={yFor(v).toFixed(1)} x2={GW} y2={yFor(v).toFixed(1)}
              stroke="rgba(255,255,255,0.08)" strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path d={areaD} fill="url(#hg-fill)" stroke="none" />
          <path
            d={d}
            className={styles.line}
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
          {/* A dot on every session (not just the latest) so each logged day is
              a visible marker — scrub/tap any one to read its sets × reps. */}
          {pts.map((p, i) => (
            i < pts.length - 1 ? (
              <circle
                key={`dot-${i}`}
                cx={p[0].toFixed(1)}
                cy={p[1].toFixed(1)}
                r="2.6"
                className={styles.dot}
                /* Color-code each session by its weight trend (mint = held or up,
                   soft coral = down), matching the scrub dot's up/down palette. */
                style={{ fill: i > 0 && points[i].topWeight < points[i - 1].topWeight ? '#f08a8a' : '#6EE7B7' }}
                vectorEffect="non-scaling-stroke"
              />
            ) : null
          ))}
          {/* Dotted drop line from the last logged point down to the baseline,
              so the most recent session reads at its real date on the axis
              (the line's right end is "now", which is usually after it). */}
          <line
            x1={last[0].toFixed(1)} y1={last[1].toFixed(1)}
            x2={last[0].toFixed(1)} y2={GH}
            className={styles.dropLine}
            strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={last[0].toFixed(1)}
            cy={last[1].toFixed(1)}
            r="3.5"
            className={`${styles.dotLast} ${points[points.length - 1]?.partial ? styles.dotLastPartial : ''}`}
            vectorEffect="non-scaling-stroke"
          />
          {/* Off / sick days: a soft twilight dot OFF the line (no dip), plus a
              moon tick on the baseline — present but never part of progression. */}
          {offPoints.map((op, k) => (
            <circle
              key={`off-${k}`}
              cx={xPosFor(op.date).toFixed(1)}
              cy={yFor(op.topWeight).toFixed(1)}
              r="2.6"
              className={styles.dotOff}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {offPoints.map((op, k) => (
            <line
              key={`offtick-${k}`}
              x1={xPosFor(op.date).toFixed(1)} y1={GH - 4}
              x2={xPosFor(op.date).toFixed(1)} y2={GH}
              className={styles.offTick}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        <div className={styles.gridLabels} aria-hidden>
          {gridVals.map((v, gi) => (
            <span
              key={`gl-${gi}`}
              className={styles.gridLabel}
              style={{ top: `${(yFor(v) / GH) * 100}%` }}
            >
              {kgToDisplay(v, units)}
            </span>
          ))}
        </div>
        {/* Date of the last logged session, anchored under its drop line at the
            point's real x (the scrub tag floats above the line, so they clear). */}
        <div
          className={styles.dropLabel}
          style={{ left: `${(last[0] / GW) * 100}%` }}
          aria-hidden
        >
          {formatDay(points[points.length - 1].date)}
        </div>
        <div ref={lineRef} className={styles.scrubLine} />
        <div ref={dotRef} className={styles.scrubDot} />
        <div ref={tagRef} className={styles.scrubTag} />
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
   Mini stepper (demo stepMini) — −/+ around a value, one editable
   field. Each press commits to the real save path.
   ────────────────────────────────────────────────────────────────── */

function Stepper({
  label, value, disabled, onDown, onUp,
}: {
  label: string
  value: string
  disabled: boolean
  onDown: () => void
  onUp: () => void
}) {
  return (
    <div className={styles.step}>
      <span className={styles.stepLabel}>{label}</span>
      <div className={styles.stepControls}>
        <button
          type="button"
          className={styles.stepBtn}
          disabled={disabled}
          onClick={e => { e.stopPropagation(); onDown() }}
          aria-label={`decrease ${label}`}
        >−</button>
        <span className={styles.stepValue}>{value}</span>
        <button
          type="button"
          className={styles.stepBtn}
          disabled={disabled}
          onClick={e => { e.stopPropagation(); onUp() }}
          aria-label={`increase ${label}`}
        >+</button>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
   Add-a-session form (demo openCustomLog) — date / reps / weight,
   saved against the real backfill path.
   ────────────────────────────────────────────────────────────────── */

function AddForm({
  units, seed, disabled, onCancel, onSubmit,
}: {
  units: Units
  seed?: ExerciseHistoryPoint
  disabled: boolean
  onCancel: () => void
  onSubmit: (date: string, weightKg: number, reps: number) => Promise<void>
}) {
  // "Log a session" backfills a PAST session you forgot to log in the app —
  // today's session belongs in the live logger. Cap the picker at yesterday so a
  // today-dated backfill can't create a parallel "(history)" row: that row shows
  // in this graph as a phantom PR but stays invisible to (and un-clearable from)
  // the day view, so it never self-cleans. (See saveBackfillSession's day_name.)
  const latestBackfill = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return getLocalDateKey(d) })()
  const [date, setDate] = useState(latestBackfill)
  const [weight, setWeight] = useState(seed ? String(kgToDisplay(seed.topWeight, units)) : '')
  const [reps, setReps] = useState(seed ? String(seed.topReps) : '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    const w = parseFloat(weight)
    const r = parseInt(reps, 10)
    if (!Number.isFinite(w) || w <= 0) { setErr('Enter a weight.'); return }
    if (!Number.isFinite(r) || r <= 0) { setErr('Enter reps.'); return }
    if (w > MAX_WEIGHT_DISPLAY) { setErr('That weight looks too high — double-check?'); return }
    if (r > MAX_REPS) { setErr('That rep count looks too high — double-check?'); return }
    setBusy(true)
    try {
      await onSubmit(date, displayToKg(w, units), r)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className={styles.clog} onSubmit={submit}>
      <div className={styles.clogRow}>
        <label className={styles.clogLabel}>Date</label>
        <input
          type="date"
          value={date}
          max={latestBackfill}
          onChange={e => setDate(e.target.value)}
          required
        />
      </div>
      <div className={styles.clogGrid3}>
        <div className={styles.clogRow}>
          <label className={styles.clogLabel}>Reps</label>
          <input
            type="number"
            inputMode="numeric"
            placeholder="8"
            value={reps}
            min={1}
            onChange={e => setReps(e.target.value)}
            required
          />
        </div>
        <div className={styles.clogRow}>
          <label className={styles.clogLabel}>Weight ({unitLabel(units)})</label>
          <input
            type="number"
            inputMode="decimal"
            step="2.5"
            placeholder="20"
            value={weight}
            min={0}
            onChange={e => setWeight(e.target.value)}
            required
            autoFocus
          />
        </div>
      </div>
      {disabled && <p className={styles.clogHint}>Sign in to save past sessions.</p>}
      {err && <p className={styles.clogError}>{err}</p>}
      <div className={styles.clogBtns}>
        <button type="button" className={styles.clogCancel} onClick={onCancel} disabled={busy}>cancel</button>
        <button type="submit" className={styles.clogSave} disabled={busy || disabled}>
          {busy ? 'saving…' : 'log it'}
        </button>
      </div>
    </form>
  )
}

/* ── helpers ──────────────────────────────────────────────────────── */

function round1(n: number): number { return Math.round(n * 10) / 10 }

/** Local-date day count from today (never UTC `new Date(str)`). */
function daysAgo(yyyyMmDd: string): number {
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  const then = new Date(y, m - 1, d).getTime()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((today.getTime() - then) / 86400000)
}

/** Local-date key for `n` days before today (window start for the axis). */
function dateDaysAgo(n: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return getLocalDateKey(d)
}

function filterByRange(points: ExerciseHistoryPoint[], range: RangeKey): ExerciseHistoryPoint[] {
  const win = (RANGES.find(r => r[0] === range) ?? RANGES[5])[2]
  if (!Number.isFinite(win)) return points
  return points.filter(p => daysAgo(p.date) <= win)
}

function formatDay(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function deltaInfo(curKg: number, prevKg: number | null, units: Units): { cls: string; txt: string } {
  if (prevKg == null) return { cls: 'deltaFlat', txt: 'first' }
  const dKg = round1(curKg - prevKg)
  const dDisp = round1(kgToDisplay(Math.abs(dKg), units)) * (dKg < 0 ? -1 : 1)
  if (dKg > 0) return { cls: 'deltaUp', txt: `+${dDisp}` }
  if (dKg < 0) return { cls: 'deltaSoft', txt: String(dDisp) }
  return { cls: 'deltaFlat', txt: '+0' }
}

function firstBestIdx(rowsDesc: ExerciseHistoryPoint[], best: number): number {
  // Highlight the most-recent REAL session that hit the best (newest-first list).
  // Off-days are excluded from best, so they never claim the star.
  return rowsDesc.findIndex(p => !p.offDay && p.topWeight === best)
}

function capToneClass(cls: string): 'up' | 'soft' | 'flat' {
  return cls === 'up' ? 'up' : cls === 'soft' ? 'soft' : 'flat'
}

function last30Class(d30: number | null): string {
  if (d30 == null) return styles.statValueFlat
  if (d30 > 0) return styles.statValueUp
  if (d30 < 0) return styles.statValueSoft
  return styles.statValueFlat
}
function last30Text(d30: number | null, units: Units): string {
  if (d30 == null) return 'new'
  const disp = round1(kgToDisplay(Math.abs(d30), units)) * (d30 < 0 ? -1 : 1)
  return `${d30 > 0 ? '+' : ''}${disp} ${unitLabel(units)}`
}

/* ── icons (port of demo HI / X / PLUS / STARSM) ──────────────────── */

function CloseIcon() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <path d="M3.5 3.5 L10.5 10.5 M10.5 3.5 L3.5 10.5" />
    </svg>
  )
}
function PlusIcon() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
      <path d="M7 3 V11 M3 7 H11" />
    </svg>
  )
}
function TrendIcon() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 10 L5 7 L7.5 9 L12 4" />
      <path d="M9 4 L12 4 L12 7" />
    </svg>
  )
}
function StarIcon() {
  return (
    <svg className={styles.gstar} viewBox="0 0 14 14" fill="currentColor">
      <path d="M7 .9 L8.7 5 L13 5.3 L9.6 8 L10.8 12.2 L7 9.8 L3.2 12.2 L4.4 8 L1 5.3 L5.3 5 Z" />
    </svg>
  )
}
function MoonGlyph() {
  // Small twilight crescent that prefixes an off-day's date in the log list.
  return (
    <svg className={styles.moonGlyph} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z" />
    </svg>
  )
}
