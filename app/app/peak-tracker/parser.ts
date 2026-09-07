import type { EventTypeKey } from './curve'

export type TaskDifficulty = 'easy' | 'normal' | 'hard'

export type ParsedToken =
  | { kind: 'event'; title: string; type: EventTypeKey; difficulty: TaskDifficulty | null; startHour: number; endHour: number; raw: string }
  | { kind: 'task'; title: string; difficulty: TaskDifficulty; durationHours: number; raw: string }
  | { kind: 'gap'; title: string; size: 'big' | 'small'; difficulty: TaskDifficulty; startHour: number | null; endHour: number | null; raw: string }
  | { kind: 'ambiguous'; title: string; raw: string }

// Plain language → events + tasks tokens.
// Understands 12h AND military/compact time:
//   "class 1145 to 4pm hard"  → class · hard · 11:45am–4:00pm
//   "school 8:45-3"           → school · 8:45am–3:00pm
//   "math final hard 90m"     → task · hard · 1h30m
//   "gym 1930" / "gym 7:45"   → gym · 7:30pm / 7:45pm
//   "standup 1530-1600"       → 3:30pm–4:00pm

const EVENT_KEYWORDS: Record<EventTypeKey, string[]> = {
  school:   ['school', 'class', 'lecture', 'classes'],
  gym:      ['gym', 'workout', 'lift', 'run', 'training'],
  work:     ['work', 'shift', 'office', 'meeting', 'standup', 'call'],
  practice: ['practice', 'rehearsal', 'session'],
  default:  [],
}

// "deep" and "quick" were intentionally removed — they collide with common
// titles ("deep work", "quick call") far more often than they're meant as a
// difficulty tag. Clear difficulty words (hard/easy/light/heavy/tough) remain.
const DIFFICULTY_WORDS: Record<TaskDifficulty, string[]> = {
  hard:   ['hard', 'heavy', 'tough'],
  easy:   ['easy', 'light', 'simple', 'admin'],
  normal: ['normal', 'med', 'medium', 'mid'],
}

function inferEventType(text: string): EventTypeKey | null {
  const t = text.toLowerCase()
  for (const [type, kws] of Object.entries(EVENT_KEYWORDS) as Array<[EventTypeKey, string[]]>) {
    if (kws.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(t))) return type
  }
  return null
}

interface TimeToken { hour: number; hadMeridiem: boolean; wasMilitary: boolean }

// Parse ONE time token → { hour: 0..24, hadMeridiem, wasMilitary } | null
// Handles: "8", "8:45", "7pm", "7:30pm", "1145", "0830", "1530", "830"
function parseTimeToken(raw: string): TimeToken | null {
  let s = String(raw).trim().toLowerCase().replace(/\s+/g, '')
  if (!s) return null
  let ap: 'am' | 'pm' | null = null
  const apM = s.match(/(am|pm|a|p)$/)
  if (apM && /[0-9]/.test(s)) {
    ap = apM[1][0] === 'a' ? 'am' : 'pm'
    s = s.slice(0, apM[1].length === 2 ? -2 : -1)
  }
  let h: number
  let min = 0
  let wasMilitary = false
  if (s.includes(':')) {
    const [hh, mm] = s.split(':')
    h = parseInt(hh, 10)
    min = parseInt(mm || '0', 10)
  } else if (/^\d{3,4}$/.test(s)) {
    // compact / military — 1145 → 11:45, 830 → 8:30, 1530 → 15:30
    const num = s.padStart(4, '0')
    h = parseInt(num.slice(0, 2), 10)
    min = parseInt(num.slice(2), 10)
    wasMilitary = true
  } else if (/^\d{1,2}$/.test(s)) {
    h = parseInt(s, 10)
  } else {
    return null
  }
  if (isNaN(h) || isNaN(min) || min >= 60 || h > 23) return null
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  return { hour: h + min / 60, hadMeridiem: !!ap, wasMilitary }
}

// Single-time alternation (H:MM first so it wins over bare digits), and the capturing piece.
const TIME_ALT = '\\d{1,2}:\\d{2}\\s*(?:am|pm|a|p)?|\\d{3,4}\\s*(?:am|pm|a|p)?|\\d{1,2}\\s*(?:am|pm|a|p)?'
const TIME_RE = `(${TIME_ALT})`

// A clause joined by " and " only splits into two items when BOTH sides carry
// their own scheduling signal (a time, duration, difficulty, or gap). Otherwise
// "and" is part of the title — "rest and recovery", "call john and jane".
const SPLIT_SIGNAL = new RegExp(
  `(?:${TIME_ALT})|\\d+\\s*h|\\d+\\s*m(?:in)?\\b|\\b(?:hard|easy|normal|heavy|tough|light|simple|admin|med|medium|mid|gap)\\b`,
  'i',
)

interface TimeRange {
  start: number
  end: number | null
  startMil?: boolean
  endMil?: boolean
  startMeridiem?: boolean
}

// Parse a time range from "8:45-3", "1145 to 4pm", "9-5", "7:45".
function parseTimeRange(text: string): TimeRange | null {
  const cleaned = text.replace(/–|—/g, '-').replace(/\bto\b/gi, '-')
  const rangeRe = new RegExp(`${TIME_RE}\\s*-\\s*${TIME_RE}`, 'i')
  const m = cleaned.match(rangeRe)
  if (m) {
    const A = parseTimeToken(m[1])
    const B = parseTimeToken(m[2])
    if (!A || !B) return null
    const s = A.hour
    let e = B.hour
    // If end < start and end had no meridiem and isn't military → assume pm
    if (e < s && !B.hadMeridiem && !B.wasMilitary) e += 12
    // If still <= start, push a day-part so it's valid
    if (e <= s) e = s + 1
    return { start: s, end: e, startMil: A.wasMilitary, endMil: B.wasMilitary }
  }
  const singleRe = new RegExp(TIME_RE, 'i')
  const sm = cleaned.match(singleRe)
  if (sm) {
    const A = parseTimeToken(sm[1])
    if (!A) return null
    return { start: A.hour, end: null, startMil: A.wasMilitary, startMeridiem: A.hadMeridiem }
  }
  return null
}

function parseDuration(text: string): number | null {
  // "90m", "20m", "1h30", "1.5h", "2h", "45min"
  let m = text.match(/(\d+)\s*h\s*(\d+)?/i)
  if (m) return parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) / 60 : 0)
  m = text.match(/(\d*\.?\d+)\s*h/i)
  if (m) return parseFloat(m[1])
  m = text.match(/(\d+)\s*m(?:in)?\b/i)
  if (m) return parseInt(m[1], 10) / 60
  return null
}

export function parseInput(input: string): ParsedToken[] {
  if (!input.trim()) return []
  // Comma is always a separator. " and " only separates when each side is its
  // own schedulable thing, so titles with "and" in them survive intact.
  const clauses: string[] = []
  for (const chunk of input.split(/,/).map(c => c.trim()).filter(Boolean)) {
    const parts = chunk.split(/\s+and\s+/i).map(p => p.trim()).filter(Boolean)
    if (parts.length > 1 && parts.every(p => SPLIT_SIGNAL.test(p))) clauses.push(...parts)
    else clauses.push(chunk)
  }
  return clauses.map(parseClause).filter((t): t is ParsedToken => t !== null)
}

function parseClause(raw: string): ParsedToken | null {
  const text = raw.trim()
  if (!text) return null

  // Gap command (ported from Schedule Lab): "big gap X" fills every free window
  // today, "small gap X" fills only short windows (≤1.5h), "gap X 2-4" fills just
  // that window. The rest of the clause is parsed from the gap-stripped body.
  const gapM = text.match(/^\s*(small|big)?\s*gap\b/i)
  const body = gapM ? text.replace(/^\s*(small|big)?\s*gap\b/i, ' ').trim() : text

  let difficulty: TaskDifficulty | null = null
  let matchedDiffWord: string | null = null
  for (const [d, words] of Object.entries(DIFFICULTY_WORDS) as Array<[TaskDifficulty, string[]]>) {
    const hit = words.find(w => new RegExp(`\\b${w}\\b`, 'i').test(body))
    if (hit) { difficulty = d; matchedDiffWord = hit; break }
  }

  const duration = parseDuration(body)
  const range = parseTimeRange(body)
  const eventType = inferEventType(body)

  // Strip detected time / duration tokens to recover the title. Difficulty is
  // stripped separately below — we remove ONLY the exact word we read as the
  // difficulty, so "deep work 9-11 hard" keeps "deep" (the difficulty came from
  // "hard"), instead of nuking every difficulty synonym from the title.
  let title = body
    .replace(/\bto\b/gi, ' ')
    .replace(/\d+\s*h\s*\d+/gi, '')
    .replace(/\d*\.?\d+\s*h\b/gi, '')
    .replace(/\d+\s*m(?:in)?\b/gi, '')
    // full time ranges first (H:MM wins over bare digits via ordered alternation)
    .replace(new RegExp(`(?:${TIME_ALT})\\s*[-–—]\\s*(?:${TIME_ALT})`, 'gi'), ' ')
    // then standalone times
    .replace(/\b\d{1,2}:\d{2}\s*(?:am|pm|a|p)?\b/gi, ' ')
    .replace(/\b\d{3,4}\s*(?:am|pm|a|p)?\b/gi, ' ')
    .replace(/\b\d{1,2}\s*(?:am|pm)\b/gi, ' ')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (matchedDiffWord) {
    title = title.replace(new RegExp(`\\b${matchedDiffWord}\\b`, 'gi'), ' ').replace(/\s+/g, ' ').trim()
  }

  // Gap rule — expanded into free-window fills at add time (see YourDaySchedule).
  if (gapM) {
    return {
      kind: 'gap',
      title: title || 'Free',
      size: gapM[1]?.toLowerCase() === 'small' ? 'small' : 'big',
      difficulty: difficulty ?? 'normal',
      startHour: range ? range.start : null,
      endHour: range && range.end != null ? range.end : null,
      raw,
    }
  }

  // Event: has a time AND (an event keyword OR no difficulty word OR an explicit end → it's a block)
  if (range && (eventType || difficulty == null || range.end != null)) {
    let start = range.start
    let end = range.end
    if (end == null) {
      // bare single time — pm-bias for evening keywords / bare small hours
      if (!range.startMeridiem && !range.startMil && start < 12 &&
          /gym|practice|dinner|rehearsal|lift|run/i.test(body)) {
        start += 12
      }
      end = start + 1
    }
    return {
      kind: 'event',
      title: (title || eventType || 'event').trim(),
      type: eventType ?? 'default',
      difficulty,
      startHour: start,
      endHour: end,
      raw,
    }
  }

  // Task: needs a difficulty OR a duration
  if (difficulty || duration) {
    return {
      kind: 'task',
      title: title || 'task',
      difficulty: difficulty ?? 'normal',
      durationHours: duration ?? 1,
      raw,
    }
  }

  return { kind: 'ambiguous', title: title || text, raw }
}

// Format an hour float as "11:45am" / "4:00pm"
export function fmtAmPm(h: number): string {
  const hr = Math.floor(h) % 24
  const min = Math.round((h - Math.floor(h)) * 60)
  const ap = hr >= 12 ? 'pm' : 'am'
  const h12 = ((hr + 11) % 12) + 1
  return `${h12}:${String(min).padStart(2, '0')}${ap}`
}

// Format a duration float as "90m" / "1h30m" / "2h"
export function fmtDuration(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`
  const hours = Math.floor(h)
  const mins = Math.round((h - hours) * 60)
  return mins ? `${hours}h${mins}m` : `${hours}h`
}
