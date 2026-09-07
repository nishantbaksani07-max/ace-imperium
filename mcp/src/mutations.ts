// Write layer for the Vitality MCP — the mutating analogue of queries.ts.
//
// This is the FIRST departure from read-only (BUILD42). Every write here:
//   • runs through the caller's own RLS-scoped client, so it can structurally
//     only ever touch that user's rows (user_id is stamped explicitly too —
//     redundant under RLS, required in service mode);
//   • is gated on the `mcp:write` capability via `requireWrite` BEFORE it runs,
//     so a read-only connection (one that consented to read only) cannot mutate;
//   • validates + normalizes its input and returns a shaped confirmation, never
//     a raw row, so the tool layer can report exactly what changed.
//
// Kept deliberately small + append/upsert-only: no deletes, no bulk edits. The
// targets are real relational tables with their own insert/update RLS policies
// (notes, weights) — NOT the localStorage-mirror jsonb blobs, whose client-owned
// shape a blind server write could corrupt.

import { type VitalityDb, WRITE_SCOPE, WRITE_PAUSED_SCOPE } from './supabase.js';
import { getLocalDateKey, getNutritionDayKey, getSupplementDayKey, round } from './util.js';
import { buildUploadTile, type UploadTileInput } from './uploadTile.js';
import { assertTileExportable, kindMustReport, reportIdentityFromHtml, sanitizeColor, type Category } from './tiles/uploadEnvelope.js';
import { verifyCheckProof } from './checkTile.js';
import { validateReport, type ReportKind, type GoalDirection } from './tiles/reportContract.js';
import type { UnitSystem } from './tiles/infer.js';
import { getProfile } from './queries.js';

/** Throw a clear, user-facing error unless the credential carries `mcp:write`.
 *  Two distinct causes get two honest messages: the global kill-switch (the auth
 *  layer swaps in WRITE_PAUSED_SCOPE) means the pause is server-side, so the
 *  message says "wait, your data is safe" because reconnecting cannot fix it; a
 *  genuinely read-only consent gets the reconnect steps that actually restore
 *  write. */
export function requireWrite(v: VitalityDb): void {
  if (v.scopes.includes(WRITE_SCOPE)) return;
  if (v.scopes.includes(WRITE_PAUSED_SCOPE)) {
    throw new Error(
      'Writes are temporarily paused by the Vitality team, so nothing can be added or logged right now. Your data is safe and reading still works. The pause is on our side, so reconnecting will not change it. Try again in a little while.',
    );
  }
  throw new Error(
    'This Vitality connection is read-only, so it cannot add a tile or log data yet. Fix it in one step: disconnect the Vitality connector in your MCP client, then Allow it again. New connections get read and write access by default. (Or use a Vitality CLI token from your account for full access.)',
  );
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Append a one-line audit row for a successful write. Best-effort by design:
 *  the actual data write already happened, so a missing audit row (e.g. the
 *  table not migrated yet) must NEVER turn a success into a failure. */
export async function recordWrite(v: VitalityDb, tool: string, summary: string): Promise<void> {
  try {
    await v.db.from('mcp_write_log').insert({ user_id: v.userId, tool, summary: summary.slice(0, 500) });
  } catch {
    /* swallow — audit is advisory, not load-bearing */
  }
}

/** Parse an env integer, clamped to [lo, hi], falling back to `dflt` when unset/garbage. */
function clampInt(raw: string | undefined, dflt: number, lo: number, hi: number): number {
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}

// Per-user write rate limit — a courtesy brake against a runaway build loop or an
// abusive token spamming append-y writes (tiles, notes). It reuses the existing
// mcp_write_log table + its (user_id, created_at desc) index: count this user's recent
// audited writes and refuse once they cross the ceiling in the window. Fail-OPEN by
// design — an unreadable audit table NEVER blocks a legitimate write (the strict tier
// gate + RLS are the real guardrails; this is only a spam valve). Tunable via env.
const WRITE_RATE_PER_MIN = clampInt(process.env.MCP_WRITE_RATE_PER_MIN, 20, 1, 5000);
const WRITE_RATE_PER_HOUR = clampInt(process.env.MCP_WRITE_RATE_PER_HOUR, 200, 1, 100000);

/** Throw a friendly "slow down" error if this user has crossed the per-minute or
 *  per-hour write ceiling. Call at the top of an append-y write, after requireWrite. */
export async function checkWriteRate(v: VitalityDb): Promise<void> {
  let stamps: number[];
  try {
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const { data, error } = await v.db
      .from('mcp_write_log')
      .select('created_at')
      .eq('user_id', v.userId)
      .gte('created_at', hourAgo)
      .order('created_at', { ascending: false })
      .limit(WRITE_RATE_PER_HOUR + 1);
    if (error || !data) return; // fail open on infra error / missing table
    stamps = data.map((r) => new Date((r as { created_at: string }).created_at).getTime());
  } catch {
    return; // fail open on any unexpected failure
  }
  if (stamps.length >= WRITE_RATE_PER_HOUR) {
    throw new Error(
      `Too many changes in the last hour (limit ${WRITE_RATE_PER_HOUR}). Give it a few minutes, then try again.`,
    );
  }
  const lastMin = stamps.filter((t) => t >= Date.now() - 60_000).length;
  if (lastMin >= WRITE_RATE_PER_MIN) {
    throw new Error(
      `That is a lot of changes very fast (limit ${WRITE_RATE_PER_MIN} a minute). Wait a few seconds, then try again.`,
    );
  }
}

// ── Notes / reminders ────────────────────────────────────────────────────────

export interface AddedNote {
  id: string | null;
  body: string;
  createdAt: string;
}

/** Append a note to the Mentor "void"/quick-jot inbox — the same place the
 *  app's quick-jot writes, so it shows up in the user's Mentor on next load. */
export async function addNote(v: VitalityDb, body: string): Promise<AddedNote> {
  requireWrite(v);
  await checkWriteRate(v);
  const clean = (body ?? '').trim();
  if (!clean) throw new Error('Note text is empty.');
  if (clean.length > 4000) throw new Error('Note is too long (max 4000 characters).');

  const { data, error } = await v.db
    .from('notes')
    .insert({ user_id: v.userId, body: clean })
    .select('id, body, created_at')
    .single();
  if (error) throw new Error(`Could not save note: ${error.message}`);

  await recordWrite(v, 'vitality_add_note', `Note: "${clean.slice(0, 80)}"`);
  return {
    id: (data?.id as string | undefined) ?? null,
    body: (data?.body as string | undefined) ?? clean,
    createdAt: (data?.created_at as string | undefined) ?? '',
  };
}

// ── Weight ───────────────────────────────────────────────────────────────────

export interface LoggedWeight {
  date: string;
  kg: number;
  note: string | null;
  /** true when this overwrote an existing weigh-in for the day. */
  replaced: boolean;
}

/**
 * Record (or correct) a weigh-in. One row per (user_id, date) — the table has a
 * unique constraint, so re-logging the same day overwrites rather than
 * duplicating, matching how the in-app weight tracker behaves. `kg` is the
 * canonical unit; callers convert lb→kg before calling. Date defaults to today.
 */
export async function logWeight(
  v: VitalityDb,
  kg: number,
  opts: { date?: string; note?: string } = {},
): Promise<LoggedWeight> {
  requireWrite(v);
  if (!Number.isFinite(kg) || kg < 20 || kg > 400) {
    throw new Error('Weight must be a number between 20 and 400 kg (convert from lb first).');
  }
  const date = opts.date ?? getLocalDateKey();
  if (!DATE_RE.test(date)) throw new Error('Date must be YYYY-MM-DD.');
  const note = opts.note?.trim() || null;
  const weightKg = round(kg, 2);

  // Was there already a weigh-in for this day? (Report replace vs new honestly.)
  const { data: existing } = await v.db
    .from('weights')
    .select('id')
    .eq('user_id', v.userId)
    .eq('date', date)
    .maybeSingle();

  const { data, error } = await v.db
    .from('weights')
    .upsert({ user_id: v.userId, date, weight_kg: weightKg, note }, { onConflict: 'user_id,date' })
    .select('date, weight_kg, note')
    .single();
  if (error) throw new Error(`Could not save weigh-in: ${error.message}`);

  await recordWrite(v, 'vitality_log_weight', `${existing ? 'Updated' : 'Logged'} weigh-in ${date}: ${weightKg} kg`);
  return {
    date: (data?.date as string | undefined) ?? date,
    kg: Number(data?.weight_kg ?? weightKg),
    note: (data?.note as string | null | undefined) ?? null,
    replaced: Boolean(existing),
  };
}

// ── Nutrition / meals ────────────────────────────────────────────────────────

const clampMacro = (g: number | undefined): number => {
  if (g == null || !Number.isFinite(g)) return 0;
  return Math.round(Math.min(2000, Math.max(0, g)));
};

export interface LoggedMeal {
  dayKey: string;
  description: string | null;
  totals: { kcal: number; protein: number; carbs: number; fat: number };
}

/**
 * Append a meal to the Fuel log (`nutrition_meals`). The caller supplies the
 * macros directly (the in-app flow uses AI photo/text parsing; here Claude or
 * the user provides them). Multiple meals per day are expected — this appends,
 * never overwrites. Day key uses the app's 4am rollover (getNutritionDayKey), so
 * a meal logged 00:00–04:00 lands on the same day the app shows, and the MCP read
 * (getNutrition) agrees with this write.
 */
export async function logMeal(
  v: VitalityDb,
  opts: { kcal: number; protein?: number; carbs?: number; fat?: number; description?: string; date?: string },
): Promise<LoggedMeal> {
  requireWrite(v);
  if (!Number.isFinite(opts.kcal) || opts.kcal < 0 || opts.kcal > 20000) {
    throw new Error('kcal must be a number between 0 and 20000.');
  }
  const dayKey = opts.date ?? getNutritionDayKey();
  if (!DATE_RE.test(dayKey)) throw new Error('Date must be YYYY-MM-DD.');
  const totals = {
    kcal: Math.round(opts.kcal),
    protein: clampMacro(opts.protein),
    carbs: clampMacro(opts.carbs),
    fat: clampMacro(opts.fat),
  };
  const description = opts.description?.trim() || null;

  const { error } = await v.db
    .from('nutrition_meals')
    .insert({ user_id: v.userId, day_key: dayKey, what_i_see: description, totals });
  if (error) throw new Error(`Could not log meal: ${error.message}`);

  await recordWrite(v, 'vitality_log_meal', `Meal ${dayKey}: ${totals.kcal} kcal / ${totals.protein}g protein${description ? ` — ${description.slice(0, 60)}` : ''}`);
  return { dayKey, description, totals };
}

// ── Water ────────────────────────────────────────────────────────────────────

export interface LoggedWater {
  date: string;
  count: number; // new running total for the day
  added: number; // delta applied (can be negative)
}

/**
 * Add water servings to a day's count (`water_days`, one row per user+date).
 * Increments by `servings` (default 1) by reading the current count first; pass
 * `setTo` to set an absolute value instead. Count floors at 0.
 */
export async function logWater(
  v: VitalityDb,
  opts: { servings?: number; setTo?: number; date?: string } = {},
): Promise<LoggedWater> {
  requireWrite(v);
  const date = opts.date ?? getLocalDateKey();
  if (!DATE_RE.test(date)) throw new Error('Date must be YYYY-MM-DD.');

  const { data: cur } = await v.db
    .from('water_days')
    .select('count')
    .eq('user_id', v.userId)
    .eq('date', date)
    .maybeSingle();
  const current = Number(cur?.count ?? 0);

  let next: number;
  if (opts.setTo != null) {
    if (!Number.isFinite(opts.setTo) || opts.setTo < 0 || opts.setTo > 100) throw new Error('setTo must be 0–100.');
    next = Math.round(opts.setTo);
  } else {
    const servings = opts.servings ?? 1;
    if (!Number.isFinite(servings) || Math.abs(servings) > 100) throw new Error('servings must be between -100 and 100.');
    next = Math.max(0, current + Math.round(servings));
  }

  const { error } = await v.db
    .from('water_days')
    .upsert({ user_id: v.userId, date, count: next }, { onConflict: 'user_id,date' });
  if (error) throw new Error(`Could not log water: ${error.message}`);

  await recordWrite(v, 'vitality_log_water', `Water ${date}: ${next} serving(s)`);
  return { date, count: next, added: next - current };
}

// ── Workouts ─────────────────────────────────────────────────────────────────

const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'exercise';

export interface WorkoutExerciseInput {
  name: string;
  sets?: number;
  reps?: number;
  weightKg?: number;
}

export interface LoggedWorkout {
  date: string;
  dayName: string;
  exerciseCount: number;
  setCount: number;
  replaced: boolean;
}

/**
 * Log a completed training session (`workouts`). One row per (user, date) to
 * match the in-app logger — re-logging the same date replaces it. Builds the
 * exact persisted exercise shape the logger reads back ({id,name,targetSets,
 * targetReps,sets:[{weight,reps,done,failed}]}), marking each set done. Kept
 * simple: one weight/reps per exercise expanded across its sets.
 */
export async function logWorkout(
  v: VitalityDb,
  opts: { dayName: string; exercises: WorkoutExerciseInput[]; date?: string },
): Promise<LoggedWorkout> {
  requireWrite(v);
  const dayName = (opts.dayName ?? '').trim();
  if (!dayName) throw new Error('dayName is required (e.g. "Push", "Legs").');
  const date = opts.date ?? getLocalDateKey();
  if (!DATE_RE.test(date)) throw new Error('Date must be YYYY-MM-DD.');
  if (!Array.isArray(opts.exercises) || opts.exercises.length === 0) throw new Error('At least one exercise is required.');
  if (opts.exercises.length > 40) throw new Error('Too many exercises (max 40).');

  const exercises = opts.exercises.map((e, i) => {
    const name = (e.name ?? '').trim();
    if (!name) throw new Error(`Exercise ${i + 1} is missing a name.`);
    const setCount = Math.min(20, Math.max(1, Math.round(e.sets ?? 3)));
    const reps = e.reps != null ? Math.max(0, Math.round(e.reps)) : null;
    const weight = e.weightKg != null ? round(e.weightKg, 2) : null;
    return {
      id: slug(name),
      name,
      targetSets: setCount,
      targetReps: reps,
      sets: Array.from({ length: setCount }, () => ({ weight, reps, done: true, failed: false })),
    };
  });
  const setCount = exercises.reduce((a, e) => a + e.sets.length, 0);

  const { data: existing } = await v.db
    .from('workouts')
    .select('id')
    .eq('user_id', v.userId)
    .eq('date', date)
    .maybeSingle();
  const row = { user_id: v.userId, date, day_name: dayName, exercises, submitted_at: new Date().toISOString() };

  const { error } = existing?.id
    ? await v.db.from('workouts').update(row).eq('id', existing.id)
    : await v.db.from('workouts').insert(row);
  if (error) throw new Error(`Could not log workout: ${error.message}`);

  await recordWrite(v, 'vitality_log_workout', `Workout ${date}: ${dayName}, ${exercises.length} exercise(s) / ${setCount} set(s)`);
  return { date, dayName, exerciseCount: exercises.length, setCount, replaced: Boolean(existing?.id) };
}

// ── Supplements (jsonb blob — careful read-modify-write) ─────────────────────────

export interface SupplementTaken {
  name: string;
  taken: boolean;
  dayKey: string;
}

/**
 * Mark a supplement taken (or untaken) for a day. Supplements live in a single
 * localStorage-mirror jsonb blob (`supplements_state.data`), so this is a
 * read-modify-write: we read the whole blob, flip just `taken[dayKey][itemId]`
 * (a ms timestamp, matching the client's `toggleTaken`), and write it back —
 * preserving every other field. There's a small TOCTOU window vs a concurrent
 * device edit; acceptable for a low-frequency assistant write. Day key uses the
 * app's 6am rollover (getSupplementDayKey), so a mark before 6am lands on the day
 * the app shows and the MCP read (getSupplements) agrees with this write.
 */
export async function markSupplementTaken(
  v: VitalityDb,
  opts: { name?: string; id?: string; date?: string; taken?: boolean },
): Promise<SupplementTaken> {
  requireWrite(v);
  const dayKey = opts.date ?? getSupplementDayKey();
  if (!DATE_RE.test(dayKey)) throw new Error('Date must be YYYY-MM-DD.');
  const wanted = (opts.id ?? opts.name ?? '').trim().toLowerCase();
  if (!wanted) throw new Error('Provide a supplement name or id.');

  const { data } = await v.db.from('supplements_state').select('data').eq('user_id', v.userId).maybeSingle();
  const blob = (data?.data && typeof data.data === 'object' ? { ...(data.data as Record<string, unknown>) } : null);
  const items = blob && Array.isArray(blob.items) ? (blob.items as Array<Record<string, unknown>>) : [];
  if (!items.length) throw new Error('No supplement stack found — add supplements in the app first.');

  const item = items.find(
    (i) => String(i.id).toLowerCase() === wanted || String(i.name ?? '').trim().toLowerCase() === wanted,
  );
  if (!item) {
    const names = items.map((i) => i.name).filter(Boolean).join(', ');
    throw new Error(`No supplement matching "${opts.id ?? opts.name}". Your stack: ${names || '(none named)'}.`);
  }
  const itemId = String(item.id);

  const takenAll = (blob!.taken && typeof blob!.taken === 'object' ? { ...(blob!.taken as Record<string, unknown>) } : {}) as Record<string, Record<string, number>>;
  const day = { ...(takenAll[dayKey] && typeof takenAll[dayKey] === 'object' ? takenAll[dayKey] : {}) } as Record<string, number>;
  const setTaken = opts.taken !== false;
  if (setTaken) day[itemId] = Date.now();
  else delete day[itemId];
  takenAll[dayKey] = day;

  const { error } = await v.db
    .from('supplements_state')
    .upsert({ user_id: v.userId, data: { ...blob, taken: takenAll } }, { onConflict: 'user_id' });
  if (error) throw new Error(`Could not update supplements: ${error.message}`);

  const name = String(item.name ?? itemId);
  await recordWrite(v, 'vitality_mark_supplement_taken', `${setTaken ? 'Took' : 'Un-took'} ${name} on ${dayKey}`);
  return { name, taken: setTaken, dayKey };
}

// ── Business metrics (brand KPIs — jsonb blob read-modify-write) ──────────────

export interface LoggedBusinessMetric {
  brand: string;
  label: string;
  value: number;
  unit: string;
  /** true when a NEW metric was created vs an existing one updated. */
  created: boolean;
}

const BIZ_MAX_HISTORY = 200; // mirror MAX_HISTORY in app/app/brand/state.ts
const bizKpiId = (): string => `k_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

/**
 * Log (or correct) a business metric — a brand's custom KPI (revenue, MRR,
 * leads, reviews…). Business metrics ARE brand KPIs and live in the single
 * `brand_state` jsonb blob the client mirrors, so this is a read-modify-write in
 * exactly the spirit of markSupplementTaken: read the blob, pick the brand (by
 * name, or the only one if unambiguous), match the KPI by label (create it if
 * new), set its value + append a history snapshot so it charts over time, write
 * the blob back — every other field preserved. Mirrors the app's `importKpis`,
 * so a number logged here is indistinguishable from one typed in the Business
 * tab. Small TOCTOU window vs a concurrent device edit; fine for a low-frequency
 * assistant write (same tradeoff markSupplementTaken accepts).
 */
export async function logBusinessMetric(
  v: VitalityDb,
  opts: { metric: string; value: number; business?: string; unit?: string },
): Promise<LoggedBusinessMetric> {
  requireWrite(v);
  const label = (opts.metric ?? '').trim();
  if (!label) throw new Error('A metric label is required (e.g. "Revenue", "MRR", "Leads").');
  if (label.length > 24) throw new Error('Metric label is too long (max 24 characters).');
  if (!Number.isFinite(opts.value)) throw new Error('value must be a finite number.');
  const value = opts.value;
  const unit = (opts.unit ?? '').trim().slice(0, 12);

  const { data } = await v.db.from('brand_state').select('data').eq('user_id', v.userId).maybeSingle();
  const blob = data?.data && typeof data.data === 'object' ? { ...(data.data as Record<string, unknown>) } : null;
  const brands = blob && Array.isArray(blob.brands) ? (blob.brands as Array<Record<string, unknown>>) : [];
  const active = brands.filter((b) => !b.archived);
  if (!active.length) throw new Error('No brand/business found — create one in the Brand module first.');

  // Pick the target brand: by name if given, else the only active one.
  let brand: Record<string, unknown>;
  const wanted = (opts.business ?? '').trim().toLowerCase();
  if (wanted) {
    const match = active.find((b) => String(b.name ?? '').trim().toLowerCase() === wanted);
    if (!match) {
      const names = active.map((b) => b.name).filter(Boolean).join(', ');
      throw new Error(`No business matching "${opts.business}". Yours: ${names || '(unnamed)'}.`);
    }
    brand = match;
  } else if (active.length === 1) {
    brand = active[0];
  } else {
    const names = active.map((b) => b.name).filter(Boolean).join(', ');
    throw new Error(`Which business? You have several: ${names}. Pass the business name.`);
  }

  // Match the KPI by label (case-insensitive); create it if new — mirrors importKpis.
  const kpis = Array.isArray(brand.kpis) ? (brand.kpis as Array<Record<string, unknown>>) : [];
  const stamp = new Date().toISOString();
  const existing = kpis.find((k) => String(k.label ?? '').trim().toLowerCase() === label.toLowerCase());
  let created: boolean;
  let outUnit: string;
  if (existing) {
    const history = Array.isArray(existing.history) ? [...(existing.history as Array<Record<string, unknown>>)] : [];
    const last = history[history.length - 1];
    if (!last || Number(last.value) !== value) {
      history.push({ at: stamp, value });
      if (history.length > BIZ_MAX_HISTORY) history.splice(0, history.length - BIZ_MAX_HISTORY);
    }
    existing.value = value;
    if (!String(existing.unit ?? '').trim() && unit) existing.unit = unit;
    existing.history = history;
    outUnit = String(existing.unit ?? '').trim();
    created = false;
  } else {
    kpis.push({ id: bizKpiId(), label, value, unit, history: [{ at: stamp, value }] });
    outUnit = unit;
    created = true;
  }
  brand.kpis = kpis;

  const { error } = await v.db
    .from('brand_state')
    .upsert({ user_id: v.userId, data: { ...blob, brands }, updated_at: stamp }, { onConflict: 'user_id' });
  if (error) throw new Error(`Could not log business metric: ${error.message}`);

  const brandName = String(brand.name ?? '').trim() || '(unnamed)';
  await recordWrite(
    v,
    'vitality_log_business_metric',
    `${created ? 'Logged' : 'Updated'} ${brandName} · ${label}: ${value}${outUnit ? ' ' + outUnit : ''}`,
  );
  return { brand: brandName, label, value, unit: outUnit, created };
}

// ── Tiles (the build -> dashboard loop) ──────────────────────────────────────────

export interface AddedTile {
  id: string | null;
  name: string;
  category: string;
}

export interface AddTileInput extends Omit<UploadTileInput, 'goal'> {
  /** Build a deterministic template from this plain-English goal. Optional because
   *  `html` is the alternative; addTile requires exactly one of the two. */
  goal?: string;
  /** A pre-built (e.g. kit-built, rich) sealed tile to add AS-IS. When given, it is
   *  floor-checked and stored instead of building a deterministic template from `goal`. */
  html?: string;
  /** Optional report-stream identity for a hand-built tile (so its number can wire into
   *  Vee). Omit for a tile that reports nothing. Ignored on the `goal` path (derived). */
  stream?: { key: string; label: string; kind: ReportKind; goalDirection?: GoalDirection } | null;
  /** The Proof value from this exact html's PASSING check_tile receipt. When it
   *  verifies, the identical re-lint is skipped (the check just ran it); absent or
   *  stale, the full lint runs as the fallback. The kind-aware report gate always runs. */
  check?: string;
  /** Born classified (TRAIN 5): which of the nine life buckets this tile serves
   *  (lib/goals/categories.ts). Declared at build time so the goal triage never
   *  scans or guesses. Optional; an unknown value is dropped, never coerced. */
  goalCategory?: string;
  /** One line of why this tile was built - the "note for Vee". Optional. */
  veeNote?: string;
}

/** The nine goal-triage buckets (mirrors lib/goals/categories.ts + the DB check
 *  in 20260711150000_tiles_born_classified.sql). */
const GOAL_CATEGORIES = new Set([
  'fitness', 'health', 'mind', 'money', 'career', 'craft', 'audience', 'people', 'general',
]);

/** Clamp a born classification: one of the nine or null (never a guess). */
function cleanGoalCategory(v: string | undefined): string | null {
  const k = (v ?? '').trim().toLowerCase();
  return GOAL_CATEGORIES.has(k) ? k : null;
}

/** Clamp the note for Vee to one honest line (<= 200 chars, no newlines). */
function cleanVeeNote(v: string | undefined): string | null {
  const line = (v ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  return line || null;
}

interface TileRow {
  user_id: string;
  name: string;
  html: string;
  stream: AddTileInput['stream'];
  category: string;
  color: string;
  source: string;
  /** Only present when the caller declared them; and if the DB predates the
   *  born-classified migration, the insert retries once without them (see the
   *  missing-column fallback in addTile), so a tile add never fails on these. */
  goal_category?: string;
  vee_note?: string;
}

/** True when a PostgREST/Postgres error says the born-classified columns are
 *  missing from `tiles` (migration 20260711150000 not applied yet): PGRST204
 *  ("Could not find the 'goal_category' column ... in the schema cache") or
 *  42703 (undefined_column). Scoped to the two new columns so a genuinely
 *  broken insert never silently retries. */
function isBornClassifiedColumnMissing(error: { code?: string; message: string }): boolean {
  return (
    (error.code === 'PGRST204' || error.code === '42703' || /column/i.test(error.message)) &&
    /goal_category|vee_note/i.test(error.message)
  );
}

/**
 * Drop a sealed, floor-clean tile straight into the user's personal tile registry
 * (`tiles`), so it appears on their dashboard with no copy-paste. The automatic half of
 * the build->dashboard loop. Two ways in, both floor-enforced (an unsealed or off-brand
 * tile is refused and never reaches the database):
 *   - pass `html`: add a pre-built rich tile (kit-built / hand-edited) as-is;
 *   - else pass `goal`: build a deterministic template via buildUploadTile.
 * RLS-scoped and gated on mcp:write, exactly like the other writes. The owner is always
 * server-stamped (`v.userId`), never caller input. See docs/tiles-table-contract.md.
 */
// Read the user's metric/imperial preference so a built tile labels values in their
// units. Best-effort: default to metric if the profile is missing or unreadable.
async function resolveUnitSystem(v: VitalityDb): Promise<UnitSystem> {
  try {
    const p = await getProfile(v);
    return p.units === 'imperial' ? 'imperial' : 'metric';
  } catch {
    return 'metric';
  }
}

// Read the user's currency (ISO 4217) so a built money tile prints their symbol
// (£/€/¥/…) instead of a hardcoded '$'. The user's currency already lives in
// finance_prefs.currency (the Finance module's preference — no new column). Best-effort:
// default to 'USD' if the row is missing or unreadable.
async function resolveCurrency(v: VitalityDb): Promise<string> {
  try {
    const { data } = await v.db
      .from('finance_prefs')
      .select('currency')
      .eq('user_id', v.userId)
      .maybeSingle();
    const cur = (data as { currency?: string } | null)?.currency;
    return cur && cur.trim() ? cur.trim().toUpperCase() : 'USD';
  } catch {
    return 'USD';
  }
}

// A generous ceiling on hand-built tile HTML. The tool schema already caps at 400K, but
// addTile itself had no bound; a rich Vitality tile is ~15-30K chars, so 200K is ~8-10x
// headroom for a very elaborate one while refusing a multi-megabyte payload before it
// hits the row. Tunable via env for ops.
const TILE_HTML_MAX = clampInt(process.env.MCP_TILE_HTML_MAX, 200_000, 20_000, 400_000);

export async function addTile(v: VitalityDb, input: AddTileInput): Promise<AddedTile> {
  requireWrite(v);
  await checkWriteRate(v);

  let row: TileRow;
  if (input.html && input.html.trim()) {
    const html = input.html.trim();
    if (html.length > TILE_HTML_MAX) {
      throw new Error(
        `This tile's HTML is too large (${html.length.toLocaleString()} chars; limit ${TILE_HTML_MAX.toLocaleString()}). A rich Vitality tile is usually 15,000-30,000 chars, so trim unused code or split it into two tiles.`,
      );
    }
    // Floor-enforce a hand-built tile too: an unsealed/off-brand one throws the fix-it
    // list here and never lands. The declared kind comes from an explicit `stream` when
    // one is given, else from the tool's `kind` arg (the only kind field vitality_add_tile
    // exposes), so a measurable hand-built tile that forgot its Vitality.report() is
    // refused with the report-missing guidance, never silently landed dark.
    const name = (input.name && input.name.trim()) || 'Untitled tile';
    const declaredKind = input.stream?.kind ?? input.kind;
    // A verified check_tile Proof for this EXACT html means the identical lint just
    // ran and passed; skip re-running it. Stale/absent proof = full lint (fallback).
    // The kind-aware report gate inside assertTileExportable always runs either way.
    const lintProven = verifyCheckProof(html, input.check);
    assertTileExportable(html, name, declaredKind, { lintProven });
    let stream: AddTileInput['stream'] = null;
    if (input.stream || kindMustReport(declaredKind)) {
      // A measurable tile also carries its stream registration on the row (the declared
      // identity that share/publish round-trips keep, per docs/tiles-table-contract.md),
      // never a null. Prefer the caller's explicit stream; else read the literal
      // key/label the tile's own report() call emits (the floor check above just proved
      // one exists), falling back to the tile name. Contract-validated either way.
      const fromHtml = input.stream ? null : reportIdentityFromHtml(html);
      const probe = validateReport({
        key: input.stream?.key ?? fromHtml?.key ?? name.toLowerCase(),
        label: input.stream?.label ?? fromHtml?.label ?? name,
        value: 0,
        date: '2000-01-01',
        kind: declaredKind,
        ...((input.stream?.goalDirection ?? fromHtml?.goalDirection ?? input.goalDirection)
          ? { goalDirection: input.stream?.goalDirection ?? fromHtml?.goalDirection ?? input.goalDirection }
          : {}),
      });
      if (!probe.ok) {
        throw new Error(
          `This tile's stream identity is not contract-valid: ${probe.error}. Fix the stream's key/label/kind (the same shape as Vitality.report) and try again.`,
        );
      }
      stream = {
        key: probe.stream.key,
        label: probe.stream.label,
        kind: probe.stream.kind,
        ...(probe.stream.goalDirection ? { goalDirection: probe.stream.goalDirection } : {}),
      };
    }
    row = {
      user_id: v.userId,
      name,
      html,
      stream,
      category: (input.category as Category | undefined) ?? 'data',
      color: sanitizeColor(input.color),
      source: 'mcp',
    };
  } else if (input.goal && input.goal.trim()) {
    // Auto-first: label the tile's numbers in the user's own units (kg vs lb, km vs mi)
    // and their currency ($ vs £/€/¥) without them having to say so. An explicit
    // input.unitSystem / input.currency still wins.
    const unitSystem = input.unitSystem ?? (await resolveUnitSystem(v));
    const currency = input.currency ?? (await resolveCurrency(v));
    // Build + floor-check + contract-check up front (buildUploadTile enforces both).
    const { envelope } = buildUploadTile({
      goal: input.goal,
      kind: input.kind,
      name: input.name,
      unit: input.unit,
      goalDirection: input.goalDirection,
      unitSystem,
      currency,
      category: input.category,
      color: input.color,
      design: input.design,
    });
    row = {
      user_id: v.userId,
      name: envelope.name,
      html: envelope.html,
      stream: envelope.stream,
      category: envelope.category,
      color: envelope.color,
      source: 'mcp',
    };
  } else {
    throw new Error('Provide either a `goal` to build a tile, or ready-made `html` to add.');
  }

  // Born classified (TRAIN 5): stamp the declared life bucket + the one-line
  // "note for Vee" onto the row, only when the caller actually passed them (so
  // the insert stays valid against a DB without the additive migration).
  const goalCategory = cleanGoalCategory(input.goalCategory);
  const veeNote = cleanVeeNote(input.veeNote);
  if (goalCategory) row.goal_category = goalCategory;
  if (veeNote) row.vee_note = veeNote;

  let { data, error } = await v.db.from('tiles').insert(row).select('id').single();
  if (error && isBornClassifiedColumnMissing(error) && (row.goal_category || row.vee_note)) {
    // The tiles table exists but predates the born-classified migration: land the
    // tile anyway (unclassified) rather than failing the whole add on two optional
    // columns. Checked BEFORE the table-missing branch below, whose /schema cache/
    // regex would otherwise match this column error and misdiagnose it.
    const { goal_category: _gc, vee_note: _vn, ...legacyRow } = row;
    ({ data, error } = await v.db.from('tiles').insert(legacyRow).select('id').single());
  }
  if (error) {
    // The registry table may not be applied to the DB yet (it ships with the dashboard
    // window's migration). Fail with a clear, actionable line instead of a raw error.
    if (/relation .*tiles.* does not exist|could not find the table|schema cache/i.test(error.message)) {
      throw new Error(
        'The tiles registry is not live yet. Ask the dashboard to apply the tiles table (see docs/tiles-table-contract.md), then try again. Meanwhile, use upload_tile and paste the tile into the Library.',
      );
    }
    throw new Error(`Could not add tile: ${error.message}`);
  }

  await recordWrite(v, 'vitality_add_tile', `Added tile "${row.name}" (${row.category}) to the dashboard`);
  return { id: (data?.id as string | undefined) ?? null, name: row.name, category: row.category };
}
