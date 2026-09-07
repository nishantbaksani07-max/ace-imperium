/**
 * Fuel contributor for the Vitality Score. Naturally per-day: completion is the
 * fraction of the user's calorie goal logged that day (capped at 1), then
 * today-weighted via the engine's weight vector. v1 grades calories only
 * (kcal_target is the always-present goal field); protein/carb blending is a
 * later enhancement. Macros use a 4am day-key rollover (lib/nutrition/dayKey).
 */
import { getLocalDayKey, getRecentDayKeys } from '@/lib/nutrition/dayKey'
import {
  weightedBlend,
  type Contributor,
  type ContributorResult,
  type ScoreContext,
} from '@/lib/vitality/score'

/** Pure: per-day calorie-goal completion 0..1 for the given ordered day keys. */
export function fuelDoneByDay(
  kcalByDayKey: Record<string, number>,
  kcalTarget: number,
  keys: string[],
): number[] {
  if (!kcalTarget || kcalTarget <= 0) return keys.map(() => 0)
  return keys.map(k => {
    const kcal = kcalByDayKey[k] ?? 0
    return Math.max(0, Math.min(1, kcal / kcalTarget))
  })
}

/** Build the trailing-7 day keys (index 0 = today) using the 4am macro rollover.
 *  getRecentDayKeys does DST-safe noon-UTC math and returns most-recent first. */
function fuelWindowKeys(): string[] {
  return getRecentDayKeys(getLocalDayKey(), 7)
}

export const fuelContributor: Contributor = {
  key: 'fuel',
  label: 'Fuel',

  async isActive(ctx: ScoreContext): Promise<boolean> {
    const { data } = await ctx.supabase
      .from('nutrition_goals')
      .select('kcal_target, onboarded')
      .eq('user_id', ctx.userId)
      .maybeSingle()
    return !!data && data.onboarded === true && Number(data.kcal_target) > 0
  },

  async evaluate(ctx: ScoreContext): Promise<ContributorResult> {
    const keys = fuelWindowKeys()

    const { data: goal } = await ctx.supabase
      .from('nutrition_goals')
      .select('kcal_target')
      .eq('user_id', ctx.userId)
      .maybeSingle()
    const kcalTarget = Number(goal?.kcal_target ?? 0)

    const { data: meals } = await ctx.supabase
      .from('nutrition_meals')
      .select('day_key, totals')
      .eq('user_id', ctx.userId)
      .in('day_key', keys)

    const kcalByDay: Record<string, number> = {}
    for (const m of meals ?? []) {
      const kcal = Number((m.totals as { kcal?: number } | null)?.kcal ?? 0)
      kcalByDay[m.day_key as string] = (kcalByDay[m.day_key as string] ?? 0) + kcal
    }

    const done = fuelDoneByDay(kcalByDay, kcalTarget, keys)
    const loggedKeys = keys.filter(k => (kcalByDay[k] ?? 0) > 0)
    const earliestDataKey = loggedKeys.length ? loggedKeys.reduce((a, b) => (a < b ? a : b)) : null

    return {
      key: 'fuel',
      label: 'Fuel',
      blended: weightedBlend(done),
      today: done[0] ?? 0,
      last7Avg: done.reduce((a, b) => a + b, 0) / done.length,
      earliestDataKey,
    }
  },
}
