// Pure derivation layer for the Vitality MCP — the "insight" math.
//
// Everything here is a pure function: shaped data in, a derived read out. No DB,
// no env, no clock dependence beyond a caller-supplied `todayKey`. This is what
// the tools and the nudge engine call to turn rows into momentum — weekly rate
// of change, trajectory of HRV/RHR, training load, nutrition adherence — instead
// of the noisy first-vs-last delta a single window gives.
//
// Kept separate from queries.ts (which does I/O) precisely so it can be unit
// tested in isolation. See __tests__/mcpInsights.test.ts.

import { round } from './util.js';

// ── Date helpers (pure) ────────────────────────────────────────────────────────

/** Whole-day index for a 'YYYY-MM-DD' key (days since the Unix epoch, UTC).
 *  Used only for differences, so the fixed UTC anchor never drifts the result. */
export function dayIndex(dateKey: string): number | null {
  const t = Date.parse(`${dateKey}T00:00:00Z`);
  return Number.isFinite(t) ? Math.round(t / 86_400_000) : null;
}

/** Calendar days from `a` to `b` (b − a). Positive if b is later. */
export function daysBetween(a: string, b: string): number | null {
  const ia = dayIndex(a);
  const ib = dayIndex(b);
  return ia != null && ib != null ? ib - ia : null;
}

// ── Weight: least-squares weekly rate ───────────────────────────────────────────

export interface WeeklyRate {
  /** Signed kg per week from a least-squares fit (negative = losing). */
  kgPerWeek: number;
  /** Days spanned by the fitted points. */
  spanDays: number;
  /** Number of weigh-ins used. */
  n: number;
}

/**
 * Least-squares slope of weight over time, expressed as kg/week. Far steadier
 * than (latest − oldest), which a single noisy weigh-in can swing. Returns null
 * unless there are ≥2 weigh-ins on ≥2 distinct days. Order-independent.
 */
export function weeklyWeightRate(entries: { date: string; kg: number }[]): WeeklyRate | null {
  const pts = entries
    .map((e) => ({ x: dayIndex(e.date), y: e.kg }))
    .filter((p): p is { x: number; y: number } => p.x != null && Number.isFinite(p.y));
  if (pts.length < 2) return null;

  const xs = pts.map((p) => p.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const spanDays = maxX - minX;
  if (spanDays === 0) return null; // all on one day — no slope

  const n = pts.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = pts.reduce((a, p) => a + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) ** 2;
  }
  if (den === 0) return null;
  const slopePerDay = num / den;
  return { kgPerWeek: round(slopePerDay * 7, 2), spanDays, n };
}

export type RateVerdict =
  | 'wrong-direction'
  | 'too-fast'
  | 'on-track'
  | 'slow'
  | 'stalled'
  | 'drifting'
  | 'unknown';

export interface RateAssessment {
  verdict: RateVerdict;
  /** Rate as a percentage of current bodyweight per week (signed). */
  pctPerWeek: number | null;
  goal: 'cut' | 'bulk' | 'maintain' | null;
  note: string;
}

/** Normalize the many goal strings the app stores into three intents. */
export function normalizeGoal(goal: string | null | undefined): 'cut' | 'bulk' | 'maintain' | null {
  if (!goal) return null;
  const g = goal.toLowerCase();
  if (/(cut|fat[_\s-]?loss|lose|lean|deficit|shred)/.test(g)) return 'cut';
  if (/(bulk|gain|muscle|mass|surplus|build)/.test(g)) return 'bulk';
  if (/(maintain|recomp|maintenance|hold)/.test(g)) return 'maintain';
  return null;
}

/**
 * Judge a weekly rate against the user's goal and bodyweight. Thresholds follow
 * the common evidence-based guidance: ~0.5–1% BW/week for a cut, ~0.25–0.5%
 * BW/week for a lean bulk, hold steady to maintain.
 */
export function classifyWeightRate(
  kgPerWeek: number | null,
  latestKg: number | null,
  goal: string | null | undefined,
): RateAssessment {
  const intent = normalizeGoal(goal);
  if (kgPerWeek == null || latestKg == null || latestKg <= 0) {
    return { verdict: 'unknown', pctPerWeek: null, goal: intent, note: 'Not enough data to judge rate.' };
  }
  const pct = round((kgPerWeek / latestKg) * 100, 2);
  const mk = (verdict: RateVerdict, note: string): RateAssessment => ({ verdict, pctPerWeek: pct, goal: intent, note });

  if (intent === 'cut') {
    if (pct >= 0.1) return mk('wrong-direction', 'Trending up while cutting — calories are likely too high.');
    if (pct > -0.1) return mk('stalled', 'Essentially flat — the cut has stalled; tighten intake or add activity.');
    if (pct >= -0.4) return mk('slow', 'Losing, but slowly. Fine if deliberate; nudge the deficit to speed it up.');
    if (pct >= -1.25) return mk('on-track', 'Loss rate is in the healthy 0.5–1%/week band.');
    return mk('too-fast', 'Losing faster than ~1.25%/week — risks muscle and adherence; ease the deficit.');
  }
  if (intent === 'bulk') {
    if (pct <= -0.05) return mk('wrong-direction', 'Trending down while bulking — calories are likely too low.');
    if (pct < 0.05) return mk('stalled', 'Essentially flat — add calories to actually gain.');
    if (pct < 0.2) return mk('slow', 'Gaining slowly. Fine for a lean bulk; bump intake to grow faster.');
    if (pct <= 0.75) return mk('on-track', 'Gain rate is in the lean-bulk 0.25–0.5%/week range.');
    return mk('too-fast', 'Gaining faster than ~0.75%/week — likely adding excess fat; trim the surplus.');
  }
  if (intent === 'maintain') {
    if (Math.abs(pct) <= 0.3) return mk('on-track', 'Weight is holding steady — maintenance is on point.');
    return mk('drifting', `Drifting ${pct > 0 ? 'up' : 'down'} for a maintain goal — recheck calories.`);
  }
  // No goal on file — just describe.
  if (Math.abs(pct) <= 0.1) return mk('stalled', 'Weight is essentially flat.');
  return mk('drifting', `Trending ${pct > 0 ? 'up' : 'down'} at ${Math.abs(pct)}%/week.`);
}

// ── Window trend: recent N vs the window before it ───────────────────────────────

export interface WindowTrend {
  recentAvg: number;
  priorAvg: number;
  delta: number;
  direction: 'up' | 'down' | 'flat';
  recentN: number;
  priorN: number;
}

/**
 * Compare the mean of the most recent `recent` readings to the mean of the
 * window immediately before them. Input is newest-first and may contain nulls
 * (skipped). Returns null unless both windows have at least one reading.
 * `flatPct` is the dead-band as a fraction of the prior average.
 */
export function windowTrend(
  valuesNewestFirst: (number | null)[],
  recent = 7,
  flatPct = 0.03,
): WindowTrend | null {
  const recentVals = valuesNewestFirst.slice(0, recent).filter((v): v is number => v != null);
  const priorVals = valuesNewestFirst.slice(recent, recent * 2).filter((v): v is number => v != null);
  if (!recentVals.length || !priorVals.length) return null;
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const recentAvg = round(mean(recentVals), 1);
  const priorAvg = round(mean(priorVals), 1);
  const delta = round(recentAvg - priorAvg, 1);
  const band = Math.abs(priorAvg) * flatPct;
  const direction = delta > band ? 'up' : delta < -band ? 'down' : 'flat';
  return { recentAvg, priorAvg, delta, direction, recentN: recentVals.length, priorN: priorVals.length };
}

// ── Training load ────────────────────────────────────────────────────────────────

/** Sum of strain over the most recent `days` readings (newest-first). */
export function acuteLoad(strainNewestFirst: (number | null)[], days = 7): number | null {
  const vals = strainNewestFirst.slice(0, days).filter((v): v is number => v != null);
  if (!vals.length) return null;
  return round(vals.reduce((a, b) => a + b, 0), 1);
}

/**
 * Consecutive calendar days with a logged session, counted backward from today.
 * If nothing is logged today, the streak is measured ending yesterday (so a
 * morning briefing still sees "you trained 4 days straight" before today's
 * session). Input is the set of submitted session date-keys.
 */
export function consecutiveTrainingDays(submittedDates: Iterable<string>, todayKey: string): number {
  const set = new Set(submittedDates);
  const todayIdx = dayIndex(todayKey);
  if (todayIdx == null) return 0;
  // Start at today if trained today, else step back to yesterday.
  let cursor = set.has(todayKey) ? todayIdx : todayIdx - 1;
  let streak = 0;
  // Walk backward while each day has a session (cap to avoid runaway).
  for (let i = 0; i < 366; i++) {
    const key = keyForIndex(cursor);
    if (!set.has(key)) break;
    streak++;
    cursor--;
  }
  return streak;
}

/** Inverse of dayIndex — 'YYYY-MM-DD' for a UTC day index. */
export function keyForIndex(index: number): string {
  const d = new Date(index * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

// ── Nutrition adherence over a window ────────────────────────────────────────────

// ── Recovery vs training (does the body bounce back?) ────────────────────────────

export interface RecoveryVsTraining {
  /** Mean recovery on mornings AFTER a training day. */
  afterTrainingAvg: number;
  /** Mean recovery on mornings after a rest day. */
  afterRestAvg: number;
  /** afterTrainingAvg − afterRestAvg (negative = training costs recovery). */
  delta: number;
  afterTrainingN: number;
  afterRestN: number;
}

/**
 * Compare recovery the morning AFTER a training day vs after a rest day. Recovery
 * is reported for the night after the session, so we key each reading on whether
 * the PRIOR calendar day had a logged session. Needs ≥2 readings in each bucket
 * to avoid reading noise as signal; returns null otherwise.
 */
export function recoveryAfterTraining(
  sleepEntries: { date: string; recovery: number | null }[],
  trainingDates: Iterable<string>,
): RecoveryVsTraining | null {
  const trained = new Set(trainingDates);
  const after: number[] = [];
  const rest: number[] = [];
  for (const e of sleepEntries) {
    if (e.recovery == null) continue;
    const idx = dayIndex(e.date);
    if (idx == null) continue;
    (trained.has(keyForIndex(idx - 1)) ? after : rest).push(e.recovery);
  }
  if (after.length < 2 || rest.length < 2) return null;
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const afterTrainingAvg = round(mean(after), 1);
  const afterRestAvg = round(mean(rest), 1);
  return {
    afterTrainingAvg,
    afterRestAvg,
    delta: round(afterTrainingAvg - afterRestAvg, 1),
    afterTrainingN: after.length,
    afterRestN: rest.length,
  };
}

// ── Finance: subscription burn vs net worth ──────────────────────────────────────

export interface SubscriptionBurn {
  yearlyChf: number;
  /** Annual subscription cost as a % of net worth (null if net worth ≤ 0). */
  pctOfNetWorth: number | null;
}

/** Annualized subscription burn and what slice of net worth it represents. */
export function subscriptionBurn(monthlyChf: number, netWorthChf: number): SubscriptionBurn {
  const yearlyChf = round(monthlyChf * 12, 2);
  const pctOfNetWorth = netWorthChf > 0 ? round((yearlyChf / netWorthChf) * 100, 1) : null;
  return { yearlyChf, pctOfNetWorth };
}

export interface NutritionAdherence {
  loggedDays: number;
  avgKcal: number | null;
  avgProtein: number | null;
  /** Days within ±`bandPct` of the kcal target. */
  onTargetDays: number;
  daysUnder: number;
  daysOver: number;
  /** Days that hit ≥90% of the protein target. */
  proteinHitDays: number;
  /** onTargetDays / loggedDays, 0–1. */
  adherence: number | null;
}

/**
 * Summarize how consistently logged days hit the calorie + protein targets.
 * `perDay` is one entry per logged day (today is the caller's choice to include
 * or not). `bandPct` is the ± tolerance around the kcal target counted as "on".
 */
export function nutritionAdherence(
  perDay: { kcal: number; protein: number }[],
  kcalTarget: number,
  proteinTarget: number,
  bandPct = 0.1,
): NutritionAdherence {
  const loggedDays = perDay.length;
  if (!loggedDays) {
    return {
      loggedDays: 0,
      avgKcal: null,
      avgProtein: null,
      onTargetDays: 0,
      daysUnder: 0,
      daysOver: 0,
      proteinHitDays: 0,
      adherence: null,
    };
  }
  const lo = kcalTarget * (1 - bandPct);
  const hi = kcalTarget * (1 + bandPct);
  let onTargetDays = 0;
  let daysUnder = 0;
  let daysOver = 0;
  let proteinHitDays = 0;
  let sumKcal = 0;
  let sumProtein = 0;
  for (const d of perDay) {
    sumKcal += d.kcal;
    sumProtein += d.protein;
    if (d.kcal < lo) daysUnder++;
    else if (d.kcal > hi) daysOver++;
    else onTargetDays++;
    if (d.protein >= proteinTarget * 0.9) proteinHitDays++;
  }
  return {
    loggedDays,
    avgKcal: Math.round(sumKcal / loggedDays),
    avgProtein: Math.round(sumProtein / loggedDays),
    onTargetDays,
    daysUnder,
    daysOver,
    proteinHitDays,
    adherence: round(onTargetDays / loggedDays, 2),
  };
}

// ── Per-lift progressive overload (the "bench stuck at 180" detector) ─────────────
// The Train-aware half of the oracle: is a specific lift plateaued against its
// goal? Pure + gated like everything else here — null when there isn't enough
// history, and honest about rep progress so "180x5 -> 180x7" never reads as a stall.

export interface LiftSession {
  date: string;       // YYYY-MM-DD (local)
  topWeight: number;  // heaviest genuinely-logged set that session
  topReps: number;    // reps on that top set
  /** An off / sick day — excluded from progression math, never a PR. */
  offDay?: boolean;
}

export interface LiftStall {
  /** Real (non off-day, genuinely-logged) sessions of this lift in the window. */
  nSessions: number;
  /** The weight at the last genuine best — the ceiling they keep hitting. */
  plateauWeight: number;
  /** Reps on that plateau-setting top set. */
  plateauReps: number;
  /** Sessions logged since the last genuine progress. */
  stalledSessions: number;
  /** Days from the last progress to the most recent session. */
  stalledDays: number;
  /** Date of the last session that set a new best. */
  lastProgressDate: string;
  /** Passes the gate: enough sessions, AND stalled for enough sessions AND days. */
  isStalled: boolean;
}

/** Estimated one-rep max (Epley). Lets adding reps at the same weight still count
 *  as progress, so 180x5 -> 180x7 is correctly NOT a plateau. */
function estimatedOneRepMax(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

/**
 * Has a single lift plateaued? Takes that lift's top-set-by-date series (any
 * order), drops off-day sessions, and walks oldest -> newest tracking the best
 * estimated 1RM. "Progress" is a session that beats the running best by a margin;
 * a stall is enough sessions AND enough days with no new best. Returns null when
 * there isn't enough history to judge (the same honesty rule as every other gate:
 * never a fabricated verdict from a couple of noisy points).
 */
export function liftStall(
  sessions: LiftSession[],
  opts: { minSessions?: number; minStalledSessions?: number; minStalledDays?: number; e1rmMargin?: number } = {},
): LiftStall | null {
  const minSessions = opts.minSessions ?? 3;
  const minStalledSessions = opts.minStalledSessions ?? 2;
  const minStalledDays = opts.minStalledDays ?? 7;
  const e1rmMargin = opts.e1rmMargin ?? 1;

  const real = sessions
    .filter((s) => !s.offDay && dayIndex(s.date) != null && s.topWeight > 0 && s.topReps > 0)
    .sort((a, b) => (dayIndex(a.date) as number) - (dayIndex(b.date) as number));
  if (real.length < minSessions) return null;

  let peak = estimatedOneRepMax(real[0].topWeight, real[0].topReps);
  let lastProgressIndex = 0;
  for (let i = 1; i < real.length; i++) {
    const e1rm = estimatedOneRepMax(real[i].topWeight, real[i].topReps);
    if (e1rm > peak + e1rmMargin) {
      peak = e1rm;
      lastProgressIndex = i;
    }
  }

  const last = real[real.length - 1];
  const progress = real[lastProgressIndex];
  const stalledSessions = real.length - 1 - lastProgressIndex;
  const stalledDays = daysBetween(progress.date, last.date) ?? 0;

  return {
    nSessions: real.length,
    plateauWeight: progress.topWeight,
    plateauReps: progress.topReps,
    stalledSessions,
    stalledDays,
    lastProgressDate: progress.date,
    isStalled: stalledSessions >= minStalledSessions && stalledDays >= minStalledDays,
  };
}

// ── Cross-module correlation (the moat) ──────────────────────────────────────────
// The thing no single-domain app or human coach has: the patterns ACROSS your
// tiles. `correlate` is the reusable primitive; `tiredEating` is the first claim
// built on it. Every cross-module insight is gated so the briefing never invents
// a pattern from a handful of noisy days.

/**
 * Pearson correlation r between two ALIGNED numeric series (a[i] pairs with b[i]),
 * plus the pair count n. The caller is responsible for joining by date first.
 * Returns null with fewer than 3 pairs or when either series is flat (no variance
 * → correlation is undefined). r ∈ [−1, 1]; the sign is the direction of the link.
 */
export function correlate(a: number[], b: number[]): { r: number; n: number } | null {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  const xs = a.slice(0, n);
  const ys = b.slice(0, n);
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null; // a flat series can't correlate
  return { r: round(sxy / Math.sqrt(sxx * syy), 2), n };
}

// One-sided Student-t critical values at α = 0.05, by degrees of freedom. Our windows
// run ~8–30 paired days (df 6–28), so the table covers the real range exactly; beyond
// it we fall back to the normal asymptote (1.645), which is the correct limit.
const T_CRIT_05: Record<number, number> = {
  1: 6.314, 2: 2.920, 3: 2.353, 4: 2.132, 5: 2.015, 6: 1.943, 7: 1.895, 8: 1.860,
  9: 1.833, 10: 1.812, 11: 1.796, 12: 1.782, 13: 1.771, 14: 1.761, 15: 1.753,
  16: 1.746, 17: 1.740, 18: 1.734, 19: 1.729, 20: 1.725, 21: 1.721, 22: 1.717,
  23: 1.714, 24: 1.711, 25: 1.708, 26: 1.706, 27: 1.703, 28: 1.701, 29: 1.699, 30: 1.697,
};

/**
 * Is a Pearson r of `n` paired points significant at a one-sided p < 0.05? Converts r
 * to the standard t-statistic `t = |r|·√(df / (1 − r²))` (df = n − 2) and compares it to
 * the critical t for that df. This is the **adaptive** cry-wolf floor a fixed |r| cutoff
 * can't be: it demands |r| ≈ 0.62 at 8 pairs but only ≈ 0.31 at 30 — strict when data is
 * thin, lenient when it's ample — so a seam can't fire on a few noisy days. Magnitude only
 * (direction is the caller's job). Returns false below 3 points (no test possible).
 */
export function pearsonSignificant(r: number, n: number): boolean {
  const df = n - 2;
  if (df < 1) return false;
  if (r * r >= 1) return true; // a perfect line is always significant
  const t = Math.abs(r) * Math.sqrt(df / (1 - r * r));
  const tCrit = T_CRIT_05[df] ?? 1.645;
  return t >= tCrit;
}

// ── detectSeam: the write-once cross-tile engine ─────────────────────────────────
// Every curated seam (tired→eating, caffeine→recovery, sleep→mood, …) is the SAME
// shape: join a driver series to an outcome series by date (optionally lagged),
// contrast the low vs high third of the driver, and report the outcome gap + the
// whole-window correlation — gated so it only ever speaks when the pattern is real.
// detectSeam is that skeleton, written ONCE. Adding a seam = a registry entry +
// honest copy (see SEAM_REGISTRY in nudges.ts), never a re-implementation of the math.

export interface SeamSpec {
  /** Expected correlation sign: 'neg' = driver↑ → outcome↓; 'pos' = driver↑ → outcome↑. */
  expect: 'neg' | 'pos';
  /** Whole days the driver leads the outcome. 0 = same day; 1 = next morning (the caffeine lag). */
  lag?: number;
  /** Paired days required before the seam may speak (default 8 — the cry-wolf floor). */
  minPaired?: number;
  /** Minimum gap between the low- and high-driver buckets, in OUTCOME units, in the expected direction. */
  minDelta: number;
  /** Minimum |Pearson r| across all pairs (default 0.2). */
  minAbsR?: number;
  /**
   * Require the correlation to clear a one-sided p < 0.05 significance test for its sample
   * size ({@link pearsonSignificant}) — the adaptive cry-wolf floor a fixed minAbsR can't be.
   * Recommended for any NEW seam (especially noisy self-report outcomes like mood). The two
   * legacy seams omit it to stay byte-identical to their shipped gate; revisit post-launch.
   */
  significance?: boolean;
  /**
   * Decimal places the consumer DISPLAYS the outcome at (default 0). The gate is judged on
   * the bucket means rounded to this precision — so the number the user sees as the receipt
   * is exactly the number the gate decided on (no "shows 150, judged 149.5" mismatch), and
   * the integer-rounded legacy seams stay byte-identical to their shipped behavior.
   */
  decimals?: number;
}

export interface SeamResult {
  /** Days with BOTH a driver value and a (lag-shifted) outcome value. */
  nPaired: number;
  /** Pearson r of driver × outcome across paired days, or null when a series is flat. */
  r: number | null;
  /** Size of each contrast bucket (low vs high third of the driver). */
  bucketDays: number;
  /** Raw (unrounded) mean DRIVER value in the low / high buckets — consumers round for copy. */
  lowDriverAvg: number;
  highDriverAvg: number;
  /** Raw (unrounded) mean OUTCOME value when the driver is low / high. */
  outcomeAtLowDriver: number;
  outcomeAtHighDriver: number;
  /**
   * Effect size in the EXPECTED direction (≥ 0 when the effect is present), raw.
   * 'neg' → outcomeAtLowDriver − outcomeAtHighDriver (more food when MORE tired).
   * 'pos' → outcomeAtHighDriver − outcomeAtLowDriver (better mood after MORE sleep).
   */
  delta: number;
  /** Passes the cry-wolf gate: enough pairs, a real gap, AND r agrees in direction. */
  meaningful: boolean;
}

/**
 * Join a driver series to an outcome series by local-day index (driver day D pairs
 * with outcome day D+`lag`), then contrast the low vs high third of the driver and
 * report the outcome gap plus the whole-window correlation. A value of `null` or
 * `≤ 0` on either side is the app's "no reading / not logged" sentinel and is
 * dropped, never read as a real 0. Returns null below `minPaired` (not enough data
 * to judge); otherwise a {@link SeamResult} whose `meaningful` is the shared
 * cry-wolf gate — enough paired days, a real `minDelta` gap, AND a Pearson r of at
 * least `minAbsR` magnitude in the expected direction.
 */
export function detectSeam(
  driverByDate: { date: string; value: number | null }[],
  outcomeByDate: { date: string; value: number | null }[],
  spec: SeamSpec,
): SeamResult | null {
  const lag = spec.lag ?? 0;
  const minPaired = spec.minPaired ?? 8;
  const minAbsR = spec.minAbsR ?? 0.2;

  // Outcome keyed by whole-day index so we can join "lag days later" cheaply.
  const outcomeByIndex = new Map<number, number>();
  for (const o of outcomeByDate) {
    if (o.value == null || o.value <= 0) continue; // ≤0 / null = no-reading sentinel
    const i = dayIndex(o.date);
    if (i != null) outcomeByIndex.set(i, o.value);
  }

  const pairs: { driver: number; outcome: number }[] = [];
  for (const d of driverByDate) {
    if (d.value == null || d.value <= 0) continue; // only days the driver was actually logged
    const di = dayIndex(d.date);
    if (di == null) continue;
    const outcome = outcomeByIndex.get(di + lag);
    if (outcome == null) continue;
    pairs.push({ driver: d.value, outcome });
  }
  if (pairs.length < minPaired) return null;

  const n = pairs.length;
  const byDriver = [...pairs].sort((p, q) => p.driver - q.driver);
  // Low vs high third, never more than half each so the two buckets stay disjoint.
  const bucket = Math.min(Math.max(2, Math.round(n / 3)), Math.floor(n / 2));
  const low = byDriver.slice(0, bucket);
  const high = byDriver.slice(n - bucket);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const lowDriverAvg = mean(low.map((p) => p.driver));
  const highDriverAvg = mean(high.map((p) => p.driver));
  const outcomeAtLowDriver = mean(low.map((p) => p.outcome));
  const outcomeAtHighDriver = mean(high.map((p) => p.outcome));
  // Delta is computed on the bucket means ROUNDED to the display precision, so the gate
  // judges exactly the number the consumer shows as the receipt (and the legacy integer
  // seams keep their shipped rounded-delta gate, byte-for-byte).
  const dp = spec.decimals ?? 0;
  const outLow = round(outcomeAtLowDriver, dp);
  const outHigh = round(outcomeAtHighDriver, dp);
  const delta = spec.expect === 'neg' ? outLow - outHigh : outHigh - outLow;
  const corr = correlate(
    pairs.map((p) => p.driver),
    pairs.map((p) => p.outcome),
  );
  // r must clear the magnitude floor AND point the expected way. A flat series makes
  // corr null → not meaningful (no gradient to read), which is correct.
  const rAgrees = corr != null && (spec.expect === 'neg' ? corr.r <= -minAbsR : corr.r >= minAbsR);
  // Opt-in: also demand statistical significance for the sample size (rAgrees guarantees
  // corr != null here, so corr.r is safe).
  const significant = !spec.significance || (rAgrees && pearsonSignificant(corr!.r, n));

  return {
    nPaired: n,
    r: corr ? corr.r : null,
    bucketDays: bucket,
    lowDriverAvg,
    highDriverAvg,
    outcomeAtLowDriver,
    outcomeAtHighDriver,
    delta,
    meaningful: rAgrees && significant && delta >= spec.minDelta,
  };
}

export interface TiredEating {
  /** Days with BOTH a recovery score and logged calories. */
  nPaired: number;
  /** Pearson r of recovery×kcal across paired days (negative = more food when tired). */
  r: number | null;
  /** Size of each contrast bucket (bottom vs top third of recovery days). */
  bucketDays: number;
  /** Mean recovery in the low / high buckets (for copy). */
  lowRecoveryAvg: number;
  highRecoveryAvg: number;
  /** Mean calories on the lowest-recovery vs highest-recovery days. */
  lowAvgKcal: number;
  highAvgKcal: number;
  /** lowAvgKcal − highAvgKcal (positive = eats more on tired days). */
  deltaKcal: number;
  /** Passes the cry-wolf gate: enough paired days AND a clear, consistent effect. */
  meaningful: boolean;
}

/**
 * Does the user eat more on their lower-recovery days? Joins recovery and logged
 * calories by date, contrasts the bottom third of recovery days against the top
 * third, and reports the calorie gap plus the whole-window correlation.
 *
 * `meaningful` is the cry-wolf gate — it only trips with enough paired days, a
 * sizeable calorie gap, AND a directionally-consistent negative correlation, so
 * the daily briefing never surfaces a pattern that isn't really there. Returns
 * null (not just `meaningful:false`) when there isn't even enough data to judge.
 */
export function tiredEating(
  recoveryByDate: { date: string; recovery: number | null }[],
  kcalByDate: { date: string; kcal: number | null }[],
  opts: { minPairedDays?: number; minDeltaKcal?: number; maxR?: number } = {},
): TiredEating | null {
  // A same-day 'neg' seam (more food when MORE tired). The math lives in detectSeam;
  // this wrapper just names the axes and rounds the bucket means for copy.
  const seam = detectSeam(
    recoveryByDate.map((r) => ({ date: r.date, value: r.recovery })),
    kcalByDate.map((k) => ({ date: k.date, value: k.kcal })),
    {
      expect: 'neg',
      lag: 0,
      minPaired: opts.minPairedDays ?? 8,
      minDelta: opts.minDeltaKcal ?? 150,
      minAbsR: opts.maxR != null ? Math.abs(opts.maxR) : 0.2,
    },
  );
  if (!seam) return null;
  const lowAvgKcal = Math.round(seam.outcomeAtLowDriver);
  const highAvgKcal = Math.round(seam.outcomeAtHighDriver);
  return {
    nPaired: seam.nPaired,
    r: seam.r,
    bucketDays: seam.bucketDays,
    lowRecoveryAvg: Math.round(seam.lowDriverAvg),
    highRecoveryAvg: Math.round(seam.highDriverAvg),
    lowAvgKcal,
    highAvgKcal,
    deltaKcal: lowAvgKcal - highAvgKcal,
    meaningful: seam.meaningful,
  };
}

export interface CaffeineRecovery {
  /** Caffeine-logged days that ALSO have a recovery score the NEXT morning. */
  nPaired: number;
  /** Pearson r of caffeineMg × next-day recovery (negative = more caffeine, worse recovery). */
  r: number | null;
  /** Size of each contrast bucket (lightest vs heaviest third of caffeine days). */
  bucketDays: number;
  /** Mean caffeine (mg) in the low / high buckets (for copy). */
  lowCaffeineMg: number;
  highCaffeineMg: number;
  /** Mean NEXT-DAY recovery after the lightest- vs heaviest-caffeine days. */
  recoveryAfterLow: number;
  recoveryAfterHigh: number;
  /** recoveryAfterLow − recoveryAfterHigh (positive = recovery drops after high caffeine). */
  deltaRecovery: number;
  /** Passes the cry-wolf gate: enough paired days AND a clear, consistent effect. */
  meaningful: boolean;
}

/**
 * Does the user's recovery drop the morning AFTER higher-caffeine days? Joins each
 * caffeine day's mg to the *next* calendar day's recovery (the +1-day lag is the
 * point — tonight's caffeine shaves tonight's sleep, which posts as tomorrow's
 * recovery), contrasts the lightest third of caffeine days against the heaviest,
 * and reports the recovery gap plus the whole-window correlation.
 *
 * `meaningful` is the same cry-wolf gate as {@link tiredEating} — it only trips
 * with enough paired days, a sizeable recovery gap, AND a directionally-consistent
 * negative correlation, so the briefing never surfaces a seam that isn't really
 * there. Returns null (not `meaningful:false`) when there isn't enough data to judge.
 */
export function caffeineRecovery(
  caffeineByDate: { date: string; caffeineMg: number | null }[],
  recoveryByDate: { date: string; recovery: number | null }[],
  opts: { minPairedDays?: number; minDeltaRecovery?: number; maxR?: number } = {},
): CaffeineRecovery | null {
  // A +1-day-lagged 'neg' seam: tonight's caffeine shaves tonight's sleep, which
  // posts as tomorrow's recovery. detectSeam owns the join/buckets/gate; this
  // wrapper names the axes and rounds the bucket means for copy.
  const seam = detectSeam(
    caffeineByDate.map((c) => ({ date: c.date, value: c.caffeineMg })),
    recoveryByDate.map((r) => ({ date: r.date, value: r.recovery })),
    {
      expect: 'neg',
      lag: 1,
      minPaired: opts.minPairedDays ?? 8,
      minDelta: opts.minDeltaRecovery ?? 5,
      minAbsR: opts.maxR != null ? Math.abs(opts.maxR) : 0.2,
    },
  );
  if (!seam) return null;
  const recoveryAfterLow = Math.round(seam.outcomeAtLowDriver);
  const recoveryAfterHigh = Math.round(seam.outcomeAtHighDriver);
  return {
    nPaired: seam.nPaired,
    r: seam.r,
    bucketDays: seam.bucketDays,
    lowCaffeineMg: Math.round(seam.lowDriverAvg),
    highCaffeineMg: Math.round(seam.highDriverAvg),
    recoveryAfterLow,
    recoveryAfterHigh,
    deltaRecovery: recoveryAfterLow - recoveryAfterHigh,
    meaningful: seam.meaningful,
  };
}

// ── Sentiment: turning the journal into a number (mood as a signal) ───────────────
// A deterministic lexicon valence so free-text vents become a number the correlate
// engine can cross against everything. Not NLP-perfect — directional + HONEST
// (null when there's nothing emotional to read, never a fabricated neutral), which
// is exactly what correlation needs. Pure + free (no LLM call, no cost, no drift).

const POSITIVE_WORDS = new Set([
  'good', 'great', 'happy', 'grateful', 'proud', 'calm', 'relaxed', 'energized', 'energised',
  'motivated', 'strong', 'excited', 'hopeful', 'accomplished', 'productive', 'focused', 'clear',
  'confident', 'content', 'peaceful', 'rested', 'better', 'progress', 'win', 'winning', 'love',
  'loved', 'joy', 'glad', 'optimistic', 'refreshed', 'amazing', 'wonderful', 'fantastic',
  'awesome', 'thriving', 'grounded', 'steady', 'grateful',
]);

const NEGATIVE_WORDS = new Set([
  'tired', 'exhausted', 'drained', 'anxious', 'anxiety', 'stressed', 'stress', 'sad', 'depressed',
  'depression', 'angry', 'frustrated', 'overwhelmed', 'burnt', 'burnout', 'burned', 'hopeless',
  'lonely', 'alone', 'awful', 'terrible', 'horrible', 'worse', 'worst', 'struggling', 'struggle',
  'hate', 'fail', 'failed', 'failing', 'crying', 'cry', 'empty', 'numb', 'lost', 'guilty',
  'ashamed', 'worthless', 'scared', 'afraid', 'worried', 'worry', 'dread', 'miserable', 'defeated',
  'unmotivated', 'sluggish', 'foggy', 'pain', 'hurt', 'rough', 'bad', 'down',
]);

const NEGATORS = new Set([
  'not', 'no', 'never', 'without', 'barely', 'hardly', 'dont', 'didnt', 'wasnt', 'isnt', 'cant',
  'wont', 'couldnt', 'arent', 'havent',
]);
const INTENSIFIERS = new Set([
  'very', 'so', 'really', 'extremely', 'super', 'incredibly', 'totally', 'completely',
  'absolutely', 'too', 'utterly',
]);

/**
 * Lexicon valence of a free-text note in [−1, 1] (−1 low, +1 good). Looks back up
 * to two tokens for a negator ("not bad" → positive) or intensifier ("really
 * exhausted" → stronger). Returns the average valence over the sentiment words it
 * found, or **null when it found none** — so a neutral/empty entry adds no false
 * signal to the mood series.
 */
export function sentimentScore(text: string): number | null {
  if (!text) return null;
  // Strip apostrophes so "don't" → "dont" matches the negator set.
  const tokens = text.toLowerCase().replace(/'/g, '').match(/[a-z]+/g);
  if (!tokens) return null;
  let sum = 0;
  let hits = 0;
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    let val = POSITIVE_WORDS.has(w) ? 1 : NEGATIVE_WORDS.has(w) ? -1 : 0;
    if (val === 0) continue;
    let mult = 1;
    let negated = false;
    for (let j = Math.max(0, i - 2); j < i; j++) {
      if (NEGATORS.has(tokens[j])) negated = true;
      if (INTENSIFIERS.has(tokens[j])) mult = 1.5;
    }
    if (negated) val = -val;
    sum += val * mult;
    hits++;
  }
  if (hits === 0) return null;
  return round(Math.max(-1, Math.min(1, sum / hits)), 2);
}

/** Map a sentiment valence (−1..1) onto the 1–5 mood scale, so journal-derived
 *  mood and the explicit 1–5 tap live on one axis the engine can correlate. */
export function sentimentToMood(valence: number): number {
  return round(Math.max(1, Math.min(5, 3 + valence * 2)), 1);
}

export interface MoodTrend {
  nDays: number;
  avg: number;
  recentAvg: number;
  priorAvg: number | null;
  direction: 'down' | 'up' | 'steady';
  /** Recent stretch sits at/below the low threshold. */
  low: boolean;
}

/**
 * Mood trajectory over a NEWEST-FIRST daily mood series (1–5): overall average,
 * recent-vs-prior, and whether the recent stretch reads low. Returns null below
 * `minDays` so a couple of entries never trigger a "you've seemed low" reach-out.
 */
export function moodTrend(
  days: { mood: number }[],
  opts: { minDays?: number; lowThreshold?: number } = {},
): MoodTrend | null {
  const minDays = opts.minDays ?? 4;
  const lowThreshold = opts.lowThreshold ?? 2.5;
  if (days.length < minDays) return null;
  const moods = days.map((d) => d.mood);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const recentAvg = round(mean(moods.slice(0, 7)), 1);
  const prior = moods.slice(7, 14);
  const priorAvg = prior.length ? round(mean(prior), 1) : null;
  let direction: MoodTrend['direction'] = 'steady';
  if (priorAvg != null) {
    const delta = recentAvg - priorAvg;
    direction = delta <= -0.5 ? 'down' : delta >= 0.5 ? 'up' : 'steady';
  }
  return { nDays: days.length, avg: round(mean(moods), 1), recentAvg, priorAvg, direction, low: recentAvg <= lowThreshold };
}
