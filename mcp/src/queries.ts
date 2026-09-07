// Read-only query layer for the Vitality MCP.
//
// One function per domain. Each takes the authenticated client and returns a
// shaped, typed object (never raw rows). Mirrors the column choices in
// lib/coach/context.ts + collectors.ts so the MCP "reads your file" the same way
// the in-app mentor does. Every query is scoped to the user id (redundant under
// RLS in user mode, required in service mode).

import type { VitalityDb } from './supabase.js';
import { dateKeyDaysAgo, getLocalDateKey, getNutritionDayKey, getSupplementDayKey, localDayStartISO, num, str, ageFromBirthday, round, daysBetweenKeys } from './util.js';
import {
  weeklyWeightRate,
  nutritionAdherence,
  sentimentScore,
  sentimentToMood,
  type WeeklyRate,
  type NutritionAdherence,
} from './insights.js';

type Row = Record<string, unknown>;

// ── Profile ──────────────────────────────────────────────────────────────────

export interface Profile {
  firstName: string | null;
  sex: string | null;
  age: number | null;
  heightCm: number | null;
  startingWeightKg: number | null;
  units: string | null;
  goal: string | null;
  focusAreas: string[];
  tier: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
}

export async function getProfile({ db, userId }: VitalityDb): Promise<Profile> {
  const [up, pr] = await Promise.all([
    db
      .from('user_profile')
      .select('first_name, sex, birthday, height_cm, starting_weight_kg, units, goal, focus_areas')
      .eq('user_id', userId)
      .maybeSingle(),
    db
      .from('profiles')
      .select('tier, subscription_status, current_period_end')
      .eq('id', userId)
      .maybeSingle(),
  ]);
  const p = (up.data ?? {}) as Row;
  const b = (pr.data ?? {}) as Row;
  return {
    firstName: str(p.first_name),
    sex: str(p.sex),
    age: ageFromBirthday(p.birthday),
    heightCm: num(p.height_cm),
    startingWeightKg: num(p.starting_weight_kg),
    units: str(p.units),
    goal: str(p.goal),
    focusAreas: Array.isArray(p.focus_areas) ? (p.focus_areas as string[]) : [],
    tier: str(b.tier),
    subscriptionStatus: str(b.subscription_status),
    currentPeriodEnd: str(b.current_period_end),
  };
}

// ── Sleep / recovery (wearables) ───────────────────────────────────────────────

export interface SleepEntry {
  date: string;
  provider: string | null;
  sleepHours: number | null;
  sleepPerf: number | null;
  recovery: number | null;
  hrv: number | null;
  rhr: number | null;
  strain: number | null;
}

export interface SleepPrefs {
  wakeTime: number; // decimal hour
  sleepNeedHours: number;
  recoveryLevel: string | null;
  peakHour: number | null;
}

export interface SleepData {
  entries: SleepEntry[]; // newest first
  prefs: SleepPrefs;
  hasWearable: boolean;
}

const DEFAULT_PREFS: SleepPrefs = {
  wakeTime: 6.5,
  sleepNeedHours: 8,
  recoveryLevel: null,
  peakHour: null,
};

export async function getSleep(v: VitalityDb, days = 14): Promise<SleepData> {
  const { db, userId } = v;
  const [wd, prefs] = await Promise.all([
    db
      .from('wearable_data')
      .select('date, provider, sleep_hours, sleep_perf, recovery, hrv, rhr, strain')
      .eq('user_id', userId)
      .gte('date', dateKeyDaysAgo(days))
      .order('date', { ascending: false }),
    db
      .from('peak_tracker_prefs')
      .select('wake_time, sleep_need_hours, recovery_level, peak_hour')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const entries: SleepEntry[] = ((wd.data as Row[]) ?? []).map((r) => ({
    date: str(r.date) ?? '',
    provider: str(r.provider),
    sleepHours: num(r.sleep_hours),
    sleepPerf: num(r.sleep_perf),
    recovery: num(r.recovery),
    hrv: num(r.hrv),
    rhr: num(r.rhr),
    strain: num(r.strain),
  }));

  const pr = (prefs.data ?? null) as Row | null;
  const resolvedPrefs: SleepPrefs = pr
    ? {
        wakeTime: num(pr.wake_time) ?? DEFAULT_PREFS.wakeTime,
        sleepNeedHours: num(pr.sleep_need_hours) ?? DEFAULT_PREFS.sleepNeedHours,
        recoveryLevel: str(pr.recovery_level),
        peakHour: num(pr.peak_hour),
      }
    : { ...DEFAULT_PREFS };

  return { entries, prefs: resolvedPrefs, hasWearable: entries.length > 0 };
}

// ── Weight ─────────────────────────────────────────────────────────────────────

export interface WeightData {
  entries: { date: string; kg: number; note: string | null }[]; // newest first
  latestKg: number | null;
  deltaKg: number | null;
  trend: 'up' | 'down' | 'steady' | null;
  windowDays: number;
  /** Least-squares kg/week, steadier than deltaKg, which one stray weigh-in swings. */
  weeklyRate: WeeklyRate | null;
  nEntries: number;
}

export async function getWeights(v: VitalityDb, days = 30): Promise<WeightData> {
  const { db, userId } = v;
  const { data } = await db
    .from('weights')
    .select('date, weight_kg, note')
    .eq('user_id', userId)
    .gte('date', dateKeyDaysAgo(days))
    .order('date', { ascending: false });

  const entries = ((data as Row[]) ?? [])
    .map((r) => ({ date: str(r.date) ?? '', kg: num(r.weight_kg) ?? 0, note: str(r.note) }))
    .filter((e) => e.date);

  const latestKg = entries.length ? entries[0].kg : null;
  let deltaKg: number | null = null;
  let trend: WeightData['trend'] = null;
  if (entries.length >= 2 && latestKg != null) {
    const oldest = entries[entries.length - 1].kg;
    deltaKg = round(latestKg - oldest, 1);
    trend = deltaKg > 0.3 ? 'up' : deltaKg < -0.3 ? 'down' : 'steady';
  }
  const weeklyRate = weeklyWeightRate(entries.map((e) => ({ date: e.date, kg: e.kg })));
  return { entries, latestKg, deltaKg, trend, windowDays: days, weeklyRate, nEntries: entries.length };
}

// ── Nutrition / fuel ────────────────────────────────────────────────────────────

export interface NutritionData {
  onboarded: boolean;
  kcalTarget: number;
  proteinTarget: number;
  carbsTarget: number | null;
  fatTarget: number | null;
  goalOutcome: string | null;
  adaptiveEnabled: boolean;
  today: { kcal: number; protein: number; carbs: number; fat: number; mealCount: number; names: string[] };
  recentAvgKcal: number | null;
  recentAvgProtein: number | null;
  recentLoggedDays: number;
  /** Consistency of the last N logged days against the kcal + protein targets. */
  adherence: NutritionAdherence;
}

export async function getNutrition(v: VitalityDb, todayKey = getNutritionDayKey()): Promise<NutritionData> {
  const { db, userId } = v;
  const [goalsRes, mealsRes] = await Promise.all([
    db.from('nutrition_goals').select('*').eq('user_id', userId).maybeSingle(),
    db
      .from('nutrition_meals')
      .select('day_key, totals, what_i_see')
      .eq('user_id', userId)
      .gte('day_key', dateKeyDaysAgo(10))
      .order('logged_at', { ascending: true }),
  ]);

  const g = (goalsRes.data ?? {}) as Row;
  const meals = ((mealsRes.data as Row[]) ?? []).map((r) => {
    const t = (r.totals && typeof r.totals === 'object' ? r.totals : {}) as Row;
    return {
      dayKey: str(r.day_key) ?? '',
      kcal: num(t.kcal) ?? 0,
      protein: num(t.protein) ?? 0,
      carbs: num(t.carbs) ?? 0,
      fat: num(t.fat) ?? 0,
      name: str(r.what_i_see),
    };
  });

  const todayMeals = meals.filter((m) => m.dayKey === todayKey);
  const today = todayMeals.reduce(
    (acc, m) => ({
      kcal: acc.kcal + m.kcal,
      protein: acc.protein + m.protein,
      carbs: acc.carbs + m.carbs,
      fat: acc.fat + m.fat,
      mealCount: acc.mealCount + 1,
      names: m.name ? [...acc.names, m.name] : acc.names,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0, names: [] as string[] },
  );

  // Per-day kcal + protein for every logged day except today, so we can read
  // adherence across the window, not just one day in isolation.
  const byDay = new Map<string, { kcal: number; protein: number }>();
  for (const m of meals) {
    if (m.dayKey === todayKey) continue;
    const acc = byDay.get(m.dayKey) ?? { kcal: 0, protein: 0 };
    acc.kcal += m.kcal;
    acc.protein += m.protein;
    byDay.set(m.dayKey, acc);
  }
  const perDay = Array.from(byDay.values());
  const recentAvgKcal = perDay.length
    ? Math.round(perDay.reduce((a, d) => a + d.kcal, 0) / perDay.length)
    : null;
  const recentAvgProtein = perDay.length
    ? Math.round(perDay.reduce((a, d) => a + d.protein, 0) / perDay.length)
    : null;

  const kcalTarget = num(g.kcal_target) ?? 2400;
  const proteinTarget = num(g.protein_target) ?? 180;

  return {
    onboarded: Boolean(g.onboarded),
    kcalTarget,
    proteinTarget,
    carbsTarget: num(g.carbs_target),
    fatTarget: num(g.fat_target),
    goalOutcome: str(g.goal_outcome),
    adaptiveEnabled: g.adaptive_enabled !== false,
    today: {
      kcal: Math.round(today.kcal),
      protein: Math.round(today.protein),
      carbs: Math.round(today.carbs),
      fat: Math.round(today.fat),
      mealCount: today.mealCount,
      names: today.names.slice(0, 8),
    },
    recentAvgKcal,
    recentAvgProtein,
    recentLoggedDays: byDay.size,
    adherence: nutritionAdherence(perDay, kcalTarget, proteinTarget),
  };
}

/**
 * Dated per-day calories over a window, the cross-module engine needs the dates
 * that getNutrition deliberately drops. One summed entry per logged day (incl.
 * today), newest day_key first. RLS-scoped; degrades to [] on no data/error.
 */
export async function getNutritionDaily(
  v: VitalityDb,
  days = 30,
): Promise<{ date: string; kcal: number }[]> {
  const { db, userId } = v;
  const { data } = await db
    .from('nutrition_meals')
    .select('day_key, totals')
    .eq('user_id', userId)
    .gte('day_key', dateKeyDaysAgo(days));
  const byDay = new Map<string, number>();
  for (const r of (data as Row[]) ?? []) {
    const key = str(r.day_key);
    if (!key) continue;
    const t = (r.totals && typeof r.totals === 'object' ? r.totals : {}) as Row;
    byDay.set(key, (byDay.get(key) ?? 0) + (num(t.kcal) ?? 0));
  }
  return Array.from(byDay.entries())
    .map(([date, kcal]) => ({ date, kcal: Math.round(kcal) }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ── Workouts ─────────────────────────────────────────────────────────────────

export interface WorkoutEntry {
  date: string;
  dayName: string | null;
  submitted: boolean;
  exerciseCount: number;
  setCount: number;
  hasCardio: boolean;
}

export interface WorkoutData {
  entries: WorkoutEntry[]; // newest first
  submittedLast7: number;
  windowDays: number;
}

export async function getWorkouts(v: VitalityDb, days = 14): Promise<WorkoutData> {
  const { db, userId } = v;
  const { data } = await db
    .from('workouts')
    .select('date, day_name, exercises, cardio, submitted_at')
    .eq('user_id', userId)
    .gte('date', dateKeyDaysAgo(days))
    .order('date', { ascending: false });

  const entries: WorkoutEntry[] = ((data as Row[]) ?? []).map((r) => {
    const exercises = Array.isArray(r.exercises) ? (r.exercises as Row[]) : [];
    const setCount = exercises.reduce(
      (acc, ex) => acc + (Array.isArray(ex.sets) ? (ex.sets as unknown[]).length : 0),
      0,
    );
    const cardio = Array.isArray(r.cardio) ? (r.cardio as unknown[]) : [];
    return {
      date: str(r.date) ?? '',
      dayName: str(r.day_name),
      submitted: Boolean(r.submitted_at),
      exerciseCount: exercises.length,
      setCount,
      hasCardio: cardio.length > 0,
    };
  });

  const cutoff7 = dateKeyDaysAgo(7);
  const submittedLast7 = new Set(
    entries.filter((e) => e.submitted && e.date >= cutoff7).map((e) => e.date),
  ).size;

  return { entries, submittedLast7, windowDays: days };
}

// ── Per-lift progression (server-side exposure of the overload data) ─────────────

export interface LiftSessionPoint {
  date: string;
  topWeight: number;
  topReps: number;
  offDay: boolean;
}

export interface LiftProgression {
  id: string;
  name: string;
  /** Top-set-by-date, oldest -> newest. Feeds insights.liftStall. */
  sessions: LiftSessionPoint[];
}

export interface LiftProgressionData {
  lifts: LiftProgression[];
  windowDays: number;
}

/**
 * Per-lift top-set progression over the window, read from workouts.exercises jsonb.
 * One entry per lift the user actually trained, each with its top set per session
 * (heaviest genuinely-logged set, reps as tiebreak, the SAME test getExerciseHistory
 * uses). This is the server-side exposure of the per-lift overload data the in-app
 * graph already computes, so the oracle can ask "is the bench behind the 225 goal?".
 * Extraction only; the stall verdict lives in insights.liftStall.
 */
export async function getLiftProgression(v: VitalityDb, days = 120): Promise<LiftProgressionData> {
  const { db, userId } = v;
  const { data } = await db
    .from('workouts')
    .select('date, exercises, off_day')
    .eq('user_id', userId)
    .gte('date', dateKeyDaysAgo(days))
    .order('date', { ascending: true });

  const byLift = new Map<string, LiftProgression>();
  for (const row of (data as Row[]) ?? []) {
    const date = str(row.date);
    if (!date) continue;
    const offDay = Boolean(row.off_day);
    const exercises = Array.isArray(row.exercises) ? (row.exercises as Row[]) : [];
    for (const ex of exercises) {
      const id = str(ex.id);
      if (!id) continue;
      const sets = Array.isArray(ex.sets) ? (ex.sets as Row[]) : [];
      let topWeight = 0;
      let topReps = 0;
      for (const s of sets) {
        if (!s.done || s.failed) continue;
        const w = num(s.weight) ?? 0;
        const r = num(s.reps) ?? 0;
        if (w <= 0 || r <= 0) continue;
        if (w > topWeight || (w === topWeight && r > topReps)) {
          topWeight = w;
          topReps = r;
        }
      }
      if (topWeight <= 0) continue; // no genuinely-logged set this session
      let lift = byLift.get(id);
      if (!lift) {
        lift = { id, name: str(ex.name) ?? id, sessions: [] };
        byLift.set(id, lift);
      } else {
        lift.name = str(ex.name) ?? lift.name; // keep the most recent label
      }
      lift.sessions.push({ date, topWeight, topReps, offDay });
    }
  }

  return { lifts: [...byLift.values()], windowDays: days };
}

// ── Subscriptions ──────────────────────────────────────────────────────────────

export interface Subscription {
  name: string;
  amountChf: number;
  period: string;
  monthlyChf: number;
  renewal: string | null;
  trialEnds: string | null;
  previousAmountChf: number | null;
  priceChangedAt: string | null;
  enteredAmount: number | null;
  enteredCurrency: string | null;
}

export interface SubscriptionData {
  currency: string;
  subs: Subscription[];
  totalMonthlyChf: number;
  totalYearlyChf: number;
}

function toMonthlyChf(amountChf: number, period: string): number {
  switch (period) {
    case 'weekly':
      return (amountChf * 52) / 12;
    case 'yearly':
      return amountChf / 12;
    case 'monthly':
    default:
      return amountChf;
  }
}

export async function getSubscriptions(v: VitalityDb): Promise<SubscriptionData> {
  const { db, userId } = v;
  const [subsRes, prefsRes] = await Promise.all([
    db
      .from('finance_subscriptions')
      .select(
        'name, amount_chf, period, renewal, trial_ends, previous_amount_chf, price_changed_at, entered_amount, entered_currency',
      )
      .eq('user_id', userId),
    db.from('finance_prefs').select('currency').eq('user_id', userId).maybeSingle(),
  ]);

  const subs: Subscription[] = ((subsRes.data as Row[]) ?? []).map((r) => {
    const amountChf = num(r.amount_chf) ?? 0;
    const period = str(r.period) ?? 'monthly';
    return {
      name: str(r.name) ?? 'Unnamed',
      amountChf,
      period,
      monthlyChf: round(toMonthlyChf(amountChf, period), 2),
      renewal: str(r.renewal),
      trialEnds: str(r.trial_ends),
      previousAmountChf: num(r.previous_amount_chf),
      priceChangedAt: str(r.price_changed_at),
      enteredAmount: num(r.entered_amount),
      enteredCurrency: str(r.entered_currency),
    };
  });

  const totalMonthlyChf = round(
    subs.reduce((acc, s) => acc + s.monthlyChf, 0),
    2,
  );
  return {
    currency: (prefsRes.data as Row | null)?.currency as string | undefined ?? 'CHF',
    subs: subs.sort((a, b) => b.monthlyChf - a.monthlyChf),
    totalMonthlyChf,
    totalYearlyChf: round(totalMonthlyChf * 12, 2),
  };
}

// ── Finance overview ────────────────────────────────────────────────────────────

export interface FinanceOverview {
  currency: string;
  netWorthChf: number;
  accounts: { type: string | null; name: string | null; amountChf: number; ticker: string | null; shares: number | null }[];
  upcomingOrders: { name: string | null; amountChf: number; arrivalDate: string | null; direction: string }[];
}

export async function getFinanceOverview(v: VitalityDb): Promise<FinanceOverview> {
  const { db, userId } = v;
  const [accRes, ordRes, prefsRes] = await Promise.all([
    db
      .from('finance_accounts')
      .select('type, name, amount_chf, ticker, shares')
      .eq('user_id', userId),
    db
      .from('finance_orders')
      .select('name, amount_chf, arrival_date, direction, deducted_at')
      .eq('user_id', userId)
      .is('deducted_at', null),
    db.from('finance_prefs').select('currency').eq('user_id', userId).maybeSingle(),
  ]);

  const accounts = ((accRes.data as Row[]) ?? []).map((r) => ({
    type: str(r.type),
    name: str(r.name),
    amountChf: num(r.amount_chf) ?? 0,
    ticker: str(r.ticker),
    shares: num(r.shares),
  }));
  const netWorthChf = round(
    accounts.reduce((acc, a) => acc + a.amountChf, 0),
    2,
  );
  const upcomingOrders = ((ordRes.data as Row[]) ?? []).map((r) => ({
    name: str(r.name),
    amountChf: num(r.amount_chf) ?? 0,
    arrivalDate: str(r.arrival_date),
    direction: str(r.direction) ?? 'out',
  }));

  return {
    currency: ((prefsRes.data as Row | null)?.currency as string | undefined) ?? 'CHF',
    netWorthChf,
    accounts,
    upcomingOrders,
  };
}

// ── Notes / reminders ─────────────────────────────────────────────────────────

export async function getNotes(v: VitalityDb, days = 10, limit = 25): Promise<{ body: string; createdAt: string }[]> {
  const { db, userId } = v;
  const { data } = await db
    .from('notes')
    .select('body, created_at')
    .eq('user_id', userId)
    .gte('created_at', localDayStartISO(days))
    .order('created_at', { ascending: false })
    .limit(limit);
  return ((data as Row[]) ?? [])
    .map((r) => ({ body: str(r.body) ?? '', createdAt: str(r.created_at) ?? '' }))
    .filter((n) => n.body);
}

// ── Durable user facts (shared mentor memory) ──────────────────────────────────

export async function getUserFacts(
  v: VitalityDb,
  limit = 25,
): Promise<{ kind: string | null; body: string; salience: number | null; source: string | null }[]> {
  const { db, userId } = v;
  const { data } = await db
    .from('user_facts')
    .select('kind, body, salience, source, expires_at')
    .eq('user_id', userId)
    .order('salience', { ascending: false })
    .limit(limit);
  const nowIso = new Date().toISOString();
  return ((data as Row[]) ?? [])
    .filter((r) => {
      const exp = str(r.expires_at);
      return !exp || exp > nowIso;
    })
    .map((r) => ({
      kind: str(r.kind),
      body: str(r.body) ?? '',
      salience: num(r.salience),
      source: str(r.source),
    }))
    .filter((f) => f.body);
}

// ── Mood as a number (mental-health signal for the cross-module engine) ──────────

export interface MoodDay {
  date: string;
  /** 1–5. Explicit check-in if logged that day, else journal-sentiment derived. */
  mood: number;
  source: 'checkin' | 'notes';
}

const MOOD_BODY_RE = /mood today:\s*([1-5])\s*\/\s*5/i;

/**
 * Pure: explicit mood check-ins (user_facts kind='mood', body "Mood today: N/5")
 * + free-text note rows → one mood number per local day. Explicit taps win; days
 * with only notes fall back to that day's averaged journal sentiment (mapped to
 * the same 1–5 axis). Neutral notes (no sentiment words) contribute nothing.
 * Newest day first. Extracted from getMoodDaily so the join logic is unit-tested.
 */
export function shapeMoodDaily(
  moodRows: { body: string; created_at: string }[],
  noteRows: { body: string; created_at: string }[],
): MoodDay[] {
  const checkin = new Map<string, { score: number; ts: string }>();
  for (const r of moodRows) {
    const m = r.body.match(MOOD_BODY_RE);
    if (!m || !r.created_at) continue;
    const date = getLocalDateKey(new Date(r.created_at));
    const prev = checkin.get(date);
    if (!prev || r.created_at > prev.ts) checkin.set(date, { score: Number(m[1]), ts: r.created_at });
  }
  const noteVals = new Map<string, number[]>();
  for (const r of noteRows) {
    if (!r.created_at) continue;
    const s = sentimentScore(r.body);
    if (s == null) continue;
    const date = getLocalDateKey(new Date(r.created_at));
    const arr = noteVals.get(date) ?? [];
    arr.push(s);
    noteVals.set(date, arr);
  }
  const out: MoodDay[] = [];
  for (const date of new Set<string>([...checkin.keys(), ...noteVals.keys()])) {
    const c = checkin.get(date);
    if (c) {
      out.push({ date, mood: c.score, source: 'checkin' });
      continue;
    }
    const vals = noteVals.get(date)!;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    out.push({ date, mood: sentimentToMood(avg), source: 'notes' });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export async function getMoodDaily(v: VitalityDb, days = 30): Promise<MoodDay[]> {
  const { db, userId } = v;
  const sinceTs = localDayStartISO(days);
  const [moodRes, notesRes] = await Promise.all([
    db.from('user_facts').select('body, created_at').eq('user_id', userId).eq('kind', 'mood').gte('created_at', sinceTs),
    db.from('notes').select('body, created_at').eq('user_id', userId).gte('created_at', sinceTs),
  ]);
  const moodRows = ((moodRes.data as Row[]) ?? []).map((r) => ({ body: str(r.body) ?? '', created_at: str(r.created_at) ?? '' }));
  const noteRows = ((notesRes.data as Row[]) ?? []).map((r) => ({ body: str(r.body) ?? '', created_at: str(r.created_at) ?? '' }));
  return shapeMoodDaily(moodRows, noteRows);
}

// ── Peak schedule (today) ──────────────────────────────────────────────────────

export interface PeakTask {
  hour: number | null;
  endHour: number | null;
  title: string;
  done: boolean;
  kind: string;
  eventType: string | null;
}

export async function getPeakToday(v: VitalityDb, todayKey = getLocalDateKey()): Promise<PeakTask[]> {
  const { db, userId } = v;
  const { data } = await db
    .from('peak_tracker_tasks')
    .select('hour, end_hour, title, done, kind, event_type, position')
    .eq('user_id', userId)
    .eq('date', todayKey)
    .order('hour', { ascending: true })
    .order('position', { ascending: true });
  return ((data as Row[]) ?? []).map((r) => ({
    hour: num(r.hour),
    endHour: num(r.end_hour),
    title: str(r.title) ?? '',
    done: Boolean(r.done),
    kind: str(r.kind) ?? 'task',
    eventType: str(r.event_type),
  }));
}

// ── Active vitals goal ──────────────────────────────────────────────────────────

export async function getVitalsGoal(
  v: VitalityDb,
): Promise<{ metric: string; direction: string; targetValue: number | null; confidence: string | null; status: string } | null> {
  const { db, userId } = v;
  const { data } = await db
    .from('vitals_goals')
    .select('metric, direction, target_value, confidence, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  const r = data as Row | null;
  if (!r) return null;
  return {
    metric: str(r.metric) ?? '',
    direction: str(r.direction) ?? '',
    targetValue: num(r.target_value),
    confidence: str(r.confidence),
    status: str(r.status) ?? 'active',
  };
}

// ── Water (migrated to Supabase: water_prefs + water_days) ──────────────────────

export interface WaterData {
  hasData: boolean;
  unit: string;
  todayServings: number;
  recentAvgServings: number | null;
  caffeineMgPerDay: number | null;
  targetServings: number | null;
}

function unitVolMl(unit: string, bottleMl: number, glassMl: number): number {
  if (unit === 'bottle') return bottleMl || 500;
  if (unit === 'glass') return glassMl || 250;
  if (unit === 'oz') return 30;
  return 1;
}

function subExtraMl(s: Row): number {
  const dose = num(s.dose) ?? num(s.defaultDose) ?? 0;
  const mlPerMg = num(s.mlPerMg);
  if (mlPerMg) {
    const strength = num(s.strengthMg) ?? num(s.defaultStrengthMg) ?? 0;
    return Math.max(0, dose * strength * mlPerMg);
  }
  return Math.max(0, dose * (num(s.mlPerUnit) ?? 0));
}

export async function getWater(v: VitalityDb, todayKey = getLocalDateKey()): Promise<WaterData> {
  const { db, userId } = v;
  const [prefsRes, daysRes, profRes] = await Promise.all([
    db.from('water_prefs').select('*').eq('user_id', userId).maybeSingle(),
    db
      .from('water_days')
      .select('date, count')
      .eq('user_id', userId)
      .gte('date', dateKeyDaysAgo(8))
      .order('date', { ascending: false }),
    db.from('user_profile').select('starting_weight_kg, sex, birthday').eq('user_id', userId).maybeSingle(),
  ]);

  const prefs = (prefsRes.data ?? null) as Row | null;
  const days = ((daysRes.data as Row[]) ?? []).map((r) => ({ date: str(r.date) ?? '', count: num(r.count) ?? 0 }));
  if (!prefs && !days.length) {
    return { hasData: false, unit: 'bottle', todayServings: 0, recentAvgServings: null, caffeineMgPerDay: null, targetServings: null };
  }

  const todayServings = days.find((d) => d.date === todayKey)?.count ?? 0;
  const past = days.filter((d) => d.date !== todayKey);
  const recentAvgServings = past.length ? round(past.reduce((a, d) => a + d.count, 0) / past.length, 1) : null;

  // Target servings via the app's water formula (lib state.ts:computeTarget).
  let targetServings: number | null = null;
  const prof = (profRes.data ?? null) as Row | null;
  const weightKg = num(prof?.starting_weight_kg);
  if (prefs && weightKg) {
    const activity = num(prefs.activity_hrs_per_week) ?? 0;
    const caffeine = num(prefs.caffeine_mg_per_day) ?? 0;
    const substances = Array.isArray(prefs.substances) ? (prefs.substances as Row[]) : [];
    const sexRaw = (str(prof?.sex) ?? '').toLowerCase();
    const age = ageFromBirthday(prof?.birthday);
    const base = weightKg * 35;
    const exercise = (activity / 7) * 500;
    const caffeineMl = Math.max(0, caffeine - 200) * 1.5;
    const subs = substances.reduce((acc, s) => acc + subExtraMl(s), 0);
    let adjust = 0;
    if (sexRaw === 'm') adjust += 200;
    if ((age ?? 0) >= 50) adjust += 100;
    const totalMl = base + exercise + caffeineMl + subs + adjust;
    const vol = unitVolMl(
      str(prefs.unit) ?? 'bottle',
      num(prefs.bottle_ml) ?? 500,
      num(prefs.glass_ml) ?? 250,
    );
    targetServings = Math.max(1, Math.ceil(totalMl / vol));
  }

  return {
    hasData: true,
    unit: (prefs && str(prefs.unit)) || 'bottle',
    todayServings,
    recentAvgServings,
    caffeineMgPerDay: prefs ? num(prefs.caffeine_mg_per_day) : null,
    targetServings,
  };
}

// ── Blob-mirrored modules (goals / supplements / brand) ─────────────────────────
// These modules mirror their whole localStorage state into a single jsonb row
// (BUILD36). We read the blob and extract just what a summary/nudge needs.

async function readBlob(v: VitalityDb, table: string): Promise<Row | null> {
  const { db, userId } = v;
  const { data } = await db.from(table).select('data').eq('user_id', userId).maybeSingle();
  const d = (data as Row | null)?.data;
  return d && typeof d === 'object' ? (d as Row) : null;
}

/** A big personal goal the user authors ("hit 1,000 subs", "squat 140kg"). */
export interface BigGoal {
  /** clean_title (AI-tidied) if present, else the raw title. */
  title: string;
  rawTitle: string;
  category: string | null;
  priority: 'low' | 'medium' | 'high';
  /** Vee push cadence: silent | gentle | balanced | push. */
  pushLevel: string;
  targetDate: string | null;
  /** Signed days from today to the target (negative = overdue). null if no date. */
  daysUntilTarget: number | null;
  progress: { current: number; target: number; unit: string | null; pct: number } | null;
  identityTag: string | null;
}

/** A small "THIS WEEK" habit/task goal, trimmed for summary surfaces. */
export interface HabitGoalLite {
  title: string;
  kind: string;
  dueDate: string | null;
}

export interface GoalsData {
  hasData: boolean;
  streakCurrent: number;
  streakLongest: number;
  /** Open habit goals (kept for back-compat with the streak nudge). */
  activeGoals: number;
  dueToday: number;
  completedToday: number;
  // BUILD50: the authoritative big personal goals + this-week habit goals, read
  // from vitality_goals / vitality_habit_goals / goals_streak (not the legacy
  // goals_state blob, which never held the user's real big goals).
  bigGoals: BigGoal[];
  dueTodayGoals: HabitGoalLite[];
  dueTomorrowGoals: HabitGoalLite[];
}

const GOAL_PRIORITY: Record<number, BigGoal['priority']> = { 1: 'low', 2: 'medium', 3: 'high' };

/** Signed whole-day gap between two YYYY-MM-DD keys (UTC math → DST-safe). */
function daysUntilKey(fromKey: string, toKey: string): number | null {
  const parse = (k: string): number | null => {
    const [y, m, d] = k.split('-').map(Number);
    return y && m && d ? Date.UTC(y, m - 1, d) : null;
  };
  const a = parse(fromKey);
  const b = parse(toKey);
  if (a == null || b == null) return null;
  return Math.round((b - a) / 86_400_000);
}

/** Pure shaper, turns the three authoritative goal tables into GoalsData.
 *  Extracted from getGoals so the mapping (the bug-prone part) is unit-tested. */
export function shapeGoals(
  bigRows: Row[],
  habitRows: Row[],
  streakRow: Row | null,
  todayKey: string,
  tomorrowKey: string,
): GoalsData {
  const bigGoals: BigGoal[] = bigRows.map((r): BigGoal => {
    const current = num(r.progress_current);
    const target = num(r.progress_target);
    const hasProgress = current != null && target != null && target > 0;
    const targetDate = str(r.target_date);
    return {
      title: str(r.clean_title) ?? str(r.title) ?? 'Untitled goal',
      rawTitle: str(r.title) ?? 'Untitled goal',
      category: str(r.category),
      priority: GOAL_PRIORITY[num(r.priority) ?? 2] ?? 'medium',
      pushLevel: str(r.push_level) ?? 'balanced',
      targetDate,
      daysUntilTarget: targetDate ? daysUntilKey(todayKey, targetDate) : null,
      progress: hasProgress
        ? { current, target, unit: str(r.progress_unit), pct: Math.round((current / target) * 100) }
        : null,
      identityTag: str(r.identity_tag),
    };
  });
  // Soonest deadline first (dated before undated), then highest priority.
  const rank = { high: 0, medium: 1, low: 2 } as const;
  bigGoals.sort((a, b) => {
    if (a.targetDate && b.targetDate) return a.targetDate.localeCompare(b.targetDate);
    if (a.targetDate) return -1;
    if (b.targetDate) return 1;
    return rank[a.priority] - rank[b.priority];
  });

  const live = habitRows.filter((r) => str(r.status) !== 'archived');
  const completedToday = live.filter((r) => {
    if (str(r.status) !== 'completed') return false;
    const ts = str(r.completed_at);
    return ts != null && getLocalDateKey(new Date(ts)) === todayKey;
  }).length;
  const dueTodayRows = live.filter((r) => str(r.due_date) === todayKey);
  const dueTomorrowRows = live.filter(
    (r) => str(r.due_date) === tomorrowKey || (r.is_tomorrow === true && str(r.due_date) == null),
  );
  const lite = (r: Row): HabitGoalLite => ({
    title: str(r.title) ?? 'Untitled',
    kind: str(r.kind) ?? 'task',
    dueDate: str(r.due_date),
  });

  return {
    hasData: bigGoals.length > 0 || habitRows.length > 0 || streakRow != null,
    streakCurrent: (streakRow && num(streakRow.current)) ?? 0,
    streakLongest: (streakRow && num(streakRow.longest)) ?? 0,
    activeGoals: live.filter((r) => str(r.status) === 'open').length,
    dueToday: dueTodayRows.length,
    completedToday,
    bigGoals,
    dueTodayGoals: dueTodayRows.filter((r) => str(r.status) === 'open').map(lite),
    dueTomorrowGoals: dueTomorrowRows.filter((r) => str(r.status) === 'open').map(lite),
  };
}

export async function getGoals(v: VitalityDb, todayKey = getLocalDateKey()): Promise<GoalsData> {
  const { db, userId } = v;
  const tomorrowKey = dateKeyDaysAgo(-1);
  const [big, habits, streak] = await Promise.all([
    db
      .from('vitality_goals')
      .select(
        'title, clean_title, category, target_date, priority, push_level, progress_current, progress_target, progress_unit, identity_tag, status',
      )
      .eq('user_id', userId)
      .eq('status', 'active'),
    db
      .from('vitality_habit_goals')
      .select('title, kind, due_date, status, completed_at, is_tomorrow')
      .eq('user_id', userId),
    db.from('goals_streak').select('current, longest').eq('user_id', userId).maybeSingle(),
  ]);
  return shapeGoals(
    Array.isArray(big.data) ? (big.data as Row[]) : [],
    Array.isArray(habits.data) ? (habits.data as Row[]) : [],
    (streak.data as Row | null) ?? null,
    todayKey,
    tomorrowKey,
  );
}

export interface SupplementsData {
  hasData: boolean;
  total: number;
  takenToday: number;
  lowCount: number;
  names: string[];
}

export async function getSupplements(v: VitalityDb, todayKey = getSupplementDayKey()): Promise<SupplementsData> {
  const blob = await readBlob(v, 'supplements_state');
  if (!blob) return { hasData: false, total: 0, takenToday: 0, lowCount: 0, names: [] };
  const items = Array.isArray(blob.items) ? (blob.items as Row[]) : [];
  const takenMap = (blob.taken && typeof blob.taken === 'object' ? blob.taken : {}) as Record<string, Row>;
  const todayTaken = (takenMap[todayKey] && typeof takenMap[todayKey] === 'object' ? takenMap[todayKey] : {}) as Row;
  const itemIds = new Set(items.map((i) => str(i.id)).filter(Boolean));
  const takenToday = Object.keys(todayTaken).filter((id) => itemIds.has(id)).length;
  const low = Array.isArray(blob.low) ? (blob.low as unknown[]) : [];
  return {
    hasData: true,
    total: items.length,
    takenToday,
    lowCount: low.length,
    names: items.map((i) => str(i.name)).filter((x): x is string => !!x).slice(0, 12),
  };
}

/** One manually-tracked business metric (revenue, MRR, leads…) with momentum. */
export interface BrandKpiSummary {
  brand: string;
  label: string;
  value: number;
  /** Free-text display unit ("$", "%", "/wk", "leads"); '' is valid. */
  unit: string;
  /** Goal value when set, else null. */
  target: number | null;
  /** Change over the last 7 / 30 days from the value history, null if unknown. */
  delta7: number | null;
  delta30: number | null;
  /** Whole-percent progress toward target (value/target), null when no target. */
  pctToTarget: number | null;
}

/** One business goal/milestone with its live countdown state. */
export interface BrandGoalSummary {
  brand: string;
  title: string;
  /** Local `YYYY-MM-DD` due date, or null for an undated goal. */
  due: string | null;
  /** Signed days to due date (negative = overdue); null when undated. */
  daysLeft: number | null;
  done: boolean;
  /** Completed within the last 7 days, for the "wins this week" line. */
  completedRecently: boolean;
}

/** One live metric synced from a connected source (Stripe/Shopify/YouTube…). */
export interface ConnectorMetric {
  provider: string;
  metric: string;
  label: string;
  value: number;
  unit: string;
  capturedAt: string;
}

export interface BrandData {
  hasData: boolean;
  brandCount: number;
  names: string[];
  totalFollowers: number;
  /** Portfolio-wide follower change over the last ~7 days, null if no history. */
  followerDelta7: number | null;
  kpis: BrandKpiSummary[];
  /** Open goals first (soonest-due → overdue at top), then recently-completed. */
  goals: BrandGoalSummary[];
  openGoals: number;
  overdueGoals: number;
  goalsDoneRecently: number;
  /** Latest value per (provider, metric) from real connectors (BUILD50). */
  connectorMetrics: ConnectorMetric[];
  /** Distinct connected providers, e.g. ['stripe','youtube']. */
  connectorProviders: string[];
  /** Today's shipping cadence at risk (most-at-risk brand), or null. */
  shipCadence: { brand: string; remaining: number; streak: number } | null;
}

/**
 * Change in a snapshot series over the last `days` days: the current (latest)
 * value minus the latest snapshot recorded at or before the cutoff. Returns
 * null when the history can't support the comparison (fewer than 2 points, or
 * no snapshot old enough to be a baseline). `valueKey` is `value` for KPIs and
 * `count` for follower snapshots.
 */
function snapshotDelta(history: unknown, valueKey: string, days: number): number | null {
  if (!Array.isArray(history)) return null;
  const snaps = (history as Row[])
    .map((h) => ({ t: Date.parse(str(h.at) ?? ''), v: num(h[valueKey]) }))
    .filter((s) => Number.isFinite(s.t) && s.v != null)
    .sort((a, b) => a.t - b.t);
  if (snaps.length < 2) return null;
  const current = snaps[snaps.length - 1].v as number;
  const cutoff = Date.now() - days * 86_400_000;
  let baseline: number | null = null;
  for (const s of snaps) {
    if (s.t <= cutoff) baseline = s.v as number;
    else break;
  }
  if (baseline == null) return null;
  return round(current - baseline, 2);
}

/** Latest value per (provider, metric) synced from real connectors (BUILD50). */
async function getConnectorMetrics(v: VitalityDb): Promise<ConnectorMetric[]> {
  const { db, userId } = v;
  const { data } = await db
    .from('brand_metrics')
    .select('provider, metric, label, value, unit, captured_at')
    .eq('user_id', userId)
    .order('captured_at', { ascending: false })
    .limit(200);
  const rows = (Array.isArray(data) ? data : []) as Row[];
  const seen = new Set<string>();
  const out: ConnectorMetric[] = [];
  for (const r of rows) {
    const provider = str(r.provider);
    const metric = str(r.metric);
    const value = num(r.value);
    if (!provider || !metric || value == null) continue;
    const key = `${provider}:${metric}`;
    if (seen.has(key)) continue; // ordered desc → first seen is the latest
    seen.add(key);
    out.push({
      provider,
      metric,
      label: str(r.label) ?? metric,
      value,
      unit: str(r.unit) ?? '',
      capturedAt: str(r.captured_at) ?? '',
    });
  }
  return out;
}

export async function getBrand(v: VitalityDb, todayKey = getLocalDateKey()): Promise<BrandData> {
  const [blob, connectorMetrics] = await Promise.all([
    readBlob(v, 'brand_state'),
    getConnectorMetrics(v),
  ]);
  const connectorProviders = Array.from(new Set(connectorMetrics.map((m) => m.provider)));
  const empty: BrandData = {
    hasData: connectorMetrics.length > 0, brandCount: 0, names: [], totalFollowers: 0, followerDelta7: null,
    kpis: [], goals: [], openGoals: 0, overdueGoals: 0, goalsDoneRecently: 0,
    connectorMetrics, connectorProviders, shipCadence: null,
  };
  if (!blob) return empty;
  const brands = (Array.isArray(blob.brands) ? (blob.brands as Row[]) : []).filter((b) => !b.archived);

  // Today's shipping cadence: the brand with the biggest at-risk daily streak.
  let shipCadence: BrandData['shipCadence'] = null;
  for (const b of brands) {
    const daily = (Array.isArray(b.schedules) ? (b.schedules as Row[]) : []).filter((s) => str(s.period) === 'daily');
    const target = daily.reduce((sum, s) => sum + (num(s.target) ?? 0), 0);
    if (!daily.length || target <= 0) continue;
    const log = (b.log && typeof b.log === 'object' ? b.log : {}) as Record<string, Row>;
    const countOn = (sid: string | null, key: string) => (sid ? num(log[sid]?.[key]) ?? 0 : 0);
    const todayCount = daily.reduce((sum, s) => sum + countOn(str(s.id), todayKey), 0);
    const remaining = Math.max(0, target - todayCount);
    if (remaining <= 0) continue;
    let streak = 0;
    for (let i = 1; i <= 365; i++) {
      const key = dateKeyDaysAgo(i);
      if (daily.every((s) => countOn(str(s.id), key) >= (num(s.target) ?? 0))) streak++;
      else break;
    }
    if (!shipCadence || streak > shipCadence.streak) {
      shipCadence = { brand: str(b.name) ?? '(unnamed)', remaining, streak };
    }
  }

  let totalFollowers = 0;
  let followerDeltaSum = 0;
  let followerDeltaSeen = false;
  const kpis: BrandKpiSummary[] = [];
  const goals: BrandGoalSummary[] = [];

  for (const b of brands) {
    const brandName = str(b.name) ?? '(unnamed)';

    // Audience: total followers + 7-day momentum (summed across linked accounts).
    const accounts = Array.isArray(b.accounts) ? (b.accounts as Row[]) : [];
    for (const a of accounts) {
      totalFollowers += num(a.followers) ?? 0;
      const d = snapshotDelta(a.history, 'count', 7);
      if (d != null) { followerDeltaSum += d; followerDeltaSeen = true; }
    }

    // KPIs: current value, target progress, and 7/30-day deltas from history.
    for (const k of Array.isArray(b.kpis) ? (b.kpis as Row[]) : []) {
      const label = str(k.label);
      const value = num(k.value);
      if (!label || value == null) continue;
      const target = num(k.target);
      kpis.push({
        brand: brandName,
        label,
        value,
        unit: str(k.unit) ?? '',
        target,
        delta7: snapshotDelta(k.history, 'value', 7),
        delta30: snapshotDelta(k.history, 'value', 30),
        pctToTarget: target != null && target > 0 ? round((value / target) * 100, 0) : null,
      });
    }

    // Goals: due-date countdown + recent completions.
    for (const g of Array.isArray(b.goals) ? (b.goals as Row[]) : []) {
      const title = str(g.title);
      if (!title) continue;
      const done = g.done === true;
      const due = str(g.due);
      const completedAt = str(g.completedAt);
      const completedRecently =
        done && completedAt != null && Date.now() - Date.parse(completedAt) <= 7 * 86_400_000;
      goals.push({
        brand: brandName,
        title,
        due,
        daysLeft: due ? daysBetweenKeys(todayKey, due) : null,
        done,
        completedRecently,
      });
    }
  }

  // Open goals first, soonest-due (overdue) at the very top; undated open next;
  // done goals last. Keeps the most actionable items first for the agent.
  goals.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.daysLeft == null && b.daysLeft == null) return 0;
    if (a.daysLeft == null) return 1;
    if (b.daysLeft == null) return -1;
    return a.daysLeft - b.daysLeft;
  });

  return {
    hasData: true,
    brandCount: brands.length,
    names: brands.map((b) => str(b.name)).filter((x): x is string => !!x).slice(0, 12),
    totalFollowers,
    followerDelta7: followerDeltaSeen ? round(followerDeltaSum, 0) : null,
    kpis,
    goals,
    openGoals: goals.filter((g) => !g.done).length,
    overdueGoals: goals.filter((g) => !g.done && g.daysLeft != null && g.daysLeft < 0).length,
    goalsDoneRecently: goals.filter((g) => g.completedRecently).length,
    connectorMetrics,
    connectorProviders,
    shipCadence,
  };
}

export interface BusinessMetric {
  label: string;
  value: number;
  unit: string;
  /** Change vs ~`days` ago from the metric's history; null if <2 datapoints. */
  delta7: number | null;
}
export interface BusinessVenture {
  name: string;
  metrics: BusinessMetric[];
}
export interface BusinessData {
  hasData: boolean;
  ventures: BusinessVenture[];
}

/**
 * Change in a KPI value over `days`, from its history snapshots. Mirrors the
 * app's `kpiDeltaSince` (state.ts): needs ≥2 points; the oldest snapshot inside
 * the window is the baseline, so the first update after install still trends.
 */
function kpiDelta(history: unknown, days: number): number | null {
  if (!Array.isArray(history) || history.length < 2) return null;
  const cutoff = Date.now() - days * 86400_000;
  let baseline: number | undefined;
  let current: number | undefined;
  for (const s of history as Row[]) {
    const value = num(s.value);
    if (value == null) continue;
    const t = Date.parse(str(s.at) ?? '');
    if (!Number.isFinite(t)) continue;
    if (t < cutoff) baseline = value;
    else {
      if (baseline === undefined) baseline = value;
      current = value;
    }
  }
  if (baseline === undefined || current === undefined) return null;
  return current - baseline;
}

/**
 * Business numbers across the user's brands/ventures, each brand's custom KPIs
 * (revenue, MRR, leads, reviews…) with a 7-day delta from their history. Reads
 * the SAME `brand_state` blob the client mirrors, so no separate table: the
 * per-brand Business view is the single source. `hasData` is true only when at
 * least one venture actually tracks a metric.
 */
export async function getBusiness(v: VitalityDb): Promise<BusinessData> {
  const blob = await readBlob(v, 'brand_state');
  if (!blob) return { hasData: false, ventures: [] };
  const brands = (Array.isArray(blob.brands) ? (blob.brands as Row[]) : []).filter((b) => !b.archived);
  const ventures: BusinessVenture[] = [];
  for (const b of brands) {
    const kpis = Array.isArray(b.kpis) ? (b.kpis as Row[]) : [];
    const metrics: BusinessMetric[] = [];
    for (const k of kpis) {
      const label = str(k.label);
      const value = num(k.value);
      if (!label || value == null) continue;
      metrics.push({ label, value, unit: str(k.unit) ?? '', delta7: kpiDelta(k.history, 7) });
    }
    if (metrics.length) ventures.push({ name: str(b.name) || '(unnamed)', metrics });
  }
  return { hasData: ventures.length > 0, ventures };
}

export interface PeakStimulant {
  name: string;
  dose: number | null;
  unit: string | null;
  category: string | null;
  /** Local hour-of-day as a decimal (e.g. 9.5 = 9:30am), for fmtHour. */
  hour: number | null;
}
export interface PeakStimulantsData {
  hasData: boolean;
  todayCount: number;
  /** Sum of today's caffeine doses in mg; null if none logged. */
  caffeineMgToday: number | null;
  substances: PeakStimulant[];
  /** Most recent subjective energy dial (-100 foggy … +100 peak) within 24h. */
  latestEnergy: { value: number; hoursAgo: number } | null;
  tolerance: number | null;
}

/**
 * Today's Peak stimulant log + latest subjective energy, the half of the Peak
 * module that lived only in localStorage until `peak_state` (the schedule is
 * already relational via peak_tracker_*). Substances were enriched with
 * name/category/unit at sync time, so no catalog is needed here. Answers "what
 * have I taken today / how wired am I / how am I feeling".
 */
export async function getPeakStimulants(v: VitalityDb, todayKey = getLocalDateKey()): Promise<PeakStimulantsData> {
  const empty: PeakStimulantsData = { hasData: false, todayCount: 0, caffeineMgToday: null, substances: [], latestEnergy: null, tolerance: null };
  const blob = await readBlob(v, 'peak_state');
  if (!blob) return empty;

  const logs = Array.isArray(blob.substances) ? (blob.substances as Row[]) : [];
  const today = logs.filter((s) => {
    const at = num(s.takenAt);
    return at != null && getLocalDateKey(new Date(at)) === todayKey;
  });
  today.sort((a, b) => (num(a.takenAt) ?? 0) - (num(b.takenAt) ?? 0));

  const substances: PeakStimulant[] = today.map((s) => {
    const at = num(s.takenAt);
    const d = at != null ? new Date(at) : null;
    return {
      name: str(s.name) ?? str(s.key) ?? 'substance',
      dose: num(s.dose),
      unit: str(s.unit),
      category: str(s.category),
      hour: d ? d.getHours() + d.getMinutes() / 60 : null,
    };
  });

  let caffeineMg = 0;
  let sawCaffeine = false;
  for (const s of substances) {
    if (s.category === 'caffeine' && s.dose != null) {
      caffeineMg += s.dose;
      sawCaffeine = true;
    }
  }

  // Latest subjective energy tap within the last 24h.
  const taps = Array.isArray(blob.taps) ? (blob.taps as Row[]) : [];
  let latestEnergy: PeakStimulantsData['latestEnergy'] = null;
  let bestTime = -1;
  for (const t of taps) {
    const time = num(t.time);
    const value = num(t.value);
    if (time == null || value == null) continue;
    if (time > bestTime) {
      bestTime = time;
      const hoursAgo = (Date.now() - time) / 3_600_000;
      // Within the last 24h only; guard the lower bound too so a future-dated
      // tap (cross-device clock skew) can't surface with a negative "Nh ago".
      latestEnergy = hoursAgo >= 0 && hoursAgo <= 24 ? { value, hoursAgo: Math.round(hoursAgo * 10) / 10 } : null;
    }
  }

  const profile = (blob.profile && typeof blob.profile === 'object' ? blob.profile : {}) as Row;
  return {
    hasData: today.length > 0 || latestEnergy != null,
    todayCount: today.length,
    caffeineMgToday: sawCaffeine ? caffeineMg : null,
    substances,
    latestEnergy,
    tolerance: num(profile.tolerance),
  };
}

export interface StimulantDay {
  date: string;
  /** Total caffeine logged that local day, in mg. */
  caffeineMg: number;
}

/**
 * Per-day caffeine total (mg) over the last `days`, read from the SAME peak_state
 * blob as getPeakStimulants, no new data, just the history the today-reader drops.
 * Only days that actually logged caffeine are emitted (a zero day adds no signal).
 * Feeds the caffeine→recovery seam (insights.caffeineRecovery).
 */
export async function getStimulantsDaily(v: VitalityDb, days = 30): Promise<StimulantDay[]> {
  const blob = await readBlob(v, 'peak_state');
  if (!blob) return [];
  const logs = Array.isArray(blob.substances) ? (blob.substances as Row[]) : [];
  const cutoff = Date.now() - days * 86_400_000;
  const byDate = new Map<string, number>();
  for (const s of logs) {
    if (str(s.category) !== 'caffeine') continue;
    const dose = num(s.dose);
    const at = num(s.takenAt);
    if (dose == null || dose <= 0 || at == null || at < cutoff) continue;
    const key = getLocalDateKey(new Date(at));
    byDate.set(key, (byDate.get(key) ?? 0) + dose);
  }
  return [...byDate.entries()]
    .map(([date, caffeineMg]) => ({ date, caffeineMg: Math.round(caffeineMg) }))
    .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
}

export interface ManualSleepDay {
  date: string;
  /** Hours slept that local night, from the manual peak check-in (no wearable needed). */
  sleepHours: number;
}

/**
 * Per-day manual sleep hours over the last `days`, read from the SAME peak_state blob -
 * the no-wearable daily check-in (BUILD62, `PeakState.manual`, keyed by local day). Lets
 * the sleep→mood seam fire for users without a wearable. Only days with a logged
 * sleepHours > 0 are emitted; newest first.
 */
export async function getManualSleepDaily(v: VitalityDb, days = 30): Promise<ManualSleepDay[]> {
  const blob = await readBlob(v, 'peak_state');
  if (!blob) return [];
  const manual = blob.manual && typeof blob.manual === 'object' ? (blob.manual as Record<string, Row>) : {};
  const cutoffKey = getLocalDateKey(new Date(Date.now() - days * 86_400_000));
  const out: ManualSleepDay[] = [];
  for (const [date, m] of Object.entries(manual)) {
    if (date < cutoffKey) continue; // YYYY-MM-DD string compare = chronological
    const h = num((m as Row)?.sleepHours);
    if (h == null || h <= 0) continue;
    out.push({ date, sleepHours: h });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
}

// ── Tiles (the user's custom-tile registry + board placement) ─────────────────

export interface TileListEntry {
  id: string;
  name: string;
  category: string | null;
  source: string | null;
  /** The declared stream identity ({key,kind,goalDirection}) or null (decorative). */
  streamKey: string | null;
  streamKind: string | null;
  createdAt: string | null;
  /** True when the tile's id appears in the user's saved board arrangement.
   *  Null when the board arrangement is unknown (never synced / table absent). */
  onBoard: boolean | null;
  /** Born classification: which of the nine life buckets the tile declared at
   *  build time (TRAIN 5), or null for an unclassified tile. */
  goalCategory: string | null;
  /** The one-line "note for Vee" declared at build time, or null. */
  veeNote: string | null;
}

export interface TilesList {
  tiles: TileListEntry[];
  /** False when board_layout has no row for this user, so ON BOARD vs IN
   *  LIBRARY cannot be told apart honestly. */
  boardKnown: boolean;
}

/**
 * The user's tiles with their BOARD status. A tile can exist in the registry
 * but be removed from the dashboard (it then lives in the Library drawer), and
 * Claude must never treat a removed tile as active, so each entry is marked
 * on/off the board by joining `tiles` against `board_layout.ordering` (the
 * saved arrangement the dashboard mirrors up). Both reads are RLS-scoped.
 */
export async function getTiles(v: VitalityDb): Promise<TilesList> {
  const { db, userId } = v;
  let [tilesRes, boardRes] = await Promise.all([
    db
      .from('tiles')
      .select('id, name, category, stream, source, created_at, goal_category, vee_note')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100),
    db.from('board_layout').select('ordering').eq('user_id', userId).maybeSingle(),
  ]);
  if (tilesRes.error && /goal_category|vee_note/i.test(tilesRes.error.message)) {
    // The DB predates the born-classified migration (its two columns are not in
    // the schema cache yet). Fall back to the original column list so the user's
    // real tiles still list (born fields read null) instead of silently reporting
    // an empty registry and letting Claude build duplicates.
    tilesRes = (await db
      .from('tiles')
      .select('id, name, category, stream, source, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100)) as unknown as typeof tilesRes;
  }

  const ordering = boardRes.data?.ordering;
  const boardKnown = !boardRes.error && Array.isArray(ordering);
  const placed = new Set<string>(boardKnown ? (ordering as unknown[]).filter((x): x is string => typeof x === 'string') : []);

  const tiles: TileListEntry[] = ((tilesRes.data as Row[]) ?? []).map((r) => {
    const stream = r.stream && typeof r.stream === 'object' && !Array.isArray(r.stream) ? (r.stream as Row) : null;
    const id = str(r.id) ?? '';
    return {
      id,
      name: str(r.name) ?? 'Untitled tile',
      category: str(r.category),
      source: str(r.source),
      streamKey: stream ? str(stream.key) : null,
      streamKind: stream ? str(stream.kind) : null,
      createdAt: str(r.created_at),
      onBoard: boardKnown ? placed.has(id) : null,
      goalCategory: str(r.goal_category),
      veeNote: str(r.vee_note),
    };
  });
  return { tiles, boardKnown };
}
