#!/usr/bin/env bash
# Vitality MCP - self-extracting bundle.
# Usage: put this file in an empty folder, then run:  bash mcp-bundle.sh
set -e
mkdir -p 'mcp'
cat > 'mcp/package.json' <<'VITALITY_EOF'
{
  "name": "vitality-mcp",
  "version": "0.1.0",
  "private": true,
  "description": "Read-only MCP server that exposes a Vitality user's data (sleep, training, nutrition, weight, finances, notes) to Claude — plus a daily-briefing nudge engine.",
  "type": "module",
  "bin": {
    "vitality-mcp": "./dist/index.js"
  },
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "briefing": "tsx src/cli.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "@supabase/supabase-js": "^2.105.4",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "tsx": "^4.19.0",
    "typescript": "^5"
  },
  "engines": {
    "node": ">=18.18"
  }
}
VITALITY_EOF
mkdir -p 'mcp'
cat > 'mcp/tsconfig.json' <<'VITALITY_EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": false,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*.ts"]
}
VITALITY_EOF
mkdir -p 'mcp'
cat > 'mcp/.gitignore' <<'VITALITY_EOF'
node_modules/
dist/
.env
.env.local
*.log
VITALITY_EOF
mkdir -p 'mcp'
cat > 'mcp/.env.example' <<'VITALITY_EOF'
# ─────────────────────────────────────────────────────────────────────────────
# Vitality MCP — environment
# Copy to `.env` and fill in. NEVER commit `.env`.
# ─────────────────────────────────────────────────────────────────────────────

# Your Supabase project (same project the Vitality app uses).
VITALITY_SUPABASE_URL=https://YOUR-PROJECT.supabase.co

# The PUBLIC anon key (safe to use — RLS still applies). Find it in
# Supabase → Project Settings → API → "anon / public".
VITALITY_SUPABASE_ANON_KEY=eyJ...

# ── Auth mode A (RECOMMENDED, RLS-respecting) ────────────────────────────────
# Sign in as yourself. Every query runs under YOUR row-level-security context,
# exactly like the website. The MCP can only ever see your own data.
VITALITY_USER_EMAIL=you@example.com
VITALITY_USER_PASSWORD=your-vitality-password

# ── Auth mode B (OPT-IN, bypasses RLS — local/personal use only) ─────────────
# Uses the service-role key, which can read ANY user's data. We scope every
# query to VITALITY_USER_ID, but this key bypasses row-level security, so it
# must NEVER ship to a client or a shared host. Leave blank unless you know why
# you need it. (CLAUDE.md hard rule #3.)
# VITALITY_SUPABASE_SERVICE_ROLE_KEY=
# VITALITY_USER_ID=

# Optional: override the local timezone used for "today" / bedtime math.
# Defaults to the host machine's timezone.
# VITALITY_TIMEZONE=Europe/Zurich
VITALITY_EOF
mkdir -p 'mcp'
cat > 'mcp/.mcp.json.example' <<'VITALITY_EOF'
{
  "_comment": "Copy the `mcpServers.vitality` block into your Claude Code .mcp.json (project root) or Claude Desktop config. Use the built path (npm run build first), or swap command/args to the tsx dev form shown below. Env can be inlined here OR left to mcp/.env.",

  "mcpServers": {
    "vitality": {
      "command": "node",
      "args": ["/Users/sam/Documents/GitHub/Vitality/mcp/dist/index.js"],
      "env": {
        "VITALITY_SUPABASE_URL": "https://YOUR-PROJECT.supabase.co",
        "VITALITY_SUPABASE_ANON_KEY": "eyJ...",
        "VITALITY_USER_EMAIL": "you@example.com",
        "VITALITY_USER_PASSWORD": "your-vitality-password"
      }
    },

    "vitality_dev_tsx": {
      "command": "npx",
      "args": ["tsx", "/Users/sam/Documents/GitHub/Vitality/mcp/src/index.ts"],
      "_note": "No build step. Reads env from mcp/.env automatically. Slower cold start."
    }
  }
}
VITALITY_EOF
mkdir -p 'mcp'
cat > 'mcp/README.md' <<'VITALITY_EOF'
# Vitality MCP

A **read-only** Model Context Protocol server that lets Claude (Claude Code in
VSCode, or Claude Desktop) read your Vitality data and reason over it — "should I
train hard today?", "when should I go to bed?", "which subscriptions should I
review?" — plus a **daily-briefing nudge engine** a scheduled agent can deliver
each morning/evening.

It is intentionally **read-only**: there are no write/mutate tools. Claude can
see your data; it cannot change it. (See [DESIGN](../docs/MCP-INTEGRATION.md) for
the hosted/multi-user path and the write-tool roadmap.)

```
Claude (VSCode / Desktop)  ──stdio──▶  vitality-mcp  ──RLS──▶  Supabase (your data)
                                            │
                                            └─ nudge engine → daily briefing
```

## What it can see (and what it can't)

Server-readable today (lives in Supabase):

| Tool | Data |
|------|------|
| `vitality_whoami` | profile, goal, focus areas, plan tier |
| `vitality_daily_briefing` | **the headline** — prioritized nudges across all domains |
| `vitality_sleep_status` | Whoop/Oura/Fitbit sleep + recovery → recommended bedtime |
| `vitality_training_readiness` | recovery tier (Peak/Solid/Tired/Low/Drained) + weekly volume |
| `vitality_nutrition_today` | calories + protein vs target (Fuel) |
| `vitality_weight_trend` | weigh-ins + trend |
| `vitality_subscriptions` | recurring cost, trials ending, price hikes, renewals |
| `vitality_finance_overview` | net worth, accounts, upcoming orders |
| `vitality_recent_workouts` | logged sessions |
| `vitality_notes` | mentor notes / reminders |
| `vitality_user_facts` | the durable mentor-memory layer |
| `vitality_peak_today` | today's Peak schedule + active vitals goal |

**Not visible** (browser-only `localStorage` today, so the server genuinely can't
reach them): **water**, **daily goals/streaks**, **supplement intake**, **brand
metrics**. The briefing says so rather than pretending. Moving any of these to
Supabase instantly makes them readable — see the design doc.

> **"Cancel a sub I don't use":** Vitality stores no *usage* signal, so the MCP
> can't auto-detect an unused subscription. It surfaces the actionable proxies
> instead — trials ending, price hikes, renewals, and your priciest subs to
> review — and is explicit that you make the keep/cancel call.

## Setup

```bash
cd mcp
npm install
cp .env.example .env      # then fill it in (see below)
npm run build             # compile to dist/
npm run briefing          # smoke test: prints today's briefing
```

### Auth (`.env`)

Two modes — the server picks **user** mode unless you explicitly set the
service-role pair.

- **User mode (recommended, RLS-respecting).** `VITALITY_USER_EMAIL` +
  `VITALITY_USER_PASSWORD`. The server signs in as you with the public anon key;
  every query runs under your own row-level security, exactly like the website.
  Structurally it can only ever see your data.
- **Service-role mode (opt-in, local only).**
  `VITALITY_SUPABASE_SERVICE_ROLE_KEY` + `VITALITY_USER_ID`. This key **bypasses
  RLS** — we scope every query to your user id by hand, but the key could read
  anyone, so it must never reach a client or shared host. (CLAUDE.md hard rule
  #3 — flagged for Alex.) Leave blank unless you have a reason.

## Connect to Claude

Build first (`npm run build`), then add the server from `.mcp.json.example` to
your Claude Code `.mcp.json` (project root) or Claude Desktop config. Restart the
client; the `vitality_*` tools appear. Ask: *"Run my Vitality daily briefing."*

For the morning/evening scheduled report, see [`agents/daily-briefing.md`](agents/daily-briefing.md).

## Dev

```bash
npm run dev         # run from source via tsx (no build)
npm run typecheck   # tsc --noEmit
npm run briefing -- --json   # machine-readable briefing
```

## Layout

```
src/
  env.ts        env loading + auth-mode resolution (tiny built-in .env parser)
  supabase.ts   authenticated client (user session | service role), cached
  util.ts       local date keys, decimal-hour formatting, coercions
  queries.ts    read layer — one function per domain, mirrors lib/coach/collectors
  nudges.ts     the nudge engine + briefing renderer
  index.ts      MCP server — registers the 12 read tools
  cli.ts        one-shot briefing printer (for cron / testing)
agents/
  daily-briefing.md   prompt + wiring for the scheduled report agent
```
VITALITY_EOF
mkdir -p 'mcp/src'
cat > 'mcp/src/env.ts' <<'VITALITY_EOF'
// Environment loading + validation for the Vitality MCP.
//
// No dotenv dependency: we parse a local `.env` ourselves (KEY=VALUE lines) so
// the server runs the same whether launched by Claude, a cron, or the CLI.
// All logging goes to stderr — stdout is reserved for the MCP protocol stream.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '..'); // mcp/

/** Parse a minimal .env file. Ignores blank lines and `#` comments. */
function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  const text = readFileSync(path, 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip matching surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Load `.env` (from package root, then cwd) into process.env without overriding
 *  anything already set in the real environment. */
function loadDotenv(): void {
  for (const candidate of [join(packageRoot, '.env'), join(process.cwd(), '.env')]) {
    if (!existsSync(candidate)) continue;
    try {
      const parsed = parseEnvFile(candidate);
      for (const [k, v] of Object.entries(parsed)) {
        if (process.env[k] === undefined) process.env[k] = v;
      }
    } catch (err) {
      console.error(`[vitality-mcp] failed to read ${candidate}:`, err);
    }
  }
}

loadDotenv();

export type AuthMode = 'user' | 'service';

export interface VitalityEnv {
  supabaseUrl: string;
  anonKey: string;
  authMode: AuthMode;
  // user mode
  userEmail?: string;
  userPassword?: string;
  // service mode
  serviceRoleKey?: string;
  userId?: string;
  // misc
  timezone?: string;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[vitality-mcp] missing required env var: ${name}`);
    console.error('[vitality-mcp] copy mcp/.env.example to mcp/.env and fill it in.');
    process.exit(1);
  }
  return v;
}

let cached: VitalityEnv | null = null;

export function getEnv(): VitalityEnv {
  if (cached) return cached;

  const supabaseUrl = required('VITALITY_SUPABASE_URL');
  const anonKey = required('VITALITY_SUPABASE_ANON_KEY');

  const serviceRoleKey = process.env.VITALITY_SUPABASE_SERVICE_ROLE_KEY;
  const userId = process.env.VITALITY_USER_ID;
  const userEmail = process.env.VITALITY_USER_EMAIL;
  const userPassword = process.env.VITALITY_USER_PASSWORD;

  // Service mode is opt-in and only when both the key and an explicit user id
  // are present. Otherwise we default to the RLS-respecting user session.
  const wantsService = Boolean(serviceRoleKey && userId);

  let authMode: AuthMode;
  if (wantsService) {
    authMode = 'service';
    console.error(
      '[vitality-mcp] ⚠ running in SERVICE-ROLE mode — this key bypasses RLS. ' +
        'Local/personal use only; never expose this process to a client or shared host.',
    );
  } else {
    authMode = 'user';
    if (!userEmail || !userPassword) {
      console.error(
        '[vitality-mcp] no auth configured. Set VITALITY_USER_EMAIL + VITALITY_USER_PASSWORD ' +
          '(recommended), or VITALITY_SUPABASE_SERVICE_ROLE_KEY + VITALITY_USER_ID (opt-in).',
      );
      process.exit(1);
    }
  }

  cached = {
    supabaseUrl,
    anonKey,
    authMode,
    userEmail,
    userPassword,
    serviceRoleKey,
    userId,
    timezone: process.env.VITALITY_TIMEZONE,
  };
  return cached;
}
VITALITY_EOF
mkdir -p 'mcp/src'
cat > 'mcp/src/supabase.ts' <<'VITALITY_EOF'
// Supabase access for the Vitality MCP.
//
// Two auth modes, resolved in env.ts:
//   • user    — anon key + email/password sign-in. Every query runs under the
//               user's own row-level-security context (exactly like the site).
//               The server can structurally only ever see this user's data.
//   • service — service-role key + explicit user id. Bypasses RLS, so we scope
//               EVERY query to that user id by hand. Opt-in, local-only.
//
// The client + resolved user id are cached: we authenticate once, then reuse the
// session for every tool call in the process lifetime.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from './env.js';

export interface VitalityDb {
  db: SupabaseClient;
  userId: string;
  mode: 'user' | 'service';
}

let cached: VitalityDb | null = null;
let pending: Promise<VitalityDb> | null = null;

async function connect(): Promise<VitalityDb> {
  const env = getEnv();

  if (env.authMode === 'service') {
    const db = createClient(env.supabaseUrl, env.serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return { db, userId: env.userId!, mode: 'service' };
  }

  // user mode
  const db = createClient(env.supabaseUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: true },
  });
  const { data, error } = await db.auth.signInWithPassword({
    email: env.userEmail!,
    password: env.userPassword!,
  });
  if (error || !data.user) {
    console.error('[vitality-mcp] sign-in failed:', error?.message ?? 'no user returned');
    throw new Error(`Vitality sign-in failed: ${error?.message ?? 'unknown error'}`);
  }
  console.error(`[vitality-mcp] signed in as ${data.user.email} (RLS-scoped).`);
  return { db, userId: data.user.id, mode: 'user' };
}

/** Get the authenticated client + user id. Authenticates once, then caches. */
export function getDb(): Promise<VitalityDb> {
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;
  pending = connect()
    .then((resolved) => {
      cached = resolved;
      pending = null;
      return resolved;
    })
    .catch((err) => {
      pending = null;
      throw err;
    });
  return pending;
}
VITALITY_EOF
mkdir -p 'mcp/src'
cat > 'mcp/src/util.ts' <<'VITALITY_EOF'
// Small shared helpers: local date keys (matching the app's convention),
// decimal-hour formatting, and safe coercions.

import { getEnv } from './env.js';

/** Local YYYY-MM-DD, honoring VITALITY_TIMEZONE if set, else host local time.
 *  Mirrors the app's getLocalDateKey() (never toISOString — UTC drift). */
export function getLocalDateKey(date = new Date()): string {
  const tz = getEnv().timezone;
  if (tz) {
    // en-CA yields YYYY-MM-DD parts.
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
    return parts;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/** A date key N days before today. */
export function dateKeyDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return getLocalDateKey(d);
}

/** Decimal hour (e.g. 22.5) → "10:30 PM". */
export function fmtHour(decimalHour: number): string {
  let h = ((decimalHour % 24) + 24) % 24;
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  // round-up of minutes can push to next hour
  let hh = hours;
  let mm = mins;
  if (mm === 60) {
    mm = 0;
    hh = (hh + 1) % 24;
  }
  const ampm = hh < 12 ? 'AM' : 'PM';
  let display = hh % 12;
  if (display === 0) display = 12;
  return `${display}:${String(mm).padStart(2, '0')} ${ampm}`;
}

export const num = (v: unknown): number | null => {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

export const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

export function ageFromBirthday(birthday: unknown): number | null {
  const b = str(birthday);
  if (!b) return null;
  const [y, m, d] = b.split('-').map(Number);
  if (!y || !m || !d) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  const md = today.getMonth() + 1 - m;
  if (md < 0 || (md === 0 && today.getDate() < d)) age -= 1;
  return age > 0 && age < 130 ? age : null;
}

/** Round to at most `places` decimals, dropping trailing zeros. */
export function round(n: number, places = 1): number {
  const f = Math.pow(10, places);
  return Math.round(n * f) / f;
}
VITALITY_EOF
mkdir -p 'mcp/src'
cat > 'mcp/src/queries.ts' <<'VITALITY_EOF'
// Read-only query layer for the Vitality MCP.
//
// One function per domain. Each takes the authenticated client and returns a
// shaped, typed object (never raw rows). Mirrors the column choices in
// lib/coach/context.ts + collectors.ts so the MCP "reads your file" the same way
// the in-app mentor does. Every query is scoped to the user id (redundant under
// RLS in user mode, required in service mode).

import type { VitalityDb } from './supabase.js';
import { dateKeyDaysAgo, getLocalDateKey, num, str, ageFromBirthday, round } from './util.js';

type Row = Record<string, unknown>;

// ── Profile ──────────────────────────────────────────────────────────────────

export interface Profile {
  firstName: string | null;
  sex: string | null;
  age: number | null;
  heightCm: number | null;
  startingWeightKg: number | null;
  units: string | null;
  goal: string | null;
  focusAreas: string[];
  tier: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
}

export async function getProfile({ db, userId }: VitalityDb): Promise<Profile> {
  const [up, pr] = await Promise.all([
    db
      .from('user_profile')
      .select('first_name, sex, birthday, height_cm, starting_weight_kg, units, goal, focus_areas')
      .eq('user_id', userId)
      .maybeSingle(),
    db
      .from('profiles')
      .select('tier, subscription_status, current_period_end')
      .eq('id', userId)
      .maybeSingle(),
  ]);
  const p = (up.data ?? {}) as Row;
  const b = (pr.data ?? {}) as Row;
  return {
    firstName: str(p.first_name),
    sex: str(p.sex),
    age: ageFromBirthday(p.birthday),
    heightCm: num(p.height_cm),
    startingWeightKg: num(p.starting_weight_kg),
    units: str(p.units),
    goal: str(p.goal),
    focusAreas: Array.isArray(p.focus_areas) ? (p.focus_areas as string[]) : [],
    tier: str(b.tier),
    subscriptionStatus: str(b.subscription_status),
    currentPeriodEnd: str(b.current_period_end),
  };
}

// ── Sleep / recovery (wearables) ───────────────────────────────────────────────

export interface SleepEntry {
  date: string;
  provider: string | null;
  sleepHours: number | null;
  sleepPerf: number | null;
  recovery: number | null;
  hrv: number | null;
  rhr: number | null;
  strain: number | null;
}

export interface SleepPrefs {
  wakeTime: number; // decimal hour
  sleepNeedHours: number;
  recoveryLevel: string | null;
  peakHour: number | null;
}

export interface SleepData {
  entries: SleepEntry[]; // newest first
  prefs: SleepPrefs;
  hasWearable: boolean;
}

const DEFAULT_PREFS: SleepPrefs = {
  wakeTime: 6.5,
  sleepNeedHours: 8,
  recoveryLevel: null,
  peakHour: null,
};

export async function getSleep(v: VitalityDb, days = 14): Promise<SleepData> {
  const { db, userId } = v;
  const [wd, prefs] = await Promise.all([
    db
      .from('wearable_data')
      .select('date, provider, sleep_hours, sleep_perf, recovery, hrv, rhr, strain')
      .eq('user_id', userId)
      .gte('date', dateKeyDaysAgo(days))
      .order('date', { ascending: false }),
    db
      .from('peak_tracker_prefs')
      .select('wake_time, sleep_need_hours, recovery_level, peak_hour')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const entries: SleepEntry[] = ((wd.data as Row[]) ?? []).map((r) => ({
    date: str(r.date) ?? '',
    provider: str(r.provider),
    sleepHours: num(r.sleep_hours),
    sleepPerf: num(r.sleep_perf),
    recovery: num(r.recovery),
    hrv: num(r.hrv),
    rhr: num(r.rhr),
    strain: num(r.strain),
  }));

  const pr = (prefs.data ?? null) as Row | null;
  const resolvedPrefs: SleepPrefs = pr
    ? {
        wakeTime: num(pr.wake_time) ?? DEFAULT_PREFS.wakeTime,
        sleepNeedHours: num(pr.sleep_need_hours) ?? DEFAULT_PREFS.sleepNeedHours,
        recoveryLevel: str(pr.recovery_level),
        peakHour: num(pr.peak_hour),
      }
    : { ...DEFAULT_PREFS };

  return { entries, prefs: resolvedPrefs, hasWearable: entries.length > 0 };
}

// ── Weight ─────────────────────────────────────────────────────────────────────

export interface WeightData {
  entries: { date: string; kg: number; note: string | null }[]; // newest first
  latestKg: number | null;
  deltaKg: number | null;
  trend: 'up' | 'down' | 'steady' | null;
  windowDays: number;
}

export async function getWeights(v: VitalityDb, days = 30): Promise<WeightData> {
  const { db, userId } = v;
  const { data } = await db
    .from('weights')
    .select('date, weight_kg, note')
    .eq('user_id', userId)
    .gte('date', dateKeyDaysAgo(days))
    .order('date', { ascending: false });

  const entries = ((data as Row[]) ?? [])
    .map((r) => ({ date: str(r.date) ?? '', kg: num(r.weight_kg) ?? 0, note: str(r.note) }))
    .filter((e) => e.date);

  const latestKg = entries.length ? entries[0].kg : null;
  let deltaKg: number | null = null;
  let trend: WeightData['trend'] = null;
  if (entries.length >= 2 && latestKg != null) {
    const oldest = entries[entries.length - 1].kg;
    deltaKg = round(latestKg - oldest, 1);
    trend = deltaKg > 0.3 ? 'up' : deltaKg < -0.3 ? 'down' : 'steady';
  }
  return { entries, latestKg, deltaKg, trend, windowDays: days };
}

// ── Nutrition / fuel ────────────────────────────────────────────────────────────

export interface NutritionData {
  onboarded: boolean;
  kcalTarget: number;
  proteinTarget: number;
  carbsTarget: number | null;
  fatTarget: number | null;
  goalOutcome: string | null;
  adaptiveEnabled: boolean;
  today: { kcal: number; protein: number; carbs: number; fat: number; mealCount: number; names: string[] };
  recentAvgKcal: number | null;
  recentLoggedDays: number;
}

export async function getNutrition(v: VitalityDb, todayKey = getLocalDateKey()): Promise<NutritionData> {
  const { db, userId } = v;
  const [goalsRes, mealsRes] = await Promise.all([
    db.from('nutrition_goals').select('*').eq('user_id', userId).maybeSingle(),
    db
      .from('nutrition_meals')
      .select('day_key, totals, what_i_see')
      .eq('user_id', userId)
      .gte('day_key', dateKeyDaysAgo(10))
      .order('logged_at', { ascending: true }),
  ]);

  const g = (goalsRes.data ?? {}) as Row;
  const meals = ((mealsRes.data as Row[]) ?? []).map((r) => {
    const t = (r.totals && typeof r.totals === 'object' ? r.totals : {}) as Row;
    return {
      dayKey: str(r.day_key) ?? '',
      kcal: num(t.kcal) ?? 0,
      protein: num(t.protein) ?? 0,
      carbs: num(t.carbs) ?? 0,
      fat: num(t.fat) ?? 0,
      name: str(r.what_i_see),
    };
  });

  const todayMeals = meals.filter((m) => m.dayKey === todayKey);
  const today = todayMeals.reduce(
    (acc, m) => ({
      kcal: acc.kcal + m.kcal,
      protein: acc.protein + m.protein,
      carbs: acc.carbs + m.carbs,
      fat: acc.fat + m.fat,
      mealCount: acc.mealCount + 1,
      names: m.name ? [...acc.names, m.name] : acc.names,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0, names: [] as string[] },
  );

  const byDay = new Map<string, number>();
  for (const m of meals) {
    if (m.dayKey === todayKey) continue;
    byDay.set(m.dayKey, (byDay.get(m.dayKey) ?? 0) + m.kcal);
  }
  const recentAvgKcal = byDay.size
    ? Math.round(Array.from(byDay.values()).reduce((a, b) => a + b, 0) / byDay.size)
    : null;

  return {
    onboarded: Boolean(g.onboarded),
    kcalTarget: num(g.kcal_target) ?? 2400,
    proteinTarget: num(g.protein_target) ?? 180,
    carbsTarget: num(g.carbs_target),
    fatTarget: num(g.fat_target),
    goalOutcome: str(g.goal_outcome),
    adaptiveEnabled: g.adaptive_enabled !== false,
    today: {
      kcal: Math.round(today.kcal),
      protein: Math.round(today.protein),
      carbs: Math.round(today.carbs),
      fat: Math.round(today.fat),
      mealCount: today.mealCount,
      names: today.names.slice(0, 8),
    },
    recentAvgKcal,
    recentLoggedDays: byDay.size,
  };
}

// ── Workouts ─────────────────────────────────────────────────────────────────

export interface WorkoutEntry {
  date: string;
  dayName: string | null;
  submitted: boolean;
  exerciseCount: number;
  setCount: number;
  hasCardio: boolean;
}

export interface WorkoutData {
  entries: WorkoutEntry[]; // newest first
  submittedLast7: number;
  windowDays: number;
}

export async function getWorkouts(v: VitalityDb, days = 14): Promise<WorkoutData> {
  const { db, userId } = v;
  const { data } = await db
    .from('workouts')
    .select('date, day_name, exercises, cardio, submitted_at')
    .eq('user_id', userId)
    .gte('date', dateKeyDaysAgo(days))
    .order('date', { ascending: false });

  const entries: WorkoutEntry[] = ((data as Row[]) ?? []).map((r) => {
    const exercises = Array.isArray(r.exercises) ? (r.exercises as Row[]) : [];
    const setCount = exercises.reduce(
      (acc, ex) => acc + (Array.isArray(ex.sets) ? (ex.sets as unknown[]).length : 0),
      0,
    );
    const cardio = Array.isArray(r.cardio) ? (r.cardio as unknown[]) : [];
    return {
      date: str(r.date) ?? '',
      dayName: str(r.day_name),
      submitted: Boolean(r.submitted_at),
      exerciseCount: exercises.length,
      setCount,
      hasCardio: cardio.length > 0,
    };
  });

  const cutoff7 = dateKeyDaysAgo(7);
  const submittedLast7 = new Set(
    entries.filter((e) => e.submitted && e.date >= cutoff7).map((e) => e.date),
  ).size;

  return { entries, submittedLast7, windowDays: days };
}

// ── Subscriptions ──────────────────────────────────────────────────────────────

export interface Subscription {
  name: string;
  amountChf: number;
  period: string;
  monthlyChf: number;
  renewal: string | null;
  trialEnds: string | null;
  previousAmountChf: number | null;
  priceChangedAt: string | null;
  enteredAmount: number | null;
  enteredCurrency: string | null;
}

export interface SubscriptionData {
  currency: string;
  subs: Subscription[];
  totalMonthlyChf: number;
  totalYearlyChf: number;
}

function toMonthlyChf(amountChf: number, period: string): number {
  switch (period) {
    case 'weekly':
      return (amountChf * 52) / 12;
    case 'yearly':
      return amountChf / 12;
    case 'monthly':
    default:
      return amountChf;
  }
}

export async function getSubscriptions(v: VitalityDb): Promise<SubscriptionData> {
  const { db, userId } = v;
  const [subsRes, prefsRes] = await Promise.all([
    db
      .from('finance_subscriptions')
      .select(
        'name, amount_chf, period, renewal, trial_ends, previous_amount_chf, price_changed_at, entered_amount, entered_currency',
      )
      .eq('user_id', userId),
    db.from('finance_prefs').select('currency').eq('user_id', userId).maybeSingle(),
  ]);

  const subs: Subscription[] = ((subsRes.data as Row[]) ?? []).map((r) => {
    const amountChf = num(r.amount_chf) ?? 0;
    const period = str(r.period) ?? 'monthly';
    return {
      name: str(r.name) ?? 'Unnamed',
      amountChf,
      period,
      monthlyChf: round(toMonthlyChf(amountChf, period), 2),
      renewal: str(r.renewal),
      trialEnds: str(r.trial_ends),
      previousAmountChf: num(r.previous_amount_chf),
      priceChangedAt: str(r.price_changed_at),
      enteredAmount: num(r.entered_amount),
      enteredCurrency: str(r.entered_currency),
    };
  });

  const totalMonthlyChf = round(
    subs.reduce((acc, s) => acc + s.monthlyChf, 0),
    2,
  );
  return {
    currency: (prefsRes.data as Row | null)?.currency as string | undefined ?? 'CHF',
    subs: subs.sort((a, b) => b.monthlyChf - a.monthlyChf),
    totalMonthlyChf,
    totalYearlyChf: round(totalMonthlyChf * 12, 2),
  };
}

// ── Finance overview ────────────────────────────────────────────────────────────

export interface FinanceOverview {
  currency: string;
  netWorthChf: number;
  accounts: { type: string | null; name: string | null; amountChf: number; ticker: string | null; shares: number | null }[];
  upcomingOrders: { name: string | null; amountChf: number; arrivalDate: string | null; direction: string }[];
}

export async function getFinanceOverview(v: VitalityDb): Promise<FinanceOverview> {
  const { db, userId } = v;
  const [accRes, ordRes, prefsRes] = await Promise.all([
    db
      .from('finance_accounts')
      .select('type, name, amount_chf, ticker, shares')
      .eq('user_id', userId),
    db
      .from('finance_orders')
      .select('name, amount_chf, arrival_date, direction, deducted_at')
      .eq('user_id', userId)
      .is('deducted_at', null),
    db.from('finance_prefs').select('currency').eq('user_id', userId).maybeSingle(),
  ]);

  const accounts = ((accRes.data as Row[]) ?? []).map((r) => ({
    type: str(r.type),
    name: str(r.name),
    amountChf: num(r.amount_chf) ?? 0,
    ticker: str(r.ticker),
    shares: num(r.shares),
  }));
  const netWorthChf = round(
    accounts.reduce((acc, a) => acc + a.amountChf, 0),
    2,
  );
  const upcomingOrders = ((ordRes.data as Row[]) ?? []).map((r) => ({
    name: str(r.name),
    amountChf: num(r.amount_chf) ?? 0,
    arrivalDate: str(r.arrival_date),
    direction: str(r.direction) ?? 'out',
  }));

  return {
    currency: ((prefsRes.data as Row | null)?.currency as string | undefined) ?? 'CHF',
    netWorthChf,
    accounts,
    upcomingOrders,
  };
}

// ── Notes / reminders ─────────────────────────────────────────────────────────

export async function getNotes(v: VitalityDb, days = 10, limit = 25): Promise<{ body: string; createdAt: string }[]> {
  const { db, userId } = v;
  const { data } = await db
    .from('notes')
    .select('body, created_at')
    .eq('user_id', userId)
    .gte('created_at', `${dateKeyDaysAgo(days)}T00:00:00Z`)
    .order('created_at', { ascending: false })
    .limit(limit);
  return ((data as Row[]) ?? [])
    .map((r) => ({ body: str(r.body) ?? '', createdAt: str(r.created_at) ?? '' }))
    .filter((n) => n.body);
}

// ── Durable user facts (shared mentor memory) ──────────────────────────────────

export async function getUserFacts(
  v: VitalityDb,
  limit = 25,
): Promise<{ kind: string | null; body: string; salience: number | null; source: string | null }[]> {
  const { db, userId } = v;
  const { data } = await db
    .from('user_facts')
    .select('kind, body, salience, source, expires_at')
    .eq('user_id', userId)
    .order('salience', { ascending: false })
    .limit(limit);
  const nowIso = new Date().toISOString();
  return ((data as Row[]) ?? [])
    .filter((r) => {
      const exp = str(r.expires_at);
      return !exp || exp > nowIso;
    })
    .map((r) => ({
      kind: str(r.kind),
      body: str(r.body) ?? '',
      salience: num(r.salience),
      source: str(r.source),
    }))
    .filter((f) => f.body);
}

// ── Peak schedule (today) ──────────────────────────────────────────────────────

export interface PeakTask {
  hour: number | null;
  endHour: number | null;
  title: string;
  done: boolean;
  kind: string;
  eventType: string | null;
}

export async function getPeakToday(v: VitalityDb, todayKey = getLocalDateKey()): Promise<PeakTask[]> {
  const { db, userId } = v;
  const { data } = await db
    .from('peak_tracker_tasks')
    .select('hour, end_hour, title, done, kind, event_type, position')
    .eq('user_id', userId)
    .eq('date', todayKey)
    .order('hour', { ascending: true })
    .order('position', { ascending: true });
  return ((data as Row[]) ?? []).map((r) => ({
    hour: num(r.hour),
    endHour: num(r.end_hour),
    title: str(r.title) ?? '',
    done: Boolean(r.done),
    kind: str(r.kind) ?? 'task',
    eventType: str(r.event_type),
  }));
}

// ── Active vitals goal ──────────────────────────────────────────────────────────

export async function getVitalsGoal(
  v: VitalityDb,
): Promise<{ metric: string; direction: string; targetValue: number | null; confidence: string | null; status: string } | null> {
  const { db, userId } = v;
  const { data } = await db
    .from('vitals_goals')
    .select('metric, direction, target_value, confidence, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  const r = data as Row | null;
  if (!r) return null;
  return {
    metric: str(r.metric) ?? '',
    direction: str(r.direction) ?? '',
    targetValue: num(r.target_value),
    confidence: str(r.confidence),
    status: str(r.status) ?? 'active',
  };
}
VITALITY_EOF
mkdir -p 'mcp/src'
cat > 'mcp/src/nudges.ts' <<'VITALITY_EOF'
// Nudge engine for the Vitality MCP.
//
// Pulls the read layer, then derives a prioritized list of nudges across every
// server-readable domain. This is what powers `vitality_daily_briefing` and the
// scheduled morning/evening agent. Pure derivation — no writes, no side effects.
//
// Honesty rule: anything the server genuinely cannot see (water, goals, brand,
// supplements — all browser-only localStorage today) is reported as a known gap,
// never silently dropped.

import type { VitalityDb } from './supabase.js';
import { fmtHour, getLocalDateKey, round } from './util.js';
import {
  getProfile,
  getSleep,
  getWeights,
  getNutrition,
  getWorkouts,
  getSubscriptions,
  getNotes,
  type SleepData,
  type WeightData,
  type NutritionData,
  type WorkoutData,
  type SubscriptionData,
  type Profile,
} from './queries.js';

export type Severity = 'urgent' | 'suggest' | 'info';

export interface Nudge {
  domain: 'sleep' | 'training' | 'nutrition' | 'weight' | 'finance' | 'reminders' | 'coverage';
  severity: Severity;
  title: string;
  detail: string;
}

const SEVERITY_RANK: Record<Severity, number> = { urgent: 0, suggest: 1, info: 2 };

// ── Recovery → training tier (SKILL.md "Vitality score" tiers) ─────────────────
function recoveryTier(recovery: number): { label: string; advice: string } {
  if (recovery >= 80) return { label: 'Peak', advice: 'push hard — green light for a heavy session' };
  if (recovery >= 65) return { label: 'Solid', advice: 'train normal' };
  if (recovery >= 50) return { label: 'Tired', advice: 'keep it moderate, trim the top sets' };
  if (recovery >= 35) return { label: 'Low', advice: 'go light or take active recovery' };
  return { label: 'Drained', advice: 'rest today — your body is asking for it' };
}

// ── Sleep ──────────────────────────────────────────────────────────────────────
function sleepNudges(sleep: SleepData): Nudge[] {
  const out: Nudge[] = [];
  const { wakeTime, sleepNeedHours } = sleep.prefs;
  const baselineBedtime = wakeTime - sleepNeedHours;

  if (!sleep.hasWearable) {
    out.push({
      domain: 'sleep',
      severity: 'info',
      title: `Target lights-out around ${fmtHour(baselineBedtime)}`,
      detail: `To wake at ${fmtHour(wakeTime)} with ${sleepNeedHours}h of sleep. No wearable is connected, so this is from your Peak schedule prefs only — connect Whoop, Oura, or Fitbit for recovery-aware timing.`,
    });
    return out;
  }

  // Sleep debt over the entries we have (cap at last 7).
  const recent = sleep.entries.filter((e) => e.sleepHours != null).slice(0, 7);
  let debt = 0;
  for (const e of recent) debt += Math.max(0, sleepNeedHours - (e.sleepHours ?? sleepNeedHours));
  debt = round(debt, 1);

  const latest = sleep.entries[0];
  const latestRecovery = sleep.entries.find((e) => e.recovery != null)?.recovery ?? null;

  // Earlier-bedtime shift if carrying meaningful debt or low recovery.
  let shift = 0;
  if (debt >= 3) shift = Math.min(1, debt / 6);
  if (latestRecovery != null && latestRecovery < 50) shift = Math.max(shift, 0.5);
  const targetBedtime = baselineBedtime - shift;

  out.push({
    domain: 'sleep',
    severity: shift > 0 ? 'suggest' : 'info',
    title: `Lights out around ${fmtHour(targetBedtime)} tonight`,
    detail:
      `Wake target ${fmtHour(wakeTime)}, sleep need ${sleepNeedHours}h.` +
      (debt >= 1 ? ` You're carrying ~${debt}h of sleep debt over the last week.` : '') +
      (shift > 0 ? ` Shifting bedtime ${Math.round(shift * 60)} min earlier to claw it back.` : ' You\'re on track — hold the routine.'),
  });

  if (latestRecovery != null && latestRecovery < 50) {
    out.push({
      domain: 'sleep',
      severity: 'suggest',
      title: `Recovery is ${latestRecovery} — prioritize an early night`,
      detail: `Latest reading${latest?.date ? ` (${latest.date})` : ''} is in the low band. Sleep is the highest-leverage lever here: protect the wind-down, kill the late screens.`,
    });
  }

  return out;
}

// ── Training readiness ──────────────────────────────────────────────────────────
function trainingNudges(sleep: SleepData, workouts: WorkoutData): Nudge[] {
  const out: Nudge[] = [];
  const latestRecovery = sleep.entries.find((e) => e.recovery != null)?.recovery ?? null;

  if (latestRecovery != null) {
    const tier = recoveryTier(latestRecovery);
    out.push({
      domain: 'training',
      severity: latestRecovery < 35 ? 'suggest' : 'info',
      title: `Recovery ${latestRecovery} (${tier.label}) — ${tier.advice}`,
      detail: `Training read for today is "${tier.label}". ${tier.advice[0].toUpperCase()}${tier.advice.slice(1)}.`,
    });
  }

  if (workouts.submittedLast7 === 0) {
    out.push({
      domain: 'training',
      severity: 'suggest',
      title: 'No sessions logged in the last 7 days',
      detail: 'Either a deliberate deload or the logger slipped — worth a check-in if you meant to train.',
    });
  } else {
    out.push({
      domain: 'training',
      severity: 'info',
      title: `${workouts.submittedLast7} session${workouts.submittedLast7 === 1 ? '' : 's'} logged this week`,
      detail: workouts.entries[0]?.dayName
        ? `Most recent: ${workouts.entries[0].dayName} on ${workouts.entries[0].date}.`
        : 'Keep the streak honest.',
    });
  }

  return out;
}

// ── Subscriptions / finance ──────────────────────────────────────────────────────
function subscriptionNudges(subs: SubscriptionData, todayKey: string): Nudge[] {
  const out: Nudge[] = [];
  if (subs.subs.length === 0) return out;

  out.push({
    domain: 'finance',
    severity: 'info',
    title: `${subs.totalMonthlyChf} CHF/mo in subscriptions (~${subs.totalYearlyChf} CHF/yr)`,
    detail: `${subs.subs.length} active across your stack. Display currency is ${subs.currency}; figures shown in canonical CHF.`,
  });

  const within = (dateStr: string | null, days: number): boolean => {
    if (!dateStr) return false;
    const target = new Date(dateStr + 'T00:00:00');
    const now = new Date(todayKey + 'T00:00:00');
    const diff = (target.getTime() - now.getTime()) / 86_400_000;
    return diff >= 0 && diff <= days;
  };

  // Trial ending — the most actionable, time-boxed nudge.
  for (const s of subs.subs) {
    if (within(s.trialEnds, 7)) {
      out.push({
        domain: 'finance',
        severity: 'urgent',
        title: `${s.name}: free trial ends ${s.trialEnds}`,
        detail: `Decide before it converts to ${s.amountChf} CHF/${s.period}. Cancel now if you're not keeping it.`,
      });
    }
  }

  // Price hikes.
  for (const s of subs.subs) {
    if (s.previousAmountChf != null && s.amountChf > s.previousAmountChf) {
      const up = round(s.amountChf - s.previousAmountChf, 2);
      out.push({
        domain: 'finance',
        severity: 'suggest',
        title: `${s.name} got more expensive (+${up} CHF)`,
        detail: `Now ${s.amountChf} CHF/${s.period}, was ${s.previousAmountChf}${s.priceChangedAt ? ` (changed ${s.priceChangedAt})` : ''}. Still worth it?`,
      });
    }
  }

  // Upcoming renewals (informational heads-up).
  const renewingSoon = subs.subs.filter((s) => within(s.renewal, 7));
  if (renewingSoon.length) {
    out.push({
      domain: 'finance',
      severity: 'info',
      title: `${renewingSoon.length} subscription${renewingSoon.length === 1 ? '' : 's'} renew this week`,
      detail: renewingSoon.map((s) => `${s.name} (${s.renewal}, ${s.amountChf} CHF)`).join(' · '),
    });
  }

  // Review candidates — the honest version of "cancel what you don't use".
  // Vitality stores no usage signal, so we surface the priciest and say so.
  const candidates = subs.subs.slice(0, 3);
  if (candidates.length) {
    out.push({
      domain: 'finance',
      severity: 'suggest',
      title: 'Worth a review: your priciest subscriptions',
      detail:
        candidates.map((s) => `${s.name} (${round(s.monthlyChf, 2)} CHF/mo)`).join(' · ') +
        '. Heads up: Vitality does not track last-used, so I can\'t tell which you actually use — these are simply the costliest. You decide if each earns its keep.',
    });
  }

  return out;
}

// ── Nutrition ────────────────────────────────────────────────────────────────────
function nutritionNudges(n: NutritionData): Nudge[] {
  if (!n.onboarded) return [];
  const out: Nudge[] = [];
  const { today, kcalTarget, proteinTarget } = n;

  const kcalLeft = kcalTarget - today.kcal;
  out.push({
    domain: 'nutrition',
    severity: 'info',
    title: `${today.kcal}/${kcalTarget} kcal · ${today.protein}/${proteinTarget}g protein today`,
    detail:
      today.mealCount === 0
        ? 'Nothing logged yet today.'
        : `${today.mealCount} meal${today.mealCount === 1 ? '' : 's'} logged. ${kcalLeft >= 0 ? `${Math.round(kcalLeft)} kcal left` : `${Math.round(-kcalLeft)} kcal over`}.`,
  });

  const proteinGap = proteinTarget - today.protein;
  if (today.mealCount > 0 && proteinGap > proteinTarget * 0.4) {
    out.push({
      domain: 'nutrition',
      severity: 'suggest',
      title: `Protein is short by ~${Math.round(proteinGap)}g`,
      detail: `At ${today.protein}/${proteinTarget}g. A protein-forward next meal closes the gap.`,
    });
  }

  return out;
}

// ── Weight ───────────────────────────────────────────────────────────────────────
function weightNudges(w: WeightData, profile: Profile, nutrition: NutritionData): Nudge[] {
  if (w.latestKg == null) return [];
  const out: Nudge[] = [];
  const isImperial = profile.units === 'imperial';
  const show = (kg: number) => (isImperial ? `${round(kg * 2.20462, 1)} lb` : `${round(kg, 1)} kg`);

  out.push({
    domain: 'weight',
    severity: 'info',
    title: `Weight ${show(w.latestKg)}${w.deltaKg != null ? ` (${w.deltaKg >= 0 ? '+' : ''}${show(w.deltaKg)} over ${w.windowDays}d)` : ''}`,
    detail: w.trend ? `Trend: ${w.trend}.` : 'Not enough entries to trend yet.',
  });

  const goal = nutrition.goalOutcome ?? profile.goal;
  if (goal && w.trend) {
    const misaligned =
      ((goal === 'cut' || goal === 'fat_loss') && w.trend === 'up') ||
      ((goal === 'bulk' || goal === 'muscle') && w.trend === 'down');
    if (misaligned) {
      out.push({
        domain: 'weight',
        severity: 'suggest',
        title: `Trend is fighting your "${goal}" goal`,
        detail: `Weight is trending ${w.trend} while you're aiming to ${goal}. Worth revisiting calories — the adaptive engine in Fuel can recalibrate.`,
      });
    }
  }

  return out;
}

// ── Reminders (notes) ────────────────────────────────────────────────────────────
function reminderNudges(notes: { body: string; createdAt: string }[]): Nudge[] {
  if (!notes.length) return [];
  // Surface the most recent few — these often carry time-sensitive intent.
  return notes.slice(0, 4).map((note) => ({
    domain: 'reminders' as const,
    severity: 'info' as const,
    title: 'From your notes',
    detail: note.body,
  }));
}

// ── Coverage gap (honesty footer) ─────────────────────────────────────────────────
function coverageNudge(): Nudge {
  return {
    domain: 'coverage',
    severity: 'info',
    title: 'Not visible to this briefing',
    detail:
      'Water, daily goals/streaks, supplement intake, and brand metrics live only in your browser today (localStorage), so the server can\'t see them. Sleep, training, nutrition, weight, subscriptions, finances, and notes are all live above.',
  };
}

export interface Briefing {
  generatedAt: string;
  dayKey: string;
  greetingName: string | null;
  nudges: Nudge[];
}

/** Build the full daily briefing across every server-readable domain. */
export async function buildBriefing(v: VitalityDb): Promise<Briefing> {
  const todayKey = getLocalDateKey();
  const [profile, sleep, weights, nutrition, workouts, subs, notes] = await Promise.all([
    getProfile(v),
    getSleep(v, 14),
    getWeights(v, 30),
    getNutrition(v, todayKey),
    getWorkouts(v, 14),
    getSubscriptions(v),
    getNotes(v, 5, 10),
  ]);

  const nudges: Nudge[] = [
    ...sleepNudges(sleep),
    ...trainingNudges(sleep, workouts),
    ...nutritionNudges(nutrition),
    ...weightNudges(weights, profile, nutrition),
    ...subscriptionNudges(subs, todayKey),
    ...reminderNudges(notes),
    coverageNudge(),
  ];

  nudges.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  return {
    generatedAt: new Date().toISOString(),
    dayKey: todayKey,
    greetingName: profile.firstName,
    nudges,
  };
}

/** Render a briefing as readable text for an agent or terminal. */
export function renderBriefing(b: Briefing): string {
  const icon: Record<Severity, string> = { urgent: '🔴', suggest: '🟡', info: '·' };
  const lines: string[] = [];
  lines.push(`Vitality briefing — ${b.dayKey}${b.greetingName ? ` for ${b.greetingName}` : ''}`);
  lines.push('');
  for (const n of b.nudges) {
    lines.push(`${icon[n.severity]} [${n.domain}] ${n.title}`);
    lines.push(`    ${n.detail}`);
  }
  return lines.join('\n');
}
VITALITY_EOF
mkdir -p 'mcp/src'
cat > 'mcp/src/index.ts' <<'VITALITY_EOF'
#!/usr/bin/env node
// Vitality MCP — read-only stdio server.
//
// Exposes a single Vitality user's data (sleep, training, nutrition, weight,
// finances, notes, durable facts) to an MCP client (Claude Code / Desktop), plus
// a `vitality_daily_briefing` tool that runs the nudge engine. Read-only: there
// are no write/mutate tools by design.
//
// stdout is the protocol channel — all human logging goes to stderr.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { getDb } from './supabase.js';
import { fmtHour, getLocalDateKey, round } from './util.js';
import {
  getProfile,
  getSleep,
  getWeights,
  getNutrition,
  getWorkouts,
  getSubscriptions,
  getFinanceOverview,
  getNotes,
  getUserFacts,
  getPeakToday,
  getVitalsGoal,
} from './queries.js';
import { buildBriefing, renderBriefing } from './nudges.js';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

const text = (t: string): ToolResult => ({ content: [{ type: 'text', text: t }] });

/** Wrap a handler so auth/query failures return a clean tool error, not a crash. */
function safe(fn: () => Promise<string>) {
  return async (): Promise<ToolResult> => {
    try {
      return text(await fn());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[vitality-mcp] tool error:', msg);
      return { content: [{ type: 'text', text: `Vitality error: ${msg}` }], isError: true };
    }
  };
}

const server = new McpServer({ name: 'vitality', version: '0.1.0' });

// ── whoami ──────────────────────────────────────────────────────────────────
server.registerTool(
  'vitality_whoami',
  {
    title: 'Who am I',
    description:
      'Profile + plan summary for the connected Vitality user: name, age, sex, units, goal, focus areas, and billing tier/subscription status. Call this first to ground every other answer.',
  },
  safe(async () => {
    const v = await getDb();
    const p = await getProfile(v);
    const lines = [
      `Name: ${p.firstName ?? '(unset)'}`,
      `Sex/age: ${p.sex ?? '?'} / ${p.age ?? '?'}`,
      `Units: ${p.units ?? 'metric'}`,
      p.heightCm ? `Height: ${p.heightCm} cm` : null,
      p.startingWeightKg ? `Starting weight: ${p.startingWeightKg} kg` : null,
      `Goal: ${p.goal ?? '(none set)'}`,
      p.focusAreas.length ? `Focus areas: ${p.focusAreas.join(', ')}` : null,
      `Plan tier: ${p.tier ?? 'free'}${p.subscriptionStatus ? ` (${p.subscriptionStatus})` : ''}`,
      p.currentPeriodEnd ? `Current period ends: ${p.currentPeriodEnd}` : null,
      `Connection: ${v.mode === 'service' ? 'service-role (RLS bypassed — local only)' : 'user session (RLS-scoped)'}`,
    ].filter(Boolean);
    return lines.join('\n');
  }),
);

// ── daily briefing (the nudge engine) ─────────────────────────────────────────
server.registerTool(
  'vitality_daily_briefing',
  {
    title: 'Daily briefing',
    description:
      'The headline tool. Runs the nudge engine across every server-readable domain (sleep/recovery, training readiness, nutrition, weight, subscriptions, reminders) and returns a prioritized briefing: 🔴 urgent, 🟡 suggested, · info. This is what a scheduled morning/evening agent should call. Also states what it cannot see (browser-only modules).',
  },
  safe(async () => {
    const v = await getDb();
    const b = await buildBriefing(v);
    return renderBriefing(b);
  }),
);

// ── sleep status ──────────────────────────────────────────────────────────────
server.registerTool(
  'vitality_sleep_status',
  {
    title: 'Sleep & recovery status',
    description:
      'Recent wearable sleep/recovery (Whoop/Oura/Fitbit) plus the computed recommended bedtime to hit the user\'s wake time and sleep need. Answers "when should I sleep?". days defaults to 14.',
    inputSchema: { days: z.number().int().min(1).max(60).optional().describe('How many days of history to read (default 14)') },
  },
  async ({ days }: { days?: number }): Promise<ToolResult> => {
    return safe(async () => {
      const v = await getDb();
      const s = await getSleep(v, days ?? 14);
      const bedtime = s.prefs.wakeTime - s.prefs.sleepNeedHours;
      const lines: string[] = [
        `Recommended lights-out: ~${fmtHour(bedtime)} (wake ${fmtHour(s.prefs.wakeTime)}, need ${s.prefs.sleepNeedHours}h).`,
      ];
      if (!s.hasWearable) {
        lines.push('No wearable connected — connect Whoop/Oura/Fitbit for recovery-aware timing.');
        return lines.join('\n');
      }
      const recent = s.entries.slice(0, 7);
      const sleptVals = recent.map((e) => e.sleepHours).filter((x): x is number => x != null);
      if (sleptVals.length) {
        const avg = round(sleptVals.reduce((a, b) => a + b, 0) / sleptVals.length, 1);
        const debt = round(
          recent.reduce((acc, e) => acc + Math.max(0, s.prefs.sleepNeedHours - (e.sleepHours ?? s.prefs.sleepNeedHours)), 0),
          1,
        );
        lines.push(`Last ${sleptVals.length} nights: avg ${avg}h, sleep debt ~${debt}h vs need.`);
      }
      lines.push('');
      lines.push('Recent readings (newest first):');
      for (const e of recent) {
        lines.push(
          `  ${e.date} [${e.provider ?? '?'}] ` +
            [
              e.sleepHours != null ? `sleep ${round(e.sleepHours, 1)}h` : null,
              e.sleepPerf != null ? `perf ${e.sleepPerf}%` : null,
              e.recovery != null ? `recovery ${e.recovery}` : null,
              e.hrv != null ? `hrv ${e.hrv}` : null,
              e.rhr != null ? `rhr ${e.rhr}` : null,
              e.strain != null ? `strain ${e.strain}` : null,
            ]
              .filter(Boolean)
              .join(' · '),
        );
      }
      return lines.join('\n');
    })();
  },
);

// ── training readiness ─────────────────────────────────────────────────────────
server.registerTool(
  'vitality_training_readiness',
  {
    title: 'Training readiness',
    description:
      'Today\'s train/rest read from latest recovery (Peak/Solid/Tired/Low/Drained tiers) plus how many sessions were logged in the last 7 days. Answers "should I train hard today?".',
  },
  safe(async () => {
    const v = await getDb();
    const [s, w] = await Promise.all([getSleep(v, 7), getWorkouts(v, 14)]);
    const rec = s.entries.find((e) => e.recovery != null)?.recovery ?? null;
    const lines: string[] = [];
    if (rec != null) {
      const tier =
        rec >= 80 ? 'Peak — push hard'
        : rec >= 65 ? 'Solid — train normal'
        : rec >= 50 ? 'Tired — keep it moderate'
        : rec >= 35 ? 'Low — light / active recovery'
        : 'Drained — rest';
      lines.push(`Recovery ${rec} → ${tier}.`);
    } else {
      lines.push('No recovery score available (Fitbit has no recovery metric; Whoop/Oura do). Train by feel.');
    }
    lines.push(`Sessions logged in the last 7 days: ${w.submittedLast7}.`);
    if (w.entries[0]) lines.push(`Most recent: ${w.entries[0].dayName ?? 'session'} on ${w.entries[0].date} (${w.entries[0].setCount} sets).`);
    return lines.join('\n');
  }),
);

// ── nutrition today ──────────────────────────────────────────────────────────
server.registerTool(
  'vitality_nutrition_today',
  {
    title: "Today's nutrition",
    description:
      'Today\'s calories and protein vs target, meal count, and recent daily-average calories. Reads the Fuel module (nutrition_goals + nutrition_meals).',
  },
  safe(async () => {
    const v = await getDb();
    const n = await getNutrition(v);
    if (!n.onboarded) return 'Fuel (nutrition) is not set up yet for this user.';
    const lines = [
      `Targets: ${n.kcalTarget} kcal, ${n.proteinTarget}g protein${n.goalOutcome ? ` (goal: ${n.goalOutcome})` : ''}.`,
      `Today: ${n.today.kcal} kcal, ${n.today.protein}g protein, ${n.today.carbs}g carbs, ${n.today.fat}g fat across ${n.today.mealCount} meal(s).`,
      n.today.names.length ? `Meals: ${n.today.names.join('; ')}.` : null,
      n.recentAvgKcal != null ? `Recent: avg ${n.recentAvgKcal} kcal over ${n.recentLoggedDays} logged day(s).` : null,
    ].filter(Boolean);
    return lines.join('\n');
  }),
);

// ── weight trend ──────────────────────────────────────────────────────────────
server.registerTool(
  'vitality_weight_trend',
  {
    title: 'Weight trend',
    description: 'Weigh-in history and trend over a window (default 30 days).',
    inputSchema: { days: z.number().int().min(7).max(365).optional().describe('Window in days (default 30)') },
  },
  async ({ days }: { days?: number }): Promise<ToolResult> => {
    return safe(async () => {
      const v = await getDb();
      const w = await getWeights(v, days ?? 30);
      if (!w.entries.length) return 'No weigh-ins recorded in this window.';
      const lines = [
        `Latest: ${w.latestKg} kg.`,
        w.deltaKg != null ? `Change over ${w.windowDays}d: ${w.deltaKg >= 0 ? '+' : ''}${w.deltaKg} kg (${w.trend}).` : 'Need ≥2 entries to trend.',
        '',
        'Entries (newest first):',
        ...w.entries.slice(0, 14).map((e) => `  ${e.date}: ${e.kg} kg${e.note ? ` — ${e.note}` : ''}`),
      ];
      return lines.join('\n');
    })();
  },
);

// ── subscriptions ──────────────────────────────────────────────────────────────
server.registerTool(
  'vitality_subscriptions',
  {
    title: 'Subscriptions',
    description:
      'All recurring subscriptions with monthly-normalized cost, total burn, trials ending soon, recent price hikes, and renewals due this week. Note: Vitality stores no usage signal, so "unused" cannot be auto-detected — this surfaces cost, trials, and price changes instead.',
  },
  safe(async () => {
    const v = await getDb();
    const s = await getSubscriptions(v);
    if (!s.subs.length) return 'No subscriptions recorded (or finance not yet synced to the server).';
    const todayKey = getLocalDateKey();
    const lines = [
      `Total: ${s.totalMonthlyChf} CHF/mo (~${s.totalYearlyChf} CHF/yr) across ${s.subs.length}. Display currency ${s.currency}; figures in CHF.`,
      '',
      ...s.subs.map((sub) => {
        const flags = [
          sub.trialEnds ? `trial ends ${sub.trialEnds}` : null,
          sub.previousAmountChf != null && sub.amountChf > sub.previousAmountChf ? `↑ from ${sub.previousAmountChf}` : null,
          sub.renewal ? `renews ${sub.renewal}` : null,
        ].filter(Boolean);
        return `  ${sub.name}: ${sub.amountChf} CHF/${sub.period} (${sub.monthlyChf} CHF/mo)${flags.length ? ` — ${flags.join(', ')}` : ''}`;
      }),
      '',
      `Today is ${todayKey}. No last-used tracking exists — judge "worth keeping" yourself; the costliest are listed first.`,
    ];
    return lines.join('\n');
  }),
);

// ── finance overview ──────────────────────────────────────────────────────────
server.registerTool(
  'vitality_finance_overview',
  {
    title: 'Finance overview',
    description: 'Net worth, accounts (bank/stocks/crypto/other), and upcoming orders/income not yet deducted. All in canonical CHF.',
  },
  safe(async () => {
    const v = await getDb();
    const f = await getFinanceOverview(v);
    if (!f.accounts.length && !f.upcomingOrders.length) return 'No finance data on the server yet for this user.';
    const lines = [
      `Net worth: ${f.netWorthChf} CHF (display currency ${f.currency}).`,
      '',
      'Accounts:',
      ...f.accounts.map((a) => `  [${a.type ?? '?'}] ${a.name ?? '?'}: ${a.amountChf} CHF${a.ticker ? ` (${a.shares ?? '?'} × ${a.ticker})` : ''}`),
    ];
    if (f.upcomingOrders.length) {
      lines.push('', 'Upcoming (not yet deducted):');
      for (const o of f.upcomingOrders) {
        lines.push(`  ${o.direction === 'in' ? '+' : '-'}${o.amountChf} CHF ${o.name ?? ''}${o.arrivalDate ? ` (≈${o.arrivalDate})` : ''}`);
      }
    }
    return lines.join('\n');
  }),
);

// ── recent workouts ─────────────────────────────────────────────────────────────
server.registerTool(
  'vitality_recent_workouts',
  {
    title: 'Recent workouts',
    description: 'Logged workout sessions over a window (default 14 days): day name, sets, whether submitted, cardio flag.',
    inputSchema: { days: z.number().int().min(1).max(90).optional().describe('Window in days (default 14)') },
  },
  async ({ days }: { days?: number }): Promise<ToolResult> => {
    return safe(async () => {
      const v = await getDb();
      const w = await getWorkouts(v, days ?? 14);
      if (!w.entries.length) return 'No workouts logged in this window.';
      return [
        `${w.entries.length} session(s); ${w.submittedLast7} submitted in the last 7 days.`,
        '',
        ...w.entries.map(
          (e) => `  ${e.date} — ${e.dayName ?? 'session'}: ${e.exerciseCount} exercises, ${e.setCount} sets${e.hasCardio ? ' + cardio' : ''}${e.submitted ? '' : ' (in progress)'}`,
        ),
      ].join('\n');
    })();
  },
);

// ── notes / reminders ────────────────────────────────────────────────────────
server.registerTool(
  'vitality_notes',
  {
    title: 'Notes & reminders',
    description: 'Recent notes from the Mentor "void"/quick-jot inbox — often carry time-sensitive intent (events, reminders). days defaults to 10.',
    inputSchema: { days: z.number().int().min(1).max(60).optional().describe('Look-back window in days (default 10)') },
  },
  async ({ days }: { days?: number }): Promise<ToolResult> => {
    return safe(async () => {
      const v = await getDb();
      const notes = await getNotes(v, days ?? 10, 25);
      if (!notes.length) return 'No notes in this window.';
      return notes.map((n) => `  • ${n.body}  (${n.createdAt.slice(0, 10)})`).join('\n');
    })();
  },
);

// ── durable user facts ──────────────────────────────────────────────────────────
server.registerTool(
  'vitality_user_facts',
  {
    title: 'Durable user facts',
    description: 'The shared mentor memory layer — durable facts about the user (hobbies, stressors, preferences, context), ranked by salience.',
  },
  safe(async () => {
    const v = await getDb();
    const facts = await getUserFacts(v, 30);
    if (!facts.length) return 'No durable facts recorded yet.';
    return facts.map((f) => `  • (${f.kind ?? 'fact'}, ${f.source ?? '?'}, salience ${f.salience ?? '?'}) ${f.body}`).join('\n');
  }),
);

// ── peak schedule today ──────────────────────────────────────────────────────
server.registerTool(
  'vitality_peak_today',
  {
    title: "Today's schedule (Peak)",
    description: "Today's tasks and events from the Peak planner timeline, with times and done state.",
  },
  safe(async () => {
    const v = await getDb();
    const [tasks, goal] = await Promise.all([getPeakToday(v), getVitalsGoal(v)]);
    const lines: string[] = [];
    if (goal) lines.push(`Active vitals goal: ${goal.direction} ${goal.metric}${goal.targetValue != null ? ` → ${goal.targetValue}` : ''} (confidence ${goal.confidence ?? '?'}).`, '');
    if (!tasks.length) {
      lines.push('No tasks or events scheduled for today.');
      return lines.join('\n');
    }
    for (const t of tasks) {
      const when = t.hour != null ? fmtHour(t.hour) + (t.endHour != null ? `–${fmtHour(t.endHour)}` : '') : 'anytime';
      lines.push(`  ${t.done ? '✓' : '○'} ${when} — ${t.title}${t.kind === 'event' ? ` [${t.eventType ?? 'event'}]` : ''}`);
    }
    return lines.join('\n');
  }),
);

// ── boot ──────────────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[vitality-mcp] ready (read-only). Tools registered. Waiting on stdio…');
}

main().catch((err) => {
  console.error('[vitality-mcp] fatal:', err);
  process.exit(1);
});
VITALITY_EOF
mkdir -p 'mcp/src'
cat > 'mcp/src/cli.ts' <<'VITALITY_EOF'
// One-shot CLI: print the daily briefing to stdout, then exit.
//
//   npm run briefing            # human-readable
//   npm run briefing -- --json  # machine-readable (for piping into an agent)
//
// Handy for testing your .env and for a cron that doesn't go through MCP.

import { getDb } from './supabase.js';
import { buildBriefing, renderBriefing } from './nudges.js';

async function main() {
  const json = process.argv.includes('--json');
  const v = await getDb();
  const briefing = await buildBriefing(v);
  if (json) {
    process.stdout.write(JSON.stringify(briefing, null, 2) + '\n');
  } else {
    process.stdout.write(renderBriefing(briefing) + '\n');
  }
}

main().catch((err) => {
  console.error('[vitality-mcp] briefing failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
VITALITY_EOF
mkdir -p 'mcp/agents'
cat > 'mcp/agents/daily-briefing.md' <<'VITALITY_EOF'
# Vitality daily briefing — scheduled agent

This is the prompt for a **scheduled Claude agent** (a cron routine) that reads
your Vitality data through the MCP and delivers a short, human briefing. It does
not write anything — read-only, like the whole MCP.

## How it works

```
cron fires  ──▶  Claude agent  ──▶  vitality_daily_briefing (MCP tool)
                                     │
                                     └─▶ runs the nudge engine over your
                                         sleep / training / nutrition / weight /
                                         subscriptions / notes, returns a
                                         prioritized briefing
                      ▼
            agent relays it to you (chat output, or a channel you wire up)
```

Two scheduling options:

1. **Claude Code routine (recommended).** When you're back, run `/schedule` and
   create a routine on the cadence you want (e.g. 7:30am + 9:30pm). Paste the
   **agent prompt** below as the routine's task. The routine must have the
   `vitality` MCP server enabled (it's in your `.mcp.json`).
   _Left for you to create — pick the times + where the report should land
   (chat, a note, an email via the Gmail MCP). Outward delivery is your call._

2. **Plain cron, no MCP.** If you just want the text in a file/notification:
   `cd mcp && npm run briefing` prints the briefing; pipe it wherever
   (`>> ~/vitality-briefings.log`, `terminal-notifier`, etc.).

## The agent prompt (paste into /schedule)

> You are my Vitality morning/evening coach. Call the `vitality_daily_briefing`
> MCP tool. Then write me a SHORT brief (≤120 words), warm and direct, in this
> order: anything 🔴 urgent first (a trial ending, a recovery crash), then the
> single most useful 🟡 suggestion for right now, then a one-line status. Lead
> with sleep timing if it's evening, training readiness if it's morning. Use my
> first name. Never invent data the tool didn't return. If the tool reports a
> coverage gap (water/goals/etc. not visible), don't mention it unless it's
> relevant. End with one concrete next action.

## Tuning

- **Morning vs evening:** create two routines with slightly different prompts —
  morning leans on `training_readiness` + today's schedule; evening leans on
  `sleep_status` (the "go to bed at X" nudge) + tomorrow's first event.
- **Quieter briefings:** tell the agent to only message you if there's at least
  one 🔴 or 🟡 — otherwise stay silent.
- **Delivery:** the agent can drop the brief into a Vitality note (future write
  tool), email it (Gmail MCP), or just print it in the routine's run log.
VITALITY_EOF
mkdir -p 'docs'
cat > 'docs/MCP-INTEGRATION.md' <<'VITALITY_EOF'
# Vitality ↔ Claude — MCP integration

**Status:** v0.1 built (local, read-only) · hosted/multi-user designed · not yet committed
**Code:** [`mcp/`](../mcp/) · **Superpowers:** yes (multi-agent data-substrate mapping)
**Date:** 2026-06-15

This doc is the full picture of what a Vitality MCP can do: the mental model, the
working v0.1, the complete capability map ("everything it can do"), the nudge
catalog, both architectures (local + hosted), and the security model. The README
in [`mcp/`](../mcp/README.md) is the quickstart; this is the design.

---

## 1. The mental model (what MCP is, honestly)

MCP (Model Context Protocol) exposes **tools** (functions Claude can call) and
**resources** (data Claude can read) to an MCP *client* — Claude Code in VSCode,
or Claude Desktop. Vitality is the **server**; Claude is the client.

Three things people conflate, separated:

| You imagine | Reality | Mechanism |
|---|---|---|
| "Vitality watches my chat" | **Claude reads Vitality** when relevant to what you asked. It's pull, on-demand. | MCP tool call |
| "It tells me when to sleep, unprompted" | Needs a **scheduler** to push. MCP is the data source; a cron'd agent is the trigger. | Scheduled agent + MCP |
| "It's pinned on my left" | UI, separate from MCP. The chat is the interface; or open the web app in a side panel. | n/a |

The flip that matters: **it's not Vitality monitoring you — it's Claude reading
your file to inform the conversation**, the same way the in-app mentor does
([lib/coach/context.ts](../lib/coach/context.ts) is the in-app version of exactly
this aggregation).

---

## 2. What's built (v0.1 — local, read-only)

A standalone Node/TypeScript stdio MCP server in [`mcp/`](../mcp/):

- **12 read tools** (table below) scoped to one user.
- **A nudge engine** ([mcp/src/nudges.ts](../mcp/src/nudges.ts)) that derives a
  prioritized **daily briefing** across every readable domain.
- **A scheduled-agent wrapper** ([mcp/agents/daily-briefing.md](../mcp/agents/daily-briefing.md))
  for morning/evening delivery.
- **RLS-respecting auth by default** (signs in as the user with the anon key);
  service-role is opt-in and flagged.
- Verified: installs, typechecks, builds, and answers the MCP `initialize` +
  `tools/list` handshake with all 12 tools.

Read-only by design — there are **no write tools** in v0.1.

---

## 3. Everything it can do — capability map

Organized by life domain. Each shows: **read** (data the MCP can surface),
**derive** (nudges/insight computed from it), and **act** (future write/action
tools — none built yet). "Source" notes whether the data is server-readable today.

### 3.1 Sleep & recovery — _"when should I sleep?"_ ✅ fully readable
- **Source:** `wearable_data` (Whoop/Oura/Fitbit: `sleep_hours`, `sleep_perf`,
  `recovery`, `hrv`, `rhr`, `strain`) + `peak_tracker_prefs` (`wake_time`,
  `sleep_need_hours`, `recovery_level`).
- **Read:** recent nights, recovery, HRV/RHR trend.
- **Derive (built):** recommended **lights-out time** = wake − sleep-need,
  shifted earlier when carrying **sleep debt** (7-day deficit) or when latest
  recovery < 50. "Recovery is low → prioritize an early night."
- **Act (future):** set tonight's bedtime reminder; write a wind-down task into
  the Peak schedule (`peak_tracker_tasks`).

### 3.2 Training readiness — _"should I train hard today?"_ ✅ readable
- **Source:** `wearable_data.recovery` + `workouts` (submitted sessions).
- **Derive (built):** recovery → **Peak / Solid / Tired / Low / Drained** tier
  (SKILL.md tiers) → push/normal/moderate/light/rest. Weekly session count;
  flags zero-session weeks.
- **Act (future):** swap today's split day to recovery; auto-deload suggestion.

### 3.3 Nutrition / fuel — _"am I on track to eat well?"_ ✅ readable
- **Source:** `nutrition_goals` + `nutrition_meals` (`totals` per `day_key`).
- **Derive (built):** today's kcal/protein vs target; protein-gap nudge; recent
  daily average. Adaptive check-in is in-app today
  ([lib/nutrition/adaptive](../lib/nutrition/adaptive.ts)) — portable later.
- **Act (future):** log a meal/template (`nutrition_meals`, `nutrition_templates`).

### 3.4 Weight — _"is my weight matching my goal?"_ ✅ readable
- **Source:** `weights` (canonical kg; display converts to the user's units).
- **Derive (built):** trend over a window; **goal-misalignment** flag (cutting
  but trending up, or bulking but trending down).
- **Act (future):** log a weigh-in.

### 3.5 Subscriptions & finance — _"what should I cancel?"_ ✅ readable (with one caveat)
- **Source:** `finance_subscriptions`, `finance_accounts`, `finance_orders`,
  `finance_net_worth_history`, `finance_prefs`. (BUILD13 moved finance to
  Supabase; [state.ts](../app/app/finance/state.ts) confirms "source of truth is
  Supabase, RLS-scoped".)
- **Read:** all subs (monthly-normalized), net worth, accounts, upcoming orders.
- **Derive (built):** total monthly/yearly burn; **trial ending** (urgent);
  **price hike** detection (`previous_amount_chf`); **renewals due this week**;
  **review candidates** = priciest subs.
- **⚠ The honest limit:** there is **no `last_used_at` / usage signal** in the
  schema, so "unused" can't be auto-detected. The MCP surfaces cost/trials/hikes
  and says so. A real "cancel what you don't use" needs a usage signal (see §8).
- **Act (future):** mark a sub for cancellation / draft a cancellation; flag a
  wishlist item as affordable when net worth crosses a threshold.

### 3.6 Notes & reminders — _"what did I tell myself to do?"_ ✅ readable
- **Source:** `notes` (the Mentor "void" + quick-jot inbox).
- **Derive (built):** surfaces recent notes that often carry time-sensitive
  intent ("event 7pm tomorrow").
- **Act (future):** create a note; promote a note to a goal/task.

### 3.7 Durable user facts — the memory layer ✅ readable
- **Source:** `user_facts` (hobbies, stressors, preferences, context, ranked by
  `salience`) + `coach_memory.summary`.
- **Read:** what Vitality "knows about you" — lets any Claude session inherit the
  in-app mentor's memory.
- **Act (future):** write a new durable fact from a Claude conversation.

### 3.8 Peak schedule & vitals goals ✅ readable
- **Source:** `peak_tracker_tasks` (today's timeline), `vitals_goals` (active
  metric goal).
- **Read:** today's events/tasks + the one active wearable-metric goal.
- **Act (future):** add/complete a task; set a vitals goal.

### 3.9 Blocked today — browser-only (`localStorage`) ⛔ not server-readable
These have **no Supabase persistence** yet, so the server cannot see them. The
briefing names them as gaps rather than pretending.

| Module | Store | To unblock |
|---|---|---|
| Water | `vitality_water_v1` | mirror to the (dormant) `water_log` table |
| Goals / streaks | `vitality_goals_v1` | add a `goals` table |
| Supplement intake | `vitality_supplements_v1` | add a `supplement_log` table |
| Brand / socials | `vitality_brand_v1` | add `brand_*` tables |
| Peak substance logs | part of `vitality_peak_v1` | add a `peak_substance_log` table |

Each is a small migration away from being a first-class MCP domain. **This is the
single highest-leverage follow-up** if the MCP matters: every localStorage module
moved to Supabase becomes instantly visible to Claude *and* syncable across
devices in the app itself.

---

## 4. Nudge catalog

The briefing engine ([nudges.ts](../mcp/src/nudges.ts)) emits prioritized nudges:
🔴 urgent · 🟡 suggest · · info.

**Built now:**
- 🟡/· **Bedtime** — recommended lights-out, shifted earlier for sleep debt / low recovery.
- 🟡 **Low recovery** — prioritize sleep tonight.
- ·/🟡 **Training read** — Peak/Solid/Tired/Low/Drained → action; zero-session-week flag.
- ·/🟡 **Nutrition** — kcal/protein status; protein-gap nudge.
- ·/🟡 **Weight** — trend; goal-misalignment.
- 🔴 **Trial ending** (≤7d) · 🟡 **price hike** · · **renewals this week** · 🟡 **review priciest subs**.
- · **Reminders** — recent notes surfaced.
- · **Coverage** — what the briefing can't see.

**Future (need either new data or write tools):**
- Hydration behind target (needs water in Supabase).
- Goal streak at risk (needs goals in Supabase).
- Supplements not taken today (needs supplement log in Supabase).
- "Net worth crossed your wishlist target" (have the data — easy add).
- Wearable-goal progress vs `vitals_goals` target.
- Caffeine-too-late vs bedtime (needs substance log in Supabase).

---

## 5. Architecture

### 5.1 Local (built) — personal, one user
```
Claude Code / Desktop ──stdio──▶ vitality-mcp (Node)
                                     │  anon key + your sign-in  (RLS as you)
                                     ▼
                                  Supabase
```
- Lowest friction, zero new infra, no OAuth.
- Auth = your email/password → RLS-scoped session. Service-role is opt-in only.
- This is what's in [`mcp/`](../mcp/).

### 5.2 Hosted (designed) — "Connect Vitality to Claude" as a product feature
A **remote MCP endpoint inside the Next.js app**, so any user can connect their
own Claude — the same standalone→hosted story as the rest of Vitality, applied to
the AI layer.

```
Anyone's Claude ──HTTP (OAuth)──▶ /app/api/mcp  ──▶ Supabase (their RLS context)
```
- **Transport:** Streamable HTTP MCP (the SDK supports it) as a route handler
  under `app/api/mcp/` — fits the "all third-party access goes through route
  handlers" rule (CLAUDE.md #4).
- **Auth:** OAuth 2.1 (MCP's auth spec) → mint a per-user token → every tool
  resolves `auth.uid()` and queries run under that user's RLS. No service role.
- **Tier gating (CLAUDE.md #5):** make the MCP a **paid-tier feature** — check
  `profiles.tier` server-side before serving tool calls, exactly like the
  existing pattern. A natural Plus/Pro perk.
- **Reuse:** the tool logic is the same; only the auth/transport layer differs.
  The query layer can converge with [lib/coach/collectors.ts](../lib/coach/collectors.ts).

### 5.3 Write tools (future, both modes)
Read-only is the safe v1. Writes (log a weigh-in, create a note, mark a sub for
cancel, add a Peak task) are a clean follow-up — each maps to an existing table
with RLS already enforcing ownership. Gate destructive/outward actions behind
explicit confirmation.

---

## 6. Security model

1. **Read-only v0.1** — no mutation surface at all.
2. **RLS-respecting by default** — user-session auth means the server is
   structurally confined to one user's data; RLS is the enforcement, not app code.
3. **Service-role is opt-in, loud, and local-only** — it bypasses RLS (CLAUDE.md
   #3), so it's gated behind an explicit env pair, warns on boot, and is
   documented as never-ship-to-client. Flagged for Alex before any hosted use.
4. **No keys to the client** — anon key is public-safe; service role/Supabase
   secrets stay in the server process (CLAUDE.md #4).
5. **Hosted = OAuth + per-user RLS + tier check** — no shared secret, no RLS
   bypass, paid-tier gated.
6. **stdout discipline** — all logs to stderr; stdout is the protocol channel.

---

## 7. Proactive delivery (the "tell me" part)

MCP is pull; proactivity needs a scheduler. Chosen path: **scheduled agent
reports**. A cron'd Claude routine calls `vitality_daily_briefing` and relays a
short brief (morning: readiness + schedule; evening: bedtime + tomorrow's first
event). Prompt + wiring in [mcp/agents/daily-briefing.md](../mcp/agents/daily-briefing.md).
Creating the actual routine (times + delivery channel) is left to Alex — outward
delivery and cadence are a human call.

Plain-cron fallback (no MCP): `npm run briefing` prints the brief; pipe it to a
file or `terminal-notifier`.

---

## 8. Honest limits

- **No subscription usage signal** → can't auto-detect "unused" subs. Surfaces
  cost/trials/hikes instead. A real version needs a usage signal (manual
  last-used tap, or per-service API — most have none).
- **Browser-only modules invisible** (water, goals, supplements, brand) until
  migrated to Supabase. The briefing says so.
- **No real cancellation API** — most services can't be cancelled programmatically;
  the realistic action is *flag + draft*, you click send.
- **FX** — finance amounts are canonical CHF; converting to the display currency
  needs the app's FX route (not wired into the MCP yet).
- **Vitality composite score** — the MCP uses recovery tiers directly rather than
  re-implementing the full [lib/vitality](../lib/vitality/) contributor engine.

---

## 9. Roadmap

1. **Now:** v0.1 local read-only MCP + daily briefing (done).
2. **Wire the schedule:** create the morning/evening routine via `/schedule`.
3. **Unblock localStorage modules:** migrate water → `water_log`, add `goals`,
   `supplement_log` tables. Biggest coverage win; also helps the app.
4. **Add write tools:** weigh-in, note, Peak task, mark-sub-for-cancel (confirmed).
5. **Hosted MCP:** `app/api/mcp/` Streamable-HTTP endpoint, OAuth, tier-gated —
   ship "Connect Vitality to Claude" as a Plus/Pro feature.
6. **Subscription usage signal:** a lightweight "still using this?" tap so the
   "cancel what you don't use" nudge becomes real.
VITALITY_EOF
echo ""
echo "Vitality MCP files written."
echo "Next: cd mcp && npm install && cp .env.example .env  (then fill it in) && npm run build && npm run briefing"
