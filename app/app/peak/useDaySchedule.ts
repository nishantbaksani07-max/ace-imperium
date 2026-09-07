'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  colorForIndex,
  tempId,
  clampDay,
  DAY_START,
  DAY_END,
  type DayItem,
} from './dayModel'
import { freeWindows } from './schedule'
import { addEvent, addTask, updateTask, deleteTask } from '../peak-tracker/actions'
import { parseInput, type ParsedToken } from '../peak-tracker/parser'
import type { PeakTrackerInitial } from '../peak-tracker/types'

/**
 * useDaySchedule — the single source of truth for the "Your Day" schedule,
 * lifted out of YourDaySchedule so BOTH the lower UI (chips · free-time card ·
 * today's-plan list) AND the energy curve (draggable pills on CurveChart) can
 * drive the same items. Call it ONCE in PeakModule and thread the returned
 * controller into YourDaySchedule — never call it twice or the two surfaces
 * fork into separate states.
 *
 * Owns the day's items as optimistic client state seeded from the server, a
 * natural-language quick-add, and the curve-interaction state (drag-to-move,
 * lock pins, click-to-arm gap windows, Fit/Override overlap prompts). Every
 * mutation updates the UI instantly and persists to Supabase via the
 * peak-tracker server actions (reused).
 */

const nowHour = (): number => {
  const d = new Date()
  return d.getHours() + d.getMinutes() / 60
}

/** Ticking decimal hour. Starts at a fixed value so SSR + first client render
 *  match, then snaps to the real time on mount (avoids hydration mismatch). */
function useNowHour(): number {
  const [h, setH] = useState(12)
  useEffect(() => {
    setH(nowHour())
    const t = setInterval(() => setH(nowHour()), 30_000)
    return () => clearInterval(t)
  }, [])
  return h
}

function seed(initial: PeakTrackerInitial): DayItem[] {
  const items: DayItem[] = []
  for (const e of initial.events) {
    items.push({
      id: e.id, kind: 'event', name: e.title,
      start: e.startHour, end: e.endHour, durHours: null,
      color: e.color || colorForIndex(items.length),
      repeat: e.repeat ?? 'none', difficulty: 'normal',
    })
  }
  for (const t of initial.tasks) {
    const start = t.pinnedStartHour ?? null
    items.push({
      id: t.id, kind: 'task', name: t.title,
      start, end: start != null ? Math.min(23.98, start + t.durationHours) : null,
      durHours: t.durationHours,
      color: t.color || colorForIndex(items.length),
      repeat: t.repeat ?? 'none', difficulty: t.difficulty,
    })
  }
  return items
}

function buildItem(tok: ParsedToken, color: string): DayItem {
  if (tok.kind === 'event') {
    return {
      id: tempId(), kind: 'event', name: tok.title,
      start: tok.startHour, end: tok.endHour, durHours: null,
      color, repeat: 'none', difficulty: tok.difficulty ?? 'normal', isNew: true,
    }
  }
  const difficulty = tok.kind === 'task' ? tok.difficulty : 'normal'
  const durHours = tok.kind === 'task' ? tok.durationHours : 1
  return {
    id: tempId(), kind: 'task', name: tok.title,
    start: null, end: null, durHours,
    color, repeat: 'none', difficulty, isNew: true,
  }
}

/** Half-open overlap of [aS,aE) and [bS,bE) — back-to-back blocks don't clash. */
const overlaps = (aS: number, aE: number, bS: number, bE: number): boolean =>
  aS < bE - 1e-6 && bS < aE - 1e-6

/** A timed move that collides with other blocks, parked until the user picks
 *  Fit (slide to the nearest free slot) or Override (drop it anyway). */
export interface PendingOverlap {
  id: string
  start: number
  end: number
  /** ids of the timed blocks the move would land on top of. */
  conflicts: string[]
}

/** An armed gap window on the curve — click-empty arms it, the next add lands
 *  inside it (start/end already known) instead of auto-placing. */
export interface ArmedWindow {
  start: number
  end: number
}

export interface DaySchedule {
  items: DayItem[]
  /** Live decimal hour for the NOW marker / next-up panel. */
  now: number
  handleAdd: (raw: string) => void
  handleUpdate: (id: string, patch: Partial<DayItem>) => void
  handleDelete: (id: string) => void
  /** Tap-selected timed blocks (outlined in the list). Selecting two with a
   *  gap between them targets the next `gap …` command at that slot only. */
  selectedIds: string[]
  toggleSelect: (id: string) => void
  clearSelect: () => void
  /** The open window between the selected blocks (earliest end → latest start),
   *  or null when fewer than two are selected or they leave no gap. */
  gapTarget: { lo: number; hi: number } | null
  /** Reposition a block to start at `startHour`, keeping its duration. Stages a
   *  Fit/Override prompt instead of committing when it would land on another
   *  block. Locked blocks don't move. */
  move: (id: string, startHour: number) => void
  /** Pin / unpin a block (client-side flag — keeps drags + auto-place off it). */
  toggleLock: (id: string) => void
  armed: ArmedWindow | null
  armWindow: (start: number, end: number) => void
  disarm: () => void
  pendingOverlap: PendingOverlap | null
  /** Resolve a parked move: fit it to the nearest free slot, drop it as-is, or
   *  abandon it. */
  resolveOverlap: (choice: 'fit' | 'override' | 'cancel') => void
}

export function useDaySchedule(initial: PeakTrackerInitial): DaySchedule {
  const now = useNowHour()
  const [items, setItems] = useState<DayItem[]>(() => seed(initial))
  const itemsRef = useRef(items)
  itemsRef.current = items

  const [armed, setArmed] = useState<ArmedWindow | null>(null)
  const [pendingOverlap, setPendingOverlap] = useState<PendingOverlap | null>(null)

  // Tap-to-select state. Selecting two timed blocks arms the gap between them
  // (earliest block's end → latest block's start) so a `gap …` command fills
  // just that slot instead of the whole day. A ref keeps handleAdd's closure
  // reading the live target without re-creating the callback.
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const gapTarget = useMemo<{ lo: number; hi: number } | null>(() => {
    const sel = items
      .filter((i) => selectedIds.includes(i.id) && i.start != null)
      .sort((a, b) => (a.start as number) - (b.start as number))
    if (sel.length < 2) return null
    const lo = sel[0].end ?? (sel[0].start as number) + 1
    const hi = sel[sel.length - 1].start as number
    return hi - lo >= 0.25 ? { lo, hi } : null
  }, [items, selectedIds])
  const gapTargetRef = useRef(gapTarget)
  gapTargetRef.current = gapTarget

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }, [])
  const clearSelect = useCallback(() => setSelectedIds([]), [])

  // Persist one freshly-added item, then reconcile its temp id with the real
  // row id (or roll it back on failure). Runs outside the state updater so a
  // StrictMode double-invoke can't double-insert.
  const persistAdd = useCallback(async (tok: ParsedToken, item: DayItem) => {
    try {
      const res = item.kind === 'event'
        ? await addEvent({
            title: item.name,
            type: tok.kind === 'event' ? tok.type : 'default',
            startHour: item.start as number,
            endHour: item.end as number,
            color: item.color,
            repeat: 'none',
          })
        : await addTask({
            title: item.name,
            difficulty: item.difficulty,
            durationHours: item.durHours ?? 1,
            color: item.color,
            repeat: 'none',
          })
      setItems((cur) => {
        if (!res.ok) return cur.filter((i) => i.id !== item.id)
        if (res.data?.id) return cur.map((i) => (i.id === item.id ? { ...i, id: res.data!.id } : i))
        return cur
      })
    } catch {
      setItems((cur) => cur.filter((i) => i.id !== item.id))
    }
  }, [])

  const handleAdd = useCallback((raw: string) => {
    const tokens = parseInput(raw)
    if (!tokens.length) return
    const current = itemsRef.current
    let colorBase = current.length
    const built: { tok: ParsedToken; item: DayItem }[] = []
    // An armed gap window pins the FIRST loose token into that slot instead of
    // letting it auto-place; consumed once, then we disarm.
    let armSlot = armed
    // Two tap-selected blocks scope an untimed `gap …` to the slot between them.
    const gt = gapTargetRef.current
    let consumedGapTarget = false

    for (const tok of tokens) {
      if (tok.kind === 'gap') {
        // Expand a gap command into one timed event per free window, dodging
        // everything already timed (existing items + anything built this pass).
        const busy = [...current, ...built.map((b) => b.item)]
          .filter((i) => i.start != null)
          .map((i) => ({ start: i.start as number, end: i.end ?? (i.start as number) + 1 }))
        // No explicit range → fall back to the selected between-blocks window,
        // else the whole day.
        const ranged = tok.startHour != null || tok.endHour != null
        if (!ranged && gt) consumedGapTarget = true
        const lo = tok.startHour ?? (ranged ? DAY_START : gt?.lo ?? DAY_START)
        const hi = tok.endHour ?? (ranged ? DAY_END : gt?.hi ?? DAY_END)
        const windows = freeWindows(busy, lo, hi).filter(
          ([s, e]) => (tok.size === 'small' ? e - s <= 1.5 : true),
        )
        for (const [s, e] of windows) {
          const evTok: ParsedToken = {
            kind: 'event', title: tok.title, type: 'default',
            difficulty: tok.difficulty, startHour: s, endHour: e, raw: tok.raw,
          }
          built.push({ tok: evTok, item: buildItem(evTok, colorForIndex(colorBase++)) })
        }
      } else {
        const item = buildItem(tok, colorForIndex(colorBase++))
        // Drop the first untimed token into the armed window, if one's set.
        if (armSlot && item.start == null) {
          const dur = item.durHours ?? Math.max(0.5, armSlot.end - armSlot.start)
          item.start = armSlot.start
          item.end = Math.min(DAY_END, armSlot.start + dur)
          armSlot = null
        }
        built.push({ tok, item })
      }
    }
    if (!built.length) return
    setItems((prev) => [...prev.map((i) => ({ ...i, isNew: false })), ...built.map((b) => b.item)])
    built.forEach(({ tok, item }) => { void persistAdd(tok, item) })
    if (armSlot !== armed) setArmed(null)
    if (consumedGapTarget) setSelectedIds([])
  }, [persistAdd, armed])

  const handleUpdate = useCallback((id: string, patch: Partial<DayItem>) => {
    const before = itemsRef.current.find((i) => i.id === id)
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...patch, isNew: false } : i)))
    if (!before || id.startsWith('tmp_')) return // not yet persisted — skip server

    const merged = { ...before, ...patch }
    const sp: Parameters<typeof updateTask>[1] = {}
    if (patch.name !== undefined) sp.title = patch.name
    if (patch.start !== undefined) sp.startHour = patch.start
    if (patch.end !== undefined) sp.endHour = patch.end
    if (patch.repeat !== undefined) sp.repeat = patch.repeat
    if (patch.color !== undefined) sp.color = patch.color
    // Timing edits can flip an unscheduled task into a timed event (or back).
    if (patch.start !== undefined || patch.end !== undefined) {
      sp.kind = merged.start != null ? 'event' : 'task'
    }
    // `locked` is a client-only flag — nothing to persist for it.
    if (Object.keys(sp).length === 0) return
    void updateTask(id, sp)
  }, [])

  const handleDelete = useCallback((id: string) => {
    setItems((cur) => cur.filter((i) => i.id !== id))
    setSelectedIds((cur) => cur.filter((x) => x !== id))
    if (!id.startsWith('tmp_')) void deleteTask(id)
  }, [])

  const move = useCallback((id: string, startHour: number) => {
    const item = itemsRef.current.find((i) => i.id === id)
    if (!item || item.locked) return
    const dur = item.start != null && item.end != null
      ? item.end - item.start
      : (item.durHours ?? 1)
    const start = Math.max(DAY_START, Math.min(startHour, DAY_END - dur))
    const end = Math.min(DAY_END, start + dur)
    const conflicts = itemsRef.current
      .filter((o) => o.id !== id && o.start != null && overlaps(start, end, o.start, o.end ?? o.start + 1))
      .map((o) => o.id)
    if (conflicts.length) {
      setPendingOverlap({ id, start, end, conflicts })
      return
    }
    handleUpdate(id, { start, end })
  }, [handleUpdate])

  const toggleLock = useCallback((id: string) => {
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, locked: !i.locked, isNew: false } : i)))
  }, [])

  const armWindow = useCallback((start: number, end: number) => {
    setArmed({ start: clampDay(start), end: clampDay(end) })
  }, [])
  const disarm = useCallback(() => setArmed(null), [])

  const resolveOverlap = useCallback((choice: 'fit' | 'override' | 'cancel') => {
    const pend = pendingOverlap
    setPendingOverlap(null)
    if (!pend || choice === 'cancel') return
    const dur = pend.end - pend.start
    if (choice === 'override') {
      handleUpdate(pend.id, { start: pend.start, end: pend.end })
      return
    }
    // Fit: subtract every other timed block, then slide to the open slot whose
    // start sits closest to where the user dropped it. Falls back to override
    // if the day's too packed to hold the duration anywhere.
    const busy = itemsRef.current
      .filter((o) => o.id !== pend.id && o.start != null)
      .map((o) => ({ start: o.start as number, end: o.end ?? (o.start as number) + 1 }))
    const slots = freeWindows(busy, DAY_START, DAY_END).filter(([s, e]) => e - s >= dur - 1e-6)
    if (!slots.length) {
      handleUpdate(pend.id, { start: pend.start, end: pend.end })
      return
    }
    let bestStart = pend.start
    let bestDist = Infinity
    for (const [s, e] of slots) {
      const cand = Math.max(s, Math.min(pend.start, e - dur))
      const dist = Math.abs(cand - pend.start)
      if (dist < bestDist) { bestDist = dist; bestStart = cand }
    }
    handleUpdate(pend.id, { start: bestStart, end: Math.min(DAY_END, bestStart + dur) })
  }, [pendingOverlap, handleUpdate])

  return useMemo<DaySchedule>(() => ({
    items, now, handleAdd, handleUpdate, handleDelete,
    selectedIds, toggleSelect, clearSelect, gapTarget,
    move, toggleLock, armed, armWindow, disarm, pendingOverlap, resolveOverlap,
  }), [items, now, handleAdd, handleUpdate, handleDelete, selectedIds, toggleSelect, clearSelect, gapTarget, move, toggleLock, armed, armWindow, disarm, pendingOverlap, resolveOverlap])
}
