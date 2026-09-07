import VeeNoticed from '@/components/VeeNoticed'
import type { FeedNotice } from '@/lib/insights/feed'
import type { BigGoal, HabitGoal } from '@/app/app/goals/veeTypes'
import type { TickerRow } from '@/lib/insights/ticker'
import type { GuideItem } from '@/lib/insights/goalGuide'
import type { LifeChip } from '@/lib/insights/lifeChips'
import type { VeeRunStats } from '@/lib/vee/loadNoticed'
import type { Note } from '@/app/app/mentor/types'
import type { MoodPoint } from '@/app/app/mentor/moodData'
import { buildHandoffContext } from '@/lib/vee/claudeHandoff'

export const metadata = { title: 'Vee · preview' }

/**
 * /vee-live-preview - a public, no-auth look at the launch Vee (Echo gem, the
 * run-stats strip, the showcase-design Vitality Noticed card incl. a
 * deterministic one-tap action, the notice-preview goals board, life chips,
 * and the kept bottom strip) with representative mock data, so the visual can
 * be reviewed without logging in.
 *   ?empty      - the brand-new-account cold start
 *   ?climb      - force the first-ever-click Rarity Climb intro overlay
 *   ?degraded=1 - force the "some data could not be read" state (pair with
 *                 ?empty to see it replace the cold-start card)
 * The gated /app/mentor-next renders the SAME component against the user's
 * real, RLS-scoped engine data. Design harness only.
 */
const FEED: FeedNotice[] = [
  {
    source: 'fusion',
    watched: 'caffeine + recovery + training',
    lead: 'Your late caffeine is quietly capping recovery, and recovery is the lever on bench 100kg.',
    goalTitle: 'bench 100kg',
    impact: 'dn',
    receipts: ['caffeine after 4pm · 9 of 14 days', 'recovery -12% on those nights', 'bench stalled 3 weeks'],
    rarity: 'legendary',
    patternKey: undefined,
    action: { label: 'check your recovery', href: '/app/peak' },
    lever: 'recovery is the lever',
  },
  {
    source: 'drift',
    watched: 'training · 21d',
    lead: 'Training has gone quiet this week, and it is the engine behind bench 100kg.',
    goalTitle: 'bench 100kg',
    impact: 'dn',
    receipts: ['last session 4 days ago'],
    rarity: 'common',
    patternKey: undefined,
    action: { label: 'log a session', href: '/app/fitness/log' },
  },
  {
    source: 'fusion',
    watched: 'sleep + mood + training',
    lead: 'On weeks you sleep past 7h, your mood and your training volume climb together.',
    goalTitle: null,
    impact: 'up',
    receipts: ['7h+ sleep · 4 weeks', 'mood +1.4 avg', 'volume +18%'],
    rarity: 'epic',
    patternKey: undefined,
    lever: 'climb together',
  },
]

const GOALS: BigGoal[] = [
  {
    id: 'g1', title: 'bench 100kg', cleanTitle: 'Bench 100 kg', category: 'fitness',
    targetDate: '2026-10-01', priority: 3, push: 'push',
    progressCurrent: null, progressTarget: null, progressUnit: 'kg', identityTag: null,
    status: 'active', createdAt: '2026-05-01T09:00:00Z', updatedAt: '2026-07-01T09:00:00Z', achievedAt: null,
  },
  {
    // The OVERRIDE case ("what steers this"): the user bound this mind goal to
    // their OWN Pages read tile, so a stream-backed graph draws where auto-
    // binding would have shown nothing. The chip reads "steered by: pages read".
    id: 'g2', title: 'read 12 books this year', cleanTitle: 'Read 12 books', category: 'mind',
    targetDate: '2026-12-31', priority: 2, push: 'balanced', bindingOverride: 'stream:pages_read',
    progressCurrent: 4, progressTarget: 12, progressUnit: 'books', identityTag: null,
    status: 'active', createdAt: '2026-06-01T09:00:00Z', updatedAt: '2026-07-01T09:00:00Z', achievedAt: null,
  },
  {
    id: 'g3', title: 'get to 12% body fat', cleanTitle: 'Get lean', category: 'health',
    targetDate: '2026-11-15', priority: 2, push: 'gentle',
    progressCurrent: null, progressTarget: null, progressUnit: null, identityTag: null,
    status: 'active', createdAt: '2026-06-10T09:00:00Z', updatedAt: '2026-07-01T09:00:00Z', achievedAt: null,
  },
  {
    // The WARM case: no ticker series (no ROWS entry), but the guide's brain
    // fired from real data - the panel must show the grounded read ("what I
    // can read"), never the feed-me ask (the guideGroundedWhy graduation).
    id: 'g4', title: 'hit 145g protein daily', cleanTitle: 'Hit 145g protein daily', category: 'fitness',
    targetDate: null, priority: 2, push: 'balanced',
    progressCurrent: null, progressTarget: null, progressUnit: null, identityTag: null,
    status: 'active', createdAt: '2026-06-25T09:00:00Z', updatedAt: '2026-07-01T09:00:00Z', achievedAt: null,
  },
  {
    // The NOTES-LEVER + EMPTY-GRAPH case: a people goal no module can measure.
    // Its panel shows the empty axis with the notes ask, the honest notes lever,
    // and the iris "Create a tile for this" door (no module lever exists).
    id: 'g5', title: 'be more present with my family', cleanTitle: 'Be present with family', category: 'people',
    targetDate: null, priority: 3, push: 'gentle',
    progressCurrent: null, progressTarget: null, progressUnit: null, identityTag: null,
    status: 'active', createdAt: '2026-07-05T09:00:00Z', updatedAt: '2026-07-05T09:00:00Z', achievedAt: null,
  },
]

/** The user's own tile streams, for the "what steers this" picker. */
const TILE_STREAMS = [
  { key: 'pages_read', label: 'Pages read', kind: 'count' },
]

/** Modules with real mock data behind them (mirrors loadNoticed.activeModules). */
const ACTIVE_MODULES = ['train', 'weight', 'recovery', 'water', 'macros'] as const

const HABITS: HabitGoal[] = [
  {
    id: 'h1', parentGoalId: null, title: 'Train 4 times a week', kind: 'habit',
    dueDate: null, difficulty: null, estimatedMinutes: null, suggestedStartHour: null,
    whenCue: null, source: 'auto', tracking: { metric: 'train', target: 4, window: 'week' },
    status: 'open', isTomorrow: false, pushCount: 0, lastPushedAt: null,
    createdAt: '2026-06-20T09:00:00Z', completedAt: null,
  },
]

const ROWS: TickerRow[] = [
  {
    id: 'g1', title: 'Bench 100 kg', state: 'on-track',
    detail: '85 → 92.5', spark: [85, 85, 87.5, 87.5, 90, 92.5], hint: null, metric: 'lift',
  },
  {
    id: 'g3', title: 'Get lean', state: 'drifting',
    detail: '+0.3%/wk', spark: [82.1, 82.0, 82.4, 82.6, 82.9], hint: null, metric: 'weight',
  },
  {
    // g2's override in action: the stream-backed row buildTicker draws when a
    // goal is steered by one of the user's own tiles.
    id: 'g2', title: 'Read 12 books', state: 'on-track',
    detail: '12 → 31', spark: [12, 14, 16, 20, 24, 31], hint: null, metric: 'stream',
  },
  // g5 has no row on purpose: the people goal demos the EMPTY graph axis + the
  // notes ask + the "Create a tile for this" door.
]

const GUIDES: Record<string, GuideItem[]> = {
  g1: [
    {
      module: 'train', label: 'Log your lifts', href: '/app/fitness/log', using: true, preview: 'bars',
      why: 'You log already. If a lift stalls two weeks, force it up with a rep or a little weight.',
      key: 'If a lift stalls two weeks',
    },
    {
      module: 'recovery', label: 'See your recovery', href: '/app/peak', using: false, preview: 'line',
      why: 'Track your sleep and recovery every day.',
      key: 'your sleep and recovery',
    },
  ],
  g3: [
    {
      module: 'weight', label: 'Log a weigh-in', href: '/app/fitness/progress', using: true, preview: 'line',
      why: 'Weigh in most mornings. The 7-day average is the only number that tells the truth.',
      key: 'The 7-day average',
    },
  ],
  // g4's brain-fired row (proteinBrain shape): no ticker series exists for it,
  // so the panel graduates from the feed-me ask to this grounded read.
  g4: [
    {
      module: 'macros', label: 'Hit your protein', href: '/app/fuel/macros', using: true, preview: 'bars',
      why: 'You average 128g of protein, with 3 days under your 145g target this week. Those low days are where muscle growth leaks out, so plug them first.',
      key: '3 days under your 145g target',
    },
  ],
  // g5's guide is the honest notes floor: no module measures a people goal, so
  // the lightbulb is the note-a-day lever and the create-tile door joins it.
  g5: [
    {
      module: 'notes', label: 'Write a note in Vee', href: '/app/mentor', using: false, preview: 'wave',
      why: 'Write a note each day and I measure your good days.',
      key: 'I measure your good days',
    },
  ],
}

const LIFE_CHIPS: LifeChip[] = [
  { label: 'train', value: '3.7x/wk', tone: 'mint' },
  { label: 'sleep', value: '6.8h', tone: 'muted' },
  { label: 'recovery', value: '71', tone: 'mint' },
  { label: 'water', value: '4 of 7 days', tone: 'amber' },
]

const NOTES: Note[] = [
  { id: 'n1', body: 'deload next week, knees felt it today', created_at: '2026-07-09T18:22:00Z' },
  { id: 'n2', body: 'idea: film the morning routine for ep5', created_at: '2026-07-08T09:04:00Z' },
]

const MOOD_HISTORY: MoodPoint[] = [
  { dayKey: '2026-07-04', score: 3 },
  { dayKey: '2026-07-05', score: 4 },
  { dayKey: '2026-07-06', score: null },
  { dayKey: '2026-07-07', score: 2 },
  { dayKey: '2026-07-08', score: 4 },
  { dayKey: '2026-07-09', score: 5 },
  { dayKey: '2026-07-10', score: null },
]

const STATS: VeeRunStats = { daysLogged: 247, modulesFeeding: 6, insightsFound: 3, rarestTier: 'legendary' }
const EMPTY_STATS: VeeRunStats = { daysLogged: 0, modulesFeeding: 0, insightsFound: 0, rarestTier: null }

/* The Claude handoff context the gated page assembles from loadNoticed data,
   built here from the same mocks so the module-aware quick questions and the
   context-carrying hops can be reviewed without logging in. */
const CLAUDE_CONTEXT = buildHandoffContext({
  firstName: 'Alex',
  daysLogged: STATS.daysLogged,
  goals: GOALS.map(g => ({ id: g.id, title: g.title, cleanTitle: g.cleanTitle, category: g.category })),
  rows: ROWS,
  feed: FEED,
  lifeChips: LIFE_CHIPS,
  activeModules: [...ACTIVE_MODULES],
})

export default function VeeLivePreviewPage({ searchParams }: { searchParams?: { empty?: string; climb?: string; degraded?: string } }) {
  const empty = searchParams?.empty != null
  const forceClimb = searchParams?.climb != null
  const degraded = searchParams?.degraded != null
  return (
    <VeeNoticed
      firstName="Alex"
      feed={empty ? [] : FEED}
      userId="preview"
      stats={empty ? EMPTY_STATS : STATS}
      goals={empty ? [] : GOALS}
      habits={empty ? [] : HABITS}
      rows={empty ? [] : ROWS}
      guides={empty ? {} : GUIDES}
      lifeChips={empty ? [] : LIFE_CHIPS}
      suggestionEvidence={empty ? undefined : { train: true, protein: true, sleep: true }}
      tileStreams={empty ? [] : TILE_STREAMS}
      activeModules={empty ? [] : [...ACTIVE_MODULES]}
      notes={empty ? [] : NOTES}
      moodHistory={empty ? [] : MOOD_HISTORY}
      claudeContext={empty ? null : CLAUDE_CONTEXT}
      readOnly
      forceClimbIntro={forceClimb}
      degraded={degraded}
    />
  )
}
