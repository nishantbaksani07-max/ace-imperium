#!/usr/bin/env node
// The Vitality tile self-check — a runnable port of the app's canonical linter
// (mcp/src/tiles/lintTile.ts). Pure, no dependencies. Checks that a generated tile
// meets Vitality's hard floor before it ships. Errors ARE the floor (a tile that
// trips one is not Vitality-grade); warnings are quality nudges.
//
//   node lint.mjs yourtile.html          # lint one file
//   node lint.mjs a.html b.html          # lint several
//   cat tile.html | node lint.mjs        # lint stdin
//
// Exits non-zero if any file has an error. Keep in sync with lintTile.ts (canonical).

import { readFileSync } from 'node:fs';

// Props that trigger layout or paint every frame; animating them drops below 60fps.
const LAYOUT_PROPS = [
  'width', 'height', 'top', 'left', 'right', 'bottom', 'margin', 'padding',
  'box-shadow', 'backdrop-filter', 'inset', 'gap', 'font-size', 'line-height',
  'flex-basis', 'aspect-ratio', 'block-size', 'inline-size',
  'min-width', 'max-width', 'min-height', 'max-height',
  'grid-template-columns', 'grid-template-rows',
];

/** Pull the body of every @keyframes block (brace-matched, so nested {} are safe). */
function extractKeyframes(css) {
  const out = [];
  const re = /@keyframes\b/gi;
  let m;
  while ((m = re.exec(css))) {
    const open = css.indexOf('{', m.index);
    if (open < 0) continue;
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') {
        depth--;
        if (depth === 0) { out.push(css.slice(open, i + 1)); break; }
      }
    }
  }
  return out;
}

/** Brace-match the `{...}` block that follows each match of `opener`. */
function matchedBlocks(s, opener) {
  const ranges = [];
  const re = new RegExp(opener.source, opener.flags.includes('g') ? opener.flags : opener.flags + 'g');
  let m;
  while ((m = re.exec(s))) {
    const open = s.indexOf('{', m.index);
    if (open < 0) continue;
    let depth = 0;
    for (let i = open; i < s.length; i++) {
      if (s[i] === '{') depth++;
      else if (s[i] === '}') {
        depth--;
        if (depth === 0) { ranges.push([open, i]); break; }
      }
    }
  }
  return ranges;
}

/** Return the argument substring of the first call starting at/after fromIdx. */
function firstCallArgs(s, fromIdx) {
  const open = s.indexOf('(', fromIdx);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') {
      depth--;
      if (depth === 0) return s.slice(open + 1, i);
    }
  }
  return s.slice(open + 1);
}

export function lintTile(html) {
  const findings = [];
  const add = (rule, severity, message, hint) => findings.push({ rule, severity, message, hint });

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
  if (/\bimport\s*\(\s*["'](?:https?:)?\/\//i.test(html) || /\bfrom\s+["'](?:https?:)?\/\//i.test(html)) {
    add('sealed-external-script', 'error', 'JavaScript loads code from an external URL (import/from); a tile inlines all JS', 'Inline everything, no remote import.');
  }
  if (/createElement\s*\(\s*["']script["']/i.test(html) || /document\.write\s*\(/i.test(html)) {
    add('sealed-dynamic-script', 'error', 'a script element is injected at runtime (createElement("script")/document.write); a sealed tile inlines all code and loads none at runtime', 'Inline every script; never inject one with JS.');
  }
  const linkRe = /<link\b[^>]*\bhref\s*=\s*["']?((?:https?:)?\/\/[^"'>\s]+)/gi;
  let lm;
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

  // Script-tag balance: a </script> at depth 0 is a stray close (injection tell).
  {
    const tags = html.match(/<script\b[^>]*>|<\/script\s*>/gi) || [];
    let depth = 0;
    let stray = false;
    for (const tag of tags) {
      if (/^<\//.test(tag)) { if (depth === 0) { stray = true; break; } depth--; }
      else { depth++; }
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
  for (const kf of extractKeyframes(styleBlocks)) {
    if (/filter\s*:[^;}]*\bblur\s*\(/i.test(kf)) {
      add('motion-keyframe-blur', 'error', 'a @keyframes animation animates filter: blur() (re-blurs the layer every frame, dropping below 60fps)', 'Blur a layer once, then animate its opacity; never animate the blur radius.');
      break;
    }
  }
  const transRe = /transition(?:-property)?\s*:\s*([^;}]+)[;}]/gi;
  let tm;
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

  // --- Text hygiene (errors) ---
  if (/[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2300}-\u{23FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u.test(html)) {
    add('no-emoji', 'error', 'an emoji or decorative glyph was found; draw glyphs as inline SVG', 'Use inline SVG glyphs, never emoji.');
  }
  if (/[—–]/.test(html)) {
    add('no-em-dash', 'error', 'an em or en dash was found; use commas, periods, or colons', 'No em dashes in copy.');
  }
  if (/[✅✓✔✖✗✘❌]/u.test(html)) {
    add('no-unicode-check', 'error', 'a unicode checkmark or cross glyph was found; draw it as inline SVG', 'Inline SVG glyph, not a unicode check.');
  }

  // --- State, storage, brand (warnings) ---
  {
    const tryRanges = matchedBlocks(html, /\btry\b\s*\{/g);
    const inTry = (idx) => tryRanges.some(([a, b]) => idx > a && idx < b);
    const lsRe = /localStorage\s*\./g;
    let sm;
    while ((sm = lsRe.exec(html))) {
      if (!inTry(sm.index)) {
        add('storage-unwrapped', 'warn', 'localStorage is accessed outside a try/catch; a sealed iframe can throw or be cleared', 'Wrap reads and writes in try/catch with an in-memory fallback.');
        break;
      }
    }
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

  // --- Report contract (warnings) ---
  const reportCount = (html.match(/Vitality\.report\s*\(/g) || []).length;
  if (reportCount > 1) {
    add('report-multiple', 'warn', 'more than one Vitality.report() call; a tile reports at most one stream', 'Report a single number.');
  }
  if (reportCount >= 1) {
    const args = firstCallArgs(html, html.search(/Vitality\.report\s*\(/));
    const missing = ['key', 'value', 'date', 'kind'].filter((k) => !new RegExp('\\b' + k + '\\s*:').test(args));
    if (missing.length) {
      add('report-shape', 'warn', 'a Vitality.report() call is missing required fields (' + missing.join(', ') + ')', 'Report {key, label, value, date, kind}.');
    }
  }

  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warn').length;
  return { ok: errors === 0, errors, warnings, findings };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

function report(label, html) {
  const r = lintTile(html);
  const tag = r.ok ? 'PASS' : 'FAIL';
  console.log(`\n${tag}  ${label}  (${r.errors} error${r.errors === 1 ? '' : 's'}, ${r.warnings} warning${r.warnings === 1 ? '' : 's'})`);
  for (const f of r.findings) {
    const sev = f.severity === 'error' ? 'ERR ' : 'warn';
    console.log(`  ${sev} [${f.rule}] ${f.message}`);
    if (f.hint) console.log(`       → ${f.hint}`);
  }
  return r.ok;
}

function main() {
  const files = process.argv.slice(2);
  let ok = true;
  if (files.length === 0) {
    const html = readStdin();
    if (!html.trim()) {
      console.error('usage: node lint.mjs <tile.html> [more.html ...]   (or pipe HTML on stdin)');
      process.exit(2);
    }
    ok = report('<stdin>', html);
  } else {
    for (const file of files) {
      let html;
      try { html = readFileSync(file, 'utf8'); }
      catch (e) { console.log(`\nFAIL  ${file}  (cannot read: ${e.message})`); ok = false; continue; }
      ok = report(file, html) && ok;
    }
  }
  console.log('');
  process.exit(ok ? 0 : 1);
}

// Run as a CLI when invoked directly; stay importable as a module otherwise.
if (import.meta.url === `file://${process.argv[1]}`) main();
