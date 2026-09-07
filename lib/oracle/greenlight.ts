/**
 * The convergence brain behind "Vitality noticed".
 *
 * Pure, no I/O, no clock beyond what the caller passes — the same pure-core
 * shape as lib/goals/drift.ts and mcp/src/insights.ts. The gather
 * (greenlightData.ts) runs the detectors and shapes the per-domain concerns;
 * this decides whether they amount to a green light, and assembles the one
 * Convergence the surface renders.
 *
 * The rule that makes it trustworthy instead of naggy: the light only turns
 * green when at least two independent, already-gated domains are concerned AND
 * the convergence is anchored to one of the user's active, non-silent goals. A
 * lone signal stays dark (that is drift's job, at most). A pile of signals with
 * no goal at stake stays dark. The advice is powerful because it is FOR THEM.
 */

export type Domain =
  | 'train' | 'fuel' | 'recovery' | 'mood' | 'weight' | 'goal' | 'finance' | 'business'

export type Push = 'gentle' | 'normal' | 'push' | 'silent'

/** A receipt: a real, dated number a detector already proved. Never prose. */
export interface Receipt {
  kind: string
  text: string
  dates?: string[]
}

/** One domain's concern, already past its own cry-wolf gate in the gather. */
export interface DomainConcern {
  domain: Domain
  receipt: Receipt
  /** Ids of the user's goals this concern bears on (may be empty). */
  goalRefs: string[]
  /** How far past its gate this concern cleared. Feeds confidence + receipt order. */
  margin: number
}

export interface ActiveGoal {
  id: string
  title: string
  push: Push
  /** Defaults to 'active' when omitted. */
  status?: string
}

export interface Convergence {
  /** Stable id for the dedupe ledger ("Vee already said this"). */
  patternKey: string
  /** Sum of cleared-gate margins — how strongly this fired. */
  confidence: number
  domainsHit: Domain[]
  goal: { id: string; title: string; push: Push }
  receipts: Receipt[]
  /** Capped by the goal's push level: a gentle goal never gets the blunt line. */
  suggestedTone: 'gentle' | 'direct'
}

interface Opts {
  minDomains?: number
  maxReceipts?: number
}

/**
 * Decide whether the provided per-domain concerns amount to a green light, and
 * if so assemble the single Convergence to surface. Returns null when the bar
 * isn't met (too few domains, or nothing tied to an active goal).
 */
export function greenLight(
  concerns: DomainConcern[],
  goals: ActiveGoal[],
  opts: Opts = {},
): Convergence | null {
  const minDomains = opts.minDomains ?? 2
  const maxReceipts = opts.maxReceipts ?? 3

  // Convergence gate: at least N distinct, already-gated domains concerned.
  const domains = [...new Set(concerns.map((c) => c.domain))]
  if (domains.length < minDomains) return null

  // Goal anchor: an active, non-silent goal referenced by at least one concern.
  const activeGoals = goals.filter((g) => (g.status ?? 'active') === 'active' && g.push !== 'silent')
  const activeIds = new Set(activeGoals.map((g) => g.id))

  let anchor: ActiveGoal | null = null
  let bestRefs = 0
  let bestMargin = -1
  for (const goal of activeGoals) {
    const refs = concerns.filter((c) => c.goalRefs.includes(goal.id))
    if (refs.length === 0) continue
    const marginSum = refs.reduce((s, c) => s + c.margin, 0)
    if (refs.length > bestRefs || (refs.length === bestRefs && marginSum > bestMargin)) {
      anchor = goal
      bestRefs = refs.length
      bestMargin = marginSum
    }
  }
  if (!anchor) return null

  // Guard: at least one concern must reference an ACTIVE goal (the anchor proves
  // this, but keep it explicit so a future caller can't slip a dead goal through).
  if (!concerns.some((c) => c.goalRefs.some((id) => activeIds.has(id)))) return null

  const domainsHit = [...domains].sort()
  const receipts = [...concerns]
    .sort((a, b) => b.margin - a.margin)
    .slice(0, maxReceipts)
    .map((c) => c.receipt)
  const confidence = Math.round(concerns.reduce((s, c) => s + c.margin, 0) * 100) / 100

  return {
    patternKey: domainsHit.join('+'),
    confidence,
    domainsHit,
    goal: { id: anchor.id, title: anchor.title, push: anchor.push },
    receipts,
    suggestedTone: anchor.push === 'push' ? 'direct' : 'gentle',
  }
}
