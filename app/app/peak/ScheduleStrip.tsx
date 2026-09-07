'use client'

import type { ScheduledEvent, SubstanceLog, SubjectiveTap } from './types'
import { EVENT_TYPE_TONE, fmtHour12 } from './schedule'
import { SUBSTANCES } from './substances'
import SubstanceIcon from './SubstanceIcon'

interface Props {
  width: number
  events: ScheduledEvent[]
  logs: SubstanceLog[]
  taps: SubjectiveTap[]
  nowHour: number
  padX?: number
  onOpenSchedule?: () => void
}

const TONE_COLOR: Record<string, string> = {
  mint: '#6EE7B7',
  amber: '#F59E0B',
  red: '#EF4444',
  muted: 'rgba(255,255,255,0.5)',
}

const TONE_BG: Record<string, string> = {
  mint: 'rgba(110,231,183,0.10)',
  amber: 'rgba(245,158,11,0.10)',
  red: 'rgba(239,68,68,0.10)',
  muted: 'rgba(255,255,255,0.04)',
}

function tapTone(value: number): 'good' | 'mid' | 'watch' | 'low' {
  if (value >= 60) return 'good'
  if (value >= 20) return 'good'
  if (value >= -20) return 'mid'
  if (value >= -60) return 'watch'
  return 'low'
}

const TAP_COLOR: Record<string, string> = {
  good: '#6EE7B7',
  mid: 'rgba(255,255,255,0.5)',
  watch: '#F59E0B',
  low: '#EF4444',
}

/**
 * Horizontal timeline strip aligned to the chart's 24h axis. Two lanes:
 * scheduled events (above) and logged substances + mood (below). Lives
 * directly under the curve so the day's shape, plan, and inputs read as
 * one continuous timeline.
 */
export default function ScheduleStrip({
  width,
  events,
  logs,
  taps,
  nowHour,
  padX = 24,
  onOpenSchedule,
}: Props) {
  const innerW = width - padX * 2
  const hourW = innerW / 24
  const headH = 18
  const eventLaneH = 30
  const logLaneH = 16
  const eventTop = headH + 8
  const logTop = eventTop + eventLaneH + 8
  const totalH = logTop + logLaneH + 4

  return (
    <div style={{ position: 'relative', width: '100%', height: totalH }}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: padX,
          right: padX,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            fontWeight: 500,
          }}
        >
          Today&apos;s plan
        </span>
        {onOpenSchedule && (
          <button
            onClick={onOpenSchedule}
            style={{
              fontSize: 10,
              color: 'var(--mint)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Open Schedule →
          </button>
        )}
      </div>

      {/* Now line — continues the chart's now indicator through both lanes */}
      <div
        style={{
          position: 'absolute',
          left: padX + nowHour * hourW,
          top: headH + 2,
          bottom: 0,
          width: 1,
          background: 'rgba(110,231,183,0.4)',
          boxShadow: '0 0 8px rgba(110,231,183,0.5)',
        }}
      />

      {/* Event lane — each block reads "Title · start–end" when it has room */}
      <div style={{ position: 'absolute', top: eventTop, left: padX, right: padX, height: eventLaneH }}>
        {events.map(e => {
          const x = e.startHour * hourW
          const w = Math.max(10, (e.endHour - e.startHour) * hourW)
          const tone = EVENT_TYPE_TONE[e.type]
          const color = TONE_COLOR[tone]
          const timeLabel = `${fmtHour12(e.startHour)}–${fmtHour12(e.endHour)}`
          return (
            <div
              key={e.id}
              title={`${e.title} · ${timeLabel}`}
              style={{
                position: 'absolute',
                left: x,
                top: 0,
                width: w,
                height: eventLaneH,
                background: TONE_BG[tone],
                borderLeft: `2px solid ${color}`,
                border: `1px solid ${color}55`,
                borderRadius: 5,
                padding: '0 8px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: 1,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'var(--fg)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  lineHeight: 1.1,
                }}
              >
                {e.title}
              </span>
              {w > 76 && (
                <span style={{ fontSize: 9.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{timeLabel}</span>
              )}
            </div>
          )
        })}
        {events.length === 0 && (
          <button
            type="button"
            onClick={onOpenSchedule}
            style={{
              position: 'absolute',
              inset: 0,
              border: '1px dashed var(--border-strong)',
              borderRadius: 5,
              background: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              color: 'var(--muted)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: onOpenSchedule ? 'pointer' : 'default',
              fontFamily: 'inherit',
            }}
          >
            Nothing scheduled · tap to plan your day
          </button>
        )}
      </div>

      {/* Log lane — substance pips + mood dots, on the same axis */}
      <div style={{ position: 'absolute', top: logTop, left: padX, right: padX, height: logLaneH }}>
        {logs.map(l => {
          const d = new Date(l.takenAt)
          const at = d.getHours() + d.getMinutes() / 60
          const def = SUBSTANCES[l.key]
          const x = at * hourW
          const color = def?.amplitude && def.amplitude < 0 ? '#EF4444' : '#6EE7B7'
          return (
            <div
              key={l.id}
              title={`${def?.name ?? l.key} · ${fmtHour12(at)}`}
              style={{
                position: 'absolute',
                left: x - 8,
                top: 0,
                width: 16,
                height: 16,
                borderRadius: 999,
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${color}55`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9.5,
              }}
            >
              {def ? <SubstanceIcon category={def.category} size={11} /> : '·'}
            </div>
          )
        })}
        {taps.map(t => {
          const d = new Date(t.time)
          const at = d.getHours() + d.getMinutes() / 60
          const tone = tapTone(t.value)
          const color = TAP_COLOR[tone]
          return (
            <div
              key={t.id}
              title={`Mood · ${fmtHour12(at)}`}
              style={{
                position: 'absolute',
                left: at * hourW - 4,
                top: 4,
                width: 8,
                height: 8,
                borderRadius: 999,
                background: color,
                boxShadow: `0 0 6px ${color}`,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
