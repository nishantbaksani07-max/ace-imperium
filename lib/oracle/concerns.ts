/**
 * Build the green-light's per-domain concerns from real signals.
 *
 * This is where a detector verdict becomes a goal-tied concern the convergence
 * engine can reason about. The train builder here is the hero path: a lift only
 * becomes a concern when it is BOTH stalled (insights.liftStall) AND the subject
 * of a goal the user set (goalMatch). A stall with no goal at stake produces
 * nothing — the advice is only ever about what they told us they want.
 */

import { liftStall, classifyWeightRate, normalizeGoal, moodTrend, type LiftSession } from '@/mcp/src/insights'
import { matchGoalToLift } from './goalMatch'
import type { ActiveGoal, DomainConcern } from './greenlight'

export interface LiftProgressionInput {
  id: string
  name: string
  sessions: LiftSession[]
}

/**
 * One "train" concern per active goal whose lift has plateaued. Silent goals
 * never raise a concern; goals about no logged lift, and lifts that are still
 * climbing, are skipped.
 */
export function liftStallConcerns(
  goals: ActiveGoal[],
  lifts: LiftProgressionInput[],
): DomainConcern[] {
  const refs = lifts.map((l) => ({ id: l.id, name: l.name }))
  const concerns: DomainConcern[] = []

  for (const goal of goals) {
    if (goal.push === 'silent') continue
    const match = matchGoalToLift(goal.title, refs)
    if (!match) continue
    const lift = lifts.find((l) => l.id === match.liftId)
    if (!lift) continue
    const stall = liftStall(lift.sessions)
    if (!stall || !stall.isStalled) continue

    const sessions = stall.stalledSessions + 1 // sessions sitting at the plateau
    const targetTail = match.targetWeight ? `, vs your ${match.targetWeight} goal` : ''
    concerns.push({
      domain: 'train',
      receipt: {
        kind: 'lift-stall',
        text: `${lift.name} top set ${stall.plateauWeight} unchanged across ${sessions} sessions over ${stall.stalledDays} days${targetTail}`,
        dates: [stall.lastProgressDate],
      },
      goalRefs: [goal.id],
      margin: stall.stalledDays,
    })
  }

  return concerns
}

/** Weight verdicts that mean the trend is fighting the goal (worth a concern). */
const BAD_WEIGHT_VERDICTS = new Set(['wrong-direction', 'too-fast', 'stalled', 'drifting'])

/**
 * Weight drifting against a cut/bulk/maintain goal. Anchored: only fires for a
 * goal whose intent normalizeGoal can read (a weight-shaped goal), and only when
 * classifyWeightRate says the trend fights it. Reuses the shipped, gated weight
 * math (>=2 weigh-ins -> non-null rate), so a single weigh-in never speaks.
 */
export function weightDriftConcern(
  goals: ActiveGoal[],
  weeklyRate: { kgPerWeek: number } | null,
  latestKg: number | null,
): DomainConcern[] {
  if (!weeklyRate || latestKg == null || latestKg <= 0) return []
  const concerns: DomainConcern[] = []
  for (const goal of goals) {
    if (goal.push === 'silent') continue
    if (normalizeGoal(goal.title) == null) continue // not a weight-shaped goal
    const assess = classifyWeightRate(weeklyRate.kgPerWeek, latestKg, goal.title)
    if (!BAD_WEIGHT_VERDICTS.has(assess.verdict)) continue
    const pct = assess.pctPerWeek ?? 0
    concerns.push({
      domain: 'weight',
      receipt: {
        kind: 'weight-drift',
        text: `weight ${pct >= 0 ? 'up' : 'down'} ${Math.abs(pct)}%/week, ${assess.verdict.replace('-', ' ')}`,
        dates: [],
      },
      goalRefs: [goal.id],
      margin: Math.max(1, Math.abs(pct) * 5),
    })
  }
  return concerns
}

/**
 * Mood trending low. Goal-AGNOSTIC on purpose: it adds a converging domain and
 * colors the tone, but never anchors a notice on its own (a low day alone is not
 * a green light). Reuses moodTrend's gate (>=4 days, low <= 2.5), so a couple of
 * entries never trigger it.
 */
export function moodLowConcern(moodDays: { mood: number }[]): DomainConcern[] {
  const mt = moodTrend(moodDays)
  if (!mt) return []
  const isLow = mt.low || (mt.direction === 'down' && mt.recentAvg <= 3.2)
  if (!isLow) return []
  return [
    {
      domain: 'mood',
      receipt: {
        kind: 'mood-low',
        text: `mood trending ${mt.direction}, recent ${mt.recentAvg} of 5`,
        dates: [],
      },
      goalRefs: [],
      margin: Math.max(0.5, 3.5 - mt.recentAvg),
    },
  ]
}

/**
 * Recovery sliding lately. Goal-agnostic converging signal (pairs with a stalled
 * lift or weight drift to make a green light). Newest-first recovery readings;
 * null (no-band) days are ignored. Fires only with enough readings AND a real
 * recent-vs-prior drop (mirrors the drift recovery gate).
 */
export function recoveryDipConcern(
  entries: { recovery: number | null }[],
  opts: { minReadings?: number; minDrop?: number } = {},
): DomainConcern[] {
  const minReadings = opts.minReadings ?? 5
  const minDrop = opts.minDrop ?? 12
  const recs = entries.map((e) => e.recovery).filter((r): r is number => r != null)
  if (recs.length < minReadings) return []
  const recentWindow = Math.min(7, Math.floor(recs.length / 2))
  if (recentWindow < 1) return []
  const recent = recs.slice(0, recentWindow)
  const prior = recs.slice(recentWindow)
  if (prior.length < 1) return []
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const drop = Math.round(mean(prior) - mean(recent))
  if (drop < minDrop) return []
  return [
    {
      domain: 'recovery',
      receipt: { kind: 'recovery-dip', text: `recovery down about ${drop} points lately`, dates: [] },
      goalRefs: [],
      margin: drop,
    },
  ]
}
