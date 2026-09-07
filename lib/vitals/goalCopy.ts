/** Plain-english, warm copy for a vitals goal. Pure. lowercase, no em dashes. */
import type { VitalsGoal } from '@/lib/vitals/goals'
import type { VitalsGoalMetric } from '@/lib/vitals/healthContext'

export interface GoalCopy {
  title: string       // hero line on the celebration screen
  why: string         // one warm sentence
  metricLabel: string // "recovery"
  badgeLabel: string  // short header pill text, e.g. "more recovered"
  unit: string        // display unit suffix ("", "h", "ms")
}

const META: Record<VitalsGoalMetric, { metricLabel: string; unit: string; up: string; hold: string; badgeUp: string; badgeHold: string }> = {
  recovery: { metricLabel: 'recovery', unit: '', up: 'wake up more recovered', hold: 'keep your recovery strong', badgeUp: 'more recovered', badgeHold: 'holding recovery' },
  sleep:    { metricLabel: 'sleep',    unit: 'h', up: 'sleep more, steadier', hold: 'keep your sleep steady', badgeUp: 'better sleep', badgeHold: 'holding sleep' },
  hrv:      { metricLabel: 'hrv',      unit: 'ms', up: 'calmer and more resilient', hold: 'keep your resilience up', badgeUp: 'more resilient', badgeHold: 'holding hrv' },
  strain:   { metricLabel: 'strain',   unit: '', up: 'handle more training load', hold: 'hold your training load', badgeUp: 'more capacity', badgeHold: 'holding load' },
}

export function goalCopy(goal: VitalsGoal): GoalCopy {
  const m = META[goal.metric]
  const isHold = goal.direction === 'hold'
  const why = isHold
    ? `you are already in a strong place here. the goal is to hold it steady this month.`
    : `we will track your ${m.metricLabel} with your wearable and nudge you toward this over the next month.`
  return {
    title: isHold ? m.hold : m.up,
    why,
    metricLabel: m.metricLabel,
    badgeLabel: isHold ? m.badgeHold : m.badgeUp,
    unit: m.unit,
  }
}
