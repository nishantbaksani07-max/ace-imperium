// The upload envelope: the lego stud between the MCP (builder) and the dashboard
// LIBRARY tile (consumer). The MCP fills it; the Library receives + lists + places it.
// Pure + IO-free. The transport (POST to the Library endpoint) is brick 3; this is the
// agreed SHAPE both windows build to. See docs/tile-upload-contract.md.

import { validateReport, type ReportKind, type GoalDirection } from './reportContract.js';
import { lintTile, type LintFinding } from './lintTile.js';
import type { TileMeta } from './infer.js';

export const CATEGORIES = ['fitness', 'health', 'finance', 'mind', 'data'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface TileUploadEnvelope {
  v: 1;
  html: string;
  stream: {
    key: string;
    label: string;
    kind: ReportKind;
    goalDirection?: GoalDirection;
  };
  name: string;
  category: Category;
  color: string;
  design?: string;
}

const KIND_TO_CATEGORY: Record<ReportKind, Category> = {
  money: 'finance',
  measure: 'health',
  intake: 'health',
  duration: 'mind',
  rating: 'mind',
  done: 'mind',
  count: 'fitness',
};

const MINT = '#6EE7B7';

// The kinds that carry a real number Vee can cross-reference. A tile of one of these
// kinds MUST emit a Vitality.report() or it is a measurable tile that feeds nothing,
// the exact failure this gate closes. `done` is included: a habit reports value 1 on
// the day it is marked (like the stretch-done tile), so it too owns a stream. The only
// kinds that may legitimately report NOTHING are non-metric note/mentor tiles, which do
// not carry one of these kinds at all.
const REPORTING_KINDS = new Set<ReportKind>(['intake', 'count', 'duration', 'rating', 'measure', 'money', 'done']);

/** True when a tile of this kind must feed Vee via Vitality.report(). */
export function kindMustReport(kind: ReportKind | undefined): boolean {
  return kind !== undefined && REPORTING_KINDS.has(kind);
}

// Pull the raw argument text of the first Vitality.report(...) call out of the sealed
// HTML, or null when no call exists. String-literal aware, so a ')' inside a label (or
// a crafted name) cannot truncate the args and read the call as broken.
function reportCallArgs(html: string): string | null {
  const idx = html.search(/Vitality\.report\s*\(/);
  if (idx < 0) return null;
  const open = html.indexOf('(', idx);
  if (open < 0) return null;
  let depth = 0;
  let quote = '';
  for (let i = open; i < html.length; i++) {
    const c = html[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
    } else if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return html.slice(open + 1, i);
    }
  }
  return null;
}

// A contract-valid report() call in the sealed HTML: the call exists AND names all four
// required fields (key, value, date, kind). This is the same shape the lint floor and
// validateReport enforce; here it answers "does this HTML actually emit its stream".
function htmlHasValidReport(html: string): boolean {
  const args = reportCallArgs(html);
  if (args === null) return false;
  return ['key', 'value', 'date', 'kind'].every((k) => new RegExp('\\b' + k + '\\s*:').test(args));
}

/**
 * Best-effort read of the stream identity a hand-built tile's own Vitality.report()
 * declares, so a stored tile row can carry the SAME key/label/goalDirection the tile
 * will actually report at runtime (the declared stream share/publish round-trips keep).
 * Only plain string literals are readable statically; a dynamic field comes back
 * undefined and the caller falls back to the tile name. Null when no report() exists.
 */
export function reportIdentityFromHtml(
  html: string,
): { key?: string; label?: string; goalDirection?: GoalDirection } | null {
  const args = reportCallArgs(html);
  if (args === null) return null;
  const lit = (field: string): string | undefined => {
    const m = args.match(new RegExp('\\b' + field + '\\s*:\\s*(?:\'([^\'\\\\]*)\'|"([^"\\\\]*)"|`([^`\\\\]*)`)'));
    if (!m) return undefined;
    const v = m[1] ?? m[2] ?? m[3];
    return v && v.trim() ? v : undefined;
  };
  const gd = lit('goalDirection');
  return {
    key: lit('key'),
    label: lit('label'),
    ...(gd === 'up' || gd === 'down' || gd === 'neutral' ? { goalDirection: gd } : {}),
  };
}

/**
 * The kind a hand-built tile's own Vitality.report() declares, or null when the call
 * is absent, dynamic, or names a kind outside the locked 7. This is how a dropped
 * file (no envelope, no tool call) tells the gate which stream shape it speaks:
 * a non-null kind marks the tile Vee-readable and picks its Library category.
 */
export function reportKindFromHtml(html: string): ReportKind | null {
  const args = reportCallArgs(html);
  if (args === null) return null;
  const m = args.match(/\bkind\s*:\s*(?:'([^'\\]*)'|"([^"\\]*)"|`([^`\\]*)`)/);
  const v = (m && (m[1] ?? m[2] ?? m[3]))?.trim();
  return v && REPORTING_KINDS.has(v as ReportKind) ? (v as ReportKind) : null;
}

// The envelope's color becomes the Library's CSS accent for the tile, so it is an
// untrusted value crossing into the dashboard. Only a 3- or 6-digit hex is allowed;
// anything else falls back to mint rather than shipping an arbitrary string.
const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
export function sanitizeColor(color?: string): string {
  const v = (color && color.trim()) || '';
  return HEX_COLOR.test(v) ? v : MINT;
}

/** Default category for a tile's kind (a hint; the user can override in the Library). */
export function categoryForKind(kind: ReportKind): Category {
  return KIND_TO_CATEGORY[kind];
}

/**
 * The locked door, enforced at the envelope (the trust boundary into the Library),
 * so EVERY path that packages a tile, not just buildUploadTile, refuses an off-brand
 * or unsealed one. A hard-floor lint ERROR blocks; polish warnings never do. Throws a
 * fix-it list naming every blocking rule so the caller's Claude can iterate to green.
 *
 * When `kind` is known (the envelope and the hand-built addTile path both carry it),
 * a MEASURABLE tile (intake/count/duration/rating/measure/money, plus done) that emits
 * no contract-valid Vitality.report() is refused HERE: lint alone cannot judge this
 * (it never sees the kind), but a measurable tile that feeds Vee nothing is not
 * exportable. This is the enforcement that makes report() the default a measurable tile
 * cannot silently drop. A note/mentor tile carries no reporting kind and is unaffected.
 *
 * opts.lintProven: the caller verified a check_tile Proof for this EXACT html
 * (verifyCheckProof in checkTile.ts), so the identical lint just ran and passed -
 * skip re-running it. The kind-aware report gate below ALWAYS runs (check_tile
 * never knew the kind), and any absent/stale proof falls back to the full lint.
 */
export function assertTileExportable(
  html: string,
  label = 'tile',
  kind?: ReportKind,
  opts?: { lintProven?: boolean },
): void {
  const errs: LintFinding[] = opts?.lintProven
    ? []
    : lintTile(html).findings.filter((f) => f.severity === 'error');
  // Kind-aware floor: a measurable tile must actually emit its stream.
  if (kindMustReport(kind) && !htmlHasValidReport(html)) {
    errs.push({
      rule: 'report-missing',
      severity: 'error',
      message: `a "${kind}" tile is measurable but emits no contract-valid Vitality.report(); it would land nothing on the dashboard and feed Vee nothing`,
      hint: 'Add one Vitality.report({key,label,value,date,kind}) call that posts the tile\'s number.',
    });
  }
  // The no-maybes floor (ALWAYS runs, even lintProven - check_tile never judged
  // this): a tile that carries a report() call but whose declared kind is not a
  // readable literal from the locked 7 is REFUSED, not admitted as "quiet".
  // Otherwise it would enter marked Vee-unreadable and then report at runtime
  // anyway - an unclassified stream talking to Vee behind the gate's back.
  // When the gate cannot read a stream with certainty, the door stays shut.
  if (kind === undefined && htmlHasValidReport(html) && reportKindFromHtml(html) === null) {
    errs.push({
      rule: 'report-unclassified',
      severity: 'error',
      message: 'the tile calls Vitality.report() but its kind is not a plain literal from the locked 7 (intake, count, duration, rating, measure, money, done); the gate refuses a stream it cannot classify with certainty',
      hint: "Write kind as a plain quoted string in the report call, e.g. kind: 'count' - never a variable or expression.",
    });
  }
  if (errs.length === 0) return;
  const lines = errs.map((f) => `  - ${f.rule}: ${f.message}${f.hint ? ` -> ${f.hint}` : ''}`);
  throw new Error(
    `Cannot export "${label}": it breaks Vitality's hard floor ` +
      `(${errs.length} error${errs.length === 1 ? '' : 's'} must be fixed; warnings never block).\n` +
      lines.join('\n') +
      `\nFix every error (run check_tile to iterate) before uploading.`,
  );
}

export interface BuildEnvelopeInput {
  html: string;
  meta: Pick<TileMeta, 'key' | 'label' | 'kind' | 'goalDirection'>;
}

export interface EnvelopeOptions {
  name?: string;
  category?: Category;
  color?: string;
  design?: string;
}

/**
 * Fill a TileUploadEnvelope from a built tile. Auto-fills name (the tile's label),
 * category (from kind), and color (mint); any of these is overridable. `design` is an
 * optional hint only — the MCP never invents the dashboard's design IDs. No createdAt:
 * the Library stamps receipt time so the displayed upload date is trustworthy.
 */
export function buildUploadEnvelope(input: BuildEnvelopeInput, opts: EnvelopeOptions = {}): TileUploadEnvelope {
  const { html, meta } = input;
  // Enforce the hard floor (sealed, on-brand, no injection) at the boundary itself,
  // AND the kind-aware rule that a measurable tile must actually emit its stream.
  assertTileExportable(html, (opts.name && opts.name.trim()) || meta.label, meta.kind);
  // Enforce the report contract on the stream identity here too, not just on the one
  // wired path. A probe value/date stands in for the fields the envelope itself does
  // not carry, so an invalid key/label/kind cannot ship.
  const probe = validateReport({
    key: meta.key,
    label: meta.label,
    value: 0,
    date: '2000-01-01',
    kind: meta.kind,
    ...(meta.goalDirection ? { goalDirection: meta.goalDirection } : {}),
  });
  if (!probe.ok) throw new Error(`tile stream is not contract-valid: ${probe.error}`);

  return {
    v: 1,
    html,
    stream: {
      key: meta.key,
      label: meta.label,
      kind: meta.kind,
      ...(meta.goalDirection ? { goalDirection: meta.goalDirection } : {}),
    },
    name: (opts.name && opts.name.trim()) || meta.label,
    category: opts.category ?? categoryForKind(meta.kind),
    color: sanitizeColor(opts.color),
    ...(opts.design && opts.design.trim() ? { design: opts.design.trim() } : {}),
  };
}
