import { sampleCurve, DAY_START, DAY_END } from './curve'
import type { TaskDifficulty } from './parser'

interface Busy { startHour: number; endHour: number }

interface Candidate { startHour: number; endHour: number; score: number }

function placeTask(
  curve: number[],
  busy: Busy[],
  difficulty: TaskDifficulty,
  durationHours: number,
): Candidate | null {
  const step = 0.25
  const out: Candidate[] = []
  for (let s = DAY_START; s + durationHours <= DAY_END; s += step) {
    const e = s + durationHours
    if (busy.some(b => !(e <= b.startHour || s >= b.endHour))) continue
    let sum = 0
    let count = 0
    for (let h = s; h < e; h += 0.25) { sum += sampleCurve(curve, h); count++ }
    out.push({ startHour: s, endHour: e, score: sum / count })
  }
  if (!out.length) return null
  if (difficulty === 'hard') return [...out].sort((a, b) => b.score - a.score)[0]
  if (difficulty === 'easy') {
    const above = out.filter(c => c.score >= 25)
    return (above.length ? above : out).sort((a, b) => a.score - b.score)[0]
  }
  return [...out].sort((a, b) => Math.abs(a.score - 55) - Math.abs(b.score - 55))[0]
}

export interface PlannedTask {
  id: string
  title: string
  difficulty: TaskDifficulty
  durationHours: number
  done: boolean
  pinned: boolean
  /** When pinned: user-set startHour. Otherwise auto-placed by planDay. */
  pinnedStartHour?: number | null
  startHour?: number | null
  endHour?: number | null
}

export interface PlannedEvent {
  id: string
  title: string
  type: 'school' | 'gym' | 'work' | 'practice' | 'default'
  startHour: number
  endHour: number
}

export function planDay(
  curve: number[],
  events: PlannedEvent[],
  tasks: PlannedTask[],
): PlannedTask[] {
  const order: Record<TaskDifficulty, number> = { hard: 0, normal: 1, easy: 2 }
  const busy: Busy[] = events.map(e => ({ startHour: e.startHour, endHour: e.endHour }))

  const pinned: PlannedTask[] = []
  const unpinned: PlannedTask[] = []
  for (const t of tasks) {
    if (t.pinned && t.pinnedStartHour != null) {
      const startHour = t.pinnedStartHour
      const endHour = startHour + t.durationHours
      pinned.push({ ...t, startHour, endHour })
      busy.push({ startHour, endHour })
    } else {
      unpinned.push(t)
    }
  }

  const sorted = [...unpinned].sort((a, b) => order[a.difficulty] - order[b.difficulty])
  const placed: PlannedTask[] = []
  for (const t of sorted) {
    const slot = placeTask(curve, busy, t.difficulty, t.durationHours)
    if (!slot) {
      placed.push({ ...t, startHour: null, endHour: null })
      continue
    }
    placed.push({ ...t, startHour: slot.startHour, endHour: slot.endHour })
    busy.push({ startHour: slot.startHour, endHour: slot.endHour })
  }
  return [...pinned, ...placed]
}
