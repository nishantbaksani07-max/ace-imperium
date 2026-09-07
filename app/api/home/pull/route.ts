import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getLocalDateKey } from '@/lib/dates'
import { getLocalDayKey, shiftDayKey } from '@/lib/nutrition/dayKey'
import { syncLatest as syncWhoop, maybeBackfillHistory as backfillWhoop } from '@/lib/whoop/client'
import { syncLatest as syncOura, maybeBackfillHistory as backfillOura } from '@/lib/oura/client'
import { syncLatest as syncFitbit } from '@/lib/fitbit/client'

export const dynamic = 'force-dynamic'
// The freshness pre-sync can spend up to ~4s on a vendor before the reads.
export const maxDuration = 30

// Provider -> idempotent sync (same functions the daily cron + the per-vendor
// /sync routes use; each upserts by (user_id, date, provider)).
const SYNCERS: Record<string, (sb: SupabaseClient, userId: string) => Promise<unknown>> = {
  whoop: syncWhoop,
  oura: syncOura,
  fitbit: syncFitbit,
}

// Provider -> one-time ~30-day history catchup. Self-disarming (stamps
// wearable_connections.history_backfilled_at) and never throws, so calling it
// on every open costs one row-read once it has run.
const BACKFILLERS: Record<string, (sb: SupabaseClient, userId: string) => Promise<unknown>> = {
  whoop: backfillWhoop,
  oura: backfillOura,
}

/**
 * GET /api/home/pull - the one composite read behind "Vitality, I'm home".
 *
 * When the user taps the gem, the ritual opens on a single RLS-scoped pull of
 * everything the acts need, so the "pulling your whole day" beat is honest:
 *   - readings: last 35 days of wearable_data (all providers; the client folds
 *     manual + band rows and computes scores with lib/vitals/score.ts, which is
 *     pure and shared with the Vitals tab so the numbers always agree)
 *   - peakState: the durable Peak mirror (substance logs, profile, hot bar)
 *   - waterToday: today's serving count from water_days (read-through, Phase 0)
 *   - trainingDay: today's locked day_name from training_day, if any
 *   - rotationDays + cycleStartedAt: the training_settings rotation, so the
 *     gym act can place today inside the split without a second fetch
 *   - recentWorkouts: last 14 workouts (date + day_name) for streak/rhythm
 *
 * The response shape is the shared HomePull contract (lib/home/pullTypes.ts).
 * Every branch null-guards: a missing table or empty row degrades to null so
 * the ritual renders its "not much logged yet" state instead of erroring.
 * See docs/ideas/VITALITY-IM-HOME-PLAN.md.
 */
export async function GET(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Local day key comes from the client (its clock defines "today"); fall back
  // to the server's local key so a bare GET still works.
  const { searchParams } = new URL(request.url)
  const rawDay = searchParams.get('day')
  const today = rawDay && /^\d{4}-\d{2}-\d{2}$/.test(rawDay) ? rawDay : getLocalDateKey()

  const since = (() => {
    const d = new Date(`${today}T12:00:00`)
    d.setDate(d.getDate() - 35)
    return getLocalDateKey(d)
  })()
  // Presence windows: water pace reads 14 days; fuel typicals read 7 day keys.
  // Fuel "today" is the 4am-rollover nutrition day key, NOT the midnight key -
  // between midnight and 4am the Fuel tile files meals under yesterday's key,
  // and the recap must agree with the tile (verify LOW-6).
  const waterSince = shiftDayKey(today, -14)
  const fuelToday = getLocalDayKey()
  const fuelSince = shiftDayKey(fuelToday, -7)

  // Freshness: "pulling your whole day" must actually pull. If a connected
  // band has no row for today yet (the nightly cron has not run, the user has
  // not opened Vitals), sync it NOW - otherwise the ritual asks for sleep the
  // band already knows. Best-effort and time-capped: a slow or revoked vendor
  // never stalls the ritual past ~4s; the sync still lands for the next open.
  try {
    const [connsRes, todayRes] = await Promise.all([
      supabase
        .from('wearable_connections')
        .select('provider')
        .eq('user_id', user.id)
        .not('encrypted_access_token', 'is', null),
      supabase.from('wearable_data').select('provider').eq('user_id', user.id).eq('date', today),
    ])
    const haveToday = new Set((todayRes.data ?? []).map((r) => r.provider))
    const connected = (connsRes.data ?? []).map((c) => c.provider as string)
    const stale = connected.filter((p) => p in SYNCERS && !haveToday.has(p))
    // History catchup rides the same capped window: a user who connected a
    // band gets their ~30 days the first time the ritual opens, not only if
    // they find the manual Sync button. A backfill cut off by the 4s cap
    // leaves the marker unset and simply retries next open (or the cron).
    const tasks = [
      ...stale.map((p) => () => SYNCERS[p](supabase, user.id)),
      ...connected.filter((p) => p in BACKFILLERS).map((p) => () => BACKFILLERS[p](supabase, user.id)),
    ]
    if (tasks.length) {
      await Promise.race([
        Promise.allSettled(tasks.map((t) => t())),
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ])
    }
  } catch {
    /* freshness is opportunistic; the pull below reads whatever exists */
  }

  const [readingsRes, peakRes, waterRes, trainingRes, settingsRes, workoutsRes, goalsRes, mealsRes] =
    await Promise.all([
      supabase
        .from('wearable_data')
        .select('provider, date, recovery, hrv, rhr, sleep_perf, sleep_hours, strain')
        .eq('user_id', user.id)
        .gte('date', since)
        .order('date', { ascending: true }),
      supabase.from('peak_state').select('data').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('water_days')
        .select('date, count')
        .eq('user_id', user.id)
        .gte('date', waterSince)
        .lte('date', today)
        .order('date', { ascending: true }),
      supabase.from('training_day').select('day_name').eq('user_id', user.id).eq('date', today).maybeSingle(),
      supabase.from('training_settings').select('rotation_days, cycle_started_at').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('workouts')
        .select('date, day_name')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(14),
      supabase.from('nutrition_goals').select('onboarded').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('nutrition_meals')
        .select('day_key, totals')
        .eq('user_id', user.id)
        .gte('day_key', fuelSince)
        .lte('day_key', fuelToday),
    ])

  // Water: the 14-day rows drive presence + pace; waterToday stays derived
  // from the same rows so existing consumers keep working.
  const waterRecent = (waterRes.error ? [] : (waterRes.data ?? [])).map((r) => ({
    date: String(r.date),
    count: typeof r.count === 'number' ? r.count : 0,
  }))
  const waterToday = waterRecent.find((r) => r.date === today)?.count ?? null

  // Fuel: day-key kcal sums computed here so the payload is a handful of
  // numbers, never the meal rows themselves.
  const kcalByDay = new Map<string, number>()
  for (const row of mealsRes.error ? [] : (mealsRes.data ?? [])) {
    const totals = row.totals as { kcal?: unknown } | null
    const kcal = totals && typeof totals.kcal === 'number' && Number.isFinite(totals.kcal) ? totals.kcal : 0
    kcalByDay.set(row.day_key, (kcalByDay.get(row.day_key) ?? 0) + kcal)
  }
  const todayKcalSum = kcalByDay.get(fuelToday)
  const recentDayKcals = Array.from(kcalByDay.entries())
    .filter(([day, sum]) => day !== fuelToday && sum > 0)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-7)
    .map(([, sum]) => Math.round(sum))
  const goalsRow = goalsRes.error ? null : (goalsRes.data ?? null)
  const fuel =
    goalsRow || kcalByDay.size > 0
      ? {
          onboarded: goalsRow?.onboarded === true,
          todayKcal: todayKcalSum != null ? Math.round(todayKcalSum) : null,
          recentDayKcals,
        }
      : null

  return NextResponse.json({
    today,
    readings: readingsRes.error ? [] : (readingsRes.data ?? []),
    peakState: peakRes.error ? null : (peakRes.data?.data ?? null),
    waterToday,
    waterRecent,
    fuel,
    trainingDay: trainingRes.error ? null : (trainingRes.data?.day_name ?? null),
    rotationDays: settingsRes.error ? null : (settingsRes.data?.rotation_days ?? null),
    cycleStartedAt: settingsRes.error ? null : (settingsRes.data?.cycle_started_at ?? null),
    recentWorkouts: workoutsRes.error ? [] : (workoutsRes.data ?? []),
  })
}
