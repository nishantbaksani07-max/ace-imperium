// The Vitality tile kit: serve the reference pack (design DNA, data libraries, API
// recipes, and the hard-won gotchas rulebook) to a builder's Claude Code so a tile
// comes out on-brand, knows the domain, and dodges the bugs Alex already fixed.
//
// Pure read of files under mcp/{dna,data,recipes,lessons} + MCP-VALUE.md. Section
// lookup is whitelisted by the on-disk index, so a name can never escape the pack
// (no path traversal). PACK_ROOT resolves to mcp/ from both src/ (tsx dev) and dist/.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const PACK_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); // mcp/ (from src/ via tsx or dist/); avoids new URL('../') which webpack cannot resolve
const FOLDERS = ['dna', 'data', 'recipes', 'lessons'] as const;

export interface KitSection {
  name: string;
  folder: string;
  path: string;
}

/** Build the name -> file index fresh each call (cheap, and picks up new files). */
function index(): Map<string, KitSection> {
  const m = new Map<string, KitSection>();
  const top = join(PACK_ROOT, 'MCP-VALUE.md');
  if (existsSync(top)) m.set('MCP-VALUE', { name: 'MCP-VALUE', folder: '.', path: top });
  for (const folder of FOLDERS) {
    const dir = join(PACK_ROOT, folder);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.md')) continue;
      const name = file.slice(0, -3);
      if (!m.has(name)) m.set(name, { name, folder, path: join(dir, file) });
    }
  }
  return m;
}

export function listSections(): KitSection[] {
  return [...index().values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Read one section by name. Returns null for an unknown name (which also blocks
 *  traversal, since only indexed basenames resolve). */
export function readSection(name: string): string | null {
  const sec = index().get(name);
  if (!sec) return null;
  try {
    return readFileSync(sec.path, 'utf8');
  } catch {
    return null;
  }
}

// The universal Vitality look + rules every tile needs. Exported so a test can prove
// every name resolves to a real file on disk (concat() silently skips a missing one).
// Uses the distilled `gotchas-top` (~0.9K words) not the full `gotchas` (~6K words):
// the 20 highest-leverage rules cover the common tile, and `check_tile` still enforces
// the full hard floor on the finished HTML, so nothing is lost. A builder who needs the
// overlay/chart/form rules or a rule's reasoning pulls {section:"gotchas"} on demand.
//
// BASE serves the LEAN cores of motion + icons (motion-core / icons-core), not the full
// ~22K-char files: every tile build was carrying both in full when a typical tile uses a
// third of each. The full motion.md / icons.md stay one {section:"motion"|"icons"} away,
// and check_tile still enforces the whole floor on the finished HTML. This alone takes a
// domain bundle down by ~27K chars with zero rule loss.
export const BASE = ['gotchas-top', 'theme', 'voice', 'motion-core', 'components', 'icons-core'];

// The lightest bundle that still clears the floor, for a token-conscious build
// ({domain:"...", lean:true}): the top rules + theme tokens + reusable components, plus
// the domain's own data + sealed example. Everything else is a {section} call away, and
// check_tile is the backstop. Opt-in — the default domain bundle stays rich.
export const LEAN_BASE = ['gotchas-top', 'theme', 'components'];

// Domain-specific reference added on top of BASE.
export const DOMAIN: Record<string, string[]> = {
  food: ['food-library', 'feature-fuel', 'api-plugins'],
  nutrition: ['food-library', 'feature-fuel', 'api-plugins'],
  macro: ['food-library', 'feature-fuel', 'api-plugins'],
  // The sealed `example-workout-tile` (a complete 0/0 tile) is the paste-and-adapt ceiling,
  // the workout twin of `example-markets-tile`. The older `example-workout-logger` anatomy
  // doc (no complete sealed HTML) stays available on demand via {section} but is no longer
  // bundled — the sealed tile teaches the same patterns as a working whole.
  workout: ['exercise-library', 'example-workout-tile'],
  training: ['exercise-library', 'example-workout-tile'],
  lift: ['exercise-library', 'example-workout-tile'],
  supplement: ['supplement-library', 'feature-weight-supps'],
  weight: ['feature-weight-supps'],
  measure: ['feature-weight-supps'],
  vee: ['vee-noticed', 'feature-vee', 'ai-mentor', 'example-mentor-tile', 'feature-interactions'],
  mind: ['vee-noticed', 'feature-vee', 'ai-mentor', 'example-mentor-tile', 'feature-interactions'],
  mood: ['vee-noticed', 'feature-vee', 'ai-mentor', 'example-mentor-tile', 'feature-interactions'],
  peak: ['feature-peak', 'feature-interactions'],
  energy: ['feature-peak', 'feature-interactions'],
  // Any keyed-AI tile: the Vee voice + the bring-your-own-key Claude recipe + the
  // complete worked-example mentor tile (a full 0/0 sealed chat tile to build from).
  mentor: ['feature-vee', 'ai-mentor', 'example-mentor-tile'],
  chat: ['feature-vee', 'ai-mentor', 'example-mentor-tile'],
  chatbot: ['feature-vee', 'ai-mentor', 'example-mentor-tile'],
  coach: ['feature-vee', 'ai-mentor', 'example-mentor-tile'],
  ai: ['feature-vee', 'ai-mentor', 'example-mentor-tile', 'api-plugins'],
  finance: ['feature-finance-brand', 'api-plugins', 'example-markets-tile'],
  money: ['feature-finance-brand', 'api-plugins', 'example-markets-tile'],
  brand: ['feature-finance-brand'],
  vitals: ['feature-vitals'],
  goals: ['feature-goals-water', 'feature-celebrations'],
  habit: ['feature-goals-water', 'feature-celebrations'],
  streak: ['feature-goals-water', 'feature-celebrations'],
  water: ['feature-goals-water'],
  // Onboarding/quiz tiles: wire the formerly-orphaned feature-onboarding-quiz doc to a
  // real domain key so a builder can actually reach it with {domain:"quiz"} instead of
  // only by exact {section} name.
  quiz: ['feature-onboarding-quiz'],
  onboarding: ['feature-onboarding-quiz'],
};

function concat(names: string[]): string {
  const out: string[] = [];
  for (const n of names) {
    const c = readSection(n);
    if (c) out.push(`\n\n===== ${n} =====\n\n${c}`);
  }
  return out.join('');
}

export interface KitRequest {
  section?: string;
  domain?: string;
  full?: boolean;
  /** With {domain}, serve the LEAN_BASE (top rules + theme + components) instead of the
   *  full BASE, for a token-conscious build. check_tile still enforces the whole floor. */
  lean?: boolean;
}

// Lessons + the maintainer README duplicate what gotchas already teaches (in symptom form)
// or the manifest already lists, so they only inflate the {full} pack. Keep them reachable
// by exact {section} name, but leave them out of the everything-concat.
const FULL_PACK_EXCLUDE = new Set(['from-docs', 'from-git', 'README']);

// The whole pack is ~53K words (~70K tokens). It is almost never the right read: a
// {domain:...} bundle already carries the base look + that domain's data + recipes, and
// any one file is a {section:...} away. So {full:true} is gated behind an explicit
// confirm to keep it from being pulled by reflex and torching a builder's context. The
// gate is a plain guardrail, not a paywall: pass {full:true, confirm:true} to override.
const FULL_PACK_WORDS_HINT = 53_000;

export function buildKit(opts: KitRequest & { confirm?: boolean } = {}): string {
  if (opts.section) {
    const c = readSection(opts.section);
    return c ?? `No section "${opts.section}". Available: ${listSections().map((s) => s.name).join(', ')}`;
  }
  if (opts.full) {
    if (!opts.confirm) {
      return [
        `The full pack is ~${(FULL_PACK_WORDS_HINT / 1000) | 0}K words (~70K tokens) and you almost never need it.`,
        'Prefer a focused read:',
        '  - {domain:"food|workout|supplement|vee|mentor|finance|vitals|goals"} = base look + that domain\'s data + recipes (~20-27K words).',
        '  - {section:"<name>"} = one file (e.g. theme, motion, gotchas, food-library, example-markets-tile).',
        'If you truly need everything, re-call with {full:true, confirm:true}.',
      ].join('\n');
    }
    return concat(listSections().map((s) => s.name).filter((n) => !FULL_PACK_EXCLUDE.has(n)));
  }
  if (opts.domain) {
    const extras = DOMAIN[opts.domain.trim().toLowerCase()] ?? [];
    return concat([...(opts.lean ? LEAN_BASE : BASE), ...extras]);
  }
  // default: orientation. Serves the distilled top-rules digest (not the full 6K-word
  // gotchas), the pack's value line, and the section manifest so the caller can go
  // deeper on demand. This is the most-called kit read, so it is the leanest.
  const manifest = listSections()
    .filter((s) => s.name !== 'README') // internal doc, not a tile reference
    .map((s) => `  - ${s.name} (${s.folder})`)
    .join('\n');
  return [
    'VITALITY TILE KIT. Read this before building a tile. It hands your Claude the exact',
    'Vitality look, the domain data, and the bugs Alex already fixed, so the tile lands',
    'pro and on-brand instead of generic. Then call again with',
    '{domain:"food|workout|supplement|vee|mentor|finance|vitals|goals|quiz"} for a focused',
    'bundle (use "mentor" or "ai" for a bring-your-own-key Claude chatbot tile), add',
    '{lean:true} for the lightest bundle that still clears the floor, or {section:"<name>"}',
    'for one reference file. For the richest tiles, read a sealed ceiling example and swap',
    'its domain: {section:"example-markets-tile"} (finance) or {section:"example-workout-tile"}',
    '(workout) — each a complete, sealed, responsive tile that passes the floor at 0 errors /',
    '0 warnings. BASE serves the lean motion-core / icons-core; pull {section:"motion"} or',
    '{section:"icons"} for the full set, and {section:"gotchas"} for a rule\'s reasoning or the',
    'overlay, chart, form, and input rules.',
    concat(['gotchas-top']),
    '\n\n===== available sections =====\n' + manifest,
  ].join('\n');
}
