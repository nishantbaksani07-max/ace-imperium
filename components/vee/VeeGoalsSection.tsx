'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import s from './veeGoalsSection.module.css'
import gs from '@/app/app/goals/goalsVee.module.css'
import ts from '@/app/app/goals/veeNoticed.module.css'
import type { BigGoal, HabitGoal, HabitTracking, Prio, Push } from '@/app/app/goals/veeTypes'
import { createBigGoal, addHabitGoal, setHabitGoalDone, deleteBigGoal, categorizeAndCleanGoal, updateBigGoalPush, setGoalBinding } from '@/app/app/goals/goalActions'
import { CATEGORY_WORD, type GoalCategory } from '@/lib/goals/categories'
import { getLocalDateKey } from '@/lib/dates'
import { isGibberish } from '@/lib/goals/gibberish'
import type { TickerRow, TrendState } from '@/lib/insights/ticker'
import GraphFullscreen from '@/app/app/goals/GraphFullscreen'
import { guideGroundedWhy, guideProjectionLead, isInjuryGoal, strongestBinding, bindingFeedLine, bindingMetricWord, coreBindingOptions, MODULE_FEED_ME, VICE_RE, SCALE_MUTE_RE, type GuideItem, type GuideModule } from '@/lib/insights/goalGuide'
import GraphLibrary from './GraphLibrary'
import type { CoreGraph, CoreGroup } from '@/lib/insights/coreRoom'
import type { LifeChip } from '@/lib/insights/lifeChips'

/**
 * VeeGoalsSection - the FULL goals engine fused into the new Vee page, wearing
 * the vee-notice-preview board signature:
 *
 *   - board: "YOUR GOALS, LIVE · N DAYS OF DATA · TAP ONE" mono head, one row
 *     per goal (name + sub, sparkline right, detail + state word, chevron).
 *   - tap a row: the "WHY IT IS RISING/DRIFTING" panel: honest paragraph,
 *     triangle receipt bullets (mint up / amber down), the lightbulb lever line
 *     with its mint-underlined key phrase, then "talk deeper in Claude" (iris)
 *     + the one-tap lever (mint outline) when the guide provides one. The goal's
 *     horizon, push level and remove live in the same panel.
 *   - life chips strip under the board (honest-only, from buildLifeChips).
 *   - authoring: create a goal (deadline, priority, push level) + the "this
 *     week" habit list. All writes reuse the RLS-scoped server actions.
 *   - cold start: a goal with no real series NEVER shows an empty or fake
 *     graph; its row says "log it" and the panel carries the honest feed-me line.
 */

const CheckIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M-8 0 L-2 7 L9 -7" /></svg>
)
function VMark({ size = 16 }: { size?: number }) {
  return (
    <span className={gs.vMark} aria-hidden>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7l7 11 7-11" /></svg>
    </span>
  )
}

const UP = <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 5l8 13H4z" /></svg>
const DN = <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 19L4 6h16z" /></svg>
const FLAT = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M5 12h14" /></svg>
const CHEV = <svg className={ts.gChev} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
const SPARKLE = <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M11.6 2.4l1.7 5.4 5.4 1.7-5.4 1.7-1.7 5.4-1.7-5.4-5.4-1.7 5.4-1.7z" /></svg>
const BULB = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 18h6M10 21h4M12 2a6 6 0 0 0-4 10.5c.7.7 1 1.3 1 2.5h6c0-1.2.3-1.8 1-2.5A6 6 0 0 0 12 2z" /></svg>
const BOARD_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></svg>

const TIMEFRAMES = [
  { key: '2w', num: '2', unit: 'weeks', days: 14 },
  { key: '1m', num: '1', unit: 'month', days: 30 },
  { key: '3m', num: '3', unit: 'months', days: 91 },
  { key: '6m', num: '6', unit: 'months', days: 182 },
  { key: '1y', num: '1', unit: 'year', days: 365 },
] as const
type TfKey = typeof TIMEFRAMES[number]['key'] | 'custom'

const PUSH_OPTS: { key: Push; title: string; desc: string }[] = [
  { key: 'gentle', title: 'Keep it gentle', desc: 'I cheer quietly and stay out of your way.' },
  { key: 'balanced', title: 'Nudge me when I drift', desc: 'I only speak up if you start slipping.' },
  { key: 'push', title: 'Push me to show up', desc: 'I check in often and keep you honest.' },
  { key: 'silent', title: 'Keep it silent', desc: 'I will not say a word. This one is just for you.' },
]
const PUSH_CHIP: Record<Push, string> = { silent: 'Vee · silent', gentle: 'Vee · gentle', balanced: 'Vee · nudges', push: 'Vee · pushes' }
const PUSH_SHORT: Record<Push, string> = { silent: 'Silent', gentle: 'Gentle', balanced: 'Nudges', push: 'Pushes' }
/** Bars per level: how loud Vee gets, 1 (silent) to 4 (pushes). */
const PUSH_LEVEL: Record<Push, number> = { silent: 1, gentle: 2, balanced: 3, push: 4 }
/** The REAL drift cadence, verified against lib/goals/drift.ts: shownWindow
 *  gives push=1 day, gentle=4 days, default (balanced)=COOLDOWN_DAYS.shown=2;
 *  silent goals are excluded from drift outreach entirely. Honest copy only. */
const PUSH_MEANING: Record<Push, string> = {
  push: 'I speak up after 1 quiet day.',
  balanced: 'I speak up after 2 quiet days.',
  gentle: 'I speak up after 4 quiet days.',
  silent: 'I never reach out first. This one is just for you.',
}
/** The 1-4 bars meter: filled bars = how loud Vee gets about this goal. */
const PushBars = ({ level }: { level: number }) => (
  <svg width="13" height="11" viewBox="0 0 26 22" aria-hidden>
    {[0, 1, 2, 3].map(i => (
      <rect key={i} x={i * 7} y={15 - i * 5} width="4.6" height={7 + i * 5} rx="1.8" fill="currentColor" opacity={i < level ? 1 : 0.22} />
    ))}
  </svg>
)
const PRIO_LBL = ['Low', 'Medium', 'High'] as const

type SuggestionMetric = 'train' | 'protein' | 'sleep'
type Suggestion = { title: string; sub: string; source: HabitGoal['source']; tracking: HabitTracking; metric: SuggestionMetric }
/* Evidence-gated: a suggestion only renders when the server saw real rows behind
   its claim ("from Fuel" needs meals, "from your band" needs sleep readings).
   Zero evidence = zero suggestion rows. */
const SUGGESTIONS: Suggestion[] = [
  { title: 'Train 4 times a week', sub: 'from your workouts', source: 'auto', tracking: { metric: 'train', target: 4, window: 'week' }, metric: 'train' },
  { title: 'Hit your protein daily', sub: 'from Fuel', source: 'auto', tracking: { metric: 'protein', window: 'day' }, metric: 'protein' },
  { title: 'Sleep 8 hours, 3 nights', sub: 'from your band', source: 'auto', tracking: { metric: 'sleep', target: 3, window: 'week', hours: 8 }, metric: 'sleep' },
]

const GLYPH: Record<string, ReactNode> = {
  train: <path d="M-9 -4 V4 M9 -4 V4 M-9 0 H9 M-6 -6 V6 M6 -6 V6" />,
  protein: <path d="M0 -9 C5 -4 7 0 7 4 a7 7 0 0 1 -14 0 C-7 0 -5 -4 0 -9Z" />,
  sleep: <path d="M4 -8 a9 9 0 1 0 6 13 a7 7 0 0 1 -6 -13Z" />,
  water: <path d="M0 -9 C5 -4 7 0 7 4 a7 7 0 0 1 -14 0 C-7 0 -5 -4 0 -9Z" />,
  default: <><circle cx="0" cy="0" r="7" /><path d="M-3 0 L-1 3 L4 -4" /></>,
}

/* Honest, deterministic cold-start line per goal category: what to feed Vee to
   bring this goal to life. Each line promises ONLY what the engine actually does
   with that data (the ticker draws weight/lift/training graphs; net worth and
   followers feed the guide's grounded reads, not a graph). No AI, no invented
   numbers. */
const FEED_ME: Record<GoalCategory, string> = {
  fitness: 'log your first session in Train and this becomes a live graph.',
  health: 'log a weigh-in and I will start drawing this.',
  money: 'update your net worth in Finance and I start watching where your money is heading.',
  audience: 'save a follower snapshot in Brand and I start reading your growth.',
  career: 'jot a note in Vee when something moves and I will keep the thread.',
  craft: 'jot a note in Vee when you finish a piece and I will keep the thread.',
  people: 'write a note in Vee after time well spent and I will start counting the good days.',
  mind: 'write a note in Vee each day and I will start measuring your good days.',
  general: 'write a note in Vee each day and I will start measuring your good days.',
}
function feedMeLine(category: GoalCategory | null, title: string, leverModule?: GuideModule): string {
  // An injury/rehab goal never earns the "log a session" push: the guide
  // (isInjuryGoal) already routed it to recovery, so ask gently for the
  // data that actually leads a comeback.
  if (isInjuryGoal(title, category)) {
    return 'track a night of sleep in Peak and I will help you ease back in, at your pace.'
  }
  // When a lever exists, the ask names the LEVER's tracker, so the paragraph
  // and the lightbulb below it always agree ("sleep 8 hours" must never ask
  // for a weigh-in above a sleep lever). This check runs FIRST: the guide
  // already applied the vice / scale-mute call when it picked the lever, so
  // testing the regexes again here could only ever disagree with it (a
  // "grow my social media" brand lever must keep its brand ask).
  if (leverModule) return MODULE_FEED_ME[leverModule] ?? FEED_ME.general
  // No lever passed: a quit-a-vice or scale-muted goal never earns the
  // category fallback's body-data ask; route it to the note line.
  const t = title.toLowerCase()
  if (VICE_RE.test(t) || SCALE_MUTE_RE.test(t)) return FEED_ME.general
  return FEED_ME[category ?? 'general'] ?? FEED_ME.general
}

function addDays(n: number) { const d = new Date(); d.setDate(d.getDate() + n); return d }
function fmtDate(d: Date) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
function daysFromToday(key: string) { const t = new Date(`${key}T00:00:00`); const now = new Date(); now.setHours(0, 0, 0, 0); return Math.max(0, Math.round((t.getTime() - now.getTime()) / 86400000)) }
function friendlyDistance(days: number) {
  if (days <= 1) return 'by tomorrow'
  if (days < 14) return `${days} days out`
  if (days < 45) return `${Math.round(days / 7)} weeks out`
  if (days < 335) return `about ${Math.round(days / 30)} months out`
  return 'about a year out'
}
function horizonPct(createdAt: string, targetDate: string): number {
  const start = Date.parse(createdAt)
  const end = Date.parse(`${targetDate}T00:00:00`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 4
  return Math.max(4, Math.min(100, ((Date.now() - start) / (end - start)) * 100))
}
function describeTracking(t: HabitTracking): string {
  switch (t.metric) {
    case 'train': return `${t.target ?? 4} times a week`
    case 'protein': return 'every day'
    case 'sleep': return `${t.hours ?? 8} hours, ${t.target ?? 3} nights`
    case 'water': return 'every day'
    default: return t.window === 'week' ? 'each week' : 'each day'
  }
}
function sourceLabel(source: HabitGoal['source']): string {
  switch (source) {
    case 'auto': return 'tracked for you'
    case 'fitness': return 'from your workouts'
    case 'supplements': return 'from supplements'
    case 'finance': return 'from finance'
    case 'mentor': return 'from a note to Vee'
    default: return 'you tap when done'
  }
}
function friendlyError(code: string): string {
  if (code === 'goals_tables_missing') return 'Saving is not on just yet. Your goal is safe here for now.'
  if (code === 'unauthorized') return 'I lost your sign in. Pop back in and I will save this.'
  if (code === 'bad_date') return 'That date is already behind us. Pick one ahead of today.'
  if (code === 'too_long') return 'That is a whole story. Keep it under 200 characters and I can save it.'
  if (code === 'gibberish') return 'Help me out, say it plainly and I can steer it.'
  return 'That did not save. Give it one more tap and I will catch it.'
}

/* ---- steering: the live per-goal graph (the notice-preview board language) ---- */

type Tone = 'up' | 'dn' | 'flat'

function stateMeta(state: TrendState): { tone: Tone; word: string } {
  switch (state) {
    case 'on-track': return { tone: 'up', word: 'rising' }
    case 'drifting': return { tone: 'dn', word: 'drifting' }
    case 'holding': return { tone: 'flat', word: 'steady' }
    default: return { tone: 'flat', word: 'no data yet' }
  }
}

/** Normalise a small series into a 54x20 polyline. Returns null with < 2 points. */
function sparkPoints(spark: number[]): string | null {
  if (spark.length < 2) return null
  const w = 54, h = 20, pad = 2
  const min = Math.min(...spark), max = Math.max(...spark)
  const range = max - min || 1
  const step = (w - pad * 2) / (spark.length - 1)
  return spark.map((v, i) => {
    const x = pad + i * step
    const y = pad + (h - pad * 2) * (1 - (v - min) / range)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

function honestRead(row: TickerRow, guides: Record<string, GuideItem[]>): string {
  if (row.state === 'on-track') {
    if (row.spark.length >= 2 && row.detail) {
      const mod: GuideModule | null = row.metric === 'weight' ? 'weight'
        : (row.metric === 'lift' || row.metric === 'training') ? 'train' : null
      const lead = mod ? guideProjectionLead(guides[row.id], mod) : null
      if (lead) return lead.charAt(0).toLowerCase() + lead.slice(1)
    }
    return `you are moving the right way here, ${row.detail}. keep the rhythm going.`
  }
  if (row.state === 'holding') return `holding steady at ${row.detail}. a small push tips it forward.`
  if (row.state === 'drifting') return `this one is drifting, ${row.detail}. one step this week catches it before it lands.`
  return row.hint ?? 'log a little here and a real trend will appear.'
}

/** Triangle receipt bullets, honest-only: the measured detail (toned by state)
 *  and how many real points sit behind the line. Never an invented factor. */
function factorLines(row: TickerRow): { tone: Tone; text: string }[] {
  const out: { tone: Tone; text: string }[] = []
  const metricWord = row.metric === 'lift' ? 'top set' : row.metric === 'weight' ? 'weight' : row.metric === 'training' ? 'training' : 'measured'
  const { tone } = stateMeta(row.state)
  if (row.detail) out.push({ tone, text: `${metricWord} ${row.detail}` })
  if (row.spark.length >= 2) out.push({ tone: 'flat', text: `${row.spark.length} real points behind this line` })
  return out
}

function Spark({ row, tone, spark }: { row: TickerRow | undefined; tone: Tone; spark?: number[] }) {
  const pts = spark && spark.length >= 2 ? sparkPoints(spark) : row ? sparkPoints(row.spark) : null
  if (!pts) return <span className={ts.spk} aria-hidden style={{ width: 54 }} />
  const color = tone === 'up' ? 'var(--mint)' : tone === 'dn' ? 'var(--amber)' : 'var(--n-muted-strong)'
  const last = pts.split(' ').slice(-1)[0].split(',')
  return (
    <svg className={ts.spk} width="54" height="20" viewBox="0 0 54 20" fill="none" aria-hidden>
      <polyline points={pts} stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.1" fill={color} />
    </svg>
  )
}

/* ---- the always-visible graph slot + "what steers this" (TRAIN 4) ---- */

/** A tile-stream binding option handed down from the page loader (RLS read). */
export interface BindingStream { key: string; label: string; kind: string }

/** Chip word for a metric the ticker is ALREADY drawing. */
const CHIP_BY_METRIC: Record<string, string> = {
  weight: 'weigh-ins', lift: 'your lifts', training: 'training days',
}

/** Header/panel tone for a Graph Library line: healthy direction vs drift. */
function toneForCore(points: { value: number }[], dir: 'up' | 'down' | 'neutral'): Tone {
  if (points.length < 2) return 'flat'
  const delta = points[points.length - 1].value - points[0].value
  if (dir === 'neutral' || delta === 0) return 'flat'
  return (dir === 'up') === (delta > 0) ? 'up' : 'dn'
}

/** The empty-graph ask per core group: log where the line comes from. */
const CORE_GROUP_ASK: Record<string, string> = {
  train: 'log this lift in Train and the line moves.',
  fuel: 'log your meals in Fuel and the line moves.',
  body: 'log a weigh-in and the line moves.',
  vitals: 'wear your band tonight and the line moves.',
}

/** Resolve what steers this goal right now: the user's override first, else the
 *  drawn metric, else the strongest auto binding. Returns the chip word and the
 *  metric-specific empty-graph ask, so the two can never disagree. */
function resolveBinding(
  goal: { title: string; cleanTitle: string | null; category: string | null; bindingOverride?: string | null },
  row: TickerRow | undefined,
  streams: BindingStream[],
  activeModules: GuideModule[],
  coreGraphs: CoreGraph[] | null,
): { chip: string; feedLine: string; overridden: boolean; coreGraph?: CoreGraph } {
  // Brand is retired (2026-07-12): a legacy goal still pinned to 'brand' reads
  // as unbound, so it falls to the honest floor + the picker, never a dead
  // "steered by: followers" chip pointing at a module we removed.
  const ov = goal.bindingOverride === 'brand' ? null : (goal.bindingOverride ?? null)
  if (ov && ov.startsWith('core:')) {
    // A Graph Library pick: the goal drinks from one exact core series.
    const id = ov.slice('core:'.length)
    const g = coreGraphs?.find(x => x.id === id)
    return {
      chip: (g?.label ?? 'your graph').toLowerCase(),
      feedLine: g ? CORE_GROUP_ASK[g.group] ?? 'log it and the line moves.' : 'for this graph to work, keep logging.',
      overridden: true,
      ...(g ? { coreGraph: g } : {}),
    }
  }
  if (ov && ov.startsWith('stream:')) {
    const key = ov.slice('stream:'.length)
    const label = streams.find(t => t.key === key)?.label ?? 'your tile'
    return { chip: label.toLowerCase(), feedLine: `for this graph to work, log to your ${label} tile.`, overridden: true }
  }
  if (ov) {
    const m = ov as GuideModule
    return { chip: bindingMetricWord(m), feedLine: bindingFeedLine(m), overridden: true }
  }
  if (row && row.metric && row.spark.length >= 2) {
    const chip = row.metric === 'stream' ? 'your tile' : (CHIP_BY_METRIC[row.metric] ?? row.metric)
    // A drawn graph never needs the ask; keep the strongest ask as a fallback.
    return { chip, feedLine: strongestBinding(goal, activeModules).feedLine, overridden: false }
  }
  const auto = strongestBinding(goal, activeModules)
  // Already feeding that module (just not enough for a trend yet): the ask says
  // keep going, never "start" something the user already does.
  const feedLine = auto.active ? auto.feedLine.replace('start logging', 'keep logging') : auto.feedLine
  return { chip: auto.metric, feedLine, overridden: false }
}

/** The expanded panel's graph slot: with data it draws the real series; without
 *  it renders the EMPTY axis (subtle hairline frame) with the one-line ask from
 *  the strongest binding inside. The graph is a promise with a location, never
 *  an absence. */
/** "2026-07-12" → "Jul 12" for scrub tags. Local, no UTC drift. */
function fmtDayShort(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${MON[+m[2] - 1]} ${+m[3]}`
}
/** Tidy a value for a tag: integers get thousands commas, else one decimal. */
function fmtNum(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString('en-US') : (Math.round(n * 10) / 10).toLocaleString('en-US')
}

function PanelGraph({ row, tone, ask, onExpand, series, points, unit }: { row: TickerRow | undefined; tone: Tone; ask: string; onExpand?: () => void; series?: number[]; points?: { date: string; value: number }[]; unit?: string }) {
  // Refs must be declared before the empty early-return so hook order is stable.
  const boxRef = useRef<HTMLDivElement>(null)
  const lineRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)
  const tagRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef(false)

  const hasSeries = (!!points && points.length >= 2) || (!!series && series.length >= 2) || (!!row && row.spark.length >= 2)
  if (!hasSeries) {
    // ALIVE while empty (Alex, 2026-07-12 v2): a GHOST PREVIEW of the graph
    // this will become - a faint line with a breathing dot at its tip - so a
    // brand-new user sees the promise working, not an empty box. The ask
    // lives ONCE in the paragraph above (never repeated here); this slot
    // carries only a five-word caption. The ask still labels the slot for
    // screen readers.
    return (
      <div className={`${s.graphSlot} ${s.graphEmpty}`} aria-label={ask}>
        {/* GHOST OF THE REAL GRAPH (Alex, 2026-07-12 v3): the same framed plot
            the data will fill - faint gridlines, a mint gradient-filled rising
            line, a breathing tip dot - so the empty state reads as a premium
            promise, not slop. The ask lives ONCE in the paragraph above; this
            slot carries only a five-word caption pill. */}
        <svg className={s.graphSvg} viewBox="0 0 320 116" preserveAspectRatio="none" fill="none" aria-hidden>
          <defs>
            <linearGradient id="goalGhostFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6EE7B7" stopOpacity="0.11" />
              <stop offset="100%" stopColor="#6EE7B7" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[12, 58, 104].map(gy => (
            <line key={gy} x1="0" y1={gy} x2="320" y2={gy} stroke="rgba(255,255,255,0.055)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <path d="M12 90 L55 84 L98 88 L141 70 L184 74 L227 54 L270 60 L308 34 L308 116 L12 116 Z" fill="url(#goalGhostFill)" stroke="none" />
          <path className={s.ghostLine} d="M12 90 L55 84 L98 88 L141 70 L184 74 L227 54 L270 60 L308 34" vectorEffect="non-scaling-stroke" />
          <circle className={s.ghostDot} cx="308" cy="34" r="3.4" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className={s.graphAskChip}>your line starts with day one</span>
      </div>
    )
  }
  // Build the point list once: prefer dated core points (so the scrubber tag
  // can read a real date), else the numeric spark (value-only tag).
  const src = series && series.length >= 2 ? series : row!.spark
  const data: { value: number; date?: string }[] =
    points && points.length >= 2 ? points : src.map(v => ({ value: v }))
  const spark = data.map(d => d.value)
  const min = Math.min(...spark), max = Math.max(...spark)
  // The progressive-overload graph design (ported from HistoryModal, Alex,
  // 2026-07-12): a taller framed plot with a gradient area fill, faint
  // gridlines, a dot on every point, a glowing last dot, and a drag-scrubber
  // that reveals each point's date + value + delta. The data span is padded so
  // a short run of points sits mid-card and fills the width.
  const HEX = tone === 'up' ? '#6EE7B7' : tone === 'dn' ? '#e9c87a' : '#9aa7a2'
  const GW2 = 320, GH2 = 116, GP = 12
  const bpad = (max - min) * 0.18 + (max === min ? 1 : 0)
  const lo = min - bpad, hi = max + bpad
  const yr = hi - lo || 1
  const gstep = (GW2 - GP * 2) / (spark.length - 1)
  const xy = (v: number, i: number): [number, number] => [GP + i * gstep, GP + (GH2 - 2 * GP) * (1 - (v - lo) / yr)]
  const gp = spark.map((v, i) => xy(v, i))
  const gd = gp.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const garea = `${gd} L${gp[gp.length - 1][0].toFixed(1)} ${GH2} L${gp[0][0].toFixed(1)} ${GH2} Z`
  const glast = gp[gp.length - 1]
  const gridY = [GP, GH2 / 2, GH2 - GP]
  // At-rest context for the graph's variables (Alex, 2026-07-12): the y-scale
  // labelled at the real high/low (with unit), and the time axis labelled at
  // each end - real dates when the series carries them, else oldest/latest. So
  // every graph tells you WHAT it plots and over WHAT range without a scrub.
  const yPct = (v: number) => ((GP + (GH2 - 2 * GP) * (1 - (v - lo) / yr)) / GH2) * 100
  const firstDate = data[0].date, lastDate = data[data.length - 1].date

  // Scrubber (imperative, so a drag never re-renders the panel). Snap to the
  // nearest point by x, then move the vertical line, the dot on the point, and
  // a floating tag reading that point's date + value + delta from the previous.
  function show(on: boolean) {
    lineRef.current?.classList.toggle(s.gScrubLineShow, on)
    dotRef.current?.classList.toggle(s.gScrubDotShow, on)
    tagRef.current?.classList.toggle(s.gScrubTagShow, on)
  }
  function move(clientX: number) {
    const box = boxRef.current, line = lineRef.current, dot = dotRef.current, tag = tagRef.current
    if (!box || !line || !dot || !tag) return
    const r = box.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    let i = Math.round(frac * (gp.length - 1))
    i = Math.min(gp.length - 1, Math.max(0, i))
    const [xv, yv] = gp[i]
    const xpx = (xv / GW2) * r.width, ypx = (yv / GH2) * r.height
    line.style.left = `${xpx}px`
    dot.style.left = `${xpx}px`; dot.style.top = `${ypx}px`
    tag.style.top = `${ypx}px`
    const prev = i > 0 ? data[i - 1].value : null
    const upSet = prev === null ? true : data[i].value >= prev
    dot.style.background = upSet ? '#6EE7B7' : '#e9c87a'
    let deltaHtml = ''
    if (prev !== null) {
      const dv = data[i].value - prev
      const cls = dv >= 0 ? s.gScrubUp : s.gScrubDn
      deltaHtml = `<span class="${s.gScrubDelta} ${cls}">${dv >= 0 ? '▲ +' + fmtNum(dv) : '▼ ' + fmtNum(Math.abs(dv))}</span>`
    }
    const label = data[i].date ? fmtDayShort(data[i].date!) : `point ${i + 1}/${data.length}`
    tag.innerHTML =
      `<span class="${s.gScrubDate}">${label}</span>` +
      `<span class="${s.gScrubVal}">${fmtNum(data[i].value)}${unit ? ' ' + unit : ''}</span>` +
      deltaHtml
    // Clamp the tag inside the box so it never crops at an edge (measured after
    // innerHTML so the width includes the delta chip).
    const pad = 6, half = tag.offsetWidth / 2, mn = half + pad, mx = r.width - half - pad
    tag.style.left = `${mx < mn ? r.width / 2 : Math.max(mn, Math.min(xpx, mx))}px`
  }
  function onDown(e: import('react').PointerEvent<HTMLDivElement>) {
    activeRef.current = true
    boxRef.current?.setPointerCapture(e.pointerId)
    show(true); move(e.clientX)
  }
  function onMove(e: import('react').PointerEvent<HTMLDivElement>) { if (activeRef.current) move(e.clientX) }
  function end() { activeRef.current = false; show(false) }

  return (
    <div className={s.graphSlot}>
      <div
        ref={boxRef}
        className={s.graphPlot}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
      >
        <svg className={s.graphSvg} viewBox={`0 0 ${GW2} ${GH2}`} preserveAspectRatio="none" fill="none" aria-hidden>
          <defs>
            <linearGradient id="goalGraphFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={HEX} stopOpacity="0.18" />
              <stop offset="100%" stopColor={HEX} stopOpacity="0" />
            </linearGradient>
          </defs>
          {gridY.map((gy, gi) => (
            <line key={gi} x1="0" y1={gy.toFixed(1)} x2={GW2} y2={gy.toFixed(1)} stroke="rgba(255,255,255,0.07)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={garea} fill="url(#goalGraphFill)" stroke="none" />
          <path d={gd} stroke={HEX} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" vectorEffect="non-scaling-stroke" style={{ filter: `drop-shadow(0 0 5px ${HEX}66)` }} />
          {gp.slice(0, -1).map((p, i) => (
            <circle key={i} cx={p[0].toFixed(1)} cy={p[1].toFixed(1)} r="2.4" fill="#0b0f0d" stroke={i > 0 && data[i].value < data[i - 1].value ? '#e9c87a' : HEX} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          ))}
          <circle cx={glast[0].toFixed(1)} cy={glast[1].toFixed(1)} r="3.6" fill={HEX} vectorEffect="non-scaling-stroke" style={{ filter: `drop-shadow(0 0 5px ${HEX})` }} />
        </svg>
        {/* y-scale context: the real high (with unit) and low, over the gridlines */}
        <span className={s.gYLabel} style={{ top: `${yPct(max)}%` }}>{fmtNum(max)}{unit ? ` ${unit}` : ''}</span>
        {min !== max && <span className={s.gYLabel} style={{ top: `${yPct(min)}%` }}>{fmtNum(min)}</span>}
        {/* time-axis context: the span this line covers, end to end */}
        <span className={`${s.gXLabel} ${s.gXLabelL}`}>{firstDate ? fmtDayShort(firstDate) : 'oldest'}</span>
        <span className={`${s.gXLabel} ${s.gXLabelR}`}>{lastDate ? fmtDayShort(lastDate) : 'latest'}</span>
        <div ref={lineRef} className={s.gScrubLine} />
        <div ref={dotRef} className={s.gScrubDot} />
        <div ref={tagRef} className={s.gScrubTag} />
      </div>
      {onExpand && (
        <button type="button" className={s.graphExpand} onClick={onExpand} aria-label="Open this graph fullscreen">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
          </svg>
        </button>
      )}
    </div>
  )
}

/** Where a core-graph metric is logged - the lightbulb's quick-link when a goal
 *  is steered by a built-in core graph. */
const CORE_GROUP_HREF: Record<CoreGroup, string> = {
  train: '/app/fitness/log',
  fuel: '/app/fuel',
  body: '/app/fitness/progress',
  vitals: '/app/vitals',
}

function claudeHref(title: string): string {
  const q = `My Vitality goal: "${title}". Vee is steering it with my real data. Help me plan this week to move it.`
  return `https://claude.ai/new?q=${encodeURIComponent(q)}`
}

/** The lever line's why, with the guide's key phrase mint-underlined. */
function renderLeverWhy(why: string, key: string): ReactNode {
  const i = why.toLowerCase().indexOf(key.toLowerCase())
  if (i < 0) return why
  return (<>{why.slice(0, i)}<span className={s.sauce}>{why.slice(i, i + key.length)}</span>{why.slice(i + key.length)}</>)
}

/* ---------------------------------------------------------------- the section */

export interface VeeGoalsSectionProps {
  goals: BigGoal[]
  habits: HabitGoal[]
  rows: TickerRow[]
  guides: Record<string, GuideItem[]>
  lifeChips: LifeChip[]
  /** Real days-of-data count for the board head (omitted when 0). */
  daysLogged: number
  /** Which auto-track suggestions have real data behind them (loadNoticed).
   *  Absent/false = the suggestion row never renders (no evidence, no pitch). */
  suggestionEvidence?: Partial<Record<SuggestionMetric, boolean>>
  /** The user's own tile streams (RLS server read, from the page loader), for
   *  the "what steers this" binding picker. */
  tileStreams?: BindingStream[]
  /** Modules the user has real data in (loadNoticed.activeModules): lets the
   *  strongest-binding resolver prefer a metric they already feed. */
  activeModules?: GuideModule[]
  /** Design-harness mode (/vee-live-preview): every action stays local, no server writes. */
  readOnly?: boolean
}

export default function VeeGoalsSection({ goals: initialGoals, habits: initialHabits, rows, guides, lifeChips, daysLogged, suggestionEvidence, tileStreams = [], activeModules = [], readOnly = false }: VeeGoalsSectionProps) {
  const [bigGoals, setBigGoals] = useState<BigGoal[]>(initialGoals)
  const [habits, setHabits] = useState<HabitGoal[]>(initialHabits)
  const [filled, setFilled] = useState(false)
  const [added, setAdded] = useState<Record<number, boolean>>({})
  const [busyHabit, setBusyHabit] = useState<string | null>(null)
  const [suggestError, setSuggestError] = useState<string | null>(null)
  // "this week with vitality" lives behind a quiet disclosure (v1.2), closed by
  // default: cozy progressive disclosure is the house rule.
  const [weekOpen, setWeekOpen] = useState(false)

  const [openId, setOpenId] = useState<string | null>(null)
  const [justSetId, setJustSetId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftTf, setDraftTf] = useState<TfKey>('3m')
  const [customDate, setCustomDate] = useState('')
  const [draftPrio, setDraftPrio] = useState<Prio>(2)
  const [draftPush, setDraftPush] = useState<Push>('balanced')
  const [editPushId, setEditPushId] = useState<string | null>(null)
  // THE GRAPH LIBRARY (2026-07-12): which goal's picker modal is open, plus
  // the ONE shared core-catalog fetch (lazy: first open, or a core:-bound
  // goal needing its line on mount). Same /api/core-graphs read the Core
  // Room uses, so the picker and the room can never disagree.
  const [libGoalId, setLibGoalId] = useState<string | null>(null)
  const [coreGraphs, setCoreGraphs] = useState<CoreGraph[] | null>(null)
  const [coreFailed, setCoreFailed] = useState(false)
  const coreFetching = useRef(false)
  // The one graph, expanded (TRAIN 5 fullscreen, wired live). Holds the exact
  // row + tone + word the panel already computed, so the fullscreen draws the
  // same real series - never a second data path to drift.
  const [fsRow, setFsRow] = useState<{ row: TickerRow; tone: Tone; word: string } | null>(null)

  const sheetRef = useRef<HTMLFormElement | null>(null)
  const titleRef = useRef<HTMLInputElement | null>(null)
  const newGoalRef = useRef<HTMLDivElement | null>(null)
  // per-goal push-change sequence: only the LATEST in-flight change may apply its result
  const pushSeq = useRef<Record<string, number>>({})
  // per-goal binding-change sequence, same race rule as pushSeq
  const bindSeq = useRef<Record<string, number>>({})
  // Last SERVER-CONFIRMED value per goal, so a failed write reverts to what the
  // server actually holds, never to an earlier tap's optimistic value (tap A
  // then B fast with both writes failing used to leave A on screen).
  const pushConfirmed = useRef<Record<string, Push>>({})
  const bindConfirmed = useRef<Record<string, string | null>>({})

  // animate progress bars in once
  useEffect(() => { const t = setTimeout(() => setFilled(true), 450); return () => clearTimeout(t) }, [])

  // backfill: triage any pre-existing goals that never got a category. Capped at
  // 3 per mount so a wedged categorize API can never stack an unbounded pile of
  // paid Anthropic calls from one page open; nothing is stranded, because each
  // success persists its category and the NEXT mount picks up the remainder.
  useEffect(() => {
    if (readOnly) return
    initialGoals.filter(g => !g.category).slice(0, 3).forEach(g => { void runCategorize(g.id) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // when the create sheet opens, bring it into view; focus after the scroll
  useEffect(() => {
    if (!creating) return
    const a = setTimeout(() => sheetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
    const b = setTimeout(() => titleRef.current?.focus(), 400)
    return () => { clearTimeout(a); clearTimeout(b) }
  }, [creating])

  const tf = TIMEFRAMES.find(t => t.key === draftTf)
  const isCustom = draftTf === 'custom'
  const days = isCustom ? (customDate ? daysFromToday(customDate) : 0) : (tf?.days ?? 91)
  const targetObj = isCustom ? (customDate ? new Date(`${customDate}T00:00:00`) : null) : addDays(days)
  const targetLabel = targetObj ? fmtDate(targetObj) : ''
  const durPct = Math.min(100, (days / 365) * 100)
  const canSet = !!draftTitle.trim() && (!isCustom || !!customDate)

  function resetDraft() { setDraftTitle(''); setDraftTf('3m'); setCustomDate(''); setDraftPrio(2); setDraftPush('balanced'); setSaveError(null) }

  async function createGoal() {
    if (!canSet || saving) return
    // The gibberish guard, client-side first (the server gate stays authoritative):
    // keyboard mash gets the warm line instantly, no round trip, nothing saved.
    if (isGibberish(draftTitle.trim())) {
      setSaveError('Help me out, say it plainly and I can steer it.')
      return
    }
    setSaving(true); setSaveError(null)
    const targetDate = isCustom ? (customDate || null) : getLocalDateKey(addDays(days))
    if (readOnly) {
      // preview harness: the goal lives in local state only, nothing is written
      const now = new Date().toISOString()
      const local: BigGoal = {
        id: `preview-${Date.now()}`, title: draftTitle.trim(), cleanTitle: null, category: null,
        targetDate, priority: draftPrio, push: draftPush,
        progressCurrent: null, progressTarget: null, progressUnit: null, identityTag: null,
        status: 'active', createdAt: now, updatedAt: now, achievedAt: null,
      }
      setSaving(false)
      setBigGoals(g => [local, ...g])
      setJustSetId(local.id)
      setCreating(false); resetDraft()
      setTimeout(() => newGoalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
      setTimeout(() => setJustSetId(null), 950)
      return
    }
    const res = await createBigGoal({ title: draftTitle.trim(), targetDate, priority: draftPrio, push: draftPush })
    setSaving(false)
    if (!res.ok) { setSaveError(friendlyError(res.error)); return }
    setBigGoals(g => [res.goal, ...g])
    void runCategorize(res.goal.id)
    setJustSetId(res.goal.id)
    setCreating(false); resetDraft()
    setTimeout(() => newGoalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
    setTimeout(() => setJustSetId(null), 950)
  }

  async function toggleHabit(h: HabitGoal) {
    if (busyHabit === h.id) return
    const done = h.status !== 'completed'
    if (readOnly) {
      setHabits(list => list.map(x => (x.id === h.id ? { ...x, status: done ? 'completed' : 'open' } : x)))
      return
    }
    setBusyHabit(h.id)
    setHabits(list => list.map(x => (x.id === h.id ? { ...x, status: done ? 'completed' : 'open' } : x)))
    const res = await setHabitGoalDone(h.id, done)
    setBusyHabit(null)
    if (!res.ok) {
      setHabits(list => list.map(x => (x.id === h.id ? { ...x, status: done ? 'open' : 'completed' } : x)))
    } else {
      setHabits(list => list.map(x => (x.id === h.id ? res.habit : x)))
    }
  }

  async function addSuggestion(i: number, sug: Suggestion) {
    if (added[i]) return
    setSuggestError(null)
    setAdded(a => ({ ...a, [i]: true }))
    if (readOnly) {
      const now = new Date().toISOString()
      const local: HabitGoal = {
        id: `preview-h-${Date.now()}`, parentGoalId: null, title: sug.title, kind: 'habit',
        dueDate: null, difficulty: null, estimatedMinutes: null, suggestedStartHour: null,
        whenCue: null, source: sug.source, tracking: sug.tracking,
        status: 'open', isTomorrow: false, pushCount: 0, lastPushedAt: null,
        createdAt: now, completedAt: null,
      }
      setHabits(list => [local, ...list])
      return
    }
    const res = await addHabitGoal({ title: sug.title, kind: 'habit', source: sug.source, tracking: sug.tracking })
    // Never fail silently: the row would just reappear with zero explanation.
    if (!res.ok) { setAdded(a => ({ ...a, [i]: false })); setSuggestError(friendlyError(res.error)); return }
    setHabits(list => [res.habit, ...list])
  }

  async function removeBigGoal(id: string) {
    // Surgical revert: keep ONLY the removed goal aside, so a slow failed delete
    // can never wipe a goal (or a push change) saved while it was in flight.
    const removed = bigGoals.find(x => x.id === id)
    const removedAt = bigGoals.findIndex(x => x.id === id)
    setBigGoals(g => g.filter(x => x.id !== id))
    if (readOnly || !removed) return
    const res = await deleteBigGoal(id)
    if (!res.ok) {
      setBigGoals(cur => {
        if (cur.some(x => x.id === removed.id)) return cur
        const next = [...cur]
        next.splice(Math.min(Math.max(removedAt, 0), next.length), 0, removed)
        return next
      })
    }
  }

  // Change how much Vee shows up about a goal. Optimistic; revert if the write
  // fails. Sequenced per goal so a slow older response can never overwrite a
  // newer choice (tap Pushes then Silent = two racing fetches).
  async function changePush(g: BigGoal, push: Push) {
    setEditPushId(null)
    if (g.push === push) return
    // Seed the confirmed value on the FIRST change: at that point the rendered
    // value still is the server's. Later taps must never re-seed from a render
    // that may already be optimistic.
    if (!(g.id in pushConfirmed.current)) pushConfirmed.current[g.id] = g.push
    setBigGoals(list => list.map(x => (x.id === g.id ? { ...x, push } : x)))
    if (readOnly) return
    const seq = (pushSeq.current[g.id] ?? 0) + 1
    pushSeq.current[g.id] = seq
    const res = await updateBigGoalPush(g.id, push)
    if (pushSeq.current[g.id] !== seq) return
    if (!res.ok) setBigGoals(list => list.map(x => (x.id === g.id ? { ...x, push: pushConfirmed.current[g.id] ?? g.push } : x)))
    else {
      pushConfirmed.current[res.goal.id] = res.goal.push
      setBigGoals(list => list.map(x => (x.id === res.goal.id ? res.goal : x)))
    }
  }

  const ensureCoreGraphs = useCallback(() => {
    if (coreGraphs !== null || coreFetching.current) return
    coreFetching.current = true
    fetch('/api/core-graphs')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((b: { graphs: CoreGraph[] }) => setCoreGraphs(Array.isArray(b.graphs) ? b.graphs : []))
      .catch(() => setCoreFailed(true))
  }, [coreGraphs])

  // A goal already steered by a core graph needs the catalog to draw its line.
  useEffect(() => {
    if (bigGoals.some(gl => (gl.bindingOverride ?? '').startsWith('core:'))) ensureCoreGraphs()
  }, [bigGoals, ensureCoreGraphs])

  function openLibrary(goalId: string) {
    ensureCoreGraphs()
    setEditPushId(null)
    setLibGoalId(cur => (cur === goalId ? null : goalId))
  }

  // "What steers this": persist the user's pick (or null = let Vee decide).
  // Optimistic; revert on failure; sequenced per goal like changePush.
  async function changeBinding(g: BigGoal, binding: string | null) {
    setLibGoalId(null)
    if ((g.bindingOverride ?? null) === binding) return
    // Seed the server-confirmed value on the first change (see changePush).
    if (!(g.id in bindConfirmed.current)) bindConfirmed.current[g.id] = g.bindingOverride ?? null
    setBigGoals(list => list.map(x => (x.id === g.id ? { ...x, bindingOverride: binding } : x)))
    if (readOnly) return
    const seq = (bindSeq.current[g.id] ?? 0) + 1
    bindSeq.current[g.id] = seq
    const res = await setGoalBinding(g.id, binding)
    if (bindSeq.current[g.id] !== seq) return
    if (!res.ok) setBigGoals(list => list.map(x => (x.id === g.id ? { ...x, bindingOverride: bindConfirmed.current[g.id] ?? null } : x)))
    else {
      bindConfirmed.current[res.goal.id] = res.goal.bindingOverride ?? null
      setBigGoals(list => list.map(x => (x.id === res.goal.id ? res.goal : x)))
    }
  }

  // Triage a goal in the background (tag + clean title, keyless fallback built in).
  async function runCategorize(id: string) {
    const r = await categorizeAndCleanGoal(id)
    if (!r.ok) return
    setBigGoals(list => list.map(x => (x.id === r.goal.id ? r.goal : x)))
  }

  const PrioPips = ({ p, big }: { p: Prio; big?: boolean }) => (
    <span className={gs.prioPips} aria-label={`priority ${PRIO_LBL[p - 1]}`}>
      {[1, 2, 3].map(i => <span key={i} className={`${gs.prioPip} ${i <= p ? gs.prioPipOn : ''}`} style={{ height: `${(big ? 7 : 5) + i * 4}px` }} />)}
    </span>
  )

  const habitTitles = new Set(habits.map(h => h.title.toLowerCase()))
  const openSuggestions = SUGGESTIONS.map((sug, i) => ({ sug, i }))
    .filter(({ sug }) => suggestionEvidence?.[sug.metric] === true)
    .filter(({ sug, i }) => !added[i] && !habitTitles.has(sug.title.toLowerCase()))

  /* wears the goals-board row language (gTitle/gSub scale, quiet chrome) so the
     suggestions read as part of the board, not a louder second design */
  const SuggestionRow = ({ sug, i }: { sug: Suggestion; i: number }) => (
    <div className={s.suggest}>
      <span className={s.sGlyph}><svg width="18" height="18" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round">{GLYPH[sug.metric] ?? GLYPH.default}</svg></span>
      <div className={s.sBody}><div className={s.sName}>{sug.title}</div><div className={s.sWhy}>{sug.sub}</div></div>
      <button className={s.addBtn} disabled={!!added[i]} onClick={() => addSuggestion(i, sug)}>
        {added[i] ? <><CheckIcon size={11} />Added</> : <><svg width="11" height="11" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M0 -8 V8 M-8 0 H8" /></svg>Add</>}
      </button>
    </div>
  )

  const rowById = new Map(rows.map(r => [r.id, r]))

  const CreateBlock = (
    creating ? (
      <form ref={sheetRef} className={gs.createSheet} onSubmit={e => { e.preventDefault(); createGoal() }}>
        <div className={gs.field}>
          <span className={gs.fieldLabel}>Your goal</span>
          <input ref={titleRef} className={gs.titleInput} enterKeyHint="done" maxLength={200} placeholder="Run a half marathon. Save 5k. Read 12 books." value={draftTitle} onChange={e => setDraftTitle(e.target.value)} />
        </div>
        <div className={gs.field}>
          <span className={gs.fieldLabel}>Deadline</span>
          <div className={gs.durRow}>
            {TIMEFRAMES.map(t => (
              <button type="button" key={t.key} className={`${gs.durChip} ${draftTf === t.key ? gs.durChipOn : ''}`} onClick={() => setDraftTf(t.key)}>{t.num} {t.unit}</button>
            ))}
            <button type="button" className={`${gs.durChip} ${isCustom ? gs.durChipOn : ''}`} onClick={() => setDraftTf('custom')}>Pick a date</button>
          </div>
          {isCustom && (
            <input type="date" className={gs.dateInput} min={getLocalDateKey()} value={customDate} onChange={e => setCustomDate(e.target.value)} />
          )}
          {days > 0 && (
            <div className={gs.horizon}>
              <div className={gs.horizonTrack}>
                <div className={gs.horizonFill} style={{ width: `${durPct}%` }} />
                <span className={gs.horizonMarker} style={{ left: `${durPct}%` }} />
              </div>
              <div className={gs.horizonLabels}>
                <span className={gs.horizonToday}>Today</span>
                <span className={gs.horizonTarget}>
                  <svg width="11" height="11" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M-7 9 V-9 L8 -5 L-7 -1" /></svg>
                  <b>{targetLabel}</b> · {friendlyDistance(days)}
                </span>
              </div>
            </div>
          )}
        </div>
        <div className={gs.field}>
          <span className={gs.fieldLabel}>Priority</span>
          <div className={gs.prioRow}>
            {([1, 2, 3] as Prio[]).map(p => (
              <button type="button" key={p} className={`${gs.prioOpt} ${draftPrio === p ? gs.prioOptOn : ''}`} onClick={() => setDraftPrio(p)}>
                <PrioPips p={p} big />
                <span className={gs.prioOptLbl}>{PRIO_LBL[p - 1]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className={gs.field}>
          <span className={gs.fieldLabel}>How much should Vee push you?</span>
          <div className={gs.pushRow}>
            {PUSH_OPTS.map(o => (
              <button type="button" key={o.key} className={`${gs.pushOpt} ${draftPush === o.key ? gs.pushOptOn : ''}`} onClick={() => setDraftPush(o.key)}>
                <span className={gs.pushDot} />
                <span className={gs.pushTexts}><span className={gs.pushTitle}>{o.title}</span><span className={gs.pushDesc}>{o.desc}</span></span>
              </button>
            ))}
          </div>
          <p className={gs.pushHelper}>You can change how much I show up anytime. Nothing here is locked in.</p>
        </div>
        {saveError && (
          <p className={gs.saveError}>
            <svg width="13" height="13" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="0" cy="0" r="9" /><path d="M0 -4 V1 M0 5 v.01" /></svg>
            {saveError}
          </p>
        )}
        <div className={gs.sheetActions}>
          <button type="submit" className={gs.setBtn} disabled={!canSet || saving}>{saving ? 'Saving…' : 'Set this goal'}</button>
          <button type="button" className={gs.cancelBtn} onClick={() => { setCreating(false); resetDraft() }}>cancel</button>
        </div>
      </form>
    ) : (
      <button className={gs.createBtn} onClick={() => setCreating(true)}>
        <svg width="18" height="18" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M0 -8 V8 M-8 0 H8" /></svg>
        Add a goal
      </button>
    )
  )

  return (
    <div className={`${s.scope} ${ts.noticed}`}>
      {fsRow && <GraphFullscreen row={fsRow.row} tone={fsRow.tone} word={fsRow.word} onClose={() => setFsRow(null)} />}
      {(bigGoals.length > 0 || lifeChips.length > 0) && (
        <div className={`${ts.board} ${s.boardGlass}`}>
          <div className={ts.boardHead}>
            {BOARD_ICON}
            your goals, live{daysLogged > 0 && <> · <b>{daysLogged} {daysLogged === 1 ? 'day' : 'days'}</b> of data</>}{bigGoals.length > 0 && <> · tap one</>}
          </div>

          {bigGoals.map((g, i) => {
            const row = rowById.get(g.id)
            const hasSeries = !!row && row.state !== 'unknown' && row.spark.length >= 2
            const { tone, word } = hasSeries ? stateMeta(row!.state) : { tone: 'flat' as Tone, word: 'no data yet' }
            const toneClass = tone === 'up' ? ts.up : tone === 'dn' ? ts.dn : ts.flat
            const open = openId === g.id
            const tlabel = g.targetDate ? fmtDate(new Date(`${g.targetDate}T00:00:00`)) : null
            const dleft = g.targetDate ? daysFromToday(g.targetDate) : null
            const hpct = g.targetDate ? horizonPct(g.createdAt, g.targetDate) : 0
            const hasBar = g.progressTarget != null && g.progressTarget > 0
            // ONE VOICE, final leak (Alex, 2026-07-12): a user override
            // silences any lever speaking for a different metric - a
            // WATER-steered goal must never carry the notes lightbulb. When
            // the guide has an item for the overridden module we use THAT;
            // otherwise the card simply has no tip (honest beats borrowed).
            const goalGuides = guides[g.id] ?? []
            const ovModule = g.bindingOverride ?? null
            const lever = ovModule
              ? goalGuides.find(i => i.module === ovModule)
              : goalGuides[0]
            const factors = hasSeries ? factorLines(row!) : []
            const title = g.cleanTitle ?? g.title
            // No ticker series, but the lever's brain read real data (a grounded,
            // non-canned why): show THAT as the panel paragraph instead of a
            // feed-me ask for data we are clearly already reading. The lever text
            // block is hidden then (it would repeat verbatim); its action stays.
            // Brand is retired as a goal source (Alex, 2026-07-12): never let a
            // brand lever's grounded read surface. Audience goals fall to the
            // honest feed-me line + the picker (a tile you built), never brand.
            const grounded = !hasSeries && lever && lever.module !== 'brand' ? guideGroundedWhy(guides[g.id], lever.module) : null
            // "What steers this" + the always-visible graph slot: resolved only
            // for the open panel (pure but regex-heavy; no need on closed rows).
            const bind = open ? resolveBinding(g, row, tileStreams, activeModules, coreGraphs) : null
            // A Graph Library pick draws EVERYWHERE (collapsed sparkline +
            // open panel) from the same core series, with tone from the
            // graph's own healthy direction - the module ticker knows
            // nothing about this line and never speaks for it.
            const coreG = coreGraphs && (g.bindingOverride ?? '').startsWith('core:')
              ? coreGraphs.find(cg => `core:${cg.id}` === g.bindingOverride)
              : undefined
            const corePts = coreG && coreG.points.length >= 2 ? coreG.points : null
            const coreTone: Tone = corePts ? toneForCore(corePts, coreG!.dir) : tone
            // THE ONE QUICK-LINK (Alex, 2026-07-12): the lightbulb points wherever
            // this goal is steered from - a tile you built, a core graph's own
            // module, or a module lever - never hardcoded. Nothing wired yet ->
            // the same button opens the graph picker (the ONLY door to it now,
            // the duplicate "Choose the graph" button is retired). One choice
            // drives the graph AND this link.
            const boundOv = g.bindingOverride ?? null
            const usableLever = lever && lever.module !== 'notes' && lever.module !== 'brand'
            const quick: { label: string; href: string } | { label: string; pick: true } =
              boundOv?.startsWith('stream:')
                ? { label: `open ${bind?.chip ?? 'your tile'}`, href: '/app' }
                : coreG
                  ? { label: `log ${bind?.chip ?? coreG.label.toLowerCase()}`, href: CORE_GROUP_HREF[coreG.group] }
                  : usableLever
                    ? { label: lever!.label, href: lever!.href }
                    : { label: 'pick what steers this', pick: true }
            const quickTip: ReactNode | null =
              usableLever && !grounded
                ? renderLeverWhy(lever!.why, lever!.key)
                : boundOv?.startsWith('stream:')
                  ? <>logging to your <span className={s.sauce}>{bind?.chip ?? 'tile'}</span> keeps this line moving.</>
                  : null
            return (
              <div ref={i === 0 ? newGoalRef : null} className={`${ts.gwrap} ${g.id === justSetId ? s.justSet : ''}`} key={g.id}>
                <button
                  type="button"
                  className={`${ts.grow} ${open ? ts.growOpen : ''}`}
                  aria-expanded={open}
                  onClick={() => setOpenId(cur => (cur === g.id ? null : g.id))}
                >
                  <span className={s.gn}>
                    <span className={s.gTitle}>{title}</span>
                    <span className={s.gSub}>
                      {g.category ? CATEGORY_WORD[g.category] : 'goal'}
                      {tlabel ? ` · by ${tlabel}` : ''}
                    </span>
                  </span>
                  <Spark
                    row={hasSeries ? row : undefined}
                    spark={corePts ? corePts.map(pt => pt.value) : undefined}
                    tone={corePts ? coreTone : tone}
                  />
                  <span className={ts.chg}>
                    {corePts ? (
                      <span className={`${ts.v} ${coreTone === 'up' ? ts.up : coreTone === 'dn' ? ts.dn : ts.flat}`}>
                        {coreTone === 'up' ? UP : coreTone === 'dn' ? DN : null}
                        {corePts[corePts.length - 1].value.toLocaleString('en-US')} {coreG!.unit}
                      </span>
                    ) : hasSeries && row!.detail ? (
                      <span className={`${ts.v} ${toneClass}`}>
                        {tone === 'up' ? UP : tone === 'dn' ? DN : null}
                        {row!.detail}
                      </span>
                    ) : (
                      <span className={ts.gHint}>log it</span>
                    )}
                    <span className={s.gState}>{corePts ? 'live' : word}</span>
                  </span>
                  {CHEV}
                </button>

                <div className={`${ts.gDrop} ${open ? ts.gDropOpen : ''}`}>
                  <div className={ts.gDin}>
                    <div className={ts.gdCard}>
                      <div className={s.whyLbl}>{corePts ? 'drawn live from' : hasSeries ? `why it is ${word}` : grounded ? 'what I can read' : 'feed me'}</div>
                      <p className={s.whyRead}>
                        {corePts
                          ? `your ${coreG!.label.toLowerCase()} line, ${corePts.length} points and counting. last: ${corePts[corePts.length - 1].value.toLocaleString('en-US')} ${coreG!.unit}.`
                          : hasSeries
                          ? honestRead(row!, guides)
                          : grounded
                            ? renderLeverWhy(grounded, lever!.key)
                            : /* ONE source of truth: the resolved binding's own
                                 ask, so this paragraph, the steered-by chip, and
                                 the empty-graph line can never disagree (the
                                 "log a weigh-in" over a meals chip bug). The
                                 category line is only the closed-row fallback. */
                              (bind?.feedLine ?? feedMeLine(g.category, title, lever?.module))}
                      </p>

                      {/* The graph slot is ALWAYS here: real series when one
                          exists, else the empty axis carrying the one ask that
                          would fill it. A promise with a location. */}
                      {bind && (
                        <PanelGraph
                          row={hasSeries ? row : undefined}
                          tone={corePts ? coreTone : tone}
                          ask={bind.feedLine}
                          series={corePts ? corePts.map(pt => pt.value) : undefined}
                          points={corePts ?? undefined}
                          unit={coreG?.unit}
                          onExpand={!corePts && hasSeries && row ? () => setFsRow({ row, tone, word }) : undefined}
                        />
                      )}

                      {factors.length > 0 && (
                        <div className={s.facts}>
                          {factors.map((f, k) => (
                            <div key={k} className={`${s.fac} ${f.tone === 'up' ? s.facUp : f.tone === 'dn' ? s.facDn : s.facFlat}`}>
                              {f.tone === 'up' ? UP : f.tone === 'dn' ? DN : FLAT}
                              <span>{f.text}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {quickTip && (
                        <div className={s.lever}>
                          <span className={s.leverBulb}>{BULB}</span>
                          <div>{quickTip}</div>
                        </div>
                      )}

                      <div className={ts.gdActs}>
                        <a className={ts.clB} href={claudeHref(title)} target="_blank" rel="noreferrer">
                          {SPARKLE}
                          talk deeper in Claude
                        </a>
                        {/* ONE quick-link: it goes wherever this goal is steered
                            from (a tile, a core graph's module, a module lever) -
                            or, unwired, it opens the graph picker. No duplicate
                            "Choose the graph" door. */}
                        {'pick' in quick ? (
                          <button
                            type="button"
                            className={s.leverBtn}
                            aria-haspopup="dialog"
                            aria-expanded={libGoalId === g.id}
                            onClick={() => openLibrary(g.id)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></svg>
                            {quick.label}
                          </button>
                        ) : (
                          <a className={s.leverBtn} href={quick.href}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                            {quick.label}
                          </a>
                        )}
                      </div>

                      {hasBar && (
                        <div className={gs.bigGoalProg}>
                          <div className={gs.progHead}>
                            <span className={gs.progNum}>{g.progressCurrent ?? 0}<small>of {g.progressTarget} {g.progressUnit ?? ''}</small></span>
                            <span className={gs.metaChip}>{Math.round(((g.progressCurrent ?? 0) / g.progressTarget!) * 100)}%</span>
                          </div>
                          <div className={gs.progTrack}><div className={gs.progFill} style={{ width: filled ? `${Math.min(100, ((g.progressCurrent ?? 0) / g.progressTarget!) * 100)}%` : '0' }} /></div>
                        </div>
                      )}
                      {g.targetDate && (
                        <div className={gs.horizon}>
                          <div className={gs.horizonTrack}>
                            <div className={gs.horizonFill} style={{ width: filled ? `${hpct}%` : '0' }} />
                            <span className={gs.horizonMarker} style={{ left: filled ? `${hpct}%` : '0' }} />
                          </div>
                          <div className={gs.horizonLabels}>
                            <span className={gs.horizonToday}>Today</span>
                            {/* days-left comes from the viewer's LOCAL clock; the server (UTC)
                                can be a calendar day ahead, so let the client's number stand */}
                            <span className={gs.horizonTarget} suppressHydrationWarning>
                              <svg width="11" height="11" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M-7 9 V-9 L8 -5 L-7 -1" /></svg>
                              <b>{tlabel}</b>{dleft != null ? ` · ${dleft} days left` : ''}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className={gs.bigGoalMeta}>
                        <PrioPips p={g.priority} />
                        <button
                          type="button"
                          className={`${gs.metaChip} ${gs.pushChipBtn} ${s.bindChip}`}
                          onClick={() => openLibrary(g.id)}
                          aria-haspopup="dialog"
                          aria-expanded={libGoalId === g.id}
                          aria-label={`change what steers ${title}`}
                        >steered by: <b>{bind?.chip}</b></button>
                        <button
                          type="button"
                          className={`${gs.metaChip} ${gs.pushChipBtn} ${g.push === 'silent' ? gs.pushChipSilent : gs.pushChip}`}
                          onClick={() => { setLibGoalId(null); setEditPushId(cur => (cur === g.id ? null : g.id)) }}
                          aria-expanded={editPushId === g.id}
                          aria-controls={`push-edit-${g.id}`}
                          aria-label={`change how much Vee shows up about ${title}`}
                        ><VMark size={11} />{PUSH_CHIP[g.push]}</button>
                        <button className={gs.miniDelete} onClick={() => removeBigGoal(g.id)} aria-label={`remove ${title}`}>remove</button>
                      </div>
                      {editPushId === g.id && (
                        <div className={gs.pushEdit} id={`push-edit-${g.id}`} role="group" aria-label="How much should Vee show up">
                          {PUSH_OPTS.map(o => (
                            <button
                              type="button"
                              key={o.key}
                              className={`${gs.pushEditOpt} ${g.push === o.key ? gs.pushEditOptOn : ''}`}
                              aria-pressed={g.push === o.key}
                              onClick={() => changePush(g, o.key)}
                            ><PushBars level={PUSH_LEVEL[o.key]} />{PUSH_SHORT[o.key]}</button>
                          ))}
                          {/* the level's REAL meaning: wired to the drift cadence, never a vibe */}
                          <p className={s.pushMeaning}><VMark size={10} />{PUSH_MEANING[g.push]}</p>
                        </div>
                      )}
{/* The inline chip strip is retired (2026-07-12): "what steers
                          this" is THE GRAPH LIBRARY modal now - Vee's module
                          picks + every core graph, opened from the steered-by
                          chip or the Choose-the-graph button. */}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {(() => {
            const libGoal = libGoalId ? bigGoals.find(gl => gl.id === libGoalId) : undefined
            if (!libGoal) return null
            return (
              <GraphLibrary
                goalTitle={libGoal.cleanTitle ?? libGoal.title}
                currentBinding={libGoal.bindingOverride ?? null}
                quickPicks={coreBindingOptions(libGoal.category).map(m => ({ key: m, word: bindingMetricWord(m) }))}
                graphs={coreGraphs}
                failed={coreFailed}
                onPick={b => void changeBinding(libGoal, b)}
                onClose={() => setLibGoalId(null)}
              />
            )
          })()}

          {lifeChips.length > 0 && (
            <div className={s.lifeStrip}>
              {lifeChips.map(c => (
                <div key={c.label} className={`${s.lifeChip} ${c.tone === 'mint' ? s.lifeChipMint : c.tone === 'amber' ? s.lifeChipAmber : ''}`}>
                  <span className={s.lifeLabel}>{c.label}</span>
                  <span className={s.lifeValue}>{c.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {CreateBlock}

      {/* "this week with vitality": the habit rows fold behind one quiet mono
          disclosure next to Add a goal. Hidden entirely when there is nothing
          real to show (no habits, no evidence-backed suggestions). */}
      {(habits.length > 0 || openSuggestions.length > 0) && (
        <>
          <button
            type="button"
            className={`${s.weekDisclose} ${weekOpen ? s.weekOpen : ''}`}
            onClick={() => setWeekOpen(v => !v)}
            aria-expanded={weekOpen}
          >
            <svg className={s.weekSpark} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M11.6 2.4l1.7 5.4 5.4 1.7-5.4 1.7-1.7 5.4-1.7-5.4-5.4-1.7 5.4-1.7z" /></svg>
            this week with vitality · {habits.length + openSuggestions.length}
            <svg className={s.weekChev} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
          </button>

          {weekOpen && (
            <div className={s.weekDrop}>
              <p className={s.subIntro}>I track what I can see. You tap the rest.</p>
              <div className={gs.habits}>
                {habits.map(h => {
          const done = h.status === 'completed'
          const auto = h.tracking != null
          const glyphKey = h.tracking?.metric ?? 'default'
          return (
            <div className={`${gs.habit} ${done ? gs.habitDone : ''}`} key={h.id}>
              <span className={gs.hGlyph}><svg width="20" height="20" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{GLYPH[glyphKey] ?? GLYPH.default}</svg></span>
              <div className={gs.hBody}>
                <span className={gs.hName}>{h.title}</span>
                <span className={gs.hMeta}>
                  {auto
                    ? <><b>{describeTracking(h.tracking!)}</b> · {sourceLabel(h.source)}</>
                    : (done ? <><b>done today</b> · nice</> : 'tap when you have done it')}
                </span>
              </div>
              <span className={gs.hState}>
                {auto ? (
                  <span className={gs.autoPill}><CheckIcon size={11} />auto</span>
                ) : (
                  <button className={`${gs.tapDot} ${done ? gs.tapDotChecked : ''}`} aria-label={`mark ${h.title} done`} disabled={busyHabit === h.id} onClick={() => toggleHabit(h)}>
                    <span className={gs.tapRing}><CheckIcon size={12} /></span>
                  </button>
                )}
              </span>
            </div>
          )
                })}
                {openSuggestions.map(({ sug, i }) => <SuggestionRow key={sug.title} sug={sug} i={i} />)}
              </div>
              {suggestError && (
                <p className={gs.saveError}>
                  <svg width="13" height="13" viewBox="-12 -12 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="0" cy="0" r="9" /><path d="M0 -4 V1 M0 5 v.01" /></svg>
                  {suggestError}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
