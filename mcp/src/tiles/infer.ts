// Pure, deterministic inference for scaffold_tile: read a plain-English goal and
// derive {key,label,kind,goalDirection,unit,template}. Every field is overridable
// by an explicit input. No LLM, no IO. Keyword-driven, with `count` as the fallback.

import type { ReportKind, GoalDirection } from './reportContract.js';

export type TemplateName = 'counter' | 'timer' | 'scale' | 'measure' | 'money' | 'toggle';

export interface TileMeta {
  key: string;
  label: string;
  kind: ReportKind;
  goalDirection?: GoalDirection;
  unit: string;
  template: TemplateName;
  scaleMax?: number;
  /** The symbol a money tile prints before its numbers ($, £, €, ¥, or the ISO
   *  code for a currency with no short symbol). Only set on money tiles. */
  currencySymbol?: string;
  /** The daily/session goal a counting tile aims at (8 glasses, 30 min, 10000
   *  steps). Only set for the ADDITIVE kinds (counter/timer/intake) where a target
   *  is honest — measure keeps a direction-only trend, money a ledger, scale/done a
   *  yes-no. When present the tile draws a progress ring + a target-aware chart. */
  target?: number;
}

export type UnitSystem = 'metric' | 'imperial';

export interface InferInput {
  goal: string;
  kind?: ReportKind;
  name?: string;
  unit?: string;
  goalDirection?: GoalDirection;
  /** The user's measurement preference; flips physical units (kg/lb, cm/in, km/mi).
   *  Defaults to metric. On the dashboard path this is read from the user's profile. */
  unitSystem?: UnitSystem;
  /** The user's currency as an ISO 4217 code ('USD','GBP','EUR','JPY',…). Money tiles
   *  print its symbol instead of a hardcoded '$'. Defaults to 'USD'. On the dashboard
   *  path this is read from the user's profile (finance prefs). */
  currency?: string;
  /** An explicit daily/session goal for a counting tile (overrides inference). Only
   *  meaningful for the additive kinds (counter/timer/intake). */
  target?: number;
}

const KIND_TO_TEMPLATE: Record<ReportKind, TemplateName> = {
  intake: 'counter',
  count: 'counter',
  duration: 'timer',
  rating: 'scale',
  measure: 'measure',
  money: 'money',
  done: 'toggle',
};

// Checked in this order; `count` is the fallback. Matching on a lowercased goal.
// `done` is checked before `duration` so "did I read today" reads as a habit, not a timer.
const KIND_RULES: Array<[ReportKind, RegExp]> = [
  // `\bsave\b` (not just saving/savings) so "how much did I save today" reads as money,
  // not a yes/no habit; bare `spent` dropped so "time spent reading" is a duration, not
  // money (the `spend` substring still covers spend/spending/spends). Net worth,
  // portfolio, investing and expenses are finance too (they were falling to `count`
  // and reading "networths"/"expens").
  ['money', /\$|money|spend|\bsave\b|budget|cost|saving|savings|dollars?|paid|income|earn|revenue|net ?worth|portfolio|invest|\bstocks?\b|\bcrypto\b|expenses?/],
  // `\bstreak\b` makes any "…streak" goal a daily yes/no habit (the streak-grid
  // template), which is what a streak IS. Checked before `duration`, so
  // "reading streak"/"meditation streak" become habits instead of timers.
  ['done', /did i|yes\/?no|habit|complete|stick to|took my|no[- ]?fap|abstain|quit|\bstreak\b/],
  // `reading\b` only (bare `read\b` dropped) so "pages read"/"books read" count, not time.
  // `\w+ing time\b` reads a gerund-activity duration ("stretching time", "studying time")
  // as a timer, without catching non-activity "time" uses ("bed time", "me time", "on time")
  // which never end in "-ing time". `sleep|slept|nap|fasting` are hours-scale durations
  // (the timer template renders them in an hours mode; see inferUnit).
  ['duration', /minutes?|\bmins?\b|hours?|duration|meditat|reading\b|how long|session|screen time|\w+ing time\b|sleep|slept|\bnap\b|fasting/],
  // Rating "rate" is anchored to the imperative ("rate my mood") so it stops swallowing
  // "heart rate"/"rate of weight loss", which belong to measure (added below). A
  // subjective adjective + "level" ("stress level", "pain level") and a 1-10 phrasing
  // ("confidence 1-10") are 1-N dials too; the level list is explicit so "water level"
  // / "blood sugar level" are NOT swept into a mood dial.
  ['rating', /rate (my|your|the|this|today|it)|rating|score|mood|energy|\/10|\/5|out of (ten|10|five|5)|quality|satisfaction|\b(?:stress|anxiety|pain|energy|focus|motivation|confidence|hunger|happiness|soreness|mood)\b[a-z ]*\blevel\b|1 ?- ?10|1 to 10/],
  // Percent/progress metrics and strength PRs / wearable vitals are physical measures
  // with real units (see MEASURE_UNITS). `glucose|blood sugar` moved here (out of the
  // `sugar` intake path) so a blood-sugar tile is a measure, not a gram dose.
  ['measure', /weight|\bkg\b|\blbs?\b|pounds?|\bcm\b|measure|body ?fat|blood pressure|heart rate|\bpulse\b|distance|\bkm\b|miles?|waist|\bchest\b|\bhips?\b|thigh|\bneck\b|circumference|height|how tall|temperature|percent|progress|completion|\b%\b|1 ?rm\b|one ?rep ?max|deadlift|\bsquat\b|bench ?press|\bhrv\b|vo2 ?max|\bspo2\b|glucose|blood sugar/],
  ['intake', /beers?|alcohol|drinks?|water|glass(es)?|coffee|caffeine|calories?|cigarettes?|sugar|soda|supplements?|pills?/],
];

const DOWN = /alcohol|beers?|sugar|soda|cigarettes?|caffeine|spend|cost|screen time|\bcut\b|reduce|\bless\b|quit|no[- ]?fap/;
// Money-IN and growth-of-net-worth read as "up" (good is more), so a net-worth /
// income / portfolio tile pills green as it climbs, while spend/cost stays "down".
// `\bsave\b` matches the money KIND rule's own anchor, so "money i save each week"
// carries direction up instead of shipping a directionless savings stream whose
// insight copy then reads growth as bad-spend flavor. Sleep and pushups are
// "more is good" too (the popular presets were landing direction-blind).
const UP = /water|workout|reps?|steps?|read|meditat|\bsave\b|saving|savings|protein|streak|\bmore\b|increase|net ?worth|portfolio|invest|income|earn|tips?|revenue|profit|sleep|slept|push ?ups?/;

// Verbs, articles, units, and temporal words that are never the subject of a tile.
// `many` is dropped so "how many pushups" keys on "pushups", not "manypushups". Serving
// nouns (cup/glass/bottle/can) are dropped so "cups of matcha"/"glasses of water" key on
// the substance, not "cupsmatcha"/"glasseswater"; the serving becomes the UNIT instead.
// Prepositions + filler ("in inches", "on the weekend", "how much", "number of")
// are dropped so a label reads on its real subject ("Waist", "Beers", "Spend
// Coffee"), never the leaked scaffold word ("Waist In", "Beers On", "Much Spend").
const STOP = /^(track|tracker|tracking|log|logging|logger|counter|count|rate|rating|did|do|does|my|a|an|the|daily|weekly|day|today|tonight|this|week|of|for|me|i|out|how|many|much|long|number|in|on|from|at|per|each|cups?|glass(es)?|bottles?|cans?|minutes?|mins?|hours?|hrs?|times?|time)$/;

// A compound goal joins two metrics ("weight and body fat", "steps plus distance").
// One tile is one stream, so we key on the FIRST metric and drop everything from the
// joiner on — a deterministic, honest choice (better than a "weightand" garbage key or
// silently blending two numbers). Applied to the salient word list in deriveKey.
const JOINER = /^(and|plus|vs|versus|&)$/;

function words(goal: string): string[] {
  return goal
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^\d+$/.test(w));
}

// Words that are already singular (or invariant) and must never be truncated:
// "series"/"species"/"news" end in -s but are not plurals, and slicing them gives an
// ugly stem ("serie","new"). Latin -us singulars ("focus"->"focu") are the same trap
// (found by the BUILD79 shelf defaults: the Timer piece is named "Focus").
// 'calories' is a mass noun whose key must stay 'calories': the -ies rule would
// mint the misspelled 'calory', a garbage identity no hand-built calorie tile
// would ever share (see the calorie CANONICAL family in reportContract).
const NEVER_SINGULARIZE = new Set(['series', 'species', 'news', 'lens', 'analysis', 'focus', 'status', 'bonus', 'radius', 'calories']);

// Naive singularize for a stable key: "plunges"->"plunge", "glasses"->"glass",
// "expenses"->"expense", "boxes"->"box", "watches"->"watch". The order matters:
// true -es plurals ("-ches/-shes/-sses/-xes/-zes") drop the whole "-es"; an
// "-ies" plural becomes "-y" ("bodies"->"body"); everything else that ends in a
// non-s + s drops the single "s". The earlier version dropped only two chars for
// ALL "-ses" words (mangling "expenses"->"expens") and left "boxes"->"boxs".
function singularize(w: string): string {
  if (NEVER_SINGULARIZE.has(w)) return w;
  if (/(ches|shes|sses|xes|zes)$/.test(w)) return w.slice(0, -2); // boxes->box, glasses->glass, watches->watch
  if (/[^aeiou]ies$/.test(w)) return w.slice(0, -3) + 'y'; // bodies->body, entries->entry
  if (/ses$/.test(w)) return w.slice(0, -1); // expenses->expense, lenses->lense... handled below
  if (/[^s]s$/.test(w)) return w.slice(0, -1);
  return w;
}

// Past-tense activity verbs that trail a countable noun ("books READ", "steps WALKED",
// "cigarettes SMOKED"). When one closes a multi-word phrase whose head is the real
// countable, we drop it so the key/unit reads on the noun ("books", "steps"), not the
// double-plural compound ("booksreads"). An explicit list (no blanket /ed$/) so common
// -ed nouns like "seed"/"feed"/"bed" are never mistaken for a verb. It only fires on a
// 2+ word phrase, so a lone-subject habit ("did i READ today", key "read") is untouched.
const TRAILING_VERB = /^(read|ran|run|walked|smoked|completed|drank|drunk|eat|ate|eaten|write|wrote|written|say|said|send|sent|post|posted|taken|lifted|logged|climbed|rowed|cycled|jogged|skipped|swum|burned|burnt)$/;

// "how much"/"how many" asks a QUANTITY, so the "did i" habit rule must not hijack it
// into a yes/no toggle: "how many beers did i drink" is a count of beers, not a habit.
// Money still wins first ("how much did i save" stays money), and a plain "did i read
// today" (no how much/many) still reads as a habit.
const QUANTITY_ASK = /how much|how many/;

// An UNAMBIGUOUS rating imperative ("rate my sleep out of 10", "energy /5") must win
// over a keyword collision earlier in KIND_RULES: "sleep" would otherwise trip the
// duration rule and "rate my run" the measure rule. Checked before the ordered rules.
const RATING_STRONG = /rate (my|your|the|this|today|it)|\/10|\/5|out of (ten|10|five|5)/;

function inferKind(goal: string): ReportKind {
  const g = goal.toLowerCase();
  if (RATING_STRONG.test(g)) return 'rating';
  const quantityAsk = QUANTITY_ASK.test(g);
  for (const [kind, re] of KIND_RULES) {
    if (kind === 'done' && quantityAsk) continue;
    if (re.test(g)) return kind;
  }
  return 'count';
}

function deriveKey(goal: string, name?: string): string {
  const src = name && name.trim() ? name : goal;
  const all = words(src);
  let salient = all.filter((w) => !STOP.test(w));
  // A compound goal ("weight AND body fat") keys on the first metric only: cut the
  // salient list at the first joiner so the key is "weight", never "weightand" / a
  // two-metric blend. Done before the trailing-verb + slice steps.
  const j = salient.findIndex((w) => JOINER.test(w));
  if (j > 0) salient = salient.slice(0, j);
  // Drop a trailing activity verb once the noun before it survives, so "books read" keys
  // on "books" not "booksread". Only when 2+ words remain, so a lone-verb subject is kept.
  if (salient.length >= 2 && TRAILING_VERB.test(salient[salient.length - 1])) {
    salient = salient.slice(0, -1);
  }
  const picked = (salient.length ? salient : all).slice(0, 2);
  // singularize the last word so ten "cold plunges"/"cold plunge" tiles share a key
  if (picked.length) picked[picked.length - 1] = singularize(picked[picked.length - 1]);
  return picked.join('') || 'thing';
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function inferLabel(goal: string, key: string, name?: string): string {
  if (name && name.trim()) return name.trim();
  let salient = words(goal).filter((w) => !STOP.test(w));
  // Same first-metric cut as the key, so the label reads "Weight", not "Weight And".
  const j = salient.findIndex((w) => JOINER.test(w));
  if (j > 0) salient = salient.slice(0, j);
  // Same trailing-verb drop as the key, so the label reads "Apples"/"Pages", not
  // "Apples Eat"/"Pages Write".
  if (salient.length >= 2 && TRAILING_VERB.test(salient[salient.length - 1])) {
    salient = salient.slice(0, -1);
  }
  const phrase = (salient.length ? salient : [key]).slice(0, 2).join(' ');
  return titleCase(phrase);
}

function inferGoalDirection(goal: string, kind: ReportKind): GoalDirection | undefined {
  const g = goal.toLowerCase();
  if (DOWN.test(g)) return 'down';
  // A dial stays neutral even when a quantity word appears: "rate my sleep out
  // of 10" is a quality read, not an hours count (locked by the eval suite).
  if (kind === 'rating') return 'neutral';
  if (UP.test(g)) return 'up';
  if (kind === 'measure') return 'neutral';
  return undefined;
}

// ── Measurement-aware units ─────────────────────────────────────────────────────
// The builder must never label a value with the raw subject ("2 waters", "0.2 weights").
// Physical measures get a real unit that flips with the user's metric/imperial choice;
// fluid intake gets a serving noun; dose-style intake gets mass/energy.

// [metric, imperial]. Checked in order; the first match on the lowercased goal wins.
// Ordered specific-before-general (body fat before weight; heart rate before generic).
const MEASURE_UNITS: Array<[RegExp, [string, string]]> = [
  [/body ?fat/, ['%', '%']],
  [/blood pressure/, ['mmHg', 'mmHg']],
  // Wearable / biomarker vitals with fixed real units (specific, so ahead of the
  // generic body-measure rules). glucose flips metric/imperial (mmol/L vs mg/dL).
  // NOTE: VO2 max is deliberately NOT mapped to a unit here — it stays a recognized
  // measure with a blank (honest) unit, so the "unknown measure" contract (a measure we
  // do not have a real unit for reads blank, never a bogus "vo2maxs") is preserved.
  [/\bhrv\b|heart rate variability/, ['ms', 'ms']],
  [/\bspo2\b|blood oxygen/, ['%', '%']],
  [/glucose|blood sugar/, ['mmol/L', 'mg/dL']],
  [/resting heart rate|heart rate|\bpulse\b|\bbpm\b/, ['bpm', 'bpm']],
  [/temperature|\btemp\b|fever/, ['°C', '°F']],
  [/height|how tall/, ['cm', 'in']],
  // A percent/progress metric reads in "%". Placed before the body-measure rules so
  // "progress %" / "completion rate" resolve, but after body-fat (which is already %).
  [/percent|progress|completion|\b%\b/, ['%', '%']],
  // Strength PRs and 1-rep-maxes are a load in kg/lb (ahead of the generic weight rule
  // so "squat 1rm" / "max deadlift" pick the same system-aware unit).
  [/1 ?rm\b|one ?rep ?max|deadlift|\bsquat\b|bench ?press/, ['kg', 'lb']],
  [/waist|\bchest\b|\bhips?\b|thigh|\barms?\b|\bneck\b|circumference|\bcm\b/, ['cm', 'in']],
  [/distance|\bkm\b|kilomet|\bmiles?\b|\bmi\b/, ['km', 'mi']],
  [/weight|\bmass\b|\bkg\b|\blbs?\b|pounds?|\bweigh\b/, ['kg', 'lb']],
];

// Fluid / uncountable intake -> a natural serving noun (never the substance's own plural).
// Discrete countables (beer, cigarettes, pills) are left to the pluralized-key fallback,
// where "beers"/"cigarettes" read fine.
const FLUID_UNITS: Array<[RegExp, string]> = [
  [/water/, 'glasses'],
  [/coffee|espresso|latte/, 'cups'],
  [/\btea\b|matcha/, 'cups'],
  [/soda|soft ?drink|\bpop\b|cola/, 'cans'],
  [/juice|\bmilk\b|smoothie|shake/, 'glasses'],
  [/\bwine\b/, 'glasses'],
  [/alcohol|\bdrinks?\b|cocktail|spirit|liquor/, 'drinks'],
];

// Substances measured by mass / energy, not counted. Supplements have a natural dose
// unit too: a scoop of creatine/protein reads in grams, a pill of omega/vitamins/minerals
// in milligrams. Without this they fell through to ugly plural keys ("creatines",
// "vitaminds", "magnesiums"). The protein rule is guarded so a protein SHAKE/SMOOTHIE/
// DRINK still reads as a serving (glasses) via the fluid map, not grams.
const DOSE_UNITS: Array<[RegExp, string]> = [
  [/calories?|\bkcal\b/, 'kcal'],
  [/caffeine/, 'mg'],
  [/\bsugar\b|\bsalt\b|\bsodium\b|carbs?|\bfibre\b|\bfiber\b/, 'g'],
  [/creatine/, 'g'],
  [/protein(?!\s*(shakes?|smoothies?|drinks?))/, 'g'],
  [/omega|fish ?oil/, 'mg'],
  [/vitamins?|magnesium|zinc|electrolytes?/, 'mg'],
];

// ── Currency-aware money units ──────────────────────────────────────────────────
// A money tile must never hardcode '$' for a user who thinks in £/€/¥. We keep a
// tiny ISO->symbol map (the currencies our audience actually uses) and fall back to
// printing the ISO code before the number for anything unmapped (e.g. "CHF 12"),
// which is always honest (a real code beats the wrong symbol).
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  CAD: '$',
  AUD: '$',
  NZD: '$',
  MXN: '$',
  SGD: '$',
  HKD: '$',
  GBP: '£',
  EUR: '€',
  JPY: '¥',
  CNY: '¥',
  INR: '₹',
  KRW: '₩',
  BRL: 'R$',
  ZAR: 'R',
  RUB: '₽',
  TRY: '₺',
  CHF: 'CHF ',
  SEK: 'kr ',
  NOK: 'kr ',
  DKK: 'kr ',
  PLN: 'zł ',
};

/** Resolve the symbol a money tile prints before its numbers. Unknown/blank codes
 *  fall back to "ISO " (the code plus a space) so "CHF 12" reads honestly instead of
 *  guessing a wrong symbol. Pure. */
export function currencySymbol(currency: string | undefined): string {
  const iso = (currency ?? 'USD').trim().toUpperCase();
  if (!iso) return '$';
  return CURRENCY_SYMBOLS[iso] ?? `${iso} `;
}

// ── Currency inference from the goal text ────────────────────────────────────────
// When no explicit `currency` is passed, read it out of the goal itself: an ISO code
// written as a word ("track my GBP spend"), or a currency symbol ("£ budget"). Kept
// deliberately conservative: a false currency match is worse than none, so when in
// doubt we return undefined and let the USD default stand.

// ISO codes that also read as an ordinary English word and so must NOT be inferred
// from free text (only an explicit `currency` param can select them). "TRY" is the
// Turkish lira but far more often the verb "try", so "try to save 50" must stay USD.
const AMBIGUOUS_ISO = new Set(['TRY']);

// Symbols that pin a single currency. '$' is intentionally absent: it is shared by
// USD/CAD/AUD/… so a lone '$' cannot pick one and simply leaves the USD default.
const SYMBOL_TO_ISO: Array<[string, string]> = [
  ['£', 'GBP'],
  ['€', 'EUR'],
  ['¥', 'JPY'],
  ['₹', 'INR'],
  ['₩', 'KRW'],
  ['₽', 'RUB'],
  ['₺', 'TRY'],
];

/** Read an ISO 4217 code out of a goal string, or undefined when none is present.
 *  Matches any code in CURRENCY_SYMBOLS as a standalone word (case-insensitive, on
 *  word boundaries) so "EUR budget" and "how much in gbp" both resolve, while
 *  substrings ("euros in my", "figured") never do. Ambiguous English-word codes are
 *  skipped. Conservative: returns undefined rather than guess. Pure. */
export function currencyFromText(goal: string): string | undefined {
  const upper = goal.toUpperCase();
  // A symbol in the text pins a currency directly (checked first, unambiguous).
  for (const [sym, iso] of SYMBOL_TO_ISO) if (goal.includes(sym)) return iso;
  // An ISO code written as a bounded, standalone word.
  for (const iso of Object.keys(CURRENCY_SYMBOLS)) {
    if (AMBIGUOUS_ISO.has(iso)) continue;
    if (new RegExp(`\\b${iso}\\b`).test(upper)) return iso;
  }
  return undefined;
}

function inferUnit(goal: string, kind: ReportKind, key: string, unit: string | undefined, unitSystem: UnitSystem): string {
  if (unit && unit.trim()) return unit.trim();
  // Duration is minutes by default, but sleep / naps / fasting / an explicit "hours"
  // are an HOURS quantity — the timer template renders these in an hours mode (a 0.5
  // stepper), so an 8-hour sleep is one entry, not 96 taps at +5 min. An explicit
  // "minutes"/"min" in the goal ("nap minutes") always wins back to minutes.
  if (kind === 'duration') {
    const gl = goal.toLowerCase();
    const saysMinutes = /minutes?|\bmins?\b/.test(gl);
    const saysHours = /sleep|slept|\bnap\b|fasting|\bhours?\b|\bhrs?\b/.test(gl);
    return saysHours && !saysMinutes ? 'h' : 'min';
  }
  if (kind === 'money') return '$';
  if (kind === 'rating') return 'rating';
  if (kind === 'done') return 'done';

  const g = goal.toLowerCase();
  const imperial = unitSystem === 'imperial';

  if (kind === 'measure') {
    for (const [re, [metric, imp]] of MEASURE_UNITS) if (re.test(g)) return imperial ? imp : metric;
    // An unrecognized measure gets a blank unit (honest) rather than a bogus "vo2maxs".
    return '';
  }

  // intake / count: dose units first (mass/energy), then fluid servings.
  for (const [re, u] of DOSE_UNITS) if (re.test(g)) return u;
  for (const [re, u] of FLUID_UNITS) if (re.test(g)) return u;

  // Genuinely countable subjects ("cold plunges", "reps", "cigarettes") read fine as a
  // plural. Sibilant stems ("box","watch","glass") take "-es" so the unit reads "boxes"
  // / "watches", not "boxs" / "watchs".
  if (key.endsWith('s')) return key;
  if (/(ch|sh|x|z)$/.test(key)) return key + 'es';
  return key + 's';
}

// ── Target inference (the daily / session goal a counting tile aims at) ──────────
// A number in the goal ("8 glasses of water", "read 20 pages", "10000 steps",
// "30 min meditation") IS the target; failing that a small keyword default table
// covers the common wellness goals. Deliberately conservative: undefined when unsure,
// so nothing bogus ever ships a ring. Only the ADDITIVE kinds get a target — a
// measure/money/rating/done "target" would be a fake goal (see TileMeta.target).
const ADDITIVE_KINDS = new Set<ReportKind>(['count', 'intake', 'duration']);

// Sensible defaults when the goal names no number. Keyed by a keyword on the goal.
const TARGET_DEFAULTS: Array<[RegExp, number]> = [
  [/water|glass|hydrat/, 8],
  [/steps?/, 10000],
  [/meditat|mindful/, 10],
  [/\bsleep\b|slept/, 8],
];

function inferTarget(goal: string, kind: ReportKind): number | undefined {
  if (!ADDITIVE_KINDS.has(kind)) return undefined;
  const g = goal.toLowerCase();
  // An explicit number in the goal wins (skip a bare "1-10"/"5k"-style scale word).
  const m = g.match(/\b(\d[\d,]*(?:\.\d+)?)\b/);
  if (m) {
    const n = parseFloat(m[1].replace(/,/g, ''));
    // Reject a lone year-like or absurd count so "2024 goal" / "1-10" don't seed a ring.
    if (n > 0 && n <= 100000 && !/\b1 ?- ?10\b|1 to 10/.test(g)) return n;
  }
  for (const [re, def] of TARGET_DEFAULTS) if (re.test(g)) return def;
  return undefined;
}

export function infer(input: InferInput): TileMeta {
  const kind = input.kind ?? inferKind(input.goal);
  const key = deriveKey(input.goal, input.name).toLowerCase();
  const label = inferLabel(input.goal, key, input.name);
  const goalDirection = input.goalDirection ?? inferGoalDirection(input.goal, kind);
  const unit = inferUnit(input.goal, kind, key, input.unit, input.unitSystem ?? 'metric');
  const template = KIND_TO_TEMPLATE[kind];
  const scaleMax = kind === 'rating' ? (/\/10|out of (ten|10)|1 ?- ?10|1 to 10/.test(input.goal.toLowerCase()) ? 10 : 5) : undefined;
  const target = input.target ?? inferTarget(input.goal, kind);
  // Only money tiles carry a currency symbol; every other kind leaves it undefined.
  // Precedence: an explicit `currency` param wins; otherwise infer from the goal text
  // (an ISO code word or a currency symbol); otherwise the USD default stands.
  const currencyCode = kind === 'money' ? (input.currency ?? currencyFromText(input.goal)) : undefined;
  const currencySym = kind === 'money' ? currencySymbol(currencyCode) : undefined;
  return {
    key,
    label,
    kind,
    ...(goalDirection ? { goalDirection } : {}),
    unit,
    template,
    ...(scaleMax ? { scaleMax } : {}),
    ...(currencySym ? { currencySymbol: currencySym } : {}),
    ...(target ? { target } : {}),
  };
}
