'use client'

import './animations.css'

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  BASE_CURVE, shapeCurve, findPeakHour,
  fmtHour, accentFor, RECOVERY,
  deriveSleepTargets,
  type RecoveryLevel, type RecoveryTone,
} from './curve'
import { planDay } from './planner'
import { type ParsedToken } from './parser'
import Timeline from './Timeline'
import Composer from './Composer'
import { ScheduleRow, SleepStrip } from './Schedule'
import PeakRing from './PeakRing'
import type { PeakEvent, PeakTask, PeakTrackerInitial } from './types'
import {
  addEvent, addTask as addTaskAction,
  deleteEvent, deleteTask,
  toggleTaskDone, setRecoveryLevel, setPeakedness,
  setWakeTime, setSleepNeed,
} from './actions'

interface Props {
  initial: PeakTrackerInitial
}

function nowDecimalHour(): number {
  const d = new Date()
  return d.getHours() + d.getMinutes() / 60
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const day = date.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()
  const monthDay = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()
  return `${day} · ${monthDay}`
}

export default function PeakTracker({ initial }: Props) {
  const [recoveryLevel, setLocalRecovery] = useState<RecoveryLevel>(initial.recoveryLevel)
  const [peakedness, setLocalPeakedness] = useState<number>(initial.peakedness)
  const [wakeTime, setLocalWakeTime] = useState<number>(initial.wakeTime)
  const [sleepNeedHours, setLocalSleepNeed] = useState<number>(initial.sleepNeedHours)
  const [events, setEvents] = useState<PeakEvent[]>(initial.events)
  const [tasks, setTasks] = useState<PeakTask[]>(initial.tasks)
  const [composerText, setComposerText] = useState('')
  const [nowHour, setNowHour] = useState<number>(() => nowDecimalHour())
  const [hoveredHour, setHoveredHour] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const composerInputRef = useRef<HTMLInputElement | null>(null)

  function focusComposer() {
    composerInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    composerInputRef.current?.focus()
  }

  useEffect(() => {
    const id = window.setInterval(() => setNowHour(nowDecimalHour()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const curve = useMemo(() => shapeCurve(BASE_CURVE, peakedness), [peakedness])
  const whoop = RECOVERY[recoveryLevel]
  const tone: RecoveryTone = whoop.tone
  const accent = accentFor(tone)

  const planned = useMemo(() => planDay(curve, events, tasks), [curve, events, tasks])
  const peakHour = useMemo(() => findPeakHour(curve), [curve])

  const sleepDebt = recoveryLevel === 'low' ? 2.3 : recoveryLevel === 'mid' ? 1.1 : 0.4
  const sleepTargets = useMemo(
    () => deriveSleepTargets({ wakeTime, sleepNeedHours, sleepDebtHours: sleepDebt }),
    [wakeTime, sleepNeedHours, sleepDebt],
  )
  const redZoneTimeline = {
    startHour: sleepTargets.windDown < 12 ? 23 : sleepTargets.windDown,
    endHour: 23,
    label: 'wind down',
  }
  const bedtimeHour = recoveryLevel === 'low' ? sleepTargets.repayBedtime : sleepTargets.idealBedtime
  const scheduleDateLabel = fmtDate(initial.date).toLowerCase()

  const pendingCount = planned.filter(t => !t.done).length
  const statusItems = [
    { label: `${events.length} event${events.length === 1 ? '' : 's'}` },
    { label: `${pendingCount} task${pendingCount === 1 ? '' : 's'}` },
    { label: `peaking ${fmtHour(peakHour).toLowerCase()}`, accent: true },
    { label: `recovery ${whoop.recovery}`, accent: recoveryLevel === 'low' },
  ]

  const narrative = buildNarrative({ recoveryLevel, peakHour, nowHour, hasEvents: events.length > 0 })

  function handleCommit(tokens: ParsedToken[]) {
    if (tokens.length === 0) return
    const snapshotEvents = events
    const snapshotTasks = tasks

    const newEvents: PeakEvent[] = []
    const newTasks: PeakTask[] = []
    for (const tok of tokens) {
      if (tok.kind === 'event') {
        newEvents.push({
          id: `temp-${Math.random().toString(36).slice(2, 9)}`,
          title: tok.title, type: tok.type, startHour: tok.startHour, endHour: tok.endHour,
        })
      } else if (tok.kind === 'task') {
        newTasks.push({
          id: `temp-${Math.random().toString(36).slice(2, 9)}`,
          title: tok.title, difficulty: tok.difficulty, durationHours: tok.durationHours,
          done: false, pinned: false,
        })
      }
    }

    setEvents(e => [...e, ...newEvents])
    setTasks(t => [...t, ...newTasks])
    setComposerText('')
    setSaveError(null)

    startTransition(async () => {
      for (const ne of newEvents) {
        const res = await addEvent({ title: ne.title, type: ne.type, startHour: ne.startHour, endHour: ne.endHour, date: initial.date })
        if (!res.ok) {
          setEvents(snapshotEvents)
          setTasks(snapshotTasks)
          setSaveError(res.error)
          return
        }
        if (res.data) {
          setEvents(prev => prev.map(e => (e.id === ne.id ? { ...e, id: res.data!.id } : e)))
        }
      }
      for (const nt of newTasks) {
        const res = await addTaskAction({ title: nt.title, difficulty: nt.difficulty, durationHours: nt.durationHours, date: initial.date })
        if (!res.ok) {
          setSaveError(res.error)
          continue
        }
        if (res.data) {
          setTasks(prev => prev.map(t => (t.id === nt.id ? { ...t, id: res.data!.id } : t)))
        }
      }
    })
  }

  function handleToggleTask(id: string) {
    const t = tasks.find(x => x.id === id)
    if (!t) return
    const nextDone = !t.done
    setTasks(prev => prev.map(x => (x.id === id ? { ...x, done: nextDone } : x)))
    startTransition(async () => {
      const res = await toggleTaskDone(id, nextDone)
      if (!res.ok) setTasks(prev => prev.map(x => (x.id === id ? { ...x, done: !nextDone } : x)))
    })
  }

  function handleDeleteEvent(id: string) {
    const snap = events
    setEvents(prev => prev.filter(e => e.id !== id))
    startTransition(async () => {
      const res = await deleteEvent(id)
      if (!res.ok) setEvents(snap)
    })
  }

  function handleDeleteTask(id: string) {
    const snap = tasks
    setTasks(prev => prev.filter(t => t.id !== id))
    startTransition(async () => {
      const res = await deleteTask(id)
      if (!res.ok) setTasks(snap)
    })
  }

  function handleRecovery(next: RecoveryLevel) {
    const prev = recoveryLevel
    setLocalRecovery(next)
    startTransition(async () => {
      const res = await setRecoveryLevel(next)
      if (!res.ok) setLocalRecovery(prev)
    })
  }

  function handlePeakedness(next: number) {
    const prev = peakedness
    setLocalPeakedness(next)
    startTransition(async () => {
      const res = await setPeakedness(next)
      if (!res.ok) setLocalPeakedness(prev)
    })
  }

  function handleWakeTime(next: number) {
    const prev = wakeTime
    setLocalWakeTime(next)
    startTransition(async () => {
      const res = await setWakeTime(next)
      if (!res.ok) setLocalWakeTime(prev)
    })
  }

  function handleSleepNeed(next: number) {
    const prev = sleepNeedHours
    setLocalSleepNeed(next)
    startTransition(async () => {
      const res = await setSleepNeed(next)
      if (!res.ok) setLocalSleepNeed(prev)
    })
  }

  return (
    <main style={pageStyle}>
      <GrainOverlay />

      <div className="pt-rise pt-rise-1" style={topRowStyle}>
        <LivePill tone={tone} />
        <Datestamp text={fmtDate(initial.date)} />
        <Link href="/app" style={backLinkStyle}>← back</Link>
      </div>

      <div className="pt-rise pt-rise-2" style={narrSectionStyle}>
        <Narrative lines={narrative} tone={tone} />
        <Status items={statusItems} tone={tone} />
      </div>

      {/* divider */}
      <div style={dividerStyle} />

      {/* ===== SCHEDULE — the hero, at the top ===== */}
      <div className="pt-rise pt-rise-3" style={{ margin: '0 56px' }}>
        <ScheduleRow
          events={events}
          tasks={planned}
          curve={curve}
          nowHour={nowHour}
          recoveryTone={tone}
          dateLabel={scheduleDateLabel}
          sleepTargets={sleepTargets}
          onToggleTask={handleToggleTask}
          onDeleteTask={handleDeleteTask}
          onDeleteEvent={handleDeleteEvent}
          onAddSlot={focusComposer}
        />
      </div>

      {/* divider */}
      <div style={dividerStyle} />

      {/* ===== Peak graph — the hours of your day, below the schedule ===== */}
      <div className="pt-rise pt-rise-4" style={{ margin: '28px 56px 0 56px' }}>
        <div style={timelineCardStyle(tone)}>
          <TimelineHeader peakHour={peakHour} tone={tone} />

          <div style={{
            display: 'flex', justifyContent: 'center',
            marginTop: 4, marginBottom: 18,
          }}>
            <PeakRing
              curve={curve}
              nowHour={nowHour}
              hoveredHour={hoveredHour}
              recoveryLevel={recoveryLevel}
              size={230}
              thickness={14}
            />
          </div>

          <Timeline
            curve={curve}
            events={events}
            tasks={planned}
            nowHour={nowHour}
            recoveryTone={tone}
            redZone={redZoneTimeline}
            onHoverHour={setHoveredHour}
            bedtimeHour={bedtimeHour}
          />
          <p style={timelineHintStyle}>
            <span style={{ fontStyle: 'italic', fontFamily: "'Instrument Serif', serif", fontSize: 13, color: 'rgba(255,255,255,0.92)' }}>
              hover the curve to inspect any hour · tap a task card above to mark it done
            </span>
          </p>
        </div>

        {/* Composer — right below the graph */}
        <div style={{ marginTop: 20 }}>
          <Composer
            value={composerText}
            onChange={setComposerText}
            onCommit={handleCommit}
            recoveryTone={tone}
            inputRef={composerInputRef}
            placeholder='class 1145 to 4pm hard, math final 90m hard, gym 1930'
          />
        </div>

        {/* Sleep strip — compact bedtime summary */}
        <div style={{ marginTop: 22 }}>
          <SleepStrip
            wakeTime={wakeTime}
            sleepNeedHours={sleepNeedHours}
            recoveryLevel={recoveryLevel}
            sleepDebtHours={sleepDebt}
            lastNightHours={RECOVERY[recoveryLevel].sleepHours}
          />
        </div>
      </div>

      {saveError && (
        <div style={{
          margin: '16px 56px 0 56px',
          padding: '10px 14px',
          border: '1px solid rgba(245,194,107,0.4)',
          background: 'rgba(245,194,107,0.06)',
          borderRadius: 10,
          color: '#F5C26B',
          fontSize: 12,
          fontFamily: "'Instrument Serif', serif", fontWeight: 600,
          letterSpacing: '0.04em',
        }}>
          save failed: {saveError} — likely a missing column (migration #2 didn&apos;t apply)
        </div>
      )}

      <SettingsRow
        recoveryLevel={recoveryLevel}
        peakedness={peakedness}
        wakeTime={wakeTime}
        sleepNeedHours={sleepNeedHours}
        onRecovery={handleRecovery}
        onPeakedness={handlePeakedness}
        onWakeTime={handleWakeTime}
        onSleepNeed={handleSleepNeed}
        accent={accent}
        events={events}
        tasks={tasks}
        onDeleteEvent={handleDeleteEvent}
        onDeleteTask={handleDeleteTask}
      />
    </main>
  )
}

const pageStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%', maxWidth: 1280, margin: '0 auto', minHeight: '100vh',
  background: '#000', color: '#fff',
  overflow: 'hidden',
  fontFamily: "'Instrument Serif', serif",
  fontWeight: 500,
  display: 'flex', flexDirection: 'column',
}

const topRowStyle: React.CSSProperties = {
  padding: '36px 56px 0 56px',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
}

const narrSectionStyle: React.CSSProperties = {
  padding: '32px 56px 20px 56px',
  display: 'flex', flexDirection: 'column', gap: 12,
}

const dividerStyle: React.CSSProperties = {
  margin: '6px 56px 0 56px',
  borderTop: '1px solid rgba(255,255,255,0.22)',
}

const timelineHintStyle: React.CSSProperties = {
  display: 'flex', flexWrap: 'wrap', gap: 0,
  marginTop: 8, padding: '0 10px',
  fontFamily: "'Instrument Serif', serif",
  fontSize: 13,
  color: 'rgba(255,255,255,0.88)',
  lineHeight: 1.5,
}

const backLinkStyle: React.CSSProperties = {
  fontFamily: "'Instrument Serif', serif", fontWeight: 600,
  fontSize: 12.5,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.88)',
  textDecoration: 'none',
  padding: '6px 10px',
  border: '1px solid rgba(255,255,255,0.22)',
  borderRadius: 999,
}

function timelineCardStyle(_tone: RecoveryTone): React.CSSProperties {
  return {
    display: 'flex', flexDirection: 'column',
    position: 'relative',
    borderRadius: 22,
    background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005))',
    border: '1px solid rgba(91,234,168,0.14)',
    padding: '22px 14px 14px 14px',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.055)',
  }
}

function GrainOverlay() {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.05 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`
  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`,
      mixBlendMode: 'overlay', opacity: 0.55, zIndex: 1,
    }} />
  )
}

function LivePill({ tone }: { tone: RecoveryTone }) {
  const color = accentFor(tone)
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 10,
      padding: '6px 12px 6px 9px', borderRadius: 999,
      border: '1px solid rgba(255,255,255,0.2)',
      background: 'rgba(255,255,255,0.045)',
      fontFamily: "'Instrument Serif', serif", fontWeight: 600,
      fontSize: 12.5, letterSpacing: '0.22em',
      textTransform: 'uppercase', color: 'rgba(255,255,255,0.88)',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
      <span>Vitality · live</span>
    </div>
  )
}

function Datestamp({ text }: { text: string }) {
  return (
    <div style={{
      fontFamily: "'Instrument Serif', serif", fontWeight: 600,
      fontSize: 12.5, letterSpacing: '0.22em',
      textTransform: 'uppercase', color: 'rgba(255,255,255,0.8)',
    }}>
      {text}
    </div>
  )
}

function TimelineHeader({ peakHour, tone }: { peakHour: number; tone: RecoveryTone }) {
  const accent = accentFor(tone)
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      marginBottom: 10, padding: '0 10px',
    }}>
      <div style={{
        fontFamily: "'Instrument Serif', serif", fontWeight: 600,
        fontSize: 12.5, letterSpacing: '0.22em',
        textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)',
      }}>the day</div>
      <div style={{
        fontFamily: "'Instrument Serif', serif", fontWeight: 600,
        fontSize: 12.5, letterSpacing: '0.22em',
        textTransform: 'uppercase', color: accent,
      }}>peak · {fmtHour(peakHour).toLowerCase()}</div>
    </div>
  )
}

function Narrative({ lines, tone }: { lines: string[]; tone: RecoveryTone }) {
  const accent = accentFor(tone)
  return (
    <div style={{
      fontFamily: "'Instrument Serif', serif",
      fontStyle: 'italic', fontSize: 30, lineHeight: 1.15,
      color: 'rgba(255,255,255,0.92)', letterSpacing: '-0.01em',
    }}>
      {lines.map((l, i) => (
        <div key={i} style={{ marginBottom: i === lines.length - 1 ? 0 : 4 }}>
          {colorizePeaks(l, accent)}
        </div>
      ))}
    </div>
  )
}

function colorizePeaks(text: string, accent: string) {
  const parts = text.split(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)|peak|low recovery)/i)
  return parts.map((p, i) => {
    if (/^\d{1,2}(?::\d{2})?\s*(?:am|pm)$/i.test(p)) {
      return <span key={i} style={{ color: accent, fontFamily: "'Instrument Serif', serif" }}>{p}</span>
    }
    if (/^peak$/i.test(p)) return <span key={i} style={{ color: accent }}>{p}</span>
    if (/^low recovery$/i.test(p)) return <span key={i} style={{ color: accent }}>{p}</span>
    return <Fragment key={i}>{p}</Fragment>
  })
}

function Status({ items, tone }: { items: Array<{ label: string; accent?: boolean }>; tone: RecoveryTone }) {
  const accent = accentFor(tone)
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0,
      fontFamily: "'Instrument Serif', serif", fontWeight: 600,
      fontSize: 13, letterSpacing: '0.2em',
      textTransform: 'uppercase', color: 'rgba(255,255,255,0.9)',
    }}>
      {items.map((it, i) => (
        <Fragment key={i}>
          {i > 0 && <span style={{ margin: '0 10px', opacity: 0.4 }}>·</span>}
          <span style={{ color: it.accent ? accent : undefined, whiteSpace: 'nowrap' }}>{it.label}</span>
        </Fragment>
      ))}
    </div>
  )
}

function buildNarrative({ recoveryLevel, peakHour, nowHour, hasEvents }: {
  recoveryLevel: RecoveryLevel; peakHour: number; nowHour: number; hasEvents: boolean
}): string[] {
  const peakWord = fmtHour(peakHour).toLowerCase()
  if (recoveryLevel === 'low') {
    return [
      `rough sleep · keep deep work short today.`,
      `low recovery — don't stack hard tasks.`,
    ]
  }
  if (nowHour < 11) {
    return hasEvents
      ? [`it's a new day. you peak around ${peakWord}.`, `your scheduled blocks shape the window.`]
      : [`it's a new day. you peak around ${peakWord}.`, `the day is wide open — write what matters into the composer.`]
  }
  return [
    `your peak today is at ${peakWord} — that's where the hard work should live.`,
  ]
}

function SettingsRow({ recoveryLevel, peakedness, wakeTime, sleepNeedHours, onRecovery, onPeakedness, onWakeTime, onSleepNeed, accent, events, tasks, onDeleteEvent, onDeleteTask }: {
  recoveryLevel: RecoveryLevel
  peakedness: number
  wakeTime: number
  sleepNeedHours: number
  onRecovery: (next: RecoveryLevel) => void
  onPeakedness: (next: number) => void
  onWakeTime: (next: number) => void
  onSleepNeed: (next: number) => void
  accent: string
  events: PeakEvent[]
  tasks: PeakTask[]
  onDeleteEvent: (id: string) => void
  onDeleteTask: (id: string) => void
}) {
  const levels: RecoveryLevel[] = ['high', 'mid', 'low']
  return (
    <div style={{
      margin: '0 56px 60px 56px',
      padding: 20,
      border: '1px solid var(--border)',
      borderRadius: 14,
      background: 'var(--card)',
      display: 'flex', flexDirection: 'column', gap: 18,
    }}>
      <div style={{
        fontFamily: "'Instrument Serif', serif", fontWeight: 600, fontSize: 12.5,
        letterSpacing: '0.22em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.85)',
      }}>tweaks</div>

      <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>recovery</span>
        {levels.map(l => (
          <button key={l} onClick={() => onRecovery(l)} style={{
            fontFamily: "'Instrument Serif', serif", fontWeight: 600, fontSize: 13,
            letterSpacing: '0.16em', textTransform: 'uppercase',
            background: l === recoveryLevel ? `rgba(${accent === '#6EE7B7' ? '110,231,183' : accent === '#F5C26B' ? '245,194,107' : '167,183,194'},0.12)` : 'transparent',
            border: `1px solid ${l === recoveryLevel ? accent : 'rgba(255,255,255,0.22)'}`,
            color: l === recoveryLevel ? accent : 'rgba(255,255,255,0.8)',
            padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
          }}>{l}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>peakedness</span>
        <input type="range" min={0} max={1} step={0.05} value={peakedness}
          onChange={e => onPeakedness(parseFloat(e.target.value))}
          style={{ accentColor: accent, width: 240 }} />
        <span style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 600, fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
          {peakedness.toFixed(2)}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>wake time</span>
        <input type="range" min={4.5} max={9} step={0.25} value={wakeTime}
          onChange={e => onWakeTime(parseFloat(e.target.value))}
          style={{ accentColor: accent, width: 240 }} />
        <span style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 600, fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
          {fmtHour(wakeTime).toLowerCase()}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>sleep need</span>
        <input type="range" min={6} max={10} step={0.25} value={sleepNeedHours}
          onChange={e => onSleepNeed(parseFloat(e.target.value))}
          style={{ accentColor: accent, width: 240 }} />
        <span style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 600, fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
          {sleepNeedHours.toFixed(1)}h
        </span>
      </div>

      {(events.length > 0 || tasks.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{
            fontFamily: "'Instrument Serif', serif", fontWeight: 600, fontSize: 12,
            letterSpacing: '0.22em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.72)',
          }}>manage</div>
          {events.map(e => (
            <ManageRow key={e.id} label={`${e.title} · ${e.type}`} onDelete={() => onDeleteEvent(e.id)} />
          ))}
          {tasks.map(t => (
            <ManageRow key={t.id} label={`${t.title} · ${t.difficulty} · ${t.durationHours}h${t.done ? ' · done' : ''}`} onDelete={() => onDeleteTask(t.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function ManageRow({ label, onDelete }: { label: string; onDelete: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      padding: '6px 0', borderTop: '1px dashed rgba(255,255,255,0.16)',
      fontSize: 12.5, color: 'rgba(255,255,255,0.88)',
    }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <button onClick={onDelete} style={{
        background: 'transparent', border: '1px solid rgba(255,255,255,0.26)',
        color: 'rgba(255,255,255,0.88)', borderRadius: 4,
        padding: '2px 8px', fontSize: 13, cursor: 'pointer',
        fontFamily: "'Instrument Serif', serif", fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase',
      }}>remove</button>
    </div>
  )
}
