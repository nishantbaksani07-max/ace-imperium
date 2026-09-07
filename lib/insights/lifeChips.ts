/**
 * Pure "life chips" derivation — the small row of live stats under the goal
 * ticker (TRAIN 5x/wk, SLEEP 5.6h, ...). Honest-only: a chip appears ONLY when
 * its data is real. No data, no chip — never a placeholder or invented number.
 *
 * IO-free + unit-tested (see __tests__/lifeChips.test.ts).
 */

export type ChipTone = 'mint' | 'amber' | 'muted'

export interface LifeChip {
  label: string
  value: string
  tone: ChipTone
}

/** Trim a 0.1-rounded number to a clean string ("5" not "5.0", "1.7" stays). */
function num(n: number): string {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

export function buildLifeChips(input: {
  sessionsPerWeek: number | null
  sleepAvgH: number | null
  recovery: number | null
  weightKg: number | null
  waterL: number | null
}): LifeChip[] {
  const chips: LifeChip[] = []

  if (input.sessionsPerWeek != null) {
    chips.push({
      label: 'train',
      value: `${num(input.sessionsPerWeek)}x/wk`,
      tone: input.sessionsPerWeek >= 3 ? 'mint' : 'muted',
    })
  }
  if (input.sleepAvgH != null) {
    chips.push({
      label: 'sleep',
      value: `${num(input.sleepAvgH)}h`,
      tone: input.sleepAvgH >= 7 ? 'mint' : input.sleepAvgH < 6 ? 'amber' : 'muted',
    })
  }
  if (input.recovery != null) {
    chips.push({
      label: 'recovery',
      value: `${Math.round(input.recovery)}`,
      tone: input.recovery >= 66 ? 'mint' : input.recovery < 34 ? 'amber' : 'muted',
    })
  }
  if (input.weightKg != null) {
    chips.push({ label: 'weight', value: `${num(input.weightKg)}kg`, tone: 'muted' })
  }
  if (input.waterL != null && input.waterL > 0) {
    chips.push({ label: 'water', value: `${num(input.waterL)}l`, tone: 'muted' })
  }

  return chips
}
