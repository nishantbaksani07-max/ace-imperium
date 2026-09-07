'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { DetailedHour } from './curve'
import { scoreAtHour, scoreColorFor, tierFor } from './curve'
import { DAY_START, DAY_END } from './dayModel'
import type { PeakWindow, ScheduledEvent, SubjectiveTap, SubstanceLog } from './types'
import { EVENT_TYPE_TONE } from './schedule'
import { ScoreBreakdown } from './ScoreBreakdown'
import HoverGauge from './HoverGauge'
import ScheduleStrip from './ScheduleStrip'
import styles from './peak.module.css'

type Mode = 'line' | 'bars' | 'stack'

/** One draggable schedule block laid over the curve (Peak page only). A `ghost`
 *  pill is an untimed task auto-placed for preview — dragging it pins a time. */
export interface CurvePill {
  id: string
  start: number
  end: number
  name: string
  color: string
  locked?: boolean
  ghost?: boolean
}

/** A staged drag that would land on other blocks — drives the Fit/Override prompt. */
export interface CurveOverlap {
  id: string
  start: number
  end: number
  conflicts: string[]
}

interface Props {
  curve: DetailedHour[]
  /** Optional no-stimulants reference curve (25 hourly scores). When given and
   *  it differs from `curve`, it's drawn as a faint dotted line — "where your
   *  day sits without the caffeine/alcohol you logged", with the solid line
   *  showing the real, stim-adjusted projection on top. */
  baselineCurve?: number[]
  windows: PeakWindow[]
  nowHour: number
  events?: ScheduledEvent[]
  taps?: SubjectiveTap[]
  /** Today's substance logs — shown as pips in the connected schedule lane. */
  logs?: SubstanceLog[]
  /** Reports the chart's rendered width (kept for parents that still need it). */
  onWidthChange?: (w: number) => void
  /** Tap "Plan something here" inside the popover. */
  onPlanHour?: (hour: number) => void
  /** "Open Schedule →" on the connected lane. */
  onOpenSchedule?: () => void
  /** Log a subjective "how I feel overall" reading from the draggable line on
   *  the chart (value is the −100..+100 dial, same as MoodPicker). Each drag is
   *  timestamped, so checking in every visit teaches the model your real day.
   *  Omitted → the line isn't rendered. */
  onLogFeeling?: (value: number) => void

  // ── Interactive schedule layer (opt-in; Peak page only). When `pills` is
  //    supplied the chart renders a draggable lane over the lower plot. Left
  //    undefined (e.g. PeakHeaderBand on the dashboard), behaviour is unchanged.
  pills?: CurvePill[]
  /** Drop a pill at a new start hour (controller decides Fit/Override). */
  onMovePill?: (id: string, startHour: number) => void
  /** Toggle a pill's lock pin. */
  onToggleLock?: (id: string) => void
  /** Click an empty stretch of the lane to arm that gap for the next add. */
  onArmWindow?: (start: number, end: number) => void
  /** The currently armed gap window (highlighted in the lane). */
  armed?: { start: number; end: number } | null
  /** A staged overlapping move awaiting Fit/Override/Cancel. */
  pendingOverlap?: CurveOverlap | null
  onResolveOverlap?: (choice: 'fit' | 'override' | 'cancel') => void
}

/** Faint band colours for events drawn behind the lower part of the graph. */
const EVENT_BAND: Record<string, { color: string; bg: string }> = {
  mint: { color: '#6EE7B7', bg: 'rgba(110,231,183,0.12)' },
  amber: { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  red: { color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
  muted: { color: 'rgba(255,255,255,0.5)', bg: 'rgba(255,255,255,0.05)' },
}

const PAD = { top: 18, right: 24, bottom: 32, left: 24 }
const RANGE = 24 // always full-day; the prototype dropped zoom for chart modes

function fmtTick(h: number): string {
  if (h === 0 || h === 24) return '12A'
  if (h === 12) return '12P'
  return h < 12 ? `${h}A` : `${h - 12}P`
}

function fmtHour(h: number): string {
  const r = Math.round(h)
  if (r === 0 || r === 24) return '12 AM'
  if (r === 12) return '12 PM'
  return r < 12 ? `${r} AM` : `${r - 12} PM`
}

const TIER_COLOR_HEX: Record<string, string> = {
  Peak: '#6EE7B7',
  Solid: '#6EE7B7',
  Tired: '#F59E0B',
  Low: '#d97706',
  Drained: '#EF4444',
}

/**
 * Hero chart — moved to the top of the page. Three modes:
 *   · Line  — smooth glowing mint curve + area fill + peak-window bands
 *   · Bars  — 25 hourly columns, staggered rise
 *   · Stack — segmented columns showing baseline + substance contributions
 *
 * A live hover gauge sits in the header and a red→green cursor pill scrubs
 * with the pointer. Tap any hour for the per-hour breakdown popover. The
 * layered entrance (line draw / bar rise / window fade / now pulse) replays
 * on mount and on every mode switch.
 */
export default function CurveChart({ curve, baselineCurve, windows, nowHour, events = [], taps = [], logs = [], onWidthChange, onPlanHour, onOpenSchedule, onLogFeeling, pills, onMovePill, onToggleLock, onArmWindow, armed, pendingOverlap, onResolveOverlap }: Props) {
  const [mode, setMode] = useState<Mode>('line')
  const [selectedHour, setSelectedHour] = useState<number | null>(null)
  const [hoverHour, setHoverHour] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(960)
  const height = 320

  const scores = useMemo(() => curve.map(c => c.score), [curve])

  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.round(e.contentRect.width)
        setWidth(w)
        onWidthChange?.(w)
      }
    })
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [onWidthChange])

  const innerW = width - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom
  const colN = 25
  const colGap = (innerW / colN) * 0.3
  const colW = innerW / colN - colGap

  function xForHour(h: number): number {
    return PAD.left + (h / RANGE) * innerW
  }
  function xForCol(i: number): number {
    return PAD.left + i * (colW + colGap) + colGap / 2
  }
  function yForScore(s: number): number {
    return PAD.top + (1 - s / 100) * innerH
  }
  function hourForX(px: number): number {
    return Math.max(0, Math.min(24, ((px - PAD.left) / innerW) * RANGE))
  }
  // Inverse of yForScore — a pixel y back to a 0–100 value, for the feeling line.
  function pctForY(py: number): number {
    return Math.max(0, Math.min(100, (1 - (py - PAD.top) / innerH) * 100))
  }

  // Interactive lane geometry — a horizontal strip near the bottom of the plot
  // where the draggable pills live (kept clear of the curve itself).
  const interactive = pills != null
  const LANE_H = 46
  const laneTop = PAD.top + innerH - LANE_H - 4

  // The free stretch around a clicked hour, bounded by neighbouring pills and
  // the day's working hours. Null if the click lands inside a block.
  function gapAround(hour: number): { start: number; end: number } | null {
    const busy = (pills ?? []).map(p => [p.start, p.end] as [number, number]).sort((a, b) => a[0] - b[0])
    for (const [s, e] of busy) if (hour > s && hour < e) return null
    let lo = DAY_START
    let hi = DAY_END
    for (const [s, e] of busy) {
      if (e <= hour && e > lo) lo = e
      if (s >= hour && s < hi) hi = s
    }
    if (hi - lo < 0.5) return null
    return { start: lo, end: hi }
  }

  // Smooth path: Catmull-Rom → cubic Bezier control points.
  const linePath = useMemo(() => {
    const pts: Array<[number, number]> = []
    for (let i = 0; i <= 24; i++) {
      pts.push([xForHour(i), yForScore(curve[i]?.score ?? 0)])
    }
    if (pts.length < 2) return ''
    let d = `M ${pts[0][0]} ${pts[0][1]}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[i + 2] || p2
      const c1x = p1[0] + (p2[0] - p0[0]) / 6
      const c1y = p1[1] + (p2[1] - p0[1]) / 6
      const c2x = p2[0] - (p3[0] - p1[0]) / 6
      const c2y = p2[1] - (p3[1] - p1[1]) / 6
      d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`
    }
    return d
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curve, width])

  const areaPath = linePath ? `${linePath} L ${xForHour(24)} ${height - PAD.bottom} L ${xForHour(0)} ${height - PAD.bottom} Z` : ''

  // Dotted "without your stims" reference line — same Catmull-Rom smoothing as
  // the solid line, only drawn when a baseline was passed AND it visibly differs
  // from the real curve (i.e. a stimulant/depressant is actually logged today).
  const showBaseline =
    !!baselineCurve && curve.some((c, i) => Math.abs((c?.score ?? 0) - (baselineCurve[i] ?? 0)) > 0.5)
  const baselinePath = useMemo(() => {
    if (!baselineCurve) return ''
    const pts: Array<[number, number]> = []
    for (let i = 0; i <= 24; i++) pts.push([xForHour(i), yForScore(baselineCurve[i] ?? 0)])
    if (pts.length < 2) return ''
    let d = `M ${pts[0][0]} ${pts[0][1]}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[i + 2] || p2
      const c1x = p1[0] + (p2[0] - p0[0]) / 6
      const c1y = p1[1] + (p2[1] - p0[1]) / 6
      const c2x = p2[0] - (p3[0] - p1[0]) / 6
      const c2y = p2[1] - (p3[1] - p1[1]) / 6
      d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`
    }
    return d
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baselineCurve, width])

  const nowScore = scoreAtHour(scores, nowHour)
  const nowTierColor = TIER_COLOR_HEX[tierFor(nowScore)]

  // The feeling line starts at today's most-recent subjective tap (so each visit
  // nudges from where you left it), or mid-scale on a blank day. The dial value
  // is −100..+100; map to a 0–100% reading.
  const latestTap = taps.length ? taps[taps.length - 1] : null
  const feelInitialPct = latestTap ? Math.max(0, Math.min(100, latestTap.value / 2 + 50)) : 50

  const ticks = [0, 3, 6, 9, 12, 15, 18, 21, 24]

  const popoverPos = useMemo(() => {
    if (selectedHour == null) return null
    const x = xForCol(selectedHour)
    const barRight = x + colW + 12
    const overflows = barRight + 320 > width - 12
    const leftPx = overflows ? x - 320 - 12 : barRight
    return { left: Math.max(12, leftPx), top: 12 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHour, width])

  function handlePointerMove(e: React.PointerEvent) {
    const host = stageRef.current
    if (!host) return
    const rect = host.getBoundingClientRect()
    const relX = e.clientX - rect.left
    const hr = ((relX - PAD.left) / innerW) * RANGE
    setHoverHour(Math.max(0, Math.min(24, hr)))
  }

  return (
    <div className={styles.piChartCard}>
      <div className={styles.piChartHead}>
        <div className={styles.piChartHeadLeft}>
          <HoverGauge curve={scores} hoverHour={hoverHour} nowHour={nowHour} />
          <div className={styles.piChartCaption}>
            <div className={styles.piEyebrow}>Today’s energy curve</div>
            <div style={{ color: 'var(--muted-strong)', fontSize: 13, marginTop: 3, maxWidth: 280 }}>
              Your predicted score, hour by hour. Hover the curve to scrub.
            </div>
          </div>
        </div>
        <ModePicker value={mode} onChange={setMode} />
      </div>

      <div
        ref={stageRef}
        className={styles.piChartStage}
        key={mode}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverHour(null)}
      >
        <div ref={wrapRef} style={{ position: 'relative' }}>
          <svg
            width="100%"
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            style={{ display: 'block', overflow: 'visible' }}
          >
            <defs>
              <linearGradient id="peak-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#6EE7B7" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#6EE7B7" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="peak-stroke" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#d4fce8" stopOpacity="1" />
                <stop offset="60%" stopColor="#6EE7B7" stopOpacity="1" />
                <stop offset="100%" stopColor="#6EE7B7" stopOpacity="0.95" />
              </linearGradient>
              <linearGradient id="peak-tier-band" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#6EE7B7" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#6EE7B7" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="peak-col" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#6EE7B7" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#6EE7B7" stopOpacity="0.25" />
              </linearGradient>
              <filter id="peak-line-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="6" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Tier band 80–100 */}
            <rect x={PAD.left} y={yForScore(100)} width={innerW} height={yForScore(80) - yForScore(100)} fill="url(#peak-tier-band)" opacity={0.5} />

            {/* Gridlines */}
            {[20, 40, 60, 80].map(s => (
              <line key={s} x1={PAD.left} x2={width - PAD.right} y1={yForScore(s)} y2={yForScore(s)} stroke="rgba(255,255,255,0.08)" strokeDasharray="2 4" />
            ))}

            {/* Peak window highlights */}
            {windows.map((w, i) => {
              const x0 = xForHour(w.start)
              const x1 = xForHour(w.end)
              return <rect key={i} className={styles.piWindowFade} x={x0 - 2} y={PAD.top} width={x1 - x0 + 4} height={innerH} fill="#6EE7B7" rx={3} />
            })}

            {/* Event bands — drawn behind the curve in the lower part of the
                plot so you can read each event against the day's shape. Skipped
                in interactive mode, where draggable pills take their place. */}
            {!interactive && events.map(e => {
              const x0 = xForHour(Math.max(0, e.startHour))
              const x1 = xForHour(Math.min(24, e.endHour))
              const w = Math.max(2, x1 - x0)
              const band = EVENT_BAND[EVENT_TYPE_TONE[e.type]] || EVENT_BAND.muted
              const bandH = innerH * 0.42
              const y = PAD.top + innerH - bandH
              return (
                <g key={e.id}>
                  <rect x={x0} y={y} width={w} height={bandH} fill={band.bg} stroke={`${band.color}33`} rx={4} />
                  <rect x={x0} y={y} width={w} height={2} fill={band.color} opacity={0.6} rx={1} />
                  {w > 56 && (
                    <text
                      x={x0 + 7}
                      y={y + 14}
                      fontFamily="var(--font-inter), sans-serif"
                      fontSize={10}
                      fontWeight={500}
                      fill={band.color}
                      letterSpacing="0.04em"
                    >
                      {e.title}
                    </text>
                  )}
                </g>
              )
            })}

            {showBaseline && baselinePath && (
              <path
                d={baselinePath}
                fill="none"
                stroke="rgba(180,196,186,0.45)"
                strokeWidth={1.6}
                strokeDasharray="2 5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {mode === 'line' && (
              <>
                <path className={styles.piAreaFade} d={areaPath} fill="url(#peak-area)" />
                <path
                  className={styles.piLineDraw}
                  d={linePath}
                  fill="none"
                  stroke="url(#peak-stroke)"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#peak-line-glow)"
                />
              </>
            )}

            {mode === 'bars' &&
              curve.map((c, i) => {
                const x = xForCol(i)
                const barH = (c.score / 100) * innerH
                const y = PAD.top + innerH - barH
                const isNow = Math.abs(i - nowHour) < 0.5
                return (
                  <rect
                    key={i}
                    className={styles.piBarRise}
                    x={x}
                    y={y}
                    width={colW}
                    height={barH}
                    fill="url(#peak-col)"
                    rx={1.5}
                    style={{
                      animationDelay: `${i * 22}ms`,
                      filter: isNow ? 'drop-shadow(0 0 6px rgba(110,231,183,0.45))' : undefined,
                    }}
                  />
                )
              })}

            {mode === 'stack' &&
              curve.map((c, i) => {
                const x = xForCol(i)
                let cursorY = PAD.top + innerH
                return (
                  <g key={i} className={styles.piBarRise} style={{ animationDelay: `${i * 22}ms` }}>
                    {c.segments.map((seg, si) => {
                      const segH = Math.max(0, (Math.abs(seg.value) / 100) * innerH * c.mult)
                      const top = cursorY - segH
                      cursorY = top
                      const fill =
                        seg.source === 'baseline' ? 'rgba(110,231,183,0.35)' : seg.value < 0 ? '#EF4444' : '#6EE7B7'
                      return <rect key={si} x={x} y={top} width={colW} height={segH} fill={fill} opacity={seg.value < 0 ? 0.45 : 0.9} rx={1.5} />
                    })}
                  </g>
                )
              })}

            {/* Subjective tap dots */}
            {taps.map(t => {
              const d = new Date(t.time)
              const h = d.getHours() + d.getMinutes() / 60
              const x = xForHour(h)
              const color = t.value >= 20 ? '#6EE7B7' : t.value >= -20 ? 'rgba(255,255,255,0.5)' : t.value >= -60 ? '#F59E0B' : '#EF4444'
              return <circle key={t.id} cx={x} cy={height - PAD.bottom + 16} r={4} fill={color} />
            })}

            {/* Now indicator */}
            <g className={styles.piNowFade}>
              <line x1={xForHour(nowHour)} x2={xForHour(nowHour)} y1={PAD.top} y2={PAD.top + innerH} stroke="rgba(255,255,255,0.32)" strokeDasharray="2 3" />
              <circle className={styles.piNowPulse} cx={xForHour(nowHour)} cy={yForScore(nowScore)} r={12} fill={nowTierColor} opacity={0.35} />
              <circle cx={xForHour(nowHour)} cy={yForScore(nowScore)} r={5} fill={nowTierColor} style={{ filter: `drop-shadow(0 0 10px ${nowTierColor})` }} />
              <circle cx={xForHour(nowHour)} cy={yForScore(nowScore)} r={2.5} fill="#fff" />
            </g>

            {/* X axis */}
            {ticks.map(t => (
              <text
                key={t}
                x={xForHour(t)}
                y={height - 6}
                textAnchor="middle"
                fontFamily="var(--font-inter), sans-serif"
                fontSize={10}
                fill="rgba(255,255,255,0.6)"
                letterSpacing="0.06em"
              >
                {fmtTick(t)}
              </text>
            ))}
          </svg>

          {/* Live scrubbing cursor readout */}
          {hoverHour != null && (
            <ChartHover curve={scores} hoverHour={hoverHour} width={width} height={height} snap={mode !== 'line'} xForHour={xForHour} yForScore={yForScore} />
          )}

          {/* Invisible per-hour tap targets */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {curve.map((_, i) => {
              const x = mode === 'line' ? xForHour(i) - colW / 2 : xForCol(i) - 2
              const isSelected = selectedHour === i
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedHour(selectedHour === i ? null : i)}
                  aria-label={`Hour ${i}`}
                  style={{
                    position: 'absolute',
                    left: x,
                    top: 0,
                    width: colW + 4,
                    height: height - PAD.bottom,
                    background: isSelected ? 'rgba(110,231,183,0.04)' : 'transparent',
                    border: isSelected ? '1px dashed rgba(110,231,183,0.7)' : 'none',
                    borderRadius: 4,
                    pointerEvents: 'auto',
                    cursor: 'pointer',
                    padding: 0,
                    transition: 'background 180ms cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                />
              )
            })}
          </div>

          {/* Interactive schedule lane (opt-in) — draggable pills + click-to-arm
              gap windows, laid over the lower plot. */}
          {interactive && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: laneTop, height: LANE_H, zIndex: 7 }}>
              {/* Empty-stretch click target — arms the surrounding gap. */}
              <div
                onClick={(e) => {
                  const host = wrapRef.current
                  if (!host) return
                  const rect = host.getBoundingClientRect()
                  const g = gapAround(hourForX(e.clientX - rect.left))
                  if (g) onArmWindow?.(g.start, g.end)
                }}
                title="Click an empty stretch to plan a task here"
                style={{ position: 'absolute', inset: 0, cursor: 'copy' }}
              />

              {/* Armed gap highlight */}
              {armed && (
                <div
                  style={{
                    position: 'absolute',
                    left: xForHour(armed.start),
                    width: Math.max(4, xForHour(armed.end) - xForHour(armed.start)),
                    top: 0,
                    bottom: 0,
                    background: 'rgba(110,231,183,0.10)',
                    border: '1px dashed rgba(110,231,183,0.65)',
                    borderRadius: 7,
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--mint)', whiteSpace: 'nowrap' }}>
                    type a task →
                  </span>
                </div>
              )}

              {/* Now marker */}
              <div
                style={{
                  position: 'absolute',
                  left: xForHour(nowHour),
                  top: -6,
                  transform: 'translateX(-50%)',
                  fontSize: 8.5,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.45)',
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                now
              </div>

              {/* Pills */}
              {pills!.map(p => (
                <SchedulePill
                  key={p.id}
                  pill={p}
                  laneH={LANE_H}
                  wrapRef={wrapRef}
                  xForHour={xForHour}
                  hourForX={hourForX}
                  onMove={onMovePill}
                  onToggleLock={onToggleLock}
                />
              ))}
            </div>
          )}

          {/* Draggable "how I feel" line — set it against the curve to log a
              timestamped subjective reading on every visit. */}
          {onLogFeeling && (
            <FeelingLine
              initialPct={feelInitialPct}
              width={width}
              nowX={xForHour(nowHour)}
              yForScore={yForScore}
              pctForY={pctForY}
              wrapRef={wrapRef}
              onLog={onLogFeeling}
            />
          )}
        </div>

        {selectedHour != null && popoverPos && (
          <div className={styles.piPopover} style={{ left: popoverPos.left, top: popoverPos.top }}>
            <ScoreBreakdown curve={curve} hour={selectedHour} onClose={() => setSelectedHour(null)} floating onPlan={onPlanHour} />
          </div>
        )}

        {interactive && pendingOverlap && (
          <OverlapPrompt
            start={pendingOverlap.start}
            end={pendingOverlap.end}
            onResolve={(c) => onResolveOverlap?.(c)}
          />
        )}
      </div>

      {/* Connected schedule lane — shares the chart's exact x-axis so events
          line up with the curve above (and with their bands behind it). */}
      <div className={styles.piChartSchedule}>
        <ScheduleStrip
          width={width}
          events={events}
          logs={logs}
          taps={taps}
          nowHour={nowHour}
          padX={PAD.left}
          onOpenSchedule={onOpenSchedule}
        />
      </div>
    </div>
  )
}

interface ChartHoverProps {
  curve: number[]
  hoverHour: number
  width: number
  height: number
  snap?: boolean
  xForHour: (h: number) => number
  yForScore: (s: number) => number
}

/** Floating cursor pill — number + colour track how good the hovered hour is. */
function ChartHover({ curve, hoverHour, width, height, snap, xForHour, yForScore }: ChartHoverProps) {
  const h = snap ? Math.round(hoverHour) : hoverHour
  const score = scoreAtHour(curve, h)
  const x = xForHour(h)
  const y = yForScore(score)
  const color = scoreColorFor(score)
  const tier = tierFor(score)
  const pillLeft = Math.max(34, Math.min(width - 34, x))
  const pillAbove = y > 78

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}>
      <div style={{ position: 'absolute', left: x, top: 14, bottom: 32, width: 1, background: `linear-gradient(${color}00, ${color}66, ${color}00)` }} />
      <div
        style={{
          position: 'absolute',
          left: x - 6,
          top: y - 6,
          width: 12,
          height: 12,
          borderRadius: 999,
          background: color,
          boxShadow: `0 0 14px ${color}`,
          border: '2px solid #000',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: pillLeft,
          top: pillAbove ? y - 64 : y + 16,
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '7px 12px',
          borderRadius: 10,
          background: 'rgba(8,8,8,0.92)',
          border: `1px solid ${color}`,
          boxShadow: `0 6px 24px rgba(0,0,0,0.5), 0 0 16px ${color}33`,
          backdropFilter: 'blur(6px)',
          whiteSpace: 'nowrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontStyle: 'italic', fontSize: 24, lineHeight: 1, color }}>
            {Math.round(score)}
          </span>
          <span style={{ fontSize: 11, color: 'var(--muted-strong)' }}>{tier}</span>
        </div>
        <span style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', marginTop: 1 }}>{fmtHour(h)}</span>
      </div>
    </div>
  )
}

interface ModePickerProps {
  value: Mode
  onChange: (m: Mode) => void
}

function ModePicker({ value, onChange }: ModePickerProps) {
  const options: Array<{ id: Mode; label: string }> = [
    { id: 'line', label: 'Line' },
    { id: 'bars', label: 'Bars' },
    { id: 'stack', label: 'Stack' },
  ]
  return (
    <div style={{ display: 'inline-flex', gap: 2, padding: 2, border: '1px solid var(--border)', borderRadius: 999, background: 'var(--card)' }}>
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          aria-current={value === o.id}
          onClick={() => onChange(o.id)}
          style={{
            padding: '6px 14px',
            borderRadius: 999,
            background: value === o.id ? 'rgba(110,231,183,0.16)' : 'transparent',
            color: value === o.id ? 'var(--mint)' : 'var(--muted)',
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-mono), ui-monospace, monospace',
            border: 'none',
            cursor: 'pointer',
            transition: 'background 180ms cubic-bezier(0.16,1,0.3,1), color 180ms',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

interface SchedulePillProps {
  pill: CurvePill
  laneH: number
  wrapRef: React.RefObject<HTMLDivElement | null>
  xForHour: (h: number) => number
  hourForX: (px: number) => number
  onMove?: (id: string, startHour: number) => void
  onToggleLock?: (id: string) => void
}

/** A single draggable block on the curve. Drag the body to re-time it (snaps to
 *  15 min); the lock pin freezes it in place. Ghost pills (untimed, auto-placed)
 *  read as dashed until you drop them somewhere. */
function SchedulePill({ pill, laneH, wrapRef, xForHour, hourForX, onMove, onToggleLock }: SchedulePillProps) {
  const [drag, setDrag] = useState<number | null>(null)
  const lastRef = useRef<number | null>(null)
  const dur = Math.max(0.25, pill.end - pill.start)
  const liveStart = drag != null ? drag : pill.start
  const left = xForHour(liveStart)
  const w = Math.max(30, xForHour(liveStart + dur) - left)
  const dragging = drag != null

  function onPointerDown(e: React.PointerEvent) {
    if (pill.locked) return
    e.preventDefault()
    const host = wrapRef.current
    if (!host) return
    const rect = host.getBoundingClientRect()
    const grabOffset = (e.clientX - rect.left) - xForHour(pill.start)
    function onMoveEv(ev: PointerEvent) {
      const x = ev.clientX - rect.left - grabOffset
      const snapped = Math.round(hourForX(x) * 4) / 4
      lastRef.current = snapped
      setDrag(snapped)
    }
    function onUp() {
      window.removeEventListener('pointermove', onMoveEv)
      window.removeEventListener('pointerup', onUp)
      if (lastRef.current != null) onMove?.(pill.id, lastRef.current)
      lastRef.current = null
      setDrag(null)
    }
    window.addEventListener('pointermove', onMoveEv)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      onPointerDown={onPointerDown}
      title={`${pill.name}${pill.locked ? ' · locked' : ''}`}
      style={{
        position: 'absolute',
        left,
        width: w,
        top: 6,
        height: laneH - 12,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '0 6px',
        borderRadius: 7,
        background: dragging ? `${pill.color}33` : `${pill.color}22`,
        border: `1px ${pill.ghost ? 'dashed' : 'solid'} ${pill.color}${pill.locked ? 'cc' : '88'}`,
        boxShadow: dragging ? `0 6px 18px rgba(0,0,0,0.45), 0 0 12px ${pill.color}55` : 'none',
        cursor: pill.locked ? 'default' : 'grab',
        opacity: pill.ghost && !dragging ? 0.7 : 1,
        touchAction: 'none',
        overflow: 'hidden',
        transition: dragging ? 'none' : 'left 160ms cubic-bezier(0.16,1,0.3,1), width 160ms cubic-bezier(0.16,1,0.3,1)',
        zIndex: dragging ? 9 : 8,
      }}
    >
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onToggleLock?.(pill.id) }}
        aria-label={pill.locked ? 'unlock' : 'lock'}
        style={{
          flex: '0 0 auto',
          display: 'inline-flex',
          padding: 2,
          border: 'none',
          background: 'transparent',
          color: pill.locked ? pill.color : 'rgba(255,255,255,0.45)',
          cursor: 'pointer',
          lineHeight: 0,
        }}
      >
        {pill.locked ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 7.5-1.5" />
          </svg>
        )}
      </button>
      <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text, #fff)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {pill.name}
      </span>
    </div>
  )
}

interface OverlapPromptProps {
  start: number
  end: number
  onResolve: (choice: 'fit' | 'override' | 'cancel') => void
}

/** Floating prompt shown when a drag would land on another block. */
function OverlapPrompt({ start, end, onResolve }: OverlapPromptProps) {
  return (
    <div
      role="dialog"
      aria-label="Overlap"
      style={{
        position: 'absolute',
        left: '50%',
        top: 12,
        transform: 'translateX(-50%)',
        zIndex: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '12px 14px',
        borderRadius: 12,
        background: 'rgba(8,8,8,0.94)',
        border: '1px solid var(--border)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(6px)',
        maxWidth: 280,
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--muted-strong)' }}>
        That lands on another block. {fmtHour(start)}–{fmtHour(end)}.
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={() => onResolve('fit')} style={promptBtn(true)}>Fit nearby</button>
        <button type="button" onClick={() => onResolve('override')} style={promptBtn(false)}>Place anyway</button>
        <button type="button" onClick={() => onResolve('cancel')} style={promptBtn(false)}>Cancel</button>
      </div>
    </div>
  )
}

function promptBtn(primary: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '7px 8px',
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    border: primary ? '1px solid var(--mint)' : '1px solid var(--border)',
    background: primary ? 'rgba(110,231,183,0.16)' : 'transparent',
    color: primary ? 'var(--mint)' : 'var(--muted-strong)',
  }
}

interface FeelingLineProps {
  initialPct: number
  width: number
  nowX: number
  yForScore: (s: number) => number
  pctForY: (py: number) => number
  wrapRef: React.RefObject<HTMLDivElement | null>
  /** Logs the −100..+100 dial value (0% → −100, 50% → 0, 100% → +100). */
  onLog: (value: number) => void
}

/**
 * A horizontal line you drag up/down to log "how I feel overall" against the
 * predicted curve. Each release records a timestamped subjective tap (the same
 * dial MoodPicker writes), so a quick drag on every visit builds the day's
 * pattern — and the gap between where you set it and the curve teaches the model.
 */
function FeelingLine({ width, nowX, yForScore, pctForY, wrapRef, onLog }: FeelingLineProps) {
  // The feel line is an INPUT affordance, pinned bold at the TOP of the graph.
  // It rests at the top (REST_PCT); you drag it DOWN to log how you feel, then it
  // springs back up. Its resting height no longer encodes the value.
  const REST_PCT = 100
  const REST_COLOR = '#6EE7B7'
  const [pct, setPct] = useState(REST_PCT)
  const [dragging, setDragging] = useState(false)
  const [justLogged, setJustLogged] = useState(false)
  const draggingRef = useRef(false)
  const restTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (restTimer.current) clearTimeout(restTimer.current) }, [])

  const resting = !dragging && !justLogged
  const y = yForScore(pct)
  const color = resting ? REST_COLOR : scoreColorFor(pct)
  const handleLeft = Math.max(58, Math.min(width - 58, nowX))

  function startDrag(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    const host = wrapRef.current
    if (!host) return
    if (restTimer.current) { clearTimeout(restTimer.current); restTimer.current = null }
    const rect = host.getBoundingClientRect()
    draggingRef.current = true
    setDragging(true)
    setJustLogged(false)
    setPct(pctForY(e.clientY - rect.top))
    function move(ev: PointerEvent) {
      setPct(pctForY(ev.clientY - rect.top))
    }
    function up(ev: PointerEvent) {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      draggingRef.current = false
      setDragging(false)
      const finalPct = pctForY(ev.clientY - rect.top)
      setPct(finalPct)
      onLog(Math.round((finalPct - 50) * 2))
      setJustLogged(true)
      // Spring back up to the resting affordance after a beat.
      restTimer.current = setTimeout(() => { setJustLogged(false); setPct(REST_PCT) }, 1200)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const ease = 'top 220ms cubic-bezier(0.16,1,0.3,1)'

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
      {/* the line — a bold, glowing mint bar at rest; a dashed value line while dragging */}
      <div
        style={{
          position: 'absolute',
          left: PAD.left,
          right: PAD.right,
          top: y,
          ...(resting
            ? { height: 3, marginTop: -1.5, background: `linear-gradient(90deg, ${REST_COLOR}00, ${REST_COLOR}, ${REST_COLOR}00)`, borderRadius: 2, boxShadow: `0 0 12px ${REST_COLOR}99` }
            : { height: 0, borderTop: `2px dashed ${color}` }),
          opacity: dragging ? 1 : resting ? 0.95 : 0.85,
          transition: dragging ? 'none' : ease,
        }}
      />
      {/* left-edge caption */}
      <div
        style={{
          position: 'absolute',
          left: PAD.left + 2,
          top: y,
          transform: 'translateY(-50%)',
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: resting ? REST_COLOR : 'var(--muted)',
          background: 'rgba(8,8,8,0.62)',
          padding: '2px 6px',
          borderRadius: 5,
          whiteSpace: 'nowrap',
          opacity: justLogged ? 0 : 1,
          transition: dragging ? 'none' : `${ease}, opacity 160ms, color 160ms`,
        }}
      >
        drag to log feel
      </div>
      {/* wide drag hit strip along the line */}
      <div
        onPointerDown={startDrag}
        style={{
          position: 'absolute',
          left: PAD.left,
          right: PAD.right,
          top: y - 14,
          height: 28,
          cursor: 'ns-resize',
          pointerEvents: 'auto',
          touchAction: 'none',
          transition: dragging ? 'none' : ease,
        }}
      />
      {/* handle pill */}
      <div
        onPointerDown={startDrag}
        style={{
          position: 'absolute',
          left: handleLeft,
          top: y,
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 11px',
          borderRadius: 999,
          background: 'rgba(8,8,8,0.92)',
          border: `1px solid ${color}`,
          boxShadow: dragging
            ? `0 4px 18px rgba(0,0,0,0.5), 0 0 16px ${color}66`
            : resting
              ? `0 2px 10px rgba(0,0,0,0.4), 0 0 14px ${REST_COLOR}55`
              : `0 2px 10px rgba(0,0,0,0.4)`,
          cursor: 'ns-resize',
          pointerEvents: 'auto',
          touchAction: 'none',
          whiteSpace: 'nowrap',
          backdropFilter: 'blur(4px)',
          transition: dragging ? 'none' : `${ease}, box-shadow 160ms`,
        }}
      >
        {justLogged ? (
          <span style={{ fontSize: 11, fontWeight: 600, color }}>logged ✓</span>
        ) : resting ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 8.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: REST_COLOR }}>
            log feel
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
          </span>
        ) : (
          <>
            <span style={{ fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)' }}>I feel</span>
            <span style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontStyle: 'italic', fontSize: 17, lineHeight: 1, color }}>
              {Math.round(pct)}%
            </span>
          </>
        )}
      </div>
    </div>
  )
}
