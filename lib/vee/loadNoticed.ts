/**
 * loadNoticed - the server-side loader for the new Vee surface (/app/mentor-next).
 * It gathers the SAME real, deterministic insight data the live mentor page builds,
 * and now carries the FULL fused goals engine too: the "Vitality noticed" feed,
 * the per-goal steering rows (buildTicker), the per-goal guides (buildGoalGuide),
 * the life chips, the rarity collection, the run-stats proof strip, and the raw
 * goals/habits/streak for the authoring section.
 *
 * It reuses the existing engine helpers (buildFeed, gatherDrift, gatherGreenLight,
 * buildTicker, buildGoalGuide, buildLifeChips, the fusion seams, selectFresh /
 * selectFusion) - it does NOT reimplement any of them. All reads are RLS-scoped
 * to the passed user and wrapped best-effort: every branch has a fallback, the
 * whole gather is guarded, and buildFeed always returns at least the honest
 * cold-start promise, so this can never throw.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getBigGoals, getHabitGoals, getStreak } from '@/lib/goals/repo'
import { gatherDrift } from '@/lib/goals/driftData'
import { gatherGreenLight } from '@/lib/oracle/greenlightData'
import { buildStarter } from '@/lib/oracle/coldStart'
import { buildTicker, type TickerLift, type TickerRow } from '@/lib/insights/ticker'
import { buildGoalGuide, guideProjectionLead, supplementAdherence, type GuideItem, type GuideModule, type GuideLift } from '@/lib/insights/goalGuide'
import { buildLifeChips, type LifeChip } from '@/lib/insights/lifeChips'
import { buildFeed, type FeedNotice } from '@/lib/insights/feed'
import { buildFirstFind } from '@/lib/insights/firstFind'
import { sleepWorkoutCandidate, spendSleepCandidate, type SleepTrainWeek, type SleepSpendWeek } from '@/lib/insights/fusion'
import { caffeineRecoveryCandidate } from '@/lib/insights/peakSeams'
import { findStreamConnections, connectionToCandidate, type OutcomeDef } from '@/lib/insights/streamConnections'
import { groupReportRows, type ReportKind, type GoalDirection, type TileStreamRow, type TileReportRow } from '@/lib/tiles/reportContract'
import { selectFusion } from '@/lib/insights/fusionSelect'
import { selectFresh, patternKeyOf, type NoticedCooldown, type NoticedResolution } from '@/lib/insights/noticedLedger'
import { rarityOf } from '@/lib/insights/rarity'
import { rarityForNotice, buildCollection, type CollectionTier, type Rarity } from '@/lib/vee/rarity'
import { toDailySeries } from '@/lib/insights/series'
import { getLiftProgression, getWater, getStimulantsDaily, type StimulantDay } from '@/mcp/src/queries'
import type { VitalityDb } from '@/mcp/src/supabase'
import { EMPTY_STREAK, type BigGoal, type HabitGoal, type GoalStreak } from '@/app/app/goals/veeTypes'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>

/** The run-stats proof strip: honest counts only, all derived from real rows. */
export interface VeeRunStats {
  daysLogged: number
  modulesFeeding: number
  insightsFound: number
  rarestTier: Rarity | null
}

/** Real-evidence gates for the auto-track habit suggestions: a suggestion may
 *  only render when the server actually saw rows behind it. */
export interface SuggestionEvidence {
  /** Any logged workout in the last 21 days. */
  train: boolean
  /** Any meal ever logged in Fuel. */
  protein: boolean
  /** Any wearable sleep reading on file. */
  sleep: boolean
}

export interface NoticedData {
  firstName: string | null
  feed: FeedNotice[]
  /** Per-goal steering rows (honest sparkline + trend state), goal id keyed by row.id. */
  rows: TickerRow[]
  /** Per-goal "how Vitality gets you there" guide items, keyed by goal id. */
  guides: Record<string, GuideItem[]>
  lifeChips: LifeChip[]
  /** The six-tier rarity collection tally of this load's graded finds. */
  collection: CollectionTier[]
  stats: VeeRunStats
  /** ALL of the user's big goals (any status) for the authoring section. */
  goals: BigGoal[]
  habits: HabitGoal[]
  streak: GoalStreak
  /** Which auto-track suggestions have real data behind them (zero evidence = no rows). */
  suggestionEvidence: SuggestionEvidence
  /** The modules that actually have data (already computed for the guides);
   *  the Claude handoff + quick questions read this, no extra queries. */
  activeModules: GuideModule[]
  /** The user's own tile streams (deduped by canonical key), for the
   *  "what steers this" binding picker. RLS-scoped read, done here once. */
  tileStreams: { key: string; label: string; kind: string }[]
  /** True when any batched read failed: the data below is INCOMPLETE, not absent.
   *  The page must show one calm "could not read" line instead of cold-start copy,
   *  so a DB hiccup never tells a daily logger they have not logged. */
  degraded: boolean
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function daysAgoKey(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The always-safe fallback: the honest cold-start promise, nothing else. */
function starterOnlyFeed(): FeedNotice[] {
  try {
    return buildFeed({
      convergence: null, drift: null, rows: [],
      starter: buildStarter({ topGoalTitle: null, activeGoalCount: 0, loggedDomains: [] }),
      hasAnyData: false,
    })
  } catch {
    return []
  }
}

/** Calm, complete empties. Used when the whole gather fails: never throw into the
 *  page. degraded defaults true because this shape means "we could not read", not
 *  "there is nothing" - the harness passes false to preview a genuine cold start. */
function emptyData(degraded = true): NoticedData {
  return {
    firstName: null,
    feed: starterOnlyFeed(),
    rows: [],
    guides: {},
    lifeChips: [],
    collection: buildCollection([]),
    stats: { daysLogged: 0, modulesFeeding: 0, insightsFound: 0, rarestTier: null },
    goals: [],
    habits: [],
    streak: { ...EMPTY_STREAK },
    suggestionEvidence: { train: false, protein: false, sleep: false },
    activeModules: [],
    tileStreams: [],
    degraded,
  }
}

export async function loadNoticed(supabase: Db, userId: string): Promise<NoticedData> {
  try {
    const today = todayKey()
    const since7 = daysAgoKey(7)

    // One batched read for the raw inputs. Any single failure resolves to
    // an empty result via `?? []`, so everything downstream still builds.
    const [
      profileRes,
      weightRes,
      wearableRes,
      workouts7Res,
      workouts21Res,
      weights60Res,
      sleep56Res,
      workouts56Res,
      recovery56Res,
      tileStreamsRes,
      tileReportsRes,
      waterRes,
      mealsRes,
      protein7Res,
      nutritionGoalsRes,
      socialRes,
      financeNwRes,
      financePrefsRes,
      recovery14Res,
      suppRes,
      waterPrefsRes,
      spend56Res,
    ] = await Promise.all([
      supabase.from('user_profile').select('first_name, goal, units').eq('user_id', userId).maybeSingle(),
      supabase.from('weights').select('weight_kg, date').eq('user_id', userId).order('date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('wearable_data').select('recovery, sleep_hours, date').eq('user_id', userId).order('date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('workouts').select('id, submitted_at').eq('user_id', userId).gte('date', since7),
      supabase.from('workouts').select('date').eq('user_id', userId).not('submitted_at', 'is', null).gte('date', daysAgoKey(21)),
      supabase.from('weights').select('weight_kg, date').eq('user_id', userId).gte('date', daysAgoKey(60)).order('date', { ascending: false }),
      supabase.from('wearable_data').select('date, sleep_hours').eq('user_id', userId).not('sleep_hours', 'is', null).gte('date', daysAgoKey(56)),
      supabase.from('workouts').select('date').eq('user_id', userId).not('submitted_at', 'is', null).gte('date', daysAgoKey(56)),
      supabase.from('wearable_data').select('date, recovery').eq('user_id', userId).not('recovery', 'is', null).gte('date', daysAgoKey(56)).order('date', { ascending: true }),
      supabase.from('tile_streams').select('id, tile_id, key, canonical_key, label, kind, goal_direction').eq('user_id', userId),
      supabase.from('tile_reports').select('stream_id, stream_key, value, date').eq('user_id', userId).gte('date', daysAgoKey(56)),
      // today's water, for the life chips + the water guide row
      supabase.from('water_log').select('amount_ml').eq('user_id', userId).eq('date', today),
      // a meal in the last 21 days? decides macros = quick-link vs demo tile AND
      // gates the protein auto-track suggestion — same recency bar as train
      // evidence, so one meal from months ago can never pitch auto-tracking
      supabase.from('nutrition_meals').select('id').eq('user_id', userId).gte('day_key', daysAgoKey(21)).limit(1),
      // last 7 days of meals + the protein target, for the protein guide row
      supabase.from('nutrition_meals').select('day_key, totals').eq('user_id', userId).gte('day_key', since7),
      supabase.from('nutrition_goals').select('protein_target').eq('user_id', userId).maybeSingle(),
      // follower snapshots (oldest to newest), for the brand guide row
      supabase.from('social_snapshots').select('platform, followers, captured_at').eq('user_id', userId).order('captured_at', { ascending: true }).limit(200),
      // net-worth history + the finance currency, for the finance guide row
      supabase.from('finance_net_worth_history').select('value_chf, captured_at').eq('user_id', userId).order('captured_at', { ascending: true }).limit(200),
      supabase.from('finance_prefs').select('currency').eq('user_id', userId).maybeSingle(),
      // last 14 nights of sleep + recovery, for the recovery guide row
      supabase.from('wearable_data').select('date, sleep_hours, recovery').eq('user_id', userId).gte('date', daysAgoKey(14)).order('date', { ascending: true }),
      // supplements state blob (items + taken history), for the adherence row
      supabase.from('supplements_state').select('data').eq('user_id', userId).maybeSingle(),
      // water serving volumes, to turn water_days serving counts into liters
      supabase.from('water_prefs').select('unit, bottle_ml, glass_ml').eq('user_id', userId).maybeSingle(),
      // last 56 days of discretionary spend (outflows), for the spend x sleep seam
      supabase.from('finance_orders').select('amount_chf, direction, arrival_date, created_at').eq('user_id', userId).gte('created_at', daysAgoKey(56)),
    ])

    const firstName = (profileRes.data?.first_name as string | null) ?? null

    // The degraded flag, part 1: supabase reads resolve { data, error } instead of
    // rejecting, so a failed table read otherwise impersonates "no rows" downstream
    // (a `?? []` renders the cold-start ask a daily logger reads as "my data is
    // gone"). Any error in the batch marks this load INCOMPLETE, not empty.
    const batchErrored = [
      profileRes, weightRes, wearableRes, workouts7Res, workouts21Res, weights60Res,
      sleep56Res, workouts56Res, recovery56Res, tileStreamsRes, tileReportsRes,
      waterRes, mealsRes, protein7Res, nutritionGoalsRes, socialRes, financeNwRes,
      financePrefsRes, recovery14Res, suppRes, waterPrefsRes,
    ].some(r => r.error != null)

    // Engine helpers - each isolated so a single failure can't sink the load.
    const v: VitalityDb = { db: supabase as unknown as VitalityDb['db'], userId, mode: 'user', scopes: ['mcp:read'] }
    const [bigGoalsRes, habitGoalsRes, streakRes, driftRes, greenLightRes, progRes, waterMcpRes, stimRes, ledgerRes] = await Promise.allSettled([
      getBigGoals(supabase as never, userId),
      getHabitGoals(supabase as never, userId),
      getStreak(supabase as never, userId),
      gatherDrift(supabase as never, userId, today),
      gatherGreenLight(supabase as never, userId, today),
      getLiftProgression(v),
      getWater(v, today),
      getStimulantsDaily(v, 56),
      supabase.from('noticed_ledger').select('pattern_key, last_shown_at, resolution').eq('user_id', userId).order('last_shown_at', { ascending: false }),
    ])

    // Goals: keep ALL of them for the authoring section, and the priority-sorted
    // active set for the steering engine. Every active goal gets a row + guide
    // (buildTicker/buildGoalGuide are pure and cheap; the IO above is shared),
    // so a goal past any cap can never show a false "feed me" cold-start line.
    // The degraded flag, part 2: the engine-helper batch runs allSettled, so a
    // rejected helper (e.g. the goals repo mid-migration - its reads THROW on a
    // PostgREST error precisely so this check can see them) also marks the load
    // incomplete instead of silently rendering an emptier page. The raw ledger
    // query never rejects (supabase resolves { data, error }), so its .error is
    // checked explicitly - a failed ledger read wipes cooldown/resolution state
    // and must never pass as "no rows".
    const helpersErrored = [
      bigGoalsRes, habitGoalsRes, streakRes, driftRes, greenLightRes,
      progRes, waterMcpRes, stimRes, ledgerRes,
    ].some(r => r.status === 'rejected')
      || (ledgerRes.status === 'fulfilled' && ledgerRes.value.error != null)
    const degraded = batchErrored || helpersErrored

    const allGoals: BigGoal[] = bigGoalsRes.status === 'fulfilled' ? bigGoalsRes.value : []
    const activeGoals = allGoals
      .filter(g => g.status === 'active')
      .sort((a, b) => b.priority - a.priority)
    const steerGoals = activeGoals
    const habits: HabitGoal[] = habitGoalsRes.status === 'fulfilled' ? habitGoalsRes.value : []
    const streak: GoalStreak = streakRes.status === 'fulfilled' ? streakRes.value : { ...EMPTY_STREAK }

    const drift = driftRes.status === 'fulfilled' ? driftRes.value : null
    const noticed = greenLightRes.status === 'fulfilled' ? greenLightRes.value : null

    // Momentum inputs.
    const rawGoal = String(profileRes.data?.goal ?? '').toLowerCase()
    const goalDirection: 'lose' | 'gain' | 'maintain' | null =
      /los|cut|lean|fat|shred/.test(rawGoal) ? 'lose'
        : /gain|bulk|muscle|mass|build/.test(rawGoal) ? 'gain'
          : /maintain|recomp/.test(rawGoal) ? 'maintain'
            : null
    const weighIns = (weights60Res.data ?? [])
      .map(r => ({ date: r.date as string, kg: Number(r.weight_kg) }))
      .filter(w => Number.isFinite(w.kg))
    const workoutDates21 = (workouts21Res.data ?? []).map(r => r.date as string)

    let lifts: TickerLift[] = []
    let guideLifts: GuideLift[] = []
    let water: { todayServings: number; recentAvgServings: number | null; targetServings: number; unit: string } | undefined
    let stimDaily: StimulantDay[] = []
    const noticedCooldown: Record<string, NoticedCooldown> = {}
    if (progRes.status === 'fulfilled') {
      lifts = progRes.value.lifts.map(l => ({
        id: l.id, name: l.name,
        sessions: l.sessions.map(s => ({ date: s.date, topWeight: s.topWeight })),
      }))
      guideLifts = progRes.value.lifts.map(l => ({ id: l.id, name: l.name, sessions: l.sessions }))
    }
    if (waterMcpRes.status === 'fulfilled') {
      const w = waterMcpRes.value
      if (w.hasData && w.targetServings != null) {
        water = { todayServings: w.todayServings, recentAvgServings: w.recentAvgServings, targetServings: w.targetServings, unit: w.unit }
      }
    }
    if (stimRes.status === 'fulfilled') stimDaily = stimRes.value
    if (ledgerRes.status === 'fulfilled') {
      for (const row of ledgerRes.value.data ?? []) {
        const key = String(row.pattern_key ?? '')
        if (!key || noticedCooldown[key]) continue
        noticedCooldown[key] = {
          lastShownAt: (row.last_shown_at ?? null) as string | null,
          resolution: (row.resolution ?? null) as NoticedResolution | null,
        }
      }
    }

    // The user's own tile streams + reports, mapped once here: the ticker draws
    // override-bound goals from them, and "Vee connects" scans them below.
    const tileStreams: TileStreamRow[] = (tileStreamsRes.data ?? []).map(r => ({
      id: String(r.id),
      tileId: (r.tile_id ?? '') as string,
      key: r.key as string,
      canonicalKey: (r.canonical_key ?? r.key) as string,
      label: r.label as string,
      kind: r.kind as ReportKind,
      goalDirection: (r.goal_direction ?? null) as GoalDirection | null,
    }))
    const tileReports: TileReportRow[] = (tileReportsRes.data ?? []).map(r => ({
      streamId: r.stream_id ? String(r.stream_id) : undefined,
      streamKey: r.stream_key as string,
      value: Number(r.value),
      date: String(r.date).slice(0, 10),
    }))
    // Grouped once via the canonical joiner (stream-id first, key fallback only
    // for a sole owner) so every consumer counts reports the same way.
    const groupedStreams = groupReportRows(tileStreams, tileReports)

    const tickerRows = buildTicker({
      goals: steerGoals.map(g => ({ id: g.id, title: g.title, cleanTitle: g.cleanTitle, category: g.category, bindingOverride: g.bindingOverride ?? null })),
      weighIns, goalDirection, workoutDatesLast21: workoutDates21, lifts,
      streams: groupedStreams.map(({ def, rows: rs }) => ({
        canonicalKey: def.canonicalKey,
        label: def.label,
        goalDirection: def.goalDirection,
        points: rs.map(r => ({ date: r.date, value: r.value })),
      })),
    })

    // The per-goal "how Vitality gets you there" guide. A module the user already
    // logs becomes a quick-link; one they don't shows a demo tile.
    const weight = weightRes.data
    const wearable = wearableRes.data
    // Today's water: the LIVE tracker writes serving COUNTS to water_days (read
    // via getWater above); the old ml-per-drink water_log stays dormant, kept
    // only as a fallback for any account that ever wrote it.
    const waterLogMl = (waterRes.data ?? []).reduce((sum, r) => sum + Number(r.amount_ml ?? 0), 0)
    const waterServingsToday = waterMcpRes.status === 'fulfilled' && waterMcpRes.value.hasData ? waterMcpRes.value.todayServings : 0
    const waterUnit = String(waterPrefsRes.data?.unit ?? 'bottle')
    const waterServingMl = waterUnit === 'bottle' ? (Number(waterPrefsRes.data?.bottle_ml) || 500)
      : waterUnit === 'glass' ? (Number(waterPrefsRes.data?.glass_ml) || 250)
        : waterUnit === 'oz' ? 30 : 1
    const waterToday = waterServingsToday > 0 ? waterServingsToday * waterServingMl : waterLogMl
    const activeModules: GuideModule[] = []
    if (workoutDates21.length > 0) activeModules.push('train')
    if (weighIns.length > 0) activeModules.push('weight')
    if (wearable?.recovery != null || wearable?.sleep_hours != null) activeModules.push('recovery')
    if (waterToday > 0 || (water && (water.todayServings > 0 || (water.recentAvgServings ?? 0) > 0))) activeModules.push('water')
    if ((mealsRes.data ?? []).length > 0) activeModules.push('macros')
    if ((socialRes.data ?? []).length > 0) activeModules.push('brand')
    if ((financeNwRes.data ?? []).length > 0) activeModules.push('finance')
    if (suppRes.data?.data) activeModules.push('supplements')
    const guideUnits = profileRes.data?.units === 'imperial' ? 'imperial' : 'metric'
    // Daily protein totals over the window, for the protein row's "low days" read.
    const proteinByDay = new Map<string, number>()
    for (const r of (protein7Res.data ?? [])) {
      const t = (r.totals && typeof r.totals === 'object' ? r.totals : {}) as { protein?: number }
      const p = Number(t.protein ?? 0)
      const key = String(r.day_key)
      if (Number.isFinite(p)) proteinByDay.set(key, (proteinByDay.get(key) ?? 0) + p)
    }
    const proteinPerDay = Array.from(proteinByDay.values()).filter(g => g > 0)
    const proteinTargetG = nutritionGoalsRes.data?.protein_target != null ? Number(nutritionGoalsRes.data.protein_target) : null
    // Brand row: pick ONE primary platform (most snapshots, never summed) and
    // build its follower series over time.
    const byPlatform = new Map<string, { date: string; count: number }[]>()
    for (const r of (socialRes.data ?? [])) {
      const followers = Number(r.followers)
      if (!Number.isFinite(followers) || followers <= 0) continue
      const date = String(r.captured_at).slice(0, 10)
      const platform = String(r.platform ?? 'other')
      const arr = byPlatform.get(platform) ?? []
      arr.push({ date, count: followers })
      byPlatform.set(platform, arr)
    }
    let social: { platform: string | null; series: { date: string; count: number }[] } | undefined
    for (const [platform, series] of byPlatform) {
      if (series.length > (social?.series.length ?? 0)) social = { platform, series }
    }
    // Finance row: the net-worth history (canonical CHF) + the user's currency.
    const nwHistory = (financeNwRes.data ?? [])
      .map(r => ({ date: String(r.captured_at).slice(0, 10), valueChf: Number(r.value_chf) }))
      .filter(p => Number.isFinite(p.valueChf))
    const finance = nwHistory.length > 0
      ? { series: nwHistory, currency: String(financePrefsRes.data?.currency ?? 'CHF') }
      : undefined
    // Recovery row: nightly sleep + recovery, deduped by date (a multi-band user
    // can have more than one provider row per day), keeping the first non-null.
    const recByDate = new Map<string, { sleepH: number | null; recovery: number | null }>()
    for (const r of (recovery14Res.data ?? [])) {
      const date = String(r.date)
      const prev = recByDate.get(date)
      const sleepH = r.sleep_hours != null && Number.isFinite(Number(r.sleep_hours)) ? Number(r.sleep_hours) : null
      const rec = r.recovery != null && Number.isFinite(Number(r.recovery)) ? Number(r.recovery) : null
      recByDate.set(date, { sleepH: prev?.sleepH ?? sleepH, recovery: prev?.recovery ?? rec })
    }
    const recoveryNights = Array.from(recByDate.entries()).map(([date, val]) => ({ date, sleepH: val.sleepH, recovery: val.recovery }))
    const recovery = recoveryNights.length > 0 ? { nights: recoveryNights } : undefined
    // Supplements row: adherence over the days the stack provably existed.
    const suppWindow: string[] = []
    for (let i = 0; i < 7; i++) suppWindow.push(daysAgoKey(i))
    const supplements = supplementAdherence(
      (suppRes.data?.data ?? null) as { items?: { id?: string }[]; taken?: Record<string, Record<string, number>> } | null,
      suppWindow,
      today,
    ) ?? undefined
    const guides: Record<string, GuideItem[]> = Object.fromEntries(
      steerGoals.map(g => [g.id, buildGoalGuide(
        { title: g.title, cleanTitle: g.cleanTitle, category: g.category, targetDate: g.targetDate, progressUnit: g.progressUnit },
        activeModules,
        {
          lifts: guideLifts, today, units: guideUnits, weighIns, weightDirection: goalDirection,
          protein: { perDayG: proteinPerDay, targetG: proteinTargetG },
          social, finance, recovery, supplements, water,
        },
      )]),
    )

    // Life chips: the small live-stat row. Honest-only; a chip appears only when real.
    const sleep7 = (sleep56Res.data ?? [])
      .filter(r => String(r.date) >= since7)
      .map(r => Number(r.sleep_hours))
      .filter(n => Number.isFinite(n))
    const lifeChips = buildLifeChips({
      sessionsPerWeek: workoutDates21.length > 0 ? workoutDates21.length / 3 : null,
      sleepAvgH: sleep7.length ? sleep7.reduce((a, b) => a + b, 0) / sleep7.length : null,
      recovery: wearable?.recovery != null ? Number(wearable.recovery) : null,
      weightKg: weight?.weight_kg != null ? Number(weight.weight_kg) : null,
      waterL: waterToday > 0 ? waterToday / 1000 : null,
    })

    // Cold-start promise: an honest "watching" line for a brand-new account.
    const sessionsDone = (workouts7Res.data ?? []).filter(w => w.submitted_at).length
    const loggedDomains: string[] = []
    if (sessionsDone > 0) loggedDomains.push('training')
    if (weight?.weight_kg != null) loggedDomains.push('weight')
    if (wearable?.sleep_hours != null) loggedDomains.push('sleep')
    const starter = buildStarter({
      topGoalTitle: steerGoals[0] ? (steerGoals[0].cleanTitle ?? steerGoals[0].title) : null,
      activeGoalCount: activeGoals.length,
      loggedDomains,
    })

    // Cross-domain fusion seams (the rare / epic / legendary cards): bucket by ISO
    // week and let the pure gated engine decide whether each link is real.
    const weekOf = (d: string): number | null => {
      const t = Date.parse(`${d}T00:00:00Z`)
      return Number.isFinite(t) ? Math.floor(t / 86_400_000 / 7) : null
    }
    const sleepByWeek = new Map<number, { sum: number; n: number }>()
    for (const r of (sleep56Res.data ?? [])) {
      const wk = weekOf(String(r.date)); const h = Number(r.sleep_hours)
      if (wk == null || !Number.isFinite(h) || h <= 0) continue
      const c = sleepByWeek.get(wk) ?? { sum: 0, n: 0 }; c.sum += h; c.n++; sleepByWeek.set(wk, c)
    }
    const trainByWeek = new Map<number, number>()
    for (const r of (workouts56Res.data ?? [])) {
      const wk = weekOf(String(r.date)); if (wk == null) continue
      trainByWeek.set(wk, (trainByWeek.get(wk) ?? 0) + 1)
    }
    const fusionWeeks: SleepTrainWeek[] = [...sleepByWeek.entries()]
      .filter(([, c]) => c.n >= 3)
      .map(([wk, c]) => ({ wk, sleepAvg: c.sum / c.n, sessions: trainByWeek.get(wk) ?? 0 }))
      .sort((a, b) => a.wk - b.wk)
    const sleepCandidate = sleepWorkoutCandidate(fusionWeeks)

    // Spending x sleep (finance x vitals): total each week's discretionary
    // outflows (canonical CHF), keyed to the same weeks as sleep. A week with no
    // logged spend is a real 0, not a gap. The gated engine decides if it is real.
    const spendByWeek = new Map<number, number>()
    for (const r of (spend56Res.data ?? [])) {
      if ((r.direction ?? 'out') === 'in') continue // income is not spend
      const day = (r.arrival_date as string | null) ?? String(r.created_at ?? '').slice(0, 10)
      const wk = weekOf(day); if (wk == null) continue
      const amt = Number(r.amount_chf)
      if (!Number.isFinite(amt) || amt <= 0) continue
      spendByWeek.set(wk, (spendByWeek.get(wk) ?? 0) + amt)
    }
    const spendWeeks: SleepSpendWeek[] = [...sleepByWeek.entries()]
      .filter(([, c]) => c.n >= 3)
      .map(([wk, c]) => ({ wk, sleepAvg: c.sum / c.n, spend: spendByWeek.get(wk) ?? 0 }))
      .sort((a, b) => a.wk - b.wk)
    const spendCandidate = spendSleepCandidate(spendWeeks)

    const caffeineSeries = toDailySeries(
      stimDaily.map(s => ({ date: s.date, value: s.caffeineMg })),
      { density: 'daily', agg: 'sum' },
    )
    const recoverySeries = toDailySeries(
      (recovery56Res.data ?? []).map(r => ({ date: String(r.date), value: r.recovery != null ? Number(r.recovery) : null })),
      { density: 'daily', agg: 'mean' },
    )
    const caffeineCandidate = caffeineRecoveryCandidate(caffeineSeries.points, recoverySeries.points)

    // "Vee connects": the user's own tile streams scanned against the core outcomes.
    const outcomes: OutcomeDef[] = [
      { name: 'recovery', label: 'recovery', points: recoverySeries.points },
      {
        name: 'sleep', label: 'sleep',
        points: toDailySeries(
          (sleep56Res.data ?? []).map(r => ({ date: String(r.date), value: r.sleep_hours != null ? Number(r.sleep_hours) : null })),
          { density: 'daily', agg: 'mean' },
        ).points,
      },
      {
        name: 'training', label: 'training',
        points: toDailySeries(
          (workouts56Res.data ?? []).map(r => ({ date: String(r.date), value: 1 })),
          { density: 'daily', agg: 'count' },
        ).points,
      },
    ]
    const connections = findStreamConnections(
      groupedStreams.map(({ def, rows }) => ({ def, rows })),
      outcomes,
    )
    const connectionCandidate = connections.length ? connectionToCandidate(connections[0]) : null

    // Rest any seam still on its cooldown, then surface the ONE deepest true seam left.
    const freshCandidates = selectFresh([sleepCandidate, spendCandidate, caffeineCandidate, connectionCandidate], noticedCooldown, today)
    const fusionPick = selectFusion(freshCandidates)
    const fusionKey = fusionPick ? patternKeyOf(fusionPick.score.domains) : null

    const hasAnyData = activeGoals.length > 0 || weighIns.length > 0 || workoutDates21.length > 0

    // Upgrade the momentum headline with the SAME grounded projection the goal's
    // guide shows, when its brain fired. Gated on 2+ spark points + a real detail.
    const goalReads: Record<string, string> = {}
    for (const r of tickerRows) {
      if (r.spark.length < 2 || !r.detail) continue
      const mod: GuideModule | null = r.metric === 'weight' ? 'weight'
        : (r.metric === 'lift' || r.metric === 'training') ? 'train' : null
      if (!mod) continue
      const lead = guideProjectionLead(guides[r.id], mod)
      if (lead) goalReads[r.id] = lead.charAt(0).toLowerCase() + lead.slice(1)
    }

    // The first-find: an honest observation about the user's very first logged
    // data, for the day-one feed. Once-ever by construction: any 'first+' row in
    // the ledger (the read above returns ALL rows, expired or not) means it has
    // already been shown once, so it is never rebuilt.
    const firstEverShown = Object.keys(noticedCooldown).some(k => k.startsWith('first+'))
    const first = firstEverShown ? null : buildFirstFind({
      sessions7: sessionsDone,
      weighIns,
      mealDays7: proteinByDay.size,
      proteinTodayG: proteinByDay.get(today) ?? null,
      waterTodayMl: waterToday,
      sleepLastH: wearable?.sleep_hours != null && Number.isFinite(Number(wearable.sleep_hours)) ? Number(wearable.sleep_hours) : null,
      recoveryLast: wearable?.recovery != null && Number.isFinite(Number(wearable.recovery)) ? Number(wearable.recovery) : null,
      streams: groupedStreams.map(({ def, rows }) => ({ label: def.label, reportCount: rows.length })),
      units: guideUnits,
    })

    const feed = buildFeed({
      convergence: noticed
        ? { goal: { id: noticed.goal.id, title: noticed.goal.title }, domainsHit: noticed.domainsHit, receipts: noticed.receipts.map(r => ({ text: r.text })) }
        : null,
      drift: drift ? { kind: drift.kind, line: drift.line, sub: drift.sub, goalId: drift.goalId } : null,
      rows: tickerRows,
      starter,
      hasAnyData,
      goalReads,
      fusion: fusionPick
        ? { why: fusionPick.notice.why, key: fusionPick.notice.key, receipts: fusionPick.notice.receipts, watched: fusionPick.watched, rarity: rarityOf(fusionPick.score), patternKey: fusionKey ?? undefined }
        : null,
      first,
    })

    // The rarity collection + run stats: honest proof Vee has been on it.
    const graded = feed.filter(n => n.source !== 'starter')
    const collection = buildCollection(graded.map(n => rarityForNotice(n)))
    const rarestTier = [...collection].reverse().find(t => t.count > 0)?.rarity ?? null
    const daySet = new Set<string>()
    for (const r of (workouts56Res.data ?? [])) daySet.add(String(r.date))
    for (const w of weighIns) daySet.add(w.date)
    for (const r of (sleep56Res.data ?? [])) daySet.add(String(r.date))
    for (const r of (recovery56Res.data ?? [])) daySet.add(String(r.date))
    for (const r of tileReports) daySet.add(r.date)
    for (const k of proteinByDay.keys()) daySet.add(k)
    if (waterToday > 0) daySet.add(today)
    const stats: VeeRunStats = {
      daysLogged: daySet.size,
      modulesFeeding: activeModules.length,
      insightsFound: graded.length,
      rarestTier,
    }

    // Auto-track suggestion gates: only offer what real rows can back.
    const suggestionEvidence: SuggestionEvidence = {
      train: workoutDates21.length > 0,
      protein: (mealsRes.data ?? []).length > 0,
      sleep: (sleep56Res.data ?? []).length > 0,
    }

    // Stream hygiene (Alex, 2026-07-11): a deleted tile's graphs must vanish
    // from the picker - deleting the tile in the Library IS the "delete this
    // bugged graph" button. Orphan stream rows stay in the tables for history,
    // but the picker only ever offers streams whose tile still exists.
    const liveTilesRes = await supabase.from('tiles').select('id').eq('user_id', userId)
    const liveTileIds = new Set(((liveTilesRes.data ?? []) as { id: string }[]).map((t) => String(t.id)))

    // The picker's stream list: one entry per canonical family, first label wins.
    const pickerStreams: NoticedData['tileStreams'] = []
    const seenStreamKeys = new Set<string>()
    for (const s of tileStreams) {
      if (s.tileId && !liveTileIds.has(s.tileId)) continue
      if (seenStreamKeys.has(s.canonicalKey)) continue
      seenStreamKeys.add(s.canonicalKey)
      pickerStreams.push({ key: s.canonicalKey, label: s.label, kind: s.kind })
    }

    return { firstName, feed, rows: tickerRows, guides, lifeChips, collection, stats, goals: allGoals, habits, streak, suggestionEvidence, activeModules, tileStreams: pickerStreams, degraded }
  } catch {
    // Total failure: never throw into the page. Hand back the honest promise,
    // flagged degraded so the page says "could not read", never "you have no data".
    return emptyData()
  }
}
