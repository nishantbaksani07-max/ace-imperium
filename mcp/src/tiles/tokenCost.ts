// FILE D — the TOKEN METER for the tile-builder beacon.
//
// The whole reason the deterministic path (scaffold_tile: infer() + renderTile()) exists
// is COST. It returns a finished, pre-built ~5K-token tile with ZERO model generation and
// ZERO kit reading. The generative path (vitality_tile_kit -> Claude hand-writes the HTML)
// costs the kit bundle the model must READ (a domain bundle is tens of thousands of
// tokens; the full pack ~120K) PLUS the tokens it then generates. This meter measures both
// so a receipt can prove, in numbers, how much the deterministic path saves — and, as a
// regression guard, that a future template upgrade never quietly bloats the cheap path
// back toward the expensive one.
//
// Token estimate: the standard ~4 bytes/token heuristic (estTokens). Good enough for a
// budget receipt — we care about the ORDER OF MAGNITUDE gap between the two paths, not a
// tokenizer-exact count. Pure + IO-light (reads the kit pack the same way the tool does).

import { scaffoldTile } from '../scaffoldTile.js';
import { buildKit, DOMAIN } from '../tileKit.js';

/** The ~4-bytes-per-token heuristic. Deterministic + pure. */
export function estTokens(bytes: number): number {
  return Math.ceil(bytes / 4);
}

/** Estimate the token cost of a UTF-8 string. */
export function tokensOf(s: string): number {
  return estTokens(Buffer.byteLength(s, 'utf8'));
}

/**
 * A representative goal per template kind (+ the sleep-hours timer variant), so the meter
 * measures the real spread of what scaffold_tile emits — not one cherry-picked tile. Every
 * one of the six templates is here, plus the two timer modes.
 */
export const REP_TILES: Array<{ name: string; goal: string }> = [
  { name: 'counter (target)', goal: 'track my water' },
  { name: 'counter (no target)', goal: 'count my pushups' },
  { name: 'timer (minutes)', goal: 'meditation minutes' },
  { name: 'timer (hours/sleep)', goal: 'hours of sleep' },
  { name: 'scale', goal: 'rate my mood out of 10' },
  { name: 'measure', goal: 'log my weight' },
  { name: 'money', goal: 'track my daily spend' },
  { name: 'toggle', goal: 'did I read today' },
];

export interface ScaffoldCost {
  name: string;
  bytes: number;
  tokens: number;
}

/** Measure every representative scaffold tile's output cost. */
export function scaffoldCosts(): ScaffoldCost[] {
  return REP_TILES.map(({ name, goal }) => {
    const { html } = scaffoldTile({ goal });
    const bytes = Buffer.byteLength(html, 'utf8');
    return { name, bytes, tokens: estTokens(bytes) };
  });
}

export interface TokenReport {
  scaffolds: ScaffoldCost[];
  /** The cheap-path worst case: the largest scaffold tile the beacon emits. */
  worstScaffold: ScaffoldCost;
  /** The cheap-path average. */
  avgScaffoldTokens: number;
  /** A representative kit DOMAIN bundle the model must READ on the generative path. */
  domainBundleTokens: number;
  /** The full kit pack (the maximal generative-path read). */
  fullPackTokens: number;
  /** How many scaffold-average reads the full pack costs (the order-of-magnitude gap). */
  fullPackVsAvg: number;
  /** How many scaffold-average reads one domain bundle costs. */
  domainVsAvg: number;
}

export function computeTokenReport(sampleDomain = 'food'): TokenReport {
  const scaffolds = scaffoldCosts();
  const worstScaffold = scaffolds.reduce((a, b) => (b.tokens > a.tokens ? b : a));
  const avgScaffoldTokens = Math.round(scaffolds.reduce((s, c) => s + c.tokens, 0) / scaffolds.length);
  const domainBundleTokens = tokensOf(buildKit({ domain: sampleDomain }));
  const fullPackTokens = tokensOf(buildKit({ full: true, confirm: true }));
  return {
    scaffolds,
    worstScaffold,
    avgScaffoldTokens,
    domainBundleTokens,
    fullPackTokens,
    fullPackVsAvg: Math.round((fullPackTokens / avgScaffoldTokens) * 10) / 10,
    domainVsAvg: Math.round((domainBundleTokens / avgScaffoldTokens) * 10) / 10,
  };
}

/** The smallest and largest domain bundle across every registered domain (context for the
 *  receipt: even the LEANEST generative bundle dwarfs a scaffold tile). */
export function domainBundleRange(): { minTokens: number; maxTokens: number; count: number } {
  const seen = new Set<string>();
  let min = Infinity;
  let max = 0;
  let count = 0;
  for (const d of Object.keys(DOMAIN)) {
    if (seen.has(d)) continue;
    seen.add(d);
    const t = tokensOf(buildKit({ domain: d }));
    if (t < min) min = t;
    if (t > max) max = t;
    count++;
  }
  return { minTokens: min, maxTokens: max, count };
}

/** Render the before/after receipt as printable lines (the caller console.logs them so the
 *  numbers surface in the test run). "before" = the generative path a user would otherwise
 *  pay; "after" = the deterministic path this beacon ships. */
export function formatReceipt(r: TokenReport = computeTokenReport()): string {
  const range = domainBundleRange();
  const pad = (s: string, n: number) => s.padEnd(n);
  const lines: string[] = [];
  lines.push('──────────────────────────────────────────────────────────────');
  lines.push(' TILE BUILDER TOKEN RECEIPT  (est. ~4 bytes/token)');
  lines.push('──────────────────────────────────────────────────────────────');
  lines.push(' AFTER  — deterministic path (scaffold_tile): the tile the model');
  lines.push('          returns with ZERO generation, per template kind:');
  for (const s of r.scaffolds) {
    lines.push(`   ${pad(s.name, 22)} ${String(s.bytes).padStart(6)} B  ~${String(s.tokens).padStart(5)} tok`);
  }
  lines.push(`   ${pad('avg scaffold', 22)}          ~${String(r.avgScaffoldTokens).padStart(5)} tok`);
  lines.push(`   ${pad('worst scaffold', 22)}          ~${String(r.worstScaffold.tokens).padStart(5)} tok  (${r.worstScaffold.name})`);
  lines.push('');
  lines.push(' BEFORE — generative path (vitality_tile_kit): what the model must');
  lines.push('          READ before it even starts hand-writing the HTML:');
  lines.push(`   ${pad('domain bundle (food)', 22)}          ~${String(r.domainBundleTokens).padStart(5)} tok  (${r.domainVsAvg}x avg scaffold)`);
  lines.push(`   ${pad('domain bundles range', 22)}   ${String(range.minTokens).padStart(6)}..${range.maxTokens} tok over ${range.count} domains`);
  lines.push(`   ${pad('full pack', 22)}          ~${String(r.fullPackTokens).padStart(5)} tok  (${r.fullPackVsAvg}x avg scaffold)`);
  lines.push('──────────────────────────────────────────────────────────────');
  lines.push(` SAVINGS: the deterministic path returns a finished tile for ~${r.avgScaffoldTokens} tok`);
  lines.push(`          vs a ~${r.domainBundleTokens}+ tok read (then generation) on the kit path.`);
  lines.push('──────────────────────────────────────────────────────────────');
  return lines.join('\n');
}

/** The ceiling that stops any future template upgrade from dragging the cheap path back
 *  toward the expensive one. The current worst scaffold is ~5.3K tokens; the ceiling is
 *  set with honest headroom so an incremental tweak passes but a template that DOUBLES in
 *  size (the "expensive path creeping back in" regression) trips it. */
export const SCAFFOLD_TOKEN_CEILING = 6000;
