/**
 * Train contributor for the Vitality Score. Training splits are usage-advanced
 * ROTATIONS ("lift three, rest one, on a loop — no calendar week"), so there is
 * no reliable map from a calendar date to "was today a planned rest day".
 * Instead Train is scored as a weekly-frequency consistency rate: how many
 * sessions you logged in the last 7 days vs the target sessions/week implied by
 * your rotation's lift-day ratio. Rest is baked into the denominator, so resting
 * on plan is never penalized. Partial credit, never punishing.
 */
import { getLocalDateKey, getRecentDateKeys } from '@/lib/dates'
import {
  type Contributor,
  type ContributorResult,
  type ScoreContext,
} from '@/lib/vitality/score'

type RotationDay = { category?: string; type?: string }

/** Pure: weekly session target from the rotation's non-rest ratio. */
export function trainTargetPerWeek(rotationDays: RotationDay[]): number {
  if (!Array.isArray(rotationDays) || rotationDays.length === 0) return 0
  // Rest days are tagged two ways in the stored rotation jsonb: a lowercase
  // `category: 'rest'` and an uppercase `type: 'RECOVERY'`. Both guard so a day
  // tagged either way counts as rest regardless of which writer produced it.
  const nonRest = rotationDays.filter(
    d => d?.category !== 'rest' && d?.type !== 'RECOVERY',
  ).length
  if (nonRest === 0) return 0
  return Math.max(1, Math.round((nonRest / rotationDays.length) * 7))
}

/** Pure: distinct logged days in the window over the weekly target, capped 0..1. */
export function trainRate(
  targetPerWeek: number,
  loggedDates: string[],
  windowDates: string[],
): number {
  if (!targetPerWeek || targetPerWeek <= 0) return 0
  const inWindow = new Set(windowDates)
  const distinct = new Set(loggedDates.filter(d => inWindow.has(d)))
  return Math.min(1, distinct.size / targetPerWeek)
}

/** Build the trailing-7 midnight day keys, index 0 = today (DST-safe). */
function trainWindowKeys(): string[] {
  return getRecentDateKeys(getLocalDateKey(), 7)
}

export const trainContributor: Contributor = {
  key: 'train',
  label: 'Train',

  async isActive(ctx: ScoreContext): Promise<boolean> {
    const { data } = await ctx.supabase
      .from('training_settings')
      .select('rotation_days, setup_complete')
      .eq('user_id', ctx.userId)
      .maybeSingle()
    if (!data || data.setup_complete !== true) return false
    return trainTargetPerWeek((data.rotation_days as RotationDay[]) ?? []) > 0
  },

  async evaluate(ctx: ScoreContext): Promise<ContributorResult> {
    const keys = trainWindowKeys()

    const { data: settings } = await ctx.supabase
      .from('training_settings')
      .select('rotation_days')
      .eq('user_id', ctx.userId)
      .maybeSingle()
    const target = trainTargetPerWeek((settings?.rotation_days as RotationDay[]) ?? [])

    const { data: rows } = await ctx.supabase
      .from('workouts')
      .select('date')
      .eq('user_id', ctx.userId)
      .in('date', keys)
      .not('submitted_at', 'is', null) // a session counts only once submitted

    const loggedDates = (rows ?? []).map(r => r.date as string)
    const rate = trainRate(target, loggedDates, keys)

    const inWindow = new Set(keys)
    const distinct = new Set(loggedDates.filter(d => inWindow.has(d)))
    const earliestDataKey = distinct.size
      ? Array.from(distinct).reduce((a, b) => (a < b ? a : b))
      : null

    // Train deliberately does NOT use the engine's recency WEIGHTS the way Fuel
    // does. A per-day weighted blend of "trained today?" would punish rest days
    // (training 3 of 7 planned days would read ~0.4 even when perfectly on plan),
    // which is exactly what the frequency model exists to avoid. So blended is
    // the flat weekly rate, and last7Avg mirrors it (trend is flat for Train).
    // `today` answers a different, still-useful question — did you train today? —
    // on a binary scale; it's surfaced only to the mentor brain, not the score.
    return {
      key: 'train',
      label: 'Train',
      blended: rate,
      today: distinct.has(keys[0]) ? 1 : 0,
      last7Avg: rate,
      earliestDataKey,
    }
  },
}
