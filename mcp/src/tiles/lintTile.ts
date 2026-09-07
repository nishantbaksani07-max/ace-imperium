// The tile linter: a pure, IO-free check that a generated tile meets Vitality's
// hard floor before it is ever returned. Errors are the floor (a tile that trips
// one is not Vitality-grade and must not ship); warnings are quality nudges.
// Rules are distilled straight from dna/gotchas.md. Run on the final HTML string.

// BUMP THIS whenever the ruleset changes (a rule added, removed, or tightened).
// It is folded into the check_tile Proof HMAC (mcp/src/checkTile.ts), so every
// ruleset change invalidates all outstanding proofs - a saved html+proof pair
// from before the change falls back to the full lint and can never skip a NEW rule.
export const LINT_RULESET_VERSION = 'lint-v3';

export type LintSeverity = 'error' | 'warn';

export interface LintFinding {
  rule: string;
  severity: LintSeverity;
  message: string;
  hint?: string;
}

export interface LintResult {
  ok: boolean; // true when there are zero errors (warnings are allowed)
  errors: number;
  warnings: number;
  findings: LintFinding[];
}

// Props that trigger layout or paint every frame; animating them drops below 60fps.
// backdrop-filter is always compositor-expensive, so it sits with the layout props.
// (Plain `filter` is NOT here: filter:brightness/drop-shadow are cheap and the design
// system uses them; only animating filter:blur is the trap, caught separately below.)
// The per-prop regexes below allow a `-suffix` (so `width` also covers `width-...`),
// but NOT a prefix, so min-/max-/grid-template- sizes are listed explicitly.
const LAYOUT_PROPS = [
  'width', 'height', 'top', 'left', 'right', 'bottom', 'margin', 'padding',
  'box-shadow', 'backdrop-filter', 'inset', 'gap', 'font-size', 'line-height',
  'flex-basis', 'aspect-ratio', 'block-size', 'inline-size',
  'min-width', 'max-width', 'min-height', 'max-height',
  'grid-template-columns', 'grid-template-rows',
];

/** Pull the body of every @keyframes block (brace-matched, so nested {} are safe). */
function extractKeyframes(css: string): string[] {
  const out: string[] = [];
  const re = /@keyframes\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const open = css.indexOf('{', m.index);
    if (open < 0) continue;
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') {
        depth--;
        if (depth === 0) {
          out.push(css.slice(open, i + 1));
          break;
        }
      }
    }
  }
  return out;
}

/** Brace-match the `{...}` block that follows each match of `opener`, returning the
 *  [openBraceIndex, closeBraceIndex] of each body. Used to scope checks to a real
 *  block (e.g. a try{...}) instead of substring-matching the whole file. Same brace
 *  caveat as extractKeyframes (a `}` inside a string would skew depth), accepted for
 *  the simple, code-shaped bodies tiles carry. */
function matchedBlocks(s: string, opener: RegExp): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const re = new RegExp(opener.source, opener.flags.includes('g') ? opener.flags : opener.flags + 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const open = s.indexOf('{', m.index);
    if (open < 0) continue;
    let depth = 0;
    for (let i = open; i < s.length; i++) {
      if (s[i] === '{') depth++;
      else if (s[i] === '}') {
        depth--;
        if (depth === 0) {
          ranges.push([open, i]);
          break;
        }
      }
    }
  }
  return ranges;
}

/** Return the argument substring of the first call starting at/after fromIdx.
 *  String-literal aware: a ')' inside a '...', "...", or `...` literal does NOT close
 *  the call. Without this, a legitimate label carrying a paren (or a crafted name like
 *  `fetch('//x/'+document.cookie)`) truncates the args early and the field-presence
 *  checks read false-missing on a perfectly valid report() call. */
function firstCallArgs(s: string, fromIdx: number): string {
  const open = s.indexOf('(', fromIdx);
  if (open < 0) return '';
  let depth = 0;
  let quote = '';
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === '\\') i++; // skip the escaped char
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
    } else if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return s.slice(open + 1, i);
    }
  }
  return s.slice(open + 1);
}

export function lintTile(html: string): LintResult {
  const findings: LintFinding[] = [];
  const add = (rule: string, severity: LintSeverity, message: string, hint?: string) =>
    findings.push({ rule, severity, message, hint });

  const styleBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((x) => x[1]).join('\n');

  // --- Sealed-tile structure and isolation (errors) ---
  const hasDoctype = /<!doctype\s+html/i.test(html);
  const hasHtml = /<html[\s>]/i.test(html);
  const hasInline = /<style[\s>]/i.test(html) || /<script[\s>]/i.test(html);
  if (!hasDoctype || !hasHtml || !hasInline) {
    add('doc-structure', 'error', 'not a self-contained HTML document (needs <!doctype html>, <html>, and inline <style>/<script>)', 'Output one sealed HTML file.');
  }
  if (/<script[^>]*\bsrc\s*=/i.test(html)) {
    add('sealed-external-script', 'error', 'an external <script src> was found; a tile must inline all JavaScript', 'Inline the script, no CDN or external file.');
  }
  // External CODE is the seal: a remote import/from. Match protocol-relative URLs
  // (//host) too, not only https?: (an `import("//esm.sh/x")` slips a plain check).
  if (/\bimport\s*\(\s*["'](?:https?:)?\/\//i.test(html) || /\bfrom\s+["'](?:https?:)?\/\//i.test(html)) {
    add('sealed-external-script', 'error', 'JavaScript loads code from an external URL (import/from); a tile inlines all JS', 'Inline everything, no remote import.');
  }
  // Injecting a <script> at runtime loads code the seal cannot audit. (Fetching DATA
  // with fetch/XHR is allowed: that is the deliberate bring-your-own-key capability.)
  if (/createElement\s*\(\s*["']script["']/i.test(html) || /document\.write\s*\(/i.test(html)) {
    add('sealed-dynamic-script', 'error', 'a script element is injected at runtime (createElement("script")/document.write); a sealed tile inlines all code and loads none at runtime', 'Inline every script; never inject one with JS.');
  }
  const linkRe = /<link\b[^>]*\bhref\s*=\s*["']?((?:https?:)?\/\/[^"'>\s]+)/gi;
  let lm: RegExpExecArray | null;
  while ((lm = linkRe.exec(html))) {
    if (!/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(lm[1])) {
      add('sealed-external-resource', 'error', 'an external resource <link> was found (' + lm[1] + '); a tile loads no external CSS or assets', 'Inline all styles and assets.');
    }
  }
  if (/@import\s+(?:url\()?\s*["']?(?:https?:)?\/\//i.test(html)) {
    add('sealed-external-resource', 'error', 'a CSS @import of an external URL was found; a tile inlines all styles', 'Inline all styles.');
  }
  if (/\bReactDOM\b|\bReact\.[A-Za-z]|from\s+["']react["']|\bVue\.[A-Za-z]|\bcreateApp\b|\bangular\b/i.test(html)) {
    add('sealed-framework', 'error', 'a framework reference (React, Vue, Angular) was found; tiles are vanilla JS only', 'Use plain DOM APIs.');
  }
  // Inline event-handler attributes (onclick=, onerror=, onload=, ...) are the classic
  // injection sink: unescaped user text landing inside a tag runs arbitrary JS the seal
  // cannot audit, and they scatter behaviour through the markup instead of the one
  // audited <script>. Scan MARKUP only (scripts stripped): a `<` in JS is the less-than
  // operator, not a tag, and a handler token can legitimately appear in a JS string. We
  // require a real tag open (`<` + a tag-name letter) with the handler as a
  // whitespace-delimited attribute before the tag closes, so an ESCAPED unit
  // (`&lt;img onerror=...&gt;`, inert text) and `addEventListener('click')` never trip
  // it. The scaffolder wires every handler with addEventListener, so no legit tile has one.
  {
    const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ');
    if (/<[a-zA-Z][^>]*?\son(?:click|dblclick|mousedown|mouseup|mouseover|mouseout|mouseenter|mouseleave|mousemove|keydown|keyup|keypress|input|change|submit|reset|focus|blur|load|error|scroll|wheel|touchstart|touchend|touchmove|pointerdown|pointerup|pointermove|contextmenu|animationstart|animationend|transitionend|drag|drop|copy|paste|beforeunload)\s*=/i.test(markup)) {
      add('inline-event-handler', 'error', 'an inline event-handler attribute (e.g. onclick=, onerror=, onload=) was found; a sealed tile wires every handler in its one audited <script>', 'Remove the on* attribute and attach the handler with addEventListener in the script.');
    }
  }

  // Script-tag balance: walk <script>/</script> in document order. A close at depth
  // 0 is a STRAY close, the unmistakable tell that injected markup broke out of an
  // element (unescaped user text); an open never closed is a malformed document.
  // This is what turns the self-certifying stamp honest: an injection-broken tile
  // can no longer lint green.
  {
    const tags = html.match(/<script\b[^>]*>|<\/script\s*>/gi) || [];
    let depth = 0;
    let stray = false;
    for (const tag of tags) {
      if (/^<\//.test(tag)) {
        if (depth === 0) { stray = true; break; }
        depth--;
      } else {
        depth++;
      }
    }
    if (stray) {
      add('script-stray-close', 'error', 'a </script> appears before its opening <script> (injected markup broke out of an element)', 'Escape any user text rendered into HTML or a script; never interpolate it raw.');
    } else if (depth !== 0) {
      add('script-unbalanced', 'error', 'unbalanced <script> tags (an opening tag is never closed)', 'Every <script> needs a matching </script>; do not let user text inject one.');
    }
  }

  // --- Date safety (error) ---
  if (/toISOString\s*\(\s*\)\s*\.\s*(?:slice|split|substr|substring)/i.test(html)) {
    add('date-utc-drift', 'error', 'toISOString().slice/split builds a UTC date key that drifts a day; build the key from local getters', 'Use getFullYear/getMonth/getDate, zero-padded.');
  }

  // --- Motion (error + warn) ---
  for (const kf of extractKeyframes(styleBlocks)) {
    const hit = LAYOUT_PROPS.filter((p) => new RegExp('(^|[;{\\s])' + p + '(?:-[a-z]+)?\\s*:', 'i').test(kf));
    if (hit.length) {
      add('motion-keyframe-layout', 'error', 'a @keyframes animation animates layout/paint props (' + hit.join(', ') + '); animate only transform and opacity', 'Width becomes scaleX, position becomes translate, a glow becomes opacity on a pre-blurred layer.');
      break;
    }
  }
  // filter:blur() re-rasterizes the layer every frame; brightness/drop-shadow do not,
  // so this targets blur specifically rather than banning all of filter.
  for (const kf of extractKeyframes(styleBlocks)) {
    if (/filter\s*:[^;}]*\bblur\s*\(/i.test(kf)) {
      add('motion-keyframe-blur', 'error', 'a @keyframes animation animates filter: blur() (re-blurs the layer every frame, dropping below 60fps)', 'Blur a layer once, then animate its opacity; never animate the blur radius.');
      break;
    }
  }
  const transRe = /transition(?:-property)?\s*:\s*([^;}]+)[;}]/gi;
  let tm: RegExpExecArray | null;
  let transLayout = false;
  while ((tm = transRe.exec(styleBlocks))) {
    const val = tm[1].toLowerCase();
    if (/(^|[\s,])all([\s,]|$)/.test(val) || LAYOUT_PROPS.some((p) => new RegExp('(^|[\\s,])' + p + '(?:-[a-z]+)?([\\s,]|$)').test(val))) {
      transLayout = true;
    }
  }
  if (transLayout) {
    add('motion-transition-layout', 'warn', 'a transition animates a layout/paint property (or "all"); prefer transform and opacity', 'Transition transform and opacity only.');
  }

  // --- Text hygiene (warnings - taste is advice, not law) ---
  // Alex, 2026-07-11: a user's own tile is theirs to personalize, emoji and
  // all. These warn so the receipt still teaches the native Vitality voice,
  // but they never block. Only safety, function, and data honesty block.
  // Glyph coverage: emoji + symbols + pictographs (1F000-1FAFF), misc symbols
  // (2600-26FF), alarm-clock/hourglass (2300-23FF), dingbats incl. sparkles
  // (2700-27BF), stars/arrows (2B00-2BFF), variation selectors (FE00-FE0F),
  // and flag letters (1F1E6-1F1FF).
  if (/[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2300}-\u{23FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u.test(html)) {
    add('no-emoji', 'warn', 'an emoji or decorative glyph was found; the native Vitality voice draws glyphs as inline SVG', 'For the native look, use inline SVG glyphs instead of emoji.');
  }
  if (/[—–]/.test(html)) {
    add('no-em-dash', 'warn', 'an em or en dash was found; the native Vitality voice uses commas, periods, or colons', 'For the native look, avoid em dashes in copy.');
  }
  if (/[✅✓✔✖✗✘❌]/u.test(html)) {
    add('no-unicode-check', 'warn', 'a unicode checkmark or cross glyph was found; the native Vitality voice draws these as inline SVG', 'For the native look, use an inline SVG glyph.');
  }

  // --- State, storage, brand (warnings) ---
  // Brace-match each try{...} body and flag a localStorage access that falls OUTSIDE
  // every one, not merely the presence-of-any-try substring check (which a single
  // unrelated try anywhere in the file would satisfy, hiding a bare access).
  {
    const tryRanges = matchedBlocks(html, /\btry\b\s*\{/g);
    const inTry = (idx: number) => tryRanges.some(([a, b]) => idx > a && idx < b);
    const lsRe = /localStorage\s*\./g;
    let sm: RegExpExecArray | null;
    while ((sm = lsRe.exec(html))) {
      if (!inTry(sm.index)) {
        add('storage-unwrapped', 'warn', 'localStorage is accessed outside a try/catch; a sealed iframe can throw or be cleared', 'Wrap reads and writes in try/catch with an in-memory fallback.');
        break;
      }
    }
  }
  // The host iframe forces color-scheme: light (app/globals.css) because a tile
  // document that resolves to a dark color-scheme makes Chrome paint an opaque
  // white canvas behind the transparent iframe. A tile declaring dark (in CSS or
  // a <meta name="color-scheme">) reintroduces that bug, so it is floor-rejected.
  if (
    /color-scheme\s*:\s*[^;}"']*\bdark\b/i.test(styleBlocks) ||
    /<meta[^>]*\bname\s*=\s*["']color-scheme["'][^>]*\bcontent\s*=\s*["'][^"']*\bdark\b/i.test(html)
  ) {
    add('color-scheme-dark', 'error', 'the tile declares a dark color-scheme; the host forces color-scheme: light on tile iframes, and a dark declaration makes the browser paint an opaque white canvas behind the tile', 'Remove the color-scheme declaration entirely; the host controls it.');
  }
  const bodyMatch = styleBlocks.match(/body\s*\{([^}]*)\}/i);
  if (bodyMatch) {
    const bg = bodyMatch[1].match(/background(?:-color)?\s*:\s*([^;]+)/i);
    if (bg) {
      const v = bg[1].trim().toLowerCase();
      if (!/transparent|none|rgba\([^)]*,\s*0\s*\)/.test(v)) {
        add('body-not-transparent', 'warn', 'the tile body sets an opaque background; the host paints the page, the tile body stays transparent', 'Use background: transparent on body.');
      }
    }
  }
  if (!/#6ee7b7/i.test(html) && !/var\(\s*--mint/i.test(html)) {
    add('brand-mint-missing', 'warn', 'no mint accent (#6EE7B7) found; the tile reads off-brand', 'Use mint #6EE7B7 as the accent.');
  }
  if (!/::selection/i.test(html)) {
    add('selection-style-missing', 'warn', 'no ::selection styling; the OS blue highlight will show', 'Add a mint ::selection rule.');
  }
  const hasMotion = /@keyframes/i.test(styleBlocks) || /transition\s*:/i.test(styleBlocks) || /animation\s*:/i.test(styleBlocks);
  if (hasMotion && !/prefers-reduced-motion/i.test(html)) {
    add('reduced-motion-missing', 'warn', 'the tile animates but has no prefers-reduced-motion block', 'Add a reduced-motion media query that disables animation.');
  }
  if (/\.select\s*\(\s*\)/.test(html)) {
    add('select-not-focus', 'warn', '.select() highlights the value as a blue block; focus the input instead', 'Use .focus(), not .select().');
  }

  // --- Host bridge (warning): a real tile speaks to the host through the Vitality bridge ---
  // The bridge (Vitality.save / load / report) is the ONLY channel out of the sealed
  // iframe and the difference between a Vitality tile and a stray HTML page. A tile with
  // no bridge reference at all persists nothing and reports nothing, so it can never land
  // data on the dashboard. It is flagged as a quality nudge (not a hard-floor error) so a
  // deliberately-minimal fixture still exports; every real template calls the bridge, and
  // the envelope's report-contract probe already rejects a bridgeless stream on the wired
  // upload path. At least one of Vitality.save/load/report should be present.
  const hasBridge = /Vitality\s*\.\s*(?:save|load|report)\b/.test(html);
  if (!hasBridge) {
    add('bridge-missing', 'warn', 'no Vitality host bridge call found (no Vitality.save, Vitality.load, or Vitality.report); a tile with no bridge cannot persist its data or land a stream on the dashboard', 'Call the Vitality bridge: Vitality.save/load to persist, Vitality.report to send its one stream.');
  }

  // --- Report contract ---
  // A measurable tile's whole point is to feed Vee: it MUST emit one contract-valid
  // Vitality.report(). So a report that IS present but malformed is now a hard-floor
  // ERROR (not a warning): a broken stream lands nothing and silently poisons the
  // cross-reference engine, which is worse than no tile. `report-multiple` stays a
  // warning (a second call is wrong but not corrupting). Whether a tile that emits
  // ZERO reports is allowed is kind-dependent and enforced at the envelope
  // (assertTileExportable, which knows the tile's kind); lint here is HTML-only.
  const REPORT_KINDS = ['intake', 'count', 'duration', 'rating', 'measure', 'money', 'done'];
  const reportCount = (html.match(/Vitality\.report\s*\(/g) || []).length;
  if (reportCount > 1) {
    add('report-multiple', 'warn', 'more than one Vitality.report() call; a tile reports at most one stream', 'Report a single number.');
  }
  if (reportCount >= 1) {
    const args = firstCallArgs(html, html.search(/Vitality\.report\s*\(/));
    const missing = ['key', 'value', 'date', 'kind'].filter((k) => !new RegExp('\\b' + k + '\\s*:').test(args));
    if (missing.length) {
      add('report-shape', 'error', 'a Vitality.report() call is missing required fields (' + missing.join(', ') + '); a broken stream lands nothing on the dashboard', 'Report {key, label, value, date, kind}.');
    }
    // The kind literal, when written inline, must be a member of the fixed taxonomy;
    // a typo'd kind is silently dropped by validateReport, so catch it at the floor.
    const kindLit = /\bkind\s*:\s*['"]([^'"]*)['"]/.exec(args);
    if (kindLit && !REPORT_KINDS.includes(kindLit[1])) {
      add('report-kind-invalid', 'error', 'a Vitality.report() call uses a kind ("' + kindLit[1] + '") outside the fixed taxonomy (' + REPORT_KINDS.join(', ') + ')', 'Use one of: ' + REPORT_KINDS.join(', ') + '.');
    }
  }

  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warn').length;
  return { ok: errors === 0, errors, warnings, findings };
}
