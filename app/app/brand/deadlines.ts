'use client'

import { useEffect, useState } from 'react'
import type { CadencePeriod, Schedule } from './types'

/**
 * Posting-deadline math for the brand command center.
 *
 * A schedule may carry a `deadline` (a time of day, plus a weekday for
 * weekly schedules). These helpers turn that into a concrete "next
 * deadline" Date, a 0→1 urgency ramp, an accent→red colour lerp, and a
 * human countdown string. All pure except `useNow`, which ticks so the
 * countdown updates live.
 *
 * Everything takes `now` explicitly so the pure functions stay testable
 * and deterministic; only `useNow` reads the clock.
 */

const RED: readonly [number, number, number] = [239, 68, 68]
const MINT: readonly [number, number, number] = [110, 231, 183]

function clampMinutes(m: number): number {
  return Math.max(0, Math.min(1439, Math.round(m)))
}

/** Local Date at midnight + `addDays`, offset by `minutes` into the day. */
function atMinutes(now: Date, addDays: number, minutes: number): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + addDays, 0, 0, 0, 0)
  d.setMinutes(minutes) // JS normalises >59 into hours (1080 → 18:00)
  return d
}

/**
 * Next time this schedule is "due", or null if it has no deadline.
 *   - daily  → today at the set time, rolling to tomorrow once passed
 *   - weekly → the next occurrence of the set weekday + time (within 7d)
 */
export function nextDeadline(schedule: Schedule, now: Date): Date | null {
  const d = schedule.deadline
  if (!d) return null
  const minutes = clampMinutes(d.minutes)

  if (schedule.period === 'weekly') {
    const targetDow = typeof d.weekday === 'number'
      ? ((d.weekday % 7) + 7) % 7
      : now.getDay()
    for (let add = 0; add <= 7; add++) {
      const cand = atMinutes(now, add, minutes)
      if (cand.getDay() === targetDow && cand.getTime() > now.getTime()) {
        return cand
      }
    }
    return atMinutes(now, 7, minutes) // unreachable safety net
  }

  // daily
  const today = atMinutes(now, 0, minutes)
  return today.getTime() > now.getTime() ? today : atMinutes(now, 1, minutes)
}

/**
 * 0 (calm, plenty of time) → 1 (due now / overdue). Ramps over the last
 * 6h of a daily deadline and the last 48h of a weekly one, so a weekly
 * deadline doesn't sit pinned red for days.
 */
export function deadlineUrgency(remainingMs: number, period: CadencePeriod): number {
  if (remainingMs <= 0) return 1
  const ramp = period === 'weekly' ? 48 * 3_600_000 : 6 * 3_600_000
  if (remainingMs >= ramp) return 0
  return 1 - remainingMs / ramp
}

/**
 * Fraction (0→1) of the current cadence period that has elapsed — drives the
 * deadline clock's fill. ~0 just after the last deadline, 1 at the next one.
 * Unlike `deadlineUrgency` (which only ramps in the final window), this fills
 * smoothly across the whole day/week so the ring visibly creeps toward full.
 */
export function periodFraction(remainingMs: number, period: CadencePeriod): number {
  if (remainingMs <= 0) return 1
  const periodMs = period === 'weekly' ? 7 * 86_400_000 : 86_400_000
  if (remainingMs >= periodMs) return 0
  return 1 - remainingMs / periodMs
}

/**
 * Like `urgencyColor`, but also *darkens* toward a deep red as the deadline
 * nears (lightness drops with urgency). Used for the clock's fill arc so it
 * literally gets darker before it's due; the readable text/dot keep using the
 * brighter `urgencyColor`.
 */
export function urgencyDeepColor(accentRgb: string, urgency: number): string {
  const base = parseRgb(urgencyColor(accentRgb, urgency))
  const t = Math.max(0, Math.min(1, urgency))
  const dark = (v: number) => Math.round(v * (1 - 0.4 * t))
  return `${dark(base[0])}, ${dark(base[1])}, ${dark(base[2])}`
}

function parseRgb(s: string): readonly [number, number, number] {
  const parts = s.split(',').map(x => parseInt(x.trim(), 10))
  if (parts.length === 3 && parts.every(n => Number.isFinite(n))) {
    return [parts[0], parts[1], parts[2]]
  }
  return MINT
}

/**
 * Lerp the brand accent (an "r, g, b" triplet) toward red by `urgency`.
 * Returns an "r, g, b" string for use in rgba(...). The countdown chip
 * sets colour + border-colour from this each tick.
 */
export function urgencyColor(accentRgb: string, urgency: number): string {
  const a = parseRgb(accentRgb)
  const t = Math.max(0, Math.min(1, urgency))
  const mix = (i: number) => Math.round(a[i] + (RED[i] - a[i]) * t)
  return `${mix(0)}, ${mix(1)}, ${mix(2)}`
}

/** "2d 4h" / "5h 12m" / "23m 8s" / "44s" / "due now". */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'due now'
  const totalSec = Math.floor(ms / 1000)
  const days = Math.floor(totalSec / 86_400)
  const hours = Math.floor((totalSec % 86_400) / 3_600)
  const mins = Math.floor((totalSec % 3_600) / 60)
  const secs = totalSec % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

/**
 * Ticking "current time" for live countdowns. Only ever mounts on the
 * client (the detail page renders its body after a mounted flag), so the
 * `new Date()` initialiser can't cause a hydration mismatch.
 */
export function useNow(intervalMs: number = 1000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
