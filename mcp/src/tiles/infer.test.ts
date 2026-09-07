import { test } from 'node:test';
import assert from 'node:assert/strict';
import { infer, currencySymbol, currencyFromText } from './infer.js';

const cases: Array<[string, Partial<{ kind: string; key: string; goalDirection: string; template: string }>]> = [
  ['beer tracker', { kind: 'intake', key: 'beer', goalDirection: 'down', template: 'counter' }],
  ['track my water', { kind: 'intake', key: 'water', goalDirection: 'up', template: 'counter' }],
  ['track my cold plunges', { kind: 'count', key: 'coldplunge', template: 'counter' }],
  ['meditation minutes', { kind: 'duration', key: 'meditation', template: 'timer' }],
  ['rate my mood out of 10', { kind: 'rating', key: 'mood', template: 'scale' }],
  ['log my weight', { kind: 'measure', key: 'weight', template: 'measure' }],
  ['track my daily spend', { kind: 'money', key: 'spend', goalDirection: 'down', template: 'money' }],
  ['did I read today', { kind: 'done', key: 'read', template: 'toggle' }],
  // Regressions found by the eval harness + adversarial review, now locked:
  ['resting heart rate', { kind: 'measure', template: 'measure' }], // "rate" no longer hijacks to a 1-5 dial
  ['heart rate', { kind: 'measure', template: 'measure' }],
  ['how much did I save today', { kind: 'money', template: 'money' }], // "save" reads as money, not a yes/no toggle
  ['pages read', { kind: 'count', template: 'counter' }], // bare "read" no longer means a stopwatch
  ['time spent reading', { kind: 'duration', template: 'timer' }], // bare "spent" no longer means money
];

for (const [goal, exp] of cases) {
  test(`infer: "${goal}"`, () => {
    const m = infer({ goal });
    if (exp.kind) assert.equal(m.kind, exp.kind, 'kind');
    if (exp.key) assert.equal(m.key, exp.key, 'key');
    if (exp.template) assert.equal(m.template, exp.template, 'template');
    if (exp.goalDirection) assert.equal(m.goalDirection, exp.goalDirection, 'goalDirection');
  });
}

test('infer: explicit overrides win', () => {
  const m = infer({ goal: 'beer tracker', kind: 'count', name: 'Brews', goalDirection: 'up', unit: 'cans' });
  assert.equal(m.kind, 'count');
  assert.equal(m.template, 'counter');
  assert.equal(m.label, 'Brews');
  assert.equal(m.goalDirection, 'up');
  assert.equal(m.unit, 'cans');
});

test('infer: scale max follows /10', () => {
  assert.equal(infer({ goal: 'rate my mood out of 10' }).scaleMax, 10);
  assert.equal(infer({ goal: 'rate my mood' }).scaleMax, 5);
});

// ── Box 1.5: measurement-aware units ────────────────────────────────────────────
// The builder must never emit the raw substance/subject as a unit ("2 waters",
// "down 0.2 weights"). Fluid is measured in servings, physical measures in real
// units that respect the user's metric/imperial preference.

// Latin -us singulars must survive key derivation untruncated ("Focus" is the
// BUILD79 Timer piece's default name; "focu" was the bug).
test('infer: -us singulars are never truncated in the key', () => {
  assert.equal(infer({ goal: 'minutes of focus', name: 'Focus' }).key, 'focus');
  assert.equal(infer({ goal: 'my status', name: 'Status' }).key, 'status');
});

// Labels must read on the real subject, never a leaked scaffold word. Prepositions
// / filler ("in inches", "on the weekend", "how much", "number of") are dropped, and
// a trailing activity verb ("apples i eat", "pages i write") is stripped from the
// label just as it is from the key.
test('infer: labels drop leaked prepositions, filler, and trailing verbs', () => {
  assert.equal(infer({ goal: 'how much i spend on coffee' }).label, 'Spend Coffee');
  assert.equal(infer({ goal: 'apples i eat' }).label, 'Apples');
  assert.equal(infer({ goal: 'pages i write' }).label, 'Pages');
  assert.equal(infer({ goal: 'the number of times i say sorry' }).label, 'Say Sorry');
  // none of these leak the scaffold word into the label
  assert.notEqual(infer({ goal: 'my waist in inches' }).label, 'Waist In');
  assert.notEqual(infer({ goal: 'beers on the weekend' }).label, 'Beers On');
  // key mirrors the same drop
  assert.equal(infer({ goal: 'apples i eat' }).key, 'apple');
  assert.equal(infer({ goal: 'pages i write' }).key, 'page');
});

test('infer: fluid intake reads as servings, never the substance plural', () => {
  assert.equal(infer({ goal: 'track my water' }).unit, 'glasses');
  assert.equal(infer({ goal: 'coffee tracker' }).unit, 'cups');
  assert.equal(infer({ goal: 'track my soda' }).unit, 'cans');
  assert.equal(infer({ goal: 'track my alcohol' }).unit, 'drinks');
  // the exact bug from the handoff: water must not be "waters"
  assert.notEqual(infer({ goal: 'track my water' }).unit, 'waters');
});

test('infer: dose-style intake uses mass/energy units', () => {
  assert.equal(infer({ goal: 'track my calories' }).unit, 'kcal');
  assert.equal(infer({ goal: 'caffeine tracker' }).unit, 'mg');
  assert.equal(infer({ goal: 'how much sugar today' }).unit, 'g');
});

test('infer: weight respects metric/imperial preference', () => {
  assert.equal(infer({ goal: 'log my weight' }).unit, 'kg'); // default metric
  assert.equal(infer({ goal: 'log my weight', unitSystem: 'metric' }).unit, 'kg');
  assert.equal(infer({ goal: 'log my weight', unitSystem: 'imperial' }).unit, 'lb');
  // the exact bug from the handoff: weight must not be "weights"
  assert.notEqual(infer({ goal: 'log my weight' }).unit, 'weights');
});

test('infer: other physical measures pick real, system-aware units', () => {
  assert.equal(infer({ goal: 'log my run distance' }).unit, 'km');
  assert.equal(infer({ goal: 'log my run distance', unitSystem: 'imperial' }).unit, 'mi');
  assert.equal(infer({ goal: 'track my waist' }).unit, 'cm');
  assert.equal(infer({ goal: 'track my waist', unitSystem: 'imperial' }).unit, 'in');
  assert.equal(infer({ goal: 'log my body fat' }).unit, '%');
  assert.equal(infer({ goal: 'resting heart rate' }).unit, 'bpm');
});

test('infer: a plain countable stays a pluralized noun', () => {
  // cold plunges / reps are genuinely countable, so their plural noun is a fine unit
  assert.equal(infer({ goal: 'track my cold plunges' }).unit, 'coldplunges');
});

test('infer: unknown measure gets a blank unit, never a bogus plural', () => {
  const m = infer({ goal: 'log my VO2 max', kind: 'measure' });
  assert.equal(m.unit, '');
});

test('infer: explicit unit override still beats measurement inference', () => {
  assert.equal(infer({ goal: 'log my weight', unit: 'stone', unitSystem: 'imperial' }).unit, 'stone');
});

// ── Box 1.7: currency-aware money tiles ─────────────────────────────────────────
// A money tile must print the user's own currency symbol, never a hardcoded '$'.
// The symbol rides on meta.currencySymbol; an unmapped ISO code prints the code.

test('infer: money tiles carry the user currency symbol', () => {
  assert.equal(infer({ goal: 'track my daily spend' }).currencySymbol, '$'); // default USD
  assert.equal(infer({ goal: 'track my daily spend', currency: 'USD' }).currencySymbol, '$');
  assert.equal(infer({ goal: 'track my daily spend', currency: 'GBP' }).currencySymbol, '£');
  assert.equal(infer({ goal: 'track my daily spend', currency: 'EUR' }).currencySymbol, '€');
  assert.equal(infer({ goal: 'track my daily spend', currency: 'JPY' }).currencySymbol, '¥');
});

test('infer: lowercase / padded currency codes still resolve', () => {
  assert.equal(infer({ goal: 'daily budget', currency: 'gbp' }).currencySymbol, '£');
  assert.equal(infer({ goal: 'daily budget', currency: ' eur ' }).currencySymbol, '€');
});

test('infer: an unknown currency falls back to the ISO code before the number', () => {
  // No short symbol for this made-up code -> "XYZ " (code + space), never a wrong symbol.
  assert.equal(infer({ goal: 'track my daily spend', currency: 'XYZ' }).currencySymbol, 'XYZ ');
});

test('infer: only money tiles carry a currency symbol', () => {
  // a currency passed to a non-money goal is simply ignored (no stray symbol)
  assert.equal(infer({ goal: 'track my water', currency: 'GBP' }).currencySymbol, undefined);
  assert.equal(infer({ goal: 'log my weight', currency: 'EUR' }).currencySymbol, undefined);
});

test('infer: explicit unit override still wins on a money tile', () => {
  // currency sets the symbol; an explicit unit still overrides the money unit ('$').
  const m = infer({ goal: 'track my daily spend', currency: 'GBP', unit: 'per day' });
  assert.equal(m.unit, 'per day');
  assert.equal(m.currencySymbol, '£');
});

// ── Currency inferred from the goal TEXT (no explicit param) ─────────────────────
// A money goal that names a currency (an ISO code word or a symbol) should print that
// currency's symbol; a plain money goal stays USD. Precedence: an explicit `currency`
// param beats the text; the text beats the USD default; non-money goals are unaffected.

test('infer: an ISO code in the goal text sets the money symbol', () => {
  assert.equal(infer({ goal: 'track my GBP spend' }).currencySymbol, '£');
  assert.equal(infer({ goal: 'EUR budget' }).currencySymbol, '€');
  assert.equal(infer({ goal: 'how much did I save in JPY' }).currencySymbol, '¥');
  // case-insensitive, still bounded as a word
  assert.equal(infer({ goal: 'how much did I spend in gbp today' }).currencySymbol, '£');
  assert.equal(infer({ goal: 'daily budget in inr' }).currencySymbol, '₹');
});

test('infer: a currency symbol in the goal text sets the money symbol', () => {
  assert.equal(infer({ goal: '£ budget' }).currencySymbol, '£');
  assert.equal(infer({ goal: 'track my € spend' }).currencySymbol, '€');
  assert.equal(infer({ goal: 'how much ¥ did I save' }).currencySymbol, '¥');
  // a lone '$' cannot pick USD vs CAD vs AUD, so it just leaves the USD default
  assert.equal(infer({ goal: 'track my $ spend' }).currencySymbol, '$');
});

test('infer: an explicit currency param beats the goal text', () => {
  // text says GBP, but the param says EUR -> the param wins
  assert.equal(infer({ goal: 'track my GBP spend', currency: 'EUR' }).currencySymbol, '€');
  assert.equal(infer({ goal: '£ budget', currency: 'JPY' }).currencySymbol, '¥');
});

test('infer: a plain money goal with no currency stays USD', () => {
  assert.equal(infer({ goal: 'track my daily spend' }).currencySymbol, '$');
  assert.equal(infer({ goal: 'money earned today' }).currencySymbol, '$');
});

test('infer: an ambiguous English-word ISO code is NOT inferred from text', () => {
  // "TRY" is the Turkish lira but reads as the verb "try": must stay USD from text.
  assert.equal(infer({ goal: 'try to save 50 dollars' }).currencySymbol, '$');
  // an explicit param can still select it deliberately
  assert.equal(infer({ goal: 'try to save 50 dollars', currency: 'TRY' }).currencySymbol, '₺');
});

test('infer: currency in text does not leak onto a non-money tile', () => {
  // GBP mentioned, but the goal is a count/measure -> no stray symbol
  assert.equal(infer({ goal: 'track my GBP pushups' }).currencySymbol, undefined);
  assert.equal(infer({ goal: 'log my weight in EUR' }).currencySymbol, undefined);
});

test('currencyFromText: reads an ISO code or symbol, undefined otherwise', () => {
  assert.equal(currencyFromText('track my GBP spend'), 'GBP');
  assert.equal(currencyFromText('EUR budget'), 'EUR');
  assert.equal(currencyFromText('save in jpy'), 'JPY');
  assert.equal(currencyFromText('£ budget'), 'GBP');
  assert.equal(currencyFromText('track my € spend'), 'EUR');
  // no currency named -> undefined (conservative; caller keeps the USD default)
  assert.equal(currencyFromText('track my daily spend'), undefined);
  // substrings never false-match a code
  assert.equal(currencyFromText('how many euros in my figured budget'), undefined);
  // a lone '$' does not pin a single currency
  assert.equal(currencyFromText('track my $ spend'), undefined);
  // the ambiguous verb "try" is never the Turkish lira from text
  assert.equal(currencyFromText('try to save more'), undefined);
});

test('currencySymbol: pure symbol map with honest fallback', () => {
  assert.equal(currencySymbol('USD'), '$');
  assert.equal(currencySymbol('GBP'), '£');
  assert.equal(currencySymbol('EUR'), '€');
  assert.equal(currencySymbol('JPY'), '¥');
  assert.equal(currencySymbol('CAD'), '$');
  assert.equal(currencySymbol(undefined), '$'); // default USD
  assert.equal(currencySymbol('ZZZ'), 'ZZZ '); // unmapped -> ISO code before the number
});

// ── Supplement / vitamin doses -> mass units ──────────────────────────────────────
// A scoop of creatine/protein reads in grams; a pill of omega/vitamins/minerals in mg.
// Before this they fell through to ugly plural keys ("creatines", "vitaminds").

test('infer: supplements read in a mass dose, never the substance plural', () => {
  assert.equal(infer({ goal: 'track my creatine' }).unit, 'g');
  assert.equal(infer({ goal: 'protein' }).unit, 'g');
  assert.equal(infer({ goal: 'omega 3' }).unit, 'mg');
  assert.equal(infer({ goal: 'fish oil' }).unit, 'mg');
  assert.equal(infer({ goal: 'track my vitamins' }).unit, 'mg');
  assert.equal(infer({ goal: 'vitamin d' }).unit, 'mg');
  assert.equal(infer({ goal: 'track my magnesium' }).unit, 'mg');
  assert.equal(infer({ goal: 'zinc' }).unit, 'mg');
  assert.equal(infer({ goal: 'track my electrolytes' }).unit, 'mg');
  // the bug this fixes: never the raw plural
  assert.notEqual(infer({ goal: 'track my creatine' }).unit, 'creatines');
  assert.notEqual(infer({ goal: 'track my vitamins' }).unit, 'vitamins');
});

test('infer: a protein SHAKE stays a serving, not grams', () => {
  // the dose rule is guarded so a liquid serving still reads as a glass
  assert.equal(infer({ goal: 'protein shake' }).unit, 'glasses');
  assert.equal(infer({ goal: 'protein smoothie' }).unit, 'glasses');
});

// ── Bare "<activity> time" reads as a duration ────────────────────────────────────
// A gerund activity closed by "time" is a timer; non-activity "time" phrases are not.

test('infer: a gerund-activity + "time" reads as a duration timer', () => {
  assert.equal(infer({ goal: 'stretching time' }).kind, 'duration');
  assert.equal(infer({ goal: 'stretching time' }).template, 'timer');
  assert.equal(infer({ goal: 'stretching time' }).unit, 'min');
  assert.equal(infer({ goal: 'studying time' }).kind, 'duration');
});

test('infer: non-activity "time" phrases are NOT hijacked into a timer', () => {
  // these must stay counts, never a duration
  assert.notEqual(infer({ goal: 'me time' }).kind, 'duration');
  assert.notEqual(infer({ goal: 'first time' }).kind, 'duration');
  assert.notEqual(infer({ goal: 'bed time' }).kind, 'duration');
  assert.notEqual(infer({ goal: 'on time' }).kind, 'duration');
  // and the ones that already worked keep working
  assert.equal(infer({ goal: 'screen time' }).kind, 'duration');
  assert.equal(infer({ goal: 'reading time' }).kind, 'duration');
  assert.equal(infer({ goal: 'time spent reading' }).kind, 'duration');
});

// ── Cleaner multi-word keys / units ───────────────────────────────────────────────
// "how many" and serving nouns are dropped from the subject; a trailing activity verb
// is dropped so the countable noun leads. The unit stops reading as a double plural.

test('infer: "how many X" keys on X, not "manyX"', () => {
  assert.equal(infer({ goal: 'how many pushups' }).key, 'pushup');
  assert.equal(infer({ goal: 'how many pushups' }).unit, 'pushups');
});

test('infer: a serving noun becomes the unit, not part of the key', () => {
  assert.equal(infer({ goal: 'cups of matcha' }).key, 'matcha');
  assert.equal(infer({ goal: 'cups of matcha' }).unit, 'cups');
  assert.equal(infer({ goal: 'cups of coffee' }).key, 'coffee');
  assert.equal(infer({ goal: 'cups of coffee' }).unit, 'cups');
  assert.equal(infer({ goal: 'glasses of water' }).key, 'water');
  assert.equal(infer({ goal: 'glasses of water' }).unit, 'glasses');
});

test('infer: a trailing activity verb drops out so the unit is not a double plural', () => {
  assert.equal(infer({ goal: 'books read' }).key, 'book');
  assert.equal(infer({ goal: 'books read' }).unit, 'books');
  assert.equal(infer({ goal: 'pages read' }).key, 'page');
  assert.equal(infer({ goal: 'pages read' }).unit, 'pages');
  assert.equal(infer({ goal: 'steps walked today' }).unit, 'steps');
  assert.equal(infer({ goal: 'cigarettes smoked' }).unit, 'cigarettes');
  // a lone-verb habit subject is untouched: "did i read today" still keys on "read"
  assert.equal(infer({ goal: 'did I read today' }).key, 'read');
});

// ── "how much / how many X did I <verb>" is a QUANTITY, not a yes/no habit ─────────

test('infer: a quantity question is not hijacked into a habit toggle', () => {
  // "did i" no longer forces a toggle when the goal asks "how much"/"how many"
  assert.equal(infer({ goal: 'how many beers did I drink' }).kind, 'intake');
  assert.equal(infer({ goal: 'how many books did I read' }).kind, 'count');
  assert.equal(infer({ goal: 'how much wine did I drink' }).kind, 'intake');
  // but a plain habit still reads as a habit
  assert.equal(infer({ goal: 'did I read today' }).kind, 'done');
  assert.equal(infer({ goal: 'did I meditate today' }).kind, 'done');
  // and money still wins first: "how much did i save" stays money
  assert.equal(infer({ goal: 'how much did I save today' }).kind, 'money');
});
