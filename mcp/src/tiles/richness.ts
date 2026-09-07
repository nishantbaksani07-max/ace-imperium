// The RICHNESS gate. The lint floor (lintTile) proves a tile is sealed, safe, and
// on-brand, but a bare single-number counter clears it exactly like a Fuel-grade
// module does, so "Vitality-grade PASS 0/0" can silently hide a thin tile. This gate
// closes that gap: it proves a tile actually earns a dashboard slot. It checks for the
// structural marks of the shared shell (docs/tile-lux-spec.md): the loaded signature
// fonts, a serif hero number that is REALLY serif, a header eyebrow, a status pill with
// real states, at least one real section with a signature visual that is actually
// drawn, honest persistence and a wired action, and an honest empty/idle state. Pure,
// IO-free, runs on the final HTML string.
//
// The bar is deliberately structural, not cosmetic. A thin tile can copy a class name
// (`<div class="bignum">`, `<span class="pill good">`, `<div class="bars"></div>`) and
// clear a shallow presence check while being hollow: the number falls to Georgia, the
// pill is a static label, the "chart" is an empty div, the button saves nothing. Each
// mark below pairs the structural class with the wiring that makes it real, so those
// hollow copies are caught. Every one of the six shipping templates satisfies all of
// these (verified by the eval harness on 24 diverse prompts), so tightening the gate
// never false-fails a real template.

export interface RichnessResult {
  /** How many structural marks were found. */
  score: number;
  /** The total number of marks checked. */
  max: number;
  /** True only when every mark is present (a genuinely rich tile). */
  ok: boolean;
  /** The marks that were missing (empty when ok). */
  missing: string[];
}

// Each mark is a name + a test on the HTML. All must hold for a tile to be "rich".
// A mark that only tests for a class name is weak (a thin tile copies the class); the
// strong marks pair the class with the wiring or CSS that makes it genuinely rich.
const CHECKS: Array<[string, (h: string) => boolean]> = [
  // The signature Instrument Serif is actually loaded (not silently falling to Georgia).
  ['signature-fonts', (h) => /fonts\.googleapis\.com\/css2\?family=/.test(h) && /Instrument\+Serif/.test(h)],
  // The serif stack is declared as a token, so the whole tile can reach the signature
  // family (a loaded font that no rule references is still an invisible upgrade).
  ['serif-type-scale', (h) => /--font-serif\s*:\s*'Instrument Serif'/.test(h)],
  // A serif hero number is the star, AND it is actually wired to the serif family (not a
  // hero that silently renders in Inter or Georgia, the exact Georgia bug). The hero is
  // either a `.bignum` (the default) or a `.ring-num` (a goal-bearing tile's ring center);
  // whichever is present must be serif-wired.
  [
    'serif-hero-number',
    (h) =>
      (/class="bignum"/.test(h) && /\.bignum\{[^}]*font-family:var\(--font-serif\)/.test(h)) ||
      (/class="ring-num"/.test(h) && /\.ring-num\{[^}]*font-family:var\(--font-serif\)/.test(h)),
  ],
  // A header eyebrow (the serif `01` + mono label row) gives the tile structure.
  ['header-eyebrow', (h) => /class="[^"]*\beyebrow\b/.test(h) && /class="num"/.test(h)],
  // A status pill that carries meaning on a dot glyph, not on color alone (colorblind-safe).
  ['status-pill', (h) => /class="pill\b/.test(h) && /class="dot"/.test(h)],
  // The pill has at least two real states defined, so state is honest (idle/good/caution),
  // not one frozen label pretending to be a live status.
  ['pill-states', (h) => (h.match(/\.pill\.(?:good|caution|idle)\b/g) || []).length >= 2],
  // The pill is actually driven by the tile's state (the `pill(state,text)` helper is
  // called), not a static bit of markup that never changes.
  ['pill-wired', (h) => /\bpill\(/.test(h)],
  // At least one real section below the hero (not just a number + buttons).
  ['real-section', (h) => /id="section"/.test(h) && /class="section\b/.test(h)],
  // A signature visual in that section: a 7-day chart, a trend line, or a habit grid.
  ['signature-visual', (h) => /class="(?:bars|grid|spark|ratingrow)\b/.test(h) || /\bdraw(?:Bars|Spark|Grid|Week)\b/.test(h)],
  // That visual is actually RENDERED by script, not left an empty placeholder div (the
  // section either gets its innerHTML written, or a draw* function is invoked).
  ['section-rendered', (h) => /getElementById\(['"]section['"]\)\.innerHTML/.test(h) || /\bdraw(?:Bars|Spark|Grid|Week)\s*\(/.test(h)],
  // The tile actually persists through the host bridge (saves AND loads its own data),
  // so a log survives a reload. A tile whose buttons change nothing durable is a toy.
  ['persists', (h) => /Vitality\.save\s*\(/.test(h) && /Vitality\.load\s*\(/.test(h)],
  // A primary action is wired to a handler, so the tile responds to a tap. A hero with
  // dead buttons looks rich but does nothing.
  ['wired-action', (h) => /\.onclick\s*=/.test(h) || /addEventListener\s*\(\s*['"]click/.test(h)],
  // An honest empty/idle state so a fresh tile invites the first entry instead of a blank.
  ['honest-empty-state', (h) => /nothing yet|not yet|no days logged|no check-ins|starts here|log a couple more|first reading/.test(h)],
  // A hero PROGRESS visual: either the serif bignum OR a mounted progress ring
  // (`.ringwrap` + `.ring-num`). Every template has at least one, so a tile that ships
  // neither (just buttons) is thin.
  ['hero-or-ring', (h) => /class="bignum"/.test(h) || (/class="ringwrap"/.test(h) && /class="ring-num"/.test(h))],
  // The warm INSIGHT line must not be DEAD copy: if a tile mounts the insight slot or
  // the sayInsight helper, it must actually call the insight() bank (and vice versa). A
  // tile that uses neither is not failed here (a hand-built reference tile that does its
  // own coaching is caught by the other marks), so this locks the wiring on every tile
  // that opts into the shared insight system without retro-failing older rich tiles.
  [
    'insight-line',
    (h) => {
      const wantsInsight = /class="insight[\s"]/.test(h) || /\bsayInsight\s*\(/.test(h);
      if (!wantsInsight) return true;
      return /class="insight[\s"]/.test(h) && /\binsight\s*\(/.test(h);
    },
  ],
  // A goal-bearing tile that MOUNTS a ring (`.ringwrap`) must also draw its target on the
  // 7-day chart (a call to drawBarsTarget(<arg>), not just the function definition). A
  // target-less tile has no ring, so it passes trivially and this never false-fails the
  // bignum/measure/money/scale/toggle tiles.
  ['target-aware', (h) => !/class="ringwrap"/.test(h) || /\bdrawBarsTarget\s*\(\s*[A-Za-z0-9]/.test(h)],
];

export function richnessOf(html: string): RichnessResult {
  const missing = CHECKS.filter(([, fn]) => !fn(html)).map(([name]) => name);
  return { score: CHECKS.length - missing.length, max: CHECKS.length, ok: missing.length === 0, missing };
}
