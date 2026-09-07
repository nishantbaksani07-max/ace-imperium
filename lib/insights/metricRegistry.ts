/**
 * THE METRIC REGISTRY (TRAIN 5) - the one typed source of truth for every
 * drawable series a Vitality user owns.
 *
 * The law: adding a metric to Vitality is ONE entry in METRIC_REGISTRY. The
 * Room (/app/room) is generated from this array at render, the binding picker
 * lists it, strongestBinding words come from it, and docs/VEE-LIBRARY.md is
 * its narrative twin. Nothing here is guessed: every entry is transcribed from
 * the real code paths named in its `loader` and deep-linked to a real /app
 * route (unit-tested in __tests__/metricRegistry.test.ts).
 *
 * Encodes the 34 native metrics of the Vee Library:
 *   fitness 5 + health 11 (fuel 5, vitals 6 per-source triaged) + mind 4 +
 *   money 4 + audience 3 + the 7 tile report kinds (the open end) = 34.
 * Two entries are DYNAMIC FAMILIES (one entry, unbounded series): per-lift
 * progression (every lift the user trains is its own series) and each tile
 * report kind (every user-built stream of that kind).
 *
 * Pure module: no IO, no Supabase. Loaders are named, not executed - a
 * consumer that wants the series goes through the existing engines
 * (buildTicker / goalGuide / the vitals readers), never through here.
 */

import type { GoalCategory } from '@/lib/goals/categories'
import type { GuideModule } from '@/lib/insights/goalGuide'

/** Which way a healthy graph moves. `goal` = the goal decides (a cut wants
 *  weight down, a bulk wants it up). */
export type MetricDirection = 'up' | 'down' | 'neutral' | 'goal'

export type WearableProvider = 'whoop' | 'oura' | 'manual'

/** Where a metric's numbers come from. */
export type MetricSource =
  /** A native module writes it (train, fuel, finance, brand, mentor...). */
  | { kind: 'module'; name: string }
  /** A wearable column on wearable_data, triaged first-present-wins. */
  | { kind: 'wearable'; providers: WearableProvider[] }
  /** A user-built tile stream through the report contract. */
  | { kind: 'stream' }

/** The named loader: the table (and code path) that owns the datapoints.
 *  Names are real Supabase tables so the Room can count rows cheaply. */
export type MetricLoader =
  | 'workouts'
  | 'training_settings'
  | 'weights'
  | 'nutrition_meals'
  | 'water_days'
  | 'supplements_state'
  | 'wearable_data'
  | 'notes'
  | 'user_facts'
  | 'vitality_goals'
  | 'finance_net_worth_history'
  | 'finance_subscriptions'
  | 'finance_orders'
  | 'finance_wishlist'
  | 'social_snapshots'
  | 'brand_metrics'
  | 'tile_reports'

export interface MetricEntry {
  /** Stable snake_case id, unique across the registry. */
  id: string
  /** One of the nine goal buckets (lib/goals/categories.ts). */
  category: GoalCategory
  label: string
  unit: string
  direction: MetricDirection
  /** Classifying tokens: the words that route a goal to this metric
   *  (transcribed from categories.ts KEYWORDS + goalGuide.ts themeModules). */
  words: string[]
  /** Precise deep link - a real /app route, anchor included where one exists. */
  href: string
  source: MetricSource
  loader: MetricLoader
  /** The guide module that steers this metric, when one does. */
  module?: GuideModule
  /** A family: one entry, unbounded per-user series (per-lift, tile streams). */
  dynamic?: boolean
}

const VITALS_TRIAGE: WearableProvider[] = ['whoop', 'oura', 'manual']

export const METRIC_REGISTRY: MetricEntry[] = [
  // ---------------------------------------------------------- FITNESS (5)
  {
    id: 'lift_progression',
    category: 'fitness',
    label: 'Lift progression (every lift its own series)',
    unit: 'kg',
    direction: 'up',
    words: ['bench', 'squat', 'deadlift', 'press', 'curl', 'row', 'ohp', 'lift', 'pr', 'rep', 'set', 'plate'],
    href: '/app/fitness/log',
    source: { kind: 'module', name: 'train' },
    loader: 'workouts',
    module: 'train',
    dynamic: true,
  },
  {
    id: 'training_sessions',
    category: 'fitness',
    label: 'Sessions per week',
    unit: 'sessions/wk',
    direction: 'up',
    words: ['gym', 'workout', 'train', 'training', 'strength', 'strong', 'muscle', 'jacked', 'shredded'],
    href: '/app/fitness/log',
    source: { kind: 'module', name: 'train' },
    loader: 'workouts',
    module: 'train',
  },
  {
    id: 'days_since_workout',
    category: 'fitness',
    label: 'Days since last workout',
    unit: 'days',
    direction: 'down',
    words: ['consistency', 'streak', 'show up', 'skipped'],
    href: '/app/fitness/log',
    source: { kind: 'module', name: 'train' },
    loader: 'workouts',
    module: 'train',
  },
  {
    id: 'deload_state',
    category: 'fitness',
    label: 'Deload state',
    unit: 'state',
    direction: 'neutral',
    words: ['deload', 'light week', 'back off'],
    href: '/app/fitness/log',
    source: { kind: 'module', name: 'train' },
    loader: 'training_settings',
    module: 'train',
  },
  {
    id: 'cardio_sessions',
    category: 'fitness',
    label: 'Cardio sessions',
    unit: 'sessions',
    direction: 'up',
    words: ['running', 'jog', 'marathon', '5k', '10k', 'mile', 'cardio', 'endurance', 'conditioning'],
    href: '/app/fitness/log',
    source: { kind: 'module', name: 'train' },
    loader: 'workouts',
    module: 'train',
  },

  // ------------------------------------------------- HEALTH / FUEL (5)
  {
    id: 'body_weight',
    category: 'health',
    label: 'Body weight',
    unit: 'kg',
    direction: 'goal',
    words: ['weight', 'lean', 'lose', 'cut', 'fat', 'shred', 'lighter', 'leaner', 'gain', 'bulk', 'mass', 'bigger', 'recomp', 'tone'],
    href: '/app/fuel/macros#weight-logger',
    source: { kind: 'module', name: 'weight' },
    loader: 'weights',
    module: 'weight',
  },
  {
    id: 'calories',
    category: 'health',
    label: 'Calories per day',
    unit: 'kcal',
    direction: 'goal',
    words: ['diet', 'calorie', 'calories', 'cals', 'eat', 'nutrition', 'sugar', 'carb', 'meal', 'macro'],
    href: '/app/fuel/macros',
    source: { kind: 'module', name: 'macros' },
    loader: 'nutrition_meals',
    module: 'macros',
  },
  {
    id: 'protein',
    category: 'health',
    label: 'Protein per day',
    unit: 'g',
    direction: 'up',
    words: ['protein'],
    href: '/app/fuel/macros',
    source: { kind: 'module', name: 'macros' },
    loader: 'nutrition_meals',
    module: 'macros',
  },
  {
    id: 'water_servings',
    category: 'health',
    label: 'Water per day',
    unit: 'servings',
    direction: 'up',
    words: ['water', 'hydrate', 'hydration', 'drink more'],
    href: '/app/fuel#fuel-water',
    source: { kind: 'module', name: 'water' },
    loader: 'water_days',
    module: 'water',
  },
  {
    id: 'supplement_adherence',
    category: 'health',
    label: 'Stack adherence',
    unit: '%',
    direction: 'up',
    words: ['supplement', 'creatine', 'magnesium', 'vitamin', 'vitamins', 'omega', 'stack'],
    href: '/app/fitness/supplements',
    source: { kind: 'module', name: 'supplements' },
    loader: 'supplements_state',
    module: 'supplements',
  },

  // ------------------------------------------------ HEALTH / VITALS (6)
  // One wearable_data column each, triaged whoop > oura > manual: the goal
  // binds to the closest metric the user ACTUALLY has (lib/vitals/wearables.ts
  // WEARABLE_ORDER). Read vs the user's own baseline, never raw across bands.
  {
    id: 'recovery',
    category: 'health',
    label: 'Recovery',
    unit: 'score 0-100',
    direction: 'up',
    words: ['recover', 'recovery', 'readiness', 'stress', 'sore', 'energy', 'burnout'],
    href: '/app/vitals',
    source: { kind: 'wearable', providers: VITALS_TRIAGE },
    loader: 'wearable_data',
    module: 'recovery',
  },
  {
    id: 'strain',
    category: 'health',
    label: 'Strain',
    unit: '0-21',
    direction: 'neutral',
    words: ['strain', 'effort', 'load'],
    href: '/app/vitals',
    // Oura has no strain equivalent (hasStrain: false) - honest triage.
    source: { kind: 'wearable', providers: ['whoop', 'manual'] },
    loader: 'wearable_data',
    module: 'recovery',
  },
  {
    id: 'sleep_hours',
    category: 'health',
    label: 'Sleep hours',
    unit: 'h/night',
    direction: 'up',
    words: ['sleep', 'insomnia', 'bed time', 'rest more', 'tired'],
    href: '/app/vitals',
    source: { kind: 'wearable', providers: VITALS_TRIAGE },
    loader: 'wearable_data',
    module: 'recovery',
  },
  {
    id: 'sleep_performance',
    category: 'health',
    label: 'Sleep performance',
    unit: '%',
    direction: 'up',
    words: ['sleep quality', 'sleep score', 'sleep performance'],
    href: '/app/vitals',
    source: { kind: 'wearable', providers: VITALS_TRIAGE },
    loader: 'wearable_data',
    module: 'recovery',
  },
  {
    id: 'hrv',
    category: 'health',
    label: 'HRV',
    unit: 'ms',
    direction: 'up',
    words: ['hrv', 'heart rate variability'],
    href: '/app/vitals',
    source: { kind: 'wearable', providers: ['whoop', 'oura'] },
    loader: 'wearable_data',
    module: 'recovery',
  },
  {
    id: 'rhr',
    category: 'health',
    label: 'Resting heart rate',
    unit: 'bpm',
    direction: 'down',
    words: ['rhr', 'resting heart rate'],
    href: '/app/vitals',
    source: { kind: 'wearable', providers: ['whoop', 'oura'] },
    loader: 'wearable_data',
    module: 'recovery',
  },

  // ----------------------------------------------------------- MIND (4)
  {
    id: 'notes_stream',
    category: 'mind',
    label: 'Notes and the void',
    unit: 'notes',
    direction: 'neutral',
    words: ['journal', 'reflect', 'note', 'notes'],
    href: '/app/mentor',
    source: { kind: 'module', name: 'mentor' },
    loader: 'notes',
    module: 'notes',
  },
  {
    id: 'mood',
    category: 'mind',
    label: 'Mood (7-day strip)',
    unit: '1-5',
    direction: 'up',
    words: ['mood', 'mental health', 'meditate', 'mindful', 'therapy'],
    href: '/app/mentor',
    source: { kind: 'module', name: 'mentor' },
    loader: 'user_facts',
  },
  {
    id: 'vent_sessions',
    category: 'mind',
    label: 'Vent sessions',
    unit: 'sessions',
    direction: 'neutral',
    words: ['vent', 'let it out', 'off my chest'],
    href: '/app/mentor',
    source: { kind: 'module', name: 'mentor' },
    loader: 'user_facts',
  },
  {
    id: 'goal_progress',
    category: 'mind',
    label: 'Goal progress and streak',
    unit: 'progress',
    direction: 'up',
    words: ['goal', 'goals', 'streak', 'habit'],
    href: '/app/mentor',
    source: { kind: 'module', name: 'mentor' },
    loader: 'vitality_goals',
  },

  // ---------------------------------------------------------- MONEY (4)
  {
    id: 'net_worth',
    category: 'money',
    label: 'Net worth',
    unit: 'CHF',
    direction: 'up',
    words: ['save', 'savings', 'invest', 'net worth', 'wealth', 'debt', 'budget', 'income', 'cash', 'salary', 'retire', 'portfolio', 'crypto', 'stocks', 'rich'],
    href: '/app/finance',
    source: { kind: 'module', name: 'finance' },
    loader: 'finance_net_worth_history',
    module: 'finance',
  },
  {
    id: 'subscription_burn',
    category: 'money',
    label: 'Subscription burn',
    unit: 'CHF/mo',
    direction: 'down',
    words: ['subscription', 'subscriptions', 'burn', 'spend less'],
    href: '/app/finance',
    source: { kind: 'module', name: 'finance' },
    loader: 'finance_subscriptions',
    module: 'finance',
  },
  {
    id: 'order_spend',
    category: 'money',
    label: 'Order spend',
    unit: 'CHF',
    direction: 'neutral',
    words: ['spend', 'order', 'orders', 'purchase', 'receipt'],
    href: '/app/finance',
    source: { kind: 'module', name: 'finance' },
    loader: 'finance_orders',
    module: 'finance',
  },
  {
    id: 'wishlist',
    category: 'money',
    label: 'Wishlist',
    unit: 'items',
    direction: 'neutral',
    words: ['wishlist', 'want', 'save up for'],
    href: '/app/finance',
    source: { kind: 'module', name: 'finance' },
    loader: 'finance_wishlist',
    module: 'finance',
  },

  // ------------------------------------------------------- AUDIENCE (3)
  {
    id: 'followers',
    category: 'audience',
    label: 'Followers per platform',
    unit: 'followers',
    direction: 'up',
    words: ['subs', 'subscriber', 'subscribers', 'follower', 'followers', 'audience', 'youtube', 'tiktok', 'instagram', 'ig', 'twitter', 'channel', 'patreon', 'newsletter', 'reach', 'viral'],
    href: '/app/brand',
    source: { kind: 'module', name: 'brand' },
    loader: 'social_snapshots',
    module: 'brand',
  },
  {
    id: 'views',
    category: 'audience',
    label: 'Views per period',
    unit: 'views',
    direction: 'up',
    words: ['views', 'view', 'watch time', 'impressions'],
    href: '/app/brand',
    source: { kind: 'module', name: 'brand' },
    loader: 'social_snapshots',
    module: 'brand',
  },
  {
    id: 'connector_metrics',
    category: 'audience',
    label: 'Connector metrics (9 providers)',
    unit: 'per provider',
    direction: 'neutral',
    words: ['revenue', 'mrr', 'stripe', 'shopify', 'gumroad', 'twitch', 'plausible', 'sales'],
    href: '/app/brand',
    source: { kind: 'module', name: 'brand' },
    loader: 'brand_metrics',
    module: 'brand',
  },

  // --------------------------------- CUSTOM TILE STREAMS (7, the open end)
  // One dynamic family per report kind (lib/tiles/reportContract.ts
  // REPORT_KINDS). Any life-stream Vitality does not natively track - career,
  // craft, people included - becomes readable here through Vitality.report().
  {
    id: 'tile_intake',
    category: 'general',
    label: 'Tile streams: intake',
    unit: 'per day',
    direction: 'up',
    words: ['intake', 'drink', 'consume'],
    href: '/app/create',
    source: { kind: 'stream' },
    loader: 'tile_reports',
    dynamic: true,
  },
  {
    id: 'tile_count',
    category: 'general',
    label: 'Tile streams: count',
    unit: 'per day',
    direction: 'up',
    words: ['count', 'times', 'reps'],
    href: '/app/create',
    source: { kind: 'stream' },
    loader: 'tile_reports',
    dynamic: true,
  },
  {
    id: 'tile_duration',
    category: 'general',
    label: 'Tile streams: duration',
    unit: 'min',
    direction: 'up',
    words: ['duration', 'minutes', 'hours spent'],
    href: '/app/create',
    source: { kind: 'stream' },
    loader: 'tile_reports',
    dynamic: true,
  },
  {
    id: 'tile_rating',
    category: 'general',
    label: 'Tile streams: rating',
    unit: 'scale',
    direction: 'up',
    words: ['rating', 'rate', 'score it'],
    href: '/app/create',
    source: { kind: 'stream' },
    loader: 'tile_reports',
    dynamic: true,
  },
  {
    id: 'tile_measure',
    category: 'general',
    label: 'Tile streams: measure',
    unit: 'own unit',
    direction: 'goal',
    words: ['measure', 'measurement', 'track a number'],
    href: '/app/create',
    source: { kind: 'stream' },
    loader: 'tile_reports',
    dynamic: true,
  },
  {
    id: 'tile_money',
    category: 'general',
    label: 'Tile streams: money',
    unit: 'currency',
    direction: 'goal',
    words: ['money stream', 'spent', 'earned'],
    href: '/app/create',
    source: { kind: 'stream' },
    loader: 'tile_reports',
    dynamic: true,
  },
  {
    id: 'tile_done',
    category: 'general',
    label: 'Tile streams: done',
    unit: 'streak',
    direction: 'up',
    words: ['done', 'did it', 'check off'],
    href: '/app/create',
    source: { kind: 'stream' },
    loader: 'tile_reports',
    dynamic: true,
  },
]

/** Entries of one category, in declared order. */
export function metricsForCategory(category: GoalCategory): MetricEntry[] {
  return METRIC_REGISTRY.filter((m) => m.category === category)
}

export function metricById(id: string): MetricEntry | null {
  return METRIC_REGISTRY.find((m) => m.id === id) ?? null
}

// ============================================================
// The binding wire: goalGuide's picker + strongestBinding read HERE
// ============================================================

/**
 * The one registry metric that fronts each guide module, plus the exact words
 * the binding chip and feed line use ("steered by: weight", "start logging
 * your weight"). Moved here from goalGuide's old BINDING_WORDS so the registry
 * is the single source; goalGuide re-exports through its existing helpers.
 */
export const MODULE_PRIMARY: Record<GuideModule, { entryId: string; metric: string; start: string }> = {
  train: { entryId: 'lift_progression', metric: 'lifts', start: 'your training' },
  weight: { entryId: 'body_weight', metric: 'weight', start: 'your weight' },
  macros: { entryId: 'calories', metric: 'meals', start: 'your meals' },
  water: { entryId: 'water_servings', metric: 'water', start: 'your water' },
  recovery: { entryId: 'sleep_hours', metric: 'sleep', start: 'your sleep' },
  supplements: { entryId: 'supplement_adherence', metric: 'stack', start: 'your stack' },
  brand: { entryId: 'followers', metric: 'followers', start: 'follower snapshots' },
  finance: { entryId: 'net_worth', metric: 'net worth', start: 'your net worth' },
  notes: { entryId: 'notes_stream', metric: 'notes', start: 'a note each day' },
}

/**
 * "What steers this" picker options per goal category. Deterministic, no
 * guessing: body-shaped categories get the body modules, money gets net worth,
 * audience gets followers, and every category always includes notes (the
 * honest floor lever). The picker appends the user's OWN tile streams and
 * "let Vee decide" after these. Sourced here (the registry) so the option
 * list and the Room can never disagree.
 */
export function bindingOptionsForCategory(category: string | null): GuideModule[] {
  switch ((category ?? '').toLowerCase()) {
    case 'fitness': return ['train', 'weight', 'recovery', 'macros', 'water', 'supplements', 'notes']
    case 'health': return ['weight', 'recovery', 'water', 'macros', 'train', 'notes']
    case 'money': return ['finance', 'notes']
    // audience: brand is retired as a goal source; these steer by notes + the
    // user's OWN tiles (the picker appends tile streams after this list).
    case 'audience': return ['notes']
    // mind / people / career / craft: notes is the one core metric that
    // honestly measures them - their numeric coverage is custom tiles.
    case 'mind':
    case 'people':
    case 'career':
    case 'craft': return ['notes']
    default: return ['notes', 'train', 'weight']
  }
}
