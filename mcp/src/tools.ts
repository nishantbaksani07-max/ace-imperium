// Tool registration for the Vitality MCP — transport-agnostic.
//
// This is the heart of the server: every read tool, defined once. It is
// deliberately decoupled from HOW we authenticate. Instead of reaching for a
// process-wide singleton, each tool resolves its data client through the
// injected `getVdb` provider:
//
//   • stdio server (src/index.ts) passes `getDb` — one cached session for the
//     whole process (one local user), exactly as before.
//   • hosted route (app/api/mcp/*) will pass `() => Promise<VitalityDb>` that
//     resolves the CALLER's own RLS-scoped client, fresh per request, so one
//     process safely serves many users.
//
// Reads plus a small, append-only write surface (BUILD42+). Every write is
// gated on the `mcp:write` scope via requireWrite and runs RLS-scoped.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { WRITE_PAUSED_SCOPE, WRITE_SCOPE, type VitalityDb } from './supabase.js';
import { fmtHour, fmtKpi, getLocalDateKey, round } from './util.js';
import {
  getProfile,
  getSleep,
  getWeights,
  getNutrition,
  getWorkouts,
  getSubscriptions,
  getFinanceOverview,
  getNotes,
  getUserFacts,
  getPeakToday,
  getPeakStimulants,
  getVitalsGoal,
  getWater,
  getGoals,
  getSupplements,
  getBrand,
  getBusiness,
  getTiles,
} from './queries.js';
import type { BusinessMetric } from './queries.js';
import { buildBriefing, renderBriefing } from './nudges.js';
import { shapeStartMyDay } from './startMyDay.js';
import {
  classifyWeightRate,
  windowTrend,
  acuteLoad,
  consecutiveTrainingDays,
  recoveryAfterTraining,
  subscriptionBurn,
} from './insights.js';
import { addNote, logWeight, logMeal, logWater, logWorkout, markSupplementTaken, logBusinessMetric, addTile } from './mutations.js';
import { scaffoldTile } from './scaffoldTile.js';
import { buildUploadTile } from './uploadTile.js';
import { buildKit } from './tileKit.js';
import { checkTile } from './checkTile.js';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

const text = (t: string): ToolResult => ({ content: [{ type: 'text', text: t }] });

/** Strip the secret-shaped substrings a raw DB/connection error can carry (JWT keys,
 *  postgres connection strings, explicit `secret=value` assignments) and collapse it to
 *  one safe line before it reaches the model. Kept narrow on purpose: a deliberate,
 *  friendly message, even one that mentions a password requirement or links to a normal
 *  https page, passes through unchanged. The full, unredacted error still goes to stderr. */
export function sanitizeError(msg: string): string {
  return msg
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-token]')
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, '[redacted-url]')
    .replace(/\b(service_role|anon_key|password|secret|api[_-]?key)\b\s*=\s*\S+/gi, '$1=[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

/** Decorate a non-negative magnitude with a KPI's unit ($ / % / /wk / USD…). */
function fmtAmount(n: number, unit: string): string {
  const u = unit.trim();
  const abs = n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (u === '$') return `$${abs}`;
  if (/^(usd|gbp|eur|cad|aud)$/i.test(u)) return `${abs} ${u.toUpperCase()}`;
  if (u === '%' || u.startsWith('/')) return `${abs}${u}`;
  return u ? `${abs} ${u}` : abs;
}

/** One business KPI as a line: "Revenue: $12,000 (+$2,000 vs 7d)". */
function fmtBusinessMetric(m: BusinessMetric): string {
  const valStr = (m.value < 0 ? '-' : '') + fmtAmount(Math.abs(m.value), m.unit);
  let delta = '';
  if (m.delta7 != null && m.delta7 !== 0) {
    delta = ` (${m.delta7 > 0 ? '+' : '-'}${fmtAmount(Math.abs(m.delta7), m.unit)} vs 7d)`;
  }
  return `${m.label}: ${valStr}${delta}`;
}

/** A provider that yields the authenticated, RLS-scoped client for THIS caller. */
export type VdbProvider = () => Promise<VitalityDb>;

/**
 * Register every Vitality read tool on `server`, resolving data through `getVdb`.
 * Behaviour is identical regardless of transport — only the identity source
 * (which `getVdb` encapsulates) differs.
 */
export function registerTools(server: McpServer, getVdb: VdbProvider): void {
  /** Wrap a handler so auth/query failures return a clean tool error, not a crash. */
  const safe = (fn: () => Promise<string>) => async (): Promise<ToolResult> => {
    try {
      return text(await fn());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[vitality-mcp] tool error:', msg); // full detail to stderr
      return { content: [{ type: 'text', text: `Vitality error: ${sanitizeError(msg)}` }], isError: true };
    }
  };

  // ── whoami ──────────────────────────────────────────────────────────────────
  server.registerTool(
    'vitality_whoami',
    {
      annotations: { readOnlyHint: true },
      title: 'Who am I',
      description:
        'Profile + plan summary for the connected Vitality user: name, age, sex, units, goal, focus areas, and billing tier/subscription status. Call this first to ground every other answer.',
    },
    safe(async () => {
      const v = await getVdb();
      const p = await getProfile(v);
      const lines = [
        `Name: ${p.firstName ?? '(unset)'}`,
        `Sex/age: ${p.sex ?? '?'} / ${p.age ?? '?'}`,
        `Units: ${p.units ?? 'metric'}`,
        p.heightCm ? `Height: ${p.heightCm} cm` : null,
        p.startingWeightKg ? `Starting weight: ${p.startingWeightKg} kg` : null,
        `Goal: ${p.goal ?? '(none set)'}`,
        p.focusAreas.length ? `Focus areas: ${p.focusAreas.join(', ')}` : null,
        `Plan tier: ${p.tier ?? 'free'}${p.subscriptionStatus ? ` (${p.subscriptionStatus})` : ''}`,
        p.currentPeriodEnd ? `Current period ends: ${p.currentPeriodEnd}` : null,
        `Connection: ${v.mode === 'service' ? 'service-role (RLS bypassed — local only)' : 'user session (RLS-scoped)'}`,
      ].filter(Boolean);
      return lines.join('\n');
    }),
  );

  // ── daily briefing (the nudge engine) ─────────────────────────────────────────
  server.registerTool(
    'vitality_daily_briefing',
    {
      annotations: { readOnlyHint: true },
      title: 'Daily briefing',
      description:
        'Runs the nudge engine across every server-readable domain (sleep/recovery, training readiness, nutrition, weight, subscriptions, reminders) and returns a prioritized briefing: urgent, suggested, and info items. This is what a scheduled morning/evening agent should call. Also states what it cannot see (browser-only modules).',
    },
    safe(async () => {
      const v = await getVdb();
      const b = await buildBriefing(v);
      return renderBriefing(b);
    }),
  );

  // ── start my day (the Vee greeting) ────────────────────────────────────────
  server.registerTool(
    'vitality_start_my_day',
    {
      annotations: { readOnlyHint: true },
      title: 'Start my day',
      description:
        'Call this FIRST when opening a session for the person — the morning greeting. Greets them by name with a 3-second scannable read of their day (sleep/recovery, training, nutrition, hydration, goals, money) and the ONE insight that matters most right now, plus an optional one-tap offer backed by a real action. Returns finished, in-voice content — deliver it warmly as Vee, do not just list it. Use this instead of vitality_daily_briefing to OPEN a chat (daily_briefing is the raw prioritized list; this is the shaped greeting).',
    },
    safe(async () => {
      const v = await getVdb();
      const b = await buildBriefing(v);
      return shapeStartMyDay(b);
    }),
  );

  // ── sleep status ──────────────────────────────────────────────────────────────
  server.registerTool(
    'vitality_sleep_status',
    {
      annotations: { readOnlyHint: true },
      title: 'Sleep & recovery status',
      description:
        'Recent wearable sleep/recovery (Whoop/Oura/Fitbit), the computed recommended bedtime to hit the user\'s wake time and sleep need, plus 7-day-vs-prior trajectory for HRV, resting HR, and recovery (rising RHR / falling HRV flags accumulating stress or illness). Answers "when should I sleep?" and "am I trending better or worse?". days defaults to 14.',
      inputSchema: { days: z.number().int().min(1).max(60).optional().describe('How many days of history to read (default 14)') },
    },
    async ({ days }: { days?: number }): Promise<ToolResult> => {
      return safe(async () => {
        const v = await getVdb();
        const s = await getSleep(v, days ?? 14);
        const bedtime = s.prefs.wakeTime - s.prefs.sleepNeedHours;
        const lines: string[] = [
          `Recommended lights-out: ~${fmtHour(bedtime)} (wake ${fmtHour(s.prefs.wakeTime)}, need ${s.prefs.sleepNeedHours}h).`,
        ];
        if (!s.hasWearable) {
          lines.push('No wearable connected — connect Whoop/Oura/Fitbit for recovery-aware timing.');
          return lines.join('\n');
        }
        const recent = s.entries.slice(0, 7);
        const sleptVals = recent.map((e) => e.sleepHours).filter((x): x is number => x != null);
        if (sleptVals.length) {
          const avg = round(sleptVals.reduce((a, b) => a + b, 0) / sleptVals.length, 1);
          const debt = round(
            recent.reduce((acc, e) => acc + Math.max(0, s.prefs.sleepNeedHours - (e.sleepHours ?? s.prefs.sleepNeedHours)), 0),
            1,
          );
          lines.push(`Last ${sleptVals.length} nights: avg ${avg}h, sleep debt ~${debt}h vs need.`);
        }

        // 7-day-vs-prior trajectory — direction matters more than any single night.
        const hrvT = windowTrend(s.entries.map((e) => e.hrv), 7);
        const rhrT = windowTrend(s.entries.map((e) => e.rhr), 7);
        const recT = windowTrend(s.entries.map((e) => e.recovery), 7);
        const traj: string[] = [];
        if (hrvT && hrvT.direction !== 'flat') {
          traj.push(`HRV ${hrvT.direction} (${hrvT.priorAvg}→${hrvT.recentAvg}) — ${hrvT.direction === 'up' ? 'recovering well' : 'fatigue/stress building'}`);
        }
        if (rhrT && rhrT.direction !== 'flat') {
          traj.push(`resting HR ${rhrT.direction} (${rhrT.priorAvg}→${rhrT.recentAvg}) — ${rhrT.direction === 'down' ? 'good sign' : 'watch for under-recovery or illness'}`);
        }
        if (recT && recT.direction !== 'flat') {
          traj.push(`recovery ${recT.direction} (${recT.priorAvg}→${recT.recentAvg})`);
        }
        if (traj.length) {
          lines.push('', 'Trajectory (last 7 vs prior 7):', ...traj.map((t) => `  • ${t}`));
        }

        lines.push('');
        lines.push('Recent readings (newest first):');
        for (const e of recent) {
          lines.push(
            `  ${e.date} [${e.provider ?? '?'}] ` +
              [
                e.sleepHours != null ? `sleep ${round(e.sleepHours, 1)}h` : null,
                e.sleepPerf != null ? `perf ${e.sleepPerf}%` : null,
                e.recovery != null ? `recovery ${e.recovery}` : null,
                e.hrv != null ? `hrv ${e.hrv}` : null,
                e.rhr != null ? `rhr ${e.rhr}` : null,
                e.strain != null ? `strain ${e.strain}` : null,
              ]
                .filter(Boolean)
                .join(' · '),
          );
        }
        return lines.join('\n');
      })();
    },
  );

  // ── training readiness ─────────────────────────────────────────────────────────
  server.registerTool(
    'vitality_training_readiness',
    {
      annotations: { readOnlyHint: true },
      title: 'Training readiness',
      description:
        'Today\'s train/rest read from latest recovery (Peak/Solid/Tired/Low/Drained tiers), tempered by training LOAD: consecutive days trained and acute 7-day strain. Catches the "recovery says green but you\'ve trained 6 days straight" case. Answers "should I train hard today?".',
    },
    safe(async () => {
      const v = await getVdb();
      const [s, w] = await Promise.all([getSleep(v, 14), getWorkouts(v, 14)]);
      const rec = s.entries.find((e) => e.recovery != null)?.recovery ?? null;
      const lines: string[] = [];
      if (rec != null) {
        const tier =
          rec >= 80 ? 'Peak — push hard'
          : rec >= 65 ? 'Solid — train normal'
          : rec >= 50 ? 'Tired — keep it moderate'
          : rec >= 35 ? 'Low — light / active recovery'
          : 'Drained — rest';
        lines.push(`Recovery ${rec} → ${tier}.`);
      } else {
        lines.push('No recovery score available (Fitbit has no recovery metric; Whoop/Oura do). Train by feel.');
      }

      const submittedDates = w.entries.filter((e) => e.submitted).map((e) => e.date);
      const streak = consecutiveTrainingDays(submittedDates, getLocalDateKey());
      const load = acuteLoad(s.entries.map((e) => e.strain), 7);

      lines.push(`Sessions logged in the last 7 days: ${w.submittedLast7}.`);
      if (streak >= 2) lines.push(`Trained ${streak} day(s) in a row.`);
      if (load != null) lines.push(`Acute load: ~${load} total strain over the last 7 readings.`);

      // Load can override a green recovery light — fatigue compounds across days.
      if (streak >= 5 && (rec == null || rec >= 65)) {
        lines.push('⚠ 5+ consecutive training days — consider a deload or rest day even if recovery looks fine.');
      } else if (streak >= 3 && rec != null && rec < 50) {
        lines.push('⚠ Low recovery on top of back-to-back sessions — today is a strong rest/active-recovery candidate.');
      }

      if (w.entries[0]) lines.push(`Most recent: ${w.entries[0].dayName ?? 'session'} on ${w.entries[0].date} (${w.entries[0].setCount} sets).`);
      return lines.join('\n');
    }),
  );

  // ── nutrition today ──────────────────────────────────────────────────────────
  server.registerTool(
    'vitality_nutrition_today',
    {
      annotations: { readOnlyHint: true },
      title: "Today's nutrition",
      description:
        'Today\'s calories and protein vs target, meal count, recent daily averages, and a consistency read over the logged window: how many days landed on target vs under/over, and how often the protein target was hit. Reads the Fuel module (nutrition_goals + nutrition_meals).',
    },
    safe(async () => {
      const v = await getVdb();
      const n = await getNutrition(v);
      if (!n.onboarded) return 'Fuel (nutrition) is not set up yet for this user.';
      const a = n.adherence;
      const lines = [
        `Targets: ${n.kcalTarget} kcal, ${n.proteinTarget}g protein${n.goalOutcome ? ` (goal: ${n.goalOutcome})` : ''}.`,
        `Today: ${n.today.kcal} kcal, ${n.today.protein}g protein, ${n.today.carbs}g carbs, ${n.today.fat}g fat across ${n.today.mealCount} meal(s).`,
        n.today.names.length ? `Meals: ${n.today.names.join('; ')}.` : null,
        n.recentAvgKcal != null
          ? `Recent avg: ${n.recentAvgKcal} kcal${n.recentAvgProtein != null ? `, ${n.recentAvgProtein}g protein` : ''} over ${n.recentLoggedDays} logged day(s).`
          : null,
        a.loggedDays
          ? `Consistency: ${a.onTargetDays}/${a.loggedDays} days on target (±10%), ${a.daysUnder} under, ${a.daysOver} over; protein target hit ${a.proteinHitDays}/${a.loggedDays} days.`
          : null,
      ].filter(Boolean);
      return lines.join('\n');
    }),
  );

  // ── weight trend ──────────────────────────────────────────────────────────────
  server.registerTool(
    'vitality_weight_trend',
    {
      annotations: { readOnlyHint: true },
      title: 'Weight trend',
      description:
        'Weigh-in history with a least-squares weekly rate of change (steadier than first-vs-last) and a goal-aware verdict — whether the trend is on-track, too fast, stalled, or fighting the user\'s cut/bulk/maintain goal. Default window 30 days.',
      inputSchema: { days: z.number().int().min(7).max(365).optional().describe('Window in days (default 30)') },
    },
    async ({ days }: { days?: number }): Promise<ToolResult> => {
      return safe(async () => {
        const v = await getVdb();
        const [w, p] = await Promise.all([getWeights(v, days ?? 30), getProfile(v)]);
        if (!w.entries.length) return 'No weigh-ins recorded in this window.';
        const isImperial = p.units === 'imperial';
        const showKg = (kg: number) => (isImperial ? `${round(kg * 2.20462, 1)} lb` : `${round(kg, 1)} kg`);
        const lines = [`Latest: ${showKg(w.latestKg!)}.`];

        if (w.weeklyRate) {
          const a = classifyWeightRate(w.weeklyRate.kgPerWeek, w.latestKg, p.goal);
          const ratePerWeek = isImperial
            ? `${round(w.weeklyRate.kgPerWeek * 2.20462, 2)} lb/wk`
            : `${w.weeklyRate.kgPerWeek} kg/wk`;
          const sign = w.weeklyRate.kgPerWeek >= 0 ? '+' : '';
          lines.push(
            `Weekly rate: ${sign}${ratePerWeek}${a.pctPerWeek != null ? ` (${a.pctPerWeek >= 0 ? '+' : ''}${a.pctPerWeek}% BW/wk)` : ''} — fit over ${w.weeklyRate.spanDays}d from ${w.weeklyRate.n} weigh-ins.`,
          );
          lines.push(`Verdict: ${a.verdict}${a.goal ? ` (goal: ${a.goal})` : ''} — ${a.note}`);
        } else {
          lines.push('Need ≥2 weigh-ins on different days to compute a rate.');
        }
        if (w.deltaKg != null) {
          lines.push(`Raw change over ${w.windowDays}d: ${w.deltaKg >= 0 ? '+' : '-'}${showKg(Math.abs(w.deltaKg))} (${w.trend}).`);
        }
        lines.push('', 'Entries (newest first):', ...w.entries.slice(0, 14).map((e) => `  ${e.date}: ${showKg(e.kg)}${e.note ? ` — ${e.note}` : ''}`));
        return lines.join('\n');
      })();
    },
  );

  // ── subscriptions ──────────────────────────────────────────────────────────────
  server.registerTool(
    'vitality_subscriptions',
    {
      annotations: { readOnlyHint: true },
      title: 'Subscriptions',
      description:
        'All recurring subscriptions with monthly-normalized cost, total burn, trials ending soon, recent price hikes, and renewals due this week. Note: Vitality stores no usage signal, so "unused" cannot be auto-detected — this surfaces cost, trials, and price changes instead.',
    },
    safe(async () => {
      const v = await getVdb();
      const s = await getSubscriptions(v);
      if (!s.subs.length) return 'No subscriptions recorded (or finance not yet synced to the server).';
      const todayKey = getLocalDateKey();
      const lines = [
        `Total: ${s.totalMonthlyChf} CHF/mo (~${s.totalYearlyChf} CHF/yr) across ${s.subs.length}. Display currency ${s.currency}; figures in CHF.`,
        '',
        ...s.subs.map((sub) => {
          const flags = [
            sub.trialEnds ? `trial ends ${sub.trialEnds}` : null,
            sub.previousAmountChf != null && sub.amountChf > sub.previousAmountChf ? `↑ from ${sub.previousAmountChf}` : null,
            sub.renewal ? `renews ${sub.renewal}` : null,
          ].filter(Boolean);
          return `  ${sub.name}: ${sub.amountChf} CHF/${sub.period} (${sub.monthlyChf} CHF/mo)${flags.length ? ` — ${flags.join(', ')}` : ''}`;
        }),
        '',
        `Today is ${todayKey}. No last-used tracking exists — judge "worth keeping" yourself; the costliest are listed first.`,
      ];
      return lines.join('\n');
    }),
  );

  // ── finance overview ──────────────────────────────────────────────────────────
  server.registerTool(
    'vitality_finance_overview',
    {
      annotations: { readOnlyHint: true },
      title: 'Finance overview',
      description: 'Net worth, accounts (bank/stocks/crypto/other), upcoming orders/income not yet deducted, and annualized subscription burn as a share of net worth. All in canonical CHF.',
    },
    safe(async () => {
      const v = await getVdb();
      const [f, subs] = await Promise.all([getFinanceOverview(v), getSubscriptions(v)]);
      if (!f.accounts.length && !f.upcomingOrders.length && !subs.subs.length) return 'No finance data on the server yet for this user.';
      const lines = [
        `Net worth: ${f.netWorthChf} CHF (display currency ${f.currency}).`,
        '',
        'Accounts:',
        ...f.accounts.map((a) => `  [${a.type ?? '?'}] ${a.name ?? '?'}: ${a.amountChf} CHF${a.ticker ? ` (${a.shares ?? '?'} × ${a.ticker})` : ''}`),
      ];
      if (subs.subs.length) {
        const burn = subscriptionBurn(subs.totalMonthlyChf, f.netWorthChf);
        lines.push(
          '',
          `Subscription burn: ${subs.totalMonthlyChf} CHF/mo → ${burn.yearlyChf} CHF/yr across ${subs.subs.length}${burn.pctOfNetWorth != null ? ` (${burn.pctOfNetWorth}% of net worth per year)` : ''}.`,
        );
      }
      if (f.upcomingOrders.length) {
        lines.push('', 'Upcoming (not yet deducted):');
        for (const o of f.upcomingOrders) {
          lines.push(`  ${o.direction === 'in' ? '+' : '-'}${o.amountChf} CHF ${o.name ?? ''}${o.arrivalDate ? ` (≈${o.arrivalDate})` : ''}`);
        }
      }
      return lines.join('\n');
    }),
  );

  // ── recent workouts ─────────────────────────────────────────────────────────────
  server.registerTool(
    'vitality_recent_workouts',
    {
      annotations: { readOnlyHint: true },
      title: 'Recent workouts',
      description: 'Logged workout sessions over a window (default 14 days): day name, sets, whether submitted, cardio flag.',
      inputSchema: { days: z.number().int().min(1).max(90).optional().describe('Window in days (default 14)') },
    },
    async ({ days }: { days?: number }): Promise<ToolResult> => {
      return safe(async () => {
        const v = await getVdb();
        const w = await getWorkouts(v, days ?? 14);
        if (!w.entries.length) return 'No workouts logged in this window.';
        return [
          `${w.entries.length} session(s); ${w.submittedLast7} submitted in the last 7 days.`,
          '',
          ...w.entries.map(
            (e) => `  ${e.date} — ${e.dayName ?? 'session'}: ${e.exerciseCount} exercises, ${e.setCount} sets${e.hasCardio ? ' + cardio' : ''}${e.submitted ? '' : ' (in progress)'}`,
          ),
        ].join('\n');
      })();
    },
  );

  // ── hydration ──────────────────────────────────────────────────────────────────
  server.registerTool(
    'vitality_hydration',
    {
      annotations: { readOnlyHint: true },
      title: 'Hydration',
      description:
        "Today's water servings vs the computed target, recent daily average, and caffeine. Reads the water module (water_prefs + water_days — migrated from browser-only storage).",
    },
    safe(async () => {
      const v = await getVdb();
      const w = await getWater(v);
      if (!w.hasData) return 'No water data on the server yet (open the water tracker once to sync it).';
      const lines = [
        `Today: ${w.todayServings} ${w.unit}${w.targetServings != null ? ` of ~${w.targetServings} target` : ''}.`,
        w.recentAvgServings != null ? `Recent average: ${w.recentAvgServings} ${w.unit}/day.` : null,
        w.caffeineMgPerDay != null ? `Caffeine setting: ~${w.caffeineMgPerDay} mg/day.` : null,
      ].filter(Boolean);
      return lines.join('\n');
    }),
  );

  // ── goals / streak ─────────────────────────────────────────────────────────────
  server.registerTool(
    'vitality_goals',
    {
      annotations: { readOnlyHint: true },
      title: 'Goals & streak',
      description:
        "The user's goals: the BIG personal goals they're chasing (title, target date + days left, progress, priority, identity) plus the Duolingo-style streak and this-week habit goals (current/longest streak, due today, completed today, due tomorrow). Use this to know what the user is actually working toward and whether a deadline is near. Reads the authoritative vitality_goals + vitality_habit_goals + goals_streak tables.",
    },
    safe(async () => {
      const v = await getVdb();
      const g = await getGoals(v);
      if (!g.hasData) return 'No goals on the server yet (set a goal in the Goals section to sync it).';
      const lines: string[] = [];
      if (g.bigGoals.length) {
        lines.push(`Big goals (${g.bigGoals.length}):`);
        for (const bg of g.bigGoals) {
          const bits = [`• ${bg.title}`];
          if (bg.progress) {
            const unit = bg.progress.unit ? ` ${bg.progress.unit}` : '';
            bits.push(`— ${bg.progress.current}/${bg.progress.target}${unit} (${bg.progress.pct}%)`);
          }
          if (bg.targetDate) {
            const d = bg.daysUntilTarget;
            const when = d == null ? '' : d < 0 ? `, ${-d}d overdue` : d === 0 ? ', due today' : `, ${d}d left`;
            bits.push(`— target ${bg.targetDate}${when}`);
          }
          if (bg.priority === 'high') bits.push('[high priority]');
          if (bg.identityTag) bits.push(`(${bg.identityTag})`);
          lines.push(bits.join(' '));
        }
        lines.push('');
      }
      lines.push(`Streak: ${g.streakCurrent} day(s) (longest ${g.streakLongest}).`);
      lines.push(`This week: ${g.completedToday}/${g.dueToday} due-today done; ${g.activeGoals} habit goal(s) open.`);
      if (g.dueTodayGoals.length) lines.push(`Due today: ${g.dueTodayGoals.map((x) => x.title).join(', ')}.`);
      if (g.dueTomorrowGoals.length) lines.push(`Tomorrow: ${g.dueTomorrowGoals.map((x) => x.title).join(', ')}.`);
      return lines.join('\n');
    }),
  );

  // ── supplements ──────────────────────────────────────────────────────────────
  server.registerTool(
    'vitality_supplements',
    {
      annotations: { readOnlyHint: true },
      title: 'Supplements',
      description:
        "Supplement stack + how many taken today, plus any flagged running-low. Reads the supplements module (mirrored to Supabase). Uses the app's 6am day rollover, so a mark before 6am counts toward the day the app shows.",
    },
    safe(async () => {
      const v = await getVdb();
      const s = await getSupplements(v);
      if (!s.hasData) return 'No supplements data on the server yet (open the Supplements module once to sync it).';
      const lines = [
        `Taken today: ${s.takenToday}/${s.total}.`,
        s.lowCount ? `Running low: ${s.lowCount} item(s).` : null,
        s.names.length ? `Stack: ${s.names.join(', ')}.` : null,
      ].filter(Boolean);
      return lines.join('\n');
    }),
  );

  // ── brand ────────────────────────────────────────────────────────────────────
  server.registerTool(
    'vitality_brand',
    {
      annotations: { readOnlyHint: true },
      title: 'Brand / creator business',
      description:
        'Business briefing for the user\'s brands/ventures: names + count, total audience with 7-day follower momentum, manually-tracked KPIs (revenue, MRR, leads…) with target progress and 7/30-day deltas, and goals/milestones with live due-date countdowns (overdue flagged) plus wins completed this week. Reads the Brand module (mirrored to Supabase). Note: KPIs and follower counts are user-entered — there is no live earnings/analytics connector yet.',
    },
    safe(async () => {
      const v = await getVdb();
      const b = await getBrand(v);
      if (!b.hasData) return 'No brand data on the server yet (open the Brand module once to sync it).';

      const lines: string[] = [];
      if (b.brandCount > 0) {
        lines.push(`${b.brandCount} brand(s): ${b.names.join(', ') || '(unnamed)'}.`);
        const fd = b.followerDelta7;
        lines.push(
          `Total followers across linked accounts: ${b.totalFollowers.toLocaleString()}` +
            (fd != null ? ` (${fd >= 0 ? '+' : ''}${fd.toLocaleString()} over the last 7d).` : '.'),
        );
      }

      // Live connector metrics — real numbers synced from Stripe/Shopify/YouTube/etc.
      if (b.connectorMetrics.length) {
        lines.push('', `Connected sources (${b.connectorProviders.join(', ')}) — live:`);
        for (const m of b.connectorMetrics) {
          lines.push(`  • [${m.provider}] ${m.label}: ${fmtKpi(m.value, m.unit)}`);
        }
      }

      // KPIs — the manually-tracked business numbers.
      if (b.kpis.length) {
        lines.push('', 'Metrics:');
        for (const k of b.kpis) {
          const d7 = k.delta7 != null ? `, ${k.delta7 >= 0 ? '+' : ''}${fmtKpi(k.delta7, k.unit)} 7d` : '';
          const tgt =
            k.target != null
              ? ` — target ${fmtKpi(k.target, k.unit)}${k.pctToTarget != null ? ` (${k.pctToTarget}% there)` : ''}`
              : '';
          lines.push(`  • [${k.brand}] ${k.label}: ${fmtKpi(k.value, k.unit)}${d7}${tgt}`);
        }
      }

      // Goals — milestones with optional due-date timers.
      const open = b.goals.filter((g) => !g.done);
      if (open.length) {
        lines.push('', `Open goals (${b.openGoals}${b.overdueGoals ? `, ${b.overdueGoals} overdue` : ''}):`);
        for (const g of open.slice(0, 8)) {
          const when =
            g.daysLeft == null ? 'no due date'
            : g.daysLeft < 0 ? `⚠ ${Math.abs(g.daysLeft)}d overdue`
            : g.daysLeft === 0 ? 'due today'
            : `${g.daysLeft}d left`;
          lines.push(`  ○ [${g.brand}] ${g.title} — ${when}`);
        }
      }
      if (b.goalsDoneRecently) {
        lines.push('', `✓ ${b.goalsDoneRecently} goal(s) completed in the last 7 days.`);
      }
      return lines.join('\n');
    }),
  );

  // ── business overview (per-brand money/ops KPIs) ──────────────────────────────
  server.registerTool(
    'vitality_business_overview',
    {
      annotations: { readOnlyHint: true },
      title: 'Business overview',
      description:
        "The user's business numbers — each brand/venture's custom KPIs (revenue, MRR, leads, reviews, etc.) with a 7-day change. Universal: works for any business (the user, or Claude via the app, logs the numbers). Reads the per-brand Business view. Answers \"how's my business doing?\". Auto-pulled metrics from public pages land here too.",
    },
    safe(async () => {
      const v = await getVdb();
      const biz = await getBusiness(v);
      if (!biz.hasData) {
        return 'No business metrics tracked yet. Open a brand → Business tab and add a metric (or auto-pull from your site URL).';
      }
      const lines: string[] = [`Business — ${biz.ventures.length} venture(s) tracking numbers:`];
      for (const venture of biz.ventures) {
        lines.push('', `• ${venture.name}`);
        for (const m of venture.metrics) lines.push(`    ${fmtBusinessMetric(m)}`);
      }
      return lines.join('\n');
    }),
  );

  // ── notes / reminders ────────────────────────────────────────────────────────
  server.registerTool(
    'vitality_notes',
    {
      annotations: { readOnlyHint: true },
      title: 'Notes & reminders',
      description: 'Recent notes from the Mentor "void"/quick-jot inbox — often carry time-sensitive intent (events, reminders). days defaults to 10.',
      inputSchema: { days: z.number().int().min(1).max(60).optional().describe('Look-back window in days (default 10)') },
    },
    async ({ days }: { days?: number }): Promise<ToolResult> => {
      return safe(async () => {
        const v = await getVdb();
        const notes = await getNotes(v, days ?? 10, 25);
        if (!notes.length) return 'No notes in this window.';
        return notes.map((n) => `  • ${n.body}  (${n.createdAt.slice(0, 10)})`).join('\n');
      })();
    },
  );

  // ── durable user facts ──────────────────────────────────────────────────────────
  server.registerTool(
    'vitality_user_facts',
    {
      annotations: { readOnlyHint: true },
      title: 'Durable user facts',
      description: 'The shared mentor memory layer — durable facts about the user (hobbies, stressors, preferences, context), ranked by salience.',
    },
    safe(async () => {
      const v = await getVdb();
      const facts = await getUserFacts(v, 30);
      if (!facts.length) return 'No durable facts recorded yet.';
      return facts.map((f) => `  • (${f.kind ?? 'fact'}, ${f.source ?? '?'}, salience ${f.salience ?? '?'}) ${f.body}`).join('\n');
    }),
  );

  // ── peak schedule today ──────────────────────────────────────────────────────
  server.registerTool(
    'vitality_peak_today',
    {
      annotations: { readOnlyHint: true },
      title: "Today's schedule (Peak)",
      description: "Today's tasks and events from the Peak planner timeline, with times and done state.",
    },
    safe(async () => {
      const v = await getVdb();
      const [tasks, goal] = await Promise.all([getPeakToday(v), getVitalsGoal(v)]);
      const lines: string[] = [];
      if (goal) lines.push(`Active vitals goal: ${goal.direction} ${goal.metric}${goal.targetValue != null ? ` → ${goal.targetValue}` : ''} (confidence ${goal.confidence ?? '?'}).`, '');
      if (!tasks.length) {
        lines.push('No tasks or events scheduled for today.');
        return lines.join('\n');
      }
      for (const t of tasks) {
        const when = t.hour != null ? fmtHour(t.hour) + (t.endHour != null ? `–${fmtHour(t.endHour)}` : '') : 'anytime';
        lines.push(`  ${t.done ? '✓' : '○'} ${when} — ${t.title}${t.kind === 'event' ? ` [${t.eventType ?? 'event'}]` : ''}`);
      }
      return lines.join('\n');
    }),
  );

  // ── peak stimulants (substance log + subjective energy) ───────────────────────
  server.registerTool(
    'vitality_peak_stimulants',
    {
      annotations: { readOnlyHint: true },
      title: 'Stimulants & energy (Peak)',
      description:
        "Today's logged stimulants from the Peak tracker (caffeine etc.) with total caffeine mg and times, plus the most recent subjective energy dial (-100 foggy to +100 peak). Answers \"how much caffeine have I had?\", \"what have I taken today?\", \"how am I feeling?\". Caffeine timing also informs sleep advice. (\"Today\" is the server's calendar day; near midnight in a non-UTC timezone it may differ by a day from the app.)",
    },
    safe(async () => {
      const v = await getVdb();
      const s = await getPeakStimulants(v);
      if (!s.hasData) return 'No stimulants logged today and no recent energy reading (log them in Peak).';
      const lines: string[] = [];
      if (s.todayCount > 0) {
        lines.push(
          `${s.todayCount} stimulant(s) logged today${s.caffeineMgToday != null ? ` · ${Math.round(s.caffeineMgToday)} mg caffeine` : ''}.`,
        );
        for (const x of s.substances) {
          const dose = x.dose != null ? ` ${x.dose}${x.unit ? x.unit : ''}` : '';
          lines.push(`  • ${x.hour != null ? fmtHour(x.hour) : '—'} — ${x.name}${dose}`);
        }
      } else {
        lines.push('No stimulants logged today.');
      }
      if (s.latestEnergy) {
        const v2 = s.latestEnergy.value;
        const word = v2 > 33 ? 'peaking' : v2 < -33 ? 'foggy' : 'middling';
        lines.push(`Latest energy: ${v2 > 0 ? '+' : ''}${v2} (${word}), ${s.latestEnergy.hoursAgo}h ago.`);
      }
      if (s.tolerance != null) lines.push(`Caffeine tolerance set to ${s.tolerance}/10.`);
      return lines.join('\n');
    }),
  );

  // ── weekly recap (retrospective cross-domain) ─────────────────────────────────
  server.registerTool(
    'vitality_weekly_recap',
    {
      annotations: { readOnlyHint: true },
      title: 'Weekly recap',
      description:
        'A retrospective "week in review" across every server-readable domain: sessions trained, sleep average + debt, weight rate + goal verdict, nutrition consistency, goal streak, hydration — plus whether recovery bounces back better after rest than after training. The tool a scheduled weekly agent should call (vs daily_briefing for "today").',
    },
    safe(async () => {
      const v = await getVdb();
      const [p, sleep, weights, nutrition, workouts, goals, water, business] = await Promise.all([
        getProfile(v),
        getSleep(v, 14),
        getWeights(v, 30),
        getNutrition(v),
        getWorkouts(v, 14),
        getGoals(v),
        getWater(v),
        getBusiness(v),
      ]);
      const isImperial = p.units === 'imperial';
      const lines: string[] = [`Weekly recap — last 7 days through ${getLocalDateKey()}:`, ''];

      // Training + recovery-vs-training correlation.
      const submittedDates = workouts.entries.filter((e) => e.submitted).map((e) => e.date);
      const corr = recoveryAfterTraining(sleep.entries.map((e) => ({ date: e.date, recovery: e.recovery })), submittedDates);
      lines.push(`• Training: ${workouts.submittedLast7} session(s) in the last 7 days.`);
      if (corr) {
        const verb = corr.delta >= 0 ? 'higher' : 'lower';
        lines.push(`  Recovery ran ${Math.abs(corr.delta)} pts ${verb} after training days (${corr.afterTrainingAvg}) than after rest (${corr.afterRestAvg}).`);
      }

      // Sleep.
      const slept = sleep.entries.slice(0, 7).map((e) => e.sleepHours).filter((x): x is number => x != null);
      if (slept.length) {
        const avg = round(slept.reduce((a, b) => a + b, 0) / slept.length, 1);
        const debt = round(sleep.entries.slice(0, 7).reduce((acc, e) => acc + Math.max(0, sleep.prefs.sleepNeedHours - (e.sleepHours ?? sleep.prefs.sleepNeedHours)), 0), 1);
        lines.push(`• Sleep: avg ${avg}h over ${slept.length} night(s), debt ~${debt}h vs ${sleep.prefs.sleepNeedHours}h need.`);
      } else {
        lines.push('• Sleep: no wearable data this week.');
      }

      // Weight.
      if (weights.weeklyRate) {
        const a = classifyWeightRate(weights.weeklyRate.kgPerWeek, weights.latestKg, p.goal);
        const rate = isImperial ? `${round(weights.weeklyRate.kgPerWeek * 2.20462, 2)} lb/wk` : `${weights.weeklyRate.kgPerWeek} kg/wk`;
        lines.push(`• Weight: ${weights.weeklyRate.kgPerWeek >= 0 ? '+' : ''}${rate} — ${a.verdict}${a.goal ? ` vs ${a.goal} goal` : ''}.`);
      } else if (weights.latestKg != null) {
        lines.push(`• Weight: ${isImperial ? `${round(weights.latestKg * 2.20462, 1)} lb` : `${round(weights.latestKg, 1)} kg`} (need more weigh-ins to trend).`);
      }

      // Nutrition.
      if (nutrition.onboarded && nutrition.adherence.loggedDays) {
        const a = nutrition.adherence;
        lines.push(`• Nutrition: ${a.onTargetDays}/${a.loggedDays} days on calorie target, protein hit ${a.proteinHitDays}/${a.loggedDays} (avg ${a.avgKcal} kcal).`);
      }

      // Goals + hydration.
      if (goals.hasData) {
        let goalLine = `• Goals: ${goals.streakCurrent}-day streak (longest ${goals.streakLongest})`;
        const top = goals.bigGoals[0];
        if (top) {
          const d = top.daysUntilTarget;
          const when = top.targetDate && d != null ? (d < 0 ? `, ${-d}d overdue` : d === 0 ? ', due today' : `, ${d}d left`) : '';
          goalLine += `; top goal "${top.title}"${top.targetDate ? ` (target ${top.targetDate}${when})` : ''}`;
        }
        lines.push(goalLine + '.');
      }
      if (water.hasData && water.recentAvgServings != null) lines.push(`• Hydration: avg ${water.recentAvgServings} ${water.unit}/day.`);

      // Business — each venture's standout weekly move (largest % change).
      if (business.hasData) {
        for (const venture of business.ventures.slice(0, 3)) {
          const movers = venture.metrics
            .filter((m) => m.delta7 != null && m.delta7 !== 0)
            .map((m) => {
              const delta = m.delta7 as number;
              const baseline = m.value - delta;
              return { m, delta, pct: baseline !== 0 ? (delta / Math.abs(baseline)) * 100 : null };
            })
            .sort((a, b) => Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0));
          if (movers.length) {
            const { m, delta, pct } = movers[0];
            const pctStr = pct != null ? ` (${delta > 0 ? '+' : '-'}${Math.abs(Math.round(pct))}%)` : '';
            lines.push(`• Business — ${venture.name}: ${fmtBusinessMetric(m)}${pctStr ? `, ${m.label} ${delta > 0 ? 'up' : 'down'}${pctStr} this week` : ''}.`);
          } else {
            lines.push(`• Business — ${venture.name}: ${fmtBusinessMetric(venture.metrics[0])} (log updates to trend).`);
          }
        }
      }

      return lines.join('\n');
    }),
  );

  // ── WRITE TOOLS (require the mcp:write scope) ──────────────────────────────────
  // The first mutating tools. Each calls requireWrite() inside the mutation, so a
  // read-only connection gets a clear "reconnect granting write" error, never a
  // silent no-op. RLS still confines every write to the caller's own rows.

  // ── add note ───────────────────────────────────────────────────────────────────
  server.registerTool(
    'vitality_add_note',
    {
      annotations: { destructiveHint: true },
      title: 'Add a note',
      description:
        'WRITE. Append a note to the user\'s Mentor "void"/quick-jot inbox — the same place the app captures reminders and stray thoughts. Use it to save something the user asked you to remember. Requires a write-enabled connection.',
      inputSchema: { text: z.string().min(1).max(4000).describe('The note text to save') },
    },
    async ({ text: body }: { text: string }): Promise<ToolResult> => {
      return safe(async () => {
        const v = await getVdb();
        const n = await addNote(v, body);
        return `Saved to your notes${n.createdAt ? ` (${n.createdAt.slice(0, 10)})` : ''}: "${n.body}"`;
      })();
    },
  );

  // ── log weight ─────────────────────────────────────────────────────────────────
  server.registerTool(
    'vitality_log_weight',
    {
      annotations: { destructiveHint: true },
      title: 'Log a weigh-in',
      description:
        'WRITE. Record (or correct) a weigh-in. One entry per day — re-logging the same date overwrites it, matching the in-app tracker. Accepts kg or lb (defaults to the user\'s unit preference). Date defaults to today. Requires a write-enabled connection.',
      inputSchema: {
        weight: z.number().positive().describe('The body weight value'),
        unit: z.enum(['kg', 'lb']).optional().describe("Unit of `weight` (defaults to the user's profile unit)"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Local date YYYY-MM-DD (default today)'),
        note: z.string().max(500).optional().describe('Optional note for the weigh-in'),
      },
    },
    async ({ weight, unit, date, note }: { weight: number; unit?: 'kg' | 'lb'; date?: string; note?: string }): Promise<ToolResult> => {
      return safe(async () => {
        const v = await getVdb();
        const p = await getProfile(v);
        const resolvedUnit = unit ?? (p.units === 'imperial' ? 'lb' : 'kg');
        const kg = resolvedUnit === 'lb' ? weight / 2.20462 : weight;
        const w = await logWeight(v, kg, { date, note });
        const shown = resolvedUnit === 'lb' ? `${round(w.kg * 2.20462, 1)} lb` : `${round(w.kg, 1)} kg`;
        return `${w.replaced ? 'Updated' : 'Logged'} weigh-in for ${w.date}: ${shown}${w.note ? ` — ${w.note}` : ''}.`;
      })();
    },
  );

  // ── log meal ───────────────────────────────────────────────────────────────────
  server.registerTool(
    'vitality_log_meal',
    {
      annotations: { destructiveHint: true },
      title: 'Log a meal',
      description:
        'WRITE. Append a meal to the Fuel log with its macros (you/the user provide kcal + optional protein/carbs/fat and a description). Multiple meals per day are expected — this appends, never overwrites. Date defaults to today. Requires a write-enabled connection.',
      inputSchema: {
        kcal: z.number().min(0).max(20000).describe('Calories for the meal'),
        protein: z.number().min(0).max(2000).optional().describe('Protein grams'),
        carbs: z.number().min(0).max(2000).optional().describe('Carb grams'),
        fat: z.number().min(0).max(2000).optional().describe('Fat grams'),
        description: z.string().max(300).optional().describe('What the meal was'),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Local date YYYY-MM-DD (default today)'),
      },
    },
    async (args: { kcal: number; protein?: number; carbs?: number; fat?: number; description?: string; date?: string }): Promise<ToolResult> => {
      return safe(async () => {
        const v = await getVdb();
        const m = await logMeal(v, args);
        const t = m.totals;
        return `Logged meal for ${m.dayKey}: ${t.kcal} kcal · ${t.protein}g protein · ${t.carbs}g carbs · ${t.fat}g fat${m.description ? ` (${m.description})` : ''}.`;
      })();
    },
  );

  // ── log water ──────────────────────────────────────────────────────────────────
  server.registerTool(
    'vitality_log_water',
    {
      annotations: { destructiveHint: true },
      title: 'Log water',
      description:
        'WRITE. Add water servings to today\'s count (or another date). By default adds 1 serving; pass `servings` to add more (or a negative number to remove), or `setTo` to set an absolute count. Requires a write-enabled connection.',
      inputSchema: {
        servings: z.number().int().min(-100).max(100).optional().describe('Servings to add (default 1; negative removes)'),
        setTo: z.number().int().min(0).max(100).optional().describe('Set the day to this absolute count instead of adding'),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Local date YYYY-MM-DD (default today)'),
      },
    },
    async (args: { servings?: number; setTo?: number; date?: string }): Promise<ToolResult> => {
      return safe(async () => {
        const v = await getVdb();
        const w = await logWater(v, args);
        return `Water for ${w.date}: now ${w.count} serving(s) (${w.added >= 0 ? '+' : ''}${w.added}).`;
      })();
    },
  );

  // ── log workout ────────────────────────────────────────────────────────────────
  server.registerTool(
    'vitality_log_workout',
    {
      annotations: { destructiveHint: true },
      title: 'Log a workout',
      description:
        'WRITE. Record a completed training session: a day name (e.g. "Push") and a list of exercises (name + optional sets/reps/weight in kg). One session per day — re-logging the same date replaces it. Requires a write-enabled connection.',
      inputSchema: {
        dayName: z.string().min(1).max(60).describe('Session name, e.g. "Push", "Legs", "Upper"'),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Local date YYYY-MM-DD (default today)'),
        exercises: z
          .array(
            z.object({
              name: z.string().min(1).max(80).describe('Exercise name'),
              sets: z.number().int().min(1).max(20).optional().describe('Number of sets (default 3)'),
              reps: z.number().int().min(0).max(100).optional().describe('Reps per set'),
              weightKg: z.number().min(0).max(1000).optional().describe('Working weight in kg'),
            }),
          )
          .min(1)
          .max(40)
          .describe('The exercises performed'),
      },
    },
    async (args: { dayName: string; date?: string; exercises: { name: string; sets?: number; reps?: number; weightKg?: number }[] }): Promise<ToolResult> => {
      return safe(async () => {
        const v = await getVdb();
        const w = await logWorkout(v, args);
        return `${w.replaced ? 'Updated' : 'Logged'} ${w.dayName} on ${w.date}: ${w.exerciseCount} exercise(s), ${w.setCount} set(s).`;
      })();
    },
  );

  // ── mark supplement taken ──────────────────────────────────────────────────────
  server.registerTool(
    'vitality_mark_supplement_taken',
    {
      annotations: { destructiveHint: true },
      title: 'Mark supplement taken',
      description:
        'WRITE. Mark a supplement from the user\'s stack as taken (or untaken) for a day, by name or id. Pass `taken: false` to undo. Requires a write-enabled connection. Uses the app\'s 6am day rollover, so a mark before 6am lands on the day the app shows.',
      inputSchema: {
        name: z.string().min(1).max(80).optional().describe('Supplement name (e.g. "Creatine"); or use id'),
        id: z.string().min(1).max(80).optional().describe('Supplement id, if known'),
        taken: z.boolean().optional().describe('true to mark taken (default), false to undo'),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Local date YYYY-MM-DD (default today)'),
      },
    },
    async (args: { name?: string; id?: string; taken?: boolean; date?: string }): Promise<ToolResult> => {
      return safe(async () => {
        const v = await getVdb();
        const s = await markSupplementTaken(v, args);
        return `${s.taken ? 'Marked' : 'Unmarked'} ${s.name} as taken on ${s.dayKey}.`;
      })();
    },
  );

  // ── log business metric ─────────────────────────────────────────────────────
  server.registerTool(
    'vitality_log_business_metric',
    {
      annotations: { destructiveHint: true },
      title: 'Log a business metric',
      description:
        'WRITE. Log (or correct) a business number — a brand/venture\'s custom KPI (revenue, MRR, leads, reviews, etc.). Matches an existing metric by label (updates it + charts the change) or creates it if new. If the user has more than one business, pass `business` to disambiguate. Reads back via vitality_business_overview. Requires a write-enabled connection.',
      inputSchema: {
        metric: z.string().min(1).max(24).describe('Metric label, e.g. "Revenue", "MRR", "Leads", "Rating"'),
        value: z.number().describe('The metric value (a plain number — no currency symbols or commas)'),
        business: z.string().min(1).max(80).optional().describe('Business/brand name (required only if you track more than one)'),
        unit: z.string().max(12).optional().describe('Optional display unit, e.g. "$", "%", "/5"'),
      },
    },
    async (args: { metric: string; value: number; business?: string; unit?: string }): Promise<ToolResult> => {
      return safe(async () => {
        const v = await getVdb();
        const r = await logBusinessMetric(v, args);
        return `${r.created ? 'Logged' : 'Updated'} ${r.brand} · ${fmtBusinessMetric({ label: r.label, value: r.value, unit: r.unit, delta7: null })}.`;
      })();
    },
  );

  // ── connection (READ: what can this credential do?) ───────────────────────────
  // The proactive half of the read-only story: lets the caller's Claude check the
  // connection BEFORE building, so a read-only credential is guided to reconnect
  // with write access instead of quietly degrading to copy-paste. requireWrite in
  // mutations.ts is the reactive half (same guidance at write time), and both tell
  // the SAME three states apart: read+write, paused (the global kill-switch -
  // reconnecting cannot help), and genuinely read-only.
  server.registerTool(
    'vitality_connection',
    {
      annotations: { readOnlyHint: true },
      title: 'Check this connection\'s access level',
      description:
        'Report this Vitality connection\'s access level: read+write, temporarily paused (a server-side pause by the Vitality team - waiting is the only fix), or read-only. Call it BEFORE a build/log session (or when a write tool refuses) so you know whether the write tools (vitality_add_tile, upload_tile, the loggers) will work. If it reports read-only, relay its fix steps to the user and have them reconnect with write access; if paused, say so honestly and try again later. Never quietly fall back to handing them HTML to paste.',
      inputSchema: {},
    },
    safe(async () => {
      const v = await getVdb();
      if (v.scopes.includes(WRITE_SCOPE)) {
        return 'This Vitality connection has READ + WRITE access. Everything works: reads, logging, and vitality_add_tile / upload_tile land tiles straight on the dashboard with no copy-paste.';
      }
      if (v.scopes.includes(WRITE_PAUSED_SCOPE)) {
        // Mirrors requireWrite's paused copy: the pause is server-side, so
        // reconnect advice here would send the user into a loop that cannot help.
        return (
          'Writes are temporarily paused by the Vitality team, so nothing can be added or logged right now. ' +
          'Your data is safe and reading still works. The pause is on our side, so reconnecting will not change it. Try again in a little while.'
        );
      }
      return (
        'This Vitality connection is READ-ONLY: reads work, but logging and the tile-landing tools will refuse. ' +
        'Fix it in one step: disconnect the Vitality connector in your MCP client, then Allow it again - new connections are granted read and write by default. ' +
        '(Or connect from Claude Code with a Vitality CLI token from the /account page, which always carries full access.) ' +
        'Reconnect rather than falling back to copy-paste.'
      );
    }),
  );

  // ── my tiles (READ: the registry + board placement) ───────────────────────────
  server.registerTool(
    'vitality_my_tiles',
    {
      annotations: { readOnlyHint: true },
      title: 'List the user\'s tiles (board vs library)',
      description:
        'List every custom tile in the user\'s registry with its BOARD status: ON BOARD (placed on the dashboard, actively seen and logged) vs IN LIBRARY (removed from the board; it exists but is not active). Use this before reasoning about, editing, or building on "their tiles" so a removed tile is never treated as active - and to avoid building a duplicate of a tile they already have. Also shows each measurable tile\'s stream key/kind (its report identity) and, when declared at build time, its life bucket (goalCategory) and why-built note for Vee.',
      inputSchema: {},
    },
    safe(async () => {
      const v = await getVdb();
      const { tiles, boardKnown } = await getTiles(v);
      if (!tiles.length) return 'No custom tiles yet. scaffold_tile / vitality_add_tile can build the first one.';
      const mark = (onBoard: boolean | null): string =>
        onBoard === null ? 'PLACEMENT UNKNOWN' : onBoard ? 'ON BOARD' : 'IN LIBRARY (removed from the board - not active)';
      const lines = tiles.map((t) => {
        const stream = t.streamKey ? ` stream ${t.streamKey}/${t.streamKind ?? '?'}` : ' decorative (no stream)';
        const born = t.goalCategory ? `; life bucket ${t.goalCategory}` : '';
        const note = t.veeNote ? `; why built: "${t.veeNote}"` : '';
        return `  [${mark(t.onBoard)}] ${t.name}${t.category ? ` (${t.category})` : ''} - id ${t.id};${stream}${t.createdAt ? `; added ${t.createdAt.slice(0, 10)}` : ''}${born}${note}`;
      });
      const head = boardKnown
        ? `${tiles.length} tile(s). ON BOARD = live on the dashboard; IN LIBRARY = removed, not active.`
        : `${tiles.length} tile(s). Board placement is unknown for this account (the dashboard has not synced an arrangement yet), so do not assume any of these are active.`;
      return [head, '', ...lines].join('\n');
    }),
  );

  // ── add_tile (WRITE: build a tile and put it ON the dashboard) ────────────────
  // The automatic half of the build->dashboard loop. scaffold/upload RETURN a tile;
  // this one builds a floor-clean tile and INSERTS it into the user's tile registry,
  // so it appears on their dashboard with no copy-paste. Gated on mcp:write, RLS-scoped.
  // Targets the shared `tiles` table (docs/tiles-table-contract.md); until that table is
  // applied it fails with a clear "ask the dashboard to apply it" line.
  server.registerTool(
    'vitality_add_tile',
    {
      annotations: { destructiveHint: true },
      title: 'Add a tile to the dashboard',
      description:
        'WRITE. Build a finished, on-brand Vitality tile and put it straight onto the user\'s dashboard (their tile registry), no copy-paste. Use when the user says "add X to my dashboard" / "make me a Y tile". DEFAULT PATH: pass `goal` in plain English; it runs the same deterministic builder as scaffold_tile (full Vitality signature, floor-clean at 0 errors, no tokens spent, cannot break) and persists the tile. Right for essentially every tracker. ADVANCED PATH: only for what the templates cannot express (multi-metric, an AI bring-your-own-key chat, a bespoke multi-section layout or domain visual), hand-author from vitality_tile_kit, run check_tile to green, and pass it here as `html` (floor-enforced on the way in; an off-brand or unsealed tile is refused). Returns the new tile\'s id, name, and category. Requires a write-enabled connection: a read-only one gets one-step reconnect instructions - relay them to the user and try again; never quietly fall back to copy-paste.',
      inputSchema: {
        goal: z.string().min(1).max(300).optional().describe('What the tile tracks, in plain words. The DEFAULT: builds the deterministic, floor-clean Vitality template (full signature, live chart, report wired). Right for essentially every tracker. Omit only if you pass `html`.'),
        html: z.string().min(1).max(400000).optional().describe('ADVANCED. A ready-made sealed tile to add AS-IS, only for what the templates cannot express (multi-metric, AI chat, bespoke layout). Build it from vitality_tile_kit and pass check_tile first; it is floor-enforced on the way in. If the tile tracks a number or a done-mark, ALSO pass `kind`: that wires its stream registration and enforces the Vitality.report() call it must carry to feed Vee.'),
        check: z.string().min(8).max(64).optional().describe('The Proof value from this exact html\'s PASSING check_tile receipt. When it matches, the identical re-lint is skipped; absent or stale, the full lint runs. Only meaningful with `html`.'),
        kind: z.enum(['intake', 'count', 'duration', 'rating', 'measure', 'money', 'done']).optional().describe('The tile type. Goal path: overrides the inferred type. Html path: REQUIRED whenever the tile is measurable (tracks a number or a done-mark); it registers the tile\'s report stream and refuses html that lacks Vitality.report() wiring, so the tile cannot land dark.'),
        name: z.string().min(1).max(60).optional().describe('Tile title (also the dashboard display name); required-ish when passing html'),
        unit: z.string().min(1).max(24).optional().describe('Unit for the copy, e.g. "min", "kg", "glasses" (goal path)'),
        goalDirection: z.enum(['up', 'down', 'neutral']).optional().describe('Override whether up, down, or neither is the goal (goal path; on the html path it is stamped onto the registered stream when the tile\'s own report() does not declare one)'),
        currency: z.string().min(3).max(3).optional().describe("ISO 4217 currency code ('USD','GBP','EUR','JPY',…) for money tiles; prints its symbol instead of '$'. Auto-read from the user's finance preference when omitted (defaults to USD) (goal path)."),
        category: z.enum(['fitness', 'health', 'finance', 'mind', 'data']).optional().describe('Dashboard category (auto-filled from the tile type on the goal path; defaults to "data" for html)'),
        color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'color must be a 3- or 6-digit hex like #6EE7B7').optional().describe('Hex accent color (default mint #6EE7B7)'),
        goalCategory: z.string().max(20).optional().describe('Born classification: which of the nine life buckets this tile serves - fitness, health, mind, money, career, craft, audience, people, or general. Declare it whenever the purpose is clear (Vee\'s goal triage reads it - no scanning, no guessing). Case/whitespace near-misses are clamped to the bucket; anything outside the nine is dropped (the tile lands unclassified), never guessed.'),
        veeNote: z.string().min(1).max(200).optional().describe('One line for Vee: why this tile was built, in plain words (e.g. "tracks cold plunges to build morning discipline"). Stored on the tile so Vee has the intent forever.'),
      },
    },
    async (args: {
      goal?: string;
      html?: string;
      check?: string;
      kind?: 'intake' | 'count' | 'duration' | 'rating' | 'measure' | 'money' | 'done';
      name?: string;
      unit?: string;
      goalDirection?: 'up' | 'down' | 'neutral';
      currency?: string;
      category?: 'fitness' | 'health' | 'finance' | 'mind' | 'data';
      color?: string;
      goalCategory?: string;
      veeNote?: string;
    }): Promise<ToolResult> => {
      return safe(async () => {
        const v = await getVdb();
        const t = await addTile(v, args);
        return `Added "${t.name}" (${t.category}) to your Vitality Library. Open it here: http://localhost:3000/app?open=library - tap Place next to "${t.name}" to put it on your board. Give the user that link as a clickable line.`;
      })();
    },
  );

  // ── scaffold_tile (PURE builder: no DB, no getVdb) ────────────────────────────
  // The "sauce": one plain-English goal becomes one finished, themed, bridge-wired
  // Vitality tile. Deterministic — the caller's own Claude Code is the intelligence;
  // this guarantees the output is correct Vitality every time. Ignores getVdb.
  server.registerTool(
    'scaffold_tile',
    {
      annotations: { readOnlyHint: true },
      title: 'Build a Vitality tile',
      description:
        'The default tile builder. Start here for essentially any tracker ("beer tracker", "cold plunges", "reading minutes", "daily savings", "mood 1-5", "meditation done"). One plain-English goal becomes ONE finished, on-brand, full-grade tile in a single call: sealed self-contained HTML with the Vitality signature baked in (Instrument Serif hero number, eyebrow, status pill, a real section with a live 7-day chart / streak grid / rating week, honest empty state), 60fps motion, safe-area insets, and the bridge pre-wired (save/load + one Vitality.report() so it feeds Vee and lands on the dashboard, no keys/Supabase/Vercel). Deterministic: no LLM, no API key, no tokens spent, and it cannot break the floor because it is generated FROM the floor (passes check_tile at 0 errors). Seven kinds cover the common shapes (intake / count / duration / rating / measure / money / done); infer picks the kind and unit. Returns the inferred {key,label,kind,goalDirection,template}, a Vitality-grade receipt, then the HTML; edit it freely (re-run check_tile after). Do NOT read vitality_tile_kit first for a normal tracker; this call already IS on-brand. Reach for the kit only to hand-author something the templates cannot express (multi-metric, an AI bring-your-own-key chat, a bespoke multi-section layout or domain visual).',
      inputSchema: {
        goal: z.string().min(1).max(300).describe('What the tile tracks, in plain words'),
        kind: z.enum(['intake', 'count', 'duration', 'rating', 'measure', 'money', 'done']).optional().describe('Override the inferred tile type'),
        name: z.string().min(1).max(60).optional().describe('Override the tile title/label'),
        unit: z.string().min(1).max(24).optional().describe('Unit for the copy, e.g. "min", "kg", "glasses"'),
        goalDirection: z.enum(['up', 'down', 'neutral']).optional().describe('Override whether up, down, or neither is the goal'),
        unitSystem: z.enum(['metric', 'imperial']).optional().describe("The user's measurement preference; flips physical units (kg/lb, km/mi, cm/in). Pass what vitality_profile reports so weight/distance read in their units. Defaults to metric."),
        currency: z.string().min(3).max(3).optional().describe("The user's currency as an ISO 4217 code ('USD','GBP','EUR','JPY',…). Money tiles print its symbol ($/£/€/¥) instead of a hardcoded '$'. Defaults to USD."),
      },
    },
    async (args: {
      goal: string;
      kind?: 'intake' | 'count' | 'duration' | 'rating' | 'measure' | 'money' | 'done';
      name?: string;
      unit?: string;
      goalDirection?: 'up' | 'down' | 'neutral';
      unitSystem?: 'metric' | 'imperial';
      currency?: string;
    }): Promise<ToolResult> => {
      try {
        return text(scaffoldTile(args).text);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Vitality error: ${sanitizeError(msg)}` }], isError: true };
      }
    },
  );

  // ── upload_tile (WRITE: build + post through the Library upload socket) ────────
  // The Library upload socket, server side (brick 3 of the platform): builds the
  // same envelope as before, but now POSTS it straight into the user's tile
  // registry via addTile (RLS-scoped, mcp:write-gated, floor-enforced), so the
  // tile auto-lands on the dashboard exactly like vitality_add_tile. The pure
  // packager behavior survives behind {package_only:true} for hand-carrying the
  // envelope in through the dashboard's "Add a tile" door (its paste box takes
  // the envelope and raw HTML alike - see PASTE_INSTRUCTIONS in scaffoldTile.ts).
  // See docs/tile-upload-contract.md.
  server.registerTool(
    'upload_tile',
    {
      annotations: { destructiveHint: true },
      title: 'Build a tile and post it onto the dashboard',
      description:
        'Build a tile from a plain-English goal and POST it straight onto the user\'s dashboard through the Library upload socket - no copy-paste. Same deterministic full-grade builder as scaffold_tile (no kit read, no tokens spent); numbers auto-label in the user\'s own units and currency. Category/color auto-fill from the tile and are overridable. Gated on the Vitality floor: a hard lint error REFUSES (error names the rule) rather than land something off-brand or unsealed; polish warnings never block. Requires a write-enabled connection: a read-only one gets one-step reconnect instructions - relay them and try again; never quietly fall back to copy-paste. Pass package_only:true (rare) to skip the dashboard write and get the raw upload envelope JSON to paste in through the dashboard\'s "Add a tile" door instead.',
      inputSchema: {
        goal: z.string().min(1).max(300).describe('What the tile tracks, in plain words'),
        kind: z.enum(['intake', 'count', 'duration', 'rating', 'measure', 'money', 'done']).optional().describe('Override the inferred tile type'),
        name: z.string().min(1).max(60).optional().describe('Override the tile title (also the Library display name)'),
        unit: z.string().min(1).max(24).optional().describe('Unit for the copy, e.g. "min", "kg", "glasses"'),
        goalDirection: z.enum(['up', 'down', 'neutral']).optional().describe('Override whether up, down, or neither is the goal'),
        category: z.enum(['fitness', 'health', 'finance', 'mind', 'data']).optional().describe('Library category (auto-filled from the tile type if omitted)'),
        color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'color must be a 3- or 6-digit hex like #6EE7B7').optional().describe('Hex accent color (default mint #6EE7B7)'),
        design: z.string().min(1).max(40).optional().describe('Optional design hint; the Library resolves it to its catalog'),
        goalCategory: z.string().max(20).optional().describe('Born classification: which of the nine life buckets this tile serves - fitness, health, mind, money, career, craft, audience, people, or general. Declare it whenever the purpose is clear (Vee\'s goal triage reads it - no scanning, no guessing). Case/whitespace near-misses are clamped to the bucket; anything outside the nine is dropped (the tile lands unclassified), never guessed.'),
        veeNote: z.string().min(1).max(200).optional().describe('One line for Vee: why this tile was built, in plain words. Stored on the tile so Vee has the intent forever.'),
        package_only: z.boolean().optional().describe('Skip the dashboard write and return the raw upload-envelope JSON instead (to paste in via the dashboard\'s "Add a tile" door). Rare; the default posts the tile straight onto the board.'),
      },
    },
    async (args: {
      goal: string;
      kind?: 'intake' | 'count' | 'duration' | 'rating' | 'measure' | 'money' | 'done';
      name?: string;
      unit?: string;
      goalDirection?: 'up' | 'down' | 'neutral';
      category?: 'fitness' | 'health' | 'finance' | 'mind' | 'data';
      color?: string;
      design?: string;
      goalCategory?: string;
      veeNote?: string;
      package_only?: boolean;
    }): Promise<ToolResult> => {
      // The explicit escape hatch: pure packager, no DB touched (the pre-brick-3
      // behavior, kept for hand-carrying the envelope in via the "Add a tile"
      // door - its paste text comes from the shared PASTE_INSTRUCTIONS).
      if (args.package_only) {
        try {
          return text(buildUploadTile(args).text);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { content: [{ type: 'text', text: `Vitality error: ${sanitizeError(msg)}` }], isError: true };
        }
      }
      // The socket: same floor-enforced build, then the row lands in the user's
      // registry (addTile also resolves their units/currency, checks mcp:write
      // with the reconnect guidance, and rate-limits) - identical to add_tile.
      return safe(async () => {
        const v = await getVdb();
        const t = await addTile(v, args);
        return `Posted "${t.name}" (${t.category}) straight onto your dashboard through the Library upload socket - no paste needed. Open Vitality and it lands placed on your board (it also syncs to your other devices). Its report stream is pre-wired, so Vee starts reading it as soon as you log in the tile.`;
      })();
    },
  );

  // ── vitality_tile_kit (PURE — serves the captured Vitality DNA pack) ───────────
  // The payoff: before building a tile, the caller's Claude pulls Vitality's design
  // DNA, data libraries (food/lifts/supplements), API recipes, and the hard-won
  // gotchas rulebook, so the tile is on-brand, knows the domain, and avoids the bugs
  // already fixed over two months. This is what makes the MCP overpowered vs plain
  // Claude Code. Reads files under mcp/{dna,data,recipes,lessons}. Ignores getVdb.
  server.registerTool(
    'vitality_tile_kit',
    {
      annotations: { readOnlyHint: true },
      title: 'Vitality tile kit (design DNA, data, fixes)',
      description:
        'OPT-IN, for HAND-AUTHORED tiles only. For a normal tracker use scaffold_tile / vitality_add_tile with a plain goal: that path is already on-brand and floor-clean and spends no tokens here. Reach for this kit ONLY to hand-write a tile the templates cannot express (multi-metric, an AI bring-your-own-key chat, a bespoke multi-section layout or domain visual). It serves Vitality\'s design DNA, data libraries (real foods, lifts, supplements), API recipes, and the distilled bug-fix rules so the tile comes out on-brand and dodges bugs already fixed. No args = lean orientation (value + top-rules digest + section list). Then {domain:"food|workout|supplement|vee|finance|vitals|goals|quiz"} for a focused bundle (base look + that domain\'s data + recipes, the usual read); add {lean:true} for the lightest bundle that still clears the floor. Or {section:"<name>"} for one file. For the ceiling pattern read a sealed 0/0 example and swap its domain: {section:"example-markets-tile"} (finance) or {section:"example-workout-tile"} (workout). The base ships lean motion-core/icons-core; pull {section:"motion"} or {section:"icons"} for the full set, and {section:"gotchas"} for a rule\'s reasoning or the overlay/chart/form rules. {full:true} is rarely worth it. Finish with check_tile.',
      inputSchema: {
        domain: z.string().max(40).optional().describe('Tile domain for a focused bundle: food, workout, supplement, vee, finance, vitals, goals, quiz. The usual read.'),
        lean: z.boolean().optional().describe('With {domain}, serve the lightest bundle (top rules + theme + components + the domain\'s data + sealed example) instead of the full base. check_tile still enforces the whole floor.'),
        section: z.string().max(60).optional().describe('A single reference section by name, e.g. theme, motion, motion-core, icons, icons-core, gotchas, gotchas-top, food-library, exercise-library, example-workout-tile, example-markets-tile'),
        full: z.boolean().optional().describe('Rarely needed. The entire pack (~70K tokens). A {domain:...} bundle already covers a build; requires {confirm:true} to actually return it.'),
        confirm: z.boolean().optional().describe('Set with full:true to acknowledge the ~70K-token cost and return the whole pack.'),
      },
    },
    async (args: { domain?: string; section?: string; full?: boolean; confirm?: boolean; lean?: boolean }): Promise<ToolResult> => {
      try {
        return text(buildKit(args));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Vitality error: ${sanitizeError(msg)}` }], isError: true };
      }
    },
  );

  // ── check_tile (PURE — the quality gate / magic-wand loop) ────────────────────
  // Run any finished tile HTML (scaffolded OR hand-authored by the caller's Claude)
  // through the Vitality linter and return a pass/fail receipt with every rule it
  // breaks. This is what turns ~80 advisory rules into a hard floor: the caller
  // iterates to green before shipping. Ignores getVdb.
  server.registerTool(
    'check_tile',
    {
      annotations: { readOnlyHint: true },
      title: 'Check a tile against the Vitality floor',
      description:
        'Lint a finished tile\'s HTML against Vitality\'s hard floor (sealed isolation, local date keys, buttery 60fps motion (transform/opacity only, never layout props), no emoji or em dashes, on-brand tokens, contract-valid report() shape) and return a "Vitality-grade" receipt: PASS or FAIL with the exact rule each problem breaks and how to fix it. ALWAYS call this after you build or edit a tile by hand, and fix every error until it passes, before you hand the tile back or upload it. A PASSING receipt includes a Proof value: pass it to vitality_add_tile as `check` with the identical html and the re-lint is skipped.',
      inputSchema: {
        html: z.string().min(1).max(400000).describe('The complete tile HTML to check'),
      },
    },
    async ({ html }: { html: string }): Promise<ToolResult> => {
      try {
        return text(checkTile(html).text);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Vitality error: ${sanitizeError(msg)}` }], isError: true };
      }
    },
  );
}
