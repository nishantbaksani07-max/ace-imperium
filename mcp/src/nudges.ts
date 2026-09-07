// Nudge engine for the Vitality MCP.
//
// Pulls the read layer, then derives a prioritized list of nudges across every
// server-readable domain. This is what powers `vitality_daily_briefing` and the
// scheduled morning/evening agent. Pure derivation — no writes, no side effects.
//
// Honesty rule: anything the server genuinely cannot see (water, goals, brand,
// supplements — all browser-only localStorage today) is reported as a known gap,
// never silently dropped.

import type { VitalityDb } from './supabase.js';
import { fmtHour, fmtKpi, getLocalDateKey, round } from './util.js';
import {
  getProfile,
  getSleep,
  getWeights,
  getNutrition,
  getNutritionDaily,
  getMoodDaily,
  getWorkouts,
  getSubscriptions,
  getNotes,
  getWater,
  getGoals,
  getSupplements,
  getBrand,
  getBusiness,
  getPeakStimulants,
  getStimulantsDaily,
  getManualSleepDaily,
  type StimulantDay,
  type ManualSleepDay,
  type SleepData,
  type WeightData,
  type NutritionData,
  type WorkoutData,
  type SubscriptionData,
  type WaterData,
  type GoalsData,
  type SupplementsData,
  type BrandData,
  type BusinessData,
  type MoodDay,
  type PeakStimulantsData,
  type Profile,
} from './queries.js';
import { classifyWeightRate, consecutiveTrainingDays, acuteLoad, detectSeam, moodTrend, type SeamResult, type SeamSpec } from './insights.js';

export type Severity = 'urgent' | 'suggest' | 'info';

export interface Nudge {
  domain:
    | 'today'
    | 'sleep'
    | 'training'
    | 'nutrition'
    | 'weight'
    | 'finance'
    | 'hydration'
    | 'goals'
    | 'supplements'
    | 'business'
    | 'mind'
    | 'peak'
    | 'reminders'
    | 'coverage';
  severity: Severity;
  title: string;
  detail: string;
}

const SEVERITY_RANK: Record<Severity, number> = { urgent: 0, suggest: 1, info: 2 };

// ── Recovery → training tier (SKILL.md "Vitality score" tiers) ─────────────────
function recoveryTier(recovery: number): { label: string; advice: string } {
  if (recovery >= 80) return { label: 'Peak', advice: 'push hard — green light for a heavy session' };
  if (recovery >= 65) return { label: 'Solid', advice: 'train normal' };
  if (recovery >= 50) return { label: 'Tired', advice: 'keep it moderate, trim the top sets' };
  if (recovery >= 35) return { label: 'Low', advice: 'go light or take active recovery' };
  return { label: 'Drained', advice: 'rest today — your body is asking for it' };
}

/**
 * Latest *real* recovery reading, newest-first. A non-positive value means the
 * wearable had no overnight data — that is no-signal, never "Drained". Every
 * recovery-tier read goes through here so honesty is consistent across nudges.
 */
function latestRealRecovery(sleep: SleepData): number | null {
  return sleep.entries.find((e) => e.recovery != null && e.recovery > 0)?.recovery ?? null;
}

/** Sleep debt (hours) over the last up-to-7 nights with data, vs the sleep need. */
function recentSleepDebt(sleep: SleepData): number {
  const recent = sleep.entries.filter((e) => e.sleepHours != null).slice(0, 7);
  let debt = 0;
  for (const e of recent) debt += Math.max(0, sleep.prefs.sleepNeedHours - (e.sleepHours ?? sleep.prefs.sleepNeedHours));
  return round(debt, 1);
}

// ── Cross-domain synthesis (the headline "today's call") ─────────────────────────
// One recommendation that weighs recovery, sleep debt, and training load together,
// instead of leaving the agent to reconcile three independent single-domain nudges.
function synthesisNudge(sleep: SleepData, workouts: WorkoutData, todayKey: string): Nudge | null {
  const recovery = latestRealRecovery(sleep);
  const debt = recentSleepDebt(sleep);
  const streak = consecutiveTrainingDays(
    workouts.entries.filter((e) => e.submitted).map((e) => e.date),
    todayKey,
  );
  const load = acuteLoad(sleep.entries.map((e) => e.strain), 7);
  const loadStr = load != null ? ` Acute 7-day strain ~${load}.` : '';

  // Drained recovery wins outright.
  if (recovery != null && recovery < 35) {
    return {
      domain: 'today',
      severity: 'urgent',
      title: `Today's call: rest. Recovery ${recovery} (Drained)`,
      detail: `Your body is asking for a day off${streak >= 2 ? ` after ${streak} days straight` : ''}.${debt >= 2 ? ` You're also carrying ~${debt}h of sleep debt.` : ''}${loadStr} Light movement at most; protect tonight's sleep.`,
    };
  }
  // Long unbroken block, even on decent recovery → deload.
  if (streak >= 5 && (recovery == null || recovery >= 50)) {
    return {
      domain: 'today',
      severity: 'suggest',
      title: `Today's call: ease off — ${streak} training days in a row`,
      detail: `${recovery != null ? `Recovery ${recovery} still looks workable, but ` : ''}fatigue compounds. A deload or full rest day now protects the next block.${loadStr}`,
    };
  }
  // Low recovery stacked on back-to-back sessions.
  if (recovery != null && recovery < 50 && streak >= 3) {
    return {
      domain: 'today',
      severity: 'suggest',
      title: `Today's call: active recovery. Recovery ${recovery} after ${streak} days on`,
      detail: `Recovery is in the low band and you've trained ${streak} days running. Keep it light or rest; chase the sleep debt${debt >= 1 ? ` (~${debt}h)` : ''}.`,
    };
  }
  // Strong green light.
  if (recovery != null && recovery >= 80 && debt < 2) {
    return {
      domain: 'today',
      severity: 'info',
      title: `Today's call: green light. Recovery ${recovery} (Peak)`,
      detail: `Well recovered and sleep debt is low — this is the day to push the hardest session of your week.${loadStr}`,
    };
  }
  // Otherwise a balanced one-liner if we have any recovery signal.
  if (recovery != null) {
    return {
      domain: 'today',
      severity: 'info',
      title: `Today's call: train as planned. Recovery ${recovery}`,
      detail: [
        'Nothing flashing red.',
        debt >= 2 ? `Mind the ~${debt}h sleep debt.` : '',
        streak >= 2 ? `${streak} days on the trot.` : '',
        loadStr.trim(),
      ]
        .filter(Boolean)
        .join(' '),
    };
  }
  return null;
}

// ── Sleep ──────────────────────────────────────────────────────────────────────
function sleepNudges(sleep: SleepData): Nudge[] {
  const out: Nudge[] = [];
  const { wakeTime, sleepNeedHours } = sleep.prefs;
  const baselineBedtime = wakeTime - sleepNeedHours;

  if (!sleep.hasWearable) {
    out.push({
      domain: 'sleep',
      severity: 'info',
      title: `Target lights-out around ${fmtHour(baselineBedtime)}`,
      detail: `To wake at ${fmtHour(wakeTime)} with ${sleepNeedHours}h of sleep. No wearable is connected, so this is from your Peak schedule prefs only — connect Whoop, Oura, or Fitbit for recovery-aware timing.`,
    });
    return out;
  }

  // Sleep debt over the entries we have (cap at last 7).
  const debt = recentSleepDebt(sleep);

  const latest = sleep.entries[0];
  const latestRecovery = latestRealRecovery(sleep);

  // Earlier-bedtime shift if carrying meaningful debt or low recovery.
  let shift = 0;
  if (debt >= 3) shift = Math.min(1, debt / 6);
  if (latestRecovery != null && latestRecovery < 50) shift = Math.max(shift, 0.5);
  const targetBedtime = baselineBedtime - shift;

  out.push({
    domain: 'sleep',
    severity: shift > 0 ? 'suggest' : 'info',
    title: `Lights out around ${fmtHour(targetBedtime)} tonight`,
    detail:
      `Wake target ${fmtHour(wakeTime)}, sleep need ${sleepNeedHours}h.` +
      (debt >= 1 ? ` You're carrying ~${debt}h of sleep debt over the last week.` : '') +
      (shift > 0 ? ` Shifting bedtime ${Math.round(shift * 60)} min earlier to claw it back.` : ' You\'re on track — hold the routine.'),
  });

  if (latestRecovery != null && latestRecovery < 50) {
    out.push({
      domain: 'sleep',
      severity: 'suggest',
      title: `Recovery is ${latestRecovery} — prioritize an early night`,
      detail: `Latest reading${latest?.date ? ` (${latest.date})` : ''} is in the low band. Sleep is the highest-leverage lever here: protect the wind-down, kill the late screens.`,
    });
  }

  return out;
}

// ── Training readiness ──────────────────────────────────────────────────────────
function trainingNudges(sleep: SleepData, workouts: WorkoutData): Nudge[] {
  const out: Nudge[] = [];
  const latestRecovery = latestRealRecovery(sleep);

  if (latestRecovery != null) {
    const tier = recoveryTier(latestRecovery);
    out.push({
      domain: 'training',
      severity: latestRecovery < 35 ? 'suggest' : 'info',
      title: `Recovery ${latestRecovery} (${tier.label}) — ${tier.advice}`,
      detail: `Training read for today is "${tier.label}". ${tier.advice[0].toUpperCase()}${tier.advice.slice(1)}.`,
    });
  }

  if (workouts.submittedLast7 === 0) {
    out.push({
      domain: 'training',
      severity: 'suggest',
      title: 'No sessions logged in the last 7 days',
      detail: 'Either a deliberate deload or the logger slipped — worth a check-in if you meant to train.',
    });
  } else {
    out.push({
      domain: 'training',
      severity: 'info',
      title: `${workouts.submittedLast7} session${workouts.submittedLast7 === 1 ? '' : 's'} logged this week`,
      detail: workouts.entries[0]?.dayName
        ? `Most recent: ${workouts.entries[0].dayName} on ${workouts.entries[0].date}.`
        : 'Keep the streak honest.',
    });
  }

  return out;
}

// ── Subscriptions / finance ──────────────────────────────────────────────────────
function subscriptionNudges(subs: SubscriptionData, todayKey: string): Nudge[] {
  const out: Nudge[] = [];
  if (subs.subs.length === 0) return out;

  out.push({
    domain: 'finance',
    severity: 'info',
    title: `${subs.totalMonthlyChf} CHF/mo in subscriptions (~${subs.totalYearlyChf} CHF/yr)`,
    detail: `${subs.subs.length} active across your stack. Display currency is ${subs.currency}; figures shown in canonical CHF.`,
  });

  const within = (dateStr: string | null, days: number): boolean => {
    if (!dateStr) return false;
    const target = new Date(dateStr + 'T00:00:00');
    const now = new Date(todayKey + 'T00:00:00');
    const diff = (target.getTime() - now.getTime()) / 86_400_000;
    return diff >= 0 && diff <= days;
  };

  // Trial ending — the most actionable, time-boxed nudge.
  for (const s of subs.subs) {
    if (within(s.trialEnds, 7)) {
      out.push({
        domain: 'finance',
        severity: 'urgent',
        title: `${s.name}: free trial ends ${s.trialEnds}`,
        detail: `Decide before it converts to ${s.amountChf} CHF/${s.period}. Cancel now if you're not keeping it.`,
      });
    }
  }

  // Price hikes.
  for (const s of subs.subs) {
    if (s.previousAmountChf != null && s.amountChf > s.previousAmountChf) {
      const up = round(s.amountChf - s.previousAmountChf, 2);
      out.push({
        domain: 'finance',
        severity: 'suggest',
        title: `${s.name} got more expensive (+${up} CHF)`,
        detail: `Now ${s.amountChf} CHF/${s.period}, was ${s.previousAmountChf}${s.priceChangedAt ? ` (changed ${s.priceChangedAt})` : ''}. Still worth it?`,
      });
    }
  }

  // Upcoming renewals (informational heads-up).
  const renewingSoon = subs.subs.filter((s) => within(s.renewal, 7));
  if (renewingSoon.length) {
    out.push({
      domain: 'finance',
      severity: 'info',
      title: `${renewingSoon.length} subscription${renewingSoon.length === 1 ? '' : 's'} renew this week`,
      detail: renewingSoon.map((s) => `${s.name} (${s.renewal}, ${s.amountChf} CHF)`).join(' · '),
    });
  }

  // Review candidates — the honest version of "cancel what you don't use".
  // Vitality stores no usage signal, so we surface the priciest and say so.
  const candidates = subs.subs.slice(0, 3);
  if (candidates.length) {
    out.push({
      domain: 'finance',
      severity: 'suggest',
      title: 'Worth a review: your priciest subscriptions',
      detail:
        candidates.map((s) => `${s.name} (${round(s.monthlyChf, 2)} CHF/mo)`).join(' · ') +
        '. Heads up: Vitality does not track last-used, so I can\'t tell which you actually use — these are simply the costliest. You decide if each earns its keep.',
    });
  }

  return out;
}

// ── Nutrition ────────────────────────────────────────────────────────────────────
function nutritionNudges(n: NutritionData): Nudge[] {
  if (!n.onboarded) return [];
  const out: Nudge[] = [];
  const { today, kcalTarget, proteinTarget } = n;

  const kcalLeft = kcalTarget - today.kcal;
  out.push({
    domain: 'nutrition',
    severity: 'info',
    title: `${today.kcal}/${kcalTarget} kcal · ${today.protein}/${proteinTarget}g protein today`,
    detail:
      today.mealCount === 0
        ? 'Nothing logged yet today.'
        : `${today.mealCount} meal${today.mealCount === 1 ? '' : 's'} logged. ${kcalLeft >= 0 ? `${Math.round(kcalLeft)} kcal left` : `${Math.round(-kcalLeft)} kcal over`}.`,
  });

  const proteinGap = proteinTarget - today.protein;
  if (today.mealCount > 0 && proteinGap > proteinTarget * 0.4) {
    out.push({
      domain: 'nutrition',
      severity: 'suggest',
      title: `Protein is short by ~${Math.round(proteinGap)}g`,
      detail: `At ${today.protein}/${proteinTarget}g. A protein-forward next meal closes the gap.`,
    });
  }

  // Weekly pattern — one logged day says little, a week of them says a lot.
  const a = n.adherence;
  if (a.loggedDays >= 3) {
    if (a.daysOver >= Math.ceil(a.loggedDays / 2)) {
      out.push({
        domain: 'nutrition',
        severity: 'suggest',
        title: `Over your calorie target ${a.daysOver}/${a.loggedDays} recent days`,
        detail: `Averaging ${a.avgKcal} kcal vs a ${kcalTarget} target. If the goal is a deficit, the week isn't matching it.`,
      });
    } else if (a.daysUnder >= Math.ceil(a.loggedDays / 2)) {
      out.push({
        domain: 'nutrition',
        severity: 'info',
        title: `Under target ${a.daysUnder}/${a.loggedDays} recent days`,
        detail: `Averaging ${a.avgKcal} kcal vs ${kcalTarget}. Fine for a cut; under-eating on a bulk stalls progress.`,
      });
    }
    if (a.proteinHitDays <= Math.floor(a.loggedDays / 2)) {
      out.push({
        domain: 'nutrition',
        severity: 'suggest',
        title: `Protein target hit only ${a.proteinHitDays}/${a.loggedDays} recent days`,
        detail: `Recent average ${n.recentAvgProtein ?? '?'}g vs a ${proteinTarget}g target — the most common miss. Anchor each meal around a protein source.`,
      });
    }
  }

  return out;
}

// ── Weight ───────────────────────────────────────────────────────────────────────
function weightNudges(w: WeightData, profile: Profile, nutrition: NutritionData): Nudge[] {
  if (w.latestKg == null) return [];
  const out: Nudge[] = [];
  const isImperial = profile.units === 'imperial';
  const show = (kg: number) => (isImperial ? `${round(kg * 2.20462, 1)} lb` : `${round(kg, 1)} kg`);

  const goal = nutrition.goalOutcome ?? profile.goal;
  const rate = w.weeklyRate;
  const ratePerWeek = rate
    ? (isImperial ? `${round(rate.kgPerWeek * 2.20462, 2)} lb/wk` : `${rate.kgPerWeek} kg/wk`)
    : null;

  out.push({
    domain: 'weight',
    severity: 'info',
    title: `Weight ${show(w.latestKg)}${ratePerWeek ? ` (${rate!.kgPerWeek >= 0 ? '+' : ''}${ratePerWeek})` : ''}`,
    detail: rate
      ? `Least-squares rate over ${rate.spanDays}d from ${rate.n} weigh-ins.${w.deltaKg != null ? ` Raw change ${w.deltaKg >= 0 ? '+' : ''}${show(w.deltaKg)} over ${w.windowDays}d.` : ''}`
      : 'Not enough weigh-ins to compute a rate yet.',
  });

  // Goal-aware verdict on the rate — the actionable part.
  if (rate) {
    const a = classifyWeightRate(rate.kgPerWeek, w.latestKg, goal);
    const flag: Record<string, Severity> = {
      'wrong-direction': 'suggest',
      'too-fast': 'suggest',
      stalled: 'suggest',
      slow: 'info',
      'on-track': 'info',
      drifting: 'suggest',
      unknown: 'info',
    };
    const sev = flag[a.verdict] ?? 'info';
    if (sev !== 'info' || a.verdict === 'on-track') {
      out.push({
        domain: 'weight',
        severity: sev,
        title: a.goal
          ? `Weight rate vs "${a.goal}" goal: ${a.verdict}`
          : `Weight rate: ${a.verdict}`,
        detail: `${a.note}${a.pctPerWeek != null ? ` (${a.pctPerWeek >= 0 ? '+' : ''}${a.pctPerWeek}% bodyweight/week)` : ''}${sev === 'suggest' ? ' The adaptive engine in Fuel can recalibrate targets.' : ''}`,
      });
    }
  }

  return out;
}

// ── Hydration (now server-readable: water_prefs + water_days) ──────────────────────
function hydrationNudges(w: WaterData): Nudge[] {
  if (!w.hasData) return [];
  const out: Nudge[] = [];
  const unit = w.todayServings === 1 ? w.unit.replace(/s$/, '') : w.unit;
  if (w.targetServings != null) {
    if (w.todayServings >= w.targetServings) {
      out.push({
        domain: 'hydration',
        severity: 'info',
        title: `Hydration on target — ${w.todayServings}/${w.targetServings} ${unit}`,
        detail: 'Water goal hit for today. Nice.',
      });
    } else {
      const left = w.targetServings - w.todayServings;
      out.push({
        domain: 'hydration',
        severity: w.todayServings === 0 ? 'suggest' : 'info',
        title: `Water: ${w.todayServings}/${w.targetServings} ${w.unit} (${left} to go)`,
        detail: w.todayServings === 0 ? 'Nothing logged yet today — start the count.' : 'On the way to your target.',
      });
    }
  } else {
    out.push({
      domain: 'hydration',
      severity: 'info',
      title: `Water: ${w.todayServings} ${unit} today`,
      detail: w.recentAvgServings != null ? `Recent average ${w.recentAvgServings}/day.` : 'Logging started.',
    });
  }
  return out;
}

// ── Goals / streak (mirrored to Supabase) ──────────────────────────────────────────
function goalsNudges(g: GoalsData): Nudge[] {
  if (!g.hasData) return [];
  const out: Nudge[] = [];

  // Imminent big-goal deadline (≤3 days, not overdue) — powers the late-night
  // "you've got a PR goal tomorrow you said you wanted" reasoning. Data-gated so
  // it only fires when the user actually set a dated goal that's close.
  const imminent = g.bigGoals
    .filter((bg) => bg.daysUntilTarget != null && bg.daysUntilTarget >= 0 && bg.daysUntilTarget <= 3)
    .sort((a, b) => (a.daysUntilTarget as number) - (b.daysUntilTarget as number))[0];
  if (imminent) {
    const d = imminent.daysUntilTarget as number;
    const when = d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`;
    out.push({
      domain: 'goals',
      severity: d <= 1 ? 'suggest' : 'info',
      title: `Goal "${imminent.title}" is due ${when}`,
      detail: imminent.progress
        ? `At ${imminent.progress.current}/${imminent.progress.target}${imminent.progress.unit ? ` ${imminent.progress.unit}` : ''} (${imminent.progress.pct}%) — worth a focused push.`
        : 'Worth a focused push.',
    });
  }

  const remaining = g.dueToday - g.completedToday;
  if (g.streakCurrent > 0 && remaining > 0) {
    out.push({
      domain: 'goals',
      severity: g.streakCurrent >= 7 ? 'suggest' : 'info',
      title: `🔥 ${g.streakCurrent}-day streak at risk — ${remaining} goal(s) left today`,
      detail: `${g.completedToday}/${g.dueToday} done. Finish the rest to keep the streak alive.`,
    });
  } else if (g.dueToday > 0) {
    out.push({
      domain: 'goals',
      severity: 'info',
      title: `Goals: ${g.completedToday}/${g.dueToday} done today (streak ${g.streakCurrent})`,
      detail: g.completedToday >= g.dueToday ? 'All today\'s goals done — streak safe.' : 'Keep going.',
    });
  }
  return out;
}

// ── Business / brand (mirrored to Supabase) ───────────────────────────────────────
// Surfaces the venture side in the daily briefing: milestone deadlines, KPI
// movement, and audience momentum — the things a creator/founder wants nudged
// on each morning, same as their training and nutrition.
function brandNudges(b: BrandData): Nudge[] {
  if (!b.hasData || b.brandCount === 0) return [];
  const out: Nudge[] = [];
  const open = b.goals.filter((g) => !g.done);

  // Overdue milestones — most actionable, so urgent.
  const overdue = open.filter((g) => g.daysLeft != null && g.daysLeft < 0);
  if (overdue.length) {
    out.push({
      domain: 'business',
      severity: 'urgent',
      title: `${overdue.length} business goal(s) overdue`,
      detail: overdue
        .slice(0, 3)
        .map((g) => `${g.title} (${Math.abs(g.daysLeft as number)}d over · ${g.brand})`)
        .join(' · '),
    });
  }

  // Due within 3 days — heads-up before they slip.
  const dueSoon = open.filter((g) => g.daysLeft != null && g.daysLeft >= 0 && g.daysLeft <= 3);
  if (dueSoon.length) {
    out.push({
      domain: 'business',
      severity: 'suggest',
      title: `${dueSoon.length} business goal(s) due within 3 days`,
      detail: dueSoon
        .slice(0, 4)
        .map((g) => `${g.title} (${g.daysLeft === 0 ? 'today' : `${g.daysLeft}d`})`)
        .join(' · '),
    });
  }

  // KPI momentum — metrics that moved this week, with progress toward target.
  const movers = b.kpis.filter((k) => k.delta7 != null && k.delta7 !== 0);
  if (movers.length) {
    out.push({
      domain: 'business',
      severity: 'info',
      title: 'Metrics this week',
      detail: movers
        .slice(0, 4)
        .map(
          (k) =>
            `${k.label} ${(k.delta7 as number) >= 0 ? '+' : ''}${fmtKpi(k.delta7 as number, k.unit)}` +
            (k.pctToTarget != null ? ` (${k.pctToTarget}% to target)` : ''),
        )
        .join(' · '),
    });
  }

  // Audience momentum.
  if (b.followerDelta7 != null && b.followerDelta7 !== 0) {
    out.push({
      domain: 'business',
      severity: 'info',
      title: `Audience ${b.followerDelta7 > 0 ? '+' : ''}${b.followerDelta7.toLocaleString()} followers this week`,
      detail: `${b.totalFollowers.toLocaleString()} total across linked accounts.`,
    });
  }

  // Shipping cadence at risk today — the streak-saver reminder.
  if (b.shipCadence && b.shipCadence.remaining > 0) {
    const { brand, remaining, streak } = b.shipCadence;
    out.push({
      domain: 'business',
      severity: streak >= 3 ? 'suggest' : 'info',
      title: streak > 0 ? `🔥 ${streak}-day streak at risk on ${brand}` : `Cadence not hit yet on ${brand}`,
      detail: `${remaining} more to ship today${streak > 0 ? ` to keep the ${streak}-day streak` : ''}.`,
    });
  }

  // Wins — completed milestones this week.
  if (b.goalsDoneRecently) {
    out.push({
      domain: 'business',
      severity: 'info',
      title: `✓ ${b.goalsDoneRecently} business goal(s) completed this week`,
      detail: 'Momentum on the venture side.',
    });
  }

  // Live connector metrics — real synced numbers (Stripe/Shopify/YouTube/…).
  if (b.connectorMetrics.length) {
    out.push({
      domain: 'business',
      severity: 'info',
      title: `Live from ${b.connectorProviders.join(', ')}`,
      detail: b.connectorMetrics
        .slice(0, 6)
        .map((m) => `${m.label} ${fmtKpi(m.value, m.unit)}`)
        .join(' · '),
    });
  }

  return out;
}

// ── Supplements (mirrored to Supabase) ──────────────────────────────────────────────
function supplementsNudges(s: SupplementsData): Nudge[] {
  if (!s.hasData || s.total === 0) return [];
  const out: Nudge[] = [];
  const missed = s.total - s.takenToday;
  out.push({
    domain: 'supplements',
    severity: missed > 0 ? 'info' : 'info',
    title: `Supplements: ${s.takenToday}/${s.total} taken today`,
    detail: missed > 0 ? `${missed} still to take.` : 'Full stack taken — nice.',
  });
  if (s.lowCount > 0) {
    out.push({
      domain: 'supplements',
      severity: 'suggest',
      title: `${s.lowCount} supplement(s) running low`,
      detail: 'Reorder before you run out.',
    });
  }
  return out;
}

// ── Business (brand KPIs, mirrored to Supabase) ─────────────────────────────────────
function fmtBizValue(value: number, unit: string): string {
  const u = unit.trim();
  const abs = Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const sign = value < 0 ? '-' : '';
  if (u === '$') return `${sign}$${abs}`;
  if (u === '%' || u.startsWith('/')) return `${sign}${abs}${u}`;
  return `${sign}${abs}${u ? ' ' + u : ''}`;
}

/**
 * Surface each venture's standout weekly move (largest % change), so the
 * briefing flags "revenue down 20%" without listing every metric. A drop in a
 * revenue-like metric earns a 'suggest'; everything else is 'info'. Ventures
 * with no movement yet get one quiet tracked line. Capped to keep it terse.
 */
function businessNudges(biz: BusinessData): Nudge[] {
  if (!biz.hasData) return [];
  const out: Nudge[] = [];
  for (const venture of biz.ventures.slice(0, 3)) {
    const movers = venture.metrics
      .filter((m) => m.delta7 != null && m.delta7 !== 0)
      .map((m) => {
        const delta = m.delta7 as number;
        const baseline = m.value - delta;
        const pct = baseline !== 0 ? (delta / Math.abs(baseline)) * 100 : null;
        return { m, delta, pct };
      })
      .sort((a, b) => Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0));

    if (movers.length) {
      const { m, delta, pct } = movers[0];
      const up = delta > 0;
      const looksRevenue = /revenue|mrr|arr|sales|income|profit/i.test(m.label);
      const severity: Severity = looksRevenue && !up ? 'suggest' : 'info';
      const pctStr = pct != null ? ` (${up ? '+' : '-'}${Math.abs(Math.round(pct))}%)` : '';
      out.push({
        domain: 'business',
        severity,
        title: `${venture.name}: ${m.label} ${up ? 'up' : 'down'} this week${pctStr}`,
        detail: `Now ${fmtBizValue(m.value, m.unit)} (${up ? '+' : '-'}${fmtBizValue(Math.abs(delta), m.unit)} vs 7d ago).`,
      });
    } else {
      const m = venture.metrics[0];
      out.push({
        domain: 'business',
        severity: 'info',
        title: `${venture.name}: ${venture.metrics.length} metric(s) tracked`,
        detail: `${m.label}: ${fmtBizValue(m.value, m.unit)}. Log updates so changes trend.`,
      });
    }
  }
  return out;
}

// ── Peak stimulants (caffeine load + timing, mirrored to Supabase) ──────────────────
function stimulantNudges(s: PeakStimulantsData): Nudge[] {
  if (!s.hasData || s.todayCount === 0) return [];
  const mg = s.caffeineMgToday;
  // Caffeine has a ~5h half-life; anything mid-afternoon is still active at bed.
  const lateCaffeine = s.substances.filter((x) => x.category === 'caffeine' && x.hour != null && (x.hour as number) >= 14);
  if (mg != null && mg > 400) {
    return [{
      domain: 'peak',
      severity: 'suggest',
      title: `High caffeine today: ${Math.round(mg)} mg`,
      detail: 'Over the ~400 mg/day guideline — expect jitters and lighter sleep tonight.',
    }];
  }
  if (lateCaffeine.length) {
    const last = lateCaffeine[lateCaffeine.length - 1];
    return [{
      domain: 'peak',
      severity: 'suggest',
      title: 'Caffeine logged this afternoon',
      detail: `Last caffeine ~${fmtHour(last.hour as number)} — with a ~5h half-life it's still active near bedtime.`,
    }];
  }
  return [{
    domain: 'peak',
    severity: 'info',
    title: `Stimulants: ${s.todayCount} today${mg != null ? `, ${Math.round(mg)} mg caffeine` : ''}`,
    detail: 'Within a normal range.',
  }];
}

// ── Reminders (notes) ────────────────────────────────────────────────────────────
function reminderNudges(notes: { body: string; createdAt: string }[]): Nudge[] {
  if (!notes.length) return [];
  // Surface the most recent few — these often carry time-sensitive intent.
  return notes.slice(0, 4).map((note) => ({
    domain: 'reminders' as const,
    severity: 'info' as const,
    title: 'From your notes',
    detail: note.body,
  }));
}

// ── Coverage note (honesty footer) ─────────────────────────────────────────────────
function coverageNudge(): Nudge {
  return {
    domain: 'coverage',
    severity: 'info',
    title: 'Coverage',
    detail:
      'All modules now sync to the server: sleep, training, nutrition, weight, hydration, goals, supplements, brand, subscriptions, finances, and notes. Data is a best-effort mirror from your devices — if you just logged something on another device, give it a moment to sync.',
  };
}

export interface Briefing {
  generatedAt: string;
  dayKey: string;
  greetingName: string | null;
  nudges: Nudge[];
}

/** The shaped domain data the nudge engine derives from — one read per domain. */
export interface BriefingInputs {
  profile: Profile;
  sleep: SleepData;
  weights: WeightData;
  nutrition: NutritionData;
  /** Dated per-day calories (getNutritionDaily) — the cross-module engine needs the dates. */
  nutritionDaily: { date: string; kcal: number }[];
  /** Dated per-day mood 1–5 (getMoodDaily) — explicit taps + journal sentiment. */
  moodDaily: MoodDay[];
  workouts: WorkoutData;
  subs: SubscriptionData;
  water: WaterData;
  goals: GoalsData;
  supplements: SupplementsData;
  brand: BrandData;
  business: BusinessData;
  peakStimulants: PeakStimulantsData;
  /** Per-day caffeine total over the window (getStimulantsDaily) — feeds the
   *  caffeine→recovery seam. Optional so existing fixtures/tests stay valid. */
  stimulantsDaily?: StimulantDay[];
  /** Per-day manual sleep hours (getManualSleepDaily) — the no-wearable fallback so the
   *  sleep→mood seam fires without a band. Optional so existing fixtures/tests stay valid. */
  manualSleepDaily?: ManualSleepDay[];
  notes: { body: string; createdAt: string }[];
  todayKey: string;
}

// ── Cross-module SEAMS: the moat ─────────────────────────────────────────────────
// The patterns no single-domain app can see: how one tile moves another. Every seam
// is the SAME shape — join a driver series to an outcome series, gate hard, narrate
// honestly. detectSeam owns the math (insights.ts); this registry owns the curation
// and the copy. Adding a seam is ONE entry below, never new detection code.
//
// Curated on purpose. The engine makes adding a seam cheap; it does NOT license firing
// on every pair — most are noise and Vee would cry wolf (multiple comparisons). Only
// seams with a plausible mechanism live here, and each still has to clear its gate.
//
// The honesty contract for every `narrate`: show the receipts (the numbers), frame it
// as a CORRELATION and name a confound, never claim cause, never shame, never predict a
// bad day. One confident-but-wrong steer breaks trust for good.

interface SeamDef {
  id: string;
  /** Nudge domain — drives readout placement + the CARE_BOOST headline weight. */
  domain: Nudge['domain'];
  /** Pull the driver / outcome series (by date) from the briefing inputs. */
  driver: (d: BriefingInputs) => { date: string; value: number | null }[];
  outcome: (d: BriefingInputs) => { date: string; value: number | null }[];
  /** Detection spec: direction, lag, and the cry-wolf gate thresholds. */
  spec: SeamSpec;
  /** Bespoke, honest copy for a meaningful result. May return null to stay silent. */
  narrate: (s: SeamResult, d: BriefingInputs) => Omit<Nudge, 'domain'> | null;
}

// tired → eating: do you eat more on your lower-recovery days? (recovery ↓ → kcal ↑)
const tiredEatingSeam: SeamDef = {
  id: 'tired-eating',
  domain: 'nutrition',
  driver: (d) => d.sleep.entries.map((e) => ({ date: e.date, value: e.recovery })),
  outcome: (d) => d.nutritionDaily.map((k) => ({ date: k.date, value: k.kcal })),
  spec: { expect: 'neg', lag: 0, minDelta: 150 },
  narrate: (s, d) => {
    const lowAvgKcal = Math.round(s.outcomeAtLowDriver);
    const highAvgKcal = Math.round(s.outcomeAtHighDriver);
    const deltaKcal = lowAvgKcal - highAvgKcal;
    // Is TODAY one of the user's lower-recovery days? Then it's actionable right now.
    const todaysRecovery = d.sleep.entries[0]?.recovery ?? null;
    const todayIsLow = todaysRecovery != null && todaysRecovery <= Math.round(s.lowDriverAvg);
    // Morning AND evening fire — on a low day only say "plan" if the eating hasn't
    // largely happened yet; otherwise it'd scold after the fact.
    const target = d.nutrition.kcalTarget || 0;
    const mostlyEaten = target > 0 && d.nutrition.today.kcal >= target * 0.5;
    const todayLine = !todayIsLow
      ? ''
      : mostlyEaten
        ? ' Today reads low — no guilt about what you ate; just finish the day gently.'
        : ' Today reads low, so be kind to yourself and keep meals simple and satisfying.';
    // Always calm 'info' — a gentle mirror, never an alarm (Vitality's no-shame law).
    return {
      severity: 'info',
      title: todayIsLow
        ? `Heads up — on tired days you tend to eat ~${deltaKcal} kcal more`
        : `Pattern: you eat ~${deltaKcal} kcal more on your lower-recovery days`,
      detail:
        `Across ${s.nPaired} days, your most-tired days averaged ${lowAvgKcal} kcal vs ${highAvgKcal} on your freshest. ` +
        `Tired bodies reach for fuel — it's biology, not a failure.` +
        todayLine,
    };
  },
};

// caffeine → recovery: does recovery drop the morning AFTER heavier caffeine days?
// (caffeine ↑ → next-day recovery ↓; the +1-day lag is the point.)
const caffeineRecoverySeam: SeamDef = {
  id: 'caffeine-recovery',
  domain: 'peak',
  driver: (d) => (d.stimulantsDaily ?? []).map((x) => ({ date: x.date, value: x.caffeineMg })),
  outcome: (d) => d.sleep.entries.map((e) => ({ date: e.date, value: e.recovery })),
  spec: { expect: 'neg', lag: 1, minDelta: 5 },
  narrate: (s, d) => {
    const lowCaffeineMg = Math.round(s.lowDriverAvg);
    const highCaffeineMg = Math.round(s.highDriverAvg);
    const recoveryAfterLow = Math.round(s.outcomeAtLowDriver);
    const recoveryAfterHigh = Math.round(s.outcomeAtHighDriver);
    const deltaRecovery = recoveryAfterLow - recoveryAfterHigh;
    // Escalate to an actionable 'suggest' ONLY when today is genuinely heavy for THIS
    // user (≥ their own heaviest third) — a rare, real moment, never a daily nag.
    const todayHigh = d.peakStimulants.caffeineMgToday != null && d.peakStimulants.caffeineMgToday >= highCaffeineMg;
    // Honesty: a CORRELATION across two of their own series — could be reverse (tired
    // days → more coffee) or a shared confound. Mirror it, name the alternatives, and
    // frame the tip as an optional experiment, never a diagnosis.
    return {
      severity: todayHigh ? 'suggest' : 'info',
      title: todayHigh
        ? `Caffeine's high for you today — the morning after tends to read lower`
        : `Pattern: your recovery's tended to read ~${deltaRecovery} pts lower after higher-caffeine days`,
      detail:
        `Across ${s.nPaired} days, the mornings after your heaviest-caffeine days (~${highCaffeineMg} mg) ` +
        `averaged ${recoveryAfterHigh}% recovery vs ${recoveryAfterLow}% after your lightest (~${lowCaffeineMg} mg). ` +
        `These tend to move together for you — could be the caffeine, could be what those days share (a late night, hard training). ` +
        (todayHigh
          ? `If you're curious, make today's the last one before mid-afternoon and see if tomorrow's score budges.`
          : `Worth an experiment sometime — no pressure.`),
    };
  },
};

// Sleep hours per day for the sleep→mood seam: the wearable reading when present, else
// Sam's manual peak check-in (BUILD62) — so the seam works WITHOUT a wearable. When a
// day has both, the wearable wins (it's the truer measurement).
function sleepHoursByDate(d: BriefingInputs): { date: string; value: number | null }[] {
  const byDate = new Map<string, number>();
  for (const m of d.manualSleepDaily ?? []) {
    if (m.sleepHours > 0) byDate.set(m.date, m.sleepHours);
  }
  for (const e of d.sleep.entries) {
    if (e.sleepHours != null && e.sleepHours > 0) byDate.set(e.date, e.sleepHours); // wearable overrides manual
  }
  return [...byDate.entries()].map(([date, value]) => ({ date, value }));
}

// sleep → mood: does your mood read higher on your better-slept nights? (hours ↑ → mood ↑)
// Mood comes from explicit 1–5 taps + journal sentiment; sleep hours work for any band
// OR the manual check-in (no wearable needed). Gate is stricter — mood is noisy: minAbsR
// 0.3 AND a real p<0.05 significance test (cry-wolf-safe).
const sleepMoodSeam: SeamDef = {
  id: 'sleep-mood',
  domain: 'sleep',
  driver: (d) => sleepHoursByDate(d),
  outcome: (d) => d.moodDaily.map((m) => ({ date: m.date, value: m.mood })),
  // decimals: 1 → mood is judged + shown at one decimal (the gate matches the receipt).
  // significance: mood is noisy, so require a real p<0.05 correlation — never fire on a
  // few coincidental days (the cry-wolf law, the adversarial review's main hardening).
  spec: { expect: 'pos', lag: 0, minDelta: 0.5, minAbsR: 0.3, decimals: 1, significance: true },
  narrate: (s, d) => {
    const sleepLow = round(s.lowDriverAvg, 1);
    const sleepHigh = round(s.highDriverAvg, 1);
    const moodLow = round(s.outcomeAtLowDriver, 1);
    const moodHigh = round(s.outcomeAtHighDriver, 1);
    const deltaMood = round(s.delta, 1);
    // A night already slept can't be changed today — so this NEVER escalates and NEVER
    // predicts a bad day. At most, a gentle nudge of self-kindness after a short night.
    // Most recent night's hours from whichever source the user has — wearable first, else
    // the manual check-in — so a no-wearable user gets the grace note too.
    const wToday = d.sleep.entries[0]?.sleepHours ?? null;
    const mToday = d.manualSleepDaily?.[0]?.sleepHours ?? null;
    const todaysSleep = wToday != null && wToday > 0 ? wToday : mToday != null && mToday > 0 ? mToday : null;
    const shortLastNight = todaysSleep != null && todaysSleep <= s.lowDriverAvg;
    const graceLine = shortLastNight
      ? ` Last night ran short for you — be extra gentle with yourself today; some daylight or a short walk helps more than you'd think.`
      : '';
    return {
      severity: 'info',
      title: `Pattern: your mood runs ~${deltaMood}/5 higher on your better-slept nights`,
      detail:
        `Across ${s.nPaired} days, your best-slept nights (~${sleepHigh}h) averaged ${moodHigh}/5 mood ` +
        `vs ${moodLow}/5 after your shortest (~${sleepLow}h). ` +
        `These tend to move together — could be the sleep, could be what those nights share (a calmer day, less stress). ` +
        `Protecting your sleep is one of the kindest things you can do for how you feel.` +
        graceLine,
    };
  },
};

// The curated whitelist. Add a seam here (+ a migration for any new input it needs),
// never a new bespoke function.
const SEAM_REGISTRY: SeamDef[] = [tiredEatingSeam, caffeineRecoverySeam, sleepMoodSeam];

/**
 * Run every curated seam through the shared detector and collect the ones that clear
 * their cry-wolf gate, each narrated in its own honest voice. This is the single
 * cross-tile path in the briefing — adding a seam is a {@link SEAM_REGISTRY} entry,
 * not new code.
 */
function seamNudges(d: BriefingInputs): Nudge[] {
  const out: Nudge[] = [];
  for (const seam of SEAM_REGISTRY) {
    const s = detectSeam(seam.driver(d), seam.outcome(d), seam.spec);
    if (!s || !s.meaningful) continue;
    const copy = seam.narrate(s, d);
    if (copy) out.push({ domain: seam.domain, ...copy });
  }
  return out;
}

// ── Mind: a gentle reach-out when mood reads low (ties to "Vee notices slipping") ──
// Mood is now a number (explicit 1–5 taps + journal sentiment). When the recent
// stretch reads low or is clearly dipping, Vee reaches out first — warm, calm,
// never alarmed, never a diagnosis. Gated on enough days so it never over-reaches.
function moodNudges(moodDaily: MoodDay[]): Nudge[] {
  const t = moodTrend(moodDaily);
  if (!t) return [];
  // Reach out only when it's genuinely worth it: a low recent stretch, OR a dip
  // that's actually landed in not-great territory (a 5→4 dip while still fine stays
  // quiet — no reaching out to someone who's doing well).
  const worthReachingOut = t.low || (t.direction === 'down' && t.recentAvg <= 3.2);
  if (!worthReachingOut) return [];
  return [
    {
      domain: 'mind',
      severity: 'info',
      title: t.low ? "You've seemed low this week — I'm here" : "Your mood's been dipping lately",
      detail:
        `Over the last stretch your mood reads ~${t.recentAvg}/5` +
        (t.priorAvg != null ? ` (was ${t.priorAvg}/5)` : '') +
        `, across ${t.nDays} days you checked in or journaled. No pressure at all — whenever you want to talk it through, I'm right here.`,
    },
  ];
}

/**
 * Pure: shaped domain data → prioritized nudges. No I/O, no clock — the entire
 * nudge engine is exercised through here, so it can be unit tested without a
 * live Supabase. `buildBriefing` is just the I/O wrapper around it.
 */
export function assembleNudges(d: BriefingInputs): Nudge[] {
  const synthesis = synthesisNudge(d.sleep, d.workouts, d.todayKey);
  const nudges: Nudge[] = [
    ...(synthesis ? [synthesis] : []),
    ...sleepNudges(d.sleep),
    ...trainingNudges(d.sleep, d.workouts),
    ...nutritionNudges(d.nutrition),
    ...seamNudges(d),
    ...hydrationNudges(d.water),
    ...goalsNudges(d.goals),
    ...moodNudges(d.moodDaily),
    ...supplementsNudges(d.supplements),
    ...brandNudges(d.brand),
    ...businessNudges(d.business),
    ...stimulantNudges(d.peakStimulants),
    ...weightNudges(d.weights, d.profile, d.nutrition),
    ...subscriptionNudges(d.subs, d.todayKey),
    ...reminderNudges(d.notes),
    coverageNudge(),
  ];
  nudges.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return nudges;
}

/** Build the full daily briefing across every server-readable domain. */
export async function buildBriefing(v: VitalityDb): Promise<Briefing> {
  const todayKey = getLocalDateKey();
  // Recovery + nutrition fetched over a 30-day window so the cross-module engine
  // has enough paired days to read; single-domain nudges still slice the recent
  // 7/14 newest-first, so the wider window doesn't change them.
  const [profile, sleep, weights, nutrition, nutritionDaily, moodDaily, workouts, subs, water, goals, supplements, business, peakStimulants, brand, stimulantsDaily, manualSleepDaily, notes] = await Promise.all([
    getProfile(v),
    getSleep(v, 30),
    getWeights(v, 30),
    // Nutrition (4am) and supplements (6am) roll over later than midnight, so let
    // them use their own rollover defaults (not todayKey) — otherwise the briefing
    // would disagree with the app AND with the MCP's own writes during the early
    // morning window. The rest are genuinely midnight-keyed.
    getNutrition(v),
    getNutritionDaily(v, 30),
    getMoodDaily(v, 30),
    getWorkouts(v, 14),
    getSubscriptions(v),
    getWater(v, todayKey),
    getGoals(v, todayKey),
    getSupplements(v),
    getBusiness(v),
    getPeakStimulants(v, todayKey),
    getBrand(v, todayKey),
    getStimulantsDaily(v, 30),
    getManualSleepDaily(v, 30),
    getNotes(v, 5, 10),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    dayKey: todayKey,
    greetingName: profile.firstName,
    nudges: assembleNudges({ profile, sleep, weights, nutrition, nutritionDaily, moodDaily, workouts, subs, water, goals, supplements, business, peakStimulants, brand, stimulantsDaily, manualSleepDaily, notes, todayKey }),
  };
}

/** Render a briefing as readable text for an agent or terminal. */
export function renderBriefing(b: Briefing): string {
  const icon: Record<Severity, string> = { urgent: '🔴', suggest: '🟡', info: '·' };
  const lines: string[] = [];
  lines.push(`Vitality briefing — ${b.dayKey}${b.greetingName ? ` for ${b.greetingName}` : ''}`);
  lines.push('');
  for (const n of b.nudges) {
    lines.push(`${icon[n.severity]} [${n.domain}] ${n.title}`);
    lines.push(`    ${n.detail}`);
  }
  return lines.join('\n');
}
