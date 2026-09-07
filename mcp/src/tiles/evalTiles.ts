// The eval harness has two tables, both pure and IO-free:
//
//   1. EVAL_PROMPTS (evalPrompts) is the FLOOR test. Throw a spread of diverse,
//      real-world goals at the deterministic builder and confirm EVERY one comes out
//      Vitality-grade (zero errors, zero warnings), Fuel-grade rich, and packages
//      without the export door refusing it. Renders a scannable batch receipt so the
//      proof is visible, not merely asserted.
//
//   2. EVAL_CASES (evalCases) is the INFERENCE LOCK. A stricter table that pins the
//      exact {kind, template, unit, goalDirection, scaleMax} inference must keep
//      producing for a wide spread of plain-English goals (fluids, doses, physical
//      measures in metric + imperial, durations, money, ratings, habits, counts).
//      Every expectation is what infer() ACTUALLY returns today, so a future edit to
//      KIND_RULES, the unit maps, or the direction heuristics that silently
//      reclassifies a goal turns this red and names it.
//
// Together they are the safety net for the whole magic-wand: the floor guarantees
// grade, the lock guarantees the goal keeps mapping where it should.

import { scaffoldTile } from '../scaffoldTile.js';
import { buildUploadTile } from '../uploadTile.js';
import { infer, type UnitSystem } from './infer.js';
import { lintTile } from './lintTile.js';
import { richnessOf } from './richness.js';

export interface EvalRow {
  goal: string;
  template: string;
  kind: string;
  errors: number;
  warnings: number;
  exportable: boolean; // upload_tile's door did not refuse it
  rich: boolean; // clears the structural richness gate (not a thin single-number tile)
  grade: 'PASS' | 'WARN' | 'FAIL';
}

export interface EvalReport {
  rows: EvalRow[];
  total: number;
  clean: number; // zero errors AND zero warnings
  passing: number; // zero errors (may warn)
  richCount: number; // rows that clear the richness gate
  allClean: boolean;
  allRich: boolean; // every tile is both clean AND Fuel-grade rich
  receipt: string;
}

// Two dozen goals spanning every template and the messy ways people actually phrase
// things: downward habits, ratings out of 5 and 10, money in and out, plain nouns,
// hyphenated streaks. The builder is deterministic, so the inferred template need not
// be "perfect" for every phrase; what must hold is that the OUTPUT is Vitality-grade.
export const EVAL_PROMPTS: string[] = [
  'track my water',
  'beer tracker',
  'how many coffees today',
  'cold plunge tracker',
  'cigarettes smoked',
  'glasses of water',
  'meditation minutes',
  'reading time',
  'minutes outside',
  'screen time',
  'rate my mood out of 10',
  'sleep quality out of 5',
  'energy level',
  'log my weight',
  'body fat percentage',
  'resting heart rate',
  'steps walked today',
  'pushups',
  'gratitude entries',
  'track my daily spend',
  'how much did I save today',
  'did I read today',
  'took my vitamins',
  'no fap streak',
  // Inference-gap fixes: supplements read in a mass dose (creatine -> g, vitamins -> mg),
  // a gerund activity + "time" reads as a timer, "how many X" / serving nouns / a trailing
  // verb produce a clean unit, and a "how many ... did I ..." quantity is a count, not a
  // yes/no habit. Each must still build a clean, Fuel-grade tile.
  'track my creatine',
  'track my vitamins',
  'stretching time',
  'cups of matcha',
  'books read',
  'how many beers did I drink',
  // Coverage-hardening fixes (sleep in hours, subjective 1-10 levels, streak-as-habit,
  // net worth / expenses, percent, strength PRs + wearable vitals, an explicit target
  // ring, a compound goal). Each must still build a clean, Fuel-grade rich tile — the
  // new hours-mode timer, the ring hero, the target-aware chart, and the warm insight
  // line all sit inside the shared shell, so the floor holds.
  'hours of sleep',
  'stress level',
  'pain level',
  'workout streak',
  'net worth',
  'my expenses',
  'progress %',
  'squat 1rm',
  'glucose',
  '8 glasses of water',
  'read 20 pages',
  'weight and body fat',
];

function gradeOf(errors: number, warnings: number): EvalRow['grade'] {
  if (errors > 0) return 'FAIL';
  if (warnings > 0) return 'WARN';
  return 'PASS';
}

export function evalPrompts(goals: string[] = EVAL_PROMPTS): EvalReport {
  const rows: EvalRow[] = goals.map((goal) => {
    const { html, meta } = scaffoldTile({ goal });
    const r = lintTile(html);
    let exportable = true;
    try {
      buildUploadTile({ goal });
    } catch {
      exportable = false;
    }
    return {
      goal,
      template: meta.template,
      kind: meta.kind,
      errors: r.errors,
      warnings: r.warnings,
      exportable,
      rich: richnessOf(html).ok,
      grade: gradeOf(r.errors, r.warnings),
    };
  });

  const clean = rows.filter((x) => x.errors === 0 && x.warnings === 0).length;
  const passing = rows.filter((x) => x.errors === 0).length;
  const richCount = rows.filter((x) => x.rich).length;
  const allClean = clean === rows.length && rows.every((x) => x.exportable);
  const allRich = richCount === rows.length;

  return { rows, total: rows.length, clean, passing, richCount, allClean, allRich, receipt: renderReceipt(rows, clean, richCount) };
}

function renderReceipt(rows: EvalRow[], clean: number, richCount: number): string {
  const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));
  const head = `VITALITY-GRADE EVAL: ${clean}/${rows.length} clean (0 err, 0 warn), ${richCount}/${rows.length} Fuel-grade rich`;
  const lines = rows.map((x) => {
    const door = x.exportable ? 'export ok' : 'REFUSED';
    const rich = x.rich ? 'rich' : 'THIN';
    return `  ${pad(x.grade, 4)}  ${pad(rich, 4)}  ${pad(x.kind, 9)} ${pad(x.template, 8)}  ${pad(door, 9)}  ${x.goal}`;
  });
  return [head, ...lines].join('\n');
}

// ── The inference lock table ─────────────────────────────────────────────────────
// The floor test above proves every prompt builds a clean, rich, exportable tile.
// This second table is stricter: it pins the EXACT {kind, template, unit,
// goalDirection, scaleMax} the deterministic inference must keep producing for a
// spread of realistic, plain-English goals. If a future edit to the KIND_RULES,
// the unit maps, or the direction heuristics silently reclassifies one of these,
// this table turns red and names the goal.
//
// Every `expect` below was captured from what infer() ACTUALLY returns today (not
// what would be ideal). Where the current output is a known-imperfect compromise
// (a currency that is always the dollar sign, a habit-word that reads as a plain
// count), the case still locks the real behavior so any change is a deliberate,
// visible one rather than a silent regression. `unitSystem` defaults to metric.

export interface EvalCase {
  goal: string;
  unitSystem?: UnitSystem;
  expect: Partial<{
    kind: string;
    template: string;
    unit: string;
    goalDirection: string;
    scaleMax: number;
    currencySymbol: string;
    key: string;
    target: number;
  }>;
}

export interface CaseRow extends EvalCase {
  actual: { kind: string; template: string; unit: string; goalDirection?: string; scaleMax?: number; currencySymbol?: string; key: string; target?: number };
  mismatches: string[]; // empty means the row locked exactly
  ok: boolean;
}

export const EVAL_CASES: EvalCase[] = [
  // ── Fluids -> a serving noun, never the substance plural ──
  // "green tea"/"matcha"/"espresso" all resolve through the tea/coffee fluid rule
  // even on the plain count path, so the value reads in cups, not "teas".
  { goal: 'green tea tracker', expect: { kind: 'count', template: 'counter', unit: 'cups' } },
  { goal: 'track my green tea', expect: { kind: 'count', template: 'counter', unit: 'cups' } },
  { goal: 'track my espresso', expect: { kind: 'count', template: 'counter', unit: 'cups' } },
  { goal: 'protein shake', expect: { kind: 'count', template: 'counter', unit: 'glasses', goalDirection: 'up' } },
  { goal: 'glasses of milk', expect: { kind: 'intake', template: 'counter', unit: 'glasses' } },
  { goal: 'glasses of water', expect: { kind: 'intake', template: 'counter', unit: 'glasses', goalDirection: 'up' } },

  // ── Dose-style intake -> mass / energy units ──
  { goal: 'daily calories', expect: { kind: 'intake', template: 'counter', unit: 'kcal' } },
  { goal: 'track my caffeine', expect: { kind: 'intake', template: 'counter', unit: 'mg', goalDirection: 'down' } },
  { goal: 'sugar grams today', expect: { kind: 'intake', template: 'counter', unit: 'g', goalDirection: 'down' } },

  // ── Physical measures -> real, system-aware units, neutral direction ──
  { goal: 'resting heart rate', expect: { kind: 'measure', template: 'measure', unit: 'bpm', goalDirection: 'neutral' } },
  { goal: 'blood pressure', expect: { kind: 'measure', template: 'measure', unit: 'mmHg', goalDirection: 'neutral' } },
  { goal: 'log my body fat', expect: { kind: 'measure', template: 'measure', unit: '%', goalDirection: 'neutral' } },
  { goal: 'track my chest', expect: { kind: 'measure', template: 'measure', unit: 'cm', goalDirection: 'neutral' } },
  { goal: 'track my waist', expect: { kind: 'measure', template: 'measure', unit: 'cm', goalDirection: 'neutral' } },
  { goal: 'track my waist', unitSystem: 'imperial', expect: { kind: 'measure', template: 'measure', unit: 'in', goalDirection: 'neutral' } },
  { goal: 'neck circumference', unitSystem: 'imperial', expect: { kind: 'measure', template: 'measure', unit: 'in', goalDirection: 'neutral' } },
  { goal: 'log my height', expect: { kind: 'measure', template: 'measure', unit: 'cm', goalDirection: 'neutral' } },
  { goal: 'log my height', unitSystem: 'imperial', expect: { kind: 'measure', template: 'measure', unit: 'in', goalDirection: 'neutral' } },
  { goal: 'body temperature', expect: { kind: 'measure', template: 'measure', unit: '°C', goalDirection: 'neutral' } },
  { goal: 'body temperature', unitSystem: 'imperial', expect: { kind: 'measure', template: 'measure', unit: '°F', goalDirection: 'neutral' } },

  // ── Durations -> the timer, minutes ──
  { goal: 'cold shower minutes', expect: { kind: 'duration', template: 'timer', unit: 'min' } },
  { goal: 'sauna minutes', expect: { kind: 'duration', template: 'timer', unit: 'min' } },
  { goal: 'stretching minutes', expect: { kind: 'duration', template: 'timer', unit: 'min' } },
  { goal: 'reading time', expect: { kind: 'duration', template: 'timer', unit: 'min', goalDirection: 'up' } },

  // ── Money -> the money template. The `unit` field is always the dollar sign today
  //    (the money template reads the real currency off meta.currencySymbol, not the
  //    unit). The tile's printed symbol is now inferred from the goal text: an ISO
  //    code word or a symbol picks the currency, and a plain goal stays USD ('$').
  //    These lock that inference so any drift is a deliberate, visible change. ──
  { goal: 'daily spend', expect: { kind: 'money', template: 'money', unit: '$', goalDirection: 'down', currencySymbol: '$' } },
  { goal: 'track my GBP budget', expect: { kind: 'money', template: 'money', unit: '$', currencySymbol: '£' } },
  { goal: 'EUR spend today', expect: { kind: 'money', template: 'money', unit: '$', goalDirection: 'down', currencySymbol: '€' } },
  { goal: 'how much did I save in JPY', expect: { kind: 'money', template: 'money', unit: '$', currencySymbol: '¥' } },
  { goal: 'money earned today', expect: { kind: 'money', template: 'money', unit: '$', currencySymbol: '$' } },

  // ── Ratings -> the scale, with scaleMax following /10 vs the default 5 ──
  { goal: 'rate my sleep out of 10', expect: { kind: 'rating', template: 'scale', unit: 'rating', goalDirection: 'neutral', scaleMax: 10 } },
  { goal: 'soreness out of 10', expect: { kind: 'rating', template: 'scale', unit: 'rating', goalDirection: 'neutral', scaleMax: 10 } },
  { goal: 'rate my soreness', expect: { kind: 'rating', template: 'scale', unit: 'rating', goalDirection: 'neutral', scaleMax: 5 } },
  { goal: 'energy out of 5', expect: { kind: 'rating', template: 'scale', unit: 'rating', goalDirection: 'neutral', scaleMax: 5 } },

  // ── Habits -> the yes/no toggle ──
  { goal: 'took my supplements', expect: { kind: 'done', template: 'toggle', unit: 'done' } },
  { goal: 'did I floss today', expect: { kind: 'done', template: 'toggle', unit: 'done' } },
  { goal: 'quit smoking streak', expect: { kind: 'done', template: 'toggle', unit: 'done', goalDirection: 'down' } },
  { goal: 'pomodoros completed', expect: { kind: 'done', template: 'toggle', unit: 'done' } },

  // ── Counts -> the plain counter, plural-noun unit ──
  { goal: 'pushups', expect: { kind: 'count', template: 'counter', unit: 'pushups' } },
  { goal: 'track my situps', expect: { kind: 'count', template: 'counter', unit: 'situps' } },
  { goal: 'pomodoros', expect: { kind: 'count', template: 'counter', unit: 'pomodoros' } },
  { goal: 'books read', expect: { kind: 'count', template: 'counter', goalDirection: 'up' } },
  { goal: 'pages read', expect: { kind: 'count', template: 'counter', goalDirection: 'up' } },
  { goal: 'track my steps', expect: { kind: 'count', template: 'counter', unit: 'steps', goalDirection: 'up' } },
  // "cold plunge done" reads as a plain count today: the "done" WORD alone does not
  // trip the habit rule (which keys off "did i"/"complete"/"took my"...). Locked so a
  // future rule change that reclassifies it is visible.
  { goal: 'cold plunge done', expect: { kind: 'count', template: 'counter', unit: 'coldplunges' } },

  // ── Coverage-hardening: sleep + hours-aware duration ──
  // sleep / naps / fasting are an HOURS quantity (the timer renders an hours mode); an
  // explicit "minutes" still wins back to minutes.
  { goal: 'hours of sleep', expect: { kind: 'duration', template: 'timer', unit: 'h', target: 8 } },
  { goal: 'sleep tracker', expect: { kind: 'duration', template: 'timer', unit: 'h' } },
  { goal: '8 hours of sleep', expect: { kind: 'duration', template: 'timer', unit: 'h' } },
  { goal: 'nap minutes', expect: { kind: 'duration', template: 'timer', unit: 'min' } },
  { goal: 'fasting hours', expect: { kind: 'duration', template: 'timer', unit: 'h' } },
  // a rating imperative still wins over the sleep keyword
  { goal: 'rate my sleep out of 10', expect: { kind: 'rating', template: 'scale', unit: 'rating', scaleMax: 10 } },

  // ── Coverage-hardening: subjective 1-10 levels -> the rating scale ──
  { goal: 'stress level', expect: { kind: 'rating', template: 'scale', unit: 'rating', goalDirection: 'neutral', scaleMax: 5 } },
  { goal: 'pain level', expect: { kind: 'rating', template: 'scale', unit: 'rating', goalDirection: 'neutral', scaleMax: 5 } },
  { goal: 'anxiety level', expect: { kind: 'rating', template: 'scale', scaleMax: 5 } },
  { goal: 'confidence 1-10', expect: { kind: 'rating', template: 'scale', scaleMax: 10 } },
  // NEGATIVE guards: a non-subjective "level" must NOT become a mood dial
  { goal: 'water level', expect: { kind: 'intake', template: 'counter', unit: 'glasses' } },
  { goal: 'blood sugar level', expect: { kind: 'measure', template: 'measure', unit: 'mmol/L' } },

  // ── Coverage-hardening: any "…streak" is a daily habit toggle ──
  { goal: 'workout streak', expect: { kind: 'done', template: 'toggle', unit: 'done', goalDirection: 'up' } },
  { goal: 'reading streak', expect: { kind: 'done', template: 'toggle', unit: 'done' } }, // no longer a timer
  { goal: 'cold shower streak', expect: { kind: 'done', template: 'toggle', unit: 'done' } },

  // ── Coverage-hardening: net worth / investing / expenses -> money, up for growth ──
  { goal: 'net worth', expect: { kind: 'money', template: 'money', unit: '$', goalDirection: 'up', currencySymbol: '$' } },
  { goal: 'crypto portfolio', expect: { kind: 'money', template: 'money', goalDirection: 'up' } },
  { goal: 'my expenses', expect: { kind: 'money', template: 'money', unit: '$', key: 'expense' } },
  { goal: 'income', expect: { kind: 'money', template: 'money', goalDirection: 'up' } },

  // ── Coverage-hardening: percent / progress metrics -> a measure in % ──
  { goal: 'progress %', expect: { kind: 'measure', template: 'measure', unit: '%' } },
  { goal: 'project progress', expect: { kind: 'measure', template: 'measure', unit: '%' } },

  // ── Coverage-hardening: strength PRs + wearable vitals -> a real measure unit ──
  { goal: 'squat 1rm', expect: { kind: 'measure', template: 'measure', unit: 'kg' } },
  { goal: 'max deadlift', expect: { kind: 'measure', template: 'measure', unit: 'kg' } },
  { goal: 'hrv', expect: { kind: 'measure', template: 'measure', unit: 'ms' } },
  { goal: 'spo2', expect: { kind: 'measure', template: 'measure', unit: '%' } },
  { goal: 'glucose', expect: { kind: 'measure', template: 'measure', unit: 'mmol/L' } },
  // VO2 max is a recognized measure but has no honest fixed unit -> blank (never a plural)
  { goal: 'vo2 max', expect: { kind: 'measure', template: 'measure', unit: '' } },

  // ── Coverage-hardening: a compound "X and Y" keys on the FIRST metric, not "weightand" ──
  { goal: 'weight and body fat', expect: { kind: 'measure', template: 'measure', key: 'weight' } },
  { goal: 'sleep and mood', expect: { key: 'sleep' } },

  // ── Coverage-hardening: an explicit or keyword target seeds a goal ring ──
  { goal: '10000 steps', expect: { kind: 'count', template: 'counter', unit: 'steps', target: 10000 } },
  { goal: 'track my water', expect: { kind: 'intake', template: 'counter', unit: 'glasses', target: 8 } },
  { goal: 'read 20 pages', expect: { kind: 'count', template: 'counter', target: 20 } },
];

// Run every locked case through inference and diff it against its expectation.
export function evalCases(cases: EvalCase[] = EVAL_CASES): {
  rows: CaseRow[];
  total: number;
  locked: number; // rows that matched exactly
  allLocked: boolean;
} {
  const rows: CaseRow[] = cases.map((c) => {
    const m = infer(c.unitSystem ? { goal: c.goal, unitSystem: c.unitSystem } : { goal: c.goal });
    const actual = {
      kind: m.kind,
      template: m.template,
      unit: m.unit,
      key: m.key,
      ...(m.goalDirection ? { goalDirection: m.goalDirection } : {}),
      ...(m.scaleMax ? { scaleMax: m.scaleMax } : {}),
      ...(m.currencySymbol ? { currencySymbol: m.currencySymbol } : {}),
      ...(m.target !== undefined ? { target: m.target } : {}),
    };
    const mismatches: string[] = [];
    for (const [field, want] of Object.entries(c.expect)) {
      const got = (actual as Record<string, unknown>)[field];
      if (got !== want) mismatches.push(`${field}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
    }
    return { ...c, actual, mismatches, ok: mismatches.length === 0 };
  });
  const locked = rows.filter((r) => r.ok).length;
  return { rows, total: rows.length, locked, allLocked: locked === rows.length };
}
