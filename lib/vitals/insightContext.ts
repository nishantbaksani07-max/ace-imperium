import type { VitalsReading } from '@/lib/vitals/advice'
import type { VitalsGoal } from '@/lib/vitals/goals'
import type { UserFact } from '@/lib/memory/userFacts'

/** The metrics we ask the model to write a personal line for. */
export const INSIGHT_METRICS = ['recovery', 'hrv', 'sleep', 'strain'] as const
export type InsightMetric = (typeof INSIGHT_METRICS)[number]

export interface InsightContextInput {
  reading: VitalsReading
  week: VitalsReading[]
  goal: VitalsGoal | null
  facts: UserFact[]
  workoutsYesterday: Array<{ date: string; day_name: string }>
  today: string
}

const kv = (label: string, v: number | null): string | null =>
  v == null ? null : `${label}=${v}`

/** Pure: assemble a compact, number-honest context block for the insight LLM call. */
export function buildInsightContext(input: InsightContextInput): string {
  const { reading, week, goal, facts, workoutsYesterday, today } = input
  const lines: string[] = []
  lines.push(`Today: ${today}`)

  const todayMetrics = [
    kv('recovery', reading.recovery),
    kv('hrv', reading.hrv),
    kv('rhr', reading.rhr),
    kv('sleep_perf', reading.sleep_perf),
    kv('sleep_hours', reading.sleep_hours),
    kv('strain', reading.strain),
  ].filter(Boolean)
  lines.push(`Today's reading: ${todayMetrics.join(' · ') || 'no data'}`)

  const recoveries = week.map(d => d.recovery).filter((n): n is number => n != null)
  if (recoveries.length) {
    const avg = Math.round(recoveries.reduce((a, b) => a + b, 0) / recoveries.length)
    lines.push(`7-day avg recovery: ${avg}`)
  }

  if (goal) {
    lines.push(`Active goal: ${goal.direction} ${goal.metric} to ${goal.targetValue} (baseline ${goal.baselineValue ?? 'tbd'}, ${goal.windowDays}d, ${goal.confidence}${goal.isProvisional ? ', provisional' : ''})`)
  } else {
    lines.push('Active goal: none set yet.')
  }

  if (workoutsYesterday.length) {
    lines.push(`Yesterday's training: ${workoutsYesterday.map(w => w.day_name).join(', ')}`)
  } else {
    lines.push("Yesterday's training: nothing logged.")
  }

  if (facts.length) {
    lines.push('What I know about them:')
    for (const f of facts) lines.push(`- (${f.kind}) ${f.body}`)
  }

  return lines.join('\n')
}
