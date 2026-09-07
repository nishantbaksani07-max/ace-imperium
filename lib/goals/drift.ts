/**
 * "Vee notices you slipping" — the deterministic drift engine (BUILD42 flagship).
 *
 * Pure + IO-free (unit-tested). Given a snapshot of the user's recent behaviour
 * + the nudge cooldown ledger, it returns AT MOST ONE warm nudge, or null. The
 * whole point: Vitality notices you fading before you do, and reaches out first
 * warmly. So the rules are deliberately conservative:
 *   - Only nudge someone who WAS active (you can't "slip" from a thing you never
 *     did) — never guilt a non-lifter for not lifting.
 *   - One nudge at a time, highest-signal first. Never a pile.
 *   - Cooldown respected so it is present, never naggy. A rough day never earns
 *     a scolding, and nothing here is ever red.
 *
 * Detection reads real module data (workouts / nutrition_meals / wearable_data);
 * the gather lives in lib/goals/driftData.ts, the card in app/app/goals/DriftCard.
 */

import type { Push } from '@/app/app/goals/veeTypes'

export type DriftKind = 'train' | 'fuel' | 'recovery' | `stream:${string}`
export type DriftResolution = 'graced' | 'shrunk' | 'talk'

/** One user-built tile stream's recent-activity snapshot, for the generic
 *  stream drift check. Mirrors the fuel shape: was genuinely active in the
 *  last 21 days, recently gone quiet. */
export interface StreamDriftItem {
  canonicalKey: string
  label: string
  daysSinceLastReport: number | null // null = never reported
  reportDaysLast21: number
}

/** An active, non-silent goal that feeds a drift domain (best one per kind).
 *  Lets Vee reach out about the specific goal, and lets its push level set the
 *  cadence. 'silent' goals are excluded upstream, so push is never 'silent'. */
export interface DriftGoalRef {
  id: string
  title: string
  push: Push
  targetDate: string | null
}

export interface DriftCooldown {
  lastNudgedAt: string | null // ISO timestamp of the latest nudge of this kind
  resolution: DriftResolution | null // null = shown but not yet acted on
}

export interface DriftInput {
  today: string // local YYYY-MM-DD
  // training
  daysSinceLastWorkout: number | null // null = never logged a workout
  workoutsLast21: number
  // fuel
  daysSinceLastMeal: number | null
  mealDaysLast21: number
  // recovery (wearable)
  recoveryRecentAvg: number | null // avg of the last ~3 readings
  recoveryPriorAvg: number | null // avg of the ~7 before those
  recoveryReadings14: number
  // user-built tile streams (report contract) — the generic drift domain.
  // Optional so every existing caller/test keeps compiling unchanged.
  streams?: StreamDriftItem[]
  // cooldown ledger, latest row per kind
  cooldown: Partial<Record<DriftKind, DriftCooldown>>
  // the active goal (if any) that feeds each domain — personalises the nudge
  // and, via its push level, tunes the cadence
  goalByKind?: Partial<Record<DriftKind, DriftGoalRef>>
}

export interface DriftNudge {
  kind: DriftKind
  line: string // serif headline
  sub: string // warm paragraph
  goalId?: string // set when this nudge is about a specific goal (the name is
  // already baked into the copy; this id is reserved for a future "open this
  // goal" tap on the card, not read by any consumer yet)
}

// How long a kind stays quiet after being surfaced. A shown-but-unresolved
// nudge rests a couple days (present, not naggy); a resolved one rests longer
// so we honour the user's choice to be left alone for a while.
const COOLDOWN_DAYS: Record<'shown' | DriftResolution, number> = {
  shown: 2,
  talk: 7,
  graced: 12,
  shrunk: 12,
}

type CoreDriftKind = 'train' | 'fuel' | 'recovery'

const COPY: Record<CoreDriftKind, { line: string; sub: string }> = {
  train: {
    line: 'The last few days went quiet on training.',
    sub: 'Life gets heavy sometimes, and that is completely okay. I have got you. What feels right?',
  },
  fuel: {
    line: 'Your fuel logging has gone a little quiet.',
    sub: 'No pressure at all. Even a messy week still counts. We can ease back in whenever you are ready.',
  },
  recovery: {
    line: 'Your recovery has been dipping lately.',
    sub: 'That is your body asking for a little kindness. Let us take this week gentle, together.',
  },
}

export function daysBetween(fromKey: string, toKey: string): number {
  const a = Date.parse(`${fromKey}T00:00:00`)
  const b = Date.parse(`${toKey}T00:00:00`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

/** How long an unresolved nudge rests, tuned by the goal's push level: a goal
 *  you asked Vee to push on speaks up sooner; a gentle one rests longer. No
 *  goal (or 'balanced') uses the default. Resolved nudges ignore this. */
function shownWindow(push?: Push): number {
  if (push === 'push') return 1
  if (push === 'gentle') return 4
  return COOLDOWN_DAYS.shown
}

/** True if this kind is still resting (so we stay quiet). */
function onCooldown(today: string, cd: DriftCooldown | undefined, push?: Push): boolean {
  if (!cd || !cd.lastNudgedAt) return false
  const lastKey = cd.lastNudgedAt.slice(0, 10)
  const since = daysBetween(lastKey, today)
  const window = cd.resolution ? COOLDOWN_DAYS[cd.resolution] : shownWindow(push)
  return since < window
}

/** Warm, goal-specific outreach when a goal's domain has gone quiet. Same
 *  never-red, no-guilt tone as the generic copy, just personal. The goal name
 *  sits after a colon so ANY phrasing (even a typed sentence) reads as a
 *  faithful quote rather than broken grammar. */
function goalCopy(kind: CoreDriftKind, goal: DriftGoalRef): { line: string; sub: string } {
  if (kind === 'fuel') {
    return {
      line: 'Your fuel logging has gone a little quiet.',
      sub: `And you told me this one matters: ${goal.title}. Even a rough week still counts. We can ease back in whenever you are ready.`,
    }
  }
  // train (and any future activity domain) — recovery has no goal mapping today
  return {
    line: 'Training has gone quiet the last few days.',
    sub: `And you told me this one matters: ${goal.title}. No guilt at all. One easy session gets the wheels turning again, whenever you feel ready.`,
  }
}

/** Was the user active enough on a thing that going quiet really is a slip? */
function triggered(kind: CoreDriftKind, i: DriftInput): boolean {
  if (kind === 'train') {
    return i.workoutsLast21 >= 3 && i.daysSinceLastWorkout != null && i.daysSinceLastWorkout >= 4 && i.daysSinceLastWorkout <= 14
  }
  if (kind === 'fuel') {
    return i.mealDaysLast21 >= 4 && i.daysSinceLastMeal != null && i.daysSinceLastMeal >= 3 && i.daysSinceLastMeal <= 14
  }
  // recovery: a real, sustained dip vs the user's own recent baseline
  return (
    i.recoveryReadings14 >= 5 &&
    i.recoveryRecentAvg != null &&
    i.recoveryPriorAvg != null &&
    i.recoveryPriorAvg - i.recoveryRecentAvg >= 12
  )
}

/**
 * Return the single most relevant drift nudge, or null. Priority is
 * train > fuel > recovery (the most behaviourally meaningful first), skipping
 * any kind still on cooldown.
 */
export function detectDrift(input: DriftInput): DriftNudge | null {
  const order: CoreDriftKind[] = ['train', 'fuel', 'recovery']
  for (const kind of order) {
    if (!triggered(kind, input)) continue
    const goal = input.goalByKind?.[kind]
    if (onCooldown(input.today, input.cooldown[kind], goal?.push)) continue
    if (goal) {
      const c = goalCopy(kind, goal)
      return { kind, line: c.line, sub: c.sub, goalId: goal.id }
    }
    return { kind, line: COPY[kind].line, sub: COPY[kind].sub }
  }

  // Generic stream drift — user-built tiles, always AFTER the core domains (a
  // training slip matters more than a quiet beer tile). Same shape as fuel:
  // only a stream the user genuinely showed up for (>= 5 report days in 21)
  // that recently went quiet (4-14 days), never ancient history. Deterministic
  // pick: the stream they used most, alphabetical on ties.
  const candidates = [...(input.streams ?? [])]
    .filter(
      (s) =>
        s.reportDaysLast21 >= 5 &&
        s.daysSinceLastReport != null &&
        s.daysSinceLastReport >= 4 &&
        s.daysSinceLastReport <= 14,
    )
    .sort(
      (a, b) =>
        b.reportDaysLast21 - a.reportDaysLast21 ||
        a.canonicalKey.localeCompare(b.canonicalKey),
    )
  for (const s of candidates) {
    const kind: DriftKind = `stream:${s.canonicalKey}`
    if (onCooldown(input.today, input.cooldown[kind])) continue
    return {
      kind,
      line: `Your ${s.label} tile has gone quiet.`,
      sub: 'You built that one yourself, and you were really showing up for it. No pressure at all. One small log brings it back to life.',
    }
  }
  return null
}
