/**
 * The §01 "Vitality noticed" cycling feed: the unified, flippable list behind
 * "show me another".
 *
 * It blends the synthesis's sources into one honest, ranked list:
 *   1. the deep green-light oracle Convergence (the one true cross-domain thing)
 *   2. the drift nudge (a single domain quietly slipping)
 *   3. momentum (a goal that is on-track: a quiet win)
 *   4. the cold-start promise (so a brand-new user is never shown an empty card)
 *
 * Always returns at least one item. Deterministic; the deep phrasing is still
 * the "talk deeper in Claude" path. IO-free + unit-tested (see veeFeed.test.ts).
 */

import type { TickerRow } from './ticker'
import type { Rarity } from './rarity'

export interface FeedNotice {
  source: 'oracle' | 'fusion' | 'drift' | 'momentum' | 'first' | 'starter'
  /** What Vee watched to find this: the source tag on the card. */
  watched: string
  /** The warm hook (short: the full version opens in Claude). */
  lead: string
  /** The goal this touches (bolded in the lead + the impact pill). */
  goalTitle: string | null
  /** Which way it moves the goal, or null (cold-start). */
  impact: 'up' | 'dn' | null
  /** Real data chips (never invented). */
  receipts: string[]
  /** How deep/rare this find is (the "OG loot" grade). null on the cold-start
   *  starter, which is a promise to watch, not a found insight. */
  rarity?: Rarity | null
  /** The cooldown pattern key for a fusion seam (e.g. 'caffeine+recovery'), so the
   *  client can log this show to the noticed_ledger and rest it like a gift. Only
   *  set on fusion notices. */
  patternKey?: string
  /** A deterministic one-tap action: a REAL /app route + a fixed label (never
   *  AI-written). Set only when the notice maps cleanly to one shipped surface
   *  (today: the drift nudge's own module). The card shows the mint action
   *  button only when this exists. */
  action?: { label: string; href: string }
  /** The lever beat: an ENGINE-written phrase that appears VERBATIM in `lead`
   *  (the seam's own `key`, or a fixed line written right here). The card
   *  mint-underlines it. Never invented: no engine phrase, no underline. */
  lever?: string
  /** The drift engine's kind ('train' / 'fuel' / 'recovery' / 'stream:*'), set
   *  only on drift notices so the card can log the goal_nudges shown-cooldown
   *  (the Vee surface never rendered DriftCard, so without this a drift notice
   *  repeated on every load). */
  driftKind?: string
}

const WATCHED_BY_KIND: Record<string, string> = {
  train: 'training · 21d',
  fuel: 'fuel · 21d',
  recovery: 'recovery · 14d',
}

/** The data a momentum row was read from: keep the §01 "watched" label honest
 *  (a lift goal is read from your lifts, never your weigh-ins). */
const WATCHED_BY_METRIC: Record<string, string> = {
  training: 'training · 21d',
  lift: 'your lifts',
  weight: 'your weigh-ins',
}

/** Deterministic one-tap route per drift kind: a fixed label + a real, shipped
 *  /app surface. No mapping for a kind = no action button (never invented). */
const DRIFT_ACTION: Record<string, { label: string; href: string }> = {
  train: { label: 'log a session', href: '/app/fitness/log' },
  fuel: { label: 'log today in Fuel', href: '/app/fuel' },
  recovery: { label: 'check your recovery', href: '/app/peak' },
}

function driftReceipt(sub: string): string {
  const first = (sub.split(/[.!?]/)[0] ?? '').trim()
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : 'From your recent logs'
}

const MAX = 5

export function buildFeed(args: {
  convergence: { goal: { id: string; title: string }; domainsHit: string[]; receipts: { text: string }[] } | null
  drift: { kind: string; line: string; sub: string; goalId?: string } | null
  rows: TickerRow[]
  starter: { kind: string; headline: string; body: string; goalTitle: string | null; watching: string[] }
  hasAnyData: boolean
  /** goalId -> the grounded projection LEAD already shown in that goal's guide
   *  row (lowercased), when its brain fired. Upgrades the otherwise-generic
   *  momentum line. Undefined/absent -> the canned "you are moving on X" stays. */
  goalReads?: Record<string, string>
  /** The cross-domain fusion seam (caffeine x recovery, sleep x training, ...),
   *  already gated + chosen by the pure engine. A goal-agnostic "how did it know"
   *  notice carrying its own honest watched label + rarity; null when it stayed silent.
   *  `key` is the seam's own verbatim highlight phrase (the lever beat). */
  fusion?: { why: string; key?: string; receipts: string[]; watched?: string; rarity?: Rarity; patternKey?: string } | null
  /** The first-find (lib/insights/firstFind.ts): an honest observation about the
   *  user's very first logged data. Only enters the feed when NOTHING else fired
   *  (step 3.5), so it can never outrank a real find. COMMON by construction. */
  first?: {
    domain: string
    lead: string
    watched: string
    receipts: string[]
    lever?: string
    action?: { label: string; href: string }
  } | null
}): FeedNotice[] {
  const { convergence, drift, rows, starter, goalReads, fusion, first } = args
  const out: FeedNotice[] = []

  // 1) The deep oracle convergence: the lead, when it fired. Goal-anchored + (often)
  //    multi-domain, so it grades above the single-link seams below it.
  if (convergence) {
    const g = convergence.goal.title
    const lead = convergence.domainsHit.length > 1
      ? `you set ${g}, and a few things are quietly pulling on it at once.`
      : `you set ${g}, and here is the one thing quietly working against it.`
    out.push({
      source: 'oracle',
      watched: convergence.domainsHit.join(' + ') || 'your goals',
      lead,
      goalTitle: g,
      impact: 'dn',
      receipts: convergence.receipts.map((r) => r.text),
      rarity: convergence.domainsHit.length >= 2 ? 'epic' : 'rare',
    })
  }

  // 1.5) The cross-domain fusion seam: a goal-agnostic "how did it know" link.
  //      Sits just under the deep oracle (which is goal-specific) and above drift.
  if (fusion) {
    out.push({
      source: 'fusion',
      watched: fusion.watched ?? 'sleep + training',
      lead: fusion.why.charAt(0).toLowerCase() + fusion.why.slice(1),
      goalTitle: null,
      impact: 'up',
      receipts: fusion.receipts,
      rarity: fusion.rarity ?? 'uncommon',
      patternKey: fusion.patternKey,
      lever: fusion.key,
    })
  }

  // 2) The drift nudge: a single domain slipping (a small true nudge = common).
  if (drift) {
    const touched = rows.find((r) => r.id === drift.goalId)
    out.push({
      source: 'drift',
      watched: WATCHED_BY_KIND[drift.kind] ?? 'your recent logs',
      lead: drift.line,
      goalTitle: touched ? touched.title : null,
      impact: 'dn',
      receipts: [driftReceipt(drift.sub)],
      rarity: 'common',
      action: DRIFT_ACTION[drift.kind],
      driftKind: drift.kind,
    })
  }

  // 3) Momentum: quietly celebrate goals that are moving the right way (common).
  for (const r of rows.filter((r) => r.state === 'on-track')) {
    if (out.length >= MAX) break
    const read = goalReads?.[r.id]
    out.push({
      source: 'momentum',
      watched: WATCHED_BY_METRIC[r.metric ?? ''] ?? 'your goals',
      lead: read ?? `you are moving on ${r.title}, keep it going.`,
      goalTitle: r.title,
      impact: 'up',
      receipts: r.detail ? [r.detail] : [],
      rarity: 'common',
      // the canned line's own action beat; a grounded guide read has no fixed
      // phrase here, so it gets no underline (never invented).
      lever: read ? undefined : 'keep it going',
    })
  }

  // 3.5) The first-find: an honest observation about the user's very first
  //      logged data. Fires ONLY when nothing else did, so it can never outrank
  //      a real find; the 'first+<domain>' patternKey routes it through the
  //      noticed_ledger so it is a once-ever moment.
  if (out.length === 0 && first) {
    out.push({
      source: 'first',
      watched: first.watched,
      lead: first.lead,
      goalTitle: null,
      impact: 'up',
      receipts: first.receipts,
      rarity: 'common',
      patternKey: `first+${first.domain}`,
      lever: first.lever,
      action: first.action,
    })
  }

  if (out.length > 0) return out.slice(0, MAX)

  // 4) Cold-start: never an empty card.
  return [{
    source: 'starter',
    watched: 'your goals',
    lead: starter.kind === 'noGoal' ? `${starter.headline}. ${starter.body}` : starter.body,
    goalTitle: starter.goalTitle,
    impact: null,
    receipts: starter.watching,
  }]
}
