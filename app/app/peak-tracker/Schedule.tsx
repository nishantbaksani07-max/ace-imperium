'use client'

import { useState } from 'react'
import {
  sampleCurve, EVENT_TYPES, hexToRgb, accentFor, isInRedZone,
  deriveSleepTargets, RECOVERY,
  type RecoveryTone, type RecoveryLevel,
} from './curve'
import { fmtAmPm } from './parser'
import type { PeakEvent } from './types'
import type { PlannedTask } from './planner'

// ScheduleRow — the whole day as a clean horizontal row of cards.
// SleepStrip — a compact one-card bedtime summary.
// One font across the whole page: Instrument Serif. Hierarchy comes from size
// (and italic on display lines), never from switching typefaces. Instrument
// Serif is single-weight, so "bold" reads as size, not stroke weight.

const FONT = "'Instrument Serif', serif"
const DAY_START = 6
const DAY_END = 23

function fmtDur2(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`
  const hours = Math.floor(h)
  const mins = Math.round((h - hours) * 60)
  return mins ? `${hours}h ${mins}m` : `${hours}h`
}

function tierOf(score: number): 'peak' | 'good' | 'low' | 'drained' {
  return score >= 75 ? 'peak' : score >= 50 ? 'good' : score >= 25 ? 'low' : 'drained'
}

// short am/pm: "8:45a", "4p", "12:30p"
function fmtAmPmShort(h: number): string {
  const hr = Math.floor(h) % 24
  const min = Math.round((h - Math.floor(h)) * 60)
  const ap = hr >= 12 ? 'p' : 'a'
  const h12 = ((hr + 11) % 12) + 1
  return min ? `${h12}:${String(min).padStart(2, '0')}${ap}` : `${h12}${ap}`
}

interface SleepTargets { idealBedtime: number; repayBedtime: number; windDown: number }

type ScheduledRow =
  | { kind: 'event'; id: string; title: string; type: PeakEvent['type']; startHour: number; endHour: number }
  | { kind: 'task'; id: string; title: string; difficulty: PlannedTask['difficulty']; durationHours: number; done: boolean; startHour: number; endHour: number }
  | { kind: 'gap'; startHour: number; endHour: number }

// ---- ScheduleRow ----------------------------------------------------------

interface ScheduleRowProps {
  events: PeakEvent[]
  tasks: PlannedTask[]
  curve: number[]
  nowHour: number | null
  recoveryTone: RecoveryTone
  isMobile?: boolean
  dateLabel?: string
  sleepTargets?: SleepTargets | null
  onToggleTask?: (id: string) => void
  onDeleteTask?: (id: string) => void
  onDeleteEvent?: (id: string) => void
  onAddSlot?: () => void
}

export function ScheduleRow({
  events, tasks, curve, nowHour, recoveryTone, isMobile = false,
  dateLabel = 'thu · may 28',
  sleepTargets = null,
  onToggleTask, onDeleteTask, onDeleteEvent, onAddSlot,
}: ScheduleRowProps) {
  const accent = accentFor(recoveryTone)
  const accentRGB = hexToRgb(accent)
  const minGap = 0.5

  const scheduled: ScheduledRow[] = [
    ...events.map(e => ({
      kind: 'event' as const, id: e.id, title: e.title, type: e.type,
      startHour: e.startHour, endHour: e.endHour,
    })),
    ...tasks
      .filter(t => t.startHour != null && t.endHour != null)
      .map(t => ({
        kind: 'task' as const, id: t.id, title: t.title, difficulty: t.difficulty,
        durationHours: t.durationHours, done: t.done,
        startHour: t.startHour as number, endHour: t.endHour as number,
      })),
  ].sort((a, b) => a.startHour - b.startHour)

  // interleave gaps
  const rows: ScheduledRow[] = []
  let cursor = DAY_START
  for (const it of scheduled) {
    if (it.startHour - cursor >= minGap) rows.push({ kind: 'gap', startHour: cursor, endHour: it.startHour })
    rows.push(it)
    cursor = Math.max(cursor, it.endHour)
  }
  if (DAY_END - cursor >= minGap) rows.push({ kind: 'gap', startHour: cursor, endHour: DAY_END })

  const nowIdx = nowHour != null ? rows.findIndex(r => nowHour >= r.startHour && nowHour < r.endHour) : -1
  const nextIdx = nowHour != null ? rows.findIndex(r => r.kind !== 'gap' && r.startHour > nowHour) : -1
  const totalOpen = rows
    .filter(r => r.kind === 'gap' && (nowHour == null || r.endHour > nowHour))
    .reduce((s, r) => s + (r.endHour - Math.max(r.startHour, nowHour ?? r.startHour)), 0)

  return (
    <div style={{ marginTop: isMobile ? 22 : 26 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        marginBottom: isMobile ? 14 : 18, padding: '0 2px', gap: 10, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{
            fontFamily: FONT, fontStyle: 'italic', fontWeight: 400,
            fontSize: isMobile ? 38 : 50, color: '#fff', letterSpacing: '-0.01em', lineHeight: 0.98,
          }}>your day</span>
          <span style={{
            fontFamily: FONT, fontSize: 13, fontWeight: 600,
            letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)',
          }}>{dateLabel} · 6 am – 11 pm</span>
        </div>
        <span style={{
          fontFamily: FONT, fontSize: 14, fontWeight: 700,
          letterSpacing: '0.04em', color: accent, whiteSpace: 'nowrap',
        }}>{fmtDur2(totalOpen)} open</span>
      </div>

      {/* Horizontal scroll row */}
      <div className="sched-scroll" style={{
        display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8,
        scrollSnapType: 'x proximity',
        WebkitOverflowScrolling: 'touch',
      }}>
        {rows.length === 0 && (
          <div style={{
            flex: '1 0 auto', padding: '28px 22px', borderRadius: 18,
            border: '1px dashed rgba(255,255,255,0.18)',
            fontFamily: FONT, fontWeight: 600, fontSize: 18,
            color: 'rgba(255,255,255,0.75)',
          }}>nothing on deck. throw something in below.</div>
        )}
        {rows.map((r, i) => {
          const past = nowHour != null && r.endHour <= nowHour
          if (r.kind === 'gap') {
            return (
              <GapCard key={`g${i}`} gap={r} past={past} curve={curve}
                accent={accent} accentRGB={accentRGB} isMobile={isMobile} onAdd={onAddSlot} />
            )
          }
          const inRZ = !!sleepTargets && r.startHour >= 12 &&
            isInRedZone(r.startHour, r.endHour, sleepTargets.windDown, sleepTargets.idealBedtime)
          const onDelete = r.kind === 'event'
            ? (onDeleteEvent ? () => onDeleteEvent(r.id) : undefined)
            : (onDeleteTask ? () => onDeleteTask(r.id) : undefined)
          return (
            <ItemCard key={`${r.kind}${r.id}`} item={r}
              past={past} now={i === nowIdx} next={i === nextIdx}
              accent={accent} accentRGB={accentRGB}
              inRedZone={inRZ} isMobile={isMobile}
              onToggleTask={onToggleTask} onDelete={onDelete} />
          )
        })}
      </div>

      {/* Hour ruler — the time of day, below the schedule */}
      <HourRuler nowHour={nowHour} accent={accent} />
    </div>
  )
}

function HourRuler({ nowHour, accent }: { nowHour: number | null; accent: string }) {
  const ticks = [6, 9, 12, 15, 18, 21, 23]
  const xPct = (h: number) => ((h - DAY_START) / (DAY_END - DAY_START)) * 100
  const lbl = (h: number) => {
    const ap = h >= 12 ? 'PM' : 'AM'
    const h12 = ((h + 11) % 12) + 1
    return `${h12} ${ap}`
  }
  return (
    <div style={{ position: 'relative', height: 42, marginTop: 14 }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 13, height: 1, background: 'rgba(255,255,255,0.14)' }} />
      {ticks.map(h => (
        <div key={h} style={{
          position: 'absolute', left: `${xPct(h)}%`, top: 0,
          transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
        }}>
          <div style={{ width: 1, height: 8, background: 'rgba(255,255,255,0.24)' }} />
          <span style={{
            fontFamily: FONT, fontSize: 12.5, fontWeight: 600,
            letterSpacing: '0.04em', color: 'rgba(255,255,255,0.72)',
          }}>{lbl(h)}</span>
        </div>
      ))}
      {nowHour != null && nowHour >= DAY_START && nowHour <= DAY_END && (
        <div style={{
          position: 'absolute', left: `${xPct(nowHour)}%`, top: 2,
          transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        }}>
          <span style={{
            fontFamily: FONT, fontSize: 12.5, fontWeight: 700,
            letterSpacing: '0.08em', color: accent,
          }}>NOW</span>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', background: accent,
            boxShadow: `0 0 10px ${accent}`,
            animation: 'pt-rzPulse 2s ease-in-out infinite',
          }} />
        </div>
      )}
    </div>
  )
}

function cardShellBase(isMobile: boolean): React.CSSProperties {
  return {
    flex: '0 0 auto',
    width: isMobile ? 250 : 312,
    minHeight: isMobile ? 380 : 460,
    borderRadius: 20,
    padding: isMobile ? '24px 22px 26px 26px' : '30px 28px 32px 32px',
    display: 'flex', flexDirection: 'column',
    scrollSnapAlign: 'start',
    position: 'relative',
    boxSizing: 'border-box',
    overflow: 'hidden',
  }
}

function statusOf(
  item: Extract<ScheduledRow, { kind: 'event' | 'task' }>,
  past: boolean, now: boolean, next: boolean, accent: string,
): { word: string; color: string; glow: boolean } {
  if (now) return { word: 'now', color: accent, glow: true }
  if (item.kind === 'task' && item.done) return { word: 'done', color: 'rgba(255,255,255,0.6)', glow: false }
  if (past) return { word: 'done', color: 'rgba(255,255,255,0.6)', glow: false }
  if (next) return { word: 'up next', color: accent, glow: false }
  return { word: 'upcoming', color: 'rgba(255,255,255,0.72)', glow: false }
}

interface ItemCardProps {
  item: Extract<ScheduledRow, { kind: 'event' | 'task' }>
  past: boolean
  now: boolean
  next: boolean
  accent: string
  accentRGB: string
  inRedZone: boolean
  isMobile: boolean
  onToggleTask?: (id: string) => void
  onDelete?: () => void
}

function ItemCard({ item, past, now, next, accent, accentRGB, inRedZone, isMobile, onToggleTask, onDelete }: ItemCardProps) {
  const isEvent = item.kind === 'event'
  const meta = isEvent ? (EVENT_TYPES[item.type] ?? EVENT_TYPES.default) : null
  const barColor = isEvent ? meta!.tone
    : item.difficulty === 'hard' ? accent
    : item.difficulty === 'easy' ? '#8a9aa7' : '#cfd6dd'
  const barRGB = hexToRgb(barColor)
  const st = statusOf(item, past, now, next, accent)
  const done = item.kind === 'task' && item.done
  const secondary = isEvent ? item.type : `${item.difficulty} · ${fmtDur2(item.durationHours)}`
  const clickable = item.kind === 'task' && !!onToggleTask

  return (
    <div
      onClick={clickable ? () => onToggleTask!(item.id) : undefined}
      title={clickable ? (done ? 'mark not done' : 'mark done') : undefined}
      style={{
        ...cardShellBase(isMobile),
        justifyContent: 'space-between',
        background: now ? `rgba(${accentRGB},0.07)` : 'rgba(255,255,255,0.025)',
        border: `1px solid ${now ? `rgba(${accentRGB},0.6)`
          : inRedZone ? 'rgba(232,76,76,0.4)'
          : 'rgba(255,255,255,0.1)'}`,
        opacity: (past && !now) ? 0.62 : 1,
        boxShadow: now ? `0 0 28px rgba(${accentRGB},0.14)` : 'none',
        cursor: clickable ? 'pointer' : 'default',
      }}>
      {/* Left accent bar */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 7,
        background: `linear-gradient(180deg, rgba(${barRGB},0.9), rgba(${barRGB},0.45))`,
        opacity: (past && !now) ? 0.4 : 1,
      }} />

      {/* Top: status + (bed flag) + delete */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 9,
          fontFamily: FONT, fontSize: 15, fontWeight: 700,
          letterSpacing: '0.06em', textTransform: 'uppercase', color: st.color,
        }}>
          {st.glow && <span style={{
            width: 9, height: 9, borderRadius: '50%', background: accent,
            boxShadow: `0 0 8px ${accent}`,
            animation: 'pt-rzPulse 2s ease-in-out infinite',
          }} />}
          {st.word}
        </span>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {inRedZone && (
            <span style={{
              fontFamily: FONT, fontSize: 13, fontWeight: 700,
              letterSpacing: '0.04em', textTransform: 'uppercase', color: '#E84C4C',
              padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(232,76,76,0.45)',
            }}>bed</span>
          )}
          {onDelete && (
            <button
              type="button"
              aria-label="remove from schedule"
              title="remove"
              onClick={e => { e.stopPropagation(); onDelete() }}
              style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: 'rgba(255,255,255,0.82)',
                fontFamily: FONT, fontSize: 24, fontWeight: 500, lineHeight: 1,
                cursor: 'pointer',
              }}
            >×</button>
          )}
        </div>
      </div>

      {/* Middle: title */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14, margin: '24px 0' }}>
        {isEvent
          ? <span style={{ fontSize: 30, color: meta!.tone, flexShrink: 0 }}>{meta!.glyph}</span>
          : <span style={{
              width: 15, height: 15, borderRadius: '50%', background: barColor,
              border: item.difficulty === 'easy' ? '1px dashed rgba(255,255,255,0.6)' : 'none',
              flexShrink: 0,
            }} />}
        <span style={{
          fontFamily: FONT, fontSize: isMobile ? 30 : 38, fontWeight: 700,
          color: (past && !now) ? 'rgba(255,255,255,0.65)' : '#fff',
          textDecoration: done ? 'line-through' : 'none',
          textDecorationColor: 'rgba(255,255,255,0.45)',
          letterSpacing: '-0.03em', lineHeight: 1.04,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{item.title}</span>
      </div>

      {/* Bottom: time + secondary */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 11,
        borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 20,
      }}>
        <span style={{
          fontFamily: FONT, fontSize: 26, fontWeight: 700,
          letterSpacing: '-0.01em',
          color: now ? accent : 'rgba(255,255,255,0.95)', whiteSpace: 'nowrap',
        }}>{fmtAmPmShort(item.startHour)}–{fmtAmPmShort(item.endHour)}</span>
        <span style={{
          fontFamily: FONT, fontSize: 15, fontWeight: 600,
          letterSpacing: '0.04em', textTransform: 'uppercase',
          color: isEvent ? `rgba(${barRGB},0.95)`
            : item.difficulty === 'hard' ? accent : 'rgba(255,255,255,0.75)',
        }}>{secondary}</span>
      </div>
    </div>
  )
}

interface GapCardProps {
  gap: Extract<ScheduledRow, { kind: 'gap' }>
  past: boolean
  curve: number[]
  accent: string
  accentRGB: string
  isMobile: boolean
  onAdd?: () => void
}

function GapCard({ gap, past, curve, accent, accentRGB, isMobile, onAdd }: GapCardProps) {
  const peakMid = Math.round(sampleCurve(curve, (gap.startHour + gap.endHour) / 2))
  const isPeak = tierOf(peakMid) === 'peak'
  return (
    <div style={{
      ...cardShellBase(isMobile),
      width: isMobile ? 210 : 252,
      background: 'transparent',
      border: '1px dashed rgba(255,255,255,0.16)',
      opacity: past ? 0.5 : 1,
      justifyContent: 'space-between', paddingLeft: 26,
    }}>
      <span style={{
        fontFamily: FONT, fontSize: 15, fontWeight: 700,
        letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)',
      }}>open</span>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12, margin: '20px 0' }}>
        <span style={{
          fontFamily: FONT, fontStyle: 'italic', fontWeight: 400, fontSize: 48,
          color: 'rgba(255,255,255,0.92)', lineHeight: 1, letterSpacing: '-0.01em',
        }}>{fmtDur2(gap.endHour - gap.startHour)}</span>
        <span style={{
          fontFamily: FONT, fontSize: 16, fontWeight: 600,
          letterSpacing: '0.01em', color: 'rgba(255,255,255,0.72)', whiteSpace: 'nowrap',
        }}>{fmtAmPmShort(gap.startHour)}–{fmtAmPmShort(gap.endHour)}</span>
        {isPeak && (
          <span style={{
            fontFamily: FONT, fontSize: 14, fontWeight: 700,
            letterSpacing: '0.04em', textTransform: 'uppercase', color: accent,
          }}>★ peak window</span>
        )}
      </div>

      <button type="button" disabled={past} onClick={past ? undefined : onAdd} style={{
        fontFamily: FONT, fontSize: 15, fontWeight: 700,
        letterSpacing: '0.06em', textTransform: 'uppercase',
        background: past ? 'transparent' : `rgba(${accentRGB},0.08)`,
        border: `1px dashed ${past ? 'rgba(255,255,255,0.12)' : `rgba(${accentRGB},0.45)`}`,
        color: past ? 'rgba(255,255,255,0.45)' : accent,
        padding: '15px 0', borderRadius: 10, cursor: past ? 'default' : 'pointer', width: '100%',
      }}>+ add</button>
    </div>
  )
}

// ---- SleepStrip -----------------------------------------------------------

interface SleepStripProps {
  wakeTime?: number
  sleepNeedHours?: number
  recoveryLevel?: RecoveryLevel
  sleepDebtHours?: number
  lastNightHours?: number | null
  isMobile?: boolean
}

export function SleepStrip({
  wakeTime = 6.5, sleepNeedHours = 8, recoveryLevel = 'high',
  sleepDebtHours = 0.5, lastNightHours = null, isMobile = false,
}: SleepStripProps) {
  const whoop = RECOVERY[recoveryLevel]
  const ln = lastNightHours != null ? lastNightHours : whoop.sleepHours
  const accent = accentFor(whoop.tone)
  const accentRGB = hexToRgb(accent)
  const redRGB = '232,76,76'

  const { idealBedtime, repayBedtime, windDown } =
    deriveSleepTargets({ wakeTime, sleepNeedHours, sleepDebtHours })
  const recommended = recoveryLevel === 'low' ? repayBedtime : idealBedtime

  // editable bedtime (15-min steps); 0 = follow the recommendation
  const [adjMin, setAdjMin] = useState(0)
  const [added, setAdded] = useState(false)
  const bedtime = (recommended + adjMin / 60 + 24) % 24
  const edited = adjMin !== 0
  const step = (d: number) => { setAdjMin(m => Math.max(-180, Math.min(180, m + d))); setAdded(false) }

  const sleptHours = (wakeTime - bedtime + 24) % 24

  const why = recoveryLevel === 'low'
    ? `rough night — you're down ${fmtDur2(sleepDebtHours)}. go earlier to catch up before it stacks.`
    : `you do best on ${fmtDur2(sleepNeedHours)}. up at ${fmtAmPm(wakeTime)}, so lights out by ${fmtAmPm(recommended)}.`

  return (
    <div style={{
      borderRadius: 18,
      background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.008))',
      border: `1px solid rgba(${accentRGB},0.16)`,
      padding: isMobile ? '20px 20px' : '24px 26px',
      display: 'flex', flexDirection: isMobile ? 'column' : 'row',
      alignItems: isMobile ? 'stretch' : 'center',
      justifyContent: 'space-between', gap: isMobile ? 20 : 28,
    }}>
      {/* Left: editable bedtime + why */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11, flex: 1, minWidth: 0 }}>
        <span style={{
          fontFamily: FONT, fontSize: 12.5, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase', color: accent,
        }}>tonight&apos;s sleep</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: FONT, fontStyle: 'italic', fontWeight: 400,
            fontSize: isMobile ? 32 : 42, color: '#fff', letterSpacing: '-0.01em', lineHeight: 1,
          }}>
            bed by <span style={{ color: accent }}>{fmtAmPm(bedtime)}</span>
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <StepBtn label="−15" onClick={() => step(-15)} accent={accent} accentRGB={accentRGB} />
            <StepBtn label="+15" onClick={() => step(15)} accent={accent} accentRGB={accentRGB} />
          </div>
        </div>

        <span style={{
          fontFamily: FONT, fontSize: 15, fontWeight: 500,
          color: 'rgba(255,255,255,0.82)', lineHeight: 1.5, maxWidth: 460,
        }}>{why}{edited && (
          <span style={{ color: 'rgba(255,255,255,0.62)' }}>
            {' '}that&apos;s {fmtDur2(sleptHours)} of sleep tonight.
          </span>
        )}</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
          <button type="button" onClick={() => setAdded(a => !a)} style={{
            fontFamily: FONT, fontSize: 12.5, fontWeight: 700,
            letterSpacing: '0.04em', textTransform: 'uppercase',
            background: added ? `rgba(${accentRGB},0.16)` : `rgba(${accentRGB},0.07)`,
            border: `1px solid rgba(${accentRGB},0.5)`, color: accent,
            padding: '10px 15px', borderRadius: 9, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 7,
          }}>
            <span>{added ? '✓ added to today' : '+ add bedtime'}</span>
          </button>
          {edited && (
            <button type="button" onClick={() => { setAdjMin(0); setAdded(false) }} style={{
              fontFamily: FONT, fontSize: 12.5, fontWeight: 700,
              letterSpacing: '0.04em', textTransform: 'uppercase',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.18)',
              color: 'rgba(255,255,255,0.72)', padding: '10px 15px', borderRadius: 9, cursor: 'pointer',
            }}>use recommended</button>
          )}
        </div>
      </div>

      {/* Right: stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, auto)',
        gap: isMobile ? '16px 0' : 0,
        flexShrink: 0,
        borderTop: isMobile ? '1px solid rgba(255,255,255,0.1)' : 'none',
        borderLeft: isMobile ? 'none' : '1px solid rgba(255,255,255,0.1)',
        paddingTop: isMobile ? 18 : 0,
        paddingLeft: isMobile ? 0 : 24,
      }}>
        {[
          { label: 'last night', value: fmtDur2(ln), color: ln < 6.5 ? '#E84C4C' : accent },
          { label: 'sleep debt', value: fmtDur2(sleepDebtHours), color: sleepDebtHours > 2 ? '#E84C4C' : '#fff' },
          { label: 'wind down', value: fmtAmPm(windDown), color: `rgba(${redRGB},0.95)` },
          { label: 'wake', value: fmtAmPm(wakeTime), color: '#fff' },
        ].map((s, i) => (
          <div key={s.label} style={{
            display: 'flex', flexDirection: 'column', gap: 5,
            paddingLeft: (!isMobile && i > 0) ? 22 : (isMobile && i % 2 === 1) ? 16 : 0,
            borderLeft: (!isMobile && i > 0) ? '1px solid rgba(255,255,255,0.1)' : 'none',
          }}>
            <span style={{
              fontFamily: FONT, fontSize: 12, fontWeight: 600,
              letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)',
            }}>{s.label}</span>
            <span style={{
              fontFamily: FONT, fontSize: 19, fontWeight: 700,
              letterSpacing: '0.01em', color: s.color, whiteSpace: 'nowrap',
            }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StepBtn({ label, onClick, accent, accentRGB }: { label: string; onClick: () => void; accent: string; accentRGB: string }) {
  return (
    <button type="button" onClick={onClick} style={{
      fontFamily: FONT, fontSize: 13, fontWeight: 700,
      letterSpacing: '0.02em',
      width: 46, height: 32, borderRadius: 8,
      background: `rgba(${accentRGB},0.06)`,
      border: `1px solid rgba(${accentRGB},0.35)`,
      color: accent, cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>{label}</button>
  )
}
