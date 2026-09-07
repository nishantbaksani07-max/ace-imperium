'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import {
  DAY_START, DAY_END,
  curvePath, sampleCurve, findPeakHour,
  fmtHour, hexToRgb,
  EVENT_TYPES, accentFor,
  type RecoveryTone,
} from './curve'
import type { PeakEvent } from './types'
import type { PlannedTask } from './planner'

interface Props {
  curve: number[]
  events: PeakEvent[]
  tasks: PlannedTask[]
  nowHour: number | null
  variant?: 'mountain' | 'ridge' | 'dotted'
  height?: number
  recoveryTone?: RecoveryTone
  redZone?: { startHour: number; endHour: number; label?: string } | null
  animate?: boolean
  onHoverHour?: (hour: number | null) => void
  /** Render a periwinkle bedtime marker on the strip at this hour. */
  bedtimeHour?: number | null
}

export default function Timeline({
  curve, events, tasks, nowHour,
  variant = 'mountain', height = 280, recoveryTone = 'green',
  redZone = null, animate = true,
  onHoverHour,
  bedtimeHour = null,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [w, setW] = useState(800)
  const linePathRef = useRef<SVGPathElement | null>(null)
  const [pathLen, setPathLen] = useState(0)
  const [hoveredHourState, setHoveredHourState] = useState<number | null>(null)

  const wrappedHover = (h: number | null) => {
    setHoveredHourState(h)
    onHoverHour?.(h)
  }

  useLayoutEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => setW(entries[0].contentRect.width))
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (linePathRef.current) {
      try { setPathLen(linePathRef.current.getTotalLength()) } catch {}
    }
  }, [w, variant, recoveryTone, curve])

  const padX = 18
  const x0 = padX
  const x1 = w - padX
  const innerW = x1 - x0
  const labelRow = 22
  const yTop = 22
  const yBot = height - 28 - labelRow
  const trackY = yBot + 4

  const windowed = curve.slice(DAY_START, DAY_END + 1)
  const xForHour = (h: number) => x0 + ((h - DAY_START) / (DAY_END - DAY_START)) * innerW
  const yForHour = (h: number) => yBot - (sampleCurve(curve, h) / 100) * (yBot - yTop)
  const peakHour = findPeakHour(curve)

  const accent = accentFor(recoveryTone)
  const accentRGB = hexToRgb(accent)

  const areaPath = curvePath(windowed, x0, x1, yTop, yBot, true)
  const linePath = curvePath(windowed, x0, x1, yTop, yBot, false)

  const ticks: number[] = []
  for (let h = DAY_START; h <= DAY_END; h++) ticks.push(h)

  const dots: Array<{ x: number; y: number; op: number }> = []
  if (variant === 'dotted') {
    for (let h = DAY_START; h <= DAY_END; h += 0.5) {
      const v = sampleCurve(curve, h)
      const x = xForHour(h)
      const count = Math.max(1, Math.round((v / 100) * 6))
      for (let i = 0; i < count; i++) dots.push({ x, y: yBot - i * 8 - 6, op: 0.18 + 0.6 * (v / 100) })
    }
  }

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%' }}
      onMouseMove={e => {
        if (!containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()
        const px = e.clientX - rect.left
        const hour = DAY_START + ((px - x0) / innerW) * (DAY_END - DAY_START)
        if (hour >= DAY_START && hour <= DAY_END) wrappedHover(hour)
        else wrappedHover(null)
      }}
      onMouseLeave={() => wrappedHover(null)}
      onTouchMove={e => {
        const t = e.touches[0]
        if (!t || !containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()
        const px = t.clientX - rect.left
        const hour = DAY_START + ((px - x0) / innerW) * (DAY_END - DAY_START)
        if (hour >= DAY_START && hour <= DAY_END) wrappedHover(hour)
      }}
      onTouchEnd={() => wrappedHover(null)}
    >
      <svg width={w} height={height} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={`pt-mountain-${recoveryTone}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%"  stopColor={accent} stopOpacity="0.55" />
            <stop offset="55%" stopColor={accent} stopOpacity="0.18" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`pt-line-${recoveryTone}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%"  stopColor={accent} stopOpacity="0.4" />
            <stop offset="50%" stopColor={accent} stopOpacity="1" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.45" />
          </linearGradient>
          <radialGradient id={`pt-glow-${recoveryTone}`} cx="50%" cy="100%" r="50%">
            <stop offset="0%"  stopColor={accent} stopOpacity="0.42" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Animated grid background — slow diagonal drift */}
        {animate && (
          <g style={{ animation: 'pt-gridDrift 28s linear infinite' }}>
            {Array.from({ length: 60 }, (_, i) => i * 14).map(y => (
              <line key={`h${y}`} x1={x0 - 30} x2={x1 + 30} y1={y} y2={y}
                stroke="rgba(255,255,255,0.018)" strokeWidth="1" />
            ))}
            {Array.from({ length: 80 }, (_, i) => i * 14).map(xc => (
              <line key={`v${xc}`} x1={xc} x2={xc} y1={0} y2={yBot + 30}
                stroke="rgba(255,255,255,0.018)" strokeWidth="1" />
            ))}
          </g>
        )}

        {/* Red zone — sleep / no-fly window */}
        {redZone && redZone.startHour < DAY_END && redZone.endHour > DAY_START && (() => {
          const rzStart = Math.max(DAY_START, redZone.startHour)
          const rzEnd = Math.min(DAY_END, redZone.endHour)
          if (rzEnd <= rzStart) return null
          const rx = xForHour(rzStart)
          const rw = xForHour(rzEnd) - rx
          return (
            <g style={{ animation: animate ? 'pt-rzPulse 4.5s ease-in-out infinite' : undefined }}>
              <defs>
                <pattern id={`pt-hatch-${variant}-${recoveryTone}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
                  <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(232,76,76,0.22)" strokeWidth="1" />
                </pattern>
              </defs>
              <rect x={rx} y={yTop - 8} width={rw} height={yBot - yTop + 16} fill="rgba(232,76,76,0.07)" />
              <rect x={rx} y={yTop - 8} width={rw} height={yBot - yTop + 16} fill={`url(#pt-hatch-${variant}-${recoveryTone})`} />
              <line x1={rx} x2={rx} y1={yTop - 8} y2={yBot + 8} stroke="rgba(232,76,76,0.4)" strokeDasharray="2 3" strokeWidth="1" />
              <line x1={rx + rw} x2={rx + rw} y1={yTop - 8} y2={yBot + 8} stroke="rgba(232,76,76,0.4)" strokeDasharray="2 3" strokeWidth="1" />
              <text x={rx + rw / 2} y={yTop + 6}
                fontFamily="'Instrument Serif', serif" fontWeight="600" fontSize="12"
                fill="rgba(232,76,76,0.75)" textAnchor="middle" letterSpacing="0.22em">
                {(redZone.label ?? 'RED ZONE').toUpperCase()}
              </text>
            </g>
          )
        })()}

        {ticks.map(h => {
          const x = xForHour(h)
          const isMajor = h % 3 === 0
          return (
            <line key={h} x1={x} x2={x} y1={yTop - 6} y2={yBot}
              stroke={`rgba(${accentRGB},${isMajor ? 0.09 : 0.04})`}
              strokeDasharray={isMajor ? '0' : '2 4'}
              strokeWidth="1" />
          )
        })}

        <ellipse cx={xForHour(peakHour)} cy={yBot} rx={120} ry={70} fill={`url(#pt-glow-${recoveryTone})`} />

        {variant === 'mountain' && (
          <>
            <path d={areaPath} fill={`url(#pt-mountain-${recoveryTone})`}
              style={animate ? {
                animation: 'pt-areaFade 1.1s ease-out both, pt-areaBreath 6s ease-in-out infinite 1.2s, pt-curveHue 14s ease-in-out infinite',
                transformBox: 'fill-box', transformOrigin: '50% 100%',
              } : undefined} />
            <path ref={linePathRef} d={linePath} fill="none"
              stroke={`url(#pt-line-${recoveryTone})`} strokeWidth="2"
              style={animate && pathLen ? {
                strokeDasharray: pathLen,
                strokeDashoffset: pathLen,
                animation: 'pt-drawLine 1.6s cubic-bezier(.4,.0,.2,1) both, pt-curveHue 14s ease-in-out infinite 2s',
              } : undefined} />
          </>
        )}
        {variant === 'ridge' && (
          <>
            <path d={linePath} fill="none" stroke={accent} strokeWidth="6" opacity="0.08" />
            <path ref={linePathRef} d={linePath} fill="none" stroke={`url(#pt-line-${recoveryTone})`} strokeWidth="2.5"
              style={animate && pathLen ? {
                strokeDasharray: pathLen,
                strokeDashoffset: pathLen,
                animation: 'pt-drawLine 1.6s cubic-bezier(.4,.0,.2,1) both',
              } : undefined} />
          </>
        )}
        {variant === 'dotted' && dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r="1.5" fill={accent} opacity={d.op} />
        ))}

        {[25, 50, 75].map(v => {
          const y = yBot - (v / 100) * (yBot - yTop)
          return <line key={v} x1={x0} x2={x1} y1={y} y2={y} stroke={`rgba(${accentRGB},0.05)`} strokeDasharray="1 6" strokeWidth="1" />
        })}

        <line x1={x0} x2={x1} y1={trackY} y2={trackY} stroke={`rgba(${accentRGB},0.18)`} strokeWidth="1" />

        {/* Hover indicator */}
        {hoveredHourState != null && (
          <g style={{ pointerEvents: 'none' }}>
            <line x1={xForHour(hoveredHourState)} x2={xForHour(hoveredHourState)}
              y1={yTop - 4} y2={yBot}
              stroke={accent} strokeWidth="1" strokeDasharray="2 3" opacity="0.65" />
            <circle cx={xForHour(hoveredHourState)} cy={yForHour(hoveredHourState)}
              r="5" fill="#000" stroke={accent} strokeWidth="1.5" />
          </g>
        )}

        {/* Bedtime marker */}
        {bedtimeHour != null && bedtimeHour >= DAY_START && bedtimeHour <= DAY_END && (() => {
          const bx = xForHour(bedtimeHour)
          return (
            <g style={{ pointerEvents: 'none' }}>
              <line x1={bx} x2={bx} y1={yTop - 8} y2={yBot + 16}
                stroke="#9AA7FF" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.8" />
              <circle cx={bx} cy={yTop - 6} r="3" fill="#9AA7FF" />
              <text x={bx - 6} y={yTop - 2} textAnchor="end"
                fontFamily="'Instrument Serif', serif" fontSize="12" fontWeight="500"
                fill="#9AA7FF" letterSpacing="0.16em">BED</text>
            </g>
          )
        })()}

        {/* NOW line */}
        {nowHour != null && nowHour >= DAY_START && nowHour <= DAY_END && (() => {
          const nx = xForHour(nowHour)
          const ny = yForHour(nowHour)
          return (
            <g>
              <line x1={nx} x2={nx} y1={yTop - 8} y2={yBot + 16} stroke={accent} strokeWidth="1" />
              <circle cx={nx} cy={ny} r="10" fill={accent} opacity="0.2"
                style={animate ? { animation: 'pt-nowPulse 2.4s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: 'center' } : undefined} />
              <circle cx={nx} cy={ny} r="4" fill={accent}
                style={animate ? { animation: 'pt-nowCore 2.4s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: 'center', color: accent } : undefined} />
              <text x={nx + 6} y={yTop - 2}
                fontFamily="'Instrument Serif', serif" fontWeight="600" fontSize="12"
                fill={accent} letterSpacing="0.18em">NOW</text>
            </g>
          )
        })()}

        {/* Event markers — a solid dot on the curve at the start + a thin range bar
            at the baseline. Labels live in the cards above, so nothing overlaps. */}
        {events.map(e => {
          const ex = xForHour(e.startHour)
          const ex2 = xForHour(e.endHour)
          const ey = yForHour(e.startHour)
          const meta = EVENT_TYPES[e.type] ?? EVENT_TYPES.default
          const past = nowHour != null && e.endHour <= nowHour
          const col = meta.tone
          return (
            <g key={e.id} style={{ pointerEvents: 'none' }} opacity={past ? 0.45 : 1}>
              <line x1={ex} x2={ex} y1={ey} y2={yBot} stroke={col} strokeWidth="1" opacity="0.45" />
              <rect x={ex} y={yBot + 1} width={Math.max(3, ex2 - ex)} height="3" rx="1.5" fill={col} opacity="0.8" />
              <circle cx={ex} cy={ey} r="5.5" fill={col} stroke="#000" strokeWidth="1.5" />
            </g>
          )
        })}

        {/* Task markers — sit ON the curve at their start hour (labels live in the row above) */}
        {tasks.map(t => {
          if (t.startHour == null) return null
          const tx = xForHour(t.startHour)
          const ty = yForHour(t.startHour)
          const col = t.difficulty === 'hard' ? accent
                    : t.difficulty === 'easy' ? 'rgba(255,255,255,0.78)'
                    : 'rgba(255,255,255,0.92)'
          return (
            <g key={t.id} style={{ pointerEvents: 'none' }}>
              <line x1={tx} x2={tx} y1={ty} y2={yBot} stroke={col} strokeWidth="1"
                strokeDasharray="2 3" opacity={t.done ? 0.3 : 0.5} />
              <circle cx={tx} cy={ty} r="6" fill="#000"
                stroke={col} strokeWidth="1.5" strokeDasharray="3 2"
                opacity={t.done ? 0.45 : 1} />
              <circle cx={tx} cy={ty} r="2.5" fill={col} opacity={t.done ? 0.45 : 1} />
            </g>
          )
        })}

        {/* Hour labels */}
        {ticks.filter(h => h % 3 === 0).map(h => (
          <text key={h} x={xForHour(h)} y={height - 6}
            fontFamily="'Instrument Serif', serif" fontWeight="500" fontSize="12"
            fill="rgba(255,255,255,0.72)" textAnchor="middle" letterSpacing="0.16em">
            {fmtHour(h).toUpperCase()}
          </text>
        ))}
      </svg>
    </div>
  )
}
